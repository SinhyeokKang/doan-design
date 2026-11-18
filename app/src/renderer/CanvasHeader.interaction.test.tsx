import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CanvasRow } from "../main/view";
import type { LayoutMessage } from "./canvasMessage";
import { CanvasHeader } from "./CanvasHeader";
import { CanvasViewStore, canvasViewFields, initialCanvasState, type CanvasState } from "./CanvasController";

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
  const header = CanvasHeader({ state, view: new CanvasViewStore(canvasViewFields(state)), canvasKey: "k", command: vi.fn(), zoomTo: vi.fn(), selectFrame: vi.fn() });
  const element = elements(header).find(item => typeof item.type === "function" && item.type.name === name);
  if (!element) throw new Error(`Missing ${name}`);
  return elements((element.type as (props: Props) => ReactNode)(element.props)).map(item => item.props);
}
// A key pressed inside an open list (or outside it) bubbles through every handler the part draws, deepest first.
function press(handlers: Props[], key: string, { inside = true, meta = false } = {}) {
  const target = { closest: () => inside ? {} : null };
  const event = { key, code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key, target, currentTarget: target, metaKey: meta, ctrlKey: false, altKey: false, shiftKey: false,
    defaultPrevented: false, preventDefault: vi.fn(() => { event.defaultPrevented = true; }), stopPropagation: vi.fn() };
  for (const props of [...handlers].reverse()) if (typeof props.onKeyDown === "function") props.onKeyDown(event);
  return event;
}

// PRODUCT §5 item 2 'Canvas header': while the frame drawer or the zoom menu is open every printable key without a
// modifier is the list's, so V and H (window shortcuts that skip prevented keys) never switch the tool from there.
describe("an open header list keeps the printable keys", () => {
  it("the frame drawer takes V and H though no frame starts with them, as the Play drawer does", () => {
    const listbox = part("FrameDrawer").filter(props => props.role === "listbox");
    expect(listbox).toHaveLength(1);
    for (const key of ["v", "h", "V", "ㅍ"]) expect(press(listbox, key).preventDefault, key).toHaveBeenCalled();
    expect(press(listbox, "s").preventDefault).toHaveBeenCalled();
    expect(press(listbox, "h", { meta: true }).preventDefault).not.toHaveBeenCalled();
  });

  it("the zoom menu takes V, H and other printable keys pressed inside it, and leaves the rest", () => {
    const zoom = part("ZoomControl");
    for (const key of ["v", "h", "f", "1"]) expect(press(zoom, key).preventDefault, key).toHaveBeenCalled();
    expect(press(zoom, "h", { meta: true }).preventDefault).not.toHaveBeenCalled();
    expect(press(zoom, "ArrowDown").preventDefault).not.toHaveBeenCalled();
    // On the − and + buttons and the closed trigger the keys stay the window's.
    expect(press(zoom, "h", { inside: false }).preventDefault).not.toHaveBeenCalled();
  });
});
