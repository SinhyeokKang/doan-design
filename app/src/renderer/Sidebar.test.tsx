import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { initialCanvasState, type CanvasState } from "./CanvasController";
import { Sidebar } from "./Sidebar";
import type { CanvasRow } from "../main/view";
import { TooltipProvider } from "./components/ui/tooltip";

const row: CanvasRow = { path: "design/billing/plans.html", title: "Billing & plans", url: "u", open: 0, resolved: 0, frames: [{ id: "static" }] };
const layout = { type: "layout" as const, href: "u", height: 100, viewport: 100, truncated: false, frames: [{ id: "intro", title: "Introduction", x: 0, y: 0, width: 1, height: 1 }, { id: "hero", x: 0, y: 0, width: 1, height: 1 }] };
const opened = (): CanvasState => ({ ...initialCanvasState(), open: { folder: "/repo", canvas: row.path, row }, shown: row.path, layout, currentFrame: 0, selection: { tag: "button", frame: { id: "hero" }, frameIndex: 1, path: [] } });
const sidebar = (state = initialCanvasState(), canvas = row) => renderToStaticMarkup(<TooltipProvider><Sidebar entries={[{ path: "/repo", kind: "list", servedRev: 0, canvases: [canvas] }]} names={new Map()} state={state} open={() => {}} jump={() => {}} select={() => {}} overview={() => {}} /></TooltipProvider>);

test("shows Overview first, nested folders and title-first two-line canvases", () => {
  const html = sidebar();
  expect(html).toContain('aria-label="Canvases"');
  expect(html.indexOf('aria-label="Overview"')).toBeLessThan(html.indexOf('aria-label="billing"'));
  expect(html).toContain('aria-label="billing"');
  expect(html).toContain('aria-label="Billing &amp; plans"');
  expect(html).toContain('plans.html</span>');
  expect(html).not.toContain('0 open comments');
  expect(html).not.toContain('Remove ');
  expect(html).not.toContain('aria-label="Frames"');
});

test("separates the viewed frame from the selected frame and uses rendered frames", () => {
  const html = sidebar(opened());
  expect(html).toMatch(/aria-label="1 Introduction"[^>]*aria-current="location"/);
  expect(html).toContain('aria-label="2 hero, selected in canvas"');
  expect(html).not.toContain('aria-selected');
  expect(html).not.toContain('static');
  expect(html).toContain('aria-label="Select hero"');
});

test("does not turn a clipped title into a 1,000+ frame count", () => {
  const state = opened();
  state.layout = { ...layout, truncated: true };
  expect(sidebar(state)).not.toContain('1,000+');
  expect(sidebar(state)).not.toContain('Showing the first 1,000');
});

test("shows a positive open-comment badge", () => {
  expect(sidebar(initialCanvasState(), { ...row, open: 2 })).toContain('2 open comments');
});
