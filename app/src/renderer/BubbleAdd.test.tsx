import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import { NO_ROOM_FOR_INSPECTOR } from "./headerShowButtons";
import { INSPECTOR_PANEL_ID } from "./InspectorPanel";
import { BubbleAddButton, BubbleInspectButton } from "./BubbleAdd";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

// There is no DOM in these tests: the element tree is walked as the toolbar's tests walk CanvasTools.
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
const tree = (props: Partial<Parameters<typeof BubbleAddButton>[0]> = {}) =>
  all(BubbleAddButton({ enabled: true, reason: null, button: { current: null }, onEscape: vi.fn(), ...props }));
const button = (nodes: ReactElement<Record<string, unknown>>[]) => nodes.find(node => node.type === "button")!;
const content = (nodes: ReactElement<Record<string, unknown>>[]) => nodes.find(node => node.type === TooltipContent)!;
const text = (node: ReactNode): string => Array.isArray(node) ? node.map(text).join("") : typeof node === "string" ? node : isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : "";

describe("BubbleAddButton", () => {
  test("an xs icon button named Add to message, with a Crosshair, whose tooltip names it", () => {
    const ref = { current: null };
    const nodes = tree({ button: ref });
    expect(button(nodes).props).toMatchObject({ type: "button", className: "doan-icon-button bubble-button", "data-ui-size": "xs", "aria-label": "Add to message", "data-bubble-action": "add" });
    expect(button(nodes).props["aria-disabled"]).toBeUndefined();
    expect(button(nodes).props["aria-describedby"]).toBeUndefined();
    expect(button(nodes).props.ref).toBe(ref);
    expect(nodes.some(node => typeof node.type !== "string" && (node.type as { displayName?: string }).displayName === "Crosshair")).toBe(true);
    expect(text(content(nodes).props.children as ReactNode)).toBe("Add to message");
  });

  test("unavailable, it is aria-disabled and its reason is both the tooltip and its description", () => {
    const reason = "Finish or cancel the capture first.";
    const nodes = tree({ enabled: false, reason });
    expect(button(nodes).props["aria-disabled"]).toBe(true);
    expect(button(nodes).props.disabled).toBeUndefined();
    const described = button(nodes).props["aria-describedby"] as string;
    const description = nodes.find(node => node.props.id === described)!;
    expect(description.props.className).toBe("sr-only");
    expect(text(description.props.children as ReactNode)).toBe(reason);
    expect(text(content(nodes).props.children as ReactNode)).toBe(reason);
  });

  // Radix opens a tooltip on its trigger's focus, so the keyboard sees the name or the reason as the pointer does.
  test("the shared tooltip wraps the button, above it as every app tooltip, and opens on focus as well as hover", () => {
    const nodes = tree();
    expect(nodes.some(node => node.type === Tooltip)).toBe(true);
    const trigger = nodes.find(node => node.type === TooltipTrigger)!;
    expect(trigger.props.asChild).toBe(true);
    expect(content(nodes).props.side ?? "top").toBe("top");
  });

  test("an Escape the open tooltip takes goes to the controller's tooltip Escape", () => {
    const onEscape = vi.fn();
    expect(content(tree({ onEscape })).props.onEscapeKeyDown).toBe(onEscape);
  });

  // POSTMORTEM 2026-11-13: a control that turns unavailable while focused must stay the same element, or focus falls to
  // the page.
  test("the button is the same element whether it is available or not", () => {
    const path = (nodes: ReactElement<Record<string, unknown>>[]) => nodes.slice(0, nodes.indexOf(button(nodes)) + 1).map(node => node.type);
    expect(path(tree({ enabled: false, reason: "Only frames and what’s in them can go in a message." }))).toEqual(path(tree()));
    const root = (props: Partial<Parameters<typeof BubbleAddButton>[0]>) => BubbleAddButton({ enabled: true, reason: null, button: { current: null }, onEscape: vi.fn(), ...props }) as ReactElement<{ children: ReactNode[] }>;
    expect(isValidElement(root({}).props.children[0])).toBe(true);
    expect((root({}).props.children[0] as ReactElement).type).toBe((root({ enabled: false, reason: "x" }).props.children[0] as ReactElement).type);
  });
});

test.each([undefined, NO_ROOM_FOR_INSPECTOR])("the inspector action names and describes its availability (%s)", disabled => {
  const nodes = all(BubbleInspectButton({ disabled, button: { current: null }, focused: vi.fn(), onEscape: vi.fn() }));
  const props = button(nodes).props;
  expect(props).toMatchObject({ "data-bubble-action": "inspect", "aria-label": "Show inspector", "aria-controls": INSPECTOR_PANEL_ID, "aria-expanded": false, "data-ui-size": "xs" });
  expect(props["aria-disabled"]).toBe(disabled && true);
  expect(nodes.some(node => (node.type as { displayName?: string }).displayName === "SlidersHorizontal")).toBe(true);
  expect(text(content(nodes).props.children as ReactNode)).toBe(disabled ?? "Show inspector");
  if (disabled) expect(text(nodes.find(node => node.props.id === props["aria-describedby"])!.props.children as ReactNode)).toBe(disabled);
});
