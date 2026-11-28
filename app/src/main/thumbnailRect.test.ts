import { describe, expect, test } from "vitest";
import { MAX_ANSWER_LENGTH, MAX_FRAME_BOTTOM, measuredFrame, thumbnailRect } from "./thumbnailRect";

const frame = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
// What the canvas scripts send: four numbers joined by spaces.
const answer = (x: number, y: number, width: number, height: number) => `${x} ${y} ${width} ${height}`;

describe("measuredFrame: the first frame read in document coordinates", () => {
  test.each([
    ["a frame on the first screen", 960, frame(40, 100, 880, 500)],
    ["a frame below the first screen, reached by scrolling", 960, frame(40, 700, 880, 500)],
    ["a frame as wide as the board", 960, frame(0, 0, 960, 600)],
    ["a 390 px phone frame", 960, frame(40, 300, 390, 844)],
    ["a 390 px board's own frame", 390, frame(0, 0, 390, 844)],
    ["a 1440 px board's frame", 1440, frame(0, 120, 1440, 900)],
    ["a very wide, low frame", 1440, frame(0, 40, 1440, 24)],
    ["a frame placed by transform or absolute position, fractional", 960, frame(100.4, 1234.6, 300.2, 200.5)],
    ["a frame whose right edge rounds past the board by a subpixel", 960, frame(0, 0, 960.3, 600)],
  ])("%s is accepted", (_name, boardWidth, value) => {
    expect(measuredFrame(answer(value.x, value.y, value.width, value.height), boardWidth)).toEqual(value);
  });

  test.each([
    ["no frame", null],
    ["a 0 x 0 frame", answer(0, 700, 0, 0)],
    ["a zero-width frame", answer(0, 0, 0, 500)],
    ["a zero-height frame", answer(0, 0, 500, 0)],
    ["NaN", answer(Number.NaN, 0, 100, 100)],
    ["Infinity", answer(0, 0, Number.POSITIVE_INFINITY, 100)],
    ["a negative x", answer(-5, 0, 100, 100)],
    ["a negative y", answer(0, -5, 100, 100)],
    ["a negative width", answer(0, 0, -100, 100)],
    ["a 1e7 height", answer(0, 0, 100, 1e7)],
    ["a bottom past the board's height limit", answer(0, MAX_FRAME_BOTTOM, 100, 1)],
    ["an x outside the board", answer(961, 0, 10, 10)],
    ["a frame wider than doan:width", answer(0, 0, 961, 100)],
    ["a frame running past the board's right edge", answer(900, 0, 100, 100)],
    ["three numbers", "0 0 100"],
    ["five numbers", "0 0 100 100 5"],
    ["an empty field", "0  100 100"],
    ["a word", "0 0 wide 100"],
    ["an answer longer than the limit", `${"0".repeat(MAX_ANSWER_LENGTH)} 0 100 100`],
    ["an object", frame(0, 0, 100, 100)],
    ["a number", 7],
    ["an array", [0, 0, 100, 100]],
  ])("%s is not a frame (first screen)", (_name, value) => {
    expect(measuredFrame(value, 960)).toBeNull();
  });
});

describe("thumbnailRect: the scrolled frame's viewport rectangle to the capture rectangle", () => {
  // The host page puts the iframe at its origin; the viewport is the iframe.
  const viewport960 = frame(0, 0, 960, 600);
  const window960 = { width: 960, height: 600 };

  test.each([
    ["a frame scrolled to the top", viewport960, window960, frame(40, 0, 880, 500), frame(40, 0, 880, 500)],
    ["a frame the scroll could not bring to the top (end of the document)", viewport960, window960, frame(40, 300, 880, 300), frame(40, 300, 880, 300)],
    ["a frame taller than the viewport keeps its top 16:10", viewport960, window960, frame(0, 0, 960, 3000), frame(0, 0, 960, 600)],
    ["a very wide, low frame", frame(0, 0, 1440, 900), { width: 1440, height: 900 }, frame(0, 0, 1440, 24), frame(0, 0, 1440, 24)],
    ["a 1440 px board's full-width frame", frame(0, 0, 1440, 900), { width: 1440, height: 900 }, frame(0, 0, 1440, 2000), frame(0, 0, 1440, 900)],
    ["a 390 px board's frame is capped at 16:10", frame(0, 0, 390, 244), { width: 390, height: 244 }, frame(0, 0, 390, 844), frame(0, 0, 390, 244)],
    ["a 390 px phone frame is capped at 16:10", viewport960, window960, frame(40, 0, 390, 844), frame(40, 0, 390, 244)],
    ["a narrow frame is capped at 16:10", viewport960, window960, frame(40, 0, 200, 400), frame(40, 0, 200, 125)],
    ["a frame partly above the viewport (transform) keeps its visible part", viewport960, window960, frame(100, -20, 300, 200), frame(100, 0, 300, 180)],
    ["fractional edges round to whole pixels", viewport960, window960, frame(40.4, 0.6, 880.2, 499.8), frame(40, 1, 881, 499)],
    ["the host offset of the iframe is added", frame(10, 20, 960, 600), { width: 970, height: 620 }, frame(40, 0, 880, 500), frame(50, 20, 880, 500)],
    ["a window narrower than the board cuts the frame at its edge", frame(0, 0, 2000, 1250), { width: 1440, height: 900 }, frame(1200, 0, 600, 500), frame(1200, 0, 240, 150)],
    ["a window lower than the board cuts the frame at its bottom", frame(0, 0, 2000, 1250), { width: 1440, height: 900 }, frame(0, 0, 1440, 1250), frame(0, 0, 1440, 900)],
  ])("%s", (_name, viewport, window, visible, expected) => {
    expect(thumbnailRect(answer(visible.x, visible.y, visible.width, visible.height), viewport, window)).toEqual(expected);
  });

  test.each([
    ["no answer", null],
    ["a frame still below the viewport (the scroll did not happen)", answer(40, 700, 880, 500)],
    ["a frame above the viewport", answer(40, -600, 880, 500)],
    ["a frame touching the viewport bottom only", answer(40, 600, 880, 500)],
    ["a 0 x 0 frame", answer(40, 0, 0, 0)],
    ["NaN", answer(Number.NaN, 0, 880, 500)],
    ["a negative x", answer(-1, 0, 880, 500)],
    ["a frame wider than the board", answer(0, 0, 961, 500)],
    ["a 1e7 height", answer(0, 0, 880, 1e7)],
    ["an object", frame(40, 0, 880, 500)],
  ])("%s gives the first screen", (_name, visible) => {
    expect(thumbnailRect(visible, viewport960, window960)).toBeNull();
  });

  test("a frame entirely outside a window narrower than the board gives the first screen", () => {
    expect(thumbnailRect(answer(1600, 0, 300, 500), frame(0, 0, 2000, 1250), { width: 1440, height: 900 })).toBeNull();
  });
});
