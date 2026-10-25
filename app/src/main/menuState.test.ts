import { describe, expect, test } from "vitest";
import { menuState } from "./menuState";

describe("menuState", () => {
  test("home: add project only; no Home, no canvas items", () => {
    expect(menuState("home", false, false)).toEqual({ addProject: true, home: false, canvasView: false, undoRemove: false, quickOpen: true, settings: true, resolvedNav: false });
  });

  test("workspace without a canvas: Home, but no canvas items", () => {
    expect(menuState("workspace", false, false)).toEqual({ addProject: true, home: true, canvasView: false, undoRemove: false, quickOpen: true, settings: true, resolvedNav: false });
  });

  test("workspace with a canvas: every canvas item", () => {
    expect(menuState("canvas", false, false)).toEqual({ addProject: true, home: true, canvasView: true, undoRemove: false, quickOpen: true, settings: true, resolvedNav: false });
  });

  test("Undo Remove follows the toast on every screen", () => {
    for (const screen of ["home", "workspace", "canvas"] as const) expect(menuState(screen, false, true).undoRemove).toBe(true);
  });

  test("an open modal disables everything", () => {
    for (const screen of ["home", "workspace", "canvas"] as const) {
      expect(menuState(screen, true, true)).toEqual({ addProject: false, home: false, canvasView: false, undoRemove: false, quickOpen: false, settings: true, resolvedNav: false });
    }
  });
});

test("disables Settings while the wizard is open", () => {
  expect(menuState("canvas", false, true, { wizardOpen: true, focusedWindow: "main" }).settings).toBe(false);
});
test("disables main-window actions when Settings is focused", () => {
  expect(menuState("canvas", false, true, { wizardOpen: false, focusedWindow: "settings" })).toEqual({
    addProject: false, home: false, canvasView: false, undoRemove: false, quickOpen: false, settings: true, resolvedNav: false,
  });
});

// Go > Next/Previous Resolved Comment (revision-recheck): only while a Review
// runs on the open canvas, so ⌘] and ⌘[ do nothing anywhere else.
test("Next/Previous Resolved Comment are enabled only while reviewing on a canvas", () => {
  const main = { wizardOpen: false, focusedWindow: "main" as const };
  expect(menuState("canvas", false, false, { ...main, reviewing: true }).resolvedNav).toBe(true);
  expect(menuState("canvas", false, false, { ...main, reviewing: false }).resolvedNav).toBe(false);
  expect(menuState("canvas", false, false, main).resolvedNav).toBe(false);
  for (const screen of ["home", "workspace"] as const) expect(menuState(screen, false, false, { ...main, reviewing: true }).resolvedNav, screen).toBe(false);
  expect(menuState("canvas", true, false, { ...main, reviewing: true }).resolvedNav).toBe(false);
  expect(menuState("canvas", false, false, { wizardOpen: false, focusedWindow: "settings", reviewing: true }).resolvedNav).toBe(false);
});
