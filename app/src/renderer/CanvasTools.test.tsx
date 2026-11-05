import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CanvasTools } from "./CanvasTools";
import { TooltipContent, TooltipProvider } from "./components/ui/tooltip";
import type { CanvasTool } from "./canvasTool";

// buzz-canvas design §2 '도구모음', canvas-hand-tool design '도구모음', canvas-composer-polish spec 3 and canvas-capture
// design §3: one Tab stop on the pressed tool, Select and Hand pressed one at a time, then the Picker and Capture area,
// each pressed only during its own mode.
const PICKER = { enabled: true, reason: null, onToggle: () => {} };
const CAPTURE = { enabled: true, reason: null, onToggle: () => {} };
type Props = Parameters<typeof CanvasTools>[0];
const props = (over: Partial<Props> = {}): Props => ({ tool: "select", picking: false, capturing: false, onTool: () => {}, picker: PICKER, capture: CAPTURE, exporter: { reason: null, onExport: () => {} }, ...over });
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
  it("is a named toolbar holding Select, Hand, then the Picker, Capture area, a divider and Export", () => {
    const html = markup();
    expect(html).toMatch(/<div[^>]*role="toolbar"[^>]*aria-label="Canvas tools"/);
    expect(html.match(/<button/g)).toHaveLength(5);
    expect(html.indexOf('aria-label="Pick from canvas"')).toBeLessThan(html.indexOf('aria-label="Capture area"'));
    expect(html.indexOf('aria-label="Capture area"')).toBeLessThan(html.indexOf('role="separator"'));
    expect(html.indexOf('role="separator"')).toBeLessThan(html.indexOf('aria-label="Export canvas"'));
    expect(html.indexOf('aria-label="Select"')).toBeLessThan(html.indexOf('aria-label="Hand"'));
    expect(html.indexOf('aria-label="Hand"')).toBeLessThan(html.indexOf('aria-label="Pick from canvas"'));
    expect(html).not.toContain("Add to conversation");
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
    expect(buttons(CanvasTools(props({ tool, picking: true }))).slice(3).map(button => button.props.tabIndex)).toEqual([-1, -1]);
  });

  it.each<CanvasTool>(["select", "hand"])("during capture mode presses only Capture area, which holds the Tab stop (%s before)", (tool) => {
    const html = markup({ tool, capturing: true });
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*aria-label="Capture area"/);
    const tree = buttons(CanvasTools(props({ tool, capturing: true })));
    expect(tree.slice(0, 4).map(button => button.props["aria-pressed"])).toEqual([false, false, false, true]);
    expect(tree.map(button => button.props.tabIndex)).toEqual([-1, -1, -1, 0, -1]);
  });

  it.each<CanvasTool>(["select", "hand"])("gives the one Tab stop to the pressed tool (%s)", (tool) => {
    expect(markup({ tool }).match(/tabindex="0"/g)).toHaveLength(1);
    expect(buttons(CanvasTools(props({ tool }))).map(button => button.props.tabIndex)).toEqual(tool === "select" ? [0, -1, -1, -1, -1] : [-1, 0, -1, -1, -1]);
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

  // canvas-capture design 결정 5: Capture area has no shortcut, so its tooltip is its name alone.
  it("names each tool's key in its tooltip and aria-keyshortcuts; the Picker's is ⌘L and Capture area has none", () => {
    const tree = CanvasTools(props());
    const [select, hand, picker, capture] = buttons(tree);
    expect(select?.props["aria-keyshortcuts"]).toBe("V");
    expect(hand?.props["aria-keyshortcuts"]).toBe("H");
    expect(picker?.props["aria-keyshortcuts"]).toBe("Meta+L");
    expect(capture?.props["aria-label"]).toBe("Capture area");
    expect(capture?.props).not.toHaveProperty("aria-keyshortcuts");
    const tips = all(tree).filter(element => element.type === TooltipContent);
    expect(tips.map(tip => text(tip.props.children as ReactNode))).toEqual(["SelectV", "HandH", "Pick from canvas⌘L", "Capture area", "Export canvas"]);
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

  // canvas-capture spec 1 and design §3: aria-disabled like the Picker, with Export's sr-only reason.
  it("Capture area toggles capture mode when it can, and otherwise stays focusable, does nothing and says why", () => {
    let toggled = 0;
    const capture = (over: Partial<Props>) => buttons(CanvasTools(props(over)))[3]!;
    (capture({ capture: { enabled: true, reason: null, onToggle: () => toggled++ } }).props.onClick as () => void)();
    (capture({ capturing: true, capture: { enabled: true, reason: null, onToggle: () => toggled++ } }).props.onClick as () => void)();
    expect(toggled).toBe(2);
    const reason = "Files can’t be attached to a terminal session";
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
    const capture = buttons(CanvasTools(props({ capturing: true, capture: { enabled: false, reason: "Only 10 files can be attached. Remove one to add another.", onToggle: () => toggled++ } })))[3]!;
    expect(capture.props["aria-disabled"]).toBeUndefined();
    (capture.props.onClick as () => void)();
    expect(toggled).toBe(1);
  });

  // canvas-composer-polish spec 5: Export is an action, not a tool, and stays focusable while unavailable.
  it("Export is a named action without a pressed state that hands its button to the export", () => {
    const pressed: unknown[] = [];
    const exporter = buttons(CanvasTools(props({ exporter: { reason: null, onExport: button => pressed.push(button) } })))[4]!;
    expect(exporter.props["aria-label"]).toBe("Export canvas");
    expect(exporter.props).not.toHaveProperty("aria-pressed");
    const button = { name: "Export" };
    (exporter.props.onClick as (event: { currentTarget: unknown }) => void)({ currentTarget: button });
    expect(pressed).toEqual([button]);
  });

  it("an unavailable Export stays focusable, does nothing and gives its reason as the tooltip", () => {
    let exported = 0;
    const tree = CanvasTools(props({ exporter: { reason: "Exporting", onExport: () => exported++ } }));
    const exporter = buttons(tree)[4]!;
    (exporter.props.onClick as (event: { currentTarget: unknown }) => void)({ currentTarget: {} });
    expect(exported).toBe(0);
    expect(exporter.props["aria-disabled"]).toBe(true);
    expect(exporter.props.disabled).toBeUndefined();
    const tips = all(tree).filter(element => element.type === TooltipContent);
    expect(text(tips[4]!.props.children as ReactNode)).toBe("Exporting");
  });

  // Radix links the tooltip only while it is open, so a closed one (after a press, or under a screen reader's cursor)
  // left the button without its reason (design-sync measurement, canvas-composer-polish draft frame toolbar-disabled).
  it("an unavailable Export names its reason with aria-describedby even while the tooltip is closed", () => {
    const html = markup({ exporter: { reason: "This page is not a listed canvas.", onExport: () => {} } });
    const tag = html.match(/<button[^>]*aria-label="Export canvas"[^>]*>/)?.[0] ?? "";
    const id = tag.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toMatch(new RegExp(`<span class="sr-only" id="${id}">This page is not a listed canvas.</span>`));
    expect(markup()).not.toMatch(/aria-describedby|sr-only/);
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
});
