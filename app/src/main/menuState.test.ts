import { describe, expect, test } from "vitest";
import { menuState } from "./menuState";

describe("menuState", () => {
  test("home: add project only; no Home, no canvas items", () => {
    expect(menuState("home", false, false)).toEqual({ addProject: true, home: false, canvasView: false, undoRemove: false });
  });

  test("workspace without a canvas: Home, but no canvas items", () => {
    expect(menuState("workspace", false, false)).toEqual({ addProject: true, home: true, canvasView: false, undoRemove: false });
  });

  test("workspace with a canvas: every canvas item", () => {
    expect(menuState("canvas", false, false)).toEqual({ addProject: true, home: true, canvasView: true, undoRemove: false });
  });

  test("Undo Remove follows the toast on every screen", () => {
    for (const screen of ["home", "workspace", "canvas"] as const) expect(menuState(screen, false, true).undoRemove).toBe(true);
  });

  test("an open modal disables everything", () => {
    for (const screen of ["home", "workspace", "canvas"] as const) {
      expect(menuState(screen, true, true)).toEqual({ addProject: false, home: false, canvasView: false, undoRemove: false });
    }
  });
});
