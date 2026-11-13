// Run the effect and real reducer without a DOM; native visibility arrives
// independently from document visibility and from the interval's clock.
import { afterEach, expect, test, vi } from "vitest";
import type { ToastEvent, ToastState } from "./toastState";

const hooks = vi.hoisted(() => ({
  state: null as ToastState | null,
  dispatched: [] as ToastEvent[],
  effects: [] as (() => void | (() => void))[],
  useReducer(reducer: (state: ToastState, event: ToastEvent) => ToastState, initial: ToastState) {
    // Keep the state across calls so a second call renders what the first one dispatched.
    hooks.state ??= initial;
    return [hooks.state, (event: ToastEvent) => { hooks.dispatched.push(event); hooks.state = reducer(hooks.state!, event); }];
  },
  useRef<T>(initial: T) { return { current: initial }; },
  useEffect(effect: () => void | (() => void)) { hooks.effects.push(effect); },
}));
vi.mock("react", () => hooks);
import { useToast } from "./Toast";

let cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  hooks.effects = []; hooks.state = null; hooks.dispatched = [];
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

function setup() {
  let now = 0;
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  let native: (visible: boolean) => void = () => {};
  const stop = vi.fn();
  vi.stubGlobal("window", { doan: { onWindowVisible: (listener: typeof native) => { native = listener; return stop; } } });
  const listeners = new Set<() => void>();
  const doc = { hidden: false, querySelector: () => null, addEventListener: (_name: string, listener: () => void) => listeners.add(listener), removeEventListener: (_name: string, listener: () => void) => listeners.delete(listener) };
  vi.stubGlobal("document", doc);
  const toast = useToast();
  for (const effect of hooks.effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  toast.show("Removed", "Undo", vi.fn());
  return {
    stop, listeners, modal: (on: boolean) => toast.setModal(on),
    native: (visible: boolean) => native(visible),
    hidden: (hidden: boolean) => { doc.hidden = hidden; listeners.forEach(listener => listener()); },
    tick: (elapsed: number) => { now += elapsed; vi.advanceTimersByTime(100); },
    jump: (elapsed: number) => { now += elapsed; },
    remaining: () => hooks.state?.remainingMs,
  };
}

test("awaits native visibility before consuming a newly shown toast", () => {
  const h = setup();
  h.tick(9000);
  expect(h.remaining()).toBe(8000);
  h.native(false); h.tick(9000);
  expect(h.remaining()).toBe(8000);
  h.native(true); h.tick(1000);
  expect(h.remaining()).toBe(7000);
});

test("native hide and document hide both pause, with a fresh clock on resume", () => {
  const h = setup(); h.native(true); h.tick(1000);
  h.native(false); h.tick(10000);
  expect(h.remaining()).toBe(7000);
  h.hidden(true); h.native(true); h.tick(10000);
  expect(h.remaining()).toBe(7000);
  h.jump(30000); h.hidden(false); h.tick(1000);
  expect(h.remaining()).toBe(6000);
  h.native(false); h.jump(30000); h.native(true); h.tick(6000);
  expect(hooks.state?.ended).toMatchObject({ reason: "expired" });
});

test("document visibility cannot resume a natively hidden window, and unmount unsubscribes", () => {
  const h = setup(); h.native(true); h.native(false);
  h.hidden(true); h.hidden(false); h.tick(9000);
  expect(h.remaining()).toBe(8000);
  cleanups.splice(0).forEach(cleanup => cleanup());
  expect(h.stop).toHaveBeenCalledOnce();
  expect(h.listeners.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

test("an App modal pauses the hook clock and resumes only the remaining time", () => {
  const h = setup(); h.native(true); h.tick(2500);
  h.modal(true); h.tick(20000);
  expect(h.remaining()).toBe(5500);
  h.jump(30000); h.modal(false); h.tick(5400);
  expect(h.remaining()).toBe(100);
  h.tick(100);
  expect(hooks.state?.ended).toMatchObject({ reason: "expired" });
});

test("the action sits to the right of the message as a prominent small button", () => {
  setup();
  const [message, action] = useToast().element!.props.children;
  expect(message.props.className).toBe("msg selectable");
  expect(action.props).toMatchObject({ "data-ui-variant": "prominent", "data-ui-size": "sm", children: "Undo" });
});

// The message is the only text a user may need to copy (an error reason); the action is a button and stays unselectable.
test("the toast message is selectable and its action button is not", () => {
  setup();
  const [message, action] = useToast().element!.props.children;
  expect(message.props.className.split(" ")).toContain("selectable");
  expect(String(action.props.className).split(" ")).not.toContain("selectable");
});

// Renders again and runs that render's effects as React would: the mock ignores deps, so the mount effect (the first,
// with [] deps) is skipped rather than subscribing and pausing a second time.
function rerender() {
  const ran = hooks.effects.length;
  useToast();
  for (const effect of hooks.effects.slice(ran + 1)) effect();
}

// Outside the open modal dialog the toast would be inert and hidden behind it, so a toast shown in a
// dialog is portalled into it and keeps its clock; when that dialog is gone it is drawn in its usual place and held.
test("a toast shown in an open modal dialog is drawn inside it and counts down while the modal is up", () => {
  const h = setup(); h.native(true); h.modal(true);
  const dialog = { nodeType: 1, open: true, isConnected: true };
  useToast().showIn(dialog as unknown as HTMLDialogElement, "Couldn’t open the link. Finish Doan’s first run, then try again.");
  const inside = useToast().element as unknown as { $$typeof: symbol; containerInfo: unknown; children: { props: { className: string; children: unknown[] } } };
  expect(inside.$$typeof).toBe(Symbol.for("react.portal"));
  expect(inside.containerInfo).toBe(dialog);
  expect(inside.children.props.className).toContain("doan-toast");
  h.tick(3000);
  expect(h.remaining()).toBe(5000);
  // The dialog closed: the next render draws the toast in its place and the modal holds it again.
  dialog.open = false;
  const outside = useToast().element!;
  expect(outside.props.className).toContain("doan-toast");
  rerender();
  h.tick(3000);
  expect(h.remaining()).toBe(5000);
});

test("without an open dialog the toast is drawn in its usual place and held by the modal like any other", () => {
  const h = setup(); h.native(true); h.modal(true);
  useToast().showIn(null, "Couldn’t open the link. Settings is in the middle of a change. Finish or cancel it, then try again.");
  expect(useToast().element!.props.className).toContain("doan-toast");
  h.tick(3000);
  expect(h.remaining()).toBe(8000);
});

// The pointer was on the toast inside the dialog when the dialog went. The element in the
// usual place is a new one, and the pointer is not over it, so the clock runs again.
test.each([
  ["closes", (dialog: { open: boolean; isConnected: boolean }) => { dialog.open = false; }],
  ["is removed", (dialog: { open: boolean; isConnected: boolean }) => { dialog.isConnected = false; }],
])("a hovered toast whose dialog %s counts down again in its usual place", (_name, gone) => {
  const h = setup(); h.native(true);
  const dialog = { nodeType: 1, open: true, isConnected: true };
  useToast().showIn(dialog as unknown as HTMLDialogElement, "Couldn’t open the link. A dialog is busy and did not close. Finish it, then try again.");
  const inside = useToast().element as unknown as { children: { props: { onMouseEnter(): void } } };
  inside.children.props.onMouseEnter();
  h.tick(3000);
  expect(h.remaining()).toBe(8000);
  gone(dialog);
  rerender();
  useToast();
  h.tick(3000);
  expect(h.remaining()).toBe(5000);
});

test("Retry runs in place with a busy, unavailable button and a spinner, and goes or comes back when it settles", async () => {
  vi.stubGlobal("window", { doan: { onWindowVisible: () => () => {} } });
  vi.stubGlobal("document", { hidden: false, querySelector: () => null, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("crypto", { randomUUID: () => "r1" });
  // Refs persist across renders here, as React keeps them: the press handler lives in one.
  const refs: { current: unknown }[] = [];
  let cursor = 0;
  const useRef = hooks.useRef;
  hooks.useRef = <T,>(initial: T) => (refs[cursor++] ??= { current: initial }) as { current: T };
  cleanups.push(() => { hooks.useRef = useRef; });
  const render = () => { cursor = 0; return useToast(); };
  let settle: (next: string | null) => void = () => {};
  const attempt = vi.fn(() => new Promise<string | null>(resolve => { settle = resolve; }));
  render().retry("Couldn’t save a’s read state.", "Retry", "Saving a’s read state.", "Retrying", attempt);
  const button = () => render().element!.props.children[1];
  button().props.onClick();
  expect(hooks.state?.toast).toEqual({ id: "r1", message: "Saving a’s read state.", action: "Retrying", busy: true });
  expect(button().props).toMatchObject({ "aria-disabled": true, "data-disabled": "" });
  expect(button().props.children.props.children[0].props.className).toBe("doan-spinner");
  button().props.onClick();
  expect(attempt).toHaveBeenCalledTimes(1);
  settle("Couldn’t save a’s read state.");
  await Promise.resolve(); await Promise.resolve();
  expect(hooks.state?.toast).toEqual({ id: "r1", message: "Couldn’t save a’s read state.", action: "Retry" });
  expect(button().props.children).toBe("Retry");
  button().props.onClick();
  settle(null);
  await Promise.resolve(); await Promise.resolve();
  expect(hooks.state?.toast).toBeNull();
});

// useReducer runs App again for every dispatch, even one whose state does not change, so the clock must not tick while
// nothing is shown; it starts again with a toast and stops once that toast's ending is cleared.
test("the clock dispatches no tick while no toast is shown", () => {
  let now = 0;
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("window", { doan: { onWindowVisible: (listener: (visible: boolean) => void) => { listener(true); return () => {}; } } });
  vi.stubGlobal("document", { hidden: false, querySelector: () => null, addEventListener: () => {}, removeEventListener: () => {} });
  const toast = useToast();
  for (const effect of hooks.effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  const ticks = () => hooks.dispatched.filter(event => event.type === "tick").length;
  now += 1000; vi.advanceTimersByTime(1000);
  expect(ticks()).toBe(0);
  toast.show("Exported");
  now += 300; vi.advanceTimersByTime(300);
  expect(ticks()).toBe(3);
  expect(hooks.state?.remainingMs).toBe(8000 - 300);
  now += 8000; vi.advanceTimersByTime(8000);
  expect(hooks.state?.toast).toBeNull();
  // One more tick clears the ending the expiry left.
  now += 100; vi.advanceTimersByTime(100);
  expect(hooks.state?.ended).toBeUndefined();
  const after = ticks();
  now += 1000; vi.advanceTimersByTime(1000);
  expect(ticks()).toBe(after);
});

// A toast that replaces another only changes its content: the same element (keyed by the slot) stays, so the enter
// motion does not play again. Its button is keyed by the toast, so focus on the old toast's action does not pass to
// the new one's.
test("a replacing toast keeps the element and changes only its content", () => {
  setup();
  const first = useToast().element!;
  useToast().show("Exported “tasks”.", "Show in Finder", vi.fn());
  const second = useToast().element!;
  expect(second.key).toBe(first.key);
  expect(second.props.children[0].props.children).toBe("Exported “tasks”.");
  expect(second.props.children[1].key).not.toBe(first.props.children[1].key);
  expect(second.props["data-closing"]).toBeUndefined();
});

// The exit motion needs the element for --time-fast (120 ms) after the toast is gone: it stays drawn, closing and
// inert (no pointer, no focus, out of the accessibility tree), then goes. Its action button is a new element, so
// focus on the old one leaves with the toast.
test("a toast that goes stays drawn closing and inert for 120 ms, then goes", () => {
  const h = setup(); h.native(true);
  const shown = useToast().element!;
  useToast().action();
  const closing = useToast().element!;
  expect(closing.key).toBe(shown.key);
  expect(closing.props).toMatchObject({ "data-closing": "", inert: true });
  expect(closing.props.children[0].props.children).toBe("Removed");
  expect(closing.props.children[1].key).not.toBe(shown.props.children[1].key);
  rerender();
  vi.advanceTimersByTime(119);
  expect(useToast().element).not.toBeNull();
  vi.advanceTimersByTime(1);
  expect(useToast().element).toBeNull();
});

test("the exit time is the --time-fast token", async () => {
  const { readFileSync } = await vi.importActual<typeof import("node:fs")>("node:fs");
  const { FLOATING_EXIT_MS } = await import("./toastState");
  const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
  expect(tokens).toMatch(new RegExp(`--time-fast: ${FLOATING_EXIT_MS}ms;`));
});
