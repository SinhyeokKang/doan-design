import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OpenBadge } from "./rightPanelOpen";
import { describe, expect, it, vi } from "vitest";
import type { CanvasRow } from "../main/view";
import type { LayoutMessage } from "./canvasMessage";
import { CanvasHeader } from "./CanvasHeader";
import { initialCanvasState, type CanvasState } from "./CanvasController";
import { TooltipProvider } from "./components/ui/tooltip";
import { CONVERSATION_PANEL_ID } from "./ConversationPanel";

// buzz-canvas design §0 'default', 'no-frames', 'states' and §2 '프레임 서랍', '배율 컨트롤러', §5 copy.
const row: CanvasRow = { path: ".doan/canvases/checkout.html", url: "doan://checkout", width: 1280 };
const frames = ["Cart", "Shipping", "Payment"].map((title, index) => ({ id: title.toLowerCase(), title, x: 0, y: index * 900, width: 1280, height: 800 }));
const layout = (over: Partial<LayoutMessage> = {}): LayoutMessage => ({ type: "layout", href: row.url, height: 2700, viewport: 2700, frames, truncated: false, ...over });
const opened = (over: Partial<CanvasState> = {}): CanvasState => ({ ...initialCanvasState(), open: { folder: "/repo", canvas: row.path, row }, shown: row.path, status: null, message: "", hasFrame: true, layout: layout(), currentFrame: 2, zoom: 64, scale: 0.64, ...over });

const html = (state: CanvasState, panel?: { open: boolean; show(): void; badge?: OpenBadge | null }) => renderToStaticMarkup(<TooltipProvider>{<CanvasHeader state={state} command={vi.fn()} zoomTo={vi.fn()} selectFrame={vi.fn()} {...(panel ? { panel } : {})} /> as ReactElement}</TooltipProvider>);
const button = (markup: string, label: string) => markup.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";

describe("CanvasHeader", () => {
  it("reads canvas / frame and shows the zoom controller", () => {
    const markup = html(opened());
    expect(markup).toMatch(/<span class="doan-canvas-name" title="\.doan\/canvases\/checkout\.html">.*<span>checkout<\/span><\/span><span class="ov-sep" aria-hidden="true">\/<\/span>/);
    const drawer = button(markup, "Frame 3: Payment");
    expect(drawer).toContain('aria-haspopup="listbox"');
    expect(drawer).toContain('title="3. Payment"');
    expect(drawer).not.toContain("disabled");
    expect(markup).toContain("<span>3. Payment</span>");
    const value = button(markup, "Zoom 64%, zoom options");
    expect(value).not.toContain("disabled");
    expect(markup).toMatch(/aria-label="Zoom 64%, zoom options"[^>]*>64%/);
    expect(button(markup, "Zoom out")).not.toContain("disabled");
    expect(button(markup, "Zoom in")).not.toContain("disabled");
  });

  it("puts the zoom controller in the order −, value, +", () => {
    const markup = html(opened());
    const order = ["Zoom out", "Zoom 64%, zoom options", "Zoom in"].map(label => markup.indexOf(`aria-label="${label}"`));
    expect(order.every(index => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(markup.indexOf('aria-label="Frame 3: Payment"')).toBeLessThan(order[0]!);
  });

  it("shows the file stem, not the page title", () => {
    expect(html(opened({ open: { folder: "/repo", canvas: row.path, row: { ...row } } }))).toContain("<span>checkout</span>");
  });

  it("disables only the drawer on a laid-out canvas with no frames", () => {
    const markup = html(opened({ layout: layout({ frames: [] }), currentFrame: null }));
    expect(button(markup, "No frames")).toContain("disabled");
    expect(markup).toContain("<span>No frames</span>");
    expect(button(markup, "Zoom 64%, zoom options")).not.toContain("disabled");
    expect(button(markup, "Zoom in")).not.toContain("disabled");
  });

  it.each([
    ["loading", { status: "loading", layout: null, currentFrame: null }],
    ["failed", { status: "failed", layout: null, currentFrame: null }],
    ["no width", { status: "noWidth", layout: null, currentFrame: null }],
  ] as const)("keeps the canvas name and disables the drawer and zoom while %s", (_name, over) => {
    const markup = html(opened(over));
    expect(markup).toContain("<span>checkout</span>");
    expect(button(markup, "Frames")).toContain("disabled");
    expect(button(markup, "Zoom options")).toContain("disabled");
    expect(markup).toMatch(/aria-label="Zoom options"[^>]*>—/);
    expect(button(markup, "Zoom out")).toContain("disabled");
    expect(button(markup, "Zoom in")).toContain("disabled");
  });

  it("drops the canvas name and separator on an unlisted page", () => {
    const markup = html(opened({ unlisted: true, shown: null }));
    expect(markup).not.toContain("doan-canvas-name");
    expect(markup).not.toContain("ov-sep");
    expect(button(markup, "Frames")).toContain("disabled");
    expect(button(markup, "Zoom options")).toContain("disabled");
  });

  it("drops the canvas name when the canvas left the list or the project has a problem", () => {
    const markup = html({ ...initialCanvasState(), status: "missing", message: "gone" });
    expect(markup).not.toContain("doan-canvas-name");
    expect(markup).not.toContain("ov-sep");
    expect(button(markup, "Frames")).toContain("disabled");
  });

  it("keeps the drawer open for a reload that still shows the previous layout", () => {
    const markup = html(opened({ reloading: true }));
    expect(button(markup, "Frame 3: Payment")).not.toContain("disabled");
  });

  // design §2 '오른쪽 패널': the open button exists only while the conversation panel is folded, last in the header.
  it("shows the conversation panel's open button only while the panel is folded, after a divider", () => {
    expect(html(opened(), { open: true, show: vi.fn() })).not.toContain("Show conversation");
    const markup = html(opened(), { open: false, show: vi.fn() });
    const open = button(markup, "Show conversation");
    expect(open).toContain('aria-expanded="false"');
    expect(open).toContain(`aria-controls="${CONVERSATION_PANEL_ID}"`);
    expect(open).not.toContain("disabled");
    expect(markup).toMatch(/<span class="doan-canvas-head-sep" aria-hidden="true"><\/span>(<[^>]*>)*<button[^>]*aria-label="Show conversation"/);
    expect(markup.indexOf('aria-label="Zoom in"')).toBeLessThan(markup.indexOf('aria-label="Show conversation"'));
    // A canvas that cannot render still offers the panel back.
    expect(button(html({ ...initialCanvasState(), status: "missing", message: "gone" }, { open: false, show: vi.fn() }), "Show conversation")).not.toContain("disabled");
  });

  // The Reload button sits right of the zoom controller and, while the panel is folded, left of its divider and open button.
  it("puts Reload after the zoom controller and before the conversation panel's open button", () => {
    const markup = html(opened(), { open: false, show: vi.fn() });
    const reload = button(markup, "Reload canvas");
    expect(reload).toMatch(/^<button/);
    expect(reload).not.toContain("disabled");
    const order = ["Zoom in", "Reload canvas", "Show conversation"].map(label => markup.indexOf(`aria-label="${label}"`));
    expect(order.every(index => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(markup.indexOf('aria-label="Reload canvas"')).toBeLessThan(markup.indexOf("doan-canvas-head-sep"));
    expect(button(html(opened(), { open: true, show: vi.fn() }), "Reload canvas")).toMatch(/^<button(?![^>]*disabled)/);
  });

  // Reload works whenever a canvas is open, like ⌘R: also while it loads, failed or has no width.
  it.each([
    ["loading", { status: "loading", layout: null, currentFrame: null }],
    ["failed", { status: "failed", layout: null, currentFrame: null }],
    ["no width", { status: "noWidth", layout: null, currentFrame: null }],
    ["reloading", { reloading: true }],
  ] as const)("keeps Reload enabled while %s", (_name, over) => {
    expect(button(html(opened(over)), "Reload canvas")).toMatch(/^<button(?![^>]*disabled)/);
  });

  it("disables Reload when no canvas is open", () => {
    expect(button(html({ ...initialCanvasState(), status: "missing", message: "gone" }), "Reload canvas")).toMatch(/^<button[^>]*disabled/);
  });

  // buzz-canvas-conversation design §2 'News dot': the folded panel's open button carries the dot and says why.
  it("puts the news dot and its longer name on the folded panel's open button", () => {
    const waiting = button(html(opened(), { open: false, show: vi.fn(), badge: { kind: "permission", label: "Show conversation, needs your answer" } }), "Show conversation, needs your answer");
    expect(waiting).toContain('data-badge="true"');
    const unseen = button(html(opened(), { open: false, show: vi.fn(), badge: { kind: "unseen", label: "Show conversation, new activity" } }), "Show conversation, new activity");
    expect(unseen).toContain('data-badge="true"');
    expect(button(html(opened(), { open: false, show: vi.fn(), badge: null }), "Show conversation")).not.toContain("data-badge");
  });
});
