import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { UsageEntry, UsageWindow } from "../main/agentAuth/usageTypes";

// The ring's state (drawer reads, focus on close, the tooltip, the usage row going while open, the ring going) with hooks
// as plain state.
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
    useId: () => ":r1:",
  };
});
vi.mock("react-dom", async original => ({ ...await original<typeof import("react-dom")>(), flushSync: (run: () => void) => run() }));
const { ContextRing } = await import("./ContextRing");
type ViewProps = import("./ContextRing").ContextRingViewProps;
type RingProps = Parameters<typeof ContextRing>[0];

const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);
const MIN = 60_000;
const CONTEXT = { value: 42, percent: 42, used: 84_000, size: 200_000 };
const win = (over: Partial<UsageWindow> = {}): UsageWindow => ({ id: "five_hour", label: "5h", usedPercent: 38, resetsAt: NOW + 130 * MIN, ...over });
const claude: UsageEntry = { provider: "claude", reading: { status: "ok", windows: [win()], readAt: NOW - 2 * MIN }, inFlight: false };

let read: ReturnType<typeof vi.fn<(trigger: "open" | "refresh") => void>>;
let onLost: ReturnType<typeof vi.fn<() => void>>;
let entries: UsageEntry[];
let hidden: boolean;
let pressListener: (() => void) | null;
const canvasPress = vi.fn((listener: () => void) => { pressListener = listener; return () => { pressListener = null; }; });
// What document.activeElement is; null stands for <body>.
let active: unknown;
const page = { body: { id: "body" } };
// The window's header, a drag region whose presses never reach the page.
let header: { style: { declared: Map<string, string>; setProperty(name: string, value: string): void; removeProperty(name: string): void } };
beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  read = vi.fn<(trigger: "open" | "refresh") => void>(); onLost = vi.fn<() => void>(); entries = [claude]; hidden = false; pressListener = null; active = page.body;
  header = { style: { declared: new Map<string, string>(), setProperty(name: string, value: string) { this.declared.set(name, value); }, removeProperty(name: string) { this.declared.delete(name); } } };
  vi.stubGlobal("document", { get body() { return page.body; }, get activeElement() { return active; }, querySelector: (selector: string) => selector === "header.top" ? header : null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function render(over: Partial<RingProps> = {}): ViewProps {
  let view: ReactElement<ViewProps> | null = null;
  for (let pass = 0; pass < 5; pass++) {
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0;
    view = ContextRing({ context: CONTEXT, provider: "claude", usage: { entries, hidden, read }, canvasPress, onLost, ...over }) as ReactElement<ViewProps>;
    if (!hooks.pending.length) break;
    for (const run of hooks.pending.splice(0)) run();
  }
  return view!.props;
}
function unmount(): void {
  for (const effect of hooks.effects) effect?.cleanup?.();
}
// The elements the view would mount; focus() moves document.activeElement there, as the browser does.
function mount(view: ViewProps) {
  const element = (name: string) => { const node = { name, focus: vi.fn(() => { active = node; }), contains: (other: unknown) => other === node }; return node; };
  const button = element("button"), body = element("body-region"), refresh = element("refresh");
  const content = { contains: (other: unknown) => other === body || other === refresh };
  view.buttonRef(button as unknown as HTMLButtonElement);
  view.bodyRef(body as unknown as HTMLDivElement);
  view.contentRef(content as unknown as HTMLDivElement);
  return { button, body, refresh };
}
const prevented = () => ({ preventDefault: vi.fn() });
const focusEvent = (keyboard: boolean) => ({ preventDefault: vi.fn(), currentTarget: { matches: (selector: string) => selector === ":focus-visible" && keyboard } });
function opened(over: Partial<RingProps> = {}) {
  let view = render(over);
  const nodes = mount(view);
  view.onOpenChange(true);
  view = render(over);
  view.onOpenAutoFocus(prevented() as unknown as Event);
  return { view: render(over), ...nodes };
}

test("opening reads with the open trigger, moves focus to the body and hides the tooltip", () => {
  let view = render();
  view.onTipChange(true);
  expect(render().tip).toBe(true);
  const { body } = mount(view);
  view.onOpenChange(true);
  view = render();
  expect(view.open).toBe(true);
  expect(view.tip).toBe(false);
  expect(read.mock.calls).toEqual([["open"]]);
  const event = prevented();
  view.onOpenAutoFocus(event as unknown as Event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(body.focus).toHaveBeenCalledOnce();
  // A hover while it is open asks for the tooltip in vain.
  view.onTipChange(true);
  expect(render().tip).toBe(false);
});

test("Refresh reads with the refresh trigger on every press", () => {
  const { view } = opened();
  view.onRefresh(); view.onRefresh();
  expect(read.mock.calls).toEqual([["open"], ["refresh"], ["refresh"]]);
});

test("a drawer without a usage row reads nothing on open", () => {
  hidden = true;
  opened();
  entries = [];
  hidden = false;
  opened();
  expect(read).not.toHaveBeenCalled();
});

test("Escape returns focus to the ring, whose tooltip stays shut for that focus and opens on the next hover", () => {
  const { view, button } = opened();
  view.onEscapeKeyDown();
  view.onOpenChange(false);
  let after = render();
  expect(after.open).toBe(false);
  const event = prevented();
  after.onCloseAutoFocus(event as unknown as Event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(button.focus).toHaveBeenCalledOnce();
  after = render();
  const focus = focusEvent(true);
  after.onButtonFocus(focus as never);
  // The tooltip trigger's own focus handler runs after this one and skips a prevented event.
  expect(focus.preventDefault).toHaveBeenCalled();
  after = render();
  expect(after.tip).toBe(false);
  after.onTipChange(true);
  expect(render().tip).toBe(true);
});

test("a keyboard focus after the returned one opens the tooltip", () => {
  const { view } = opened();
  view.onEscapeKeyDown(); view.onOpenChange(false);
  let after = render();
  after.onCloseAutoFocus(prevented() as unknown as Event);
  after = render(); after.onButtonFocus(focusEvent(true) as never);
  after = render(); after.onTipChange(false);
  after = render(); after.onButtonFocus(focusEvent(true) as never);
  expect(render().tip).toBe(true);
  // A pointer press's focus asks for nothing.
  render().onTipChange(false);
  render().onButtonFocus(focusEvent(false) as never);
  expect(render().tip).toBe(false);
});

test("an outside press on a blank part returns focus to the ring; one that focused a control leaves it there", () => {
  let nodes = opened();
  nodes.view.onPointerDownOutside(); nodes.view.onOpenChange(false);
  // The drawer that held focus is gone by now, so focus is on the page body.
  active = page.body;
  render().onCloseAutoFocus(prevented() as unknown as Event);
  expect(nodes.button.focus).toHaveBeenCalledOnce();

  hooks.states = []; hooks.refs = []; hooks.effects = [];
  nodes = opened();
  nodes.view.onPointerDownOutside(); nodes.view.onOpenChange(false);
  const other = { name: "permission" };
  active = other;
  render().onCloseAutoFocus(prevented() as unknown as Event);
  expect(nodes.button.focus).not.toHaveBeenCalled();
  expect(active).toBe(other);
  // That later keyboard focus on the ring is not held back.
  render().onButtonFocus(focusEvent(true) as never);
  expect(render().tip).toBe(true);
});

test("a press in the canvas closes the drawer and moves no focus", () => {
  const { button } = opened();
  expect(canvasPress).toHaveBeenCalled();
  pressListener!();
  const view = render();
  expect(view.open).toBe(false);
  expect(pressListener).toBeNull();
  view.onCloseAutoFocus(prevented() as unknown as Event);
  expect(button.focus).not.toHaveBeenCalled();
});

test("a sign-out while open drops the row and keeps the drawer, moving focus from Refresh to the body", () => {
  const { view, body, refresh } = opened();
  refresh.focus();
  view.onRefreshFocus(true);
  body.focus.mockClear();
  entries = [];
  const after = render();
  expect(after.open).toBe(true);
  expect(after.view.usage).toBeNull();
  expect(body.focus).toHaveBeenCalledOnce();
});

test("the usage row going leaves focus that was not on Refresh where it is", () => {
  const { body } = opened();
  body.focus.mockClear();
  entries = [];
  expect(render().open).toBe(true);
  expect(body.focus).not.toHaveBeenCalled();
});

test("the drawer's values follow a new context value and a reset passing while open", () => {
  entries = [{ ...claude, reading: { status: "ok", windows: [win({ usedPercent: 100, limited: true, resetsAt: NOW + MIN })], readAt: NOW - MIN }, inFlight: false }];
  const { view } = opened();
  expect(view.view.usage!.windows[0]!.limited).toBe(true);
  expect(render({ context: { value: 78, percent: 78, used: 156_000, size: 200_000 } }).view.context.text).toBe("78% used · 156K of 200K");
  vi.advanceTimersByTime(MIN + 1);
  expect(render().view.usage!.windows[0]!.limited).toBe(false);
});

test("the ring going with focus inside the drawer sends focus to the composer input", () => {
  const { body } = opened();
  body.focus();
  unmount();
  expect(onLost).toHaveBeenCalledOnce();
});

test("the ring going with focus elsewhere moves nothing, and a later close hands no focus back", () => {
  const { view, button } = opened();
  active = { name: "composer field" };
  unmount();
  expect(onLost).not.toHaveBeenCalled();
  // Radix's unmount focus return still calls the close handler after the ring is gone.
  const event = prevented();
  view.onCloseAutoFocus(event as unknown as Event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(button.focus).not.toHaveBeenCalled();
});

test("a closed ring going calls nothing", () => {
  const view = render();
  mount(view);
  unmount();
  expect(onLost).not.toHaveBeenCalled();
});

// POSTMORTEM 2026-11-06: a press on the header's empty part (a window drag region) never reaches the page, so the
// header takes presses while the drawer is open, as it does for the header's own popovers.
test("the window header stops dragging while the drawer is open, and drags again once it closes or the ring goes", () => {
  const { view } = opened();
  expect(header.style.declared.get("-webkit-app-region")).toBe("no-drag");
  view.onOpenChange(false);
  render();
  expect(header.style.declared.has("-webkit-app-region")).toBe(false);
  render().onOpenChange(true);
  render();
  expect(header.style.declared.get("-webkit-app-region")).toBe("no-drag");
  unmount();
  expect(header.style.declared.has("-webkit-app-region")).toBe(false);
});

// Escape on a focused Refresh unmounts it without a blur, so its focus would outlive the drawer; the next open
// without a row must not take it for a Refresh that just went.
test("a Refresh focus left from an earlier opening does not move focus on the next one", () => {
  const { view, body, refresh } = opened();
  refresh.focus();
  view.onRefreshFocus(true);
  view.onEscapeKeyDown(); view.onOpenChange(false);
  render().onCloseAutoFocus(prevented() as unknown as Event);
  entries = [];
  body.focus.mockClear();
  render().onOpenChange(true);
  const reopened = render();
  expect(reopened.open).toBe(true);
  expect(body.focus).not.toHaveBeenCalled();
  reopened.onOpenAutoFocus(prevented() as unknown as Event);
  expect(body.focus).toHaveBeenCalledOnce();
});
