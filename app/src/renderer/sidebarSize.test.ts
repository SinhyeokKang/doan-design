import { describe, expect, test } from "vitest";
import type { SidebarSlot } from "./canvasNotice";
import { SIDEBAR_BOUNDS, SIDEBAR_DEFAULT, sidebarToggleView, sidebarWidth } from "./sidebarSize";

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

// shell-panel-layout design §3-2: the header's sidebar button. Hidden, it carries the most urgent signal the sidebar's
// slots would show; canvas notices are left out (spec '결정' 2).
describe("sidebarToggleView", () => {
  const slots = (...kinds: SidebarSlot["kind"][]) => new Map<string, SidebarSlot>(kinds.map((kind, i) => [`k${i}`, kind === "canvas" ? { kind, label: "c" } : { kind, label: "l" }]));
  test("shown: Hide sidebar, never a badge", () => {
    expect(sidebarToggleView(false, slots("permission", "working"))).toEqual({ label: "Hide sidebar", icon: "hide", badge: null });
  });
  test("hidden without a signal: Show sidebar", () => {
    expect(sidebarToggleView(true, slots())).toEqual({ label: "Show sidebar", icon: "show", badge: null });
    expect(sidebarToggleView(true, slots("canvas", "canvas"))).toEqual({ label: "Show sidebar", icon: "show", badge: null });
  });
  test("hidden: permission before working before unseen", () => {
    expect(sidebarToggleView(true, slots("unseen", "working", "permission", "canvas"))).toEqual({ label: "Show sidebar, needs your answer", icon: "show", badge: "permission" });
    expect(sidebarToggleView(true, slots("unseen", "canvas", "working"))).toEqual({ label: "Show sidebar, agent working", icon: "show", badge: "working" });
    expect(sidebarToggleView(true, slots("canvas", "unseen"))).toEqual({ label: "Show sidebar, new activity", icon: "show", badge: "unseen" });
  });
  test("a terminal agent's work counts as working", () => {
    const terminal = new Map<string, SidebarSlot>([["t", { kind: "working", label: "l", source: "terminal" }]]);
    expect(sidebarToggleView(true, terminal).badge).toBe("working");
  });
});
