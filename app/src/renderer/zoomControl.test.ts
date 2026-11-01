import { describe, expect, test } from "vitest";
import type { BoardState } from "./frameDrawer";
import { scaleFactor, zoomControlView } from "./zoomControl";
import { MAX_SCALE, MIN_SCALE, ZOOM_LIMITS, zoomAt, type View } from "./viewport";

const board = (scale: number, patch: Partial<BoardState> = {}): BoardState & { scale: number } => ({
  layout: { frames: [{ id: "a", x: 0, y: 0, width: 100, height: 100 }], truncated: false },
  currentFrame: 0,
  status: null,
  unlisted: false,
  scale,
  ...patch,
});

describe("zoomControlView", () => {
  test("shows the integer percent and enables everything on a rendered board", () => {
    const view = zoomControlView(board(0.64));
    expect(view).toMatchObject({ enabled: true, value: "64%", triggerLabel: "Zoom 64%, zoom options", zoomOut: { disabled: false }, zoomIn: { disabled: false } });
  });

  test("a canvas with no frames still zooms", () => {
    const view = zoomControlView(board(1, { layout: { frames: [], truncated: false }, currentFrame: null }));
    expect(view.enabled).toBe(true);
    expect(view.zoomOut.disabled).toBe(false);
    expect(view.zoomIn.disabled).toBe(false);
  });

  test("no rendered board shows a dash and disables the value menu and both steps", () => {
    const states: Partial<BoardState>[] = [{ status: "loading" }, { status: "failed" }, { status: "noWidth" }, { status: "missing" }, { status: "empty" }, { unlisted: true }, { layout: null }];
    for (const patch of states) {
      expect(zoomControlView(board(1, patch))).toMatchObject({ enabled: false, value: "—", triggerLabel: "Zoom options", zoomOut: { disabled: true }, zoomIn: { disabled: true } });
    }
  });

  test("a reload keeps the control live (status stays null)", () => {
    expect(zoomControlView(board(2.5)).enabled).toBe(true);
  });

  test("at the minimum scale only zoom out is disabled, at the maximum only zoom in", () => {
    const atMin = zoomControlView(board(MIN_SCALE));
    expect(atMin.value).toBe("5%");
    expect(atMin.zoomOut.disabled).toBe(true);
    expect(atMin.zoomIn.disabled).toBe(false);
    const atMax = zoomControlView(board(MAX_SCALE));
    expect(atMax.value).toBe("400%");
    expect(atMax.zoomIn.disabled).toBe(true);
    expect(atMax.zoomOut.disabled).toBe(false);
  });

  test("one step inside the limits keeps both steps enabled", () => {
    const view = zoomControlView(board(0.06));
    expect(view.zoomOut.disabled).toBe(false);
    expect(zoomControlView(board(3.99)).zoomIn.disabled).toBe(false);
  });

  test("a scale that only rounds to a limit's percent is still inside the limit: the step stays enabled", () => {
    const nearMin = zoomControlView(board(0.052));
    expect(nearMin.value).toBe("5%");
    expect(nearMin.zoomOut.disabled).toBe(false);
    const nearMax = zoomControlView(board(3.999));
    expect(nearMax.value).toBe("400%");
    expect(nearMax.zoomIn.disabled).toBe(false);
  });

  test("the displayed percent is rounded from the exact scale", () => {
    expect(zoomControlView(board(0.645)).value).toBe("65%");
    expect(zoomControlView(board(0.6449)).value).toBe("64%");
    expect(zoomControlView(board(0.6449)).triggerLabel).toBe("Zoom 64%, zoom options");
  });

  test("menu items: Fit and 100% reuse the View menu commands and shortcuts, 50% and 200% are scales", () => {
    expect(zoomControlView(board(1)).items).toEqual([
      { id: "fit", label: "Fit", shortcut: "⌘1", command: "fit" },
      { id: "actualSize", label: "100%", shortcut: "⌘0", command: "actualSize" },
      { id: "50", label: "50%", scale: 0.5 },
      { id: "200", label: "200%", scale: 2 },
    ]);
  });

  test("the menu lists the same items while disabled, so the layout does not change", () => {
    expect(zoomControlView(board(1, { status: "loading" })).items).toEqual(zoomControlView(board(1)).items);
  });

  test("the step tooltips name the shortcut like the View menu", () => {
    const view = zoomControlView(board(1));
    expect(view.zoomOut.tooltip).toBe("Zoom out ⌘−");
    expect(view.zoomIn.tooltip).toBe("Zoom in ⌘=");
  });
});

describe("scaleFactor", () => {
  const center = { x: 500, y: 400 };

  test("is the target over the current scale, so zoomAt lands exactly on the target", () => {
    for (const start of [0.05, 0.3, 1, 1.7, 4]) {
      const view: View = { x: -120, y: 35, scale: start };
      for (const target of [0.5, 2]) {
        expect(scaleFactor(target, view)).toBeCloseTo(target / start);
        expect(zoomAt(view, scaleFactor(target, view), center, ZOOM_LIMITS).scale).toBeCloseTo(target);
      }
    }
  });

  test("keeps the view center fixed like the − and + steps", () => {
    const view: View = { x: -120, y: 35, scale: 0.8 };
    const anchored = (v: View) => ({ x: (center.x - v.x) / v.scale, y: (center.y - v.y) / v.scale });
    const next = zoomAt(view, scaleFactor(2, view), center, ZOOM_LIMITS);
    expect(anchored(next).x).toBeCloseTo(anchored(view).x);
    expect(anchored(next).y).toBeCloseTo(anchored(view).y);
  });

  test("is 1 when already at the target", () => {
    expect(scaleFactor(0.5, { x: 0, y: 0, scale: 0.5 })).toBe(1);
  });
});
