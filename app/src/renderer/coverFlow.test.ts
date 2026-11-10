import { expect, test } from "vitest";
import { FIRST_RUN_ORDER } from "./buddies";
import { cardLayout, cardOffset, followPosition, keyTarget, scrollPosition, SNAP_MS, snapPosition, snapTarget, stepTarget, WHEEL_PX_PER_CARD } from "./coverFlow";

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

// A horizontal scroll (a trackpad swipe with its momentum, or Shift + a wheel) moves the row continuously; when the
// events stop it snaps to the nearest card, and only that card is picked.
const scroll = (dx: number, dy = 0, shiftKey = false) => ({ deltaX: dx, deltaY: dy, shiftKey });

test("horizontal deltas move the row by fractions of a card, WHEEL_PX_PER_CARD px per card", () => {
  const at = scrollPosition(2, scroll(WHEEL_PX_PER_CARD / 4), FIRST_RUN_ORDER.length);
  expect(at).toEqual({ handled: true, position: 2.25 });
  expect(scrollPosition(2.25, scroll(-WHEEL_PX_PER_CARD), FIRST_RUN_ORDER.length).position).toBeCloseTo(1.25);
});

test("the row is clamped at both ends", () => {
  expect(scrollPosition(3.5, scroll(WHEEL_PX_PER_CARD * 3), 5).position).toBe(4);
  expect(scrollPosition(0.5, scroll(-WHEEL_PX_PER_CARD * 3), 5).position).toBe(0);
});

test("Shift + a vertical wheel scrolls horizontally; a plain vertical scroll is left to the page", () => {
  expect(scrollPosition(2, scroll(0, WHEEL_PX_PER_CARD, true), 5)).toEqual({ handled: true, position: 3 });
  // macOS already sends Shift + wheel as deltaX.
  expect(scrollPosition(2, scroll(-WHEEL_PX_PER_CARD, 0, true), 5)).toEqual({ handled: true, position: 1 });
  expect(scrollPosition(2, scroll(5, 30), 5)).toEqual({ handled: false, position: 2 });
});

test("a fast double swipe with momentum (recorded on a trackpad) runs several cards, then snaps to one", () => {
  // The recorded deltas of one fast double swipe right from Doany: the second swipe starts inside the first's momentum.
  const deltas = [4, 18, 52, 67, 56, 62, 62, 60, 59, 57, 58, 55, 51, 47, 31, 13, 78, 144, 134, 198, 199, 188, 177, 167, 158, 142, 134, 129, 124, 119, 113, 109, 105, 100, 96, 90, 85, 82, 77, 72, 68, 63, 59, 55, 51, 47, 43, 41, 37, 34, 32, 29, 26, 24, 22, 20, 19, 17, 16, 14];
  let position = 2;
  for (const dx of deltas) position = scrollPosition(position, scroll(dx), 5).position;
  expect(position).toBe(4);
  expect(snapTarget(FIRST_RUN_ORDER, position)).toBe("dori");
});

test("snapTarget is the card nearest the row's position", () => {
  expect(snapTarget(FIRST_RUN_ORDER, 2.49)).toBe("doany");
  expect(snapTarget(FIRST_RUN_ORDER, 2.5)).toBe("dungdung");
  expect(snapTarget(FIRST_RUN_ORDER, 0.2)).toBe("popo");
});

test("the shown position eases toward the scrolled one instead of jumping per event", () => {
  expect(followPosition(2, 3, 0)).toBe(2);
  const one = followPosition(2, 3, 16);
  expect(one).toBeGreaterThan(2.1);
  expect(one).toBeLessThan(2.6);
  expect(followPosition(2, 3, 1000)).toBeCloseTo(3, 3);
});

test("the snap is a short ease-out", () => {
  expect(SNAP_MS).toBeGreaterThanOrEqual(200);
  expect(SNAP_MS).toBeLessThanOrEqual(300);
  expect(snapPosition(2.3, 3, 0)).toBe(2.3);
  expect(snapPosition(2.3, 3, SNAP_MS)).toBe(3);
  expect(snapPosition(2.3, 3, SNAP_MS * 2)).toBe(3);
  // Ease-out: more than half the way in the first half of the time.
  expect(snapPosition(2, 3, SNAP_MS / 2)).toBeGreaterThan(2.75);
});

// The same layout as the [data-o] rules in styles.css, at any fraction between them.
test("a card's transform at a fractional offset interpolates the row's layout", () => {
  const wide = 992;
  expect(cardLayout(0, wide)).toEqual({ x: 0, rotate: 0, scale: 1, z: 5 });
  expect(cardLayout(1, wide)).toEqual({ x: 200, rotate: -50, scale: .84, z: 4 });
  expect(cardLayout(-2, wide)).toEqual({ x: -268, rotate: 50, scale: .84, z: 3 });
  expect(cardLayout(4, wide)).toEqual({ x: 364, rotate: -50, scale: .84, z: 1 });
  const half = cardLayout(.5, wide);
  expect(half.x).toBeCloseTo(100); expect(half.rotate).toBeCloseTo(-25); expect(half.scale).toBeCloseTo(.92);
  expect(cardLayout(1.5, wide).x).toBeCloseTo(234);
  // A narrow row takes the percentage, as min(200px, 21cqw) does.
  expect(cardLayout(1, 800).x).toBeCloseTo(168);
  expect(cardLayout(-4.5, wide).x).toBe(-364);
});

test("a wheel step lands on the next card and stops at the ends", () => {
  expect(stepTarget(FIRST_RUN_ORDER, "doany", 1)).toBe("dungdung");
  expect(stepTarget(FIRST_RUN_ORDER, "doany", -1)).toBe("puri");
  expect(stepTarget(FIRST_RUN_ORDER, "doany", 0)).toBe("doany");
  expect(stepTarget(FIRST_RUN_ORDER, "dori", 1)).toBe("dori");
  expect(stepTarget(FIRST_RUN_ORDER, "popo", -1)).toBe("popo");
});
