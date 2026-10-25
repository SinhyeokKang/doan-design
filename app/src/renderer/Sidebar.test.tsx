import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { initialCanvasState, type CanvasState } from "./CanvasController";
import { movedKey, moveExpanded, Sidebar } from "./Sidebar";
import type { CanvasRow } from "../main/view";
import { TooltipProvider } from "./components/ui/tooltip";

const row: CanvasRow = { path: "design/billing/plans.html", title: "Billing & plans", url: "u", open: 0, resolved: 0, frames: [{ id: "static" }] };
const layout = { type: "layout" as const, href: "u", height: 100, viewport: 100, truncated: false, frames: [{ id: "intro", title: "Introduction", x: 0, y: 0, width: 1, height: 1 }, { id: "hero", x: 0, y: 0, width: 1, height: 1 }] };
const opened = (): CanvasState => ({ ...initialCanvasState(), open: { folder: "/repo", canvas: row.path, row }, shown: row.path, layout, currentFrame: 0, selection: { tag: "button", frame: { id: "hero" }, frameIndex: 1, path: [] } });
const sidebar = (state = initialCanvasState(), canvas = row) => renderToStaticMarkup(<TooltipProvider><Sidebar entries={[{ path: "/repo", kind: "list", servedRev: 0, canvases: [canvas] }]} state={state} open={() => {}} jump={() => {}} select={() => {}} overview={() => {}} /></TooltipProvider>);

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


test("distinguishes exactly 1,000 long-titled frames from a statically capped list", () => {
  const state = opened();
  const frames = Array.from({ length: 1000 }, (_, index) => ({ id: `frame-${index}`, title: "x".repeat(200), x: 0, y: index, width: 1, height: 1 }));
  state.layout = { ...layout, truncated: true, frames };
  expect(sidebar(state, { ...row, frames, framesTruncated: false })).not.toContain("1,000+");
  const capped = sidebar(state, { ...row, frames, framesTruncated: true });
  expect(capped).not.toContain("1,000+");
  expect(capped).toContain("Showing the first 1,000");
});


test.each(["loading", "noWidth", "failed"] as const)("keeps static frame rows while an open canvas is %s", status => {
  const state = { ...opened(), status, layout: null };
  const html = sidebar(state);
  expect(html).toContain('aria-label="1 static"');
  expect(html).not.toContain("This canvas has no data-doan-frame");
  expect(html).toMatch(/aria-label="Select static"[^>]*disabled/);
});

test("the selected element's row sits at the draft's 74px under a level-3 frame", () => {
  const state = opened();
  const html = sidebar({ ...state, selection: { ...state.selection!, element: { doanId: "cta", selector: "button", html: "<button></button>" } } });
  expect(html).toMatch(/<div class="row element-row" style="padding-left:74px">/);
});

test("a frame without id or title is dimmed as the shipped (no id) label", () => {
  const canvas = { ...row, frames: [{ id: "" }, { id: "named" }] };
  const html = renderToStaticMarkup(<TooltipProvider><Sidebar entries={[{ path: "/repo", kind: "list", servedRev: 0, canvases: [canvas] }]} state={initialCanvasState()} expanded={{ "/repo": ["design/billing", canvas.path] }} open={() => {}} jump={() => {}} select={() => {}} overview={() => {}} /></TooltipProvider>);
  expect(html).toContain('<span class="g no-id">(no id)</span>');
  expect(html).toContain('<span class="g">named</span>');
});

test("a move carries the canvas row and its frame rows to the new path", () => {
  expect(movedKey("design/a.html", "design/a.html", "design/flows/a.html")).toBe("design/flows/a.html");
  expect(movedKey("design/a.html\n1", "design/a.html", "design/flows/a.html")).toBe("design/flows/a.html\n1");
  expect(movedKey("design/a.html.bak", "design/a.html", "design/flows/a.html")).toBe("design/a.html.bak");
  expect(movedKey("overview", "design/a.html", "design/flows/a.html")).toBe("overview");
});

test("a move into another folder expands the new ancestors and moves the canvas row's expansion", () => {
  expect(moveExpanded(["design/old", "design/old/a.html"], "design/old/a.html", "design/flows/sub/a.html"))
    .toEqual(["design/old", "design", "design/flows", "design/flows/sub", "design/flows/sub/a.html"]);
  expect(moveExpanded(["design/old"], "design/old/a.html", "design/flows/a.html")).toEqual(["design/old", "design", "design/flows"]);
  const canvas = { ...row, path: "design/flows/sub/a.html", title: "Moved" };
  const html = renderToStaticMarkup(<TooltipProvider><Sidebar entries={[{ path: "/repo", kind: "list", servedRev: 0, canvases: [canvas] }]} state={initialCanvasState()} expanded={{ "/repo": moveExpanded([row.path], row.path, canvas.path) }} open={() => {}} jump={() => {}} select={() => {}} overview={() => {}} /></TooltipProvider>);
  expect(html).toMatch(/aria-label="flows"[^>]*aria-expanded="true"/);
  expect(html).toMatch(/aria-label="sub"[^>]*aria-expanded="true"/);
  expect(html).toMatch(/aria-label="Moved"[^>]*aria-expanded="true"/);
});
