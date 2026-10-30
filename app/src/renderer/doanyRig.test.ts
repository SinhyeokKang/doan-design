import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import type { Pose } from "./doanyMotion";
import { createDoanyRig, type DoanyRig } from "./doanyRig";

// The same fixture as doanyMotion.test.ts, from the original mascot.js: here the whole shell flow
// (frames, textures, resize, events) is replayed through the rig and every draw must match.
type Snapshot = (number | boolean | string)[];
interface Step {
  op: string; now?: number; fail?: boolean; isIntersecting?: boolean; hidden?: boolean;
  clientX?: number; clientY?: number; rect?: { x: number; y: number; width: number; height: number };
  key?: string; prevented?: boolean; matches?: boolean; width?: number; dpr?: number;
  draws?: { u: number[]; mode: string }[]; states?: string[]; random?: number[]; after: Snapshot | null; canvas: number; view: [boolean, boolean];
}
interface Scenario { name: string; options: { reduced?: boolean; dpr?: number; width?: number; noContext?: boolean; compileFails?: boolean; random?: number[] }; log: Step[] }
const golden = JSON.parse(readFileSync(new URL("./doany.golden.json", import.meta.url), "utf8")) as { scenarios: Scenario[] };

const uniforms = (p: Pose) => [p.time, p.squash, p.lift, p.tilt, p.hatTilt, p.energy, p.eyeOpen, p.look[0], p.look[1]];
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(options: { reduced?: boolean; dpr?: number; width?: number; random?: number[] } = {}) {
  const calls: string[] = [];
  let tick: ((now: number) => void) | null = null;
  let lost: (() => void) | null = null;
  let settle!: { resolve: (value: unknown) => void; reject: (error: unknown) => void };
  const textures = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  const step = { draws: [] as { u: number[]; mode: string }[], states: [] as string[], random: [] as number[] };
  const randoms = [...options.random ?? []];
  const world = {
    reduced: options.reduced ?? false, contextLost: false, shown: true, documentHidden: false, width: options.width ?? 114, dpr: options.dpr ?? 1,
    rect: { x: 100, y: 200, width: 114, height: 114 }, canvas: 300, view: [false, true] as [boolean, boolean], ticks: 0,
  };
  const rig = createDoanyRig({
    target: {
      draw: pose => { calls.push("draw"); step.draws.push({ u: uniforms(pose), mode: pose.mode }); },
      resize: size => { calls.push(`resize ${size}`); world.canvas = size; },
      isContextLost: () => world.contextLost,
      onLost: listener => { lost = listener; return () => { calls.push("off lost"); lost = null; }; },
      release: () => { calls.push("release"); lost?.(); },
    },
    textures,
    view: {
      width: () => world.width, rect: () => ({ ...world.rect }), dpr: () => world.dpr, shown: () => world.shown, documentHidden: () => world.documentHidden,
      setState: state => { calls.push(`state ${state}`); step.states.push(state); },
      showCanvas: () => { world.view = [true, false]; }, showStatic: () => { world.view = [false, true]; },
    },
    frames: { request: callback => { tick = callback; return ++world.ticks; }, cancel: id => { calls.push(`cancel ${id}`); if (id === world.ticks) tick = null; } },
    reduced: () => world.reduced,
    random: () => { const value = randoms.length ? randoms.shift()! : 0.5; step.random.push(value); return value; },
    connect: () => () => { calls.push("disconnect"); },
  });
  return {
    rig, world, calls, step, settle,
    frame(now: number) { const run = tick!; tick = null; run(now); },
    pending: () => tick !== null,
    loseContext() { world.contextLost = true; lost?.(); },
    take() { const taken = { draws: [...step.draws], states: [...step.states], random: [...step.random] }; step.draws.length = 0; step.states.length = 0; step.random.length = 0; return taken; },
  };
}

afterEach(() => { vi.restoreAllMocks(); });

for (const { name, options, log } of golden.scenarios.filter(item => !item.options.noContext && !item.options.compileFails)) {
  test(`${name}: the rig draws what the original drew, in the same order`, async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const h = harness(options);
    const rig: DoanyRig = h.rig;
    for (const [index, step] of log.entries()) {
      const where = `${name} step ${index} (${step.op})`;
      if (step.op === "frame") h.frame(step.now!);
      if (step.op === "textures") { if (step.fail) h.settle.reject(new Error("Could not load body.png")); else h.settle.resolve([]); await flush(); }
      if (step.op === "resize") { h.world.width = step.width!; h.world.dpr = step.dpr!; rig.resize(); }
      if (step.op === "intersect") rig.intersect(step.isIntersecting!);
      if (step.op === "documentHidden") h.world.documentHidden = step.hidden!;
      if (step.op === "pointer") { h.world.rect = step.rect!; rig.pointer(step.clientX!, step.clientY!); }
      if (step.op === "input") rig.typing();
      if (step.op === "click") rig.hop();
      if (step.op === "key") expect(rig.key(step.key!), where).toBe(step.prevented);
      if (step.op === "reduced") { h.world.reduced = step.matches!; rig.reducedChange(); }
      if (step.op === "reducedSilent") h.world.reduced = step.matches!;
      if (step.op === "contextLost") h.loseContext();
      const taken = h.take();
      expect(taken.draws, where).toEqual((step.draws ?? []).map(({ u, mode }) => ({ u, mode })));
      expect(taken.states, where).toEqual(step.states ?? []);
      expect(taken.random, where).toEqual(step.random ?? []);
      expect(h.world.canvas, where).toBe(step.canvas);
      expect(h.world.view, where).toEqual(step.view);
      expect(h.pending(), where).toBe(true);
    }
  });
}

test("nothing draws before the textures are ready", async () => {
  const h = harness();
  for (let now = 1000; now < 2000; now += 20) h.frame(now);
  h.rig.resize(); h.rig.hop(); h.rig.reducedChange();
  expect(h.take().draws).toEqual([]);
  h.settle.resolve([]); await flush();
  expect(h.take().draws).toHaveLength(1);
});

test("a texture failure shows the still image as static", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const h = harness();
  h.settle.reject(new Error("Could not load hat.png")); await flush();
  expect(h.take().states).toEqual(["static"]);
  expect(h.world.view).toEqual([false, true]);
});

test("textures that settle after dispose are ignored", async () => {
  const loaded = harness();
  loaded.rig.dispose(); loaded.settle.resolve([]); await flush();
  expect(loaded.calls).not.toContain("draw");
  expect(loaded.world.view).toEqual([false, true]);
  const failed = harness();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  failed.rig.dispose(); failed.settle.reject(new Error("late")); await flush();
  expect(failed.take().states).toEqual([]);
  expect(error).not.toHaveBeenCalled();
});

test.each([
  ["not intersecting", (h: ReturnType<typeof harness>) => h.rig.intersect(false), (h: ReturnType<typeof harness>) => h.rig.intersect(true)],
  ["hidden by visibility", (h: ReturnType<typeof harness>) => { h.world.shown = false; }, (h: ReturnType<typeof harness>) => { h.world.shown = true; }],
  ["document hidden", (h: ReturnType<typeof harness>) => { h.world.documentHidden = true; }, (h: ReturnType<typeof harness>) => { h.world.documentHidden = false; }],
])("time stops while %s and frames keep their timestamps", async (_name, hide, show) => {
  const h = harness();
  h.settle.resolve([]); await flush();
  h.frame(1000); h.frame(1020);
  const before = h.take().draws.at(-1)!.u[0]!;
  hide(h);
  for (let now = 1040; now <= 3000; now += 20) h.frame(now);
  expect(h.take().draws).toEqual([]);
  show(h);
  h.frame(3020);
  // The previous frame was 20 ms ago, so the first visible frame advances 0.02, not the 0.035 cap.
  expect(h.take().draws[0]!.u[0]).toBe(before + 0.02);
});

test("the first frame after a long gap is capped at 0.035", async () => {
  const h = harness();
  h.settle.resolve([]); await flush();
  h.frame(1000);
  const before = h.take().draws.at(-1)!.u[0]!;
  h.frame(9000);
  expect(h.take().draws[0]!.u[0]).toBe(before + 0.035);
});

test("a reduced-motion change resets the beret and draws the still pose", async () => {
  const h = harness();
  h.settle.resolve([]); await flush();
  for (let now = 1000; now <= 1400; now += 20) h.frame(now);
  h.rig.hop(); h.frame(1420); h.take();
  h.world.reduced = true; h.rig.reducedChange();
  expect(h.take()).toMatchObject({ draws: [{ u: [0, 0, 0, 0, 0, 0, 1, 0, 0], mode: "reduced-motion" }], states: ["reduced-motion"] });
  h.world.reduced = false; h.rig.reducedChange();
  expect(h.take().draws[0]!.u[4]).toBe(0); // hatTilt starts again from rest
});

test("resize sets the canvas size and draws again", async () => {
  const h = harness({ dpr: 2 });
  h.settle.resolve([]); await flush(); h.take();
  h.world.width = 143; h.rig.resize();
  expect(h.world.canvas).toBe(286);
  expect(h.take().draws).toHaveLength(1);
});

test("a lost context shows the still image as static and stops drawing", async () => {
  const h = harness();
  h.settle.resolve([]); await flush(); h.take();
  h.loseContext();
  expect(h.take().states).toEqual(["static"]);
  expect(h.world.view).toEqual([false, true]);
  h.frame(1000); h.rig.resize();
  expect(h.take()).toEqual({ draws: [], states: [], random: [] });
});

test("dispose removes the lost listener, then the frame, then listeners, then releases the context", async () => {
  const h = harness();
  h.settle.resolve([]); await flush();
  h.frame(1000); h.frame(1020);
  h.calls.length = 0; h.take();
  h.rig.dispose();
  expect(h.calls).toEqual(["off lost", "cancel 3", "disconnect", "release"]);
  // release() would report the loss; the listener is already gone, so nothing records static.
  expect(h.take().states).toEqual([]);
  expect(h.pending()).toBe(false);
});

test("Enter and Space hop and ask for preventDefault; other keys do neither", async () => {
  const h = harness();
  h.settle.resolve([]); await flush();
  expect([h.rig.key("Enter"), h.rig.key(" "), h.rig.key("a"), h.rig.key("Tab")]).toEqual([true, true, false, false]);
});
