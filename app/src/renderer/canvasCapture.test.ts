import { describe, expect, test } from "vitest";
import { CAPTURE_LIMIT, CAPTURE_TERMINAL, CAPTURE_UNAVAILABLE, captureAvailability, captureRect, MIN_CAPTURE } from "./canvasCapture";

// canvas-capture design '순수 함수' 1: the dragged area in `.area` px, clipped to the area, whole px, at least 8 px.
describe("captureRect", () => {
  const bounds = { width: 800, height: 600 };

  test("normalizes either drag direction to the same rectangle", () => {
    const rect = { x: 100, y: 50, width: 200, height: 120 };
    expect(captureRect({ x: 100, y: 50 }, { x: 300, y: 170 }, bounds)).toEqual(rect);
    expect(captureRect({ x: 300, y: 170 }, { x: 100, y: 50 }, bounds)).toEqual(rect);
    expect(captureRect({ x: 300, y: 50 }, { x: 100, y: 170 }, bounds)).toEqual(rect);
    expect(captureRect({ x: 100, y: 170 }, { x: 300, y: 50 }, bounds)).toEqual(rect);
  });

  test("clips to the area's bounds on every side", () => {
    expect(captureRect({ x: -40, y: -10 }, { x: 120, y: 90 }, bounds)).toEqual({ x: 0, y: 0, width: 120, height: 90 });
    expect(captureRect({ x: 700, y: 500 }, { x: 900, y: 700 }, bounds)).toEqual({ x: 700, y: 500, width: 100, height: 100 });
    expect(captureRect({ x: -5, y: -5 }, { x: 805, y: 605 }, bounds)).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  test("rounds to whole px", () => {
    expect(captureRect({ x: 10.4, y: 20.6 }, { x: 60.5, y: 80.2 }, bounds)).toEqual({ x: 10, y: 21, width: 51, height: 59 });
    for (const rect of [captureRect({ x: 0.3, y: 0.7 }, { x: 99.9, y: 33.3 }, bounds)]) {
      expect(rect).not.toBeNull();
      for (const value of Object.values(rect!)) expect(Number.isInteger(value)).toBe(true);
    }
  });

  test("a click or a drag under 8 px on either side gives nothing", () => {
    expect(MIN_CAPTURE).toBe(8);
    expect(captureRect({ x: 50, y: 50 }, { x: 50, y: 50 }, bounds)).toBeNull();
    expect(captureRect({ x: 50, y: 50 }, { x: 57, y: 200 }, bounds)).toBeNull();
    expect(captureRect({ x: 50, y: 50 }, { x: 200, y: 57 }, bounds)).toBeNull();
    expect(captureRect({ x: 50, y: 50 }, { x: 58, y: 58 }, bounds)).toEqual({ x: 50, y: 50, width: 8, height: 8 });
  });

  test("measures the minimum after clipping, so a drag mostly outside the area gives nothing", () => {
    expect(captureRect({ x: 795, y: 100 }, { x: 1200, y: 300 }, bounds)).toBeNull();
    expect(captureRect({ x: -300, y: 100 }, { x: 4, y: 300 }, bounds)).toBeNull();
    expect(captureRect({ x: 100, y: -300 }, { x: 300, y: 7 }, bounds)).toBeNull();
  });

  test("a drag entirely outside the area gives nothing", () => {
    expect(captureRect({ x: 900, y: 100 }, { x: 1000, y: 300 }, bounds)).toBeNull();
    expect(captureRect({ x: -200, y: -200 }, { x: -100, y: -100 }, bounds)).toBeNull();
  });

  test("non-finite points give nothing", () => {
    expect(captureRect({ x: Number.NaN, y: 0 }, { x: 100, y: 100 }, bounds)).toBeNull();
    expect(captureRect({ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 100 }, bounds)).toBeNull();
  });
});

// canvas-capture design §3 '쓸 수 있는지': canvas → composer → terminal session (`fixed`) → 10 attachments.
describe("captureAvailability", () => {
  const ready = { canvas: "loaded" as const, composer: null, fixed: false, attachments: 0 };

  test("on while the canvas is loaded and the composer takes another file", () => {
    expect(captureAvailability(ready)).toEqual({ enabled: true, reason: null });
    expect(captureAvailability({ ...ready, attachments: 9 })).toEqual({ enabled: true, reason: null });
  });

  test.each(["loading", "failed", "noWidth", "unlisted"] as const)("a canvas that can't be shown (%s) gives the canvas reason first", canvas => {
    expect(captureAvailability({ ...ready, canvas })).toEqual({ enabled: false, reason: CAPTURE_UNAVAILABLE });
    expect(captureAvailability({ canvas, composer: "The composer is blocked.", fixed: true, attachments: 10 }).reason).toBe(CAPTURE_UNAVAILABLE);
  });

  test("a composer that takes no input gives its own reason line, ahead of the terminal session and the limit", () => {
    const composer = "This canvas isn’t listed in acme-web, so its conversation can’t continue.";
    expect(captureAvailability({ ...ready, composer })).toEqual({ enabled: false, reason: composer });
    expect(captureAvailability({ ...ready, composer, fixed: true, attachments: 10 }).reason).toBe(composer);
  });

  test("a terminal session or a legacy external conversation gives Attach's reason, ahead of the limit", () => {
    expect(captureAvailability({ ...ready, fixed: true })).toEqual({ enabled: false, reason: CAPTURE_TERMINAL });
    expect(captureAvailability({ ...ready, fixed: true, attachments: 10 }).reason).toBe(CAPTURE_TERMINAL);
  });

  test("10 attachments give the limit reason", () => {
    expect(captureAvailability({ ...ready, attachments: 10 })).toEqual({ enabled: false, reason: CAPTURE_LIMIT });
    expect(captureAvailability({ ...ready, attachments: 11 })).toEqual({ enabled: false, reason: CAPTURE_LIMIT });
  });

  test("uses the confirmed copy", () => {
    expect(CAPTURE_UNAVAILABLE).toBe("Capture area isn’t available while the canvas can’t be shown.");
    expect(CAPTURE_TERMINAL).toBe("Files can’t be attached to a terminal session");
    expect(CAPTURE_LIMIT).toBe("Only 10 files can be attached. Remove one to add another.");
  });
});
