import type { BuddyId } from "./buddies";

// First run's Cover Flow row. Every input (a card click, an arrow, a horizontal scroll) lands on one buddy, which the
// caller selects: checks the radio, saves it and moves the row. The row is linear; its ends are ends.

export function cardOffset(order: readonly BuddyId[], id: BuddyId, selected: BuddyId): number {
  return order.indexOf(id) - order.indexOf(selected);
}

const ARROWS = new Map<string, -1 | 1>([["ArrowLeft", -1], ["ArrowUp", -1], ["ArrowRight", 1], ["ArrowDown", 1]]);
// null: not an arrow, left alone (Return does nothing in the group). An arrow at an end keeps the choice, and the
// caller still prevents the native radio wrap.
export function keyTarget(order: readonly BuddyId[], selected: BuddyId, key: string): BuddyId | null {
  const step = ARROWS.get(key);
  return step === undefined ? null : stepTarget(order, selected, step);
}

// Where a wheel step (or an arrow) lands, stopping at the ends.
export function stepTarget(order: readonly BuddyId[], selected: BuddyId, step: -1 | 0 | 1): BuddyId {
  return order[Math.max(0, Math.min(order.length - 1, order.indexOf(selected) + step))]!;
}

// A horizontal scroll (a trackpad swipe and its momentum, or Shift + a mouse wheel) moves the row continuously, a
// fraction of a card per event; when the events stop the row snaps to the nearest card and only that card is picked,
// so the cards passed over are never saved. Arrows and clicks still move one card.
// Tuned on recorded trackpad swipes (.scratch, 2026-11-10): one fast swipe sends about 3,000 px with its momentum, a
// fast double swipe about 6,000 px; a gentle swipe a few hundred.
export const WHEEL_PX_PER_CARD = 1000;
// Momentum events come every ~16 ms and never pause past ~60 ms, so 160 ms of quiet ends the scroll.
export const WHEEL_QUIET = 160;
export const SNAP_MS = 240;
// How fast the shown row catches up with the scrolled position: an exponential ease, so the row glides between events.
const FOLLOW_MS = 40;
export interface WheelEventLike { deltaX: number; deltaY: number; shiftKey: boolean }

// position: the row's place as a fractional index into its order. handled false: a vertical scroll, left to the page.
// Shift + a vertical wheel scrolls horizontally (macOS already sends it as deltaX; other setups may not).
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

// An ease-out (cubic) from where the scroll stopped to the nearest card.
export function snapPosition(from: number, to: number, elapsed: number): number {
  const t = Math.min(1, elapsed / SNAP_MS);
  return from + (to - from) * (1 - (1 - t) ** 3);
}

// The [data-o] layout in styles.css (translateX of min(px, %) of the row's width, a 50° turn and 84% size past the
// middle), at any fraction between its steps, for the row while it scrolls.
const STEPS: readonly [number, number][] = [[0, 0], [200, .21], [268, .28], [316, .32], [364, .37]];
export function cardLayout(offset: number, rowWidth: number): { x: number; rotate: number; scale: number; z: number } {
  const k = Math.min(Math.abs(offset), 4), i = Math.floor(k), f = k - i, sign = Math.sign(offset);
  const at = (step: number) => Math.min(STEPS[step]![0], STEPS[step]![1] * rowWidth);
  const x = at(i) + (i < 4 ? (at(i + 1) - at(i)) * f : 0);
  const turn = Math.min(k, 1);
  return { x: sign * x || 0, rotate: -sign * 50 * turn || 0, scale: 1 - .16 * turn, z: 5 - Math.round(k) };
}
