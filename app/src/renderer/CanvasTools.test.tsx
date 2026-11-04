import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CanvasTools } from "./CanvasTools";
import { TooltipContent, TooltipProvider } from "./components/ui/tooltip";
import type { CanvasTool } from "./canvasTool";

// buzz-canvas design §2 '도구모음', canvas-hand-tool design '도구모음' and canvas-composer-polish spec 3: one Tab stop on
// the pressed tool, Select and Hand pressed one at a time, then the Picker, which is pressed only while picking.
const PICKER = { enabled: true, reason: null, onToggle: () => {} };
type Props = Parameters<typeof CanvasTools>[0];
const props = (over: Partial<Props> = {}): Props => ({ tool: "select", picking: false, onTool: () => {}, picker: PICKER, ...over });
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
  it("is a named toolbar holding Select, Hand, then the Picker", () => {
    const html = markup();
    expect(html).toMatch(/<div[^>]*role="toolbar"[^>]*aria-label="Canvas tools"/);
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html.indexOf('aria-label="Select"')).toBeLessThan(html.indexOf('aria-label="Hand"'));
    expect(html.indexOf('aria-label="Hand"')).toBeLessThan(html.indexOf('aria-label="Pick from canvas"'));
    expect(html).not.toContain("Add to conversation");
  });

  it.each<[CanvasTool, string, string]>([["select", "Select", "Hand"], ["hand", "Hand", "Select"]])("presses only %s", (tool, pressed, other) => {
    const html = markup({ tool });
    expect(html).toMatch(new RegExp(`<button[^>]*aria-pressed="true"[^>]*aria-label="${pressed}"`));
    expect(html).toMatch(new RegExp(`<button[^>]*aria-pressed="false"[^>]*aria-label="${other}"`));
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*aria-label="Pick from canvas"/);
  });

  it.each<CanvasTool>(["select", "hand"])("while picking presses only the Picker, which holds the Tab stop (%s before)", (tool) => {
    const html = markup({ tool, picking: true });
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*aria-label="Pick from canvas"/);
    const [select, hand, picker] = buttons(CanvasTools(props({ tool, picking: true })));
    expect([select?.props["aria-pressed"], hand?.props["aria-pressed"], picker?.props["aria-pressed"]]).toEqual([false, false, true]);
    expect([select?.props.tabIndex, hand?.props.tabIndex, picker?.props.tabIndex]).toEqual([-1, -1, 0]);
  });

  it.each<CanvasTool>(["select", "hand"])("gives the one Tab stop to the pressed tool (%s)", (tool) => {
    expect(markup({ tool }).match(/tabindex="0"/g)).toHaveLength(1);
    const [select, hand, picker] = buttons(CanvasTools(props({ tool })));
    expect([select?.props.tabIndex, hand?.props.tabIndex, picker?.props.tabIndex]).toEqual(tool === "select" ? [0, -1, -1] : [-1, 0, -1]);
  });

  it("Select and Hand choose their tool, also when already pressed or while picking", () => {
    const chosen: CanvasTool[] = [];
    for (const picking of [false, true]) {
      const [select, hand] = buttons(CanvasTools(props({ tool: "hand", picking, onTool: tool => chosen.push(tool) })));
      (select?.props.onClick as () => void)();
      (hand?.props.onClick as () => void)();
    }
    expect(chosen).toEqual(["select", "hand", "select", "hand"]);
  });

  it("names each tool's key in its tooltip and aria-keyshortcuts; the Picker's is ⌘L", () => {
    const tree = CanvasTools(props());
    const [select, hand, picker] = buttons(tree);
    expect(select?.props["aria-keyshortcuts"]).toBe("V");
    expect(hand?.props["aria-keyshortcuts"]).toBe("H");
    expect(picker?.props["aria-keyshortcuts"]).toBe("Meta+L");
    const tips = all(tree).filter(element => element.type === TooltipContent);
    expect(tips.map(tip => text(tip.props.children as ReactNode))).toEqual(["SelectV", "HandH", "Pick from canvas⌘L"]);
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
});
