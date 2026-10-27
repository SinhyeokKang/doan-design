import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { ActivityEvent } from "./activity";
import {
  bottomLabel,
  canvasAtHref,
  canvasViewUpdate,
  cliErrorText,
  duplicateIdText,
  frameLabel,
  INITIAL_HEIGHT,
  layoutHeight,
  MAX_HEIGHT,
  sameDocument,
} from "./canvasView";

const open = { folder: "/repo", canvas: ".doan/canvases/a.html", row: {} };

function row(path: string, extra: Partial<CanvasRow> = {}): CanvasRow {
  return { path, open: 0, resolved: 0, url: `http://127.0.0.1:1/t/tok/k/${path}`, width: 1200, ...extra };
}

function list(path: string, servedRev: number, canvases: CanvasRow[]): FolderEntry {
  return { path, kind: "list", servedRev, canvases };
}

const before = [list("/repo", 1, [row(".doan/canvases/a.html"), row(".doan/canvases/b.html")])];

describe("canvasViewUpdate", () => {
  test("reloads when the open folder's served revision changes", () => {
    const now = [list("/repo", 2, [row(".doan/canvases/a.html"), row(".doan/canvases/b.html")])];
    expect(canvasViewUpdate(before, now, open)).toEqual({ kind: "reload", canvas: row(".doan/canvases/a.html") });
  });

  // A .doan/canvases/ change publishes the new list with the bump, so the reload uses the new width.
  test("reloads with the new width when the revision and width change together", () => {
    const now = [list("/repo", 2, [row(".doan/canvases/a.html", { width: 800 })])];
    expect(canvasViewUpdate(before, now, open)).toEqual({ kind: "reload", canvas: row(".doan/canvases/a.html", { width: 800 }) });
  });

  test("does nothing when another folder's served revision changes", () => {
    const prev = [...before, list("/other", 1, [row(".doan/canvases/a.html")])];
    const now = [...before, list("/other", 2, [row(".doan/canvases/a.html")])];
    expect(canvasViewUpdate(prev, now, open)).toEqual({ kind: "none" });
  });

  test("does nothing when only comment counts change", () => {
    const now = [list("/repo", 1, [row(".doan/canvases/a.html", { open: 4 }), row(".doan/canvases/b.html")])];
    expect(canvasViewUpdate(before, now, open)).toEqual({ kind: "none" });
  });

  test("does nothing when nothing changes", () => {
    expect(canvasViewUpdate(before, before, open)).toEqual({ kind: "none" });
  });

  test("resizes when only the width changes", () => {
    const now = [list("/repo", 1, [row(".doan/canvases/a.html", { width: 375 }), row(".doan/canvases/b.html")])];
    expect(canvasViewUpdate(before, now, open)).toEqual({ kind: "resize", canvas: row(".doan/canvases/a.html", { width: 375 }) });
  });

  test("resizes when the width goes away", () => {
    const gone: CanvasRow = { path: ".doan/canvases/a.html", open: 0, resolved: 0, url: row(".doan/canvases/a.html").url };
    const now = [list("/repo", 1, [gone])];
    expect(canvasViewUpdate(before, now, open)).toEqual({ kind: "resize", canvas: gone });
  });

  test("clears when the canvas drops out of the list", () => {
    const now = [list("/repo", 2, [row(".doan/canvases/b.html")])];
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
    expect(canvasViewUpdate(before, [{ path: "/repo", kind: "uninitialized" }], open)).toEqual({ kind: "clear", reason: "uninitialized" });
  });

  test("shows an error line and keeps the view on error", () => {
    expect(canvasViewUpdate(before, [{ path: "/repo", kind: "error", message: "Cannot read config" }], open))
      .toEqual({ kind: "errorLine", message: "Cannot read config" });
  });

  test("shows an error line and keeps the view on a CLI error", () => {
    expect(canvasViewUpdate(before, [{ path: "/repo", kind: "cliError", reason: "timed out after 10 s" }], open))
      .toEqual({ kind: "errorLine", message: "doan CLI error: timed out after 10 s" });
    expect(canvasViewUpdate(before, [{ path: "/repo", kind: "cliError", reason: "" }], open))
      .toEqual({ kind: "errorLine", message: "doan CLI error" });
  });

  // Served files may have changed while the folder failed, and the shell
  // stops serving a failed folder, so recovery reloads.
  test("reloads when the folder recovers from an error", () => {
    const prev: FolderEntry[] = [{ path: "/repo", kind: "error", message: "Cannot read config" }];
    expect(canvasViewUpdate(prev, before, open)).toEqual({ kind: "reload", canvas: row(".doan/canvases/a.html") });
  });

  test("keys by folder, so the same canvas path in two folders does not mix", () => {
    const prev = [list("/other", 1, [row(".doan/canvases/a.html")]), ...before];
    // The other folder drops the canvas and changes revision; the open folder is unchanged.
    const now = [list("/other", 5, [row(".doan/canvases/b.html")]), ...before];
    expect(canvasViewUpdate(prev, now, open)).toEqual({ kind: "none" });
    expect(canvasViewUpdate(prev, now, { folder: "/other", canvas: ".doan/canvases/a.html", row: {} })).toEqual({ kind: "clear", reason: "missing" });
    const widened = [list("/other", 1, [row(".doan/canvases/a.html", { width: 375 })]), ...before];
    expect(canvasViewUpdate(prev, widened, open)).toEqual({ kind: "none" });
  });
});

describe("canvasViewUpdate: row revisions and canvas ids", () => {
  const home = { folder: "/repo", canvas: ".doan/canvases/a.html", row: { id: "home" } };
  const a = (extra: Partial<CanvasRow> = {}) => row(".doan/canvases/a.html", { id: "home", rev: 1, ...extra });
  const b = (extra: Partial<CanvasRow> = {}) => row(".doan/canvases/b.html", { id: "other", rev: 1, ...extra });
  const prev = [list("/repo", 1, [a(), b()])];

  test("reloads when the open row's revision changes without a served bump", () => {
    expect(canvasViewUpdate(prev, [list("/repo", 1, [a({ rev: 2 }), b()])], home)).toEqual({ kind: "reload", canvas: a({ rev: 2 }) });
  });

  test("does nothing when only another canvas's row revision changes", () => {
    expect(canvasViewUpdate(prev, [list("/repo", 1, [a(), b({ rev: 2 })])], home)).toEqual({ kind: "none" });
  });

  test("still reloads on a served bump when row revisions are unchanged", () => {
    expect(canvasViewUpdate(prev, [list("/repo", 2, [a(), b()])], home)).toEqual({ kind: "reload", canvas: a() });
  });

  test("follows the open canvas to the one row with its id", () => {
    const moved = row(".doan/canvases/sub/a.html", { id: "home", rev: 1 });
    expect(canvasViewUpdate(prev, [list("/repo", 1, [b(), moved])], home)).toEqual({ kind: "moved", canvas: moved, from: ".doan/canvases/a.html" });
  });

  test("carries the new width when a move and a width change land together", () => {
    const moved = row(".doan/canvases/a2.html", { id: "home", rev: 3, width: 375 });
    expect(canvasViewUpdate(prev, [list("/repo", 2, [moved, b()])], home)).toEqual({ kind: "moved", canvas: moved, from: ".doan/canvases/a.html" });
  });

  test("follows a move after a folder read that failed", () => {
    const moved = row(".doan/canvases/a2.html", { id: "home" });
    const failed: FolderEntry[] = [{ path: "/repo", kind: "error", message: "Cannot read config" }];
    expect(canvasViewUpdate(failed, [list("/repo", 1, [moved])], home)).toEqual({ kind: "moved", canvas: moved, from: ".doan/canvases/a.html" });
  });

  test("clears with the count when two or more rows now use the id", () => {
    const two = [row(".doan/canvases/a2.html", { id: "home" }), row(".doan/canvases/a3.html", { id: "home" }), b()];
    expect(canvasViewUpdate(prev, [list("/repo", 1, two)], home)).toEqual({ kind: "clear", reason: "duplicateId", count: 2 });
    const three = [...two, row(".doan/canvases/a4.html", { id: "home" })];
    expect(canvasViewUpdate(prev, [list("/repo", 1, three)], home)).toEqual({ kind: "clear", reason: "duplicateId", count: 3 });
  });

  test("clears as missing when no row has the id", () => {
    expect(canvasViewUpdate(prev, [list("/repo", 1, [b()])], home)).toEqual({ kind: "clear", reason: "missing" });
  });

  test("clears as missing when the open row has no id", () => {
    const now = [list("/repo", 1, [row(".doan/canvases/a2.html"), row(".doan/canvases/a3.html", { id: "" })])];
    expect(canvasViewUpdate(prev, now, { ...home, row: {} })).toEqual({ kind: "clear", reason: "missing" });
    expect(canvasViewUpdate(prev, now, { ...home, row: { id: "" } })).toEqual({ kind: "clear", reason: "missing" });
  });

  test("reloads as another canvas when the id at the same path changes", () => {
    expect(canvasViewUpdate(prev, [list("/repo", 1, [a({ id: "renamed" }), b()])], home)).toEqual({ kind: "reload", canvas: a({ id: "renamed" }), idChanged: true });
    expect(canvasViewUpdate(prev, [list("/repo", 1, [row(".doan/canvases/a.html", { rev: 1 }), b()])], home)).toMatchObject({ kind: "reload", idChanged: true });
    expect(canvasViewUpdate(prev, [list("/repo", 1, [a(), b()])], { ...home, row: {} })).toMatchObject({ kind: "reload", idChanged: true });
  });

  test("an id change wins over a served bump or a previous non-list entry in the same update", () => {
    expect(canvasViewUpdate(prev, [list("/repo", 2, [a({ id: "renamed" }), b()])], home)).toEqual({ kind: "reload", canvas: a({ id: "renamed" }), idChanged: true });
    const failed: FolderEntry[] = [{ path: "/repo", kind: "error", message: "Cannot read config" }];
    expect(canvasViewUpdate(failed, [list("/repo", 1, [a({ id: "renamed" }), b()])], home)).toEqual({ kind: "reload", canvas: a({ id: "renamed" }), idChanged: true });
  });

  test("an empty id and no id are the same canvas id", () => {
    const blank = [list("/repo", 1, [row(".doan/canvases/a.html", { id: "", rev: 1 })])];
    expect(canvasViewUpdate(blank, blank, { ...home, row: {} })).toEqual({ kind: "none" });
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
    expect(cliErrorText("timed out after 10 s")).toBe("doan CLI error: timed out after 10 s");
    expect(cliErrorText("")).toBe("doan CLI error");
  });
});

const base = "http://127.0.0.1:4100/t/tok/key/";

describe("sameDocument", () => {
  test("matches the same URL", () => {
    expect(sameDocument(`${base}.doan/canvases/a.html`, `${base}.doan/canvases/a.html`)).toBe(true);
  });

  // A hash link stays in the same document.
  test("ignores the fragment", () => {
    expect(sameDocument(`${base}.doan/canvases/a.html#top`, `${base}.doan/canvases/a.html`)).toBe(true);
  });

  test("keeps the query", () => {
    expect(sameDocument(`${base}.doan/canvases/a.html?x=1`, `${base}.doan/canvases/a.html`)).toBe(false);
  });

  // CanvasRow.url encodes every reserved character; a link the browser
  // resolves leaves some of them as typed.
  test("compares path segments decoded", () => {
    expect(sameDocument(`${base}.doan/canvases/a,b%20c.html`, `${base}.doan/canvases/a%2Cb%20c.html`)).toBe(true);
    expect(sameDocument(`${base}.doan/canvases/%ED%95%9C.html`, `${base}.doan/canvases/한.html`)).toBe(true);
  });

  test("does not merge an encoded slash with a real one", () => {
    expect(sameDocument(`${base}.doan/canvases/a%2Fb.html`, `${base}.doan/canvases/a/b.html`)).toBe(false);
  });

  test("differs by folder key, port and path", () => {
    expect(sameDocument(`${base}.doan/canvases/a.html`, "http://127.0.0.1:4100/t/tok/other/.doan/canvases/a.html")).toBe(false);
    expect(sameDocument(`${base}.doan/canvases/a.html`, "http://127.0.0.1:4101/t/tok/key/.doan/canvases/a.html")).toBe(false);
    expect(sameDocument(`${base}.doan/canvases/a.html`, `${base}.doan/canvases/b.html`)).toBe(false);
  });

  test("never matches what does not parse", () => {
    expect(sameDocument("not a url", "not a url")).toBe(false);
    expect(sameDocument(`${base}.doan/canvases/%E0%A4%A.html`, `${base}.doan/canvases/%E0%A4%A.html`)).toBe(false);
    expect(sameDocument("about:blank", "about:blank")).toBe(false);
  });
});

describe("canvasAtHref", () => {
  const rows = [row(".doan/canvases/a.html"), row(".doan/canvases/b c.html", { url: `${base}.doan/canvases/b%20c.html` })];

  test("finds the listed canvas a document shows", () => {
    expect(canvasAtHref(rows, `${rows[0]!.url}#frame`)).toBe(rows[0]);
    expect(canvasAtHref(rows, `${base}.doan/canvases/b%20c.html`)).toBe(rows[1]);
  });

  test("finds nothing for an unlisted document", () => {
    expect(canvasAtHref(rows, `${base}.doan/canvases/notes.html`)).toBeUndefined();
  });
});

describe("layoutHeight", () => {
  const layout = (href: string, height: number, viewport: number) => ({ href, height, viewport });
  const a = `${base}.doan/canvases/a.html`;
  const b = `${base}.doan/canvases/b.html`;

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
  test("keeps the id alongside the title", () => {
    expect(frameLabel({ id: "hero", title: "Hero" })).toEqual({ id: "hero", title: "Hero" });
  });

  test("keeps the id without a title", () => {
    expect(frameLabel({ id: "hero" })).toEqual({ id: "hero" });
    expect(frameLabel({ id: "hero", title: "" })).toEqual({ id: "hero" });
  });

  test("names a frame without id", () => {
    expect(frameLabel({ id: "" })).toEqual({ id: "(no id)" });
  });
});

test("frameLabel preserves duplicate ids as separate labels", () => {
  expect([{ id: "dup", title: "First" }, { id: "dup", title: "Second" }].map(frameLabel)).toEqual([{ id: "dup", title: "First" }, { id: "dup", title: "Second" }]);
});

test("names the moved canvas, the count and the id when several canvases share it", () => {
  expect(duplicateIdText(row(".doan/canvases/checkout.html", { id: "checkout", title: "Checkout" }), 2)).toBe("Checkout moved, but 2 canvases now use the ID checkout. Run doan check in a terminal.");
  expect(duplicateIdText(row(".doan/canvases/flows/cart.html", { id: "cart" }), 3)).toBe("cart moved, but 3 canvases now use the ID cart. Run doan check in a terminal.");
});

describe("bottomLabel", () => {
  const now = new Date(2026, 9, 24, 14, 10);
  const event = (kind: ActivityEvent["kind"], at: Date): ActivityEvent => ({ folder: "/repo", canvas: ".doan/canvases/a.html", at, kind });

  test("names the latest kind with local hours and minutes today", () => {
    expect(bottomLabel([event("opened", new Date(2026, 9, 24, 14, 2, 10))], now)).toBe("Opened 14:02");
    expect(bottomLabel([event("changed", new Date(2026, 9, 24, 14, 5)), event("opened", new Date(2026, 9, 24, 14, 2))], now)).toBe("Changed 14:05");
    expect(bottomLabel([event("reloaded", new Date(2026, 9, 24, 9, 6))], now)).toBe("Reloaded 09:06");
    expect(bottomLabel([event("moved", new Date(2026, 9, 24, 14, 7))], now)).toBe("Moved 14:07");
  });

  test("a Resolved entry does not change the label", () => {
    const resolved: ActivityEvent = { ...event("resolved", new Date(2026, 9, 24, 14, 9)), resolvedBy: ["codex"], count: 1 };
    expect(bottomLabel([resolved, event("reloaded", new Date(2026, 9, 24, 14, 6))], now)).toBe("Reloaded 14:06");
    expect(bottomLabel([resolved], now)).toBeNull();
    expect(bottomLabel([], now)).toBeNull();
  });

  test("adds the date when the time is not today", () => {
    expect(bottomLabel([event("changed", new Date(2026, 9, 23, 18, 40))], now)).toBe("Changed Oct 23 18:40");
    expect(bottomLabel([event("opened", new Date(2025, 9, 24, 14, 2))], now)).toBe("Opened Oct 24 14:02");
  });

  test("tells the two sides of midnight apart", () => {
    const justAfter = new Date(2026, 9, 25, 0, 1);
    expect(bottomLabel([event("changed", new Date(2026, 9, 24, 23, 59))], justAfter)).toBe("Changed Oct 24 23:59");
    expect(bottomLabel([event("changed", new Date(2026, 9, 25, 0, 0))], justAfter)).toBe("Changed 00:00");
  });
});
