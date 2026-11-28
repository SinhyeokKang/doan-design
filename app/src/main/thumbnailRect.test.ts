import { describe, expect, test } from "vitest";
import { MAX_FRAME_BOTTOM, measuredFrame, thumbnailRect } from "./thumbnailRect";

const frame = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

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
    expect(measuredFrame(value, boardWidth)).toEqual(value);
  });

  test.each([
    ["no frame", null],
    ["a 0 x 0 frame", frame(0, 700, 0, 0)],
    ["a zero-width frame", frame(0, 0, 0, 500)],
    ["a zero-height frame", frame(0, 0, 500, 0)],
    ["NaN", frame(Number.NaN, 0, 100, 100)],
    ["Infinity", frame(0, 0, Number.POSITIVE_INFINITY, 100)],
    ["a negative x", frame(-5, 0, 100, 100)],
    ["a negative y", frame(0, -5, 100, 100)],
    ["a negative width", frame(0, 0, -100, 100)],
    ["a 1e7 height", frame(0, 0, 100, 1e7)],
    ["a bottom past the board's height limit", frame(0, MAX_FRAME_BOTTOM, 100, 1)],
    ["an x outside the board", frame(961, 0, 10, 10)],
    ["a frame wider than doan:width", frame(0, 0, 961, 100)],
    ["a frame running past the board's right edge", frame(900, 0, 100, 100)],
    ["a string number", { x: "0", y: 0, width: 100, height: 100 }],
    ["a missing field", { x: 0, y: 0, width: 100 }],
    ["a number", 7],
    ["an array", [0, 0, 100, 100]],
  ])("%s is not a frame (first screen)", (_name, value) => {
    expect(measuredFrame(value, 960)).toBeNull();
  });

  test("only the four numbers are kept", () => {
    expect(measuredFrame({ ...frame(40, 700, 880, 500), extra: "ignored" }, 960)).toEqual(frame(40, 700, 880, 500));
  });
});

describe("thumbnailRect: the scrolled frame's viewport rectangle to the capture rectangle", () => {
  // The host page puts the iframe at its origin; the viewport is the iframe.
  const viewport960 = frame(0, 0, 960, 600);

  test.each([
    ["a frame scrolled to the top", viewport960, frame(40, 0, 880, 500), frame(40, 0, 880, 500)],
    ["a frame the scroll could not bring to the top (end of the document)", viewport960, frame(40, 300, 880, 300), frame(40, 300, 880, 300)],
    ["a frame taller than the viewport keeps its top 16:10", viewport960, frame(0, 0, 960, 3000), frame(0, 0, 960, 600)],
    ["a very wide, low frame", frame(0, 0, 1440, 900), frame(0, 0, 1440, 24), frame(0, 0, 1440, 24)],
    ["a 1440 px board's full-width frame", frame(0, 0, 1440, 900), frame(0, 0, 1440, 2000), frame(0, 0, 1440, 900)],
    ["a 390 px board's frame is capped at its width", frame(0, 0, 390, 244), frame(0, 0, 390, 844), frame(0, 0, 390, 244)],
    ["a 390 px phone frame is capped at its width", viewport960, frame(40, 0, 390, 844), frame(40, 0, 390, 390)],
    ["a narrow frame is capped at its width", viewport960, frame(40, 0, 200, 400), frame(40, 0, 200, 200)],
    ["a frame partly above the viewport (transform) keeps its visible part", viewport960, frame(100, -20, 300, 200), frame(100, 0, 300, 180)],
    ["fractional edges round to whole pixels", viewport960, frame(40.4, 0.6, 880.2, 499.8), frame(40, 1, 881, 499)],
    ["the host offset of the iframe is added", frame(10, 20, 960, 600), frame(40, 0, 880, 500), frame(50, 20, 880, 500)],
  ])("%s", (_name, viewport, visible, expected) => {
    expect(thumbnailRect(visible, viewport)).toEqual(expected);
  });

  test.each([
    ["no answer", null],
    ["a frame still below the viewport (the scroll did not happen)", frame(40, 700, 880, 500)],
    ["a frame above the viewport", frame(40, -600, 880, 500)],
    ["a frame touching the viewport bottom only", frame(40, 600, 880, 500)],
    ["a 0 x 0 frame", frame(40, 0, 0, 0)],
    ["NaN", frame(Number.NaN, 0, 880, 500)],
    ["a negative x", frame(-1, 0, 880, 500)],
    ["a frame wider than the board", frame(0, 0, 961, 500)],
    ["a 1e7 height", frame(0, 0, 880, 1e7)],
    ["a string number", { x: 40, y: "0", width: 880, height: 500 }],
  ])("%s gives the first screen", (_name, visible) => {
    expect(thumbnailRect(visible, viewport960)).toBeNull();
  });
});
