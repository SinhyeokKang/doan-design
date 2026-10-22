import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import { canvasViewUpdate, type OpenCanvas } from "./canvasView";

const open: OpenCanvas = { folder: "/repo", canvas: "design/a.html" };

function row(path: string, extra: Partial<CanvasRow> = {}): CanvasRow {
  return { path, open: 0, url: `http://127.0.0.1:1/t/tok/k/${path}`, width: 1200, ...extra };
}

function list(path: string, servedRev: number, canvases: CanvasRow[]): FolderEntry {
  return { path, kind: "list", servedRev, canvases };
}

const before = [list("/repo", 1, [row("design/a.html"), row("design/b.html")])];

describe("canvasViewUpdate", () => {
  test("reloads when the open folder's served revision changes", () => {
    const now = [list("/repo", 2, [row("design/a.html"), row("design/b.html")])];
    expect(canvasViewUpdate(before, now, open)).toEqual({ kind: "reload", canvas: row("design/a.html") });
  });

  // A design/ change publishes the new list with the bump, so the reload uses the new width.
  test("reloads with the new width when the revision and width change together", () => {
    const now = [list("/repo", 2, [row("design/a.html", { width: 800 })])];
    expect(canvasViewUpdate(before, now, open)).toEqual({ kind: "reload", canvas: row("design/a.html", { width: 800 }) });
  });

  test("does nothing when another folder's served revision changes", () => {
    const prev = [...before, list("/other", 1, [row("design/a.html")])];
    const now = [...before, list("/other", 2, [row("design/a.html")])];
    expect(canvasViewUpdate(prev, now, open)).toEqual({ kind: "none" });
  });

  test("does nothing when only comment counts change", () => {
    const now = [list("/repo", 1, [row("design/a.html", { open: 4 }), row("design/b.html")])];
    expect(canvasViewUpdate(before, now, open)).toEqual({ kind: "none" });
  });

  test("does nothing when nothing changes", () => {
    expect(canvasViewUpdate(before, before, open)).toEqual({ kind: "none" });
  });

  test("resizes when only the width changes", () => {
    const now = [list("/repo", 1, [row("design/a.html", { width: 375 }), row("design/b.html")])];
    expect(canvasViewUpdate(before, now, open)).toEqual({ kind: "resize", canvas: row("design/a.html", { width: 375 }) });
  });

  test("resizes when the width goes away", () => {
    const gone: CanvasRow = { path: "design/a.html", open: 0, url: row("design/a.html").url };
    const now = [list("/repo", 1, [gone])];
    expect(canvasViewUpdate(before, now, open)).toEqual({ kind: "resize", canvas: gone });
  });

  test("clears when the canvas drops out of the list", () => {
    const now = [list("/repo", 2, [row("design/b.html")])];
    expect(canvasViewUpdate(before, now, open)).toEqual({ kind: "clear", reason: "missing" });
  });

  test("clears when the folder is closed", () => {
    expect(canvasViewUpdate(before, [], open)).toEqual({ kind: "clear", reason: "closed" });
  });

  test("clears when the folder is not found", () => {
    expect(canvasViewUpdate(before, [{ path: "/repo", kind: "notFound" }], open)).toEqual({ kind: "clear", reason: "notFound" });
  });

  // `.doan/config.json` removed: there is no list, and nothing is served.
  test("clears when the folder is no longer initialized", () => {
    expect(canvasViewUpdate(before, [{ path: "/repo", kind: "uninitialized" }], open)).toEqual({ kind: "clear", reason: "missing" });
  });

  test("shows an error line and keeps the view on error", () => {
    expect(canvasViewUpdate(before, [{ path: "/repo", kind: "error", message: "Cannot read config" }], open))
      .toEqual({ kind: "errorLine", message: "Cannot read config" });
  });

  test("shows an error line and keeps the view on a CLI error", () => {
    expect(canvasViewUpdate(before, [{ path: "/repo", kind: "cliError", reason: "timed out after 10 s" }], open))
      .toEqual({ kind: "errorLine", message: "doan CLI 오류: timed out after 10 s" });
    expect(canvasViewUpdate(before, [{ path: "/repo", kind: "cliError", reason: "" }], open))
      .toEqual({ kind: "errorLine", message: "doan CLI 오류" });
  });

  // Served files may have changed while the folder failed, and the shell
  // stops serving a failed folder, so recovery reloads.
  test("reloads when the folder recovers from an error", () => {
    const prev: FolderEntry[] = [{ path: "/repo", kind: "error", message: "Cannot read config" }];
    expect(canvasViewUpdate(prev, before, open)).toEqual({ kind: "reload", canvas: row("design/a.html") });
  });

  test("keys by folder, so the same canvas path in two folders does not mix", () => {
    const prev = [list("/other", 1, [row("design/a.html")]), ...before];
    // The other folder drops the canvas and changes revision; the open folder is unchanged.
    const now = [list("/other", 5, [row("design/b.html")]), ...before];
    expect(canvasViewUpdate(prev, now, open)).toEqual({ kind: "none" });
    expect(canvasViewUpdate(prev, now, { folder: "/other", canvas: "design/a.html" })).toEqual({ kind: "clear", reason: "missing" });
    const widened = [list("/other", 1, [row("design/a.html", { width: 375 })]), ...before];
    expect(canvasViewUpdate(prev, widened, open)).toEqual({ kind: "none" });
  });
});
