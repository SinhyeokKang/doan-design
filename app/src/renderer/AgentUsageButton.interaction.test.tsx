import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { UsageEntry, UsageWindow } from "../main/agentAuth/usageTypes";

// provider-usage tasks C1: the button's state — subscription, open and refresh reads, the minute tick, rows coming
// and going while open, the last provider leaving, a canvas press and folding — with hooks as plain state
// (AddProjectsPage.interaction.test.tsx style).
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
    useId: () => ":u1:",
  };
});
vi.mock("react-dom", async original => ({ ...await original<typeof import("react-dom")>(), flushSync: (run: () => void) => run() }));
const { AgentUsageButton } = await import("./AgentUsageButton");
type ViewProps = import("./AgentUsageButton").UsageViewProps;

const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const MIN = 60_000;
const win = (over: Partial<UsageWindow> = {}): UsageWindow => ({ id: "five_hour", label: "5-hour", usedPercent: 42, resetsAt: NOW + 130 * MIN, ...over });
const ok = (provider: UsageEntry["provider"], over: Partial<UsageEntry> = {}): UsageEntry => ({ provider, reading: { status: "ok", windows: [win()], readAt: NOW - 30_000 }, inFlight: false, ...over });

let doan: { onAgentUsage: ReturnType<typeof vi.fn>; readAgentUsage: ReturnType<typeof vi.fn> };
let deliver: (entries: UsageEntry[]) => void;
let unsubscribe: ReturnType<typeof vi.fn>;
let observed: (() => void) | null;
beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  unsubscribe = vi.fn(); observed = null;
  doan = {
    onAgentUsage: vi.fn((listener: (entries: UsageEntry[]) => void) => { deliver = listener; return unsubscribe; }),
    readAgentUsage: vi.fn(async () => []),
  };
  vi.stubGlobal("window", { doan });
  vi.stubGlobal("ResizeObserver", class { constructor(run: () => void) { observed = run; } observe() {} disconnect() { observed = null; } });
  vi.stubGlobal("getComputedStyle", () => ({ paddingRight: "8px" }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const openSettings = vi.fn(() => true);
let pressListener: (() => void) | null = null;
const canvasPress = vi.fn((listener: () => void) => { pressListener = listener; return () => { pressListener = null; }; });
// Renders, runs the effects that render scheduled, and renders again until nothing is pending.
function render(): ViewProps | null {
  let view: ReactElement<ViewProps> | null = null;
  for (let pass = 0; pass < 5; pass++) {
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0;
    view = AgentUsageButton({ openSettings, canvasPress }) as ReactElement<ViewProps> | null;
    if (!hooks.pending.length) break;
    for (const run of hooks.pending.splice(0)) run();
  }
  return view?.props ?? null;
}
// The trigger the view would mount, inside a header whose tabs end `modesRight` and whose own right edge is 952.
function mountButton(view: ViewProps, modesRight = 660) {
  const tab = { focus: vi.fn() };
  const header = {
    getBoundingClientRect: () => ({ right: 952 }),
    querySelector: (selector: string) => selector === ".shell-modes" ? { getBoundingClientRect: () => ({ right: modesRight }) } : selector === '.shell-modes [aria-current="page"]' ? tab : null,
  };
  const button = { closest: (selector: string) => selector === "header" ? header : null, isConnected: true, focus: vi.fn() };
  (view.buttonRef as (node: unknown) => void)(button);
  return { header, tab, button };
}
const closeEvent = () => ({ preventDefault: vi.fn() });

test("subscribes to usage once, draws nothing without a provider with usage, and unsubscribes", () => {
  expect(render()).toBeNull();
  expect(doan.onAgentUsage).toHaveBeenCalledOnce();
  deliver([{ provider: "antigravity", inFlight: false }]);
  expect(render()).toBeNull();
  deliver([ok("claude")]);
  expect(render()!.rings.map(ring => ring.provider)).toEqual(["claude"]);
  for (const effect of hooks.effects) effect?.cleanup?.();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

test("opening reads with the open trigger; closing reads nothing", () => {
  deliver = () => {}; render(); deliver([ok("claude"), ok("codex")]);
  let view = render()!;
  expect(view.open).toBe(false);
  view.onOpenChange(true);
  view = render()!;
  expect(view.open).toBe(true);
  expect(doan.readAgentUsage).toHaveBeenCalledWith("open");
  view.onOpenChange(false);
  expect(render()!.open).toBe(false);
  expect(doan.readAgentUsage).toHaveBeenCalledOnce();
});

test("Refresh usage reads with the refresh trigger on every press while the rows keep their values", () => {
  render(); deliver([ok("claude")]);
  let view = render()!; view.onOpenChange(true); view = render()!;
  view.onRefresh(); view.onRefresh();
  expect(doan.readAgentUsage.mock.calls).toEqual([["open"], ["refresh"], ["refresh"]]);
  deliver([ok("claude", { inFlight: true })]);
  view = render()!;
  expect(view.busy).toBe(true);
  expect(view.rows[0]).toMatchObject({ read: "Updating…", windows: [{ text: "42% used · resets in 2h 10m" }] });
});

test("Agent settings closes the popover, keeps Radix from taking focus back and opens Settings > Agents", () => {
  render(); deliver([ok("claude")]);
  let view = render()!; mountButton(view); view.onOpenChange(true); view = render()!;
  view.onSettings();
  view = render()!;
  expect(view.open).toBe(false);
  expect(openSettings).toHaveBeenCalledOnce();
  const event = closeEvent(); view.onCloseAutoFocus(event as unknown as Event);
  expect(event.preventDefault).toHaveBeenCalled();
});

test("Agent settings on a locked page opens nothing and returns focus to the button", () => {
  render(); deliver([ok("claude")]);
  let view = render()!; const { button } = mountButton(view); view.onOpenChange(true); view = render()!;
  const body = {};
  vi.stubGlobal("document", { body, activeElement: body });
  openSettings.mockReturnValueOnce(false);
  view.onSettings();
  view = render()!;
  expect(view.open).toBe(false);
  const event = closeEvent(); view.onCloseAutoFocus(event as unknown as Event);
  expect(button.focus).toHaveBeenCalledOnce();
});

test("redraws when a window's reset time passes while closed, with the delay kept under the timer limit", () => {
  const timeout = vi.spyOn(globalThis, "setTimeout");
  render(); deliver([ok("claude", { reading: { status: "ok", windows: [win({ usedPercent: 95, resetsAt: NOW + 5 * MIN })], readAt: NOW } }), ok("codex", { reading: { status: "ok", windows: [win({ resetsAt: NOW + 30 * 24 * 60 * MIN })], readAt: NOW } })]);
  expect(render()!.rings[0]).toMatchObject({ value: 95, full: true });
  expect(timeout.mock.calls.some(([, delay]) => delay === 5 * MIN)).toBe(true);
  vi.advanceTimersByTime(5 * MIN);
  expect(render()!.rings[0]).toMatchObject({ value: null, full: false });
  // The 30-day window is past setTimeout's 2^31 − 1 ms; an overflowing delay would fire at once and spin.
  expect(timeout.mock.calls.every(([, delay]) => typeof delay !== "number" || delay <= 2 ** 31 - 1)).toBe(true);
  expect(vi.getTimerCount()).toBe(1);
});

// Radix's non-modal popover hands focus back only when nothing was pressed outside; a press on a blank area of the
// window left focus on <body> in the real app (E1). Its close focus runs a tick after the press, so the press's own
// focus is already in place when it is decided.
test("Escape or an outside press on a blank area returns focus to the button", () => {
  const body = {};
  vi.stubGlobal("document", { body, activeElement: body });
  render(); deliver([ok("claude")]);
  let view = render()!; const { button } = mountButton(view); view.onOpenChange(true); view = render()!;
  view.onOpenChange(false); view = render()!;
  const event = closeEvent(); view.onCloseAutoFocus(event as unknown as Event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(button.focus).toHaveBeenCalledOnce();
});

// Focus handed back after a pointer press opened the button's "Agent usage" tooltip under it, and it stayed (E1 review).
// Escape keeps it: a tooltip on a keyboard return is the shared tooltip's own behaviour.
test("focus handed back after an outside press does not open the button's tooltip; after Escape it may", () => {
  const body = {};
  vi.stubGlobal("document", { body, activeElement: body });
  render(); deliver([ok("claude")]);
  let view = render()!; const { button } = mountButton(view); view.onOpenChange(true); view = render()!;
  // As in the DOM, focus() fires the button's focus handler before it returns.
  let focusEvent = closeEvent();
  button.focus.mockImplementation(() => view.onButtonFocus(focusEvent as never));
  view.onPointerDownOutside();
  view.onOpenChange(false); view = render()!;
  view.onCloseAutoFocus(closeEvent() as unknown as Event);
  expect(button.focus).toHaveBeenCalledOnce();
  expect(focusEvent.preventDefault).toHaveBeenCalled();
  const later = closeEvent(); view.onButtonFocus(later as never);
  expect(later.preventDefault).not.toHaveBeenCalled();
  view.onOpenChange(true); view = render()!;
  focusEvent = closeEvent();
  view.onOpenChange(false); view = render()!;
  view.onCloseAutoFocus(closeEvent() as unknown as Event);
  expect(button.focus).toHaveBeenCalledTimes(2);
  expect(focusEvent.preventDefault).not.toHaveBeenCalled();
});

test("an outside press that focused another control keeps focus there", () => {
  const field = {};
  vi.stubGlobal("document", { body: {}, activeElement: field });
  render(); deliver([ok("claude")]);
  let view = render()!; const { button } = mountButton(view); view.onOpenChange(true); view = render()!;
  view.onOpenChange(false); view = render()!;
  const event = closeEvent(); view.onCloseAutoFocus(event as unknown as Event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(button.focus).not.toHaveBeenCalled();
});

test("opening puts focus on the popover body", () => {
  render(); deliver([ok("claude")]);
  const view = render()!;
  const list = { focus: vi.fn() };
  (view.listRef as (node: unknown) => void)(list);
  const event = closeEvent(); view.onOpenAutoFocus(event as unknown as Event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(list.focus).toHaveBeenCalled();
});

test("updates relative times every minute only while open", () => {
  render(); deliver([ok("claude")]);
  let view = render()!;
  vi.advanceTimersByTime(2 * MIN);
  expect(render()!.rows[0]!.read).toBe("Updated 2m ago");
  // One timer waits for the window's reset; the minute tick comes and goes with the popover.
  expect(vi.getTimerCount()).toBe(1);
  view = render()!; view.onOpenChange(true); render();
  expect(vi.getTimerCount()).toBe(2);
  vi.advanceTimersByTime(MIN);
  expect(render()!.rows[0]!.read).toBe("Updated 3m ago");
  view = render()!; view.onOpenChange(false); render();
  expect(vi.getTimerCount()).toBe(1);
});

test("a provider signing out loses its row and one signing in starts at Reading usage…", () => {
  render(); deliver([ok("claude"), ok("codex")]);
  let view = render()!; view.onOpenChange(true); view = render()!;
  deliver([ok("claude")]);
  view = render()!;
  expect(view.rows.map(row => row.provider)).toEqual(["claude"]);
  expect(view.open).toBe(true);
  deliver([ok("claude"), { provider: "copilot", inFlight: true }]);
  view = render()!;
  expect(view.rows.map(row => [row.provider, row.note?.text ?? null])).toEqual([["claude", null], ["copilot", "Reading usage…"]]);
});

test("when the last provider signs out the popover closes and focus goes to the current header tab", () => {
  render(); deliver([ok("claude")]);
  let view = render()!; const { tab } = mountButton(view); view.onOpenChange(true); view = render()!;
  deliver([{ provider: "antigravity", inFlight: false }]);
  expect(render()).toBeNull();
  expect(tab.focus).toHaveBeenCalledOnce();
  deliver([ok("codex")]);
  expect(render()!.open).toBe(false);
});

test("a press in the canvas closes it and keeps focus in the canvas", () => {
  render(); deliver([ok("claude")]);
  let view = render()!; mountButton(view); view.onOpenChange(true); view = render()!;
  expect(pressListener).not.toBeNull();
  pressListener!();
  view = render()!;
  expect(view.open).toBe(false);
  const event = closeEvent(); view.onCloseAutoFocus(event as unknown as Event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(pressListener).toBeNull();
});

test("folds when the header's free end is too narrow for every ring", () => {
  render(); deliver([ok("claude"), ok("codex"), ok("cursor"), ok("copilot")]);
  let view = render()!;
  expect(view.folded).toBe(false);
  mountButton(view, 952 - 8 - 100);
  view = render()!;
  expect(view.folded).toBe(true);
  expect(observed).not.toBeNull();
  (view.buttonRef as (node: unknown) => void)(null);
  expect(observed).toBeNull();
});
