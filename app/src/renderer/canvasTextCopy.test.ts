import { describe, expect, test } from "vitest";
import { textCopy } from "./canvasTextCopy";

// What the app document's copy listener puts on the clipboard for ⌘C and Edit > Copy: the canvas text, unless a
// handler before it already copied (the composer's field, copyText), the canvas page is not on screen, or a menu or
// dialog is open over it.
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
