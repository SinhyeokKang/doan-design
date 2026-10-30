import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { advance, canvasSize, hop, initialState, pointer, pose, reducedChanged, typing, type MotionState, type Pose } from "./doanyMotion";

// Expected values come from running the original .doan/assets/doany/motion/mascot.js in a node vm
// (.scratch/doan-mascot/golden.mjs; the regeneration command is in the commit that added this file),
// never from the port: the port must reproduce the draft bit for bit.
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

test("the first blink comes at 2 s, then after 2.5 s for random 0 and 6 s for random 1", () => {
  const blinks = scenario("idle").log.filter(step => step.random).map(step => motion(step.after!).blinkAt);
  expect(blinks[0]).toBeCloseTo(2, 1);
  expect(blinks[1]! - blinks[0]!).toBeCloseTo(2.5, 1);
  expect(blinks[2]! - blinks[1]!).toBeCloseTo(6, 1);
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
