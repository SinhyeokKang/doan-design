// SPDX-License-Identifier: MIT
// The docked buddy's core: the DOM-free part of the docked draft .doan/assets/buddies/docked-poc.js (MIT, Doan
// contributors), for the buddy that stands on the docked composer card and the canvas toolbar. One advanceDocked()
// step runs time, motion and the surface/hide state together, because they share one random stream and one state.
// Formulas, constants and operation order are the draft's: dockedBuddyCore.test.ts replays every frame of the golden
// that app/scripts/dockedBuddyGolden.mjs records from the draft. One guard differs, only where the draft throws: a
// click while time is stopped, with the current surface gone in the same frame, keeps x. The draft's preview-only
// controls (Pause, Jump, look and walk buttons, Hide & reappear) are not ported. Time and randomness are arguments;
// nothing here reads the DOM.
import { buddy, type BuddyId } from "./buddies";

export const SIZE = 56;          // rig viewport, CSS px, on both surfaces
export const FLOOR = -1;         // ground origin, relative to the surface's top edge
export const WINDOW = 88;        // clip window height above the floor; only the buddy is clipped
export const DROP = 52;          // hide descent
export const PEEK = 12;          // reveal pause depth
export const REST_SECONDS = 5;   // the person rests after this long without view, selection, input or thread-scroll activity
export const TRIP_MIN = 60, TRIP_SPREAD = 60; // idle surface trip: after 60–120 s of uninterrupted rest
export const FLOAT_WAIT = 1;     // after the last overlapping floating element closes
const RISE = .22;                // a reveal without a peek

export interface HideStyle { name: "quick" | "hesitant" | "soft"; delay: number; duration: number }
export const HIDES: readonly HideStyle[] = [{ name: "quick", delay: 0, duration: .24 }, { name: "hesitant", delay: .18, duration: .36 }, { name: "soft", delay: .04, duration: .42 }];

export type SurfaceName = "dock" | "tools";
export type Presence = "shown" | "hiding" | "waiting" | "revealing" | "hidden";
// 'input': composer input or focus. 'thread': the pointer moved over the thread. 'poke': a click on the painted body.
export type DockedEvent = "input" | "thread" | "poke";

export interface Surface { present: boolean; width: number; floating: boolean }
// accepts: the card takes input (an unlisted page or a canvas sharing another's id keeps the card but not the input).
export interface DockSurface extends Surface { accepts: boolean }

export interface DockedInputs {
  surfaces: { dock: DockSurface | null; tools: Surface | null };
  // Step-aside reasons: a queued message, suggested prompts, a permission or question card waiting for an answer.
  reasons: { queue: boolean; prompts: boolean; waiting: boolean };
  panel: { folded: boolean; folding: boolean };
  resting: boolean;
  visible: boolean;
  reduced: boolean;
  events: readonly DockedEvent[];
}

interface Motion { start: number; from: number; to: number; big: boolean; prepare: number; flight: number; settle: number }
interface Trip {
  destination: SurfaceName | null; phase: "leaving" | "waiting" | "arriving"; from: number; at: number | null;
  style?: HideStyle | null; wait?: number; idle: boolean; hold: boolean; closedAt: number | null; quick: boolean; newX?: number;
}

export interface DockedState {
  buddy: BuddyId; tempo: number; time: number; last: number; mounted: boolean; reduced: boolean;
  surface: SurfaceName | null; slots: Partial<Record<SurfaceName, number>>; x: number; direction: number; motion: Motion | null; stepsLeft: number;
  nextMove: number; nextHop: number;
  forced: "walk" | "thread"; focusUntil: number; typingUntil: number;
  lookX: number; lookY: number; bodyLean: number; hat: number; hatV: number; blinkAt: number; nextBlink: number; eye: number;
  conceal: number; trip: Trip | null; visit: "idle" | "forced" | null; idleLeft: number | null;
}

type Phase = "rest" | "prepare" | "air" | "land";
export type DockedMode = "reduced-motion" | "prepare" | "air" | "land" | "idle" | "attentive";

export interface DockedFrame {
  surface: SurfaceName | null;
  // 0 standing on the floor to 1 fully down.
  conceal: number;
  presence: Presence;
  // Each surface's remembered x, the current one included.
  slots: Partial<Record<SurfaceName, number>>;
  hideStyle: HideStyle["name"] | null;
  // The host's translation from its rest position on the surface: x along the floor, y down while hiding.
  host: { x: number; y: number };
  // The shader uniforms (look is lookX, lookY), plus hopLift (0 on the floor to 1 at Home's apex) and the hop phase.
  pose: { time: number; squash: number; lift: number; tilt: number; hatTilt: number; energy: number; eyeOpen: number; lookX: number; lookY: number; hopLift: number; phase: Phase };
  // The floor shadow: centre x from the surface's left edge, scale about that centre, and opacity.
  shadow: { x: number; scaleX: number; scaleY: number; opacity: number };
  attention: "input" | "thread" | "walk";
  mode: DockedMode;
}

const REST = { squash: 0, lift: 0, tilt: 0, phase: "rest" as Phase };
const smooth = (u: number) => u*u*(3-2*u);
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
// Shader UV to a fraction of the host box: (p-.5)*1.34 in clip space is .165 + .67*p of the viewport (Doany.tsx's
// shadow origin uses the same mapping).
const project = (v: number) => .165 + .67*v;

// contactX: the shadow centre from the host's left edge; hostTop: the host's top from the floor; originY: its
// transform-origin y as a fraction, so the feet are the pivot. Computed from the registry, so no buddy needs its own CSS.
export function dockedGeometry(id: BuddyId) {
  const [x, y] = buddy(id).rig.contact;
  return { contactX: SIZE*project(x), hostTop: -SIZE*project(y), originY: project(y) };
}

const trackMax = (width: number) => Math.max(-2, width - 52);
// Where the buddy stands, or would stand, on a surface of this width: its x there, else the first-visit x. The shell
// measures floating elements against the box at this x.
export function xOn(st: Pick<DockedState, "surface" | "x" | "slots">, name: SurfaceName, width: number) {
  const x = st.surface === name ? st.x : st.slots[name] ?? (name === "tools" ? (width - SIZE)/2 : 16);
  return Math.max(-2, Math.min(trackMax(width), x));
}

export function createDockedState(id: BuddyId, random: () => number): DockedState {
  const st: DockedState = {
    buddy: id, tempo: 1, time: 0, last: 0, mounted: false, reduced: false,
    surface: null, slots: {}, x: 16, direction: 1, motion: null, stepsLeft: 0,
    nextMove: 1.8 + random(), nextHop: 13 + random()*7,
    forced: "walk", focusUntil: 0, typingUntil: 0,
    lookX: 0, lookY: 0, bodyLean: 0, hat: 0, hatV: 0, blinkAt: 2, nextBlink: 2, eye: 1,
    conceal: 0, trip: null, visit: null, idleLeft: null,
  };
  setDockedBuddy(st, id);
  return st;
}

// A buddy change keeps the core state (surface, each surface's x, hide, trip); only the buddy and its tempo change.
export function setDockedBuddy(st: DockedState, id: BuddyId) {
  st.buddy = id;
  st.tempo = id === "puri" ? 1.12 : 1;
}

// Whether another step can change anything without new inputs. False while time is stopped (reduced motion), and
// while the buddy is down with nowhere to go or under a floating element that is still open: only an input change
// moves it on, so the shell may stop its rAF until one arrives. The 1 s wait after a floating element closes, a
// hide or reveal, a hop and a shown buddy (breathing, blinks, idle walks, the idle-trip count) all need time.
export function dockedNeedsTime(st: DockedState) {
  if (!st.mounted) return true;
  if (st.reduced) return false;
  const trip = st.trip;
  if (!trip) return st.conceal < 1;
  if (trip.phase !== "waiting") return true;
  return trip.hold ? trip.closedAt !== null : trip.destination !== null;
}

const attention = (st: DockedState) => st.time < st.typingUntil ? "input" : st.time < st.focusUntil ? st.forced : "walk";
function hopPose(st: DockedState): { squash: number; lift: number; tilt: number; phase: Phase } {
  const m = st.motion;
  if (!m) return REST;
  const t = st.time - m.start;
  if (t < m.prepare) { const u = t/m.prepare; return { squash: (m.big?.10:.055)*smooth(u), lift: 0, tilt: st.direction*.018*smooth(u), phase: "prepare" }; }
  if (t < m.prepare + m.flight) {
    const u = (t - m.prepare)/m.flight, arc = 4*u*(1-u);
    return { squash: (m.big?.10:.055)*(1-smooth(Math.min(1, u/.18)))-(m.big?.045:.025)*Math.sin(Math.PI*u), lift: (m.big?.18:.075)*arc, tilt: st.direction*.025*Math.sin(Math.PI*u), phase: "air" };
  }
  const u = Math.min(1, (t - m.prepare - m.flight)/m.settle);
  return { squash: (m.big?.08:.045)*Math.sin(Math.PI*u)*Math.exp(-u*2), lift: 0, tilt: 0, phase: "land" };
}
function beginMove(st: DockedState, width: number, random: () => number, big: boolean) {
  const max = trackMax(width);
  const stride = (big ? 0 : 8 + random()*4)*st.direction;
  if (!big && (st.x + stride > max || st.x + stride < -2)) st.direction *= -1;
  const to = big ? st.x : Math.max(-2, Math.min(max, st.x + Math.abs(stride)*st.direction));
  st.motion = { start: st.time, from: st.x, to, big, prepare: (big?.2:.14)*st.tempo, flight: (big?.42:.28)*st.tempo, settle: .22*st.tempo };
}

interface View {
  s: DockedInputs["surfaces"]; stepAside: boolean; folded: boolean;
  floor(name: SurfaceName): boolean; floating(name: SurfaceName): boolean; ok(name: SurfaceName): boolean; anyFloating: boolean;
}
// What the inputs allow. A surface has a floor when it is present, at least 56px wide and, for the dock, an input
// card that accepts input on an open panel. ok: the buddy may stand there now.
function read(inputs: DockedInputs): View {
  const s = inputs.surfaces, panel = inputs.panel, r = inputs.reasons;
  const stepAside = r.queue || r.prompts || r.waiting;
  const folded = panel.folded || panel.folding;
  const floor = (name: SurfaceName) => { const v = s[name]; return !!v && v.present && v.width >= SIZE && (name !== "dock" || (s.dock!.accepts !== false && !folded)); };
  const floating = (name: SurfaceName) => !!s[name]?.floating;
  const ok = (name: SurfaceName) => floor(name) && !floating(name) && !(name === "dock" && stepAside);
  return { s, stepAside, folded, floor, floating, ok, anyFloating: floating("dock") || floating("tools") };
}
// The surface the rules want now. The dock is home; the toolbar keeps the buddy only after an idle visit.
function want(st: DockedState, v: View): SurfaceName | null {
  const cur = st.surface;
  if (cur && v.ok(cur) && (cur === "dock" || st.visit === "idle")) return cur;
  if (v.ok("dock")) return "dock";
  if (v.ok("tools")) return "tools";
  return null;
}
// A narrower floor clamps x at once. A surface without a floor (a folding panel) keeps the remembered x.
function clampX(st: DockedState, inputs: DockedInputs, v: View) {
  const s = st.surface && inputs.surfaces[st.surface];
  if (s && v.floor(st.surface!)) st.x = Math.max(-2, Math.min(trackMax(s.width), st.x));
}
// Reparents only while fully concealed. A first toolbar visit is centred; later visits keep each surface's x.
function moveTo(st: DockedState, dest: SurfaceName | null, inputs: DockedInputs) {
  if (!dest || dest === st.surface) return;
  if (st.surface) st.slots[st.surface] = st.x;
  st.surface = dest;
  const width = inputs.surfaces[dest]!.width;
  const first = dest === "tools" ? (width - SIZE)/2 : 16;
  st.x = Math.max(-2, Math.min(trackMax(width), st.slots[dest] ?? first));
  st.motion = null; st.stepsLeft = 0;
}
function startTrip(st: DockedState, dest: SurfaceName | null, random: () => number, opts: { hold?: boolean; quick?: boolean; idle?: boolean } = {}) {
  st.stepsLeft = 0;
  // A preparation that has not left the floor is cancelled; an airborne hop or a landing finishes first.
  if (st.motion && hopPose(st).phase === "prepare") st.motion = null;
  const style = opts.hold || opts.quick ? HIDES[0]! : HIDES[Math.floor(random()*HIDES.length)]!;
  const hidden = st.conceal === 1;
  st.trip = { destination: dest, phase: hidden ? "waiting" : "leaving", from: st.conceal, at: hidden ? st.time : null, style,
    wait: opts.hold ? 0 : .25 + random()*.35, idle: !!opts.idle, hold: !!opts.hold, closedAt: null, quick: false };
}
// No floor under the buddy, or its surface left: hidden at once, so it is never seen crossing the page.
function drop(st: DockedState, dest: SurfaceName | null, random: () => number) {
  st.conceal = 1; st.motion = null; st.stepsLeft = 0;
  st.trip = { destination: dest, phase: "waiting", from: 1, at: st.time, style: null, wait: .25 + random()*.35, idle: false, hold: false, closedAt: null, quick: false };
}
function rise(st: DockedState) { st.trip = { destination: st.surface, phase: "arriving", from: st.conceal, at: st.time, quick: true, idle: false, hold: false, closedAt: null }; }
function arrive(st: DockedState, dest: SurfaceName, inputs: DockedInputs, v: View, quick: boolean) {
  const idle = !!st.trip?.idle, newX = st.trip ? st.trip.newX : undefined;
  moveTo(st, dest, inputs);
  if (newX !== undefined && st.surface) st.x = -2 + newX*(trackMax(inputs.surfaces[st.surface]!.width) + 2);
  st.visit = st.surface === "tools" ? (idle && !v.stepAside && v.floor("dock") ? "idle" : "forced") : null;
  st.trip = { destination: st.surface, phase: "arriving", from: st.conceal, at: st.time, quick, idle: false, hold: false, closedAt: null };
}
function done(st: DockedState) { st.trip = null; st.conceal = 0; st.nextMove = st.time + 1.5; st.idleLeft = null; }

// Time is not running (not visible, reduced motion): every surface and hide change applies at once.
function settle(st: DockedState, v: View, inputs: DockedInputs) {
  st.trip = null; st.idleLeft = null;
  if (st.surface === "tools" && (v.stepAside || !v.floor("dock"))) st.visit = "forced";
  const hide = () => { if (st.conceal !== 1) { st.conceal = 1; st.motion = null; st.stepsLeft = 0; } };
  if (st.surface && v.floor(st.surface) && v.floating(st.surface)) return hide();
  const w = want(st, v);
  if (w === null) return hide();
  if (w !== st.surface) { moveTo(st, w, inputs); st.visit = w === "tools" ? "forced" : null; }
  if (st.conceal !== 0) { st.conceal = 0; st.motion = null; st.stepsLeft = 0; }
}

// Priority: no floor or surface gone > overlapping floating element > step-aside reason > folded panel > idle trip.
function decide(st: DockedState, v: View, inputs: DockedInputs, dt: number, random: () => number) {
  const cur = st.surface;
  if (cur === "tools" && (v.stepAside || !v.floor("dock"))) st.visit = "forced";
  const trip = st.trip;
  // The input card is still on screen but takes no input: the buddy goes down with the quick hide instead of popping
  // out. A card that is gone, folding or too narrow still drops it at once.
  const sc = cur === "dock" ? v.s.dock : null;
  if (sc && sc.present && sc.width >= SIZE && !v.folded && sc.accepts === false) {
    const w = want(st, v);
    if (!trip) { if (st.conceal < 1) startTrip(st, w, random, { quick: true }); else drop(st, w, random); return; }
    if (trip.phase === "arriving") { startTrip(st, w, random, { quick: true }); return; }
    trip.hold = false; trip.destination = w;
    return;
  }
  if (!cur || !v.floor(cur)) {
    if (trip && trip.phase === "waiting" && !trip.hold && st.conceal === 1) trip.destination = want(st, v);
    else drop(st, want(st, v), random);
    return;
  }
  // A floating element over the buddy's own box: down until every one closes, then 1 s, then the rules again.
  if (v.floating(cur) && (!trip || trip.phase === "arriving" || trip.hold)) {
    if (trip && trip.hold) trip.closedAt = null;
    else startTrip(st, cur, random, { hold: true });
    return;
  }
  if (trip && trip.hold) {
    if (trip.closedAt === null) trip.closedAt = st.time;
    if (st.time - trip.closedAt < FLOAT_WAIT) return;
    const w = want(st, v);
    if (w === cur) { rise(st); return; }
    trip.hold = false; trip.destination = w;
    if (w !== null && st.conceal === 1) arrive(st, w, inputs, v, false);
    return;
  }
  const w = want(st, v);
  if (trip) {
    if (trip.phase === "arriving") { if (w !== cur) startTrip(st, w, random); return; }
    if (trip.idle) { if (trip.destination && v.ok(trip.destination)) return; trip.idle = false; }
    if (trip.phase === "leaving" && w === cur) {
      // Retarget from the current concealed fraction; a departure that has not started yet just ends.
      if (trip.at === null && st.conceal === 0) st.trip = null; else rise(st);
      return;
    }
    trip.destination = w;
    return;
  }
  if (w === null) { if (st.conceal < 1) startTrip(st, null, random); return; }
  if (w !== cur || st.conceal === 1) { startTrip(st, w, random); return; }
  // Idle trips: only while the person rests and nothing else holds the buddy. Overview has no toolbar, so it hides
  // and returns at the same input.
  const free = !v.stepAside && !v.folded && !v.anyFloating;
  if (!(free && inputs.resting && attention(st) !== "input")) { st.idleLeft = null; return; }
  if (st.idleLeft === null) st.idleLeft = TRIP_MIN + random()*TRIP_SPREAD;
  st.idleLeft -= dt;
  if (st.idleLeft <= 0) idleTrip(st, v, random);
}
// A click on the buddy: the same choreography as an idle trip, to the other surface when the rules allow it, else
// to a new random x on the same surface, so a click always gets a visible answer.
function pokeTrip(st: DockedState, v: View, random: () => number) {
  const other = st.surface === "dock" ? "tools" : "dock";
  const go = v.ok(other) ? other : st.surface;
  startTrip(st, go, random, { idle: true });
  if (go === st.surface) st.trip!.newX = random();
  st.idleLeft = null;
}
function idleTrip(st: DockedState, v: View, random: () => number) {
  const other = st.surface === "dock" ? "tools" : "dock";
  startTrip(st, v.ok(other) ? other : st.surface, random, { idle: true });
  st.idleLeft = null;
}
function advanceTrip(st: DockedState, inputs: DockedInputs, v: View) {
  const trip = st.trip;
  if (!trip || st.motion) return;
  if (trip.at === null) trip.at = st.time;
  const elapsed = st.time - trip.at;
  if (trip.phase === "leaving") {
    const u = clamp01((elapsed - trip.style!.delay)/trip.style!.duration);
    st.conceal = trip.from + (1 - trip.from)*smooth(u);
    if (u === 1) { trip.phase = "waiting"; trip.at = st.time; }
  } else if (trip.phase === "waiting") {
    if (trip.hold || trip.destination === null || elapsed < trip.wait!) return;
    arrive(st, trip.destination, inputs, v, false);
  } else if (trip.quick) {
    const u = Math.min(1, elapsed/RISE);
    st.conceal = trip.from*(1 - smooth(u));
    if (u === 1) done(st);
  } else {
    const peek = PEEK/DROP;
    if (elapsed < .22) st.conceal = 1 + (peek - 1)*smooth(elapsed/.22);
    else if (elapsed < .34) st.conceal = peek;
    else { const u = Math.min(1, (elapsed - .34)/.22); st.conceal = peek*(1 - smooth(u)); if (u === 1) done(st); }
  }
}
// The first step stands the buddy at rest on the current surface, without a hide or reveal.
function mount(st: DockedState, v: View, inputs: DockedInputs) {
  st.mounted = true;
  const w = want(st, v), s = v.s;
  const at = w || (s.dock && s.dock.present ? "dock" : s.tools && s.tools.present ? "tools" : null);
  moveTo(st, at, inputs);
  st.visit = st.surface === "tools" ? "forced" : null;
  st.conceal = w ? 0 : 1;
}
function presence(st: DockedState): Presence {
  const trip = st.trip;
  if (!trip) return st.conceal === 0 ? "shown" : "hidden";
  if (trip.phase === "leaving") return "hiding";
  if (trip.phase === "arriving") return "revealing";
  return trip.hold || trip.destination === null ? "hidden" : "waiting";
}

// One step. now is a rAF timestamp in ms; random() returns [0, 1). Updates state in place and returns what to draw.
// While not visible or under reduced motion no time passes and every change applies at once; the first step after
// a pause advances at most 35 ms.
export function advanceDocked(st: DockedState, inputs: DockedInputs, now: number, random: () => number): DockedFrame {
  const dt = Math.min(.035, st.last ? (now - st.last)/1000 : 1/60);
  st.last = now;
  const v = read(inputs);
  if (!st.mounted) mount(st, v, inputs);
  const reduced = inputs.reduced;
  if (reduced !== st.reduced) {
    st.reduced = reduced; st.motion = null; st.stepsLeft = 0; st.bodyLean = 0; st.hat = 0; st.hatV = 0;
    settle(st, v, inputs);
    if (!reduced) st.nextMove = st.time + 2;
  }
  let poked = false;
  for (const e of inputs.events) {
    if (e === "poke") poked = true;
    else if (e === "input") st.typingUntil = st.time + 2.2;
    else { st.forced = "thread"; st.focusUntil = st.time + 1.5; }
  }
  if (reduced || !inputs.visible) {
    // Not animating: a click still moves the buddy, at once.
    if (poked && st.surface && st.conceal === 0 && !st.trip) {
      const other = st.surface === "dock" ? "tools" : "dock";
      if (v.ok(other)) { moveTo(st, other, inputs); st.visit = other === "tools" ? "idle" : null; }
      else {
        // The draft reads the surface unguarded; a surface gone in the same frame keeps x instead of throwing.
        const s = inputs.surfaces[st.surface];
        if (s) st.x = -2 + random()*(trackMax(s.width) + 2);
      }
    }
    settle(st, v, inputs);
    clampX(st, inputs, v);
    return frame(st);
  }
  st.time += dt;
  const t = st.time, focus = attention(st);
  decide(st, v, inputs, dt, random);
  if (poked && st.surface && st.conceal === 0 && !st.trip) pokeTrip(st, v, random);
  const width = st.surface && inputs.surfaces[st.surface] ? inputs.surfaces[st.surface]!.width : SIZE;
  if (st.motion) {
    const m = st.motion, age = t - m.start;
    // Horizontal movement happens only in the air.
    if (age >= m.prepare) st.x = m.from + (m.to - m.from)*smooth(clamp01((age - m.prepare)/m.flight));
    if (age >= m.prepare + m.flight + m.settle) { st.x = m.to; st.motion = null; st.nextMove = t + (st.stepsLeft > 0 ? .12 : 2.8 + random()*2.4); }
  }
  if (!st.motion && !st.trip && st.conceal === 0) {
    const room = trackMax(width);
    if (st.direction > 0 && room - st.x < 12) st.direction = -1; else if (st.direction < 0 && st.x < 0) st.direction = 1;
    if (focus === "walk" && t >= st.nextMove) {
      if (t >= st.nextHop) { beginMove(st, width, random, true); st.nextHop = t + 16 + random()*9; st.stepsLeft = 0; }
      else {
        if (st.stepsLeft === 0) { st.stepsLeft = 2 + Math.floor(random()*2); st.direction = random() < .5 ? -1 : 1; }
        beginMove(st, width, random, false); st.stepsLeft--;
      }
    } else if (focus !== "walk") { st.stepsLeft = 0; st.nextMove = t + 1.1; }
  }
  clampX(st, inputs, v);
  advanceTrip(st, inputs, v);
  // Eyes lead a new direction; the body follows softly and only moves during a hop.
  const x = focus === "input" ? .08 : focus === "thread" ? 0 : st.motion || st.nextMove - t < .45 ? st.direction*.55 : st.direction*.12;
  const y = st.conceal > 0 ? -.55 : focus === "input" ? .75 : focus === "thread" ? -.75 : 0;
  st.lookX += (x - st.lookX)*(1 - Math.exp(-dt*9)); st.lookY += (y - st.lookY)*(1 - Math.exp(-dt*9));
  st.bodyLean += (st.lookX*.025 - st.bodyLean)*(1 - Math.exp(-dt*3));
  const hatTarget = -st.bodyLean*.55 - hopPose(st).tilt*.35;
  st.hatV += (hatTarget - st.hat)*70*dt; st.hatV *= Math.exp(-dt*12); st.hat += st.hatV*dt;
  // Blinks: Home's 420 ms, every 4–8 s.
  if (t >= st.nextBlink) { st.blinkAt = t; st.nextBlink = t + 4 + random()*4; }
  const b = t - st.blinkAt;
  st.eye = b >= 0 && b < .42 ? 1 - .96*Math.sin(Math.PI*b/.42) : 1;
  return frame(st);
}

// What to draw. Reduced motion rests like Home: no breathing, blink, gaze or hop, and a static shadow.
function frame(st: DockedState): DockedFrame {
  const rig = buddy(st.buddy).rig, g = dockedGeometry(st.buddy), still = st.reduced;
  const moving = still ? REST : hopPose(st);
  const big = !!st.motion?.big;
  const airborne = still ? 0 : clamp01(moving.lift/(big ? .18 : .075));
  const focus = attention(st);
  const slots = { ...st.slots };
  if (st.surface) slots[st.surface] = st.x;
  return {
    surface: st.surface, conceal: st.conceal, presence: presence(st), slots, hideStyle: st.trip && st.trip.style ? st.trip.style.name : null,
    host: { x: st.x, y: st.conceal*DROP },
    pose: {
      time: still ? 0 : st.time, squash: moving.squash + (still ? 0 : Math.sin(st.time*1.6)*.003), lift: moving.lift,
      tilt: still ? 0 : moving.tilt + st.bodyLean, hatTilt: still ? 0 : Math.max(rig.accessoryTilt[0], Math.min(rig.accessoryTilt[1], st.hat)),
      energy: big ? .3 : 0, eyeOpen: still ? 1 : st.eye, lookX: still ? 0 : st.lookX, lookY: still ? 0 : st.lookY,
      hopLift: moving.lift/(.22*rig.liftScale), phase: moving.phase,
    },
    // Short hop apex .55 × .70, large .40 × .70; opacity .34 on the floor, .16 at the apex, times (1 - conceal).
    shadow: { x: st.x + g.contactX, scaleX: 1 - airborne*(big ? .6 : .45), scaleY: 1 - airborne*.3, opacity: (.34 - airborne*.18)*(1 - st.conceal) },
    attention: focus,
    mode: still ? "reduced-motion" : st.motion ? moving.phase as DockedMode : focus === "walk" ? "idle" : "attentive",
  };
}
