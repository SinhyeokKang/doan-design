import { expect, test } from "vitest";
import { SIDEBAR_BOUNDS, SIDEBAR_DEFAULT, sidebarWidth } from "./sidebarSize";

// The sidebar is resizable between 180 and 360 and starts at its former fixed 220 (user decision).
test("the sidebar keeps 180-360 and starts at 220", () => {
  expect(SIDEBAR_BOUNDS).toEqual({ min: 180, max: 360 });
  expect(SIDEBAR_DEFAULT).toBe(220);
});

test("a saved width shows clamped; a missing or unusable one is the default", () => {
  expect(sidebarWidth(undefined)).toBe(220);
  expect(sidebarWidth(Number.NaN)).toBe(220);
  expect(sidebarWidth(260)).toBe(260);
  expect(sidebarWidth(120)).toBe(180);
  expect(sidebarWidth(900)).toBe(360);
});
