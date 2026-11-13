import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../view";
import { canvasKeyFor, canvasKeyString, resolveTarget, sameCanvas, sameTarget, type PrototypeTarget } from "./targets";

const base = "http://127.0.0.1:5123/t/tok/";
function row(path: string, patch: Partial<CanvasRow> = {}): CanvasRow {
  return { path, url: `${base}k1/${path}`, ...patch };
}
function list(root: string, canvases: CanvasRow[], servedRev = 0): FolderEntry {
  return { path: root, kind: "list", canvases, servedRev };
}

const proto = row(".doan/canvases/proto.html", { id: "proto", frames: [{ id: "phone", title: "Phone" }] });
const loose = row(".doan/canvases/loose.html");
const entries: FolderEntry[] = [list("/r", [proto, loose])];
const target: PrototypeTarget = { root: "/r", canvas: { id: "proto" }, frame: "phone" };

describe("identity", () => {
  test("same root, canvas key and frame", () => {
    expect(sameTarget(target, { root: "/r", canvas: { id: "proto" }, frame: "phone" })).toBe(true);
    expect(sameTarget(target, { root: "/r", canvas: { id: "proto" }, frame: "other" })).toBe(false);
    expect(sameTarget(target, { root: "/r-wt", canvas: { id: "proto" }, frame: "phone" })).toBe(false);
    expect(sameTarget(target, { root: "/r", canvas: { path: "proto" }, frame: "phone" })).toBe(false);
    expect(sameCanvas(target, { root: "/r", canvas: { id: "proto" }, frame: "x" })).toBe(true);
    expect(sameCanvas({ root: "/r", canvas: { path: "a.html" } }, { root: "/r", canvas: { path: "a.html" } })).toBe(true);
  });

  test("a canvas key string keeps id and path keys apart", () => {
    expect(canvasKeyString({ root: "/r", canvas: { id: "a" } })).not.toBe(canvasKeyString({ root: "/r", canvas: { path: "a" } }));
    expect(canvasKeyString({ root: "/r", canvas: { id: "a" } })).not.toBe(canvasKeyString({ root: "/r2", canvas: { id: "a" } }));
  });

  test("a row is keyed by its id, an ID-less row by its path, a shared id by nothing", () => {
    expect(canvasKeyFor(proto, [proto, loose])).toEqual({ id: "proto" });
    expect(canvasKeyFor(loose, [proto, loose])).toEqual({ path: ".doan/canvases/loose.html" });
    const twin = row(".doan/canvases/twin.html", { id: "proto" });
    expect(canvasKeyFor(proto, [proto, twin])).toBeNull();
  });
});

describe("resolveTarget", () => {
  test("finds the row by id and reports its URL, source and static frames", () => {
    const resolved = resolveTarget(target, entries);
    expect(resolved).toEqual({ kind: "present", url: proto.url, source: expect.any(String), error: false, frames: [{ id: "phone", title: "Phone" }] });
  });

  test("an ID-keyed canvas follows a rename", () => {
    const moved = row(".doan/canvases/renamed.html", { id: "proto" });
    expect(resolveTarget(target, [list("/r", [moved])])).toMatchObject({ kind: "present", url: moved.url });
  });

  test("a path-keyed canvas matches only an ID-less row at that path", () => {
    const byPath = { root: "/r", canvas: { path: ".doan/canvases/loose.html" } };
    expect(resolveTarget(byPath, entries)).toMatchObject({ kind: "present", url: loose.url });
    expect(resolveTarget(byPath, [list("/r", [row(".doan/canvases/loose.html", { id: "now-has-id" })])])).toEqual({ kind: "absent" });
  });

  test("the source changes with the row's rev, the folder's served rev and the URL", () => {
    const source = (e: FolderEntry[]) => {
      const resolved = resolveTarget(target, e);
      return resolved.kind === "present" ? resolved.source : null;
    };
    const first = source(entries);
    expect(source([list("/r", [proto, loose])])).toBe(first);
    expect(source([list("/r", [{ ...proto, rev: 1 }, loose])])).not.toBe(first);
    expect(source([list("/r", [proto, loose], 1)])).not.toBe(first);
    expect(source([list("/r", [{ ...proto, url: `${base}k2/x` }, loose])])).not.toBe(first);
  });

  test("a row doan ls could not read is present with an error", () => {
    expect(resolveTarget(target, [list("/r", [{ ...proto, error: { code: "read_failed", message: "boom" } }])])).toMatchObject({ kind: "present", error: true });
  });

  test("never guesses: gone, conflicting ids, other worktrees and failed lists are absent", () => {
    expect(resolveTarget(target, [list("/r", [loose])])).toEqual({ kind: "absent" });
    expect(resolveTarget(target, [list("/r", [proto, row(".doan/canvases/twin.html", { id: "proto" })])])).toEqual({ kind: "absent" });
    expect(resolveTarget(target, [list("/r-wt", [proto])])).toEqual({ kind: "absent" });
    expect(resolveTarget(target, [])).toEqual({ kind: "absent" });
    for (const entry of [
      { path: "/r", kind: "error", message: "bad", config: "/r/.doan/config.json" },
      { path: "/r", kind: "cliError", reason: "x" },
      { path: "/r", kind: "notFound" },
      { path: "/r", kind: "uninitialized" },
    ] as FolderEntry[]) expect(resolveTarget(target, [entry])).toEqual({ kind: "absent" });
  });

  test("a root still loading is unknown, so nothing changes yet", () => {
    expect(resolveTarget(target, [{ path: "/r", kind: "loading" }])).toEqual({ kind: "unknown" });
  });
});
