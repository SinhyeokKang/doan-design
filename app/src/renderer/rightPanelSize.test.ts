import { expect, test } from "vitest";
import { canvasPanelDefault, canvasPanelsLayout, nudgePanel, OVERVIEW_PANEL_DEFAULT, panelBounds, panelWidth } from "./rightPanelSize";

// 960 → 716 is where the shell (window minus the 220 sidebar and margins) leaves the 356 max.
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

// With the sidebar shown the shell is the window minus 244 (sidebar and margins), hidden minus 24.
const shown = (window: number) => ({ windowWidth: window, shellWidth: window - 244 });
const open = { open: true }, closed = { open: false };

test("reserved leaves another panel's width out of the canvas limit", () => {
  expect(panelBounds(1280, 1036, 280)).toEqual({ min: 280, max: 396 });
  expect(panelBounds(1280, 1036, 0)).toEqual(panelBounds(1280, 1036));
  // Only the canvas limit moves; half the window still caps a wide shell.
  expect(panelBounds(1512, 1268, 280)).toEqual({ min: 280, max: 628 });
  expect(panelBounds(1512, 1268)).toEqual({ min: 280, max: 756 });
  // Too narrow for both: the maximum wins, as without reserved.
  expect(panelBounds(960, 716, 280)).toEqual({ min: 76, max: 76 });
});

test.each([
  ["960, sidebar shown", shown(960)],
  ["960, sidebar hidden", { windowWidth: 960, shellWidth: 936 }],
  ["1140, sidebar shown", shown(1140)],
])("both panels open in a narrow window: the inspector yields and the conversation keeps its own rule (%s)", (_name, size) => {
  const layout = canvasPanelsLayout({ ...size, conversation: open, inspector: open });
  expect(layout.inspectorFits).toBe(false);
  expect(layout.inspector).toEqual({ width: 0, bounds: null });
  expect(layout.conversation).toEqual({ width: panelWidth(undefined, panelBounds(size.windowWidth, size.shellWidth), canvasPanelDefault(size.windowWidth)), bounds: panelBounds(size.windowWidth, size.shellWidth) });
});

test.each([
  [1280, 358, { min: 280, max: 318 }, { min: 280, max: 396 }],
  [1470, 412, { min: 280, max: 454 }, { min: 280, max: 586 }],
  [1512, 423, { min: 280, max: 485 }, { min: 280, max: 628 }],
])("both panels open at %i: the conversation first, then the inspector at 280 within what is left", (window, conversation, inspectorBounds, conversationBounds) => {
  const layout = canvasPanelsLayout({ ...shown(window), conversation: open, inspector: open });
  expect(layout.inspectorFits).toBe(true);
  expect(layout.conversation).toEqual({ width: conversation, bounds: conversationBounds });
  expect(layout.inspector).toEqual({ width: 280, bounds: inspectorBounds });
});

test("a folded conversation counts as 0, so the inspector fits at 1140 and may take the rest", () => {
  const layout = canvasPanelsLayout({ ...shown(1140), conversation: closed, inspector: open });
  expect(layout.inspectorFits).toBe(true);
  expect(layout.conversation.width).toBe(0);
  expect(layout.inspector).toEqual({ width: 280, bounds: { min: 280, max: 536 } });
  expect(canvasPanelsLayout({ ...shown(1140), conversation: closed, inspector: { open: true, width: 600 } }).inspector.width).toBe(536);
});

test("a folded inspector takes no width and reserves nothing from the conversation", () => {
  const layout = canvasPanelsLayout({ ...shown(1280), conversation: open, inspector: closed });
  expect(layout.inspector.width).toBe(0);
  expect(layout.conversation).toEqual({ width: 358, bounds: { min: 280, max: 640 } });
  // The inspector would fit, so Show inspector is available.
  expect(layout.inspectorFits).toBe(true);
  expect(canvasPanelsLayout({ ...shown(1140), conversation: open, inspector: closed }).inspectorFits).toBe(false);
});

test("a saved inspector width beyond its maximum shows as the maximum and the saved value stays", () => {
  const inspector = { open: true, width: 500 };
  const layout = canvasPanelsLayout({ ...shown(1280), conversation: open, inspector });
  expect(layout.inspector).toEqual({ width: 318, bounds: { min: 280, max: 318 } });
  expect(layout.conversation.bounds).toEqual({ min: 280, max: 358 });
  expect(inspector.width).toBe(500);
  expect(canvasPanelsLayout({ ...shown(1512), conversation: open, inspector }).inspector.width).toBe(485);
});

test("widths saved in a wide window, then the window narrows: the conversation keeps its width and the inspector yields", () => {
  const conversation = { open: true, width: 600 }, inspector = { open: true, width: 400 };
  const wide = canvasPanelsLayout({ ...shown(1512), conversation, inspector });
  expect(wide.conversation).toEqual({ width: 600, bounds: { min: 280, max: 600 } });
  expect(wide.inspector).toEqual({ width: 308, bounds: { min: 280, max: 308 } });
  const narrow = canvasPanelsLayout({ ...shown(1280), conversation, inspector });
  expect(narrow.inspectorFits).toBe(false);
  expect(narrow.conversation).toEqual({ width: 600, bounds: { min: 280, max: 640 } });
  expect(narrow.inspector).toEqual({ width: 0, bounds: null });
  expect(canvasPanelsLayout({ ...shown(1512), conversation, inspector })).toEqual(wide);
});

test("the inspector fits only when 280 is left beside the conversation and the canvas's 360", () => {
  // 1036 − 396 − 360 = 280: just fits.
  expect(canvasPanelsLayout({ ...shown(1280), conversation: { open: true, width: 396 }, inspector: open }).inspector.width).toBe(280);
  expect(canvasPanelsLayout({ ...shown(1280), conversation: { open: true, width: 397 }, inspector: open }).inspectorFits).toBe(false);
});
