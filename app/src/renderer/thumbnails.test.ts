import { afterEach, expect, test, vi } from "vitest";
import type { ThumbnailReply } from "../main/thumbnails";
import type { CanvasRow } from "../main/view";
import { applyVisibility, ThumbnailRequests, thumbnailView, type ThumbnailState } from "./thumbnails";

const row = (path: string, extra: Partial<CanvasRow> = {}): CanvasRow => ({ path, id: path, width: 1440, frames: [], open: 0, resolved: 0, url: `http://127.0.0.1/${path}`, ...extra });
const rows = [
  row(".doan/canvases/tokens.html", { title: "Design tokens" }),
  row(".doan/canvases/2026-10-checkout-revamp.html", { title: "Checkout revamp (Oct 2026)" }),
  row(".doan/canvases/checkout/cart.html", { title: "Cart" }),
  row(".doan/canvases/settings/team/members.html", { title: "Team members" }),
  row(".doan/canvases/settings/billing.html", { title: "Billing & plans" }),
];

test("thumbnail view: missing width beats capture state; missing id does not", () => {
  const { id: _id, ...withoutId } = row(".doan/canvases/a.html");
  const { width: _width, ...noWidth } = row(".doan/canvases/a.html");
  expect(thumbnailView(withoutId, { kind: "ready", url: "blob:x" })).toEqual({ kind: "ready", url: "blob:x" });
  expect(thumbnailView(noWidth, { kind: "failed" })).toEqual({ kind: "noWidth" });
  expect(thumbnailView(row(".doan/canvases/a.html", { error: { code: "unreadable_canvas", message: "Cannot read" } }), undefined)).toEqual({ kind: "unreadable" });
  expect(thumbnailView(row(".doan/canvases/a.html"), undefined)).toEqual({ kind: "pending" });
  expect(thumbnailView(row(".doan/canvases/a.html"), { kind: "failed" })).toEqual({ kind: "failed" });
  expect(thumbnailView(row(".doan/canvases/a.html"), { kind: "ready", url: "blob:x" })).toEqual({ kind: "ready", url: "blob:x" });
});

test("visibility changes report a new set only when it changed", () => {
  const visible = applyVisibility(new Set(), [{ path: "a", visible: true }, { path: "b", visible: true }]);
  expect(visible && [...visible]).toEqual(["a", "b"]);
  expect(applyVisibility(new Set(["a", "b"]), [{ path: "a", visible: true }, { path: "c", visible: false }])).toBeNull();
  const after = applyVisibility(new Set(["a", "b"]), [{ path: "a", visible: false }]);
  expect(after && [...after]).toEqual(["b"]);
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
  const { id: _id, ...missingID } = row(".doan/canvases/no-id.html", { frames: [{ id: "known" }] });
  const { width: _width, ...noWidth } = row(".doan/canvases/no-width.html");
  h.thumbs.setRows([missingID, noWidth]);
  h.thumbs.onVisible([missingID.path, noWidth.path]);
  h.thumbs.changed(noWidth.path);
  expect(h.asks.map(ask => ask.path)).toEqual([missingID.path]);
  h.thumbs.dispose();
});

