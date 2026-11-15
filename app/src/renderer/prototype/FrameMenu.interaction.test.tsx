import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PrototypeView } from "../../main/prototype/ipc";
import type { ShellProps } from "./PrototypeWindow";

// The prototype window's frame name menu with hooks as plain state (UpdateHeaderButton.interaction.test.tsx style):
// its tooltip while the name is cut short, and the header drag region while the menu is open.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as ({ deps: unknown[] | undefined; cleanup?: () => void } | undefined)[],
  pending: [] as (() => void)[], cursor: 0, refCursor: 0, effectCursor: 0,
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const effect = (run: () => unknown, deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
    const slot: { deps: unknown[] | undefined; cleanup?: () => void } = { deps };
    hooks.effects[index] = slot;
    hooks.pending.push(() => { previous?.cleanup?.(); const cleanup = run(); if (typeof cleanup === "function") slot.cleanup = cleanup as () => void; });
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next; }];
    },
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: effect, useLayoutEffect: effect,
  };
});
const { WindowShell } = await import("./PrototypeWindow");
const { Tooltip } = await import("../components/ui/tooltip");

type El = ReactElement<Record<string, unknown>>;
function all(node: ReactNode): El[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...all(node.props.children as ReactNode)];
}

const view = { gen: 2, root: "/r", path: ".doan/canvases/a.html", frame: "checkout", title: "Checkout", canvas: "Checkout flow", phase: "ready", mode: "fit", run: { url: "u", markWidth: 390, markHeight: 844 }, frames: [{ id: "checkout", title: "Checkout", size: "390x844", number: 1 }], gotos: [], canGoBack: false, canGoForward: false, previousStopped: false, panel: { open: false, width: null }, canvasRow: "present" } as unknown as PrototypeView;
const noop = () => {};

// The header the name sits in, and the name's text, whose widths say whether it is cut short.
let bar: { style: { setProperty: ReturnType<typeof vi.fn>; removeProperty: ReturnType<typeof vi.fn> } };
const text = { scrollWidth: 100, clientWidth: 100 };
let resized: (() => void) | null = null;
const name = { current: { closest: (selector: string) => selector === "header" ? bar : null } };

function render(open: boolean): { tip: El } {
  const props = { view, layers: { frames: [], visible: null, snapshot: null }, readingShown: false, details: false, live: "", width: 640, menuOpen: open, exporting: false, name,
    onBack: noop, onExport: noop, onForward: noop, onReload: noop, onReloadPress: noop, onReloadClick: noop, onMode: noop, onMenuOpen: noop, onChoose: noop, onClose: noop, onDetails: noop } as unknown as ShellProps;
  const menu = all(WindowShell(props) as El).find(element => typeof element.type === "function" && element.type.name === "FrameMenu")!;
  let rendered: El[] = [];
  for (let pass = 0; pass < 5; pass++) {
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0;
    rendered = all((menu.type as (props: unknown) => ReactNode)(menu.props));
    const span = rendered.find(element => element.props.className === "pw-name-text")!;
    (span.props.ref as { current: unknown }).current = text;
    if (!hooks.pending.length) break;
    for (const run of hooks.pending.splice(0)) run();
  }
  return { tip: rendered.find(element => element.type === Tooltip)! };
}

beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  bar = { style: { setProperty: vi.fn(), removeProperty: vi.fn() } };
  text.scrollWidth = 100; text.clientWidth = 100; resized = null;
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resized = callback; } observe() {} disconnect() {} });
});
afterEach(() => { vi.unstubAllGlobals(); });

// A hover while the name was cut short must not come back by itself once the name is cut again: the tooltip's own
// state closes when the name fits, not only its shown value.
test("the name's tooltip does not reopen by itself when the name is cut short again", () => {
  text.scrollWidth = 200;
  let { tip } = render(false);
  (tip.props.onOpenChange as (open: boolean) => void)(true);
  expect(render(false).tip.props.open).toBe(true);
  text.scrollWidth = 100; resized!();
  expect(render(false).tip.props.open).toBe(false);
  text.scrollWidth = 200; resized!();
  ({ tip } = render(false));
  expect(tip.props.open).toBe(false);
});

test("the name's tooltip opens only while the name is cut short", () => {
  const { tip } = render(false);
  (tip.props.onOpenChange as (open: boolean) => void)(true);
  expect(render(false).tip.props.open).toBe(false);
});

// The header is a window drag region, whose presses never reach the page: while the menu is open the header takes
// presses, so one on its empty part closes the menu.
test("the open frame menu holds the header out of the drag region until it closes", () => {
  render(false);
  expect(bar.style.setProperty).not.toHaveBeenCalled();
  render(true);
  expect(bar.style.setProperty).toHaveBeenCalledExactlyOnceWith("-webkit-app-region", "no-drag");
  expect(bar.style.removeProperty).not.toHaveBeenCalled();
  render(false);
  expect(bar.style.removeProperty).toHaveBeenCalledExactlyOnceWith("-webkit-app-region");
});
