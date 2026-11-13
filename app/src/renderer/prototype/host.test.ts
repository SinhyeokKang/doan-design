import { describe, expect, test } from "vitest";
import type { PrototypePhase } from "../../main/prototype/ipc";
import { currentRun, forwardedMessage, layersForSnapshot, layersForView, NO_LAYERS, type HostLayers } from "./host";

const A = "http://127.0.0.1:4000/t/k/a/.doan/canvases/a.html", B = "http://127.0.0.1:4000/t/k/a/.doan/canvases/b.html";
const at = (gen: number, phase: PrototypePhase, url: string | null = A) => ({ gen, phase, run: url === null ? null : { url } });
const after = (...views: ReturnType<typeof at>[]) => views.reduce<HostLayers>(layersForView, NO_LAYERS);

describe("layersForView", () => {
  test("a first load mounts a hidden iframe, which takes the screen once ready", () => {
    const loading = after(at(1, "loading"));
    expect(loading).toEqual({ frames: [{ gen: 1, url: A }], visible: null, snapshot: null });
    expect(layersForView(loading, at(1, "ready"))).toEqual({ frames: [{ gen: 1, url: A }], visible: 1, snapshot: null });
  });

  test("every new gen gets a new iframe, also for the same url (reload, Retry, restore)", () => {
    const layers = after(at(1, "loading"), at(1, "ready"), at(2, "loading"));
    expect(layers.frames.map(frame => frame.gen)).toEqual([1, 2]);
    // The previous screen stays visible above the loading run.
    expect(layers.visible).toBe(1);
    expect(layersForView(layers, at(2, "ready"))).toEqual({ frames: [{ gen: 2, url: A }], visible: 2, snapshot: null });
  });

  test("A loading, then B: only the newest run is kept once it is ready", () => {
    const layers = after(at(1, "loading"), at(2, "loading", B), at(2, "ready", B));
    expect(layers).toEqual({ frames: [{ gen: 2, url: B }], visible: 2, snapshot: null });
  });

  test("a run that fails or loses its frame before it was ready is removed; the screen before it stays", () => {
    for (const phase of ["init-failed", "frame-unavailable", "prototype-unavailable", "read-failed"] as const) {
      const layers = after(at(1, "loading"), at(1, "ready"), at(2, "loading"), at(2, phase));
      expect(layers, phase).toEqual({ frames: [{ gen: 1, url: A }], visible: 1, snapshot: null });
    }
  });

  test("a ready run that loses its frame stays mounted for main's still image", () => {
    const layers = after(at(1, "loading"), at(1, "ready"));
    expect(layersForView(layers, at(1, "frame-unavailable"))).toBe(layers);
  });

  test("a failed read of a new gen starts no iframe", () => {
    const layers = after(at(1, "loading"), at(1, "ready"));
    expect(layersForView(layers, at(2, "read-failed"))).toBe(layers);
  });

  test("a loading view with no run starts nothing; a closed window drops everything", () => {
    expect(after(at(1, "loading", null))).toEqual(NO_LAYERS);
    expect(layersForView(after(at(1, "loading")), null)).toEqual(NO_LAYERS);
  });
});

describe("layersForSnapshot", () => {
  test("replaces every iframe with the still image of the current gen, and a ready run clears it", () => {
    const layers = after(at(1, "loading"), at(1, "ready"));
    const still = layersForSnapshot(layers, { gen: 1, url: "blob:1" }, 1);
    expect(still).toEqual({ frames: [], visible: null, snapshot: { gen: 1, url: "blob:1" } });
    // A reload keeps the image on screen while it loads, then the run replaces it.
    const reloading = layersForView(still, at(2, "loading"));
    expect(reloading.snapshot).toEqual({ gen: 1, url: "blob:1" });
    expect(layersForView(reloading, at(2, "ready"))).toEqual({ frames: [{ gen: 2, url: A }], visible: 2, snapshot: null });
  });

  test("ignores an image for another gen or before any view", () => {
    const layers = after(at(1, "loading"), at(1, "ready"));
    expect(layersForSnapshot(layers, { gen: 0, url: "blob:0" }, 1)).toBe(layers);
    expect(layersForSnapshot(layers, { gen: 1, url: "blob:1" }, null)).toBe(layers);
  });
});

describe("currentRun", () => {
  test("is the newest iframe while it is the view's gen", () => {
    const layers = after(at(1, "loading"), at(1, "ready"), at(2, "loading"));
    expect(currentRun(layers, 2)).toEqual({ gen: 2, url: A });
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
