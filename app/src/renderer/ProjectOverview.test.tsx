import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import type { ThumbnailReply } from "../main/thumbnails";
import type { CanvasRow } from "../main/view";
import { TooltipProvider } from "./components/ui/tooltip";
import { applyVisibility, cardFacts, focusAfterRemoval, overviewSections, ProjectOverview, ThumbnailRequests, thumbnailView, type ThumbnailState } from "./ProjectOverview";

const row = (path: string, extra: Partial<CanvasRow> = {}): CanvasRow => ({ path, id: path, width: 1440, frames: [], open: 0, resolved: 0, url: `http://127.0.0.1/${path}`, ...extra });
const rows = [
  row("design/tokens.html", { title: "Design tokens" }),
  row("design/2026-10-checkout-revamp.html", { title: "Checkout revamp (Oct 2026)" }),
  row("design/checkout/cart.html", { title: "Cart" }),
  row("design/settings/team/members.html", { title: "Team members" }),
  row("design/settings/billing.html", { title: "Billing & plans" }),
];
const render = (canvases: CanvasRow[], thumbnails: ReadonlyMap<string, ThumbnailState> = new Map()) =>
  renderToStaticMarkup(<TooltipProvider><ProjectOverview root="/code/acme-web" rows={canvases} thumbnails={thumbnails} onVisible={() => {}} open={() => {}} /></TooltipProvider>);

test("sections run root first, then folders in tree order, each with its direct canvases in tree order", () => {
  expect(overviewSections(rows).map(section => [section.key, section.canvases.map(canvas => canvas.name)])).toEqual([
    ["design", ["Checkout revamp (Oct 2026)", "Design tokens"]],
    ["design/checkout", ["Cart"]],
    ["design/settings", ["Billing & plans"]],
    ["design/settings/team", ["Team members"]],
  ]);
  // A folder holding only folders has no section of its own.
  expect(overviewSections([row("design/a/b/c.html")]).map(section => section.key)).toEqual(["design/a/b"]);
  expect(overviewSections([])).toEqual([]);
});

test("card facts count static frames, singular and capped, and show open comments only above zero", () => {
  const frames = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `f${index}` }));
  expect(cardFacts(row("design/a.html", { frames: frames(4) }))).toEqual({ frames: "4 frames" });
  expect(cardFacts(row("design/a.html", { frames: frames(1) }))).toEqual({ frames: "1 frame" });
  expect(cardFacts(row("design/a.html", { frames: frames(0) }))).toEqual({ frames: "0 frames" });
  expect(cardFacts(row("design/a.html", { frames: frames(1000), framesTruncated: true, open: 3 }))).toEqual({ frames: "1,000+ frames", open: "3 open" });
  expect(cardFacts(row("design/a.html", { frames: frames(1000) }))).toEqual({ frames: "1,000 frames" });
  // Missing ID does not invalidate known frame facts.
  const { id: _id, ...withoutId } = row("design/a.html", { open: 2 });
  expect(cardFacts(withoutId)).toEqual({ frames: "0 frames", open: "2 open" });
});

test("thumbnail view: missing width beats capture state; missing id does not", () => {
  const { id: _id, ...withoutId } = row("design/a.html");
  const { width: _width, ...noWidth } = row("design/a.html");
  expect(thumbnailView(withoutId, { kind: "ready", url: "blob:x" })).toEqual({ kind: "ready", url: "blob:x" });
  expect(thumbnailView(noWidth, { kind: "failed" })).toEqual({ kind: "noWidth" });
  expect(thumbnailView(row("design/a.html"), undefined)).toEqual({ kind: "pending" });
  expect(thumbnailView(row("design/a.html"), { kind: "failed" })).toEqual({ kind: "failed" });
  expect(thumbnailView(row("design/a.html"), { kind: "ready", url: "blob:x" })).toEqual({ kind: "ready", url: "blob:x" });
});

test("focus goes to the next remaining card, else the previous one", () => {
  expect(focusAfterRemoval(["a", "b", "c"], ["a", "c"], "b")).toBe("c");
  expect(focusAfterRemoval(["a", "b", "c", "d"], ["a", "d"], "b")).toBe("d");
  expect(focusAfterRemoval(["a", "b", "c"], ["a", "b"], "c")).toBe("b");
  expect(focusAfterRemoval(["a", "b"], [], "a")).toBeNull();
  // Still there, or never known: nothing to move.
  expect(focusAfterRemoval(["a", "b"], ["a", "b"], "a")).toBeNull();
  expect(focusAfterRemoval(["a"], ["b"], "x")).toBeNull();
});

test("visibility changes report a new set only when it changed", () => {
  const visible = applyVisibility(new Set(), [{ path: "a", visible: true }, { path: "b", visible: true }]);
  expect(visible && [...visible]).toEqual(["a", "b"]);
  expect(applyVisibility(new Set(["a", "b"]), [{ path: "a", visible: true }, { path: "c", visible: false }])).toBeNull();
  const after = applyVisibility(new Set(["a", "b"]), [{ path: "a", visible: false }]);
  expect(after && [...after]).toEqual(["b"]);
});

test("the overview shows thumbnail states without inferring parse failure from missing metadata", () => {
  const { id: _id, title: _title, ...withoutId } = row("design/checkout/legacy-checkout.html", { mtimeMs: Date.now() });
  const { width: _width, ...noWidth } = rows[0]!;
  const html = render([noWidth, rows[1]!, rows[2]!, withoutId, { ...rows[4]!, open: 2, frames: [{ id: "plans" }] }], new Map<string, ThumbnailState>([
    ["design/2026-10-checkout-revamp.html", { kind: "ready", url: "blob:thumb" }],
    ["design/settings/billing.html", { kind: "failed" }],
  ]));
  expect(html).toContain('aria-label="Overview"');
  expect(html).toMatch(/<div class="sec">design <span class="r">2<\/span><\/div>/);
  expect(html).toMatch(/<div class="sec">design\/checkout <span class="r">2<\/span><\/div>/);
  expect(html).toContain("Preview needs a valid <code>doan:width</code> — run doan check");
  expect(html).toContain('<img src="blob:thumb" alt=""');
  expect(html).toContain('class="thumb pending"');
  expect(html).toContain("Preview unavailable");
  expect(html).not.toContain("Can&#x27;t read this canvas");
  expect(html).toMatch(/<span id="[^"]+-title" class="ocard-title" title="legacy-checkout">legacy-checkout<\/span>/);
  expect(html).toContain("1 frame · ");
  expect(html).toContain('<span class="hot">2 open</span>');
  // Zero open comments are not shown.
  expect(html).not.toContain("0 open");
  expect(html.match(/<button[^>]*class="ocard"/g)).toHaveLength(5);
});

test("a workspace without canvases keeps the heading and shows the first prompt composer in a card", () => {
  const html = render([]);
  expect(html).toMatch(/^<section class="ov" role="region" aria-label="Overview"><div class="empty"><b>No canvases in design\/ yet<\/b><div class="fp-card"><div class="ob-prompt">/);
  expect(html).toContain('<p class="ob-sentence">Use the doan skill to make a design canvas in /code/acme-web for <mark class="slot">…</mark>.</p>');
  expect(html).not.toContain("Copy first prompt");
  expect(html).not.toContain("ocard");
});

// Each request waits until the test answers it, so replies can arrive late.
function requests(root = "/code/acme-web") {
  const asks: { path: string; onScreen: boolean; reply: (reply: ThumbnailReply) => Promise<void> }[] = [];
  let urls = 0;
  const created = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${++urls}`);
  const revoked = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  let shown: ReadonlyMap<string, ThumbnailState> = new Map();
  const thumbs = new ThumbnailRequests(root, (_root, path, onScreen) => new Promise(resolve => {
    asks.push({ path, onScreen, reply: async reply => { resolve(reply); await Promise.resolve(); } });
  }), items => { shown = items; }, () => {});
  const ready: ThumbnailReply = { kind: "ready", png: new Uint8Array([1]) };
  return { thumbs, asks, created, revoked, ready, shown: () => shown };
}

afterEach(() => vi.restoreAllMocks());

test("thumbnails: a removed card releases its image and forgets its request and visibility", async () => {
  const h = requests();
  const [a, b] = [rows[0]!, rows[1]!];
  h.thumbs.setRows([a, b]);
  h.thumbs.onVisible([a.path]);
  await h.asks[0]!.reply(h.ready);
  expect(h.shown().get(a.path)).toEqual({ kind: "ready", url: "blob:1" });
  h.thumbs.setRows([b]);
  expect(h.revoked).toHaveBeenCalledWith("blob:1");
  expect(h.shown().has(a.path)).toBe(false);
});

test("thumbnails: a reply for a card removed in the meantime is dropped", async () => {
  const h = requests();
  const [a, b] = [rows[0]!, rows[1]!];
  h.thumbs.setRows([a, b]);
  h.thumbs.onVisible([a.path]);
  h.thumbs.setRows([b]);
  await h.asks.find(ask => ask.path === a.path)!.reply(h.ready);
  expect(h.created).not.toHaveBeenCalled();
  expect(h.shown().has(a.path)).toBe(false);
});

test("thumbnails: a card made again at the same path is asked again, and the old reply does not land", async () => {
  const h = requests();
  const a = rows[0]!;
  h.thumbs.setRows([a]);
  h.thumbs.onVisible([a.path]);
  const old = h.asks[0]!;
  h.thumbs.setRows([]);
  h.thumbs.onVisible([]);
  h.thumbs.setRows([a]);
  h.thumbs.onVisible([a.path]);
  expect(h.asks.map(ask => [ask.path, ask.onScreen])).toEqual([[a.path, true], [a.path, true]]);
  await old.reply(h.ready);
  expect(h.shown().has(a.path)).toBe(false);
  await h.asks[1]!.reply(h.ready);
  expect(h.shown().get(a.path)).toEqual({ kind: "ready", url: "blob:1" });
});

test("thumbnails: leaving the root releases every image and drops late replies", async () => {
  const h = requests();
  const [a, b] = [rows[0]!, rows[1]!];
  h.thumbs.setRows([a, b]);
  h.thumbs.onVisible([a.path, b.path]);
  await h.asks.find(ask => ask.path === a.path)!.reply(h.ready);
  h.thumbs.dispose();
  expect(h.revoked).toHaveBeenCalledWith("blob:1");
  await h.asks.find(ask => ask.path === b.path)!.reply(h.ready);
  expect(h.created).toHaveBeenCalledTimes(1);
});

test("thumbnail requests accept valid width without an id and retain known frames", () => {
  const h = requests();
  const { id: _id, ...missingID } = row("design/no-id.html", { frames: [{ id: "known" }] });
  const { width: _width, ...noWidth } = row("design/no-width.html");
  h.thumbs.setRows([missingID, noWidth]);
  h.thumbs.onVisible([missingID.path, noWidth.path]);
  h.thumbs.changed(noWidth.path);
  expect(h.asks.map(ask => ask.path)).toEqual([missingID.path]);
  expect(cardFacts(missingID)).toEqual({ frames: "1 frame" });
  h.thumbs.dispose();
});

test("a notice opens the overview as its first child band, and no notice adds nothing", () => {
  const notice = "Checkout moved, but 2 canvases now use the ID checkout. Run doan check in a terminal.";
  const html = renderToStaticMarkup(<TooltipProvider><ProjectOverview root="/code/acme-web" rows={rows} thumbnails={new Map()} onVisible={() => {}} open={() => {}} notice={notice} /></TooltipProvider>);
  expect(html).toContain(`<section class="ov native-scroll" role="region" aria-label="Overview"><div class="canvas-notice" role="status">${notice}</div><section aria-label="design">`);
  expect(render(rows)).not.toContain("canvas-notice");
});
