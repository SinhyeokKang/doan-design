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
type ViewProps = import("./UpdateHeaderButton").UpdateHeaderButtonViewProps;

const snap = (state: UpdateState, over: Partial<UpdateSnapshot> = {}): UpdateSnapshot =>
  ({ version: "0.1.0", state, eligibility: { kind: "enabled" }, gate: { kind: "allowed" }, autoCheck: true, lastCheckedAt: null, ...over });
const READY: UpdateState = { kind: "ready", version: "0.1.1" };
const BLOCKED = { title: "Can’t restart yet", text: "A conversation is running or waiting for your answer. Restart after it finishes, or Doan updates when you quit." };
const STOPPED = { title: "Couldn’t restart Doan.", text: "Try again, or quit and open it again." };

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
function render(): ViewProps {
  let view: ReactElement<ViewProps> | null = null;
  for (let pass = 0; pass < 5; pass++) {
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0;
    view = UpdateHeaderButton({ disabled, canvasPress }) as ReactElement<ViewProps>;
    if (!hooks.pending.length) break;
    for (const run of hooks.pending.splice(0)) run();
  }
  return view!.props;
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
beforeEach(() => { disabled = false; pressListener = null; });

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
  render(); push(snap(READY, { gate: { kind: "blocked", reason: "conversation" } }));
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
  render(); push(snap(READY, { gate: { kind: "blocked", reason: "conversation" } }));
  menuPopover(); expect(render().open).toBe(true);
  pressListener!();
  expect(render().open).toBe(false);
  menuPopover(); expect(render().open).toBe(true);
  push(snap({ kind: "restarting", version: "0.1.1" }));
  expect(render().open).toBe(false);
});
