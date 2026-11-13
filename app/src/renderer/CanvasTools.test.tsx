import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CanvasTools } from "./CanvasTools";
import { TooltipContent, TooltipProvider } from "./components/ui/tooltip";
import type { CanvasTool } from "./canvasTool";

// One Tab stop on the pressed tool, Select and Hand pressed one at a time, then the Picker and Capture area,
// each pressed only during its own mode.
const PICKER = { enabled: true, reason: null, onToggle: () => {} };
const CAPTURE = { enabled: true, reason: null, onToggle: () => {} };
type Props = Parameters<typeof CanvasTools>[0];
const props = (over: Partial<Props> = {}): Props => ({ tool: "select", picking: false, capturing: false, onTool: () => {}, picker: PICKER, capture: CAPTURE, player: { reason: null, onPlay: () => {} }, exporter: { reason: null, onExport: () => {} }, onEscape: () => {}, ...over });
const markup = (over: Partial<Props> = {}) => renderToStaticMarkup(<TooltipProvider><CanvasTools {...props(over)} /></TooltipProvider>);
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
    expect(tips.map(tip => text(tip.props.children as ReactNode))).toEqual(["SelectV", "HandH", "Pick from canvas⌘L", "Capture area", "Play prototype", "Export canvas"]);
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
    expect(markup()).not.toMatch(/aria-describedby|sr-only/);
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

  // Radix links the tooltip only while it is open, so a closed one (after a press, or under a screen reader's cursor)
  // left the button without its reason (design-sync measurement, draft frame toolbar-disabled).
  it("an unavailable Export names its reason with aria-describedby even while the tooltip is closed", () => {
    const html = markup({ exporter: { reason: "This page is not a listed canvas.", onExport: () => {} } });
    const tag = html.match(/<button[^>]*aria-label="Export canvas"[^>]*>/)?.[0] ?? "";
    const id = tag.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toMatch(new RegExp(`<span class="sr-only" id="${id}">This page is not a listed canvas.</span>`));
    expect(markup()).not.toMatch(/aria-describedby|sr-only/);
  });

  it("Play prototype is an action with no pressed state or Tab stop that plays while available", () => {
    let played = 0;
    const tree = CanvasTools(props({ player: { reason: null, onPlay: () => played++ } }));
    const play = buttons(tree)[4]!;
    expect(play.props["aria-label"]).toBe("Play prototype");
    expect(play.props).not.toHaveProperty("aria-pressed");
    expect(play.props.tabIndex).toBe(-1);
    expect(play.props["aria-disabled"]).toBeUndefined();
    (play.props.onClick as () => void)();
    expect(played).toBe(1);
    expect(text(all(tree).filter(element => element.type === TooltipContent)[4]!.props.children as ReactNode)).toBe("Play prototype");
  });

  it("an unavailable Play stays focusable, does nothing and names its reason as the tooltip and the description", () => {
    let played = 0;
    const reason = "Select the frame itself to play its prototype.";
    const tree = CanvasTools(props({ player: { reason, onPlay: () => played++ } }));
    const play = buttons(tree)[4]!;
    (play.props.onClick as () => void)();
    expect(played).toBe(0);
    expect(play.props["aria-disabled"]).toBe(true);
    expect(play.props.disabled).toBeUndefined();
    expect(text(all(tree).filter(element => element.type === TooltipContent)[4]!.props.children as ReactNode)).toBe(reason);
    const html = markup({ player: { reason, onPlay: () => {} } });
    const tag = html.match(/<button[^>]*aria-label="Play prototype"[^>]*>/)?.[0] ?? "";
    const id = tag.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBe("canvas-play-reason");
    expect(html).toContain(`<span class="sr-only" id="canvas-play-reason">${reason}</span>`);
  });

  it("hands Play's button ref to App, which focuses it when the bubble's Play goes or the window closes", () => {
    const ref = { current: null };
    const play = buttons(CanvasTools(props({ player: { reason: null, onPlay: () => {}, button: ref } })))[4]!;
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
    for (const over of [{}, { picking: true }, { capturing: true }, { picker: { ...PICKER, enabled: false, reason: UNAVAILABLE } }, { exporter: { reason: "No canvas", onExport: () => {} } }, { player: { reason: "Select a supported frame to play its prototype.", onPlay: () => {} } }] as Partial<Props>[]) {
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
