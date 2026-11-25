import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CanvasSignal } from "./rightPanelOpen";
import { describe, expect, it, vi } from "vitest";
import type { CanvasRow } from "../main/view";
import type { LayoutMessage } from "./canvasMessage";
import { CanvasHeader, type CanvasHeaderNavigation } from "./CanvasHeader";
import { CanvasViewStore, canvasViewFields, initialCanvasState, type CanvasState, type CanvasViewFields } from "./CanvasController";
import { TooltipProvider } from "./components/ui/tooltip";
import { CONVERSATION_PANEL_ID } from "./ConversationPanel";
import { INSPECTOR_PANEL_ID } from "./InspectorPanel";

// PRODUCT §5 item 2 'Canvas header', 'Zoom controller' and item 3 'Frame drawer'.
const row: CanvasRow = { path: ".doan/canvases/checkout.html", url: "doan://checkout", width: 1280 };
const frames = ["Cart", "Shipping", "Payment"].map((title, index) => ({ id: title.toLowerCase(), title, x: 0, y: index * 900, width: 1280, height: 800 }));
const layout = (over: Partial<LayoutMessage> = {}): LayoutMessage => ({ type: "layout", href: row.url, height: 2700, viewport: 2700, frames, truncated: false, gotos: [], ...over });
const opened = (over: Partial<CanvasState> = {}): CanvasState => ({ ...initialCanvasState(), open: { folder: "/repo", canvas: row.path, row }, shown: row.path, status: null, message: "", hasFrame: true, layout: layout(), currentFrame: 2, zoom: 64, scale: 0.64, ...over });

type Inspector = { open: boolean; fits: boolean; show(): void };
const navigation: CanvasHeaderNavigation = { card: { key: "c", name: "Demo", rows: [{ kind: "list", path: "/repo", servedRev: 0, canvases: [row], git: { branch: "main", common: "c", worktrees: [] } }] },
  root: "/repo", homeDirectory: null, worktree: vi.fn() };
const html = (state: CanvasState, panel?: { open: boolean; show(): void; badge?: Pick<CanvasSignal, "kind" | "label"> | null }, view: CanvasViewFields = canvasViewFields(state), inspector?: Inspector) => renderToStaticMarkup(<TooltipProvider>{<CanvasHeader navigation={navigation} state={state} view={new CanvasViewStore(view)} command={vi.fn()} zoomTo={vi.fn()} selectFrame={vi.fn()} {...(panel ? { panel } : {})} {...(inspector ? { inspector } : {})} /> as ReactElement}</TooltipProvider>);
const button = (markup: string, label: string) => markup.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";

describe("CanvasHeader", () => {
  // App skips its render for view-only publishes, so its state can lag the view store; a frame inserted before the current
  // one moves its index and the layout in one publish, and the header names the same frame.
  it("names the current frame from one layout and index when both changed together", () => {
    const inserted = [{ id: "intro", title: "Intro", x: 0, y: 0, width: 1280, height: 800 }, ...frames.map(frame => ({ ...frame, y: frame.y + 900 }))];
    const state = opened({ layout: layout({ frames: inserted, height: 3600, viewport: 3600 }), currentFrame: 3 });
    const markup = html(state, undefined, canvasViewFields(state));
    expect(markup).toContain("<span>4. Payment</span>");
  });
  it("reads the current frame and zoom from the view store", () => {
    const markup = html(opened({ currentFrame: 2, zoom: 64, scale: 0.64 }), undefined, { currentFrame: 0, zoom: 125, scale: 1.25 });
    expect(markup).toContain("<span>1. Cart</span>");
    expect(markup).toContain("Zoom 125%, zoom options");
    expect(markup).not.toContain("Zoom 64%");
  });

  it("reads canvas / frame and shows the zoom controller", () => {
    const markup = html(opened());
    // The path is in the name's tooltip, not a native title.
    expect(markup).toMatch(/<span class="doan-canvas-name" role="img" aria-label="checkout" data-state="closed" data-slot="tooltip-trigger">.*<span>checkout<\/span><\/span><span class="ov-sep" aria-hidden="true">\/<\/span>/);
    const drawer = button(markup, "Frame 3: Payment");
    expect(drawer).toContain('aria-haspopup="listbox"');
    expect(drawer).not.toContain("title=");
    expect(drawer).not.toContain("disabled");
    expect(markup).toContain("<span>3. Payment</span>");
    const value = button(markup, "Zoom 64%, zoom options");
    expect(value).not.toContain("disabled");
    expect(markup).toMatch(/aria-label="Zoom 64%, zoom options"[^>]*>64%/);
    expect(button(markup, "Zoom out")).not.toContain("disabled");
    expect(button(markup, "Zoom in")).not.toContain("disabled");
  });

  it("starts the Breadcrumb with the project and its worktree switch, followed by the canvas and frame", () => {
    const nav = html(opened()).match(/<nav[^>]*aria-label="Breadcrumb"[^>]*>(.+?)<\/nav>/)?.[1];
    expect(nav).toBeDefined();
    expect(nav).toMatch(/<span class="doan-canvas-project"[^>]*><span class="shell-thumbnail hue-[a-z]+" aria-hidden="true">D<\/span><span class="doan-canvas-project-name">Demo<\/span>/);
    expect(nav).not.toContain("Demo Overview");
    const parts = ["doan-canvas-project", "Worktree: main", "doan-canvas-name", "doan-frame-trigger"].map(text => nav!.indexOf(text));
    expect(parts.every(i => i >= 0)).toBe(true);
    expect(parts).toEqual([...parts].sort((a, b) => a - b));
    expect(nav).not.toContain("Zoom out");
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

  // A zoom button its own press brings to a limit stays focusable: aria-disabled and a press that does nothing. Native
  // disabled is kept for the whole controller being off (no canvas drawn), above.
  it("at a zoom limit the button is aria-disabled, not disabled", () => {
    const command = vi.fn();
    const at = (zoom: number, scale: number) => renderToStaticMarkup(<TooltipProvider>{<CanvasHeader navigation={navigation} state={opened({ zoom, scale })} view={new CanvasViewStore(canvasViewFields(opened({ zoom, scale })))} command={command} zoomTo={vi.fn()} selectFrame={vi.fn()} /> as ReactElement}</TooltipProvider>);
    const min = at(5, 0.05), max = at(400, 4);
    expect(button(min, "Zoom out")).toContain('aria-disabled="true"');
    expect(button(min, "Zoom out")).not.toMatch(/ disabled=""/);
    expect(button(min, "Zoom in")).not.toContain("aria-disabled");
    expect(button(max, "Zoom in")).toContain('aria-disabled="true"');
    expect(button(max, "Zoom in")).not.toMatch(/ disabled=""/);
  });

  it("keeps the project separator and explains the switch on an unlisted page", () => {
    const markup = html(opened({ unlisted: true, shown: null }));
    expect(markup).not.toContain("doan-canvas-name");
    expect(markup).toContain("doan-canvas-sep-root");
    expect(button(markup, "Frames")).toContain("disabled");
    expect(button(markup, "Zoom options")).toContain("disabled");
    expect(button(markup, "Worktree: main")).toContain('aria-disabled="true"');
    expect(markup).toContain("Switching worktrees isn’t available on a page that isn’t a listed canvas.");
  });

  it("drops the canvas name when the canvas left the list or the project has a problem", () => {
    const markup = html({ ...initialCanvasState(), status: "missing", message: "gone" });
    expect(markup).not.toContain("doan-canvas-name");
    expect(markup).toContain("doan-canvas-sep-root");
    expect(button(markup, "Frames")).toContain("disabled");
  });

  // The open button exists only while the conversation panel is folded, last in the header.
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
  ] as const)("keeps Reload enabled while %s", (_name, over) => {
    expect(button(html(opened(over)), "Reload canvas")).toMatch(/^<button(?![^>]*disabled)/);
  });

  it("disables Reload when no canvas is open", () => {
    expect(button(html({ ...initialCanvasState(), status: "missing", message: "gone" }), "Reload canvas")).toMatch(/^<button[^>]*disabled/);
  });

  // The folded panel's open button carries the dot and says why.
  it("puts the news dot and its longer name on the folded panel's open button, its tooltip saying the same", () => {
    const waiting = button(html(opened(), { open: false, show: vi.fn(), badge: { kind: "permission", label: "Show conversation, needs your answer" } }), "Show conversation, needs your answer");
    expect(waiting).toContain('data-badge="true"');
    const unseen = button(html(opened(), { open: false, show: vi.fn(), badge: { kind: "unseen", label: "Show conversation, conversation finished unread" } }), "Show conversation, conversation finished unread");
    // A finished conversation takes the same accent dot (drawn by CSS for data-badge="unseen"), no speech bubble.
    expect(unseen).toContain('data-badge="unseen"');
    expect(html(opened(), { open: false, show: vi.fn(), badge: { kind: "unseen", label: "x" } })).not.toContain("badge-bubble");
    expect(html(opened(), { open: false, show: vi.fn(), badge: { kind: "permission", label: "x" } })).not.toContain("badge-bubble");
    expect(button(html(opened(), { open: false, show: vi.fn(), badge: null }), "Show conversation")).not.toContain("data-badge");
  });

  // The working spinner on the folded panel's open button.
  it("puts the working spinner on the folded panel's open button while a conversation of the canvas works", () => {
    const markup = html(opened(), { open: false, show: vi.fn(), badge: { kind: "working", label: "Show conversation, agent is working" } });
    const working = button(markup, "Show conversation, agent is working");
    expect(working).toContain('data-badge="working"');
    expect(markup).toMatch(/aria-label="Show conversation, agent is working"[^>]*>(?:(?!<\/button>).)*<span class="badge-working" aria-hidden="true"><span class="doan-spinner"><\/span><\/span><\/button>/);
    expect(markup).not.toContain("badge-bubble");
  });

  // One divider after Reload, then only the folded panels' Show buttons, Show inspector before Show conversation, each
  // naming its panel for focus.
  describe("the Show buttons of folded panels", () => {
    const show = (open: { inspector: boolean; conversation: boolean }, fits = true) =>
      html(opened(), { open: open.conversation, show: vi.fn() }, undefined, { open: open.inspector, fits, show: vi.fn() });
    const seps = (markup: string) => markup.split("doan-canvas-head-sep").length - 1;

    it("draws no divider and no button while both panels are open", () => {
      const markup = show({ inspector: true, conversation: true });
      expect(seps(markup)).toBe(0);
      expect(markup).not.toContain("doan-panel-show");
    });

    it("shows only the folded panel's button after one divider", () => {
      const inspector = show({ inspector: false, conversation: true });
      expect(seps(inspector)).toBe(1);
      const button = inspector.match(/<button[^>]*data-panel-target="inspector"[^>]*>/)?.[0] ?? "";
      expect(button).toContain('aria-label="Show inspector"');
      expect(button).toContain('aria-expanded="false"');
      expect(button).toContain(`aria-controls="${INSPECTOR_PANEL_ID}"`);
      expect(button).not.toContain("aria-disabled");
      expect(inspector).toMatch(/data-panel-target="inspector"[^>]*><svg[^>]*lucide-sliders-horizontal/);
      expect(inspector).not.toContain('data-panel-target="conversation"');
      const conversation = show({ inspector: true, conversation: false });
      expect(seps(conversation)).toBe(1);
      expect(conversation).toMatch(/data-panel-target="conversation"[^>]*><svg[^>]*lucide-message-square/);
      expect(conversation).not.toContain("lucide-panel-right-open");
      expect(conversation).not.toContain('data-panel-target="inspector"');
    });

    it("puts Show inspector before Show conversation when both are folded", () => {
      const markup = show({ inspector: false, conversation: false });
      expect(seps(markup)).toBe(1);
      const order = ["Reload canvas", "Show inspector", "Show conversation"].map(label => markup.indexOf(`aria-label="${label}"`));
      expect(order.every(index => index > 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(markup.indexOf("doan-canvas-head-sep")).toBeGreaterThan(markup.indexOf('aria-label="Reload canvas"'));
      expect(markup.indexOf("doan-canvas-head-sep")).toBeLessThan(markup.indexOf('aria-label="Show inspector"'));
    });

    // A window too narrow for the inspector keeps the button, unavailable, with the reason read and shown.
    it("keeps Show inspector unavailable in a narrow window, its reason as its description, even while saved open", () => {
      for (const open of [true, false]) {
        const markup = show({ inspector: open, conversation: true }, false);
        const button = markup.match(/<button[^>]*data-panel-target="inspector"[^>]*>/)?.[0] ?? "";
        expect(button).toContain('aria-disabled="true"');
        expect(button).not.toMatch(/ disabled=""/);
        const id = button.match(/aria-describedby="([^"]+)"/)?.[1];
        expect(id).toBeDefined();
        expect(markup).toContain(`<span class="sr-only" id="${id}">No room for the inspector. Widen the window, or narrow or hide the conversation.</span>`);
      }
    });
  });
});

it("uses the same switch in the sidebar, Overview and canvas header", async () => {
  const { readFileSync } = await import("node:fs");
  for (const file of ["ShellSidebar.tsx", "ProjectOverview.tsx", "CanvasHeader.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source, file).toContain('from "./WorktreeSwitch"');
    expect(source, file).toContain("<WorktreeSwitch ");
  }
});
