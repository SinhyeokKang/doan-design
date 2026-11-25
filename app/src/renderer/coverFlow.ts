import type { BuddyId } from "./buddies";

// Every input lands on one buddy, which the caller selects. The row is linear; its ends are ends.

export function cardOffset(order: readonly BuddyId[], id: BuddyId, selected: BuddyId): number {
  return order.indexOf(id) - order.indexOf(selected);
}

const ARROWS = new Map<string, -1 | 1>([["ArrowLeft", -1], ["ArrowUp", -1], ["ArrowRight", 1], ["ArrowDown", 1]]);
// null: not an arrow. An arrow at an end keeps the choice, and the caller still prevents the native radio wrap.
export function keyTarget(order: readonly BuddyId[], selected: BuddyId, key: string): BuddyId | null {
  const step = ARROWS.get(key);
  return step === undefined ? null : stepTarget(order, selected, step);
}

export function stepTarget(order: readonly BuddyId[], selected: BuddyId, step: -1 | 0 | 1): BuddyId {
  return order[Math.max(0, Math.min(order.length - 1, order.indexOf(selected) + step))]!;
}

// Only the card the row snaps to is picked, so cards passed over are never saved. Tuned so a fast swipe with
// momentum (about 3,000 px) does not feel slow.
export const WHEEL_PX_PER_CARD = 600;
// Momentum events come every ~16 ms and never pause past ~60 ms, so 160 ms of quiet ends the scroll.
export const WHEEL_QUIET = 160;
export const SNAP_MS = 240;
// An exponential ease, so the row glides between events.
const FOLLOW_MS = 40;
export interface WheelEventLike { deltaX: number; deltaY: number; shiftKey: boolean }

// handled false: a vertical scroll, left to the page. macOS already sends Shift + wheel as deltaX; other setups may
// not.
export function scrollPosition(position: number, event: WheelEventLike, count: number): { handled: boolean; position: number } {
  const dx = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
  if (Math.abs(dx) <= Math.abs(event.shiftKey ? 0 : event.deltaY)) return { handled: false, position };
  return { handled: true, position: Math.max(0, Math.min(count - 1, position + dx / WHEEL_PX_PER_CARD)) };
}

export function snapTarget(order: readonly BuddyId[], position: number): BuddyId {
  return order[Math.max(0, Math.min(order.length - 1, Math.round(position)))]!;
}

export function followPosition(shown: number, target: number, elapsed: number): number {
  return shown + (target - shown) * (1 - Math.exp(-elapsed / FOLLOW_MS));
}

export function snapPosition(from: number, to: number, elapsed: number): number {
  const t = Math.min(1, elapsed / SNAP_MS);
  return from + (to - from) * (1 - (1 - t) ** 3);
}

// The [data-o] layout in styles.css, at any fraction between its steps, for the row while it scrolls.
const STEPS: readonly [number, number][] = [[0, 0], [200, .21], [268, .28], [316, .32], [364, .37]];
export function cardLayout(offset: number, rowWidth: number): { x: number; rotate: number; scale: number; z: number } {
  const k = Math.min(Math.abs(offset), 4), i = Math.floor(k), f = k - i, sign = Math.sign(offset);
  const at = (step: number) => Math.min(STEPS[step]![0], STEPS[step]![1] * rowWidth);
  const x = at(i) + (i < 4 ? (at(i + 1) - at(i)) * f : 0);
  const turn = Math.min(k, 1);
  return { x: sign * x || 0, rotate: -sign * 50 * turn || 0, scale: 1 - .16 * turn, z: 5 - Math.round(k) };
}
