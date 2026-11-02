import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CanvasTools } from "./CanvasTools";
import { TooltipContent, TooltipProvider } from "./components/ui/tooltip";
import type { CanvasTool } from "./canvasTool";

// buzz-canvas design §2 '도구모음' and canvas-hand-tool design '도구모음': one Tab stop on the pressed tool, Select and
// Hand pressed one at a time, then Add to conversation.
const ADD = { enabled: true, reason: null, onAdd: () => {} };
type Props = Parameters<typeof CanvasTools>[0];
const props = (over: Partial<Props> = {}): Props => ({ tool: "select", onTool: () => {}, add: ADD, ...over });
const markup = (over: Partial<Props> = {}) => renderToStaticMarkup(<TooltipProvider><CanvasTools {...props(over)} /></TooltipProvider>);

// Walks the element tree through children only, so no component (and no Radix hook) runs.
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...all(node.props.children as ReactNode)];
}
const buttons = (node: ReactNode) => all(node).filter(element => element.type === "button");
const text = (node: ReactNode): string => Array.isArray(node) ? node.map(text).join("") : typeof node === "string" ? node : isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : "";

describe("CanvasTools", () => {
  it("is a named toolbar holding Select, Hand, then Add to conversation", () => {
    const html = markup();
    expect(html).toMatch(/<div[^>]*role="toolbar"[^>]*aria-label="Canvas tools"/);
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html.indexOf('aria-label="Select"')).toBeLessThan(html.indexOf('aria-label="Hand"'));
    expect(html.indexOf('aria-label="Hand"')).toBeLessThan(html.indexOf('aria-label="Add to conversation"'));
  });

  it.each<[CanvasTool, string, string]>([["select", "Select", "Hand"], ["hand", "Hand", "Select"]])("presses only %s", (tool, pressed, other) => {
    const html = markup({ tool });
    expect(html).toMatch(new RegExp(`<button[^>]*aria-pressed="true"[^>]*aria-label="${pressed}"`));
    expect(html).toMatch(new RegExp(`<button[^>]*aria-pressed="false"[^>]*aria-label="${other}"`));
  });

  it.each<CanvasTool>(["select", "hand"])("gives the one Tab stop to the pressed tool (%s)", (tool) => {
    expect(markup({ tool }).match(/tabindex="0"/g)).toHaveLength(1);
    const [select, hand, add] = buttons(CanvasTools(props({ tool })));
    expect([select?.props.tabIndex, hand?.props.tabIndex, add?.props.tabIndex]).toEqual(tool === "select" ? [0, -1, -1] : [-1, 0, -1]);
  });

  it("Select and Hand choose their tool, also when already pressed", () => {
    const chosen: CanvasTool[] = [];
    const [select, hand] = buttons(CanvasTools(props({ tool: "hand", onTool: tool => chosen.push(tool) })));
    (select?.props.onClick as () => void)();
    (hand?.props.onClick as () => void)();
    expect(chosen).toEqual(["select", "hand"]);
  });

  it("names each tool's key in its tooltip and aria-keyshortcuts", () => {
    const tree = CanvasTools(props());
    const [select, hand] = buttons(tree);
    expect(select?.props["aria-keyshortcuts"]).toBe("V");
    expect(hand?.props["aria-keyshortcuts"]).toBe("H");
    const tips = all(tree).filter(element => element.type === TooltipContent);
    expect(tips.map(tip => text(tip.props.children as ReactNode))).toEqual(["SelectV", "HandH", "Add to conversation"]);
    for (const [index, key] of [[0, "V"], [1, "H"]] as const) {
      const kbd = all(tips[index]!.props.children as ReactNode).find(element => element.props.className === "doan-kbd");
      expect(kbd?.props).toMatchObject({ "data-ui-variant": "on-prominent", "data-ui-size": "sm", children: key });
      expect(tips[index]!.props.className).toBe("has-key");
    }
  });

  // buzz-canvas-conversation design §2 'Add to conversation': aria-disabled, not disabled, so the tooltip says why.
  it("adds the selection when it can, and otherwise stays focusable and does nothing", () => {
    let added = 0;
    const tool = (add: Props["add"]) => buttons(CanvasTools(props({ add })))[2]!;
    (tool({ enabled: true, reason: null, onAdd: () => added++ }).props.onClick as () => void)();
    expect(added).toBe(1);
    const off = tool({ enabled: false, reason: "Pick from canvas isn’t available while the canvas can’t be shown.", onAdd: () => added++ });
    (off.props.onClick as () => void)();
    expect(added).toBe(1);
    expect(off.props["aria-disabled"]).toBe(true);
    expect(off.props.disabled).toBeUndefined();
    expect(off.props.tabIndex).toBe(-1);
  });

  it("explains an unavailable tool in its tooltip, and names itself otherwise", () => {
    const reason = "Pick from canvas isn’t available while the canvas can’t be shown.";
    expect(markup({ add: { enabled: false, reason, onAdd: () => {} } })).toMatch(/aria-label="Add to conversation" aria-disabled="true"/);
    expect(markup({ add: { enabled: false, reason: null, onAdd: () => {} } })).toMatch(/aria-label="Add to conversation" aria-disabled="true"/);
  });
});
