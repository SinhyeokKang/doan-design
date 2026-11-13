import { describe, expect, test } from "vitest";
import {
  PROTOTYPE_CHROME, PROTOTYPE_HEADER_RIGHT, PROTOTYPE_NAME_MIN_WIDTH, PROTOTYPE_NAME_ROW_HEIGHT, PROTOTYPE_PANEL_MIN_WIDTH, PROTOTYPE_PANEL_WINDOW_MIN_WIDTH, PROTOTYPE_WINDOW_MIN_WIDTH,
  fitPrototypeWindow, openPanelResize, prototypeCaptureRect, prototypeHeaderRows, prototypePanelBounds, prototypePanelFit, prototypeViewportBox,
} from "./fit";

const laptop = { x: 0, y: 25, width: 1512, height: 945 };

describe("chrome constants", () => {
  test("the header is --size-chrome and the panel sits 8px in from the sides and bottom", () => {
    expect(PROTOTYPE_CHROME).toEqual({ header: 56, side: 8, bottom: 8 });
    expect(PROTOTYPE_WINDOW_MIN_WIDTH).toBe(360);
  });

  test("the header's right group is the mode toggle, Export and the conversation button; the name needs 80 or takes a 44 second row", () => {
    expect(PROTOTYPE_HEADER_RIGHT).toBe(140);
    expect(PROTOTYPE_NAME_MIN_WIDTH).toBe(80);
    expect(PROTOTYPE_NAME_ROW_HEIGHT).toBe(44);
  });
});

describe("fitPrototypeWindow", () => {
  test("adds the chrome to the mark and centres a new window in the work area", () => {
    // 844 + 100 + 8 = 952 is taller than the laptop's work area, which clips it.
    expect(fitPrototypeWindow({ width: 390, height: 844 }, laptop)).toEqual({ x: 553, y: 25, width: 406, height: 945 });
    expect(fitPrototypeWindow({ width: 1280, height: 800 }, laptop)).toEqual({ x: 108, y: 65, width: 1296, height: 864 });
  });

  test("never goes below the minimum width", () => {
    // 360 is below 408, so the name takes the header's second row: 568 + 64 + 44.
    expect(fitPrototypeWindow({ width: 320, height: 568 }, laptop)).toEqual({ x: 576, y: 159, width: 360, height: 676 });
    expect(fitPrototypeWindow({ width: 1, height: 1 }, laptop).width).toBe(360);
  });

  test("a mark larger than the work area is clamped to it", () => {
    expect(fitPrototypeWindow({ width: 3000, height: 3000 }, laptop)).toEqual({ x: 0, y: 25, width: 1512, height: 945 });
    expect(fitPrototypeWindow({ width: 99999, height: 400 }, laptop)).toEqual({ x: 0, y: 265, width: 1512, height: 464 });
  });

  test("a replaced frame keeps the window's top-left when the new size fits there", () => {
    expect(fitPrototypeWindow({ width: 390, height: 300 }, laptop, { x: 100, y: 100, width: 800, height: 600 })).toEqual({ x: 100, y: 100, width: 406, height: 408 });
  });

  test("a replaced frame is shifted back inside the work area", () => {
    expect(fitPrototypeWindow({ width: 390, height: 844 }, laptop, { x: 1400, y: 100, width: 400, height: 400 })).toEqual({ x: 1106, y: 25, width: 406, height: 945 });
    expect(fitPrototypeWindow({ width: 390, height: 300 }, laptop, { x: -500, y: -40, width: 400, height: 400 })).toEqual({ x: 0, y: 25, width: 406, height: 408 });
  });

  test("a second display's work area is used as given", () => {
    const right = { x: 1512, y: 0, width: 1920, height: 1055 };
    expect(fitPrototypeWindow({ width: 390, height: 844 }, right)).toEqual({ x: 2269, y: 51, width: 406, height: 952 });
  });

  test("a work area narrower than the minimum keeps the minimum at its left edge", () => {
    expect(fitPrototypeWindow({ width: 390, height: 300 }, { x: 10, y: 0, width: 300, height: 800 })).toEqual({ x: 10, y: 196, width: 360, height: 408 });
  });

  test("a fitted width that keeps the name on the first row adds 64; one that moves it to the second row adds 108", () => {
    // 390 + 16 = 406 is below 140 + 304, so 390x844 fits at 406 x 952: 844 + 100 + 8.
    expect(fitPrototypeWindow({ width: 390, height: 844 }, { x: 0, y: 0, width: 1920, height: 1055 })).toMatchObject({ width: 406, height: 952 });
    expect(fitPrototypeWindow({ width: 428, height: 400 }, laptop)).toMatchObject({ width: 444, height: 464 });
    expect(fitPrototypeWindow({ width: 427, height: 400 }, laptop)).toMatchObject({ width: 443, height: 508 });
    expect(prototypeHeaderRows(406, 140)).toBe(2);
  });

  test("a width the work area clips decides the rows at the clipped width", () => {
    const narrow = { x: 0, y: 0, width: 365, height: 2000 };
    expect(fitPrototypeWindow({ width: 390, height: 844 }, narrow)).toMatchObject({ width: 365, height: 952 });
    expect(fitPrototypeWindow({ width: 390, height: 844 }, { ...narrow, height: 900 })).toMatchObject({ width: 365, height: 900 });
  });
});

describe("prototypeHeaderRows", () => {
  test("the name stays on the first row while the space between the groups is at least 80", () => {
    for (const [right, first] of [[140, 444], [104, 408], [68, 372]] as const) {
      expect(prototypeHeaderRows(first, right), `${right} at ${first}`).toBe(1);
      expect(prototypeHeaderRows(first - 1, right), `${right} at ${first - 1}`).toBe(2);
    }
  });

  test("common window widths", () => {
    for (const right of [140, 104, 68]) {
      expect(prototypeHeaderRows(640, right)).toBe(1);
      expect(prototypeHeaderRows(520, right)).toBe(1);
      expect(prototypeHeaderRows(360, right)).toBe(2);
    }
    expect(prototypeHeaderRows(406, 68)).toBe(1);
    expect(prototypeHeaderRows(406, 104)).toBe(2);
  });
});


describe("prototypeViewportBox", () => {
  test("Responsive fills the panel whatever the mark, a 240 frame too", () => {
    expect(prototypeViewportBox({ width: 624, height: 844 }, { width: 390, height: 844 }, "responsive")).toEqual({ x: 0, y: 0, width: 624, height: 844, scale: 1, visibleWidth: 624, visibleHeight: 844 });
    expect(prototypeViewportBox({ width: 344, height: 800 }, { width: 390, height: 844 }, "responsive")).toEqual({ x: 0, y: 0, width: 344, height: 800, scale: 1, visibleWidth: 344, visibleHeight: 800 });
    expect(prototypeViewportBox({ width: 624, height: 600 }, { width: 240, height: 400 }, "responsive")).toEqual({ x: 0, y: 0, width: 624, height: 600, scale: 1, visibleWidth: 624, visibleHeight: 600 });
  });

  test("Fit keeps the mark at 1x, centred, when the panel is larger; it never enlarges", () => {
    expect(prototypeViewportBox({ width: 390, height: 844 }, { width: 390, height: 844 }, "fit")).toEqual({ x: 0, y: 0, width: 390, height: 844, scale: 1, visibleWidth: 390, visibleHeight: 844 });
    expect(prototypeViewportBox({ width: 800, height: 900 }, { width: 390, height: 844 }, "fit")).toEqual({ x: 205, y: 28, width: 390, height: 844, scale: 1, visibleWidth: 390, visibleHeight: 844 });
    expect(prototypeViewportBox({ width: 624, height: 600 }, { width: 240, height: 400 }, "fit")).toEqual({ x: 192, y: 100, width: 240, height: 400, scale: 1, visibleWidth: 240, visibleHeight: 400 });
  });

  test("Fit scales down by width, keeping the iframe at the mark's CSS size", () => {
    const box = prototypeViewportBox({ width: 344, height: 844 }, { width: 390, height: 844 }, "fit");
    expect(box).toMatchObject({ x: 0, y: 50, width: 390, height: 844 });
    expect(box.scale).toBeCloseTo(344 / 390, 12);
    expect(box).toMatchObject({ visibleWidth: 344, visibleHeight: 744 });
  });

  test("Fit scales down by height", () => {
    const box = prototypeViewportBox({ width: 1440, height: 450 }, { width: 1440, height: 900 }, "fit");
    expect(box).toMatchObject({ x: 360, y: 0, width: 1440, height: 900, scale: 0.5 });
    expect(box).toMatchObject({ visibleWidth: 720, visibleHeight: 450 });
  });

  test("a fractional scale clips the iframe to whole pixels: 390x844 in 344x800 draws 744.45 high and shows 744", () => {
    const box = prototypeViewportBox({ width: 344, height: 800 }, { width: 390, height: 844 }, "fit");
    expect(box.height * box.scale).toBeGreaterThan(744.4);
    expect(box.visibleWidth).toBe(344);
    expect(box.visibleHeight).toBe(744);
  });

  test("Fit scales down by the tighter of both sides", () => {
    const box = prototypeViewportBox({ width: 344, height: 800 }, { width: 390, height: 844 }, "fit");
    expect(box).toMatchObject({ x: 0, y: 28, width: 390, height: 844 });
    expect(box).toMatchObject({ visibleWidth: 344, visibleHeight: 744 });
    const tall = prototypeViewportBox({ width: 1000, height: 400 }, { width: 1440, height: 900 }, "fit");
    expect(tall).toMatchObject({ x: 180, y: 0, scale: 400 / 900 });
    expect(tall).toMatchObject({ visibleWidth: 640, visibleHeight: 400 });
  });

  test("an unknown mark fills the panel in both modes", () => {
    for (const mode of ["fit", "responsive"] as const) {
      for (const mark of [{ width: 0, height: 0 }, { width: 390, height: 0 }, { width: 0, height: 844 }]) {
        expect(prototypeViewportBox({ width: 344, height: 800 }, mark, mode)).toEqual({ x: 0, y: 0, width: 344, height: 800, scale: 1, visibleWidth: 344, visibleHeight: 800 });
      }
    }
  });

  test("an unmeasured panel keeps Fit's viewport at the mark with nothing visible", () => {
    expect(prototypeViewportBox({ width: 0, height: 0 }, { width: 390, height: 844 }, "fit")).toEqual({ x: 0, y: 0, width: 390, height: 844, scale: 0, visibleWidth: 0, visibleHeight: 0 });
    expect(prototypeViewportBox({ width: 0, height: 0 }, { width: 390, height: 844 }, "responsive")).toEqual({ x: 0, y: 0, width: 0, height: 0, scale: 1, visibleWidth: 0, visibleHeight: 0 });
    expect(prototypeViewportBox({ width: -8, height: 500 }, { width: 390, height: 844 }, "responsive")).toEqual({ x: 0, y: 0, width: 0, height: 500, scale: 1, visibleWidth: 0, visibleHeight: 500 });
  });

  test("positions and visible sizes are whole pixels, also for a fractional panel", () => {
    const panels = [{ width: 344.5, height: 844.7 }, { width: 333, height: 777 }, { width: 1001.25, height: 640.5 }, { width: 391, height: 845 }];
    const marks = [{ width: 390, height: 844 }, { width: 1440, height: 900 }, { width: 240, height: 400 }, { width: 5000, height: 5000 }];
    for (const panel of panels) for (const mark of marks) for (const mode of ["fit", "responsive"] as const) {
      const box = prototypeViewportBox(panel, mark, mode);
      for (const value of [box.x, box.y, box.width, box.height, box.visibleWidth, box.visibleHeight]) expect(Number.isInteger(value), JSON.stringify({ panel, mark, mode, box })).toBe(true);
      // The clip is never larger than what the scaled iframe draws, so no panel shows through at its edge.
      expect(box.visibleWidth).toBeLessThanOrEqual(box.width * box.scale + 1e-6);
      expect(box.visibleHeight).toBeLessThanOrEqual(box.height * box.scale + 1e-6);
      expect(box.x + box.visibleWidth).toBeLessThanOrEqual(panel.width);
      expect(box.y + box.visibleHeight).toBeLessThanOrEqual(panel.height);
    }
  });
});

describe("prototypeCaptureRect", () => {
  test("Responsive captures the whole content panel under a one-row header", () => {
    expect(prototypeCaptureRect({ width: 640, height: 908 }, { width: 390, height: 844 }, "responsive")).toEqual({ rect: { x: 8, y: 56, width: 624, height: 844 }, box: { x: 0, y: 0, width: 624, height: 844 } });
  });

  test("Fit at 1x captures the frame where it sits in the panel", () => {
    expect(prototypeCaptureRect({ width: 406, height: 952 }, { width: 390, height: 844 }, "fit")).toEqual({ rect: { x: 8, y: 100, width: 390, height: 844 }, box: { x: 0, y: 0, width: 390, height: 844 } });
    expect(prototypeCaptureRect({ width: 816, height: 964 }, { width: 390, height: 844 }, "fit")).toEqual({ rect: { x: 213, y: 84, width: 390, height: 844 }, box: { x: 205, y: 28, width: 390, height: 844 } });
  });

  test("Fit scaled down captures the visible frame; a two-row header moves the panel to y100", () => {
    // 360 < 408: the name is on the second row, so the panel is 344 x 800 from y100.
    expect(prototypeCaptureRect({ width: 360, height: 908 }, { width: 390, height: 844 }, "fit")).toEqual({ rect: { x: 8, y: 128, width: 344, height: 744 }, box: { x: 0, y: 28, width: 344, height: 744 } });
    expect(prototypeCaptureRect({ width: 360, height: 908 }, { width: 390, height: 844 }, "responsive")).toEqual({ rect: { x: 8, y: 100, width: 344, height: 800 }, box: { x: 0, y: 0, width: 344, height: 800 } });
  });

  test("a side column takes its width off the content panel", () => {
    expect(prototypeCaptureRect({ width: 1000, height: 908 }, { width: 390, height: 844 }, "fit", 300)).toEqual({ rect: { x: 155, y: 56, width: 390, height: 844 }, box: { x: 147, y: 0, width: 390, height: 844 } });
    expect(prototypeCaptureRect({ width: 1000, height: 908 }, { width: 390, height: 844 }, "responsive", 300)).toEqual({ rect: { x: 8, y: 56, width: 684, height: 844 }, box: { x: 0, y: 0, width: 684, height: 844 } });
  });

  test("captures exactly the box the renderer clips the iframe to", () => {
    const marks = [{ width: 390, height: 844 }, { width: 1440, height: 900 }, { width: 240, height: 400 }, { width: 5000, height: 5000 }, { width: 0, height: 0 }];
    for (const content of [{ width: 360, height: 908 }, { width: 406, height: 908 }, { width: 371, height: 777 }, { width: 1001, height: 641 }, { width: 640, height: 480 }]) {
      for (const mark of marks) for (const mode of ["fit", "responsive"] as const) {
        const header = prototypeHeaderRows(content.width, PROTOTYPE_HEADER_RIGHT) === 2 ? 100 : 56;
        const viewport = prototypeViewportBox({ width: content.width - 16, height: content.height - header - 8 }, mark, mode);
        const area = prototypeCaptureRect(content, mark, mode);
        expect(area?.box, JSON.stringify({ content, mark, mode })).toEqual({ x: viewport.x, y: viewport.y, width: viewport.visibleWidth, height: viewport.visibleHeight });
      }
    }
  });

  test("an empty panel has nothing to capture", () => {
    expect(prototypeCaptureRect({ width: 0, height: 0 }, { width: 390, height: 844 }, "fit")).toBeNull();
    expect(prototypeCaptureRect({ width: 360, height: 100 }, { width: 390, height: 844 }, "responsive")).toBeNull();
    expect(prototypeCaptureRect({ width: 16, height: 908 }, { width: 0, height: 0 }, "fit")).toBeNull();
  });
});

describe("prototypePanelBounds", () => {
  test("the panel opens at 280 at least and leaves the frame column 360, up to half the window", () => {
    expect(PROTOTYPE_PANEL_MIN_WIDTH).toBe(280);
    expect(PROTOTYPE_PANEL_WINDOW_MIN_WIDTH).toBe(640);
    // 640: half is 320, the frame column leaves 280; the default max(320, 179) is cut to 280.
    expect(prototypePanelBounds(640)).toEqual({ min: 280, max: 280, default: 280 });
    // 1000: half 500, frame column 640; the default is max(320, 280) = 320.
    expect(prototypePanelBounds(1000)).toEqual({ min: 280, max: 500, default: 320 });
    // 1512: half 756; 28% is 423.
    expect(prototypePanelBounds(1512)).toEqual({ min: 280, max: 756, default: 423 });
    // 800: the frame column's 360 binds before half the window does.
    expect(prototypePanelBounds(800)).toEqual({ min: 280, max: 400, default: 320 });
  });

  test("a window narrower than 640 keeps the panel at 280 with no range at all", () => {
    expect(prototypePanelBounds(600)).toEqual({ min: 280, max: 280, default: 280 });
    expect(prototypePanelBounds(360)).toEqual({ min: 280, max: 280, default: 280 });
  });
});

describe("openPanelResize", () => {
  const at = (x: number, width: number) => ({ x, y: 100, width, height: 800 });

  test("a 360 or 480 window grows to exactly 640 and the panel opens at 280", () => {
    expect(openPanelResize(at(200, 360), laptop)).toEqual({ bounds: at(200, 640), panel: 280 });
    expect(openPanelResize(at(200, 480), laptop)).toEqual({ bounds: at(200, 640), panel: 280 });
  });

  test("a window already 640 or wider keeps its size and the panel opens at the default, cut to the maximum", () => {
    expect(openPanelResize(at(200, 640), laptop)).toEqual({ bounds: at(200, 640), panel: 280 });
    expect(openPanelResize(at(100, 1000), laptop)).toEqual({ bounds: at(100, 1000), panel: 320 });
  });

  test("a remembered width comes back, cut to the window's range", () => {
    expect(openPanelResize(at(100, 1000), laptop, 450)).toEqual({ bounds: at(100, 1000), panel: 450 });
    expect(openPanelResize(at(100, 1000), laptop, 900)).toEqual({ bounds: at(100, 1000), panel: 500 });
    // A narrow window opens at 280 whatever was remembered.
    expect(openPanelResize(at(200, 360), laptop, 450)).toEqual({ bounds: at(200, 640), panel: 280 });
  });

  test("a widened window against the work area's right edge moves left to stay inside", () => {
    expect(openPanelResize(at(1152, 360), laptop)).toEqual({ bounds: at(872, 640), panel: 280 });
  });

  test("a work area narrower than 640 widens the window to the work area only, with the panel at 280", () => {
    const small = { x: 0, y: 0, width: 600, height: 900 };
    expect(openPanelResize({ x: 120, y: 0, width: 360, height: 800 }, small)).toEqual({ bounds: { x: 0, y: 0, width: 600, height: 800 }, panel: 280 });
  });
});

describe("prototypePanelFit", () => {
  test("with the panel open a play fits the shown size plus 16 plus the panel, and 64 for a one-row header", () => {
    // 390 x 844 with a 300 panel: 406 + 300 = 706 wide, 844 + 64 = 908 high.
    expect(prototypePanelFit({ width: 390, height: 844 }, laptop, 300)).toEqual({ bounds: { x: 403, y: 43, width: 706, height: 908 }, panel: 300 });
  });

  test("never narrower than 640", () => {
    expect(prototypePanelFit({ width: 200, height: 300 }, laptop, 280)).toMatchObject({ bounds: { width: 640, height: 364 }, panel: 280 });
  });

  test("a fitted width that puts the name on the second row adds 108", () => {
    // A work area of 443 clips the window there, below 444: the name is on the second row.
    expect(prototypePanelFit({ width: 100, height: 300 }, { x: 0, y: 0, width: 443, height: 1000 }, 280)).toMatchObject({ bounds: { width: 443, height: 408 }, panel: 280 });
  });

  test("wider than the work area, the panel gives way first down to 280, then the frame column", () => {
    // 1280 + 16 + 400 = 1696 > 1512: the panel takes 184 of it, down to 280 it can give only 120.
    expect(prototypePanelFit({ width: 1280, height: 800 }, laptop, 400)).toMatchObject({ bounds: { x: 0, width: 1512, height: 864 }, panel: 280 });
    // 1000 + 16 + 600 = 1616 > 1512: the panel gives 104 and stays at 496.
    expect(prototypePanelFit({ width: 1000, height: 800 }, laptop, 600)).toMatchObject({ bounds: { width: 1512 }, panel: 496 });
  });

  test("the panel never exceeds the fitted window's maximum", () => {
    // 100 + 16 + 600 = 716: half of it is 358, the frame column leaves 356.
    expect(prototypePanelFit({ width: 100, height: 300 }, laptop, 600)).toMatchObject({ bounds: { width: 716 }, panel: 356 });
  });

  test("the height stops at the work area", () => {
    expect(prototypePanelFit({ width: 390, height: 2000 }, laptop, 300)).toMatchObject({ bounds: { y: 25, height: 945 } });
  });

  test("a replaced frame keeps the window's top-left", () => {
    expect(prototypePanelFit({ width: 390, height: 300 }, laptop, 300, { x: 100, y: 100, width: 800, height: 600 })).toEqual({ bounds: { x: 100, y: 100, width: 706, height: 364 }, panel: 300 });
  });
});

describe("prototypeCaptureRect with the conversation column", () => {
  test("a 640 window with a 280 panel captures the 344 frame column only", () => {
    expect(prototypeCaptureRect({ width: 640, height: 908 }, { width: 390, height: 844 }, "responsive", 280)).toEqual({ rect: { x: 8, y: 56, width: 344, height: 844 }, box: { x: 0, y: 0, width: 344, height: 844 } });
    // Fit scales 390 x 844 into 344 x 844: 344 x 744, centred vertically.
    expect(prototypeCaptureRect({ width: 640, height: 908 }, { width: 390, height: 844 }, "fit", 280)).toEqual({ rect: { x: 8, y: 106, width: 344, height: 744 }, box: { x: 0, y: 50, width: 344, height: 744 } });
  });
});
