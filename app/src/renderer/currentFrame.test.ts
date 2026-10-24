import { expect, test } from "vitest";
import { currentFrame } from "./currentFrame";

const viewport = { width: 1000, height: 600 };
const identity = { x: 0, y: 0, scale: 1 };

test("returns null when there are no frames", () => {
  expect(currentFrame([], identity, viewport)).toBeNull();
});

test("picks the frame that contains the viewport center", () => {
  const frames = [
    { x: 0, y: 0, width: 400, height: 600 },
    { x: 400, y: 0, width: 400, height: 600 },
  ];
  expect(currentFrame(frames, identity, viewport)).toBe(1);
  expect(currentFrame(frames, { x: 300, y: 0, scale: 1 }, viewport)).toBe(0);
});

test("maps the center through the view transform", () => {
  const frames = [
    { x: 0, y: 0, width: 100, height: 100 },
    { x: 2000, y: 0, width: 100, height: 100 },
  ];
  // The center (500, 300) is board ((500 + 1000) / 0.5, 300 / 0.5) = (3000, 600),
  // inside neither frame and nearer to frame 1.
  expect(currentFrame(frames, { x: -1000, y: 0, scale: 0.5 }, viewport)).toBe(1);
  // Zoomed in on the first frame: center lands at board (50, 50).
  expect(currentFrame(frames, { x: 500 - 50 * 4, y: 300 - 50 * 4, scale: 4 }, viewport)).toBe(0);
});

test("a nested frame wins over its container (last in document order)", () => {
  const frames = [
    { x: 0, y: 0, width: 1000, height: 600 },
    { x: 400, y: 200, width: 200, height: 200 },
    { x: 0, y: 0, width: 1000, height: 600 },
  ];
  expect(currentFrame(frames.slice(0, 2), identity, viewport)).toBe(1);
  // Last containing frame, even when it is the larger one.
  expect(currentFrame(frames, identity, viewport)).toBe(2);
});

test("edges count as inside", () => {
  expect(currentFrame([{ x: 500, y: 300, width: 10, height: 10 }], identity, viewport)).toBe(0);
  expect(currentFrame([{ x: 490, y: 290, width: 10, height: 10 }], identity, viewport)).toBe(0);
});

test("falls back to the frame nearest to the center", () => {
  const frames = [
    { x: 0, y: 0, width: 100, height: 100 },
    { x: 700, y: 0, width: 100, height: 100 },
    { x: 0, y: 900, width: 100, height: 100 },
  ];
  // Center (500, 300): distance to frame 0 is hypot(400, 200), to frame 1
  // hypot(200, 200), to frame 2 hypot(400, 600).
  expect(currentFrame(frames, identity, viewport)).toBe(1);
});

test("distance is measured to the rectangle, not its center", () => {
  const frames = [
    // Center is far (1500), but the edge is 100 away.
    { x: 600, y: 0, width: 2000, height: 600 },
    // Center is near, but small: the edge is 150 away.
    { x: 650, y: 280, width: 10, height: 10 },
  ];
  // Frame 0 is 100 away (its left edge), frame 1 about 150.
  expect(currentFrame(frames, identity, viewport)).toBe(0);
});

test("equal distances keep the first frame in document order", () => {
  const frames = [
    { x: 700, y: 250, width: 100, height: 100 },
    { x: 200, y: 250, width: 100, height: 100 },
  ];
  expect(currentFrame(frames, identity, viewport)).toBe(0);
});

test("a view that cannot be inverted has no current frame", () => {
  const frames = [{ x: 0, y: 0, width: 100, height: 100 }];
  expect(currentFrame(frames, { x: 0, y: 0, scale: 0 }, viewport)).toBeNull();
  expect(currentFrame(frames, { x: Number.NaN, y: 0, scale: 1 }, viewport)).toBeNull();
});
