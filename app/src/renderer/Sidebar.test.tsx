import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { initialCanvasState } from "./CanvasController";
import type { SelectionView } from "./selection";
import { Sidebar } from "./Sidebar";

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
