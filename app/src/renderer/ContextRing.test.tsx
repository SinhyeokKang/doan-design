import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Popover } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import type { UsageEntry, UsageWindow } from "../main/agentAuth/usageTypes";
import { Tooltip, TooltipContent, TooltipProvider } from "./components/ui/tooltip";
import { contextDrawerView } from "./contextDrawer";
import { ContextDrawerPanel, ContextRingView, type ContextRingViewProps } from "./ContextRing";

const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);
const MIN = 60_000, HOUR = 60 * MIN;
const CONTEXT = { value: 42, percent: 42, used: 84_000, size: 200_000 };
const win = (over: Partial<UsageWindow> = {}): UsageWindow => ({ id: "five_hour", label: "5h", usedPercent: 38, resetsAt: NOW + 2 * HOUR + 10 * MIN, ...over });
const claude: UsageEntry = { provider: "claude", reading: { status: "ok", windows: [win(), win({ id: "seven_day", label: "Weekly", usedPercent: 61, resetsAt: NOW + 76 * HOUR })], readAt: NOW - 2 * MIN }, inFlight: false };

function props(over: Partial<ContextRingViewProps> = {}, entries: UsageEntry[] = [claude], hidden = false): ContextRingViewProps {
  const context = over.context ?? CONTEXT, provider = over.provider === undefined ? "claude" : over.provider;
  return {
    context, provider, view: contextDrawerView({ context, provider, usageHidden: hidden, entries, now: NOW }),
    open: false, tip: false, titleId: "ct",
    buttonRef: vi.fn(), bodyRef: vi.fn(), contentRef: vi.fn(),
    onOpenChange: vi.fn(), onTipChange: vi.fn(), onButtonFocus: vi.fn(), onRefresh: vi.fn(), onRefreshFocus: vi.fn(),
    onOpenAutoFocus: vi.fn(), onCloseAutoFocus: vi.fn(), onEscapeKeyDown: vi.fn(), onPointerDownOutside: vi.fn(), onFocusOutside: vi.fn(),
    ...over,
  };
}
// React hoists a preload link for each image ahead of the markup.
const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>).replace(/^(<link rel="preload"[^>]*\/>)+/, "");
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
const tree = (view: ContextRingViewProps) => all(ContextRingView(view));
const text = (node: ReactNode): string => all(node).map(element => typeof element.props.children === "string" ? element.props.children : "").join("|");

describe("ContextRingView button", () => {
  it("is a button keeping the ring's name and description, opening a dialog, with the ring as its decoration", () => {
    const markup = html(<ContextRingView {...props()} />);
    expect(markup).toMatch(/^<button type="button" class="context-ring" aria-label="Context window 42% used · last turn" aria-description="84K of 200K tokens" aria-haspopup="dialog" aria-expanded="false"/);
    expect(markup).not.toContain('role="img"');
    expect(markup).not.toContain("tabindex");
    // The dial is the shipped 16px ring geometry, hidden from assistive tech; no text or mark is added.
    expect(markup).toMatch(/<span class="context-ring-dial" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke-width="3" aria-hidden="true"><circle class="track" cx="12" cy="12" r="10.5"><\/circle><circle class="value" cx="12" cy="12" r="10.5" pathLength="100" stroke-dasharray="42 100"><\/circle><\/svg><\/span><\/button>$/);
    expect(markup.replace(/<[^>]*>/g, "")).toBe("");
  });

  it("says it is open, and carries the danger band from 70% on the button", () => {
    expect(html(<ContextRingView {...props({ open: true })} />)).toContain('aria-expanded="true"');
    expect(html(<ContextRingView {...props({ context: { value: 70, percent: 70, used: 140_000, size: 200_000 } })} />)).toMatch(/^<button[^>]*class="context-ring"[^>]*data-band="full"/);
    expect(html(<ContextRingView {...props({ context: { value: 69.9, percent: 69.9, used: 699_000, size: 1_000_000 } })} />)).not.toContain("data-band");
  });

  it("keeps the two-line tooltip above the ring, opened only by the state it is given", () => {
    const view = props({ tip: true });
    const elements = tree(view);
    const tooltip = elements.find(element => element.type === Tooltip)!;
    expect(tooltip.props.open).toBe(true);
    expect(tooltip.props.onOpenChange).toBe(view.onTipChange);
    const content = elements.find(element => element.type === TooltipContent)!;
    expect(content.props.side ?? "top").toBe("top");
    expect(text(content.props.children as ReactNode).split("|").filter(Boolean)).toEqual(["Context window 42% used · last turn", "84K of 200K tokens"]);
    expect(tree(props()).find(element => element.type === Tooltip)!.props.open).toBe(false);
  });

  it("opens the drawer above the ring, end-aligned 4px away, as the header's Agent usage popover", () => {
    const view = props({ open: true });
    const elements = tree(view);
    expect(elements.find(element => element.type === Popover.Root)!.props).toMatchObject({ open: true, onOpenChange: view.onOpenChange });
    const content = elements.find(element => element.type === Popover.Content)!.props;
    expect(content).toMatchObject({ side: "top", align: "end", sideOffset: 4, collisionPadding: 8, "aria-labelledby": "ct" });
    expect(String(content.className).split(" ")).toEqual(expect.arrayContaining(["doan-floating", "doan-popover", "doan-scroll", "context-drawer"]));
    expect(content.onOpenAutoFocus).toBe(view.onOpenAutoFocus);
    expect(content.onCloseAutoFocus).toBe(view.onCloseAutoFocus);
    expect(content.onEscapeKeyDown).toBe(view.onEscapeKeyDown);
    expect(content.onPointerDownOutside).toBe(view.onPointerDownOutside);
    expect(content.onFocusOutside).toBe(view.onFocusOutside);
  });
});

describe("ContextDrawerPanel", () => {
  it("lifts the provider's header row whole: head on top, then the Context window line and the windows", () => {
    const markup = html(<ContextDrawerPanel {...props()} />);
    expect(markup).toMatch(/^<div class="usage-row-head context-drawer-head"><img class="logo" src="provider-logos\/claude.png" alt=""\/><span class="usage-name" id="ct">Claude Code<\/span><span class="usage-read">Updated 2m ago<\/span><\/div><div class="usage-row-body context-drawer-body" tabindex="-1">/);
    // Refresh comes after the body so Tab goes body → Refresh; the grid draws it at the head's end.
    expect(markup).toMatch(/<\/div><\/div><button type="button" class="doan-icon-button context-drawer-refresh" aria-label="Refresh usage"[^>]*>[^]*<\/button>$/);
    const body = markup.slice(markup.indexOf('<div class="usage-row-body context-drawer-body" tabindex="-1">'), markup.indexOf('<button type="button" class="doan-icon-button context-drawer-refresh"'));
    expect(body).toMatch(/^<div class="usage-row-body context-drawer-body" tabindex="-1"><div class="usage-window"><div class="usage-window-line"><span class="usage-window-label">Context window<\/span><span class="usage-window-text">42% used · 84K of 200K<\/span><\/div><span class="usage-bar" aria-hidden="true"><i style="width:42%"><\/i><\/span><\/div>/);
    // The windows are the header row's markup, unchanged.
    expect(body).toContain('<div class="usage-window"><div class="usage-window-line"><span class="usage-window-label">5h</span><span class="usage-window-text">38% used · resets in 2h 10m</span></div><span class="usage-bar" aria-hidden="true"><i style="width:38%"></i></span></div>');
    expect(body).toContain('<span class="usage-window-label">Weekly</span><span class="usage-window-text">61% used · resets in 3d 4h</span>');
    expect(body.indexOf("Context window")).toBeLessThan(body.indexOf(">5h<"));
  });

  it("draws the Context window bar in the ring's band", () => {
    expect(html(<ContextDrawerPanel {...props({ context: { value: 78, percent: 78, used: 156_000, size: 200_000 } })} />))
      .toContain('<span class="usage-window-label">Context window</span><span class="usage-window-text">78% used · 156K of 200K</span></div><span class="usage-bar" data-band="full" aria-hidden="true"><i style="width:78%"></i></span>');
  });

  it("shows a reason line in place of windows, and a busy Refresh while any read runs", () => {
    const markup = html(<ContextDrawerPanel {...props({}, [{ provider: "claude", inFlight: true }])} />);
    expect(markup).toContain('<p class="usage-note"><span>Reading usage</span></p>');
    expect(markup).not.toContain("usage-read");
    expect(markup).toMatch(/<button type="button" class="doan-icon-button context-drawer-refresh" aria-label="Refresh usage" aria-busy="true"[^>]*><span class="doan-spinner" aria-hidden="true"><\/span><\/button>/);
  });

  it("keeps only the logo and name in the head, and the Context window line in the body, without usage", () => {
    for (const markup of [html(<ContextDrawerPanel {...props({}, [claude], true)} />), html(<ContextDrawerPanel {...props({}, [])} />)]) {
      expect(markup).toMatch(/^<div class="usage-row-head context-drawer-head"><img class="logo" src="provider-logos\/claude.png" alt=""\/><span class="usage-name" id="ct">Claude Code<\/span><\/div><div class="usage-row-body context-drawer-body" tabindex="-1"><div class="usage-window">[^]*Context window[^]*<\/div><\/div>$/);
      expect(markup).not.toContain("Refresh usage");
      expect(markup).not.toContain("5h");
    }
    expect(html(<ContextDrawerPanel {...props({ provider: "antigravity" })} />)).toContain('<span class="usage-name" id="ct">Antigravity</span></div>');
  });

  it("reports Refresh focus so a vanished Refresh can hand focus to the body", () => {
    const view = props();
    const refresh = all(ContextDrawerPanel(view)).find(element => element.props["aria-label"] === "Refresh usage")!;
    (refresh.props.onFocus as () => void)();
    (refresh.props.onBlur as () => void)();
    (refresh.props.onClick as () => void)();
    expect(view.onRefreshFocus).toHaveBeenNthCalledWith(1, true);
    expect(view.onRefreshFocus).toHaveBeenNthCalledWith(2, false);
    expect(view.onRefresh).toHaveBeenCalledOnce();
  });
});

// The visible box stays the 16px ring with its 2px start margin; an invisible ::before 4px out on every side is the hit
// box and carries hover, pressed and focus, so no layout box moves.
describe("context ring CSS", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  it("keeps the visible box and clears the button's own box", () => {
    expect(css).toContain(".docked .composer-tray .context-ring { margin-inline-start: var(--space-half); }");
    expect(css).toMatch(/\.context-ring \{ position: relative; display: block; flex: none; width: var\(--size-icon\); height: var\(--size-icon\); padding: 0; border: 0; background: transparent; color: inherit; cursor: default; \}/);
    expect(css).toContain(".context-ring-dial { position: relative; display: block; width: 100%; height: 100%; }");
    expect(css).toContain(".context-ring-dial > svg { display: block; width: 100%; height: 100%; transform: rotate(-90deg); }");
    expect(css).toContain(".context-ring .track { stroke: var(--border-track); }");
    expect(css).toContain('.context-ring[data-band="full"] .value { stroke: var(--border-danger); }');
  });

  it("draws the hit box, hover, pressed and focus on ::before", () => {
    expect(css).toContain('.context-ring::before { content: ""; position: absolute; inset: calc(-1 * var(--space-1)); border-radius: var(--radius-control); }');
    expect(css).toContain("@media (hover: hover) and (pointer: fine) { .context-ring:hover::before { background: var(--affordance-backdrop-hover); } }");
    expect(css).toContain('.context-ring:is(:active, [aria-expanded="true"])::before { background: var(--affordance-backdrop-pressed); }');
    expect(css).toContain(".context-ring:focus-visible { outline: none; }");
    expect(css).toContain(".context-ring:focus-visible::before { outline: 2px solid var(--border-focus); outline-offset: 0; }");
  });

  it("lays the drawer out as one lifted row", () => {
    expect(css).toContain(".context-drawer { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); max-height: var(--radix-popover-content-available-height); overflow-y: auto; text-align: left; font-variant-numeric: normal; }");
    expect(css).toContain(".context-drawer-head { grid-column: 1; grid-row: 1; }");
    expect(css).toContain(".context-drawer-body { grid-column: 1 / -1; grid-row: 2; outline: none; }");
    expect(css).toContain(".context-drawer-refresh { grid-column: 2; grid-row: 1; margin-block: calc(-1 * var(--space-1h)); margin-inline-end: calc(-1 * var(--space-1h)); }");
  });
});
