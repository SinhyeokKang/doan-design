import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { initialCanvasState, type CanvasState } from "./CanvasController";
import { movedKey, moveExpanded, Sidebar } from "./Sidebar";
import type { CanvasRow } from "../main/view";
import { TooltipProvider } from "./components/ui/tooltip";

const row: CanvasRow = { path: ".doan/canvases/billing/plans.html", title: "Billing & plans", url: "u", open: 0, resolved: 0, frames: [{ id: "static" }] };
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

test("shows a positive open-comment badge, singular for one", () => {
  expect(sidebar(initialCanvasState(), { ...row, open: 2 })).toContain('aria-label="2 open comments"');
  expect(sidebar(initialCanvasState(), { ...row, open: 1 })).toContain('aria-label="1 open comment"');
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
  const html = renderToStaticMarkup(<TooltipProvider><Sidebar entries={[{ path: "/repo", kind: "list", servedRev: 0, canvases: [canvas] }]} state={initialCanvasState()} expanded={{ "/repo": [".doan/canvases/billing", canvas.path] }} open={() => {}} jump={() => {}} select={() => {}} overview={() => {}} /></TooltipProvider>);
  expect(html).toContain('<span class="g no-id">(no id)</span>');
  expect(html).toContain('<span class="g">named</span>');
});

test("a move carries the canvas row and its frame rows to the new path", () => {
  expect(movedKey(".doan/canvases/a.html", ".doan/canvases/a.html", ".doan/canvases/flows/a.html")).toBe(".doan/canvases/flows/a.html");
  expect(movedKey(".doan/canvases/a.html\n1", ".doan/canvases/a.html", ".doan/canvases/flows/a.html")).toBe(".doan/canvases/flows/a.html\n1");
  expect(movedKey(".doan/canvases/a.html.bak", ".doan/canvases/a.html", ".doan/canvases/flows/a.html")).toBe(".doan/canvases/a.html.bak");
  expect(movedKey("overview", ".doan/canvases/a.html", ".doan/canvases/flows/a.html")).toBe("overview");
});

test("a move into another folder expands the new ancestors and moves the canvas row's expansion", () => {
  expect(moveExpanded([".doan/canvases/old", ".doan/canvases/old/a.html"], ".doan/canvases/old/a.html", ".doan/canvases/flows/sub/a.html"))
    .toEqual([".doan/canvases/old", ".doan/canvases", ".doan/canvases/flows", ".doan/canvases/flows/sub", ".doan/canvases/flows/sub/a.html"]);
  expect(moveExpanded([".doan/canvases/old"], ".doan/canvases/old/a.html", ".doan/canvases/flows/a.html")).toEqual([".doan/canvases/old", ".doan/canvases", ".doan/canvases/flows"]);
  const canvas = { ...row, path: ".doan/canvases/flows/sub/a.html", title: "Moved" };
  const html = renderToStaticMarkup(<TooltipProvider><Sidebar entries={[{ path: "/repo", kind: "list", servedRev: 0, canvases: [canvas] }]} state={initialCanvasState()} expanded={{ "/repo": moveExpanded([row.path], row.path, canvas.path) }} open={() => {}} jump={() => {}} select={() => {}} overview={() => {}} /></TooltipProvider>);
  expect(html).toMatch(/aria-label="flows"[^>]*aria-expanded="true"/);
  expect(html).toMatch(/aria-label="sub"[^>]*aria-expanded="true"/);
  expect(html).toMatch(/aria-label="Moved"[^>]*aria-expanded="true"/);
});

// project-feedback draft `tree-errors`: a row ls could not fully read keeps its
// place in the tree; a warning mark replaces the badge and a fixed sentence
// under the row describes it. The raw message waits behind Details.
test("a row whose comment file could not be read shows the warning and the comments sentence", () => {
  const html = sidebar(initialCanvasState(), { ...row, open: 0, commentsError: { code: "unreadable_comments", message: "Cannot read .doan/comments/plans.jsonl: permission denied" } });
  expect(html).toMatch(/aria-label="Billing &amp; plans"[^>]*aria-describedby="([^"]+)"/);
  const id = /aria-label="Billing &amp; plans"[^>]*aria-describedby="([^"]+)"/.exec(html)![1]!;
  expect(html).toContain(`<p class="tree-hint warn" id="${id}" style="padding-left:46px">Couldn’t read this canvas’s comments — run doan check<br/><button type="button" class="btn doan-button" data-ui-size="sm" aria-label="Details" aria-expanded="false">Details ▸</button></p>`);
  expect(html).toContain('<span class="warn-mark" aria-hidden="true">⚠</span>');
  expect(html).not.toContain("permission denied");
  expect(html).not.toContain('class="cnt');
});

test("a row whose canvas file could not be read shows the canvas sentence and no frame hint", () => {
  const unreadable: CanvasRow = { path: ".doan/canvases/legacy.html", url: "u", open: 0, resolved: 0, frames: [], error: { code: "unreadable_canvas", message: "Cannot read .doan/canvases/legacy.html: permission denied" } };
  const state = { ...initialCanvasState() };
  const html = renderToStaticMarkup(<TooltipProvider><Sidebar entries={[{ path: "/repo", kind: "list", servedRev: 0, canvases: [unreadable] }]} state={state} expanded={{ "/repo": [".doan/canvases/legacy.html"] }} open={() => {}} jump={() => {}} select={() => {}} overview={() => {}} /></TooltipProvider>);
  // A root-level row: the sentence is indented one level less.
  expect(html).toContain('style="padding-left:32px">Can&#x27;t read this canvas — run doan check<br/>');
  expect(html).toMatch(/aria-label="legacy"[^>]*aria-describedby=/);
  expect(html).not.toContain("This canvas has no data-doan-frame");
  expect(html).not.toContain("permission denied");
});

test("an error row with open comments still shows the warning, not the badge", () => {
  const html = sidebar(initialCanvasState(), { ...row, open: 3, commentsError: { code: "unreadable_comments", message: "m" } });
  expect(html).not.toContain('aria-label="3 open comments"');
  expect(html).toContain("warn-mark");
});
