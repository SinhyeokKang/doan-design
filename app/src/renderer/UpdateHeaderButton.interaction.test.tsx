import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { UpdateSnapshot, UpdateState } from "../main/update/types";

// The header's update button with hooks as plain state (AgentUsageButton.interaction.test.tsx style): the push
// subscription, a press asking main at press time, the popover a blocked answer, the menu or a stopped restart opens.
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
const { UpdateHeaderButton } = await import("./UpdateHeaderButton");
const { holdHeaderNoDrag } = await import("./headerNoDrag");
type ViewProps = import("./UpdateHeaderButton").UpdateHeaderButtonViewProps;

const snap = (state: UpdateState, over: Partial<UpdateSnapshot> = {}): UpdateSnapshot =>
  ({ version: "0.1.0", state, eligibility: { kind: "enabled" }, gate: { kind: "allowed" }, autoCheck: true, lastCheckedAt: null, ...over });
const READY: UpdateState = { kind: "ready", version: "0.1.1" };
const BLOCKED = { title: "Can’t restart yet", text: "A conversation is running or waiting for your answer. Restart after it finishes, or Doan updates when you quit." };
const STOPPED = { title: "Couldn’t restart Doan.", text: "Try again, or quit and open it again." };
const READY_TO_RESTART = { title: "Ready to restart", text: "No conversation is running or waiting anymore. Restart now, or Doan updates when you quit." };
const GATE_BLOCKED = { gate: { kind: "blocked", reason: "conversation" } } as const;

let doan: Record<string, ReturnType<typeof vi.fn>>;
let push: (snapshot: UpdateSnapshot) => void;
let menuPopover: () => void;
let unsubscribe: ReturnType<typeof vi.fn>, unsubscribePopover: ReturnType<typeof vi.fn>;
beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  unsubscribe = vi.fn(); unsubscribePopover = vi.fn();
  doan = {
    onUpdate: vi.fn((listener: (snapshot: UpdateSnapshot) => void) => { push = listener; return unsubscribe; }),
    onUpdatePopover: vi.fn((listener: () => void) => { menuPopover = listener; return unsubscribePopover; }),
    installUpdate: vi.fn(async () => ({ kind: "allowed" })),
  };
  vi.stubGlobal("window", { doan });
  vi.stubGlobal("document", { activeElement: null, body: {} });
});
afterEach(() => { vi.unstubAllGlobals(); });

let disabled = false;
let pressListener: (() => void) | null = null;
const canvasPress = vi.fn((listener: () => void) => { pressListener = listener; return () => { pressListener = null; }; });
// The button as mounted: in the shown header, or in a hidden screen's header under [inert].
let inert = false;
// The header the button sits in; null for the tests that don't look at its drag region.
let bar: HTMLElement | null = null;
const node = { closest: (selector: string) => selector === "[inert]" && inert ? {} : selector === "header" ? bar : null, focus: vi.fn() };
function render(): ViewProps {
  let view: ReactElement<ViewProps> | null = null;
  for (let pass = 0; pass < 5; pass++) {
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0;
    view = UpdateHeaderButton({ disabled, canvasPress }) as ReactElement<ViewProps>;
    if (view.props.header !== null) view.props.buttonRef(node as unknown as HTMLButtonElement);
    if (!hooks.pending.length) break;
    for (const run of hooks.pending.splice(0)) run();
  }
  return view!.props;
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
beforeEach(() => { disabled = false; pressListener = null; inert = false; bar = null; });

test("subscribes to the update push and the menu's popover once, shows nothing until ready, and unsubscribes", () => {
  expect(render().header).toBeNull();
  expect(doan.onUpdate).toHaveBeenCalledOnce();
  expect(doan.onUpdatePopover).toHaveBeenCalledOnce();
  push(snap({ kind: "upToDate", manual: false }));
  expect(render().header).toBeNull();
  push(snap(READY));
  expect(render().header).toMatchObject({ label: "Restart to Update", tooltip: "Doan 0.1.1 is ready" });
  for (const effect of hooks.effects) effect?.cleanup?.();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(unsubscribePopover).toHaveBeenCalledOnce();
});

// The gate is read when the button is pressed, not from the last push (a conversation may have started since).
test("a press asks main to restart; an allowed answer opens nothing, a blocked one opens the reason", async () => {
  render(); push(snap(READY));
  let view = render();
  view.onPress();
  expect(doan.installUpdate).toHaveBeenCalledOnce();
  await flush(); view = render();
  expect(view.open).toBe(false);
  doan.installUpdate!.mockResolvedValueOnce({ kind: "blocked", reason: "conversation" });
  view.onPress(); await flush(); view = render();
  expect(view.open).toBe(true);
  expect(view.shown).toEqual(BLOCKED);
  view.onOpenChange(false); view = render();
  expect(view.open).toBe(false);
});

test("a press while disabled or restarting asks nothing", () => {
  render(); push(snap(READY));
  disabled = true;
  render().onPress();
  disabled = false;
  push(snap({ kind: "restarting", version: "0.1.1" }));
  render().onPress();
  expect(doan.installUpdate).not.toHaveBeenCalled();
});

test("the Doan menu's blocked Restart to Update opens the reason", () => {
  render(); push(snap(READY, { gate: { kind: "blocked", reason: "conversation" } })); render();
  menuPopover();
  const view = render();
  expect(view.open).toBe(true);
  expect(view.shown).toEqual(BLOCKED);
});

test("the menu's popover opens nothing without an update to restart into", () => {
  render(); push(snap({ kind: "idle" }));
  menuPopover();
  expect(render().open).toBe(false);
});

// A stopped restart says so under the button on its own, without taking focus; a press restarts again.
test("a restart that stops opens the stopped line quietly, and a press restarts again", async () => {
  render(); push(snap({ kind: "restarting", version: "0.1.1" })); render();
  push(snap({ kind: "restartAborted", version: "0.1.1" }));
  let view = render();
  expect(view.open).toBe(true);
  expect(view.shown).toEqual(STOPPED);
  const focusEvent = { preventDefault: vi.fn() };
  view.onOpenAutoFocus(focusEvent as unknown as Event);
  expect(focusEvent.preventDefault).toHaveBeenCalled();
  view.onPress(); await flush();
  expect(doan.installUpdate).toHaveBeenCalledOnce();
  // The press-opened blocked popover takes focus, so a reader hears it.
  doan.installUpdate!.mockResolvedValueOnce({ kind: "blocked", reason: "conversation" });
  view = render(); view.onOpenChange(false); view = render();
  view.onPress(); await flush(); view = render();
  expect(view.shown).toEqual(BLOCKED);
  const pressFocus = { preventDefault: vi.fn() };
  view.onOpenAutoFocus(pressFocus as unknown as Event);
  expect(pressFocus.preventDefault).not.toHaveBeenCalled();
});

test("a renderer that first sees a stopped restart does not open it", () => {
  render(); push(snap({ kind: "restartAborted", version: "0.1.1" }));
  expect(render().open).toBe(false);
});

test("the popover closes when the update leaves the header, and on a press in the canvas", () => {
  render(); push(snap(READY, { gate: { kind: "blocked", reason: "conversation" } })); render();
  menuPopover(); expect(render().open).toBe(true);
  pressListener!();
  expect(render().open).toBe(false);
  menuPopover(); expect(render().open).toBe(true);
  push(snap({ kind: "restarting", version: "0.1.1" }));
  expect(render().open).toBe(false);
});

// (real app, 2026-11-08): the hidden workspace keeps its header mounted under [inert]; the menu's popover opened in
// both headers and each closed the other at once, so none stayed open.
test("only the shown header opens a popover nobody pressed for", () => {
  inert = true;
  render(); push(snap(READY, { gate: { kind: "blocked", reason: "conversation" } })); render();
  menuPopover();
  expect(render().open).toBe(false);
  push(snap({ kind: "restarting", version: "0.1.1" })); render();
  push(snap({ kind: "restartAborted", version: "0.1.1" }));
  expect(render().open).toBe(false);
});

// Main holds a restart a conversation started during the staging wait: the state goes back to ready, blocked.
test("a restart held back by a conversation opens the reason quietly", () => {
  render(); push(snap({ kind: "restarting", version: "0.1.1" })); render();
  push(snap(READY, { gate: { kind: "blocked", reason: "conversation" } }));
  const view = render();
  expect(view.open).toBe(true);
  expect(view.shown).toEqual(BLOCKED);
  const focusEvent = { preventDefault: vi.fn() };
  view.onOpenAutoFocus(focusEvent as unknown as Event);
  expect(focusEvent.preventDefault).toHaveBeenCalled();
});

// A restart this button started is the person's own: when it stops or is held, its popover takes focus so a
// keyboard or screen reader user hears why. One started elsewhere (the menu, About) opens quietly.
test("a restart pressed here that stops or is held opens with focus; one started elsewhere opens quietly", async () => {
  render(); push(snap(READY)); let view = render();
  view.onPress(); await flush();
  push(snap({ kind: "restarting", version: "0.1.1" })); render();
  push(snap({ kind: "restartAborted", version: "0.1.1" })); view = render();
  expect(view.shown).toEqual(STOPPED);
  const stopped = { preventDefault: vi.fn() };
  view.onOpenAutoFocus(stopped as unknown as Event);
  expect(stopped.preventDefault).not.toHaveBeenCalled();
  view.onOpenChange(false); view = render();
  view.onPress(); await flush();
  push(snap({ kind: "restarting", version: "0.1.1" })); render();
  push(snap(READY, { gate: { kind: "blocked", reason: "conversation" } })); view = render();
  expect(view.shown).toEqual(BLOCKED);
  const held = { preventDefault: vi.fn() };
  view.onOpenAutoFocus(held as unknown as Event);
  expect(held.preventDefault).not.toHaveBeenCalled();
  // Started from the menu: this button was never pressed for it.
  view.onOpenChange(false); view = render();
  push(snap({ kind: "restarting", version: "0.1.1" })); render();
  push(snap({ kind: "restartAborted", version: "0.1.1" })); view = render();
  const quiet = { preventDefault: vi.fn() };
  view.onOpenAutoFocus(quiet as unknown as Event);
  expect(quiet.preventDefault).toHaveBeenCalled();
});

// A quiet popover can open beside Agent usage's open one (PRODUCT §5 item 0: closing one keeps the other usable). When
// Agent usage's last provider leaves, its popover closes and moves focus to the page tab: that focus never left this
// popover, so it stays open. Focus that leaves this popover still closes it.
test("only focus leaving the popover closes it; a focus move elsewhere keeps a quiet popover open", () => {
  render(); push(snap({ kind: "restarting", version: "0.1.1" })); render();
  push(snap({ kind: "restartAborted", version: "0.1.1" })); const view = render();
  expect(view.shown).toEqual(STOPPED);
  const inside = { name: "popover text" }, usage = { name: "Agent usage's list" };
  view.contentRef({ contains: (node: unknown) => node === inside } as unknown as HTMLDivElement);
  const moved = (from: unknown) => ({ detail: { originalEvent: { relatedTarget: from } }, preventDefault: vi.fn() });
  for (const from of [usage, null]) {
    const event = moved(from);
    view.onFocusOutside(event as unknown as Parameters<ViewProps["onFocusOutside"]>[0]);
    expect(event.preventDefault, `from ${String((from as { name?: string } | null)?.name)}`).toHaveBeenCalled();
  }
  const left = moved(inside);
  view.onFocusOutside(left as unknown as Parameters<ViewProps["onFocusOutside"]>[0]);
  expect(left.preventDefault).not.toHaveBeenCalled();
});

test("closing hands focus back to the button only when it would land on the body", () => {
  render(); push(snap(READY)); const view = render();
  const body = {};
  vi.stubGlobal("document", { activeElement: body, body });
  node.focus.mockClear();
  const event = { preventDefault: vi.fn() };
  view.onCloseAutoFocus(event as unknown as Event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(node.focus).toHaveBeenCalledOnce();
  vi.stubGlobal("document", { activeElement: { tagName: "TEXTAREA" }, body });
  node.focus.mockClear();
  view.onCloseAutoFocus({ preventDefault: vi.fn() } as unknown as Event);
  expect(node.focus).not.toHaveBeenCalled();
});

// The popover follows each push while open instead of keeping the words it opened with (draft frame popover-unblocked).
test("a popover open on a blocked press says it can restart once nothing blocks it, and stays open", async () => {
  render(); push(snap(READY, GATE_BLOCKED)); let view = render();
  doan.installUpdate!.mockResolvedValueOnce({ kind: "blocked", reason: "conversation" });
  view.onPress(); await flush(); view = render();
  expect(view.shown).toEqual(BLOCKED);
  push(snap(READY)); view = render();
  expect(view.open).toBe(true);
  expect(view.shown).toEqual(READY_TO_RESTART);
  // A press now restarts.
  view.onPress(); await flush();
  expect(doan.installUpdate).toHaveBeenCalledTimes(2);
  // Blocked again while still open: the reason comes back.
  push(snap(READY, GATE_BLOCKED)); view = render();
  expect(view.shown).toEqual(BLOCKED);
});

// Draft frame popover-stopped-blocked: the gate is why a press would fail now, so it ranks first, as header() gives it.
test("a stopped restart's popover takes the blocking reason while open, and goes back when it ends", () => {
  render(); push(snap({ kind: "restarting", version: "0.1.1" })); render();
  push(snap({ kind: "restartAborted", version: "0.1.1" })); let view = render();
  expect(view.shown).toEqual(STOPPED);
  push(snap({ kind: "restartAborted", version: "0.1.1" }, GATE_BLOCKED)); view = render();
  expect(view.open).toBe(true);
  expect(view.shown).toEqual(BLOCKED);
  push(snap({ kind: "restartAborted", version: "0.1.1" })); view = render();
  expect(view.shown).toEqual(STOPPED);
});

// A blocked answer can arrive before the push that carries the gate; the opening words hold until the next push.
test("the words a press opened with hold until the next push", async () => {
  render(); push(snap(READY)); let view = render();
  doan.installUpdate!.mockResolvedValueOnce({ kind: "blocked", reason: "conversation" });
  view.onPress(); await flush(); view = render(); view = render();
  expect(view.shown).toEqual(BLOCKED);
});

test("a closed popover stays closed through pushes, and goes when the update leaves the header", () => {
  render(); push(snap(READY, GATE_BLOCKED)); render();
  push(snap(READY)); expect(render().open).toBe(false);
  push(snap(READY, GATE_BLOCKED)); expect(render().open).toBe(false);
  menuPopover(); expect(render().open).toBe(true);
  push(snap({ kind: "failed", code: "installFailed", stage: "install", version: "0.1.1" }));
  let view = render();
  expect(view.open).toBe(false);
  expect(view.header).toBeNull();
  push(snap(READY, GATE_BLOCKED)); view = render();
  expect(view.open).toBe(false);
  menuPopover(); expect(render().open).toBe(true);
  push(snap({ kind: "idle" }));
  expect(render().open).toBe(false);
});

// The header the popover opens under, with the inline drag region it sets (POSTMORTEM 2026-11-06).
function header() {
  const declared = new Map<string, string>();
  const style = { setProperty: (name: string, value: string) => { declared.set(name, value); }, removeProperty: (name: string) => { declared.delete(name); } };
  bar = { style } as unknown as HTMLElement;
  return () => declared.get("-webkit-app-region") ?? "";
}

test("the header is no-drag while the popover is open, and drags again once it closes", () => {
  const region = header();
  render(); push(snap(READY, GATE_BLOCKED)); render();
  expect(region()).toBe("");
  menuPopover(); render();
  expect(region()).toBe("no-drag");
  render().onOpenChange(false); render();
  expect(region()).toBe("");
});

// Agent usage's popover open under the same header keeps it no-drag after this one closes, in either order.
test("closing this popover while Agent usage's is open keeps the header no-drag", () => {
  const region = header();
  render(); push(snap(READY, GATE_BLOCKED)); render();
  menuPopover(); render();
  const usage = holdHeaderNoDrag(bar!, {});
  render().onOpenChange(false); render();
  expect(region()).toBe("no-drag");
  usage();
  expect(region()).toBe("");
  const again = holdHeaderNoDrag(bar!, {});
  menuPopover(); render();
  again();
  expect(region()).toBe("no-drag");
  render().onOpenChange(false); render();
  expect(region()).toBe("");
});

test("the popover closing because its button went, or the header unmounting while open, lets the header drag", () => {
  const region = header();
  render(); push(snap(READY, GATE_BLOCKED)); render();
  menuPopover(); render();
  push(snap({ kind: "idle" })); render();
  expect(region()).toBe("");
  push(snap(READY, GATE_BLOCKED)); render();
  menuPopover(); render();
  expect(region()).toBe("no-drag");
  for (const effect of hooks.effects) effect?.cleanup?.();
  expect(region()).toBe("");
});
