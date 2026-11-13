import { describe, expect, test } from "vitest";
import { PROTOTYPE_CHROME, PROTOTYPE_NARROW_BELOW, PROTOTYPE_WINDOW_MIN_WIDTH, fitPrototypeWindow, prototypeIframeBox } from "./fit";

const laptop = { x: 0, y: 25, width: 1512, height: 945 };

describe("chrome constants", () => {
  test("the header is --size-chrome and the panel sits 8px in from the sides and bottom", () => {
    expect(PROTOTYPE_CHROME).toEqual({ header: 56, side: 8, bottom: 8 });
    expect(PROTOTYPE_WINDOW_MIN_WIDTH).toBe(360);
    expect(PROTOTYPE_NARROW_BELOW).toBe(PROTOTYPE_WINDOW_MIN_WIDTH - 2 * PROTOTYPE_CHROME.side);
  });
});

describe("fitPrototypeWindow", () => {
  test("adds the chrome to the mark and centres a new window in the work area", () => {
    expect(fitPrototypeWindow({ width: 390, height: 844 }, laptop)).toEqual({ x: 553, y: 43, width: 406, height: 908 });
    expect(fitPrototypeWindow({ width: 1280, height: 800 }, laptop)).toEqual({ x: 108, y: 65, width: 1296, height: 864 });
  });

  test("never goes below the minimum width", () => {
    expect(fitPrototypeWindow({ width: 320, height: 568 }, laptop)).toEqual({ x: 576, y: 181, width: 360, height: 632 });
    expect(fitPrototypeWindow({ width: 1, height: 1 }, laptop).width).toBe(360);
  });

  test("a mark larger than the work area is clamped to it", () => {
    expect(fitPrototypeWindow({ width: 3000, height: 3000 }, laptop)).toEqual({ x: 0, y: 25, width: 1512, height: 945 });
    expect(fitPrototypeWindow({ width: 99999, height: 400 }, laptop)).toEqual({ x: 0, y: 265, width: 1512, height: 464 });
  });

  test("a replaced frame keeps the window's top-left when the new size fits there", () => {
    expect(fitPrototypeWindow({ width: 390, height: 300 }, laptop, { x: 100, y: 100, width: 800, height: 600 })).toEqual({ x: 100, y: 100, width: 406, height: 364 });
  });

  test("a replaced frame is shifted back inside the work area", () => {
    expect(fitPrototypeWindow({ width: 390, height: 844 }, laptop, { x: 1400, y: 100, width: 400, height: 400 })).toEqual({ x: 1106, y: 62, width: 406, height: 908 });
    expect(fitPrototypeWindow({ width: 390, height: 300 }, laptop, { x: -500, y: -40, width: 400, height: 400 })).toEqual({ x: 0, y: 25, width: 406, height: 364 });
  });

  test("a second display's work area is used as given", () => {
    const right = { x: 1512, y: 0, width: 1920, height: 1055 };
    expect(fitPrototypeWindow({ width: 390, height: 844 }, right)).toEqual({ x: 2269, y: 73, width: 406, height: 908 });
  });

  test("a work area narrower than the minimum keeps the minimum at its left edge", () => {
    expect(fitPrototypeWindow({ width: 390, height: 300 }, { x: 10, y: 0, width: 300, height: 800 })).toEqual({ x: 10, y: 218, width: 360, height: 364 });
  });
});

describe("prototypeIframeBox", () => {
  test("a frame narrower than the minimum panel keeps its own width, centred", () => {
    expect(prototypeIframeBox(344, 320)).toEqual({ x: 12, width: 320 });
    expect(prototypeIframeBox(345, 320)).toEqual({ x: 12, width: 320 });
  });

  test("a narrow frame stays at its own width after the window is widened", () => {
    expect(prototypeIframeBox(800, 320)).toEqual({ x: 240, width: 320 });
  });

  test("any other frame fills the panel, wider or narrower than its mark", () => {
    expect(prototypeIframeBox(344, PROTOTYPE_NARROW_BELOW)).toEqual({ x: 0, width: 344 });
    expect(prototypeIframeBox(800, 390)).toEqual({ x: 0, width: 800 });
    expect(prototypeIframeBox(344, 390)).toEqual({ x: 0, width: 344 });
  });
});
