import { expect, test } from "vitest";
import { treeScrollLeft } from "./treeScrollLeft";

const viewport = { width: 260, nameWidth: 80 };

test("shallow names stay at the start and a fully visible deep name keeps the current scroll", () => {
  expect(treeScrollLeft(0, viewport, 0)).toBe(0);
  expect(treeScrollLeft(2, viewport, 0)).toBe(0);
  expect(treeScrollLeft(10, viewport, 160)).toBe(160);
  // A small inset is fine as long as neither edge of the actual content is clipped.
  expect(treeScrollLeft(10, viewport, 250)).toBe(250);
  expect(treeScrollLeft(10, viewport, 100)).toBe(100);
});

test("reveals both the icon and the name on a move down or back up the tree", () => {
  const left = treeScrollLeft(10, viewport, 0);
  const icon = 16 + 10 * 24;
  expect(left).toBeGreaterThan(0);
  expect(left).toBeLessThanOrEqual(icon);
  expect(left + viewport.width).toBeGreaterThanOrEqual(icon + 24 + viewport.nameWidth);
  expect(treeScrollLeft(0, viewport, left)).toBe(0);
});

test("a name wider than the menu starts beside its visible icon", () => {
  expect(treeScrollLeft(12, { width: 260, nameWidth: 600 }, 0)).toBe(12 * 24);
});
