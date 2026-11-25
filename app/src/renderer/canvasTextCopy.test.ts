import { describe, expect, test } from "vitest";
import { textCopy } from "./canvasTextCopy";

// A handler that already copied (composer field, copyText), a hidden canvas page or an open menu or dialog wins.
describe("textCopy", () => {
  const ready = { canvasText: "Copy me", defaultPrevented: false, onCanvasPage: true, overlayOpen: false };

  test("returns the canvas text on the canvas page", () => {
    expect(textCopy(ready)).toBe("Copy me");
  });

  test("leaves an event a handler before it already took", () => {
    expect(textCopy({ ...ready, defaultPrevented: true })).toBeNull();
  });

  test("puts nothing off the canvas page or with a menu or dialog open", () => {
    expect(textCopy({ ...ready, onCanvasPage: false })).toBeNull();
    expect(textCopy({ ...ready, overlayOpen: true })).toBeNull();
  });

  test("puts nothing without canvas text or with an empty one", () => {
    expect(textCopy({ ...ready, canvasText: null })).toBeNull();
    expect(textCopy({ ...ready, canvasText: "" })).toBeNull();
  });
});
