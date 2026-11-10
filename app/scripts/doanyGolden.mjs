// SPDX-License-Identifier: MIT
// Regenerates app/src/renderer/doany.golden.json from the canonical buddy draft .doan/assets/buddies/motion-preview.js.
//
//   node app/scripts/doanyGolden.mjs           # rewrites the golden
//   node app/scripts/doanyGolden.mjs --check   # exits 1 if the golden differs from a fresh run
//
// The draft runs in a node vm with a stubbed DOM, fixed Math.random values, fixed requestAnimationFrame timestamps and
// a recording WebGL context (the same constants and encoding as Doany.test.tsx), as Doany: one scenario per behaviour
// the app's rig must reproduce. Each step logs what the draft did: the uniforms of every draw, data-state writes,
// random values drawn, canvas size, which of canvas and still image shows, and the motion state afterwards
// (doanyMotion.test.ts and doanyRig.test.ts replay the steps). The "idle" scenario also records every WebGL call up
// to the first frame's two draws (Doany.test.tsx compares Doany.tsx with it call for call).
//
// The logs pin the motion model, not Doany's drawn bounds: the draft applies its per-buddy hop multiplier and
// accessory tilt range while it writes the uniforms, and the app keeps those in drawnPose (checked against the
// registry and the canvas edge in doanyRender.test.ts). So the draft runs with Doany's bounds set to a multiplier
// of 1 and an unbounded tilt, which leaves every other number and the shader source untouched.
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE = ".doan/assets/buddies/motion-preview.js";
const GOLDEN = "app/src/renderer/doany.golden.json";
const check = process.argv.includes("--check");

const BOUNDS = "tilt:[-.30,.15], liftScale:.9}";
const draft = readFileSync(root + SOURCE, "utf8");
if (draft.split(BOUNDS).length !== 2) throw new Error(`${SOURCE}: Doany's bounds "${BOUNDS}" not found exactly once`);
const unbounded = draft.replace(BOUNDS, "tilt:[-Infinity,Infinity], liftScale:1}");

const FIELDS = ["time", "ready", "visible", "lookX", "lookY", "targetX", "targetY", "hat", "hatV", "jumpAt", "blinkAt", "nextBlink", "typingUntil", "last", "eye", "mode", "pointerUntil"];
const UNIFORMS = ["time", "squash", "lift", "tilt", "hatTilt", "energy", "eyeOpen", "lookX", "lookY"];
const CONSTANTS = {
  VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, ELEMENT_ARRAY_BUFFER: 6, STATIC_DRAW: 7, FLOAT: 8,
  BLEND: 9, SRC_ALPHA: 10, ONE_MINUS_SRC_ALPHA: 11, TEXTURE_2D: 12, TEXTURE_WRAP_S: 13, TEXTURE_WRAP_T: 14, CLAMP_TO_EDGE: 15, TEXTURE_MIN_FILTER: 16,
  TEXTURE_MAG_FILTER: 17, LINEAR: 18, RGBA: 19, UNSIGNED_BYTE: 20, COLOR_BUFFER_BIT: 21, TRIANGLES: 22, UNSIGNED_SHORT: 23, TEXTURE0: 24, TEXTURE1: 25,
};

const frames = (from, to, step) => { const list = []; for (let now = from; now <= to; now += step) list.push({ op: "frame", now }); return list; };
const RECT = { x: 100, y: 200, width: 114, height: 114 };
const loaded = { op: "textures", fail: false };
const SCENARIOS = [
  { name: "idle", options: { random: [0, 1], trace: true }, steps: [...frames(1000, 1016, 16), loaded, ...frames(1049, 12269, 33)] },
  // 17 ms frames from before the first blink (2 s) to just past its 420 ms.
  { name: "blink", options: {}, steps: [loaded, ...frames(1000, 3448, 17)] },
  { name: "pointer", options: {}, steps: [loaded, ...frames(1000, 1330, 33), { op: "pointer", clientX: 300, clientY: 150, rect: RECT }, ...frames(1363, 3673, 33), { op: "pointer", clientX: -500, clientY: 900, rect: RECT }, ...frames(3706, 4036, 33), { op: "pointer", clientX: 120, clientY: 100, rect: { x: 40, y: 60, width: 142, height: 142 } }, ...frames(4069, 6247, 33)] },
  { name: "typing", options: {}, steps: [loaded, ...frames(1000, 1330, 33), { op: "input" }, ...frames(1363, 2023, 33), { op: "input" }, ...frames(2056, 4036, 33)] },
  { name: "hop", options: {}, steps: [loaded, ...frames(1000, 1200, 20), { op: "click" }, ...frames(1220, 1600, 20), { op: "click" }, ...frames(1620, 3100, 20), { op: "key", key: "Enter" }, ...frames(3120, 3400, 20), { op: "key", key: " " }, ...frames(3420, 3600, 20), { op: "key", key: "a" }, ...frames(3620, 5000, 20)] },
  { name: "reduced", options: {}, steps: [loaded, ...frames(1000, 1300, 20), { op: "click" }, ...frames(1320, 1600, 20), { op: "reduced", matches: true }, ...frames(1620, 1900, 20), { op: "click" }, { op: "key", key: "Enter" }, ...frames(1920, 2000, 20), { op: "reduced", matches: false }, ...frames(2020, 3500, 20)] },
  { name: "reducedStart", options: { reduced: true }, steps: [...frames(1000, 1000, 20), loaded, ...frames(1020, 1200, 20), { op: "reduced", matches: false }, ...frames(1220, 1600, 20)] },
  { name: "reducedSilent", options: {}, steps: [loaded, ...frames(1000, 1200, 20), { op: "reducedSilent", matches: true }, ...frames(1220, 1300, 20), { op: "reducedSilent", matches: false }, ...frames(1320, 1400, 20)] },
  { name: "hidden", options: {}, steps: [loaded, ...frames(1000, 1300, 20), { op: "intersect", isIntersecting: false }, ...frames(1320, 1600, 20), { op: "intersect", isIntersecting: true }, ...frames(1620, 1800, 20), { op: "documentHidden", hidden: true }, ...frames(1820, 1820, 20), { op: "documentHidden", hidden: false }, ...frames(6820, 7200, 20)] },
  { name: "preReady", options: {}, steps: [...frames(1000, 1000, 20), { op: "pointer", clientX: 10, clientY: 10, rect: RECT }, { op: "input" }, { op: "click" }, ...frames(1020, 1200, 20), loaded, ...frames(1220, 2200, 20)] },
  { name: "resize", options: {}, steps: [loaded, ...frames(1000, 1000, 20), ...[[114, 1], [114, 2], [142.5, 1], [143, 2], [114, 3], [114, 0], [114, 1.5], [600, 2], [0, 2]].map(([width, dpr]) => ({ op: "resize", width, dpr })), ...frames(1020, 1020, 20)] },
  { name: "resizeHiDpi", options: { dpr: 2 }, steps: [loaded, ...frames(1000, 1100, 20)] },
  { name: "textureError", options: {}, steps: [...frames(1000, 1000, 20), { op: "textures", fail: true }, ...frames(1020, 1100, 20)] },
  { name: "contextLost", options: {}, steps: [loaded, ...frames(1000, 1100, 20), { op: "contextLost" }, ...frames(1120, 1200, 20), { op: "reduced", matches: true }, ...frames(1220, 1260, 20)] },
  { name: "noContext", options: { noContext: true }, steps: [] },
  { name: "compileFails", options: { compileFails: true }, steps: [] },
];

function listeners() {
  const map = new Map();
  return {
    addEventListener(type, listener) { if (!map.has(type)) map.set(type, []); map.get(type).push(listener); },
    removeEventListener(type, listener) { map.set(type, (map.get(type) ?? []).filter(item => item !== listener)); },
    dispatch(type, event = {}) {
      let prevented = false;
      for (const listener of [...map.get(type) ?? []]) listener({ ...event, preventDefault() { prevented = true; } });
      return prevented;
    },
  };
}

async function run({ name, options, steps }) {
  const trace = [], log = [];
  let drawn = 0, lost = false, current = null;
  const ids = new Map();
  class FakeImage { crossOrigin = ""; src = ""; onload = () => {}; onerror = () => {}; constructor() { images.push(this); } }
  const images = [];
  const encode = value => {
    if (value === null || typeof value !== "object") return value;
    if (ids.has(value)) return ids.get(value);
    if (value instanceof FakeImage) return `image:${value.src.split("/").pop()}:${value.crossOrigin}`;
    if (ArrayBuffer.isView(value)) return { [value.constructor.name]: value.length, sum: value.reduce((sum, v, i) => sum + v * (i + 1), 0) };
    return value;
  };
  const object = () => ({});
  const methods = {
    createShader: object, createProgram: object, createBuffer: object, createTexture: object,
    getShaderParameter: () => !options.compileFails, getShaderInfoLog: () => "compile failed", getProgramParameter: () => true, getProgramInfoLog: () => "",
    getUniformLocation: object, getAttribLocation: () => 0, isContextLost: () => lost, getExtension: () => null,
  };
  const names = new Map();
  const gl = new Proxy(CONSTANTS, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        const entry = options.trace && drawn < 2 ? [key, ...args.map(encode)] : null;
        const result = (methods[key] ?? (() => undefined))(...args);
        if (key === "getUniformLocation") names.set(result, args[1]);
        if (result !== null && typeof result === "object" && !ids.has(result) && key !== "getExtension") ids.set(result, key === "getUniformLocation" ? `@${String(args[1])}` : `#${ids.size}`);
        if (entry && key !== "getExtension") { if (result !== undefined) entry.push({ result: encode(result) }); trace.push(entry); }
        // A draw starts at the clear, after render() has set the mode; its uniforms follow.
        if (key === "clear") { current = { u: new Array(9).fill(null), order: [], mode: rig().state.mode, state: snapshot() }; step.draws.push(current); }
        if ((key === "uniform1f" || key === "uniform2f") && current) {
          const uniform = names.get(args[0]);
          if (uniform === "look") { current.u[7] = args[1]; current.u[8] = args[2]; }
          else if (uniform !== "layer") current.u[UNIFORMS.indexOf(uniform)] = args[1];
          if (uniform !== "layer" && !current.order.includes(uniform)) current.order.push(uniform);
        }
        if (key === "drawElements") drawn++;
        return result;
      };
    },
  });
  const canvasEvents = listeners();
  const canvas = { hidden: true, width: 300, height: 150, ...canvasEvents, getContext(type, attributes) { if (options.trace) trace.push(["getContext", type, attributes]); return options.noContext ? null : gl; } };
  const still = { hidden: false };
  const hostEvents = listeners();
  let rect = { ...RECT };
  const host = {
    clientWidth: options.width ?? 114, dataset: {}, style: { setProperty() {} }, ...hostEvents,
    querySelector: selector => (selector === "canvas" ? canvas : selector === "img" ? still : null),
    closest: () => null, getBoundingClientRect: () => ({ ...rect }), checkVisibility: () => true,
  };
  // The draft writes data-state on the host; every write is logged.
  const dataset = {};
  Object.defineProperty(host.dataset, "buddyPreview", { value: "doany", enumerable: true });
  Object.defineProperty(host.dataset, "state", { get: () => dataset.state, set: value => { dataset.state = value; step.states.push(value); }, enumerable: true });
  const message = { value: "typed", ...listeners() };
  const documentEvents = listeners();
  const document = {
    hidden: false, currentScript: { src: "http://draft/assets/buddies/motion-preview.js" }, ...documentEvents,
    querySelectorAll: selector => (selector === "[data-buddy-preview]" ? [host] : []),
    querySelector: selector => (selector === "[data-mascot-message]" ? message : null),
  };
  const media = { matches: options.reduced ?? false, ...listeners() };
  let tick = null, resize = () => {}, intersect = () => {};
  const randoms = [...options.random ?? []];
  const window = { ...listeners() };
  const context = vm.createContext({
    document, window, URL, Promise, Error, Object, console: { error() {}, log() {} },
    Math: Object.assign(Object.create(Math), { random: () => { const value = randoms.length ? randoms.shift() : 0.5; step.random.push(value); return value; } }),
    Image: FakeImage, devicePixelRatio: options.dpr ?? 1,
    matchMedia: () => media,
    requestAnimationFrame: callback => { tick = callback; return 1; }, cancelAnimationFrame() {},
    setInterval() {},
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} disconnect() {} },
    IntersectionObserver: class { constructor(callback) { intersect = callback; } observe() {} disconnect() {} },
    Float32Array, Uint16Array,
  });
  const rig = () => window.buddyPreview?.rigs[0];
  // The draft keeps pointerUntil in a closure; this is the value it assigns, state.time + 1.8 at each pointer event.
  let pointerUntil = 0;
  const snapshot = () => { const state = rig()?.state; return state ? FIELDS.map(field => (field === "pointerUntil" ? pointerUntil : state[field])) : null; };
  let step = { draws: [], states: [], random: [] };
  const finish = (entry, extra = {}) => {
    const after = snapshot();
    const draws = step.draws.map(({ u, mode, state }) => (JSON.stringify(state) === JSON.stringify(after) ? { u, mode } : { u, mode, state }));
    log.push({
      ...entry,
      ...(step.draws.length ? { draws } : {}),
      ...(step.states.length || step.draws.length || entry.op === "textures" ? { states: step.states } : {}),
      ...(step.random.length ? { random: step.random } : {}),
      ...extra,
      after, canvas: canvas.width, view: [!canvas.hidden, !still.hidden],
    });
    if (!order.length && step.draws.length) order.push(...step.draws[0].order.map(name => (name === "look" ? "look" : name)));
    step = { draws: [], states: [], random: [] };
    current = null;
  };
  const order = [];
  vm.runInContext(unbounded, context, { filename: SOURCE });
  finish({ op: "create" });
  for (const item of steps) {
    const state = rig()?.state;
    if (item.op === "frame") {
      const gate = { ready: state.ready, visible: state.visible, hidden: document.hidden, reduced: media.matches };
      const callback = tick; tick = null; callback(item.now);
      finish(item, { gate });
      continue;
    }
    let extra = {};
    if (item.op === "textures") {
      if (item.fail) images[0].onerror(); else for (const image of images) image.onload();
      await new Promise(resolve => setImmediate(resolve));
    }
    if (item.op === "pointer") { rect = { ...item.rect }; documentEvents.dispatch("pointermove", { clientX: item.clientX, clientY: item.clientY }); pointerUntil = state.time + 1.8; }
    if (item.op === "input") message.dispatch("input");
    if (item.op === "click") hostEvents.dispatch("click");
    if (item.op === "key") extra = { prevented: hostEvents.dispatch("keydown", { key: item.key }) };
    if (item.op === "reduced") { media.matches = item.matches; media.dispatch("change"); }
    if (item.op === "reducedSilent") media.matches = item.matches;
    if (item.op === "resize") { host.clientWidth = item.width; context.devicePixelRatio = item.dpr; resize(); }
    if (item.op === "intersect") intersect([{ isIntersecting: item.isIntersecting }]);
    if (item.op === "documentHidden") document.hidden = item.hidden;
    if (item.op === "contextLost") { lost = true; extra = { prevented: canvasEvents.dispatch("webglcontextlost") }; }
    finish(item, extra);
  }
  return { name, options, order, ...(options.trace ? { trace } : {}), log };
}

// Key order follows the previous golden's, so a regeneration diff shows only what changed.
const ORDER = ["op", "now", "fail", "clientX", "clientY", "rect", "key", "matches", "width", "dpr", "isIntersecting", "hidden", "draws", "states", "random", "prevented", "gate", "after", "canvas", "view"];
const sorted = entry => Object.fromEntries(Object.entries(entry).sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b)));
const scenarios = [];
for (const scenario of SCENARIOS) {
  const { name, options, order, trace, log } = await run(scenario);
  scenarios.push({ name, options, order, ...(trace ? { trace } : {}), log: log.map(sorted) });
}
const golden = { fields: FIELDS, uniforms: UNIFORMS, source: SOURCE, generator: "app/scripts/doanyGolden.mjs", scenarios };
const text = JSON.stringify(golden);
if (check) {
  const same = readFileSync(root + GOLDEN, "utf8") === text;
  console.log(same ? "doany.golden.json matches the draft" : "doany.golden.json differs from the draft");
  process.exit(same ? 0 : 1);
}
writeFileSync(root + GOLDEN, text);
console.log(`wrote ${GOLDEN}: ${scenarios.length} scenarios`);
