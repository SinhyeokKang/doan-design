import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import {
  canvasAtHref,
  canvasViewUpdate,
  cliErrorText,
  frameLabel,
  INITIAL_HEIGHT,
  layoutHeight,
  MAX_HEIGHT,
  sameDocument,
  updatedText,
  type OpenCanvas,
} from "./canvasView";

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

describe("constants", () => {
  test("pins the iframe height rule values", () => {
    expect(INITIAL_HEIGHT).toBe(150);
    expect(MAX_HEIGHT).toBe(200_000);
  });
});

describe("cliErrorText", () => {
  test("names the reason when there is one", () => {
    expect(cliErrorText("timed out after 10 s")).toBe("doan CLI 오류: timed out after 10 s");
    expect(cliErrorText("")).toBe("doan CLI 오류");
  });
});

const base = "http://127.0.0.1:4100/t/tok/key/";

describe("sameDocument", () => {
  test("matches the same URL", () => {
    expect(sameDocument(`${base}design/a.html`, `${base}design/a.html`)).toBe(true);
  });

  // A hash link stays in the same document.
  test("ignores the fragment", () => {
    expect(sameDocument(`${base}design/a.html#top`, `${base}design/a.html`)).toBe(true);
  });

  test("keeps the query", () => {
    expect(sameDocument(`${base}design/a.html?x=1`, `${base}design/a.html`)).toBe(false);
  });

  // CanvasRow.url encodes every reserved character; a link the browser
  // resolves leaves some of them as typed.
  test("compares path segments decoded", () => {
    expect(sameDocument(`${base}design/a,b%20c.html`, `${base}design/a%2Cb%20c.html`)).toBe(true);
    expect(sameDocument(`${base}design/%ED%95%9C.html`, `${base}design/한.html`)).toBe(true);
  });

  test("does not merge an encoded slash with a real one", () => {
    expect(sameDocument(`${base}design/a%2Fb.html`, `${base}design/a/b.html`)).toBe(false);
  });

  test("differs by folder key, port and path", () => {
    expect(sameDocument(`${base}design/a.html`, "http://127.0.0.1:4100/t/tok/other/design/a.html")).toBe(false);
    expect(sameDocument(`${base}design/a.html`, "http://127.0.0.1:4101/t/tok/key/design/a.html")).toBe(false);
    expect(sameDocument(`${base}design/a.html`, `${base}design/b.html`)).toBe(false);
  });

  test("never matches what does not parse", () => {
    expect(sameDocument("not a url", "not a url")).toBe(false);
    expect(sameDocument(`${base}design/%E0%A4%A.html`, `${base}design/%E0%A4%A.html`)).toBe(false);
    expect(sameDocument("about:blank", "about:blank")).toBe(false);
  });
});

describe("canvasAtHref", () => {
  const rows = [row("design/a.html"), row("design/b c.html", { url: `${base}design/b%20c.html` })];

  test("finds the listed canvas a document shows", () => {
    expect(canvasAtHref(rows, `${rows[0]!.url}#frame`)).toBe(rows[0]);
    expect(canvasAtHref(rows, `${base}design/b%20c.html`)).toBe(rows[1]);
  });

  test("finds nothing for an unlisted document", () => {
    expect(canvasAtHref(rows, `${base}design/notes.html`)).toBeUndefined();
  });
});

describe("layoutHeight", () => {
  const layout = (href: string, height: number, viewport: number) => ({ href, height, viewport });
  const a = `${base}design/a.html`;
  const b = `${base}design/b.html`;

  test("uses the measured height of the document it loaded", () => {
    expect(layoutHeight(null, 150, layout(a, 900, 150))).toBe(900);
    expect(layoutHeight(a, 900, layout(a, 640, 900))).toBe(640);
  });

  test("caps the height", () => {
    expect(layoutHeight(null, 150, layout(a, 500_000, 150))).toBe(MAX_HEIGHT);
    expect(layoutHeight(a, 150, layout(a, MAX_HEIGHT, 150))).toBe(MAX_HEIGHT);
    expect(layoutHeight(a, MAX_HEIGHT, layout(a, 300_000, MAX_HEIGHT))).toBe(MAX_HEIGHT);
  });

  // A layout posted before the canvas saw the last resize describes a viewport
  // the iframe no longer has.
  test("keeps the height when the layout was measured at another iframe height", () => {
    expect(layoutHeight(a, 300, layout(a, 2500, 2500))).toBe(300);
    expect(layoutHeight(null, 150, layout(a, 2500, 2500))).toBe(150);
  });

  test("allows 1px between the viewport and the iframe height", () => {
    expect(layoutHeight(a, 300, layout(a, 640, 301))).toBe(640);
    expect(layoutHeight(a, 300, layout(a, 640, 299))).toBe(640);
    expect(layoutHeight(a, 300, layout(a, 640, 302))).toBe(300);
  });

  // A linked document inherits the iframe height and a 100vh canvas could not
  // shrink below it, so it is measured again from the initial height.
  test("resets for a new document", () => {
    expect(layoutHeight(a, 2400, layout(b, 2400, 2400))).toBe(INITIAL_HEIGHT);
  });

  // Seen in the app: the linked document posts again at the inherited
  // viewport after the reset; only its layout at the initial height counts.
  test("after a reset, waits for a layout measured at the initial height", () => {
    expect(layoutHeight(b, INITIAL_HEIGHT, layout(b, 2400, 2400))).toBe(INITIAL_HEIGHT);
    expect(layoutHeight(b, INITIAL_HEIGHT, layout(b, 300, INITIAL_HEIGHT))).toBe(300);
  });

  // Already at the initial height there is no resize to trigger another layout,
  // so this one is the measurement.
  test("takes a new document's height when the iframe is already at the initial height", () => {
    expect(layoutHeight(a, INITIAL_HEIGHT, layout(b, 700, INITIAL_HEIGHT))).toBe(700);
  });

  test("does not reset for a hash change", () => {
    expect(layoutHeight(a, 2400, layout(`${a}#second`, 2400, 2400))).toBe(2400);
  });
});

describe("frameLabel", () => {
  test("prefers the title", () => {
    expect(frameLabel({ id: "hero", title: "Hero" })).toEqual({ text: "Hero", mono: false });
  });

  test("falls back to the id in monospace", () => {
    expect(frameLabel({ id: "hero" })).toEqual({ text: "hero", mono: true });
    expect(frameLabel({ id: "hero", title: "" })).toEqual({ text: "hero", mono: true });
  });

  test("names a frame without id", () => {
    expect(frameLabel({ id: "" })).toEqual({ text: "(id 없음)", mono: false });
  });
});

describe("updatedText", () => {
  test("shows local hours, minutes and seconds", () => {
    expect(updatedText(new Date(2026, 9, 22, 14, 3, 21))).toBe("갱신 14:03:21");
    expect(updatedText(new Date(2026, 9, 22, 9, 0, 5))).toBe("갱신 09:00:05");
  });
});
