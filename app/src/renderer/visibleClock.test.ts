// Runs the hook's effect without a DOM: useState and useEffect are stand-ins that keep the value and collect effects.
import { afterEach, expect, test, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  value: null as number | null,
  sets: 0,
  effects: [] as (() => void | (() => void))[],
  useState<T>(initial: T | (() => T)) {
    hooks.value ??= (typeof initial === "function" ? (initial as () => T)() : initial) as number;
    return [hooks.value, (next: number) => { hooks.sets++; hooks.value = next; }];
  },
  useEffect(effect: () => void | (() => void)) { hooks.effects.push(effect); },
}));
vi.mock("react", () => hooks);
const { useVisibleClock } = await import("./visibleClock");

afterEach(() => { hooks.effects = []; hooks.value = null; hooks.sets = 0; vi.unstubAllGlobals(); vi.useRealTimers(); });

// The App clock keeps wall-clock text current; while the window is hidden nobody sees it, so it renders nothing then.
test("the clock ticks while visible, stops while the document or the window is hidden, and refreshes once on showing", () => {
  vi.useFakeTimers();
  const listeners = new Set<() => void>();
  const doc = { hidden: false, addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) };
  vi.stubGlobal("document", doc);
  let native: (visible: boolean) => void = () => {};
  const off = vi.fn();
  vi.stubGlobal("window", { doan: { onWindowVisible: (listener: typeof native) => { native = listener; return off; } } });
  useVisibleClock(1000);
  const cleanup = hooks.effects[0]!() as () => void;
  vi.advanceTimersByTime(3000);
  expect(hooks.sets).toBe(3);
  doc.hidden = true; listeners.forEach(listener => listener());
  vi.advanceTimersByTime(5000);
  expect(hooks.sets).toBe(3);
  doc.hidden = false; listeners.forEach(listener => listener());
  expect(hooks.sets).toBe(4);
  vi.advanceTimersByTime(1000);
  expect(hooks.sets).toBe(5);
  native(false);
  vi.advanceTimersByTime(5000);
  expect(hooks.sets).toBe(5);
  native(true);
  expect(hooks.sets).toBe(6);
  cleanup();
  expect(off).toHaveBeenCalledOnce();
  expect(listeners.size).toBe(0);
  vi.advanceTimersByTime(5000);
  expect(hooks.sets).toBe(6);
});
