import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Popover } from "radix-ui";
import { CanvasTools, type PlayTool } from "./CanvasTools";
import { FrameListBody } from "./FrameListBody";
import { drawerKey } from "./frameDrawerList";
import { TooltipContent, TooltipProvider } from "./components/ui/tooltip";
import type { CanvasTool } from "./canvasTool";

// One Tab stop on the pressed tool, Select and Hand pressed one at a time, then the Picker and Capture area, each
// pressed only during its own mode.
const PICKER = { enabled: true, reason: null, onToggle: () => {} };
const CAPTURE = { enabled: true, reason: null, onToggle: () => {} };
type Props = Parameters<typeof CanvasTools>[0];
const PLAYER: PlayTool = { kind: "play", tooltip: "Play “Checkout”", onPlay: () => {}, open: false, onOpenChange: () => {}, drawer: null };
const GROUPS = [{ label: "Cart and 1 more", rows: [{ key: "cart", id: "cart", number: 2, name: "Cart", current: false, group: 0 }, { key: "checkout", id: "checkout", number: 3, name: "Checkout", current: true, group: 0 }] }];
const DRAWER: PlayTool = { kind: "drawer", tooltip: "Choose a prototype to play", onPlay: () => {}, open: false, onOpenChange: () => {}, drawer: { label: "Prototype frames in Shop", groups: GROUPS, onPick: () => {} } };
const DISABLED: PlayTool = { kind: "disabled", tooltip: "Finish the capture first.", onPlay: () => {}, open: false, onOpenChange: () => {}, drawer: null };
const props = (over: Partial<Props> = {}): Props => ({ tool: "select", picking: false, capturing: false, onTool: () => {}, picker: PICKER, capture: CAPTURE, player: PLAYER, exporter: { reason: null, onExport: () => {} }, onEscape: () => {}, ...over });
const markup = (over: Partial<Props> = {}) => renderToStaticMarkup(<TooltipProvider><CanvasTools {...props(over)} /></TooltipProvider>);
const withoutPlayLine = (html: string) => html.replace(' aria-describedby="canvas-play-reason"', "").replace(/<span class="sr-only" id="canvas-play-reason">[^<]*<\/span>/, "");
const UNAVAILABLE = "Pick from canvas isn’t available while the canvas can’t be shown.";

// Walks the element tree through children only, so no component (and no Radix hook) runs.
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...all(node.props.children as ReactNode)];
}
const buttons = (node: ReactNode) => all(node).filter(element => element.type === "button");
const text = (node: ReactNode): string => Array.isArray(node) ? node.map(text).join("") : typeof node === "string" ? node : isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : "";

describe("CanvasTools", () => {
  it("is a named toolbar holding Select, Hand, then the Picker, Capture area, a divider, Play prototype and Export", () => {
    const html = markup();
    expect(html).toMatch(/<div[^>]*role="toolbar"[^>]*aria-label="Canvas tools"/);
    expect(html.match(/<button/g)).toHaveLength(6);
    expect(html.indexOf('role="separator"')).toBeLessThan(html.indexOf('aria-label="Play prototype"'));
    expect(html.indexOf('aria-label="Play prototype"')).toBeLessThan(html.indexOf('aria-label="Export canvas"'));
    expect(html.indexOf('aria-label="Pick from canvas"')).toBeLessThan(html.indexOf('aria-label="Capture area"'));
    expect(html.indexOf('aria-label="Capture area"')).toBeLessThan(html.indexOf('role="separator"'));
    expect(html.indexOf('role="separator"')).toBeLessThan(html.indexOf('aria-label="Export canvas"'));
    expect(html.indexOf('aria-label="Select"')).toBeLessThan(html.indexOf('aria-label="Hand"'));
    expect(html.indexOf('aria-label="Hand"')).toBeLessThan(html.indexOf('aria-label="Pick from canvas"'));
    expect(html).not.toContain("Add to conversation");
  });

  it("carries the docked buddy's second floor first: decorative, no tab stop, and outside the tools ←/→ walks", async () => {
    const { dockedBuddy } = await import("./dockedBuddyShell");
    const html = markup();
    expect(html).toMatch(/^<div class="doan-floating doan-canvas-tools"[^>]*><div class="docked-buddy-slot" aria-hidden="true"><\/div><button/);
    const slot = all(CanvasTools(props())).find(element => element.props.className === "docked-buddy-slot")!;
    expect(slot.props.ref).toBe(dockedBuddy.toolsSlot);
    expect(slot.props.tabIndex).toBeUndefined();
  });

  it.each<[CanvasTool, string, string]>([["select", "Select", "Hand"], ["hand", "Hand", "Select"]])("presses only %s", (tool, pressed, other) => {
    const html = markup({ tool });
    expect(html).toMatch(new RegExp(`<button[^>]*aria-pressed="true"[^>]*aria-label="${pressed}"`));
    expect(html).toMatch(new RegExp(`<button[^>]*aria-pressed="false"[^>]*aria-label="${other}"`));
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*aria-label="Pick from canvas"/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*aria-label="Capture area"/);
  });

  it.each<CanvasTool>(["select", "hand"])("while picking presses only the Picker, which holds the Tab stop (%s before)", (tool) => {
    const html = markup({ tool, picking: true });
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*aria-label="Pick from canvas"/);
    const [select, hand, picker] = buttons(CanvasTools(props({ tool, picking: true })));
    expect([select?.props["aria-pressed"], hand?.props["aria-pressed"], picker?.props["aria-pressed"]]).toEqual([false, false, true]);
    expect([select?.props.tabIndex, hand?.props.tabIndex, picker?.props.tabIndex]).toEqual([-1, -1, 0]);
    expect(buttons(CanvasTools(props({ tool, picking: true }))).slice(3).map(button => button.props.tabIndex)).toEqual([-1, -1, -1]);
  });

  it.each<CanvasTool>(["select", "hand"])("during capture mode presses only Capture area, which holds the Tab stop (%s before)", (tool) => {
    const html = markup({ tool, capturing: true });
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*aria-label="Capture area"/);
    const tree = buttons(CanvasTools(props({ tool, capturing: true })));
    expect(tree.slice(0, 4).map(button => button.props["aria-pressed"])).toEqual([false, false, false, true]);
    expect(tree.map(button => button.props.tabIndex)).toEqual([-1, -1, -1, 0, -1, -1]);
  });

  it.each<CanvasTool>(["select", "hand"])("gives the one Tab stop to the pressed tool (%s)", (tool) => {
    expect(markup({ tool }).match(/tabindex="0"/g)).toHaveLength(1);
    expect(buttons(CanvasTools(props({ tool }))).map(button => button.props.tabIndex)).toEqual(tool === "select" ? [0, -1, -1, -1, -1, -1] : [-1, 0, -1, -1, -1, -1]);
  });

  // A pointer press that left focus on a button would make the next Space press it instead of panning
  // (PRODUCT §5 item 2 'Toolbar'); the click still runs and Tab still reaches the tools.
  it("a pointer press on any tool keeps focus where it was", () => {
    const tools = buttons(CanvasTools(props()));
    expect(tools).toHaveLength(6);
    for (const button of tools) {
      const preventDefault = vi.fn();
      (button.props.onMouseDown as ((event: { preventDefault(): void }) => void) | undefined)?.({ preventDefault });
      expect(preventDefault, String(button.props["aria-label"])).toHaveBeenCalledOnce();
    }
  });

  it("Select and Hand choose their tool, also when already pressed, while picking or during capture mode", () => {
    const chosen: CanvasTool[] = [];
    for (const mode of [{}, { picking: true }, { capturing: true }]) {
      const [select, hand] = buttons(CanvasTools(props({ tool: "hand", ...mode, onTool: tool => chosen.push(tool) })));
      (select?.props.onClick as () => void)();
      (hand?.props.onClick as () => void)();
    }
    expect(chosen).toEqual(["select", "hand", "select", "hand", "select", "hand"]);
  });

  // Capture area has no shortcut, so its tooltip is its name alone.
  it("names each tool's key in its tooltip and aria-keyshortcuts; the Picker's is ⌘L and Capture area has none", () => {
    const tree = CanvasTools(props());
    const [select, hand, picker, capture] = buttons(tree);
    expect(select?.props["aria-keyshortcuts"]).toBe("V");
    expect(hand?.props["aria-keyshortcuts"]).toBe("H");
    expect(picker?.props["aria-keyshortcuts"]).toBe("Meta+L");
    expect(capture?.props["aria-label"]).toBe("Capture area");
    expect(capture?.props).not.toHaveProperty("aria-keyshortcuts");
    const tips = all(tree).filter(element => element.type === TooltipContent);
    expect(tips.map(tip => text(tip.props.children as ReactNode))).toEqual(["SelectV", "HandH", "Pick from canvas⌘L", "Capture area", "Play “Checkout”", "Export canvas"]);
    expect(tips[3]!.props.className).toBeUndefined();
    for (const [index, key] of [[0, "V"], [1, "H"], [2, "⌘L"]] as const) {
      const kbd = all(tips[index]!.props.children as ReactNode).find(element => element.props.className === "doan-kbd");
      expect(kbd?.props).toMatchObject({ "data-ui-variant": "on-prominent", "data-ui-size": "sm", children: key });
      expect(tips[index]!.props.className).toBe("has-key");
    }
  });

  // aria-disabled, not disabled, so the tooltip says why and ←/→ still reach it.
  it("the Picker toggles the pick when it can, and otherwise stays focusable, does nothing and says why", () => {
    let toggled = 0;
    const picker = (over: Partial<Props>) => buttons(CanvasTools(props(over)))[2]!;
    (picker({ picker: { enabled: true, reason: null, onToggle: () => toggled++ } }).props.onClick as () => void)();
    (picker({ picking: true, picker: { enabled: true, reason: null, onToggle: () => toggled++ } }).props.onClick as () => void)();
    expect(toggled).toBe(2);
    const off = picker({ picker: { enabled: false, reason: UNAVAILABLE, onToggle: () => toggled++ } });
    (off.props.onClick as () => void)();
    expect(toggled).toBe(2);
    expect(off.props["aria-disabled"]).toBe(true);
    expect(off.props.disabled).toBeUndefined();
    const tips = all(CanvasTools(props({ picker: { enabled: false, reason: UNAVAILABLE, onToggle: () => {} } }))).filter(element => element.type === TooltipContent);
    expect(text(tips[2]!.props.children as ReactNode)).toBe(UNAVAILABLE);
    expect(markup({ picker: { enabled: false, reason: UNAVAILABLE, onToggle: () => {} } })).toMatch(/aria-label="Pick from canvas"[^>]*aria-disabled="true"/);
  });

  // aria-disabled like the Picker, with Export's sr-only reason.
  it("Capture area toggles capture mode when it can, and otherwise stays focusable, does nothing and says why", () => {
    let toggled = 0;
    const capture = (over: Partial<Props>) => buttons(CanvasTools(props(over)))[3]!;
    (capture({ capture: { enabled: true, reason: null, onToggle: () => toggled++ } }).props.onClick as () => void)();
    (capture({ capturing: true, capture: { enabled: true, reason: null, onToggle: () => toggled++ } }).props.onClick as () => void)();
    expect(toggled).toBe(2);
    const reason = "Attachments can’t be added to a terminal session";
    const off = capture({ capture: { enabled: false, reason, onToggle: () => toggled++ } });
    (off.props.onClick as () => void)();
    expect(toggled).toBe(2);
    expect(off.props["aria-disabled"]).toBe(true);
    expect(off.props.disabled).toBeUndefined();
    const tree = CanvasTools(props({ capture: { enabled: false, reason, onToggle: () => {} } }));
    expect(text(all(tree).filter(element => element.type === TooltipContent)[3]!.props.children as ReactNode)).toBe(reason);
    const html = markup({ capture: { enabled: false, reason, onToggle: () => {} } });
    const tag = html.match(/<button[^>]*aria-label="Capture area"[^>]*>/)?.[0] ?? "";
    expect(tag).toContain('aria-disabled="true"');
    const id = tag.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toMatch(new RegExp(`<span class="sr-only" id="${id}">${reason}</span>`));
    expect(html.match(/<button[^>]*aria-label="Export canvas"[^>]*>/)?.[0]).not.toContain("aria-describedby");
    // Play describes every state with its own line; no other control has one while available.
    expect(withoutPlayLine(markup())).not.toMatch(/aria-describedby|sr-only/);
  });

  // Availability can change during capture mode (a paste fills the draft); the pressed button still ends it.
  it("during capture mode Capture area always ends it, even once it could not start again", () => {
    let toggled = 0;
    const capture = buttons(CanvasTools(props({ capturing: true, capture: { enabled: false, reason: "Only 10 attachments can be added. Remove one to add another.", onToggle: () => toggled++ } })))[3]!;
    expect(capture.props["aria-disabled"]).toBeUndefined();
    (capture.props.onClick as () => void)();
    expect(toggled).toBe(1);
  });

  // Export is an action, not a tool, and stays focusable while unavailable.
  it("Export is a named action without a pressed state that hands its button to the export", () => {
    const pressed: unknown[] = [];
    const exporter = buttons(CanvasTools(props({ exporter: { reason: null, onExport: button => pressed.push(button) } })))[5]!;
    expect(exporter.props["aria-label"]).toBe("Export canvas");
    expect(exporter.props).not.toHaveProperty("aria-pressed");
    const button = { name: "Export" };
    (exporter.props.onClick as (event: { currentTarget: unknown }) => void)({ currentTarget: button });
    expect(pressed).toEqual([button]);
  });

  it("an unavailable Export stays focusable, does nothing and gives its reason as the tooltip", () => {
    let exported = 0;
    const tree = CanvasTools(props({ exporter: { reason: "Exporting", onExport: () => exported++ } }));
    const exporter = buttons(tree)[5]!;
    (exporter.props.onClick as (event: { currentTarget: unknown }) => void)({ currentTarget: {} });
    expect(exported).toBe(0);
    expect(exporter.props["aria-disabled"]).toBe(true);
    expect(exporter.props.disabled).toBeUndefined();
    const tips = all(tree).filter(element => element.type === TooltipContent);
    expect(text(tips[5]!.props.children as ReactNode)).toBe("Exporting");
  });

  // Radix links the tooltip only while it is open, so a closed one left the button without its reason.
  it("an unavailable Export names its reason with aria-describedby even while the tooltip is closed", () => {
    const html = markup({ exporter: { reason: "This page is not a listed canvas.", onExport: () => {} } });
    const tag = html.match(/<button[^>]*aria-label="Export canvas"[^>]*>/)?.[0] ?? "";
    const id = tag.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toMatch(new RegExp(`<span class="sr-only" id="${id}">This page is not a listed canvas.</span>`));
    // Play describes every state with its own line; no other control has one while available.
    expect(withoutPlayLine(markup())).not.toMatch(/aria-describedby|sr-only/);
  });

  it("Play prototype is an action with no pressed state or Tab stop that plays while it can", () => {
    let played = 0;
    const tree = CanvasTools(props({ player: { ...PLAYER, onPlay: () => played++ } }));
    const play = buttons(tree)[4]!;
    expect(play.props["aria-label"]).toBe("Play prototype");
    expect(play.props).not.toHaveProperty("aria-pressed");
    expect(play.props.tabIndex).toBe(-1);
    expect(play.props["aria-disabled"]).toBeUndefined();
    (play.props.onClick as () => void)();
    expect(played).toBe(1);
    expect(text(all(tree).filter(element => element.type === TooltipContent)[4]!.props.children as ReactNode)).toBe("Play “Checkout”");
  });

  // The name stays "Play prototype"; the tooltip and the description say what a press does now.
  it.each([["play", PLAYER], ["drawer", DRAWER], ["disabled", DISABLED]] as const)("names Play the same and describes its %s state with its tooltip", (_kind, player) => {
    const html = markup({ player });
    const tag = html.match(/<button[^>]*aria-label="Play prototype"[^>]*>/)?.[0] ?? "";
    expect(tag.match(/aria-describedby="([^"]+)"/)?.[1]).toBe("canvas-play-reason");
    expect(html).toContain(`<span class="sr-only" id="canvas-play-reason">${player.tooltip}</span>`);
    expect(text(all(CanvasTools(props({ player }))).filter(element => element.type === TooltipContent)[4]!.props.children as ReactNode)).toBe(player.tooltip);
  });

  it("an unavailable Play stays focusable and does nothing", () => {
    let played = 0;
    const play = buttons(CanvasTools(props({ player: { ...DISABLED, onPlay: () => played++ } })))[4]!;
    (play.props.onClick as () => void)();
    expect(played).toBe(0);
    expect(play.props["aria-disabled"]).toBe(true);
    expect(play.props.disabled).toBeUndefined();
  });

  it("only the drawer state says Play opens a list, and a press there plays nothing", () => {
    let played = 0;
    for (const player of [PLAYER, DISABLED]) {
      const tag = markup({ player }).match(/<button[^>]*aria-label="Play prototype"[^>]*>/)?.[0] ?? "";
      expect(tag).not.toMatch(/aria-haspopup|aria-expanded|aria-controls/);
    }
    const drawer = markup({ player: DRAWER }).match(/<button[^>]*aria-label="Play prototype"[^>]*>/)?.[0] ?? "";
    expect(drawer).toContain('aria-haspopup="listbox"');
    expect(drawer).toContain('aria-expanded="false"');
    expect(drawer).not.toContain("aria-disabled");
    const open = markup({ player: { ...DRAWER, open: true } }).match(/<button[^>]*aria-label="Play prototype"[^>]*>/)?.[0] ?? "";
    expect(open).toContain('aria-expanded="true"');
    (buttons(CanvasTools(props({ player: { ...DRAWER, onPlay: () => played++ } })))[4]!.props.onClick as () => void)();
    expect(played).toBe(0);
  });

  // The popover's trigger toggles on every press; outside the drawer state that must not open anything.
  it("the drawer opens and closes only in the drawer state", () => {
    for (const player of [PLAYER, DISABLED, DRAWER]) {
      const onOpenChange = vi.fn();
      const root = all(CanvasTools(props({ player: { ...player, onOpenChange } }))).find(element => element.type === Popover.Root)!;
      expect(root.props.open).toBe(false);
      (root.props.onOpenChange as (open: boolean) => void)(true);
      (root.props.onOpenChange as (open: boolean) => void)(false);
      expect(onOpenChange.mock.calls, player.kind).toEqual(player.kind === "drawer" ? [[true], [false]] : [[false]]);
    }
    const open = all(CanvasTools(props({ player: { ...DRAWER, open: true } }))).find(element => element.type === Popover.Root)!;
    expect(open.props.open).toBe(true);
    expect(all(CanvasTools(props({ player: { ...PLAYER, open: true } }))).find(element => element.type === Popover.Root)!.props.open).toBe(false);
  });

  it("the drawer holds the prototype window's list body above Play", () => {
    const body = all(CanvasTools(props({ player: { ...DRAWER, open: true } }))).find(element => element.type === FrameListBody)!;
    expect(body.props).toMatchObject({ label: "Prototype frames in Shop", groups: GROUPS, open: true, side: "top" });
    expect(body.props.onPick).toBe(DRAWER.drawer!.onPick);
    expect(all(CanvasTools(props())).some(element => element.type === FrameListBody)).toBe(false);
  });

  // The drawer's list sits in a portal, but React still bubbles its keys to the toolbar's handler: arrows there are the
  // list's, V and H are swallowed by the list, and Esc is Radix's.
  it("keys from a drawer row that reach the toolbar move no tool", () => {
    const tree = CanvasTools(props({ player: { ...DRAWER, open: true } }));
    const toolbar = all(tree).find(element => element.props.role === "toolbar")!;
    const tools = ["Select", "Hand", "Picker", "Capture", "Play", "Export"].map(name => ({ name, focus: vi.fn() }));
    const row = { name: "Checkout row", focus: vi.fn() };
    vi.stubGlobal("document", { activeElement: row });
    try {
      for (const key of ["ArrowRight", "ArrowLeft", "v", "h", "Escape"]) {
        const event = { key, currentTarget: { querySelectorAll: () => tools }, preventDefault: vi.fn() };
        (toolbar.props.onKeyDown as (event: unknown) => void)(event);
        expect(event.preventDefault, key).not.toHaveBeenCalled();
      }
      for (const tool of tools) expect(tool.focus, tool.name).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
    const rows = DRAWER.drawer!.groups[0]!.rows;
    const key = (name: string) => drawerKey(rows, "checkout", { key: name, metaKey: false, ctrlKey: false, altKey: false }, { text: "", at: 0 }, 1000);
    expect([key("v").prevent, key("h").prevent]).toEqual([true, true]);
    expect([key("ArrowRight").prevent, key("ArrowLeft").prevent, key("Escape").prevent]).toEqual([false, false, false]);
  });

  // POSTMORTEM 2026-11-13: a control whose state changes while focused keeps one element tree.
  it("keeps Play the same element in every state", () => {
    const path = (player: PlayTool) => {
      const chain: unknown[] = [];
      const walk = (node: ReactNode): boolean => {
        if (Array.isArray(node)) return node.some(walk);
        if (!isValidElement<Record<string, unknown>>(node)) return false;
        if (node.type === "button" && node.props["aria-label"] === "Play prototype") { chain.push(node.type); return true; }
        chain.push(node.type);
        if (walk(node.props.children as ReactNode)) return true;
        chain.pop();
        return false;
      };
      walk(CanvasTools(props({ player })));
      return chain;
    };
    expect(path(DRAWER)).toEqual(path(PLAYER));
    expect(path(DISABLED)).toEqual(path(PLAYER));
    expect(path({ ...DRAWER, open: true })).toEqual(path(PLAYER));
  });

  it("hands Play's button ref to App, which focuses it when the bubble's Play goes or the window closes", () => {
    const ref = { current: null };
    const play = buttons(CanvasTools(props({ player: { ...PLAYER, button: ref } })))[4]!;
    expect(play.props.ref).toBe(ref);
  });

  it("←/→ reach unavailable tools too, since they are aria-disabled, not disabled", () => {
    const tree = CanvasTools(props({ picker: { enabled: false, reason: UNAVAILABLE, onToggle: () => {} }, capture: { enabled: false, reason: UNAVAILABLE, onToggle: () => {} }, exporter: { reason: "Exporting", onExport: () => {} } }));
    const toolbar = all(tree).find(element => element.props.role === "toolbar")!;
    const focused: string[] = [];
    const node = (name: string) => ({ name, focus: () => focused.push(name) });
    const nodes = ["Select", "Hand", "Picker", "Capture", "Export"].map(node);
    const selectors: string[] = [];
    const currentTarget = { querySelectorAll: (selector: string) => { selectors.push(selector); return nodes; } };
    vi.stubGlobal("document", { activeElement: nodes[1] });
    try {
      const press = (key: string) => (toolbar.props.onKeyDown as (event: unknown) => void)({ key, currentTarget, preventDefault: () => {} });
      press("ArrowRight");
      (document as { activeElement: unknown }).activeElement = nodes[2];
      press("ArrowRight");
      (document as { activeElement: unknown }).activeElement = nodes[3];
      press("ArrowRight");
      expect(focused).toEqual(["Picker", "Capture", "Export"]);
      expect(selectors.every(selector => selector === "button:not(:disabled)")).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
  // A tooltip open on a tool takes the Escape before the window sees it, so each tooltip hands that
  // Escape to the canvas's next step and leaves it unprevented, so Radix still closes the tooltip on the same press.
  it("an Escape that closes any tool's tooltip also takes the canvas's next Escape step", () => {
    const onEscape = vi.fn();
    for (const over of [{}, { picking: true }, { capturing: true }, { picker: { ...PICKER, enabled: false, reason: UNAVAILABLE } }, { exporter: { reason: "No canvas", onExport: () => {} } }, { player: DISABLED }, { player: DRAWER }] as Partial<Props>[]) {
      const contents = all(CanvasTools(props({ ...over, onEscape }))).filter(element => element.type === TooltipContent);
      expect(contents).toHaveLength(6);
      for (const content of contents) {
        onEscape.mockClear();
        const event = { defaultPrevented: false, preventDefault: vi.fn() };
        (content.props.onEscapeKeyDown as (event: unknown) => void)(event);
        expect(onEscape).toHaveBeenCalledExactlyOnceWith(event);
        expect(event.preventDefault).not.toHaveBeenCalled();
      }
    }
  });
});
