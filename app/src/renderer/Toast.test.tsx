// Run the effect and real reducer without a DOM; native visibility arrives
// independently from document visibility and from the interval's clock.
import { afterEach, expect, test, vi } from "vitest";
import type { ToastEvent, ToastState } from "./toastState";

const hooks = vi.hoisted(() => ({
  state: null as ToastState | null,
  effects: [] as (() => void | (() => void))[],
  useReducer(reducer: (state: ToastState, event: ToastEvent) => ToastState, initial: ToastState) {
    // Keep the state across calls so a second call renders what the first one dispatched.
    hooks.state ??= initial;
    return [hooks.state, (event: ToastEvent) => { hooks.state = reducer(hooks.state!, event); }];
  },
  useRef<T>(initial: T) { return { current: initial }; },
  useEffect(effect: () => void | (() => void)) { hooks.effects.push(effect); },
}));
vi.mock("react", () => hooks);
import { useToast } from "./Toast";

let cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  hooks.effects = []; hooks.state = null;
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
  expect(message.props.className).toBe("msg");
  expect(action.props).toMatchObject({ "data-ui-variant": "prominent", "data-ui-size": "sm", children: "Undo" });
});
