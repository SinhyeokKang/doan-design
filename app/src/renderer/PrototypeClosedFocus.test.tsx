import { afterEach, expect, test, vi } from "vitest";

// Effects run at once: the component's only job is its subscription.
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useEffect: (run: () => unknown) => { cleanups.push(run() as () => void); } }));
const cleanups: (() => void)[] = [];
const { PrototypeClosedFocus } = await import("./PrototypeClosedFocus");

afterEach(() => { vi.unstubAllGlobals(); cleanups.length = 0; });

const node = (connected = true, inert = false) => ({ isConnected: connected, closest: () => (inert ? {} : null), focus: vi.fn() });

function mount(bubble: ReturnType<typeof node> | null, toolbar: ReturnType<typeof node> | null) {
  let closed = () => {};
  const stop = vi.fn();
  vi.stubGlobal("window", { doan: { onPrototypeClosed: (listener: () => void) => { closed = listener; return stop; } } });
  const controller = { current: { bubblePlayButton: () => bubble } } as never;
  expect(PrototypeClosedFocus({ controller, toolbar: { current: toolbar } as never })).toBeNull();
  return { close: () => closed(), stop };
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
