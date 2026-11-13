import { describe, expect, test } from "vitest";
import type { PrototypePhase } from "../../main/prototype/ipc";
import { currentRun, forwardedMessage, layersForSnapshot, layersForView, NO_LAYERS, type HostLayers } from "./host";

const A = "http://127.0.0.1:4000/t/k/a/.doan/canvases/a.html", B = "http://127.0.0.1:4000/t/k/a/.doan/canvases/b.html";
const at = (gen: number, phase: PrototypePhase, url: string | null = A, markWidth = 390, markHeight = 844) => ({ gen, phase, run: url === null ? null : { url, markWidth, markHeight }, previousStopped: false });
const rf = (gen: number, url = A, markWidth = 390, markHeight = 844) => ({ gen, url, markWidth, markHeight });
const BOX = { x: 0, y: 28, width: 344, height: 744 };
const still = (gen: number, url: string, box = BOX) => ({ gen, url, box });
const after = (...views: ReturnType<typeof at>[]) => views.reduce<HostLayers>(layersForView, NO_LAYERS);

describe("layersForView", () => {
  test("a first load mounts a hidden iframe, which takes the screen once ready", () => {
    const loading = after(at(1, "loading"));
    expect(loading).toEqual({ frames: [rf(1, A)], visible: null, snapshot: null });
    expect(layersForView(loading, at(1, "ready"))).toEqual({ frames: [rf(1, A)], visible: 1, snapshot: null });
  });

  test("every new gen gets a new iframe, also for the same url (reload, Retry, restore)", () => {
    const layers = after(at(1, "loading"), at(1, "ready"), at(2, "loading"));
    expect(layers.frames.map(frame => frame.gen)).toEqual([1, 2]);
    // The previous screen stays visible above the loading run.
    expect(layers.visible).toBe(1);
    expect(layersForView(layers, at(2, "ready"))).toEqual({ frames: [rf(2, A)], visible: 2, snapshot: null });
  });

  test("A loading, then B: only the newest run is kept once it is ready", () => {
    const layers = after(at(1, "loading"), at(2, "loading", B), at(2, "ready", B));
    expect(layers).toEqual({ frames: [rf(2, B)], visible: 2, snapshot: null });
  });

  test("a failed or lost state removes every iframe, which stops the runs, and shows the still image in their place", () => {
    for (const phase of ["init-failed", "frame-unavailable", "prototype-unavailable", "read-failed"] as const) {
      // Main captured the ready run as it left for the reload, before the loading view.
      const reloading = layersForSnapshot(after(at(1, "loading"), at(1, "ready")), still(2, "blob:1"), 1);
      const loading = layersForView(reloading, at(2, "loading"));
      // While loading, the previous run stays on screen and live.
      expect(loading.visible, phase).toBe(1);
      expect(layersForView(loading, at(2, phase)), phase).toEqual({ frames: [], visible: null, snapshot: still(2, "blob:1") });
    }
  });

  test("a killed loading run takes the previous run with it: older iframes go and the re-sent image shows while the new run loads", () => {
    // A ready, B loads (main captured A), B hangs, then Reload: main kills B and re-sends the image under gen 3.
    const hung = layersForView(layersForSnapshot(after(at(1, "loading"), at(1, "ready")), still(2, "blob:a"), 1), at(2, "loading"));
    expect(hung.visible).toBe(1);
    const resent = layersForSnapshot(hung, still(3, "blob:a3"), 2);
    const reloading = layersForView(resent, { ...at(3, "loading"), previousStopped: true });
    expect(reloading).toEqual({ frames: [rf(3, A)], visible: null, snapshot: still(3, "blob:a3") });
    // The same view again changes nothing; the new run takes the screen once ready.
    expect(layersForView(reloading, { ...at(3, "loading"), previousStopped: true })).toBe(reloading);
    expect(layersForView(reloading, at(3, "ready"))).toEqual({ frames: [rf(3, A)], visible: 3, snapshot: null });
  });

  test("with nothing re-sent, a stopped previous run leaves an empty panel under the overlay", () => {
    const layers = layersForView(after(at(1, "loading"), at(1, "ready"), at(2, "loading")), { ...at(3, "loading"), previousStopped: true });
    expect(layers).toEqual({ frames: [rf(3, A)], visible: null, snapshot: null });
  });

  test("without previousStopped the previous run stays on screen while the next loads", () => {
    const layers = layersForView(after(at(1, "loading"), at(1, "ready")), { ...at(2, "loading"), previousStopped: false });
    expect(layers.visible).toBe(1);
    expect(layers.frames.map(frame => frame.gen)).toEqual([1, 2]);
  });

  test("a ready run that loses its frame gives way to the still image sent before that view", () => {
    const stilled = layersForSnapshot(after(at(1, "loading"), at(1, "ready")), still(1, "blob:1"), 1);
    expect(stilled.visible).toBe(1);
    expect(layersForView(stilled, at(1, "frame-unavailable"))).toEqual({ frames: [], visible: null, snapshot: still(1, "blob:1") });
  });

  test("a first load that fails in a new window leaves an empty panel", () => {
    expect(after(at(1, "loading"), at(1, "init-failed"))).toEqual(NO_LAYERS);
  });

  test("a failed read of a new gen while a run is on screen removes it too", () => {
    const layers = layersForSnapshot(after(at(1, "loading"), at(1, "ready")), still(2, "blob:1"), 1);
    expect(layersForView(layers, at(2, "read-failed"))).toEqual({ frames: [], visible: null, snapshot: still(2, "blob:1") });
  });

  test("a loading view with no run starts nothing; a closed window drops everything", () => {
    expect(after(at(1, "loading", null))).toEqual(NO_LAYERS);
    expect(layersForView(after(at(1, "loading")), null)).toEqual(NO_LAYERS);
  });
});

describe("layersForSnapshot", () => {
  test("keeps the latest image for the current gen or the next, until a run is ready", () => {
    const layers = after(at(1, "loading"), at(1, "ready"));
    const stilled = layersForSnapshot(layers, still(1, "blob:1"), 1);
    expect(stilled).toEqual({ ...layers, snapshot: still(1, "blob:1") });
    const next = layersForSnapshot(stilled, still(2, "blob:2"), 1);
    expect(next.snapshot).toEqual(still(2, "blob:2"));
    // Retry after a failure: the image stays while the new run loads, then the ready run replaces it.
    const failed = layersForView(next, at(2, "init-failed"));
    const retrying = layersForView(failed, at(3, "loading"));
    expect(retrying.snapshot).toEqual(still(2, "blob:2"));
    expect(layersForView(retrying, at(3, "ready"))).toEqual({ frames: [rf(3, A)], visible: 3, snapshot: null });
  });

  test("drops an image for an older gen, which arrived late", () => {
    const layers = after(at(1, "loading"), at(1, "ready"), at(2, "loading"));
    expect(layersForSnapshot(layers, still(1, "blob:1"), 2)).toBe(layers);
  });
});

describe("each run's own mark", () => {
  test("every iframe keeps the mark of its own run while a run with another mark loads", () => {
    const layers = after(at(1, "loading"), at(1, "ready"), at(2, "loading", B, 820, 1180));
    expect(layers.frames).toEqual([rf(1), rf(2, B, 820, 1180)]);
    expect(layersForView(layers, at(2, "ready", B, 820, 1180)).frames).toEqual([rf(2, B, 820, 1180)]);
  });

  test("the run's ready size replaces the mark it started with, a zero mark too", () => {
    const unknown = after(at(1, "loading", A, 0, 0));
    expect(unknown.frames).toEqual([rf(1, A, 0, 0)]);
    expect(layersForView(unknown, at(1, "ready", A, 390, 844)).frames).toEqual([rf(1)]);
    // While gen 2 loads, gen 1 stays at its own mark whatever gen 2 reports.
    const two = after(at(1, "loading"), at(1, "ready"), at(2, "loading", B, 0, 0), at(2, "loading", B, 820, 1180));
    expect(two.frames).toEqual([rf(1), rf(2, B, 820, 1180)]);
  });
});

describe("the still's box", () => {
  test("is kept as main sent it through every later view of its gen and the next run's loading", () => {
    const box = { x: 23, y: 0, width: 344, height: 744 };
    const shown = layersForSnapshot(after(at(1, "loading"), at(1, "ready")), still(1, "blob:1", box), 1);
    const lost = layersForView(shown, at(1, "frame-unavailable"));
    expect(lost.snapshot).toEqual(still(1, "blob:1", box));
    expect(layersForView(lost, at(1, "frame-unavailable", A, 820, 1180)).snapshot).toEqual(still(1, "blob:1", box));
    expect(layersForView(lost, at(2, "loading")).snapshot).toEqual(still(1, "blob:1", box));
  });
});

describe("currentRun", () => {
  test("is the newest iframe while it is the view's gen", () => {
    const layers = after(at(1, "loading"), at(1, "ready"), at(2, "loading"));
    expect(currentRun(layers, 2)).toEqual(rf(2, A));
    expect(currentRun(layers, 1)).toBeNull();
    expect(currentRun(NO_LAYERS, 1)).toBeNull();
  });
});

describe("forwardedMessage", () => {
  const own = {}, other = {};
  const run = { gen: 3, window: own };
  const event = (data: unknown, over: Record<string, unknown> = {}) => ({ source: own, origin: "null", data, ...over });

  test("forwards a result and a frame list from the current iframe at the opaque origin for the current gen", () => {
    const ready = { gen: 3, state: "ready", size: "390x844", frames: [] };
    expect(forwardedMessage(event(ready), run)).toEqual({ kind: "result", message: ready });
    const list = { gen: 3, frames: [{ id: "a", size: "1x1" }] };
    expect(forwardedMessage(event(list), run)).toEqual({ kind: "frames", message: list });
  });

  test("drops another window's, another origin's, an old gen's or a non-object message", () => {
    const ready = { gen: 3, state: "ready", size: "390x844", frames: [] };
    expect(forwardedMessage(event(ready, { source: other }), run)).toBeNull();
    expect(forwardedMessage(event(ready, { source: null }), run)).toBeNull();
    expect(forwardedMessage(event(ready, { origin: "http://127.0.0.1:4000" }), run)).toBeNull();
    expect(forwardedMessage(event({ ...ready, gen: 2 }), run)).toBeNull();
    for (const data of [null, "ready", [3], 3]) expect(forwardedMessage(event(data), run)).toBeNull();
    expect(forwardedMessage(event(ready), null)).toBeNull();
  });
});
