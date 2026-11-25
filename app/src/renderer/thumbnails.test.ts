import { afterEach, expect, test, vi } from "vitest";
import type { ThumbnailReply } from "../main/thumbnails";
import type { CanvasRow } from "../main/view";
import { applyVisibility, LEAVE_MS, ThumbnailHub, ThumbnailRequests, thumbnailView, type ThumbnailCalls, type ThumbnailState } from "./thumbnails";

const row = (path: string, extra: Partial<CanvasRow> = {}): CanvasRow => ({ path, id: path, width: 1440, frames: [], url: `http://127.0.0.1/${path}`, ...extra });
const rows = [
  row(".doan/canvases/tokens.html", {}),
  row(".doan/canvases/2026-10-checkout-revamp.html", {}),
  row(".doan/canvases/checkout/cart.html", {}),
  row(".doan/canvases/settings/team/members.html", {}),
  row(".doan/canvases/settings/billing.html", {}),
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

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

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

// A rejected request is a failure like a failed reply, so the row reads "Preview unavailable", not "Preview loading".
test("thumbnails: a rejected request leaves the card failed, not pending", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let shown: ReadonlyMap<string, ThumbnailState> = new Map();
  const thumbs = new ThumbnailRequests("/code/acme-web", () => Promise.reject(new Error("ipc")), items => { shown = items; }, () => {});
  const a = rows[0]!;
  thumbs.setRows([a]);
  thumbs.onVisible([a.path]);
  await vi.waitFor(() => expect(shown.get(a.path)).toEqual({ kind: "failed" }));
  expect(thumbnailView(a, shown.get(a.path))).toEqual({ kind: "failed" });
});

// An image stays while any viewer lists its canvas.
test("thumbnails: a canvas another viewer still lists keeps its image", async () => {
  const h = requests();
  const [a, b] = [rows[0]!, rows[1]!];
  h.thumbs.setRows([a, b], "overview");
  h.thumbs.setRows([a], "panel");
  h.thumbs.onVisible([a.path], "panel");
  await h.asks.find(ask => ask.path === a.path)!.reply(h.ready);
  h.thumbs.setRows([], "panel");
  expect(h.revoked).not.toHaveBeenCalled();
  expect(h.shown().get(a.path)).toEqual({ kind: "ready", url: "blob:1" });
  h.thumbs.setRows([a], "panel");
  h.thumbs.release("overview");
  expect(h.revoked).not.toHaveBeenCalled();
  expect(h.shown().get(a.path)).toEqual({ kind: "ready", url: "blob:1" });
  expect(h.shown().has(b.path)).toBe(false);
  h.thumbs.release("panel");
  expect(h.revoked).toHaveBeenCalledExactlyOnceWith("blob:1");
  expect(h.shown().has(a.path)).toBe(false);
});

function hub() {
  // A root no viewer holds is disposed LEAVE_MS later.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const asks: { root: string; path: string; visible: boolean; reply: (reply: ThumbnailReply) => Promise<void> }[] = [];
  const visibility: [string, string, boolean][] = [];
  const listeners = new Set<(target: { root: string; path: string }) => void>();
  let urls = 0;
  const created = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${++urls}`);
  const revoked = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const calls: ThumbnailCalls = {
    getThumbnail: (root, path, visible) => new Promise(resolve => { asks.push({ root, path, visible, reply: async reply => { resolve(reply); await Promise.resolve(); } }); }),
    setThumbnailVisibility: async (root, path, visible) => { visibility.push([root, path, visible]); },
    onThumbnailChanged: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const ready: ThumbnailReply = { kind: "ready", png: new Uint8Array([1]) };
  return { hub: new ThumbnailHub(calls), asks, visibility, listeners, created, revoked, ready };
}

test("thumbnail hub: viewers of one root share its images, and a late viewer starts with them", async () => {
  const h = hub();
  const a = rows[0]!;
  let overview: ReadonlyMap<string, ThumbnailState> = new Map();
  let panel: ReadonlyMap<string, ThumbnailState> = new Map();
  const first = h.hub.acquire("/code/acme-web", items => { overview = items; });
  first.setRows([a]);
  first.onVisible([a.path]);
  await h.asks[0]!.reply(h.ready);
  const second = h.hub.acquire("/code/acme-web", items => { panel = items; });
  expect(panel.get(a.path)).toEqual({ kind: "ready", url: "blob:1" });
  second.setRows([a]);
  second.onVisible([a.path]);
  expect(h.asks).toHaveLength(1);
  expect(h.listeners.size).toBe(1);
  second.release();
  expect(h.revoked).not.toHaveBeenCalled();
  expect(overview.get(a.path)).toEqual({ kind: "ready", url: "blob:1" });
  first.release();
  vi.advanceTimersByTime(LEAVE_MS);
  expect(h.revoked).toHaveBeenCalledExactlyOnceWith("blob:1");
  expect(h.listeners.size).toBe(0);
});

test("thumbnail hub: one viewer leaving the screen leaves another viewer's visibility alone", () => {
  const h = hub();
  const a = rows[0]!;
  const first = h.hub.acquire("/code/acme-web", () => {});
  const second = h.hub.acquire("/code/acme-web", () => {});
  first.setRows([a]); second.setRows([a]);
  first.onVisible([a.path]);
  second.onVisible([a.path]);
  first.onVisible([]);
  expect(h.visibility).toEqual([]);
  second.release();
  expect(h.visibility).toEqual([["/code/acme-web", a.path, false]]);
  first.release();
});

test("thumbnail hub: each root has its own requests, and a change reaches only its root's", async () => {
  const h = hub();
  const a = rows[0]!;
  const seen = new Map<string, ReadonlyMap<string, ThumbnailState>>();
  const one = h.hub.acquire("/code/one", items => seen.set("one", items));
  const two = h.hub.acquire("/code/two", items => seen.set("two", items));
  one.setRows([a]); two.setRows([a]);
  one.onVisible([a.path]); two.onVisible([a.path]);
  expect(h.asks.map(ask => ask.root)).toEqual(["/code/one", "/code/two"]);
  for (const listener of h.listeners) listener({ root: "/code/two", path: a.path });
  expect(h.asks.map(ask => ask.root)).toEqual(["/code/one", "/code/two", "/code/two"]);
  await h.asks[0]!.reply(h.ready);
  expect(seen.get("one")?.get(a.path)).toEqual({ kind: "ready", url: "blob:1" });
  expect(seen.get("two")?.get(a.path)).toBeUndefined();
  one.release();
  vi.advanceTimersByTime(LEAVE_MS);
  expect(h.revoked).toHaveBeenCalledExactlyOnceWith("blob:1");
  two.release();
  vi.advanceTimersByTime(LEAVE_MS);
  expect(h.listeners.size).toBe(0);
});

test("thumbnail hub: a released viewer's late calls do nothing", async () => {
  const h = hub();
  const a = rows[0]!;
  const seen: ReadonlyMap<string, ThumbnailState>[] = [];
  const lease = h.hub.acquire("/code/acme-web", items => seen.push(items));
  lease.setRows([a]);
  lease.release();
  const before = seen.length;
  lease.setRows([a]);
  lease.onVisible([a.path]);
  lease.release();
  expect(h.asks).toEqual([]);
  expect(seen).toHaveLength(before);
});

// A thread remounts per conversation and the next viewer takes the root only after the history read, so
// images and visibility marks carry over.
test("thumbnail hub: a root left and taken again within LEAVE_MS keeps its images and its visibility", async () => {
  const h = hub();
  const a = rows[0]!;
  const first = h.hub.acquire("/code/acme-web", () => {});
  first.setRows([a]);
  first.onVisible([a.path]);
  await h.asks[0]!.reply(h.ready);
  first.release();
  // The next conversation's history is read meanwhile.
  await Promise.resolve();
  vi.advanceTimersByTime(LEAVE_MS - 1);
  let seen: ReadonlyMap<string, ThumbnailState> = new Map();
  const next = h.hub.acquire("/code/acme-web", items => { seen = items; });
  expect(seen.get(a.path)).toEqual({ kind: "ready", url: "blob:1" });
  next.setRows([a]);
  next.onVisible([a.path]);
  vi.advanceTimersByTime(LEAVE_MS);
  expect(h.revoked).not.toHaveBeenCalled();
  expect(h.visibility).toEqual([]);
  expect(h.asks).toHaveLength(1);
  expect(h.listeners.size).toBe(1);
  next.release();
  vi.advanceTimersByTime(LEAVE_MS);
  expect(h.revoked).toHaveBeenCalledExactlyOnceWith("blob:1");
  expect(h.visibility).toEqual([["/code/acme-web", a.path, false]]);
  expect(h.listeners.size).toBe(0);
});

test("thumbnail hub: a root left and not taken again is disposed after LEAVE_MS", async () => {
  const h = hub();
  const a = rows[0]!;
  const lease = h.hub.acquire("/code/acme-web", () => {});
  lease.setRows([a]);
  lease.onVisible([a.path]);
  await h.asks[0]!.reply(h.ready);
  lease.release();
  vi.advanceTimersByTime(LEAVE_MS - 1);
  expect(h.revoked).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(h.revoked).toHaveBeenCalledExactlyOnceWith("blob:1");
  expect(h.visibility).toEqual([["/code/acme-web", a.path, false]]);
  expect(h.listeners.size).toBe(0);
  // A later viewer starts afresh.
  const again = h.hub.acquire("/code/acme-web", () => {});
  again.setRows([a]);
  again.onVisible([a.path]);
  expect(h.asks).toHaveLength(2);
  again.release();
});

// A viewer's first render draws from the root's images at once, so a remounted thread never draws its banners empty.
test("thumbnail hub: a root's images can be read before acquiring, and a root not held reads as none", async () => {
  const h = hub();
  const a = rows[0]!;
  expect(h.hub.items("/code/acme-web").size).toBe(0);
  const lease = h.hub.acquire("/code/acme-web", () => {});
  lease.setRows([a]);
  lease.onVisible([a.path]);
  await h.asks[0]!.reply(h.ready);
  expect(h.hub.items("/code/acme-web").get(a.path)).toEqual({ kind: "ready", url: "blob:1" });
  lease.release();
  // The image is still held while the root waits for the viewer that takes its place.
  expect(h.hub.items("/code/acme-web").get(a.path)).toEqual({ kind: "ready", url: "blob:1" });
  vi.advanceTimersByTime(LEAVE_MS);
  expect(h.hub.items("/code/acme-web").size).toBe(0);
});
