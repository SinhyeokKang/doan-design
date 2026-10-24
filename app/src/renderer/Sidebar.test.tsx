import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { initialCanvasState } from "./CanvasController";
import type { SelectionView } from "./selection";
import { Sidebar } from "./Sidebar";
import type { FolderEntry } from "../main/view";
import { TooltipProvider } from "./components/ui/tooltip";

const layout = { type: "layout" as const, href: "u", height: 100, viewport: 100, truncated: false, frames: [{ id: "intro", x: 0, y: 0, width: 1, height: 1 }, { id: "hero", x: 0, y: 0, width: 1, height: 1 }] };
const element: SelectionView = { tag: "button", frame: { id: "hero" }, frameIndex: 1, element: { doanId: "sign-in", selector: "s", html: "<button></button>" }, path: [] };
const frames = (selection: SelectionView | null) => {
  const html = renderToStaticMarkup(<Sidebar entries={[]} names={new Map()} state={{ ...initialCanvasState(), layout, selection }} open={() => {}} jump={() => {}} />);
  return html.slice(html.indexOf('aria-label="Frames"'));
};

test("marks the frame around the selection current and lists the element under it", () => {
  const html = frames(element);
  expect([...html.matchAll(/<button class="row frame-row"( aria-current="true")?/g)].map(match => match[1] !== undefined)).toEqual([false, true]);
  expect(html).toContain('<div class="row element-row"><span class="glyph" aria-hidden="true">↳</span><span class="g">button · sign-in</span></div>');
});

test("a frame selection marks its row without a sub-row, and no selection marks nothing", () => {
  const { element: _element, ...frameOnly } = element;
  expect(frames(frameOnly)).not.toContain("element-row");
  expect(frames(frameOnly)).toContain('aria-current="true"');
  expect(frames(null)).not.toContain("aria-current");
});

const sidebar = (entries: FolderEntry[]) => renderToStaticMarkup(<TooltipProvider><Sidebar entries={entries} names={new Map(entries.map(entry => [entry.path, entry.path.split("/").at(-1) ?? ""]))} state={initialCanvasState()} open={() => {}} jump={() => {}} /></TooltipProvider>);

test("a Not initialized row explains setup and offers Set Up… in the recovery area", () => {
  const html = sidebar([{ path: "/code/new-app", kind: "uninitialized" }]);
  expect(html).toMatch(/<div class="hint"><p>Set up this project to add design\/ and \.doan\/\.<\/p><div class="recovery"><button[^>]*class="btn"[^>]*>Set Up…<\/button><\/div><\/div>/);
  expect(html).not.toContain("doan init");
  expect(html).toContain('aria-label="Close project new-app"');
});

test("a project without canvases offers Copy first prompt with the replace hint", () => {
  const html = sidebar([{ path: "/code/acme-web", kind: "list", servedRev: 0, canvases: [] }]);
  expect(html).toMatch(/<div class="hint"><p>No canvases<\/p><div class="recovery"><button[^>]*class="btn"[^>]*>Copy first prompt<\/button><\/div><p>Replace &lt;what you want to design&gt; before sending\.<\/p><\/div>/);
});

test("a project with canvases has no first-prompt button", () => {
  expect(sidebar([{ path: "/code/acme-web", kind: "list", servedRev: 0, canvases: [{ path: "design/a.html", url: "u", open: 0, resolved: 0 }] }])).not.toContain("Copy first prompt");
});
