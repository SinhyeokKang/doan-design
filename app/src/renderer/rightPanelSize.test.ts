import { expect, test } from "vitest";
import { canvasPanelDefault, nudgePanel, OVERVIEW_PANEL_DEFAULT, panelBounds, panelWidth } from "./rightPanelSize";

// The shell column is the window minus the sidebar (220) and the shell's side margins; 960 → 716 is what
// leaves design buzz-canvas §2's max of 356 there. Wider windows are never limited by it.
const W960 = { window: 960, shell: 716 };
const W1238 = { window: 1238, shell: 994 };
const W1440 = { window: 1440, shell: 1196 };

const bounds = ({ window, shell }: { window: number; shell: number }) => panelBounds(window, shell);
const width = (saved: number | undefined, { window, shell }: { window: number; shell: number }) => panelWidth(saved, panelBounds(window, shell), canvasPanelDefault(window));

test.each([
  [W960, 320],
  [W1238, 347],
  [W1440, 403],
])("the canvas panel's default is max(320, 28% of the window): %j", (size, fallback) => {
  expect(canvasPanelDefault(size.window)).toBe(fallback);
  expect(width(undefined, size)).toBe(fallback);
});

test.each([W960, W1238, W1440])("the minimum is 280 whatever the window: %j", size => {
  expect(bounds(size).min).toBe(280);
});

test("the Overview panel's default is 280 and clamps like any other", () => {
  expect(OVERVIEW_PANEL_DEFAULT).toBe(280);
  expect(panelWidth(undefined, bounds(W1238), OVERVIEW_PANEL_DEFAULT)).toBe(280);
  expect(panelWidth(500, bounds(W1238), OVERVIEW_PANEL_DEFAULT)).toBe(500);
  expect(panelWidth(undefined, { min: 200, max: 200 }, OVERVIEW_PANEL_DEFAULT)).toBe(200);
});

test.each([
  [W960, 356],
  [W1238, 619],
  [W1440, 720],
])("the maximum is the smaller of 50% of the window and the width that leaves the canvas 360: %j", (size, max) => {
  expect(bounds(size).max).toBe(max);
});

test("a window whose minimum exceeds its maximum uses the maximum for both", () => {
  const narrow = panelBounds(600, 380);
  expect(narrow).toEqual({ min: 20, max: 20 });
  expect(panelWidth(undefined, narrow, canvasPanelDefault(600))).toBe(20);
  expect(panelWidth(500, narrow, canvasPanelDefault(600))).toBe(20);
  expect(panelBounds(600, 300)).toEqual({ min: 0, max: 0 });
  expect(panelWidth(undefined, panelBounds(600, 300), canvasPanelDefault(600))).toBe(0);
  // Below 560 the maximum (half the window) falls under 280, so both limits are the maximum.
  expect(panelBounds(540, 2000)).toEqual({ min: 270, max: 270 });
});

test("a saved width inside the bounds is shown as is", () => {
  expect(width(400, W1238)).toBe(400);
  expect(width(619, W1238)).toBe(619);
  expect(width(347, W1238)).toBe(347);
  expect(width(280, W1238)).toBe(280);
});

test("a saved width beyond the maximum shows as the maximum without changing the saved value", () => {
  const saved = 600;
  expect(width(saved, W1238)).toBe(600);
  expect(width(saved, W960)).toBe(356);
  expect(saved).toBe(600);
  // The window grows again: the same saved value shows in full.
  expect(width(saved, W1238)).toBe(600);
});

test("a saved width below the minimum shows as the minimum", () => {
  expect(width(280, W960)).toBe(280);
  expect(width(250, W1440)).toBe(280);
});

test("a saved value that is missing or not a usable number is the default", () => {
  for (const bad of [undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(width(bad, W1238)).toBe(347);
});

test("dragging below the minimum stops at the minimum and dragging past the maximum stops at the maximum", () => {
  expect(width(10, W1238)).toBe(280);
  expect(width(-50, W1238)).toBe(280);
  expect(width(5000, W1238)).toBe(619);
});

test("ArrowLeft widens by 16, ArrowRight narrows by 16", () => {
  const b = bounds(W1238);
  expect(nudgePanel(400, "ArrowLeft", b)).toBe(416);
  expect(nudgePanel(400, "ArrowRight", b)).toBe(384);
});

test("nudges stop at the bounds", () => {
  const b = bounds(W1238);
  expect(nudgePanel(610, "ArrowLeft", b)).toBe(619);
  expect(nudgePanel(619, "ArrowLeft", b)).toBe(619);
  expect(nudgePanel(290, "ArrowRight", b)).toBe(280);
  expect(nudgePanel(280, "ArrowRight", b)).toBe(280);
});

test("Home is the maximum and End is the minimum", () => {
  const b = bounds(W1238);
  expect(nudgePanel(400, "Home", b)).toBe(619);
  expect(nudgePanel(400, "End", b)).toBe(280);
  expect(nudgePanel(400, "Home", bounds(W960))).toBe(356);
});

test("other keys are not handled", () => {
  const b = bounds(W1238);
  for (const key of ["ArrowUp", "ArrowDown", "Enter", " ", "Escape", "a"]) expect(nudgePanel(400, key, b)).toBeNull();
});

test("the double-click reset is the default width, even when a saved value exists", () => {
  expect(width(undefined, W1238)).toBe(347);
  expect(width(undefined, W1440)).toBe(403);
});

// The sidebar's handle sits on its end edge: → widens, ← narrows, Home moves the edge to the minimum and End to the maximum.
test("nudgePanel on an end edge", () => {
  const side = { min: 180, max: 360 };
  expect(nudgePanel(220, "ArrowRight", side, "end")).toBe(236);
  expect(nudgePanel(220, "ArrowLeft", side, "end")).toBe(204);
  expect(nudgePanel(220, "Home", side, "end")).toBe(180);
  expect(nudgePanel(220, "End", side, "end")).toBe(360);
  expect(nudgePanel(352, "ArrowRight", side, "end")).toBe(360);
  expect(nudgePanel(220, "Enter", side, "end")).toBeNull();
});
