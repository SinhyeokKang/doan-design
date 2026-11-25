import { describe, expect, test } from "vitest";
import type { CanvasRow } from "../main/view";
import { bannerWatchKey, cardBanners, watchBanners } from "./ConversationThread";
import type { ThreadItem } from "./threadItems";

// The thread reports which card banners are on screen, so the root's shared requests ask for their images. A canvas a
// later turn draws again gets a second card with the same path; its banner must be watched too.
const X = { path: ".doan/canvases/x.html", id: "x" }, Y = { path: ".doan/canvases/y.html", id: "y" };
const ROWS: CanvasRow[] = [{ ...X, url: "", width: 390 }, { ...Y, url: "", width: 390 }];
const card = (key: string, canvas = X): ThreadItem => ({ kind: "canvasCard", key, canvas, drawing: false, drawn: true });
const listed = () => true;

describe("cardBanners", () => {
  test("names each card's banner, so a later card for a canvas already shown changes what is watched", () => {
    const one = cardBanners([card("ct1:x")], ROWS, listed);
    const two = cardBanners([card("ct1:x"), card("ct3:x")], ROWS, listed);
    expect(one.map(banner => banner.key)).toEqual(["ct1:x"]);
    expect(two.map(banner => [banner.key, banner.row.path])).toEqual([["ct1:x", X.path], ["ct3:x", X.path]]);
  });
  test("a handoff card's canvas source has a banner; an Overview source and a gone canvas have none", () => {
    const handoff = (key: string, canvas?: typeof X): ThreadItem => ({ kind: "handoffCard", key, seq: 1, origin: { kind: "handoff", conversationId: "c0", ...(canvas ? { canvas } : {}) }, text: "x", at: "2026-11-25T05:00:00.000Z" });
    expect(cardBanners([handoff("u1", Y), handoff("u2")], ROWS, listed).map(banner => banner.key)).toEqual(["u1"]);
    expect(cardBanners([card("ct1:x")], ROWS, () => false)).toEqual([]);
  });
});

// The watcher starts over whenever this key changes: a new card, or a renamed canvas whose card (same key, same ID) now
// carries another path, which the observer would otherwise never report.
describe("bannerWatchKey", () => {
  test("changes for a later card of the same canvas and for a renamed canvas", () => {
    const before = bannerWatchKey(cardBanners([card("ct1:x")], ROWS, listed));
    expect(bannerWatchKey(cardBanners([card("ct1:x"), card("ct3:x")], ROWS, listed))).not.toBe(before);
    const renamed: CanvasRow[] = [{ path: ".doan/canvases/x-v2.html", id: "x", url: "", width: 390 }];
    expect(bannerWatchKey(cardBanners([card("ct1:x")], renamed, listed))).not.toBe(before);
    expect(bannerWatchKey(cardBanners([card("ct1:x")], ROWS, listed))).toBe(before);
  });
});

// A stand-in IntersectionObserver: the test delivers the changes.
class FakeObserver {
  static last: FakeObserver | null = null;
  observed: Element[] = [];
  disconnected = false;
  constructor(readonly callback: (changes: { target: Element; isIntersecting: boolean }[]) => void) { FakeObserver.last = this; }
  observe(target: Element) { this.observed.push(target); }
  disconnect() { this.disconnected = true; }
}
const banner = (path: string) => ({ dataset: { path } }) as unknown as HTMLElement;

describe("watchBanners", () => {
  test("watches every banner and reports a path while any of its banners shows", () => {
    const older = banner(X.path), newer = banner(X.path), other = banner(Y.path);
    const field = { querySelectorAll: () => [older, newer, other] } as unknown as HTMLElement;
    const reports: string[][] = [];
    const stop = watchBanners(field, paths => reports.push([...paths].sort()), FakeObserver as unknown as typeof IntersectionObserver);
    const observer = FakeObserver.last!;
    expect(observer.observed).toEqual([older, newer, other]);
    // The newer card is off screen while the older one shows: x is still visible.
    observer.callback([{ target: older, isIntersecting: true }, { target: newer, isIntersecting: false }, { target: other, isIntersecting: false }]);
    expect(reports.at(-1)).toEqual([X.path]);
    observer.callback([{ target: older, isIntersecting: false }, { target: newer, isIntersecting: true }]);
    // Still x alone: nothing new to report.
    expect(reports).toHaveLength(1);
    observer.callback([{ target: newer, isIntersecting: false }, { target: other, isIntersecting: true }]);
    expect(reports.at(-1)).toEqual([Y.path]);
    stop();
    expect(observer.disconnected).toBe(true);
    expect(reports.at(-1)).toEqual([]);
  });
});
