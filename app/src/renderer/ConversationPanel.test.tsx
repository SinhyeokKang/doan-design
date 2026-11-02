import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CONVERSATION_PANEL_ID, ConversationPanel, dragPanel, ResizeHandle } from "./ConversationPanel";
import { TooltipProvider } from "./components/ui/tooltip";

// buzz-canvas design §0 'default', 'panel-collapsed', 'panel-resize', §2 '오른쪽 패널', §5 copy.
const bounds = { min: 347, max: 619 };
const props = (over: Partial<Parameters<typeof ConversationPanel>[0]> = {}) => ({ open: true, width: 400, bounds, onHide: vi.fn(), onResize: vi.fn(), preview: vi.fn(), ...over });
const markup = (over: Partial<Parameters<typeof ConversationPanel>[0]> = {}) => renderToStaticMarkup(<TooltipProvider><ConversationPanel {...props(over)} /></TooltipProvider>);
const tag = (html: string, pattern: string) => html.match(new RegExp(`<[a-z0-9]+[^>]*${pattern}[^>]*>`))?.[0] ?? "";

describe("ConversationPanel", () => {
  it("is the Overview right panel's title row, titled Conversation, with the close button and a one-line body", () => {
    const html = markup();
    const aside = tag(html, `id="${CONVERSATION_PANEL_ID}"`);
    expect(aside).toMatch(/^<aside/);
    expect(aside).toContain('class="right ov-right');
    expect(aside).toContain('role="region"');
    expect(aside).toContain('aria-label="Conversation"');
    expect(html).toMatch(/<h2 class="phead rp-head" tabindex="-1">Conversation<\/h2>/);
    const close = tag(html, 'aria-label="Hide conversation"');
    expect(close).toMatch(/^<button/);
    expect(close).toContain('aria-expanded="true"');
    expect(close).toContain(`aria-controls="${CONVERSATION_PANEL_ID}"`);
    expect(html).toContain("Conversations about this canvas will show here.");
    expect(html).not.toMatch(/Inspector|Comments|Canvas info/);
  });

  it("puts the resize handle before the panel, as a focusable vertical separator in panel px", () => {
    const html = markup();
    const handle = tag(html, 'role="separator"');
    expect(handle).toContain('aria-orientation="vertical"');
    expect(handle).toContain('aria-label="Resize conversation panel"');
    expect(handle).toContain('aria-valuenow="400"');
    expect(handle).toContain('aria-valuemin="347"');
    expect(handle).toContain('aria-valuemax="619"');
    expect(handle).toContain('tabindex="0"');
    expect(html.indexOf('role="separator"')).toBeLessThan(html.indexOf(`id="${CONVERSATION_PANEL_ID}"`));
  });

  it("leaves the Tab order while folded, keeping the panel the open button controls", () => {
    const html = markup({ open: false });
    const column = html.match(/^<div[^>]*>/)?.[0] ?? "";
    expect(column).toContain("inert");
    expect(column).toContain("data-collapsed");
    expect(html).toContain(`id="${CONVERSATION_PANEL_ID}"`);
    expect(tag(html, 'aria-label="Hide conversation"')).toContain('aria-expanded="false"');
    expect(markup().match(/^<div[^>]*>/)?.[0]).not.toMatch(/inert|data-collapsed/);
  });

  it("closes with the close button", () => {
    const onHide = vi.fn();
    const close = buttons(<ConversationPanel {...props({ onHide })} />).find(button => button.props["aria-label"] === "Hide conversation");
    (close?.props.onClick as () => void)();
    expect(onHide).toHaveBeenCalledOnce();
  });
});

describe("dragPanel", () => {
  it("widens as the edge moves left and narrows as it moves right", () => {
    expect(dragPanel(400, 900, 860, bounds)).toBe(440);
    expect(dragPanel(400, 900, 950, bounds)).toBe(350);
    expect(dragPanel(400, 900, 900, bounds)).toBe(400);
  });

  it("stops at the minimum instead of folding, and at the maximum", () => {
    expect(dragPanel(400, 900, 1200, bounds)).toBe(347);
    expect(dragPanel(400, 900, 0, bounds)).toBe(619);
  });

  // The sidebar's handle is on its end edge: moving it right widens.
  it("on an end edge, widens as the edge moves right", () => {
    const side = { min: 180, max: 360 };
    expect(dragPanel(220, 228, 268, side, "end")).toBe(260);
    expect(dragPanel(220, 228, 188, side, "end")).toBe(180);
    expect(dragPanel(220, 228, 900, side, "end")).toBe(360);
  });
});

// The sidebar reuses the panel's handle with its own label, on its end edge.
describe("ResizeHandle", () => {
  it("names what it resizes and reports the shown width and bounds", () => {
    const html = renderToStaticMarkup(<ResizeHandle edge="end" className="doan-sidebar-handle" label="Resize sidebar" width={220} bounds={{ min: 180, max: 360 }} onResize={vi.fn()} preview={vi.fn()} />);
    expect(html).toBe('<div class="doan-panel-handle doan-sidebar-handle" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" aria-valuenow="220" aria-valuemin="180" aria-valuemax="360" tabindex="0"></div>');
  });

  it("keeps the panel's label and class by default", () => {
    expect(markup()).toContain('<div class="doan-panel-handle" role="separator" aria-orientation="vertical" aria-label="Resize conversation panel"');
  });
});

// Walks the element tree through children and function components without hooks, so no Radix hook runs.
function buttons(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  if (typeof node.type === "function" && node.type === ConversationPanel) return buttons((node.type as (p: unknown) => ReactNode)(node.props));
  const own = node.type === "button" ? [node] : [];
  return [...own, ...buttons(node.props.children as ReactNode)];
}
