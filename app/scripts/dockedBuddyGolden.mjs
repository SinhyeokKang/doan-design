// SPDX-License-Identifier: MIT
// Regenerates app/src/renderer/dockedBuddy.golden.json from the docked buddy draft .doan/assets/buddies/docked-poc.js.
//
//   node app/scripts/dockedBuddyGolden.mjs           # rewrites the golden
//   node app/scripts/dockedBuddyGolden.mjs --check   # exits 1 if the golden differs from a fresh run
//
// Only the draft's DOM-free core (globalThis.dockedBuddyCore) runs, in a node vm without document, so the draft's
// preview shell returns before touching anything. Math.random throws in the vm: the core must draw only from the
// random function it is handed, which here is a seeded generator whose every value is logged. Time is the `now`
// each scenario passes to advance(). Each frame records the inputs when they change, the events, the random values
// drawn and, unless a long scenario samples it, the drawn frame and the core state afterwards; dockedBuddyCore.test.ts
// replays every frame and compares.
//
// The docked shaders are Home's templates plus two lines, so before anything runs the generator checks that the
// draft's templates are motion-preview.js's (Home's rig follows that file) and that the insertion anchor occurs
// exactly once in every buddy's vertex source: a missing anchor would compile Home's shader without the foot pin.
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE = ".doan/assets/buddies/docked-poc.js";
const HOME = ".doan/assets/buddies/motion-preview.js";
const GOLDEN = "app/src/renderer/dockedBuddy.golden.json";
const check = process.argv.includes("--check");

const draft = readFileSync(root + SOURCE, "utf8");
const home = readFileSync(root + HOME, "utf8");
const TEMPLATES = [/ {2}const vertexFor = c => `[^`]*`;\n/g, / {2}const EYE_SPAN = [^\n]*\n/g, / {2}const fragmentFor = c => `[^`]*`;\n/g];
for (const pattern of TEMPLATES) {
  const ours = draft.match(pattern) ?? [], theirs = home.match(pattern) ?? [];
  if (ours.length !== 1 || theirs.length !== 1) throw new Error(`${pattern}: expected once in ${SOURCE} and ${HOME}, found ${ours.length} and ${theirs.length}`);
  if (ours[0] !== theirs[0]) throw new Error(`${SOURCE}: shader template differs from ${HOME}:\n${ours[0]}`);
}

const context = vm.createContext({ Math: Object.assign(Object.create(Math), { random: () => { throw new Error("the docked core used Math.random"); } }), Error, Object });
vm.runInContext(draft, context, { filename: SOURCE });
const core = context.dockedBuddyCore;
if (!core) throw new Error(`${SOURCE}: globalThis.dockedBuddyCore was not defined`);
const BUDDIES = ["doany", "puri", "dungdung", "popo", "dori"];
if (JSON.stringify(Object.keys(core.BUDDIES)) !== JSON.stringify(BUDDIES)) throw new Error(`${SOURCE}: buddies ${Object.keys(core.BUDDIES)}`);
for (const id of BUDDIES) {
  const count = core.vertexFor(core.BUDDIES[id]).split(core.ANCHOR).length - 1;
  if (count !== 1) throw new Error(`${SOURCE}: shader anchor "${core.ANCHOR}" occurs ${count} times for ${id}`);
}

// mulberry32: a fixed, varied stream (a constant would always turn the same way).
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const DOCK = { present: true, accepts: true, width: 360, floating: false };
const TOOLS = { present: true, width: 300, floating: false };
const BASE = { reasons: { queue: false, prompts: false, waiting: false }, panel: { folded: false, folding: false }, resting: false, visible: true, reduced: false };
const CANVAS = { surfaces: { dock: DOCK, tools: TOOLS }, ...BASE };
const OVERVIEW = { surfaces: { dock: DOCK, tools: null }, ...BASE };

// Steps: [from, to, step] runs frames at now = from, from + step, ... to; { set } merges into the inputs from the next
// frame on; { event } goes with the next frame only.
const run = (from, to, step = 33) => ({ frames: [from, to, step] });
const set = patch => ({ set: patch });
const event = name => ({ event: name });
const dock = patch => set({ surfaces: { dock: patch } });
const tools = patch => set({ surfaces: { tools: patch } });
const SCENARIOS = [
  // Created with random 0, 0: the first walk at 1.8 s and the first large hop at 13 s. Blinks at 2 s, then every 4–8 s.
  { name: "walk", buddy: "doany", inputs: CANVAS, prefix: [0, 0], steps: [run(1000, 15500)] },
  { name: "attention", buddy: "doany", inputs: CANVAS, steps: [run(1000, 1495), event("input"), run(1528, 4498), event("thread"), run(4531, 6511), event("input"), event("thread"), run(6544, 8986)] },
  { name: "queue", buddy: "doany", inputs: CANVAS, steps: [run(1000, 1990), set({ reasons: { queue: true } }), run(2023, 3707), set({ resting: true }), run(3740, 4400), set({ reasons: { queue: false } }), run(4433, 7000)] },
  { name: "queueOverview", buddy: "doany", inputs: OVERVIEW, steps: [run(1000, 1990), set({ reasons: { queue: true } }), run(2023, 3707), set({ reasons: { queue: false } }), run(3740, 6500)] },
  { name: "stepAside", buddy: "doany", inputs: CANVAS, steps: [run(1000, 1495), set({ reasons: { prompts: true } }), run(1528, 3500), set({ reasons: { prompts: false } }), run(3533, 6000), set({ reasons: { waiting: true } }), run(6033, 8000), set({ reasons: { waiting: false, prompts: true } }), run(8033, 8500), set({ reasons: { prompts: false } }), run(8533, 11000)] },
  { name: "fold", buddy: "doany", inputs: CANVAS, steps: [run(1000, 1495), set({ panel: { folding: true } }), run(1528, 1726), set({ panel: { folding: false, folded: true } }), run(1759, 4000), set({ panel: { folded: false } }), run(4033, 7000)] },
  { name: "foldDuringTrip", buddy: "doany", inputs: CANVAS, steps: [run(1000, 1495), set({ reasons: { queue: true } }), run(1528, 1594), set({ panel: { folding: true } }), run(1627, 1825), set({ panel: { folding: false, folded: true } }), run(1858, 3500), set({ panel: { folded: false } }), run(3533, 5000), set({ reasons: { queue: false } }), run(5033, 8000)] },
  { name: "floating", buddy: "doany", inputs: CANVAS, steps: [run(1000, 1495), dock({ floating: true }), run(1528, 2500), dock({ floating: false }), run(2533, 3200), dock({ floating: true }), run(3233, 3500), dock({ floating: false }), run(3533, 5500), tools({ floating: true }), run(5533, 6500), tools({ floating: false }), run(6533, 7000)] },
  { name: "floatingThenQueue", buddy: "doany", inputs: CANVAS, steps: [run(1000, 1495), dock({ floating: true }), run(1528, 2500), dock({ floating: false }), run(2533, 2995), set({ reasons: { queue: true } }), run(3028, 5000), tools({ floating: true }), run(5033, 5500), set({ reasons: { queue: false } }), run(5533, 6000), tools({ floating: false }), run(6033, 9500)] },
  { name: "noFloor", buddy: "doany", inputs: CANVAS, steps: [run(1000, 1495), dock({ accepts: false }), run(1528, 3500), dock({ accepts: true }), run(3533, 6000), dock({ present: false }), run(6033, 7500), dock({ present: true }), run(7533, 9500), dock({ width: 40 }), run(9533, 10500), dock({ width: 200 }), run(10533, 12500), tools({ width: 120 }), run(12533, 13000)] },
  { name: "toolsGone", buddy: "doany", inputs: CANVAS, steps: [run(1000, 1495), set({ reasons: { queue: true } }), run(1528, 3500), tools({ present: false }), run(3533, 4500), tools({ present: true }), run(4533, 6000), set({ reasons: { queue: false } }), run(6033, 8500)] },
  // The idle trip needs 5 s of rest and then 60–120 s; activity in between restarts the count.
  { name: "idleTrip", buddy: "doany", inputs: CANVAS, sample: 200, steps: [run(1000, 20000, 35), set({ resting: true }), run(20035, 40000, 35), set({ resting: false }), run(40035, 41000, 35), set({ resting: true }), run(41035, 165000, 35)] },
  { name: "idleOverview", buddy: "doany", inputs: { ...OVERVIEW, resting: true }, sample: 200, steps: [run(1000, 130000, 35)] },
  { name: "restWithoutTrip", buddy: "doany", inputs: CANVAS, sample: 200, steps: [run(1000, 130000, 35)] },
  { name: "poke", buddy: "doany", inputs: CANVAS, steps: [run(1000, 2000), event("poke"), run(2033, 2100), event("poke"), run(2133, 4000), event("poke"), run(4033, 6500), set({ reasons: { queue: true } }), run(6533, 9000), event("poke"), run(9033, 11500)] },
  { name: "pokeOverview", buddy: "doany", inputs: OVERVIEW, steps: [run(1000, 2000), event("poke"), run(2033, 4500)] },
  { name: "hidden", buddy: "doany", inputs: CANVAS, steps: [run(1000, 1495), set({ visible: false }), run(1528, 1594), set({ reasons: { queue: true } }), run(1627, 1693), set({ reasons: { queue: false } }), run(1726, 1792), event("poke"), run(1825, 1891), set({ reasons: { queue: true } }), run(1924, 1990), set({ visible: true }), run(7000, 7500), set({ reasons: { queue: false } }), run(7533, 10000)] },
  { name: "reduced", buddy: "doany", inputs: CANVAS, steps: [run(1000, 1495), set({ reasons: { queue: true } }), run(1528, 1594), set({ reduced: true }), run(1627, 1693), set({ reasons: { queue: false } }), run(1726, 1792), event("poke"), run(1825, 1891), event("poke"), run(1924, 1990), set({ reduced: false }), run(2023, 3500), set({ reasons: { queue: true } }), run(3533, 3599), set({ reduced: true }), run(3632, 3698), set({ reduced: false }), run(3731, 6000)] },
  { name: "mountQueued", buddy: "doany", inputs: { ...CANVAS, reasons: { queue: true, prompts: false, waiting: false } }, steps: [run(1000, 2500), set({ reasons: { queue: false } }), run(2533, 5000)] },
  { name: "mountNoSurface", buddy: "doany", inputs: { ...CANVAS, surfaces: { dock: null, tools: null } }, steps: [run(1000, 1495), set({ surfaces: { dock: DOCK } }), run(1528, 3000)] },
  { name: "mountFolded", buddy: "doany", inputs: { ...CANVAS, panel: { folded: true, folding: false } }, steps: [run(1000, 1495), set({ panel: { folded: false } }), run(1528, 4000)] },
  { name: "mountReduced", buddy: "doany", inputs: { ...CANVAS, reduced: true }, steps: [run(1000, 1099), set({ reduced: false }), run(1132, 3000)] },
  ...BUDDIES.map(buddy => ({ name: `buddy:${buddy}`, buddy, inputs: CANVAS, prefix: [0, 0], sample: 15, steps: [run(1000, 15000), set({ reasons: { queue: true } }), run(15033, 17500)] })),
];

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
function merge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) out[key] = isObject(value) && isObject(base[key]) ? merge(base[key], value) : value;
  return out;
}
const clone = value => JSON.parse(JSON.stringify(value));

function play({ name, buddy, inputs: start, prefix = [], sample = 6, steps }, seed) {
  const next = seeded(seed);
  const queue = [...prefix];
  let drawn = [];
  const random = () => { const value = queue.length ? queue.shift() : next(); drawn.push(value); return value; };
  const state = core.create(buddy, random);
  const created = { random: drawn, state: clone(state) };
  let inputs = clone(start), changed = true, events = [], last = null, index = 0;
  const log = [];
  for (const item of steps) {
    if (item.set) { inputs = merge(inputs, item.set); changed = true; continue; }
    if (item.event) { events.push(item.event); continue; }
    const [from, to, step] = item.frames;
    for (let now = from; now <= to; now += step) {
      drawn = [];
      const out = clone(core.advance(state, { ...inputs, events }, now, random));
      const entry = { now };
      if (changed) entry.inputs = clone(inputs);
      if (events.length) entry.events = events;
      if (drawn.length) entry.random = drawn;
      const turned = !last || ["surface", "presence", "hideStyle"].some(key => out[key] !== last[key]);
      if (index % sample === 0 || changed || events.length || turned || (now + step > to && item === steps.at(-1))) { entry.out = out; entry.state = clone(state); }
      log.push(entry);
      changed = false; events = []; last = out; index++;
    }
  }
  return { name, buddy, created, log };
}

const shaders = Object.fromEntries(BUDDIES.map(id => [id, clone(core.shaders(id))]));
const geometry = Object.fromEntries(BUDDIES.map(id => [id, clone(core.geometry(id))]));
// Surface rects and floating-element rects in viewport px; the box is the buddy's 56px square on the floor.
const SURFACE = { left: 100, right: 460, top: 500 };
const OVERLAPS = [
  { box: core.buddyBox(SURFACE, 16), rects: [] },
  { box: core.buddyBox(SURFACE, 16), rects: [{ left: 120, right: 200, top: 430, bottom: 460 }] },
  { box: core.buddyBox(SURFACE, 16), rects: [{ left: 172, right: 260, top: 430, bottom: 460 }] },
  { box: core.buddyBox(SURFACE, 16), rects: [{ left: 60, right: 116, top: 430, bottom: 460 }] },
  { box: core.buddyBox(SURFACE, 16), rects: [{ left: 120, right: 200, top: 400, bottom: 443 }] },
  { box: core.buddyBox(SURFACE, 16), rects: [{ left: 120, right: 200, top: 499, bottom: 540 }] },
  { box: core.buddyBox(SURFACE, 16), rects: [{ left: 300, right: 400, top: 430, bottom: 460 }, { left: 150, right: 150, top: 430, bottom: 460 }] },
  { box: core.buddyBox(SURFACE, 16), rects: [{ left: 300, right: 400, top: 430, bottom: 460 }, { left: 150, right: 160, top: 430, bottom: 460 }] },
  { box: core.clipWindow(SURFACE), rects: [{ left: 300, right: 400, top: 430, bottom: 460 }] },
].map(({ box, rects }) => ({ box: clone(box), rects, overlaps: core.overlaps(box, rects) }));
const XON = [
  { state: { surface: "dock", x: 120, slots: {} }, name: "dock", width: 360 },
  { state: { surface: "dock", x: 340, slots: {} }, name: "dock", width: 200 },
  { state: { surface: "dock", x: 120, slots: {} }, name: "tools", width: 300 },
  { state: { surface: "dock", x: 120, slots: { tools: 30 } }, name: "tools", width: 300 },
  { state: { surface: "tools", x: 80, slots: {} }, name: "dock", width: 360 },
  { state: { surface: "tools", x: 80, slots: { dock: 500 } }, name: "dock", width: 360 },
  { state: { surface: null, x: 16, slots: {} }, name: "tools", width: 40 },
].map(item => ({ ...item, x: core.xOn(item.state, item.name, item.width) }));
const scenarios = SCENARIOS.map((scenario, index) => play(scenario, 0x5eed + index));

const constants = Object.fromEntries(["SIZE", "FLOOR", "WINDOW", "DROP", "PEEK", "REST_SECONDS", "TRIP_MIN", "TRIP_SPREAD", "FLOAT_WAIT"].map(key => [key, core[key]]));
const golden = { source: SOURCE, generator: "app/scripts/dockedBuddyGolden.mjs", anchor: core.ANCHOR, constants, hides: clone(core.HIDES), shaders, geometry, overlaps: OVERLAPS, xOn: XON, scenarios };
const text = JSON.stringify(golden);
if (check) {
  let current = "";
  try { current = readFileSync(root + GOLDEN, "utf8"); } catch { /* a missing golden differs */ }
  const same = current === text;
  console.log(same ? "dockedBuddy.golden.json matches the draft" : "dockedBuddy.golden.json differs from the draft");
  process.exit(same ? 0 : 1);
}
writeFileSync(root + GOLDEN, text);
console.log(`wrote ${GOLDEN}: ${scenarios.length} scenarios, ${scenarios.reduce((sum, s) => sum + s.log.length, 0)} frames, ${text.length} bytes`);
