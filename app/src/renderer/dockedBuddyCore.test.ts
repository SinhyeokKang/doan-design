import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { BUDDY_IDS, type BuddyId } from "./buddies";
import {
  DROP, FLOAT_WAIT, FLOOR, HIDES, PEEK, REST_SECONDS, SIZE, TRIP_MIN, TRIP_SPREAD, WINDOW,
  advanceDocked, createDockedState, dockedGeometry, xOn,
  type DockedEvent, type DockedFrame, type DockedInputs, type DockedState,
} from "./dockedBuddyCore";

// Expected values come from running the docked buddy draft .doan/assets/buddies/docked-poc.js in a node vm
// (app/scripts/dockedBuddyGolden.mjs), never from the port: the port must reproduce the draft bit for bit. Every
// frame is replayed in order with the random values the draft drew; sampled frames also compare the drawn frame and
// the whole core state.
interface Entry { now: number; inputs?: Omit<DockedInputs, "events">; events?: DockedEvent[]; random?: number[]; out?: unknown; state?: Record<string, unknown> }
interface Scenario { name: string; buddy: BuddyId; created: { random: number[]; state: Record<string, unknown> }; log: Entry[] }
const golden = JSON.parse(readFileSync(new URL("./dockedBuddy.golden.json", import.meta.url), "utf8")) as {
  constants: Record<string, number>; hides: unknown; geometry: Record<BuddyId, unknown>;
  xOn: { state: Pick<DockedState, "surface" | "x" | "slots">; name: "dock" | "tools"; width: number; x: number }[];
  scenarios: Scenario[];
};

// The draft's preview-only Jump control keeps a flag the app has no use for; it is never set in the golden.
const PREVIEW_ONLY = ["requestedJump"];
const plain = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
function draftState(state: Record<string, unknown>) {
  const copy = { ...state };
  for (const key of PREVIEW_ONLY) { expect(copy[key], key).toBe(false); delete copy[key]; }
  return copy;
}
function feed(values: number[], where: string) {
  const queue = [...values];
  return { random: () => { expect(queue.length, `${where}: random call`).toBeGreaterThan(0); return queue.shift()!; }, rest: () => queue };
}

for (const { name, buddy, created, log } of golden.scenarios) {
  test(`${name}: every frame matches the draft`, () => {
    const made = feed(created.random, `${name} create`);
    const state = createDockedState(buddy, made.random);
    expect(made.rest(), `${name} create: unused random values`).toEqual([]);
    expect(plain(state)).toEqual(draftState(created.state));
    let inputs: Omit<DockedInputs, "events"> | undefined;
    for (const [index, entry] of log.entries()) {
      const where = `${name} frame ${index} (${entry.now})`;
      inputs = entry.inputs ?? inputs;
      const drawn = feed(entry.random ?? [], where);
      const out = advanceDocked(state, { ...inputs!, events: entry.events ?? [] }, entry.now, drawn.random);
      expect(drawn.rest(), `${where}: unused random values`).toEqual([]);
      if (entry.out) expect(plain(out), where).toEqual(entry.out);
      if (entry.state) expect(plain(state), where).toEqual(draftState(entry.state));
    }
  });
}

test("constants, hide styles, per-buddy geometry and the standing x match the draft", () => {
  expect({ SIZE, FLOOR, WINDOW, DROP, PEEK, REST_SECONDS, TRIP_MIN, TRIP_SPREAD, FLOAT_WAIT }).toEqual(golden.constants);
  expect(plain(HIDES)).toEqual(golden.hides);
  for (const id of BUDDY_IDS) expect(dockedGeometry(id), id).toEqual(golden.geometry[id]);
  for (const item of golden.xOn) expect(xOn(item.state, item.name, item.width), JSON.stringify(item)).toBe(item.x);
});

// ---- Edge cases beyond the golden: the rules, checked against the port's own behaviour. ----

const DOCK = { present: true, accepts: true, width: 360, floating: false };
const TOOLS = { present: true, width: 300, floating: false };
const CANVAS: DockedInputs = {
  surfaces: { dock: DOCK, tools: TOOLS }, reasons: { queue: false, prompts: false, waiting: false },
  panel: { folded: false, folding: false }, resting: false, visible: true, reduced: false, events: [],
};
const OVERVIEW: DockedInputs = { ...CANVAS, surfaces: { dock: DOCK, tools: null } };
type Patch = Partial<Omit<DockedInputs, "surfaces" | "reasons" | "panel">> & {
  dock?: Partial<typeof DOCK> | null; tools?: Partial<typeof TOOLS> | null;
  reasons?: Partial<DockedInputs["reasons"]>; panel?: Partial<DockedInputs["panel"]>;
};

// A driver: one 33 ms frame per call, random .5 unless a test sets it.
function rig(start: DockedInputs = CANVAS, id: BuddyId = "doany") {
  let random = () => .5;
  const state = createDockedState(id, random);
  let inputs = start, now = 1000, out: DockedFrame | null = null;
  const frames: DockedFrame[] = [];
  return {
    state,
    get out() { return out!; },
    frames,
    set(patch: Patch) {
      const { dock, tools, reasons, panel, ...rest } = patch;
      inputs = {
        ...inputs, ...rest,
        surfaces: {
          dock: dock === undefined ? inputs.surfaces.dock : dock === null ? null : { ...(inputs.surfaces.dock ?? DOCK), ...dock },
          tools: tools === undefined ? inputs.surfaces.tools : tools === null ? null : { ...(inputs.surfaces.tools ?? TOOLS), ...tools },
        },
        reasons: { ...inputs.reasons, ...reasons }, panel: { ...inputs.panel, ...panel },
      };
    },
    random(fn: () => number) { random = fn; },
    step(events: DockedEvent[] = [], gap = 33) {
      now += gap;
      out = advanceDocked(state, { ...inputs, events }, now, random);
      frames.push(out);
      return out;
    },
    run(seconds: number) { const list: DockedFrame[] = []; for (let i = 0; i < Math.round(seconds*1000/33); i++) list.push(this.step()); return list; },
    until(done: (out: DockedFrame) => boolean, seconds = 10) {
      for (let i = 0; i < Math.round(seconds*1000/33); i++) if (done(this.step())) return out!;
      throw new Error(`not reached in ${seconds} s`);
    },
  };
}

test("first mount stands at rest on the current surface without a reveal", () => {
  const r = rig();
  expect(r.step()).toMatchObject({ surface: "dock", presence: "shown", conceal: 0, host: { x: 16, y: 0 } });
  const queued = rig({ ...CANVAS, reasons: { queue: true, prompts: false, waiting: false } });
  expect(queued.step()).toMatchObject({ surface: "tools", presence: "shown", conceal: 0, host: { x: (300 - SIZE)/2, y: 0 } });
});

test("a queue that appears and clears within the hide returns to the same surface at the same x", () => {
  const r = rig();
  r.run(.2);
  const x = r.out.host.x;
  r.set({ reasons: { queue: true } });
  r.run(.2);
  expect(r.out.presence).toBe("hiding");
  r.set({ reasons: { queue: false } });
  r.run(1);
  expect(r.frames.every(frame => frame.surface === "dock")).toBe(true);
  expect(r.out).toMatchObject({ surface: "dock", presence: "shown", conceal: 0 });
  expect(r.out.host.x).toBe(x);
});

test("retargeting while leaving rises from the current concealed fraction", () => {
  const r = rig();
  r.run(.2);
  r.set({ reasons: { queue: true } });
  r.until(out => out.conceal > .3);
  const fraction = r.out.conceal;
  r.set({ reasons: { queue: false } });
  // The rise starts from where the hide stopped, not from fully down.
  const turn = r.step(), next = r.step();
  expect(turn).toMatchObject({ presence: "revealing", conceal: fraction });
  expect(next.conceal).toBeLessThan(fraction);
  expect(next.conceal).toBeGreaterThan(0);
});

test("retargeting while arriving on the toolbar leaves it again for the dock", () => {
  const r = rig();
  r.run(.2);
  r.set({ reasons: { queue: true } });
  r.until(out => out.surface === "tools" && out.presence === "revealing" && out.conceal < 1);
  r.set({ reasons: { queue: false } });
  expect(r.step().presence).toBe("hiding");
  r.until(out => out.surface === "dock" && out.presence === "shown");
});

test("a floating element on the other surface does not hide the buddy", () => {
  const r = rig();
  r.run(.2);
  r.set({ tools: { floating: true } });
  expect(r.run(2).every(frame => frame.surface === "dock" && frame.conceal === 0)).toBe(true);
});

test("a floating element hides the buddy until 1 s after it closes, then it rises without a peek", () => {
  const r = rig();
  r.run(.2);
  r.set({ dock: { floating: true } });
  r.until(out => out.conceal === 1);
  r.run(1);
  expect(r.out.presence).toBe("hidden");
  r.set({ dock: { floating: false } });
  const waited = r.run(FLOAT_WAIT - .05);
  expect(waited.every(frame => frame.conceal === 1)).toBe(true);
  const rising = r.until(out => out.presence === "revealing");
  expect(rising.surface).toBe("dock");
  // A quick rise: 220 ms from fully down straight to the floor, never pausing at the peek depth.
  const rise: DockedFrame[] = [];
  while (r.out.presence === "revealing") rise.push(r.step());
  expect(rise.length * 33).toBeLessThanOrEqual(260);
  expect(rise.every((frame, i) => i === 0 || frame.conceal <= rise[i - 1]!.conceal)).toBe(true);
});

test("priority: a queue that arrives while a floating element closes sends the buddy to the toolbar", () => {
  const r = rig();
  r.run(.2);
  r.set({ dock: { floating: true } });
  r.until(out => out.conceal === 1);
  r.set({ dock: { floating: false } });
  r.run(.5);
  r.set({ reasons: { queue: true } });
  expect(r.until(out => out.presence === "shown").surface).toBe("tools");
});

test("priority: no floor beats a floating element and drops the buddy at once", () => {
  const r = rig();
  r.run(.2);
  r.set({ dock: { floating: true } });
  r.step();
  r.set({ dock: { present: false } });
  expect(r.step().conceal).toBe(1);
});

test("priority: folding and unfolding with a queue keeps the buddy on the toolbar until the queue clears", () => {
  const r = rig();
  r.run(.2);
  r.set({ reasons: { queue: true } });
  r.until(out => out.surface === "tools" && out.presence === "shown");
  r.set({ panel: { folding: true } });
  r.step();
  r.set({ panel: { folding: false, folded: true } });
  r.run(1);
  r.set({ panel: { folded: false } });
  expect(r.run(3).every(frame => frame.surface === "tools" && frame.conceal === 0)).toBe(true);
  r.set({ reasons: { queue: false } });
  expect(r.until(out => out.surface === "dock" && out.presence === "shown").host.x).toBe(16);
});

test("folding hides at once, then the buddy appears on the toolbar; unfolding returns it with the hide choreography", () => {
  const r = rig();
  r.run(.2);
  r.set({ panel: { folding: true } });
  expect(r.step()).toMatchObject({ conceal: 1 });
  r.until(out => out.surface === "tools" && out.presence === "shown");
  r.set({ panel: { folding: false, folded: false } });
  expect(r.step().presence).toBe("hiding");
  r.until(out => out.surface === "dock" && out.presence === "shown");
});

test("a folded panel holds the buddy on the toolbar through a long rest", () => {
  const r = rig({ ...CANVAS, panel: { folded: true, folding: false }, resting: true });
  expect(r.run(130).every(frame => frame.surface === "tools")).toBe(true);
});

test("an unflown hop preparation is cancelled when the buddy leaves", () => {
  const r = rig();
  r.until(out => out.pose.phase === "prepare");
  r.set({ reasons: { queue: true } });
  expect(r.step().pose.phase).toBe("rest");
});

test("an airborne hop finishes before the buddy hides", () => {
  const r = rig();
  r.until(out => out.pose.phase === "air");
  r.set({ reasons: { queue: true } });
  const landing = [r.step()];
  while (landing.at(-1)!.pose.phase !== "rest") landing.push(r.step());
  expect(landing.length).toBeGreaterThan(1);
  expect(landing.slice(0, -1).every(frame => frame.conceal === 0)).toBe(true);
  r.until(out => out.surface === "tools" && out.presence === "shown");
});

test("the first toolbar visit is centred; later visits keep each surface's x", () => {
  const r = rig();
  r.run(.2);
  r.set({ reasons: { queue: true } });
  expect(r.until(out => out.surface === "tools" && out.presence === "revealing").host.x).toBe((300 - SIZE)/2);
  r.until(out => out.presence === "shown");
  r.state.x = 40;
  r.set({ reasons: { queue: false } });
  r.until(out => out.surface === "dock" && out.presence === "shown");
  expect(r.out.slots.tools).toBe(40);
  r.set({ reasons: { queue: true } });
  expect(r.until(out => out.surface === "tools" && out.presence === "revealing").host.x).toBe(40);
});

test("a narrower surface clamps x at once; under 56 px or 0 it has no floor", () => {
  const r = rig();
  r.run(.2);
  r.state.x = 300;
  r.set({ dock: { width: 200 } });
  expect(r.step().host.x).toBe(200 - 52);
  r.set({ dock: { width: SIZE - 1 } });
  expect(r.step().conceal).toBe(1);
  r.set({ dock: { width: 0 } });
  expect(r.until(out => out.presence === "shown").surface).toBe("tools");
});

test("the standing surface disappearing while leaving or arriving drops the buddy at once", () => {
  const leaving = rig();
  leaving.run(.2);
  leaving.set({ reasons: { queue: true } });
  leaving.until(out => out.presence === "hiding" && out.conceal > 0);
  leaving.set({ dock: { present: false } });
  expect(leaving.step().conceal).toBe(1);

  const arriving = rig();
  arriving.run(.2);
  arriving.set({ reasons: { queue: true } });
  arriving.until(out => out.surface === "tools" && out.presence === "revealing" && out.conceal < 1);
  arriving.set({ tools: { present: false } });
  expect(arriving.step().conceal).toBe(1);
});

test("the card staying on screen without taking input lowers the buddy with the quick hide", () => {
  const r = rig();
  r.run(.2);
  r.set({ dock: { accepts: false } });
  const first = r.step();
  expect(first).toMatchObject({ presence: "hiding", hideStyle: "quick" });
  expect(first.conceal).toBeLessThan(1);
  expect(r.until(out => out.presence === "shown").surface).toBe("tools");
});

test("on Overview an idle trip hides and returns on the same composer", () => {
  const r = rig({ ...OVERVIEW, resting: true });
  r.run(TRIP_MIN + TRIP_SPREAD + 5);
  expect(r.frames.some(frame => frame.presence === "hiding")).toBe(true);
  expect(r.frames.every(frame => frame.surface === "dock")).toBe(true);
});

test("an idle trip needs uninterrupted rest; activity restarts the count", () => {
  // Random .5: the trip comes after 90 s of rest.
  const r = rig({ ...CANVAS, resting: true });
  r.run(50);
  r.set({ resting: false });
  r.step();
  r.set({ resting: true });
  r.run(88);
  expect(r.frames.every(frame => frame.surface === "dock" && frame.presence === "shown")).toBe(true);
  r.run(4);
  expect(r.frames.some(frame => frame.presence === "hiding")).toBe(true);
});

test("typing holds off the idle trip", () => {
  const r = rig({ ...CANVAS, resting: true });
  for (let i = 0; i < Math.round(130*1000/33); i++) r.step(i % 30 === 0 ? ["input"] : []);
  expect(r.frames.every(frame => frame.presence === "shown")).toBe(true);
});

test("a large gap after the buddy shows again advances time by at most 35 ms", () => {
  const r = rig();
  r.run(.2);
  r.set({ visible: false });
  r.run(.2);
  const before = r.state.time;
  r.set({ visible: true });
  r.step([], 5000);
  expect(r.state.time - before).toBe(.035);
});

test("a click sends the buddy to the other surface with the idle-trip choreography", () => {
  const r = rig();
  r.run(.2);
  expect(r.step(["poke"]).presence).toBe("hiding");
  expect(r.until(out => out.presence === "shown").surface).toBe("tools");
  r.step(["poke"]);
  expect(r.until(out => out.presence === "shown").surface).toBe("dock");
});

test("a click with nowhere else to go reappears at a new random x on the same surface", () => {
  const r = rig(OVERVIEW);
  r.run(.2);
  r.random(() => .25);
  r.step(["poke"]);
  expect(r.until(out => out.presence === "shown")).toMatchObject({ surface: "dock", host: { x: -2 + .25*(360 - 52 + 2) } });

  const held = rig();
  held.run(.2);
  held.set({ reasons: { queue: true } });
  held.until(out => out.surface === "tools" && out.presence === "shown");
  held.random(() => .75);
  held.step(["poke"]);
  expect(held.until(out => out.presence === "shown")).toMatchObject({ surface: "tools", host: { x: -2 + .75*(300 - 52 + 2) } });
});

test("a click while hiding or revealing is ignored", () => {
  const r = rig();
  r.run(.2);
  r.set({ reasons: { queue: true } });
  r.step();
  const trip = r.state.trip;
  r.step(["poke"]);
  expect(r.state.trip).toBe(trip);
  r.until(out => out.presence === "revealing");
  r.step(["poke"]);
  expect(r.until(out => out.presence === "shown").surface).toBe("tools");
  expect(r.frames.filter(frame => frame.presence === "hiding" && frame.surface === "tools")).toEqual([]);
});

test("under reduced motion a click moves the buddy at once and changes apply without animation", () => {
  const r = rig({ ...CANVAS, reduced: true });
  r.step();
  expect(r.step(["poke"])).toMatchObject({ surface: "tools", presence: "shown", conceal: 0 });
  expect(r.step(["poke"])).toMatchObject({ surface: "dock", presence: "shown", conceal: 0 });
  r.set({ reasons: { queue: true } });
  expect(r.step()).toMatchObject({ surface: "tools", presence: "shown", conceal: 0 });
  r.set({ reasons: { queue: false } });
  expect(r.step()).toMatchObject({ surface: "dock", presence: "shown", conceal: 0 });
  r.set({ reasons: { queue: true }, tools: { floating: true } });
  expect(r.step()).toMatchObject({ presence: "hidden", conceal: 1 });
});

test("while time is stopped a clicked toolbar visit ends with a step-aside reason or a lost dock floor", () => {
  for (const stopped of [{ reduced: true }, { visible: false }]) {
    const r = rig();
    r.run(.2);
    const x = r.out.host.x;
    r.set(stopped);
    expect(r.step(["poke"])).toMatchObject({ surface: "tools", presence: "shown" });
    r.set({ reasons: { queue: true } });
    expect(r.step().surface).toBe("tools");
    r.set({ reasons: { queue: false } });
    expect(r.step(), JSON.stringify(stopped)).toMatchObject({ surface: "dock", presence: "shown", host: { x } });

    r.step(["poke"]);
    r.set({ dock: { accepts: false } });
    expect(r.step().surface).toBe("tools");
    r.set({ dock: { accepts: true } });
    expect(r.step(), JSON.stringify(stopped)).toMatchObject({ surface: "dock", presence: "shown", host: { x } });
  }
});

test("reduced motion rests like Home: no breathing, blink, gaze, hop or shadow change", () => {
  const r = rig({ ...CANVAS, reduced: true });
  const frames = r.run(10);
  for (const frame of frames) {
    expect(frame.mode).toBe("reduced-motion");
    expect(frame.pose).toMatchObject({ time: 0, squash: 0, lift: 0, tilt: 0, hatTilt: 0, energy: 0, eyeOpen: 1, lookX: 0, lookY: 0 });
    expect(frame.shadow).toMatchObject({ scaleX: 1, scaleY: 1, opacity: .34 });
  }
});

test("while not visible, surface changes apply at once and no time passes", () => {
  const r = rig();
  r.run(.2);
  r.set({ visible: false });
  const time = r.state.time;
  r.set({ reasons: { queue: true } });
  expect(r.step()).toMatchObject({ surface: "tools", presence: "shown", conceal: 0 });
  r.set({ reasons: { queue: false } });
  expect(r.step()).toMatchObject({ surface: "dock", presence: "shown", conceal: 0 });
  expect(r.state.time).toBe(time);
});

test("the shadow centre sits under each buddy's feet", () => {
  for (const id of BUDDY_IDS) {
    const r = rig(CANVAS, id);
    const out = r.step();
    expect(out.shadow.x - out.host.x, id).toBeCloseTo(dockedGeometry(id).contactX, 9);
  }
});
