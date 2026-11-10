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

// A trackpad swipe sends many wheel events, momentum included, so one gesture moves one card: act on the first delta
// past the threshold, then ignore the rest until the events stop for WHEEL_QUIET ms.
export const WHEEL_THRESHOLD = 12;
export const WHEEL_QUIET = 160;
export interface WheelGesture { done: boolean; last: number }
export const WHEEL_IDLE: WheelGesture = { done: false, last: -Infinity };
export interface WheelEventLike { deltaX: number; deltaY: number; shiftKey: boolean; time: number }

// handled false: a vertical scroll, left to the page. Shift + a vertical wheel scrolls horizontally (macOS already
// sends it as deltaX; other setups may not).
export function wheelInput(gesture: WheelGesture, event: WheelEventLike): { handled: boolean; step: -1 | 0 | 1; gesture: WheelGesture } {
  const dx = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
  if (Math.abs(dx) <= Math.abs(event.shiftKey ? 0 : event.deltaY)) return { handled: false, step: 0, gesture };
  const done = event.time - gesture.last < WHEEL_QUIET && gesture.done;
  if (done || Math.abs(dx) < WHEEL_THRESHOLD) return { handled: true, step: 0, gesture: { done, last: event.time } };
  return { handled: true, step: dx > 0 ? 1 : -1, gesture: { done: true, last: event.time } };
}
