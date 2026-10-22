import { describe, expect, test } from "vitest";
import {
  FIRST_LAYOUT_TIMEOUT_MS,
  FIT_MARGIN,
  FIT_SCALE_MAX,
  LINE_PX,
  MAX_SCALE,
  MIN_SCALE,
  PAGE_PX,
  WHEEL_ZOOM_MAX,
  WHEEL_ZOOM_SENSITIVITY,
  ZOOM_LIMITS,
  ZOOM_STEP,
  boardToScreen,
  fitFrame,
  fitWidth,
  panBy,
  screenToBoard,
  wheelAction,
  zoomAt,
  type View,
} from "./viewport";

const view: View = { x: 100, y: 50, scale: 1 };
const viewport = { width: 1000, height: 800 };

describe("constants", () => {
  test("pin the values design.md fixes", () => {
    expect(MIN_SCALE).toBe(0.05);
    expect(MAX_SCALE).toBe(4);
    expect(ZOOM_LIMITS).toEqual({ min: 0.05, max: 4 });
    expect(ZOOM_STEP).toBe(1.25);
    expect(WHEEL_ZOOM_MAX).toBe(1.25);
    expect(FIT_MARGIN).toBe(32);
    expect(FIT_SCALE_MAX).toBe(1);
    expect(FIRST_LAYOUT_TIMEOUT_MS).toBe(5000);
  });

  test("pin the wheel constants chosen in B1", () => {
    expect(WHEEL_ZOOM_SENSITIVITY).toBe(0.01);
    expect(LINE_PX).toBe(16);
    expect(PAGE_PX).toBe(800);
  });
});

describe("zoomAt", () => {
  test("keeps the board point under the anchor fixed", () => {
    const point = { x: 400, y: 300 };
    const before = screenToBoard(view, point);
    const next = zoomAt(view, 1.25, point, ZOOM_LIMITS);
    expect(next.scale).toBeCloseTo(1.25);
    const after = screenToBoard(next, point);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  test("clamps to the maximum and still keeps the anchor fixed", () => {
    const start: View = { x: -30, y: 20, scale: 3.5 };
    const point = { x: 250, y: 120 };
    const before = screenToBoard(start, point);
    const next = zoomAt(start, 2, point, ZOOM_LIMITS);
    expect(next.scale).toBe(MAX_SCALE);
    const after = screenToBoard(next, point);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  test("clamps to the minimum", () => {
    const next = zoomAt({ x: 0, y: 0, scale: 0.06 }, 0.1, { x: 10, y: 10 }, ZOOM_LIMITS);
    expect(next.scale).toBe(MIN_SCALE);
  });

  test("at the limit a further zoom leaves the view unchanged", () => {
    const atMax: View = { x: 12, y: 34, scale: MAX_SCALE };
    expect(zoomAt(atMax, 1.25, { x: 500, y: 500 }, ZOOM_LIMITS)).toEqual(atMax);
  });

  test("ignores a factor that is not a positive finite number", () => {
    for (const factor of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(zoomAt(view, factor, { x: 1, y: 1 }, ZOOM_LIMITS)).toEqual(view);
    }
  });

  test("does not mutate its input", () => {
    const frozen = Object.freeze({ ...view });
    expect(() => zoomAt(frozen, 1.25, { x: 1, y: 1 }, ZOOM_LIMITS)).not.toThrow();
  });
});

describe("panBy", () => {
  test("moves the view and keeps the scale", () => {
    expect(panBy(view, -30, 15)).toEqual({ x: 70, y: 65, scale: 1 });
  });

  test("has no pan limit", () => {
    expect(panBy(view, -1e9, 1e9)).toEqual({ x: 100 - 1e9, y: 50 + 1e9, scale: 1 });
  });
});

describe("coordinate conversion", () => {
  test("boardToScreen and screenToBoard are inverses", () => {
    const v: View = { x: -40, y: 25, scale: 0.4 };
    const board = { x: 321, y: 654 };
    const back = screenToBoard(v, boardToScreen(v, board));
    expect(back.x).toBeCloseTo(board.x);
    expect(back.y).toBeCloseTo(board.y);
  });

  test("applies translate after scale", () => {
    expect(boardToScreen({ x: 10, y: 20, scale: 2 }, { x: 5, y: 5 })).toEqual({ x: 20, y: 30 });
    expect(screenToBoard({ x: 10, y: 20, scale: 2 }, { x: 20, y: 30 })).toEqual({ x: 5, y: 5 });
  });
});

describe("fitWidth", () => {
  test("fits a wide board into the viewport width minus the margins", () => {
    const fitted = fitWidth(2000, viewport, FIT_MARGIN);
    expect(fitted.scale).toBeCloseTo((1000 - 2 * FIT_MARGIN) / 2000);
  });

  test("never zooms a 375px board past 100%", () => {
    const fitted = fitWidth(375, viewport, FIT_MARGIN);
    expect(fitted.scale).toBe(1);
  });

  test("aligns to the top and centers horizontally", () => {
    const fitted = fitWidth(375, viewport, FIT_MARGIN);
    expect(fitted.y).toBe(FIT_MARGIN);
    expect(fitted.x).toBeCloseTo((1000 - 375) / 2);
  });

  test("falls back to the minimum scale in a zero or tiny viewport", () => {
    expect(fitWidth(1280, { width: 0, height: 0 }, FIT_MARGIN).scale).toBe(MIN_SCALE);
    expect(fitWidth(1280, { width: 40, height: 40 }, FIT_MARGIN).scale).toBe(MIN_SCALE);
  });

  test("stays finite for a zero-width board", () => {
    const fitted = fitWidth(0, viewport, FIT_MARGIN);
    expect(Number.isFinite(fitted.scale)).toBe(true);
    expect(Number.isFinite(fitted.x)).toBe(true);
    expect(fitted.scale).toBeLessThanOrEqual(1);
  });

  test("does not depend on board height, so a zero-height board fits the same", () => {
    expect(fitWidth(1280, viewport, FIT_MARGIN)).toEqual(fitWidth(1280, { width: 1000, height: 0 }, FIT_MARGIN));
  });
});

describe("fitFrame", () => {
  const current: View = { x: 0, y: 0, scale: 0.5 };

  test("a frame smaller than the viewport keeps scale 1 and is centered both ways", () => {
    const rect = { x: 100, y: 200, width: 400, height: 300 };
    const fitted = fitFrame(rect, viewport, FIT_MARGIN, current);
    expect(fitted.scale).toBe(1);
    const center = boardToScreen(fitted, { x: 300, y: 350 });
    expect(center.x).toBeCloseTo(500);
    expect(center.y).toBeCloseTo(400);
  });

  test("a frame wider than the viewport scales down to its width", () => {
    const rect = { x: 0, y: 0, width: 4000, height: 500 };
    const fitted = fitFrame(rect, viewport, FIT_MARGIN, current);
    expect(fitted.scale).toBeCloseTo((1000 - 2 * FIT_MARGIN) / 4000);
  });

  test("a frame taller than the viewport is aligned to the top", () => {
    const rect = { x: 50, y: 900, width: 800, height: 5000 };
    const fitted = fitFrame(rect, viewport, FIT_MARGIN, current);
    expect(fitted.scale).toBe(1);
    expect(boardToScreen(fitted, { x: 50, y: 900 }).y).toBeCloseTo(FIT_MARGIN);
  });

  test("a frame taller than the viewport after scaling is still top-aligned", () => {
    const rect = { x: 0, y: 0, width: 4000, height: 6000 };
    const fitted = fitFrame(rect, viewport, FIT_MARGIN, current);
    expect(boardToScreen(fitted, { x: 0, y: 0 }).y).toBeCloseTo(FIT_MARGIN);
  });

  test("a zero-size frame keeps the current scale and centers its point", () => {
    for (const rect of [
      { x: 700, y: 300, width: 0, height: 0 },
      { x: 700, y: 300, width: 0, height: 50 },
      { x: 700, y: 300, width: 50, height: 0 },
    ]) {
      const fitted = fitFrame(rect, viewport, FIT_MARGIN, current);
      expect(fitted.scale).toBe(0.5);
      const center = boardToScreen(fitted, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
      expect(center.x).toBeCloseTo(500);
      expect(center.y).toBeCloseTo(400);
    }
  });

  test("never exceeds scale 1 and stays finite in a zero viewport", () => {
    const fitted = fitFrame({ x: 0, y: 0, width: 100, height: 100 }, { width: 0, height: 0 }, FIT_MARGIN, current);
    expect(fitted.scale).toBe(MIN_SCALE);
    expect(Number.isFinite(fitted.x) && Number.isFinite(fitted.y)).toBe(true);
  });
});

describe("wheelAction", () => {
  const base = { dx: 0, dy: 0, ctrl: false, meta: false, deltaMode: 0 } as const;

  test("a plain wheel pans by the pixel delta, moving the view opposite to it", () => {
    expect(wheelAction({ ...base, dx: 10, dy: 40 })).toEqual({ pan: { dx: -10, dy: -40 } });
  });

  test("ctrl zooms in on a negative dy and out on a positive dy", () => {
    const zoomIn = wheelAction({ ...base, ctrl: true, dy: -5 });
    const zoomOut = wheelAction({ ...base, ctrl: true, dy: 5 });
    expect(zoomIn).toHaveProperty("zoom");
    expect("zoom" in zoomIn && zoomIn.zoom).toBeGreaterThan(1);
    expect("zoom" in zoomOut && zoomOut.zoom).toBeLessThan(1);
  });

  test("Cmd alone also zooms", () => {
    const action = wheelAction({ ...base, meta: true, dy: -5 });
    expect(action).toHaveProperty("zoom");
  });

  test("a mouse-wheel notch (dy ±100) is clamped to the per-event bound", () => {
    expect(wheelAction({ ...base, ctrl: true, dy: -100 })).toEqual({ zoom: WHEEL_ZOOM_MAX });
    expect(wheelAction({ ...base, ctrl: true, dy: 100 })).toEqual({ zoom: 1 / WHEEL_ZOOM_MAX });
  });

  test("a huge dy whose exp overflows to Infinity or underflows to 0 is still clamped", () => {
    expect(wheelAction({ ...base, ctrl: true, dy: -1e9 })).toEqual({ zoom: WHEEL_ZOOM_MAX });
    expect(wheelAction({ ...base, ctrl: true, dy: 1e9 })).toEqual({ zoom: 1 / WHEEL_ZOOM_MAX });
    expect(wheelAction({ ...base, ctrl: true, dy: Number.NEGATIVE_INFINITY })).toEqual({ zoom: WHEEL_ZOOM_MAX });
    expect(wheelAction({ ...base, ctrl: true, dy: Number.POSITIVE_INFINITY })).toEqual({ zoom: 1 / WHEEL_ZOOM_MAX });
  });

  test("a zero or NaN zoom delta is a no-op factor of 1", () => {
    expect(wheelAction({ ...base, ctrl: true, dy: 0 })).toEqual({ zoom: 1 });
    expect(wheelAction({ ...base, ctrl: true, dy: Number.NaN })).toEqual({ zoom: 1 });
  });

  test("line and page deltaModes are converted to exact pixel pans", () => {
    expect(wheelAction({ ...base, dx: 2, dy: 3, deltaMode: 0 })).toEqual({ pan: { dx: -2, dy: -3 } });
    expect(wheelAction({ ...base, dx: 2, dy: 3, deltaMode: 1 })).toEqual({ pan: { dx: -32, dy: -48 } });
    expect(wheelAction({ ...base, dx: 2, dy: 3, deltaMode: 2 })).toEqual({ pan: { dx: -1600, dy: -2400 } });
  });

  test("zoom factor is exp(-dy * 0.01), after the deltaMode conversion", () => {
    const factor = (action: ReturnType<typeof wheelAction>): number => ("zoom" in action ? action.zoom : Number.NaN);
    expect(factor(wheelAction({ ...base, ctrl: true, dy: -10 }))).toBeCloseTo(Math.exp(0.1), 10);
    expect(factor(wheelAction({ ...base, ctrl: true, dy: 10 }))).toBeCloseTo(Math.exp(-0.1), 10);
    expect(factor(wheelAction({ ...base, ctrl: true, dy: -0.5, deltaMode: 1 }))).toBeCloseTo(Math.exp(0.08), 10);
    expect(factor(wheelAction({ ...base, ctrl: true, dy: -0.01, deltaMode: 2 }))).toBeCloseTo(Math.exp(0.08), 10);
  });

  test("a non-finite pan delta becomes no movement", () => {
    const action = wheelAction({ ...base, dx: Number.NaN, dy: Number.POSITIVE_INFINITY });
    expect("pan" in action).toBe(true);
    if ("pan" in action) {
      expect(action.pan.dx).toBeCloseTo(0);
      expect(action.pan.dy).toBeCloseTo(0);
    }
  });
});
