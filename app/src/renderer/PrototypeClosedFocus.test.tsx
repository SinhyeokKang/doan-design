import { afterEach, expect, test, vi } from "vitest";

// Effects run at once: the component's only job is its subscription.
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useEffect: (run: () => unknown) => { cleanups.push(run() as () => void); }, useRef: (current: unknown) => ({ current }) }));
const cleanups: (() => void)[] = [];
const { PrototypeClosedFocus } = await import("./PrototypeClosedFocus");

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); cleanups.length = 0; });

const node = (connected = true, inert = false) => ({ isConnected: connected, closest: () => (inert ? {} : null), focus: vi.fn() });

function mount(bubble: ReturnType<typeof node> | null, toolbar: ReturnType<typeof node> | null, windowFocused = true) {
  let closed = () => {};
  const stop = vi.fn();
  const win = Object.assign(new EventTarget(), { doan: { onPrototypeClosed: (listener: () => void) => { closed = listener; return stop; } } });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { hasFocus: () => windowFocused, querySelectorAll: () => [] });
  const controller = { current: { bubblePlayButton: () => bubble } } as never;
  expect(PrototypeClosedFocus({ controller, toolbar: { current: toolbar } as never })).toBeNull();
  return { close: () => closed(), stop, win };
}

test("a closed prototype window returns focus to the bubble's Play on screen, else the toolbar's", () => {
  const bubble = node(), toolbar = node();
  mount(bubble, toolbar).close();
  expect(bubble.focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(toolbar.focus).not.toHaveBeenCalled();
  const only = node();
  mount(null, only).close();
  expect(only.focus).toHaveBeenCalledOnce();
});

test("leaves focus alone when the toolbar's Play is under an inert cover or gone, and unsubscribes on unmount", () => {
  const covered = node(true, true);
  const { close, stop } = mount(null, covered);
  close();
  expect(covered.focus).not.toHaveBeenCalled();
  cleanups.at(-1)!();
  expect(stop).toHaveBeenCalledOnce();
});

// The push arrives as the main window is being activated; activation then restores the focus the window had when the
// prototype window took over (POSTMORTEM 2026-11-17 'Window activation put focus on Hide sidebar'), so the return is
// made again, to the Play control on screen at that time.
test("a close that arrives before the main window is active returns focus again on activation, to the Play still on screen", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const bubble = node(), toolbar = node();
  const { close, win } = mount(bubble, toolbar, false);
  close();
  expect(bubble.focus).toHaveBeenCalledOnce();
  bubble.isConnected = false;
  win.dispatchEvent(new Event("focus"));
  vi.runAllTimers();
  expect(bubble.focus).toHaveBeenCalledOnce();
  expect(toolbar.focus).toHaveBeenCalledTimes(2);
});
