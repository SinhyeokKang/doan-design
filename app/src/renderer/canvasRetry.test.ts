import { describe, expect, it } from "vitest";
import { CANVAS_RETRY_IDLE, canvasFailedShown, canvasRetryPressed, canvasRetrySettled, type CanvasRetry } from "./canvasRetry";

// DESIGN 'Busy action': the "Couldn’t load the canvas" line and its Retry stay on screen, the Retry busy, while the
// reload it started runs; only a load that succeeds clears them.
describe("the canvas load failure's Retry", () => {
  const pressed = canvasRetryPressed(CANVAS_RETRY_IDLE, "a");

  it("runs for the canvas it was pressed on, and keeps the failure line through the reload's loading", () => {
    expect(pressed).toEqual({ key: "a", running: true, failures: 0 });
    expect(canvasFailedShown(pressed, "a", "loading")).toBe(true);
    expect(canvasRetrySettled(pressed, "a", "loading")).toBe(pressed);
  });

  it("a press while it runs does nothing", () => {
    expect(canvasRetryPressed(pressed, "a")).toBe(pressed);
  });

  it("a reload that fails again stops it, counts the failure and keeps the line", () => {
    const failed = canvasRetrySettled(pressed, "a", "failed");
    expect(failed).toEqual({ key: "a", running: false, failures: 1 });
    expect(canvasFailedShown(failed, "a", "failed")).toBe(true);
    expect(canvasRetrySettled(failed, "a", "failed")).toBe(failed);
    const again = canvasRetrySettled(canvasRetryPressed(failed, "a"), "a", "failed");
    expect(again).toEqual({ key: "a", running: false, failures: 2 });
  });

  it("only a load that succeeds clears it", () => {
    for (const status of [null, "noWidth", "missing", "empty"] as const) {
      expect(canvasRetrySettled(pressed, "a", status), String(status)).toEqual(CANVAS_RETRY_IDLE);
      expect(canvasFailedShown(canvasRetrySettled(pressed, "a", status), "a", status), String(status)).toBe(false);
    }
  });

  it("another canvas drops it, and that canvas's loading shows no failure line", () => {
    expect(canvasRetrySettled(pressed, "b", "loading")).toEqual(CANVAS_RETRY_IDLE);
    expect(canvasFailedShown(pressed, "b", "loading")).toBe(false);
  });

  it("a reload not started by Retry (⌘R, the header's Reload) shows the Loading line as before", () => {
    expect(canvasFailedShown(CANVAS_RETRY_IDLE, "a", "loading")).toBe(false);
    expect(canvasFailedShown(CANVAS_RETRY_IDLE, "a", "failed")).toBe(true);
  });

  it("keeps the same state object when nothing changes, so settling during a render does not loop", () => {
    expect(canvasRetrySettled(CANVAS_RETRY_IDLE, "a", null)).toBe(CANVAS_RETRY_IDLE);
    expect(canvasRetrySettled(CANVAS_RETRY_IDLE, null, "empty")).toBe(CANVAS_RETRY_IDLE);
    const idle: CanvasRetry = canvasRetrySettled(pressed, "a", null);
    expect(canvasRetrySettled(idle, "a", null)).toBe(idle);
  });
});
