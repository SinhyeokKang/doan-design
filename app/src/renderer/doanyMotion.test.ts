import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { advance, canvasSize, hop, hopLift, initialState, pointer, pose, reducedChanged, typing, type MotionState, type Pose } from "./doanyMotion";

// Expected values come from running the buddy draft .doan/assets/buddies/motion-preview.js in a node vm
// (app/scripts/doanyGolden.mjs), never from the port: the port must reproduce the draft bit for bit.
type Snapshot = (number | boolean | string)[];
interface Step {
  op: string; now?: number; gate?: { ready: boolean; visible: boolean; hidden: boolean; reduced: boolean };
  clientX?: number; clientY?: number; rect?: { x: number; y: number; width: number; height: number };
  key?: string; matches?: boolean; width?: number; dpr?: number;
  draws?: { u: number[]; mode: string; state?: Snapshot }[]; random?: number[]; after: Snapshot | null; canvas: number;
}
interface Scenario { name: string; options: { reduced?: boolean }; log: Step[] }
const golden = JSON.parse(readFileSync(new URL("./doany.golden.json", import.meta.url), "utf8")) as { fields: string[]; scenarios: Scenario[] };

// `ready` and `visible` belong to the rig; `mode` is written when a pose is drawn.
const RIG_FIELDS = new Set(["ready", "visible", "mode"]);
function motion(snapshot: Snapshot): Partial<MotionState> {
  return Object.fromEntries(golden.fields.map((field, index) => [field, snapshot[index]]).filter(([field]) => !RIG_FIELDS.has(field as string)));
}
function restore(snapshot: Snapshot): MotionState {
  return { ...initialState(), ...motion(snapshot), mode: snapshot[golden.fields.indexOf("mode")] as MotionState["mode"] };
}
function withoutMode(state: MotionState): Partial<MotionState> {
  const { mode: _mode, ...rest } = state;
  return rest;
}
const uniforms = (p: Pose) => [p.time, p.squash, p.lift, p.tilt, p.hatTilt, p.energy, p.eyeOpen, p.look[0], p.look[1]];
const scenario = (name: string) => golden.scenarios.find(item => item.name === name)!;

for (const { name, options, log } of golden.scenarios) {
  test(`${name}: every state change and drawn pose matches the original`, () => {
    let reduced = options.reduced ?? false;
    let previous: Snapshot | null = null;
    for (const [index, step] of log.entries()) {
      const where = `${name} step ${index} (${step.op})`;
      if (step.after === null) continue; // the original never created a rig
      const state = previous ? restore(previous) : initialState();
      const queue = [...step.random ?? []];
      const random = () => { expect(queue.length, `${where}: random call`).toBeGreaterThan(0); return queue.shift()!; };
      if (step.op === "frame") {
        const { ready, visible, hidden, reduced: still } = step.gate!;
        expect(advance(state, step.now!, ready && visible && !hidden && !still, random), where).toBe(ready && visible && !hidden && !still);
      }
      if (step.op === "pointer") pointer(state, step.clientX!, step.clientY!, step.rect!);
      if (step.op === "input") typing(state);
      if (step.op === "click" || (step.op === "key" && (step.key === "Enter" || step.key === " "))) hop(state, reduced);
      if (step.op === "reduced") { reduced = step.matches!; reducedChanged(state); }
      if (step.op === "reducedSilent") reduced = step.matches!;
      if (step.op === "resize") expect(canvasSize(step.width!, step.dpr!), where).toBe(step.canvas);
      expect(queue, `${where}: unused random values`).toEqual([]);
      expect(withoutMode(state), where).toEqual(motion(step.after));
      for (const draw of step.draws ?? []) {
        const drawn = pose(draw.state ? restore(draw.state) : restore(step.after), reduced);
        expect(uniforms(drawn), where).toEqual(draw.u);
        expect(drawn.mode, where).toBe(draw.mode);
      }
      previous = step.after;
    }
  });
}

test("the first blink comes at 2 s, then after 4 s for random 0 and 8 s for random 1", () => {
  const blinks = scenario("idle").log.filter(step => step.random).map(step => motion(step.after!));
  expect(blinks.map(state => state.blinkAt)).toHaveLength(2);
  expect(blinks[0]!.blinkAt).toBeCloseTo(2, 1);
  expect(blinks[0]!.nextBlink! - blinks[0]!.blinkAt!).toBeCloseTo(4, 9);
  expect(blinks[1]!.blinkAt! - blinks[0]!.blinkAt!).toBeCloseTo(4, 1);
  expect(blinks[1]!.nextBlink! - blinks[1]!.blinkAt!).toBeCloseTo(8, 9);
});

test("in the blink scenario the eyes close for 420 ms, and the next blink is 4 to 8 s away", () => {
  // 17 ms frames: the eyes are below open from the frame after the blink starts to the last one before 0.42 s.
  const steps = scenario("blink").log.filter(step => step.op === "frame").map(step => motion(step.after!));
  const closed = steps.filter(state => state.eye! < 1);
  const start = closed[0]!.blinkAt!, last = closed.at(-1)!.time! - start;
  expect(last).toBeLessThan(.42);
  expect(last).toBeGreaterThan(.42 - .017);
  expect(steps.find(state => state.time! > closed.at(-1)!.time!)!.eye).toBe(1);
  expect(closed.every(state => state.blinkAt === start)).toBe(true);
  const gap = closed[0]!.nextBlink! - start;
  expect(gap).toBeGreaterThanOrEqual(4);
  expect(gap).toBeLessThan(8);
});

test("the hop's lift for the floor shadow runs from 0 to 1 and lands at 0", () => {
  const lifts = scenario("hop").log.flatMap(step => step.draws ?? []).map(draw => draw.u[2]! / .22);
  const state = initialState();
  let now = 1000, peak = 0;
  hop(state, false);
  for (let i = 0; i < 100; i++) { advance(state, now += 20, true, () => .5); const lift = hopLift(pose(state, false)); expect(lift).toBeGreaterThanOrEqual(0); expect(lift).toBeLessThanOrEqual(1); peak = Math.max(peak, lift); }
  expect(peak).toBeGreaterThan(.99);
  expect(hopLift(pose(state, false))).toBe(0);
  expect(hopLift(pose(state, true))).toBe(0);
  expect(Math.max(...lifts)).toBeGreaterThan(.99);
});

test("a closed gate only records the frame time", () => {
  const state = initialState();
  expect(advance(state, 1000, false, () => { throw new Error("no random call"); })).toBe(false);
  expect(state).toEqual({ ...initialState(), last: 1000 });
  advance(state, 6000, true, () => 0.5);
  expect(state.time).toBe(0.035);
});

test("reduced motion draws the resting pose and ignores a hop", () => {
  const state = { ...initialState(), time: 3, hat: 0.2, lookX: 0.5, lookY: -0.3, eye: 0.4, jumpAt: 2.9 };
  expect(pose(state, true)).toEqual({ time: 0, squash: 0, lift: 0, tilt: 0, hatTilt: 0, energy: 0, eyeOpen: 1, look: [0, 0], mode: "reduced-motion" });
  hop(state, true);
  expect(state.jumpAt).toBe(2.9);
});

test("canvas size doubles at most and caps at 1024", () => {
  expect([canvasSize(114, 1), canvasSize(114, 2), canvasSize(114, 3), canvasSize(114, 0), canvasSize(142.5, 1), canvasSize(600, 2)]).toEqual([114, 228, 228, 114, 143, 1024]);
});
