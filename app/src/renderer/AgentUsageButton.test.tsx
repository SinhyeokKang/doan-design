import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Popover } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import type { UsageEntry, UsageWindow } from "../main/agentAuth/usageTypes";
import { UsagePanel, UsageView, type UsageViewProps } from "./AgentUsageButton";
import { ringViews, rowView } from "./agentUsageView";
import { TooltipContent, TooltipProvider } from "./components/ui/tooltip";

// The confirmed draft .doan/canvases/provider-usage.html (frames place-header,
// ring-states, popover, popover-live): the button and the popover body as drawn, without state.
const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const MIN = 60_000;
const win = (over: Partial<UsageWindow> = {}): UsageWindow => ({ id: "five_hour", label: "5-hour", usedPercent: 42, resetsAt: NOW + 130 * MIN, ...over });
const ok = (provider: UsageEntry["provider"], windows: UsageWindow[], over: Partial<UsageEntry> = {}): UsageEntry =>
  ({ provider, reading: { status: "ok", windows, readAt: NOW - 3 * MIN }, inFlight: false, ...over });
const four: UsageEntry[] = [
  ok("claude", [win()]),
  ok("codex", [win({ id: "primary", label: "30-day", usedPercent: 100, limited: true })]),
  { provider: "cursor", reading: { status: "unavailable", reason: "read_failed", readAt: NOW }, inFlight: false },
  { provider: "copilot", inFlight: true },
];

function props(entries: readonly UsageEntry[], over: Partial<UsageViewProps> = {}): UsageViewProps {
  return {
    rings: ringViews(entries, NOW), folded: false, description: "Claude Code 42% used.", descriptionId: "ud", titleId: "ut", open: false,
    rows: entries.map(entry => rowView(entry, NOW)), busy: false, buttonRef: vi.fn(), listRef: vi.fn(),
    onOpenChange: vi.fn(), onRefresh: vi.fn(), onSettings: vi.fn(), onOpenAutoFocus: vi.fn(), onCloseAutoFocus: vi.fn(), onPointerDownOutside: vi.fn(), onButtonFocus: vi.fn(), ...over,
  };
}
const html = (node: ReactElement) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
const button = (markup: string) => markup.match(/<button[^>]*class="usage"[^>]*>/)?.[0] ?? "";
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}

describe("UsageView button", () => {
  it("keeps the fixed name, opens a dialog and carries the values as its description", () => {
    const markup = html(<UsageView {...props(four)} />);
    const tag = button(markup);
    expect(tag).toContain('type="button"');
    expect(tag).toContain('aria-label="Agent usage"');
    expect(tag).toContain('aria-haspopup="dialog"');
    expect(tag).toContain('aria-expanded="false"');
    expect(tag).toContain('aria-describedby="ud"');
    expect(markup).toContain('<span class="sr-only" id="ud">Claude Code 42% used.</span>');
  });

  it("draws one ring per provider in the fixed order, the logo inside each, and danger at a reported limit", () => {
    const markup = html(<UsageView {...props(four)} />);
    expect([...markup.matchAll(/class="usage-ring" data-provider="(\w+)"/g)].map(match => match[1])).toEqual(["claude", "codex", "cursor", "copilot"]);
    expect(markup).toMatch(/data-provider="claude"><svg[^>]*><circle class="track" cx="12" cy="12" r="11"><\/circle><circle class="value" cx="12" cy="12" r="11" pathLength="100" stroke-dasharray="42 100"><\/circle><\/svg><img class="usage-logo" src="provider-logos\/claude.png" alt=""\/>/);
    expect(markup).toMatch(/data-provider="codex" data-band="full">/);
    // Reading, unavailable: the empty track only.
    expect(markup).toMatch(/data-provider="cursor"><svg[^>]*><circle class="track"[^>]*><\/circle><\/svg><img/);
  });

  it("draws a single provider's ring with its logo, Antigravity not counted", () => {
    const markup = html(<UsageView {...props([ok("claude", [win()]), { provider: "antigravity", inFlight: false }])} />);
    expect(markup.match(/class="usage-ring"/g)).toHaveLength(1);
    expect(markup).toContain('<img class="usage-logo" src="provider-logos/claude.png" alt=""/>');
    expect(markup).not.toContain("antigravity");
  });

  it("folds to the highest ring and +n, keeping the name and description", () => {
    const markup = html(<UsageView {...props(four, { folded: true })} />);
    expect([...markup.matchAll(/class="usage-ring" data-provider="(\w+)"/g)].map(match => match[1])).toEqual(["codex"]);
    expect(markup).toContain('<span class="usage-more" aria-hidden="true">+3</span>');
    expect(button(markup)).toContain('aria-label="Agent usage"');
    expect(markup).toContain('id="ud">Claude Code 42% used.</span>');
  });

  it("is a Radix popover trigger whose content focuses its body and hands closing focus to its owner", () => {
    const view = props(four, { open: true });
    const tree = all(UsageView(view));
    const root = tree.find(element => element.type === Popover.Root)!;
    expect(root.props.open).toBe(true);
    expect(root.props.onOpenChange).toBe(view.onOpenChange);
    expect(tree.some(element => element.type === Popover.Trigger && element.props.asChild)).toBe(true);
    const content = tree.find(element => element.type === Popover.Content)!;
    expect(content.props).toMatchObject({ align: "end", side: "bottom", sideOffset: 4, collisionPadding: 8, "aria-labelledby": "ut", onOpenAutoFocus: view.onOpenAutoFocus, onCloseAutoFocus: view.onCloseAutoFocus });
    expect(content.props.className).toBe("doan-floating doan-popover doan-scroll usage-pop");
    expect(content.props.onPointerDownOutside).toBe(view.onPointerDownOutside);
    expect(tree.find(element => element.type === "button" && element.props.className === "usage")!.props.onFocus).toBe(view.onButtonFocus);
  });
});

describe("UsagePanel", () => {
  it("titles the popover and puts the list before Agent settings and Refresh usage", () => {
    const markup = html(<UsagePanel {...props(four)} />);
    expect(markup).toMatch(/<h2 class="usage-pop-title" id="ut">Agent usage<\/h2><ul class="usage-list" tabindex="-1">/);
    const list = markup.indexOf("</ul>"), settings = markup.indexOf('aria-label="Agent settings"'), refresh = markup.indexOf('aria-label="Refresh usage"');
    expect(list).toBeGreaterThan(0);
    expect(settings).toBeGreaterThan(list);
    expect(refresh).toBeGreaterThan(settings);
    expect(markup).toMatch(/<button type="button" class="doan-icon-button usage-settings" aria-label="Agent settings"/);
  });

  it("draws rows with read time, window lines and bars, and reason lines", () => {
    const markup = html(<UsagePanel {...props(four)} />);
    expect(markup).toContain('<li class="usage-row" data-provider="claude"><div class="usage-row-head"><img class="logo" src="provider-logos/claude.png" alt=""/><span class="usage-name">Claude Code</span><span class="usage-read">Updated 3m ago</span></div>');
    expect(markup).toContain('<div class="usage-window"><div class="usage-window-line"><span class="usage-window-label">5-hour</span><span class="usage-window-text">42% used · resets in 2h 10m</span></div><span class="usage-bar" aria-hidden="true"><i style="width:42%"></i></span></div>');
    expect(markup).toContain('<div class="usage-window" data-limited=""><div class="usage-window-line"><span class="usage-window-label">30-day</span><span class="usage-window-text">Limit reached · resets in 2h 10m</span></div><span class="usage-bar" data-band="full" aria-hidden="true"><i style="width:100%"></i></span></div>');
    expect(markup).toMatch(/<p class="usage-note" data-kind="error"><svg[^>]*class="[^"]*\bdoan-alert-icon\b[^"]*"[^>]*>.*?<\/svg><span>Couldn’t read usage\. Doan tries again when you open this\.<\/span><\/p>/);
    expect(markup).toContain('<div class="usage-row-head"><img class="logo" src="provider-logos/copilot.svg" alt=""/><span class="usage-name">GitHub Copilot</span></div><div class="usage-row-body"><p class="usage-note"><span>Reading usage…</span></p>');
  });

  it("draws a reset window's empty bar and a can't-be-used warning", () => {
    const markup = html(<UsagePanel {...props([ok("copilot", [win({ label: "Chat", resetsAt: NOW - MIN })], { inFlight: true }), { provider: "codex", inFlight: false, blocked: { readiness: { ready: false, cause: "version_unsupported", action: "update" }, phase: "connected" } }])} />);
    expect(markup).toContain('<span class="usage-read">Updating…</span>');
    expect(markup).toContain('<span class="usage-window-text">Reset · updating</span></div><span class="usage-bar" aria-hidden="true"></span>');
    expect(markup).toMatch(/<p class="usage-note" data-kind="warn"><svg[^>]*class="[^"]*\bdoan-alert-icon\b[^"]*"[^>]*>.*?<\/svg><span>This version is older than Doan supports\.<\/span><\/p>/);
  });

  it("shows a spinner and aria-busy on Refresh usage while reading, and stays enabled", () => {
    const busy = html(<UsagePanel {...props(four, { busy: true })} />);
    const refresh = busy.match(/<button[^>]*aria-label="Refresh usage"[^>]*>(.*?)<\/button>/)!;
    expect(refresh[0]).toContain('aria-busy="true"');
    expect(refresh[0]).not.toContain("disabled");
    expect(refresh[1]).toBe('<span class="doan-spinner" aria-hidden="true"></span>');
    const rest = html(<UsagePanel {...props(four)} />).match(/<button[^>]*aria-label="Refresh usage"[^>]*>(.*?)<\/button>/)!;
    expect(rest[0]).not.toContain("aria-busy");
    expect(rest[1]).toMatch(/^<svg/);
  });

  // E1 measurement: the shared tooltip opens above by default, which put Agent settings' and Refresh usage's over the
  // header button the popover hangs from; the confirmed draft draws every Agent usage tooltip below its button.
  it("opens every tooltip below its button", () => {
    const tips = [...all(UsageView(props(four))), ...all(UsagePanel(props(four)))].filter(element => typeof element.type === "function" && element.type.name === "IconTip");
    expect(tips.map(tip => tip.props.label)).toEqual(["Agent usage", "Agent settings", "Refresh usage"]);
    for (const tip of tips) {
      const content = all((tip.type as (props: unknown) => ReactNode)(tip.props)).find(element => element.type === TooltipContent)!;
      expect(content.props.side).toBe("bottom");
    }
  });

  // E1 real app: Tab to Agent settings or Refresh usage shows its tooltip, the top dismissable layer, so the first
  // Escape closed only the tooltip and a second one the popover (as conversation-delete's Delete tooltip did).
  it("closes the popover with the Escape a title-row tooltip takes", () => {
    const view = props(four, { open: true });
    const tips = all(UsagePanel(view)).filter(element => typeof element.type === "function" && element.type.name === "IconTip");
    for (const tip of tips) {
      const content = all((tip.type as (props: unknown) => ReactNode)(tip.props)).find(element => element.type === TooltipContent)!;
      (content.props.onEscapeKeyDown as () => void)();
    }
    expect(view.onOpenChange).toHaveBeenCalledTimes(2);
    expect(vi.mocked(view.onOpenChange).mock.calls).toEqual([[false], [false]]);
  });

  it("calls its owner for Agent settings and Refresh usage", () => {
    const view = props(four);
    const buttons = all(UsagePanel(view)).filter(element => element.type === "button");
    (buttons.find(element => element.props["aria-label"] === "Agent settings")!.props.onClick as () => void)();
    (buttons.find(element => element.props["aria-label"] === "Refresh usage")!.props.onClick as () => void)();
    expect(view.onSettings).toHaveBeenCalledOnce();
    expect(view.onRefresh).toHaveBeenCalledOnce();
  });

  // The header drags the window; the open popover lifts that inline (AgentUsageButton), since Electron ignored an
  // app-region change made through a :has() rule (real app, 2026-11-06).
  it("keeps the header a drag region in CSS, with no :has() rule for the open popover", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.top \{[^}]*-webkit-app-region: drag;[^}]*\}/);
    expect(css).not.toContain(".top:has(");
  });

  // E1 measurement: the app body's tabular figures widened every "1" in the relative times ("Updated 1m ago" by 2.6px,
  // "12d 4h") against the confirmed draft; the popover is portalled to <body>, so it sets its own.
  it("draws plain numerals in the popover", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.usage-pop \{[^}]*font-variant-numeric: normal;[^}]*\}/);
  });
});
