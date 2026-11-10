// SPDX-License-Identifier: MIT
// The buddies' motion model, ported from the buddy draft .doan/assets/buddies/motion-preview.js
// (MIT, Doan contributors), whose time model is Doany's V1 .doan/assets/doany/motion/mascot.js with a slower blink.
// The formulas, constants and operation order are the draft's, unchanged: doanyMotion.test.ts compares every value
// bit for bit with the draft run in a vm (app/scripts/doanyGolden.mjs). Only the DOM/WebGL coupling is removed;
// the per-buddy drawn bounds are in Doany.tsx (drawnPose), and the greet/blink/pause study controls are not ported.

export type Mode = "idle" | "attentive" | "jump" | "reduced-motion";

export interface MotionState {
  time: number; lookX: number; lookY: number; targetX: number; targetY: number;
  hat: number; hatV: number; jumpAt: number; blinkAt: number; nextBlink: number;
  typingUntil: number; pointerUntil: number; last: number; eye: number; mode: Mode;
}

export interface Pose {
  time: number; squash: number; lift: number; tilt: number; hatTilt: number; energy: number; eyeOpen: number;
  look: [number, number]; mode: Mode;
}

export interface Rect { x: number; y: number; width: number; height: number }

export function initialState(): MotionState {
  return { time: 0, lookX: 0, lookY: 0, targetX: 0, targetY: 0, hat: 0, hatV: 0, jumpAt: -99, blinkAt: 2, nextBlink: 2, typingUntil: 0, pointerUntil: 0, last: 0, eye: 1, mode: "idle" };
}

// The draft's render(), without drawing.
export function pose(state: MotionState, reduced: boolean): Pose {
  const t = state.time, still = reduced;
  let squash = still ? 0 : Math.sin(t * 1.9) * .016, lift = 0, energy = 0, tilt = still ? 0 : Math.sin(t * .85) * .025 + state.lookX * .065;
  let mode: Mode = "idle";
  if (!still && t < state.typingUntil) { mode = "attentive"; tilt *= .6; squash += .025; }
  const j = t - state.jumpAt;
  if (!still && j < 1.35) {
    mode = "jump"; energy = Math.exp(-j * 2);
    if (j < .18) squash += .15 * Math.sin(j / .18 * Math.PI / 2);
    else if (j < .75) { const a = (j - .18) / .57; lift = .22 * Math.sin(a * Math.PI); squash -= .085 * Math.sin(a * Math.PI); }
    else { const a = j - .75; squash += .12 * Math.exp(-a * 7) * Math.cos(a * 17); }
  }
  return {
    time: still ? 0 : t, squash, lift, tilt, hatTilt: still ? 0 : state.hat, energy, eyeOpen: still ? 1 : state.eye,
    look: [still ? 0 : state.lookX, still ? 0 : state.lookY], mode: still ? "reduced-motion" : mode,
  };
}

// The state half of the draft's tick(): `last` moves on every frame, so the first dt after a pause is
// the real gap (capped at 0.035), and time only runs while `gate` is open (ready, visible, document
// shown, motion allowed). Returns whether the frame advanced, which is when the draft draws.
export function advance(state: MotionState, now: number, gate: boolean, random: () => number): boolean {
  const dt = Math.min(.035, state.last ? (now - state.last) / 1000 : 1 / 60); state.last = now;
  if (!gate) return false;
  state.time += dt;
  const t = state.time;
  let x = state.targetX, y = state.targetY;
  if (t > state.pointerUntil) { x = Math.sin(t * .65) * .42; y = Math.sin(t * .39) * .25; }
  if (t < state.typingUntil) { x = Math.sin(t * 2) * .12; y = .8; }
  state.lookX += (x - state.lookX) * (1 - Math.exp(-dt * 5)); state.lookY += (y - state.lookY) * (1 - Math.exp(-dt * 5));
  const hatTarget = -state.lookX * .09 + Math.sin(t * 1.9) * .025;
  state.hatV += (hatTarget - state.hat) * 45 * dt; state.hatV *= Math.exp(-dt * 6); state.hat += state.hatV * dt;
  if (t >= state.nextBlink) { state.blinkAt = t; state.nextBlink = t + 4 + random() * 4; }
  const b = t - state.blinkAt;
  state.eye = b >= 0 && b < .42 ? 1 - .96 * Math.sin(Math.PI * b / .42) : 1;
  return true;
}

// How far into its hop the buddy is, 0 on the floor to 1 at the apex: the floor shadow shrinks and fades with it.
// The hop's height is .22 before a buddy's own multiplier, so this is the same for every buddy.
export function hopLift(pose: Pose): number {
  return pose.lift / .22;
}

export function pointer(state: MotionState, clientX: number, clientY: number, rect: Rect): void {
  state.targetX = Math.max(-1, Math.min(1, (clientX - rect.x - rect.width / 2) / (rect.width * 1.5)));
  state.targetY = Math.max(-1, Math.min(1, (clientY - rect.y - rect.height / 2) / (rect.height * 1.5)));
  state.pointerUntil = state.time + 1.8;
}

export function hop(state: MotionState, reduced: boolean): void {
  if (reduced) return;
  state.jumpAt = state.time; state.hatV -= .9;
}

export function typing(state: MotionState): void {
  state.typingUntil = state.time + 1.4;
}

export function reducedChanged(state: MotionState): void {
  state.hat = 0; state.hatV = 0;
}

export function canvasSize(clientWidth: number, devicePixelRatio: number): number {
  return Math.min(1024, Math.ceil(clientWidth * Math.min(devicePixelRatio || 1, 2)));
}
