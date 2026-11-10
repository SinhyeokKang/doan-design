import { expect, test } from "vitest";
import { FIRST_RUN_ORDER } from "./buddies";
import { cardOffset, keyTarget, stepTarget, WHEEL_IDLE, wheelInput, type WheelGesture } from "./coverFlow";

test("a card's offset is its distance from the chosen card in the row's order", () => {
  expect(FIRST_RUN_ORDER.map(id => cardOffset(FIRST_RUN_ORDER, id, "doany"))).toEqual([-2, -1, 0, 1, 2]);
  expect(FIRST_RUN_ORDER.map(id => cardOffset(FIRST_RUN_ORDER, id, "dori"))).toEqual([-4, -3, -2, -1, 0]);
  expect(FIRST_RUN_ORDER.map(id => cardOffset(FIRST_RUN_ORDER, id, "popo"))).toEqual([0, 1, 2, 3, 4]);
});

test("← and ↑ move left, → and ↓ move right, and both stop at the ends instead of wrapping", () => {
  expect(keyTarget(FIRST_RUN_ORDER, "doany", "ArrowLeft")).toBe("puri");
  expect(keyTarget(FIRST_RUN_ORDER, "doany", "ArrowUp")).toBe("puri");
  expect(keyTarget(FIRST_RUN_ORDER, "doany", "ArrowRight")).toBe("dungdung");
  expect(keyTarget(FIRST_RUN_ORDER, "doany", "ArrowDown")).toBe("dungdung");
  // The ends are ends: the key is still taken (no native wrap), but the choice stays.
  expect(keyTarget(FIRST_RUN_ORDER, "popo", "ArrowLeft")).toBe("popo");
  expect(keyTarget(FIRST_RUN_ORDER, "popo", "ArrowUp")).toBe("popo");
  expect(keyTarget(FIRST_RUN_ORDER, "dori", "ArrowRight")).toBe("dori");
  expect(keyTarget(FIRST_RUN_ORDER, "dori", "ArrowDown")).toBe("dori");
  // Return and every other key are left alone.
  for (const key of ["Enter", " ", "Tab", "Home", "End", "a"]) expect(keyTarget(FIRST_RUN_ORDER, "doany", key)).toBeNull();
});

const start: WheelGesture = WHEEL_IDLE;
const wheel = (deltaX: number, deltaY: number, time: number, shiftKey = false) => ({ deltaX, deltaY, shiftKey, time });

test("one horizontal gesture moves one card, however many wheel events it sends", () => {
  let gesture = start;
  const steps: number[] = [];
  // A swipe right with momentum: deltas keep coming, each under 160 ms after the last.
  for (const [dx, t] of [[4, 0], [20, 16], [40, 32], [38, 48], [25, 64], [12, 120], [3, 270]] as const) {
    const out = wheelInput(gesture, wheel(dx, 0, t));
    expect(out.handled).toBe(true);
    steps.push(out.step);
    gesture = out.gesture;
  }
  expect(steps).toEqual([0, 1, 0, 0, 0, 0, 0]);
  // After 160 ms of quiet the gesture has ended; the next swipe (left) moves one card again.
  const next = wheelInput(gesture, wheel(-30, 0, 270 + 160));
  expect(next.step).toBe(-1);
  expect(wheelInput(next.gesture, wheel(-30, 0, 450)).step).toBe(0);
});

test("a delta under the threshold does not move and does not use up the gesture", () => {
  const small = wheelInput(start, wheel(11, 0, 0));
  expect(small).toEqual({ handled: true, step: 0, gesture: { done: false, last: 0 } });
  expect(wheelInput(small.gesture, wheel(12, 0, 10)).step).toBe(1);
});

test("Shift + a vertical wheel scrolls horizontally; a plain vertical scroll is left to the page", () => {
  expect(wheelInput(start, wheel(0, 30, 0, true)).step).toBe(1);
  expect(wheelInput(start, wheel(0, -30, 0, true)).step).toBe(-1);
  // macOS already sends Shift + wheel as deltaX.
  expect(wheelInput(start, wheel(-30, 0, 0, true)).step).toBe(-1);
  const vertical = wheelInput(start, wheel(5, 30, 0));
  expect(vertical).toEqual({ handled: false, step: 0, gesture: start });
  // A mostly vertical event neither moves nor extends the gesture.
  const swiped = wheelInput(start, wheel(30, 0, 0)).gesture;
  expect(wheelInput(swiped, wheel(2, 40, 100)).gesture).toBe(swiped);
});

test("a wheel step lands on the next card and stops at the ends", () => {
  expect(stepTarget(FIRST_RUN_ORDER, "doany", 1)).toBe("dungdung");
  expect(stepTarget(FIRST_RUN_ORDER, "doany", -1)).toBe("puri");
  expect(stepTarget(FIRST_RUN_ORDER, "doany", 0)).toBe("doany");
  expect(stepTarget(FIRST_RUN_ORDER, "dori", 1)).toBe("dori");
  expect(stepTarget(FIRST_RUN_ORDER, "popo", -1)).toBe("popo");
});
