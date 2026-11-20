import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CanvasRow } from "../main/view";
import type { LayoutMessage } from "./canvasMessage";
import { CanvasHeader } from "./CanvasHeader";
import { CanvasViewStore, canvasViewFields, initialCanvasState, type CanvasState } from "./CanvasController";
import { toolShortcut } from "./canvasTool";
import { drawn, keydownOn } from "./drawnTarget.test-support";

// There is no DOM in these tests: the header's parts run as plain functions with their hooks stubbed, and the key
// handlers they draw are called as React would call them.
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useId: () => "id",
  useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
  useState: (value: unknown) => [typeof value === "function" ? (value as () => unknown)() : value, () => {}],
  useRef: (value: unknown) => ({ current: value }),
  useEffect: () => {},
}));

const row: CanvasRow = { path: ".doan/canvases/checkout.html", url: "doan://checkout", width: 1280 };
const frames = ["Cart", "Shipping", "Payment"].map((title, index) => ({ id: title.toLowerCase(), title, x: 0, y: index * 900, width: 1280, height: 800 }));
const layout: LayoutMessage = { type: "layout", href: row.url, height: 2700, viewport: 2700, frames, truncated: false, gotos: [] };
const state: CanvasState = { ...initialCanvasState(), open: { folder: "/repo", canvas: row.path, row }, shown: row.path, status: null, message: "", hasFrame: true, layout, currentFrame: 0, zoom: 64, scale: 0.64 };

type Props = Record<string, unknown> & { children?: ReactNode };
function elements(node: ReactNode): ReactElement<Props>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : []);
}
// Draws one of the header's own parts (FrameDrawer, ZoomControl), which the header leaves as elements.
function part(name: string): Props[] {
  const header = CanvasHeader({ navigation: { card: { key: "/repo", name: "demo", rows: [{ kind: "list", path: "/repo", servedRev: 0, canvases: [row] }] }, root: "/repo", homeDirectory: null, worktree: vi.fn() }, state, view: new CanvasViewStore(canvasViewFields(state)), canvasKey: "k", command: vi.fn(), zoomTo: vi.fn(), selectFrame: vi.fn() });
  const element = elements(header).find(item => typeof item.type === "function" && item.type.name === name);
  if (!element) throw new Error(`Missing ${name}`);
  return elements((element.type as (props: Props) => ReactNode)(element.props)).map(item => item.props);
}
// A key pressed inside an open list bubbles through every handler the part draws, deepest first.
function press(handlers: Props[], key: string, { meta = false } = {}) {
  const target = {};
  const event = { key, code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key, target, currentTarget: target, metaKey: meta, ctrlKey: false, altKey: false, shiftKey: false,
    defaultPrevented: false, preventDefault: vi.fn(() => { event.defaultPrevented = true; }), stopPropagation: vi.fn() };
  for (const props of [...handlers].reverse()) if (typeof props.onKeyDown === "function") props.onKeyDown(event);
  return event;
}

// PRODUCT §5 item 2 'Canvas header': while the frame drawer or the zoom menu is open every printable key without a
// modifier is the list's, so V and H never switch the tool from there.
describe("an open header list keeps the printable keys", () => {
  it("the frame drawer takes V and H though no frame starts with them, as the Play drawer does", () => {
    const listbox = part("FrameDrawer").filter(props => props.role === "listbox");
    expect(listbox).toHaveLength(1);
    for (const key of ["v", "h", "V", "ㅍ"]) expect(press(listbox, key).preventDefault, key).toHaveBeenCalled();
    expect(press(listbox, "s").preventDefault).toHaveBeenCalled();
    expect(press(listbox, "h", { meta: true }).preventDefault).not.toHaveBeenCalled();
  });

  it("V, H and Space pressed in the open drawer or zoom menu are never tool keys; on − and + they stay the canvas's", () => {
    const drawer = part("FrameDrawer");
    const drawerContent = drawer.find(props => String(props.className).includes("doan-frame-list"))!;
    const zoom = part("ZoomControl");
    const zoomContent = zoom.find(props => String(props.className).includes("doan-zoom-menu"))!;
    // Radix draws role="menu" on the menu's content and menuitem on each item.
    for (const chain of [[drawerContent, { role: "listbox" }, { role: "option" }], [{ ...zoomContent, role: "menu" }, { role: "menuitem" }]]) {
      for (const code of ["KeyV", "KeyH", "Space"]) expect(toolShortcut(keydownOn(code, drawn(chain)), { canvasPage: true }), `${String(chain[0]!.className)} ${code}`).toBeNull();
    }
    const zoomOut = zoom.find(props => props["aria-label"] === "Zoom out")!;
    expect(toolShortcut(keydownOn("KeyH", drawn([zoom[0]!, zoomOut])), { canvasPage: true })).toEqual({ kind: "tool", tool: "hand" });
  });
});
