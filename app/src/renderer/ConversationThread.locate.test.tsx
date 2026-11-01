import { afterEach, beforeEach, expect, test, vi } from "vitest";

// useLocateNote's state and effect as React runs them: a render reads the state, and the effect runs again (after
// the previous one's cleanup) only when its deps changed. The times below are literals, so a changed constant fails.
const hooks = vi.hoisted(() => ({ state: 0, deps: null as unknown[] | null, cleanup: undefined as void | (() => void), effect: null as null | { run: () => void | (() => void); deps: unknown[] } }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: () => [hooks.state, (next: number | ((value: number) => number)) => { hooks.state = typeof next === "function" ? next(hooks.state) : next; }],
  useEffect: (run: () => void | (() => void), deps: unknown[]) => { hooks.effect = { run, deps }; },
}));
const { useLocateNote } = await import("./ConversationThread");

function render() {
  const result = useLocateNote();
  const effect = hooks.effect!;
  const same = hooks.deps !== null && effect.deps.length === hooks.deps.length && effect.deps.every((dep, i) => Object.is(dep, hooks.deps![i]));
  if (!same) { hooks.cleanup?.(); hooks.cleanup = effect.run(); hooks.deps = effect.deps; }
  return result;
}
const shown = () => render()[0];

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("window", new EventTarget()); hooks.state = 0; hooks.deps = null; hooks.cleanup = undefined; });
afterEach(() => { hooks.cleanup?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });

test("the note shows for 4 s: still there at 3999 ms, gone 1 ms later", () => {
  const [, show] = render();
  show();
  expect(shown()).toBe(true);
  vi.advanceTimersByTime(1000);
  expect(shown()).toBe(true);
  vi.advanceTimersByTime(2999);
  expect(shown()).toBe(true);
  vi.advanceTimersByTime(1);
  expect(shown()).toBe(false);
});

test("the person's next action hides it at once: a pointer press or a key", () => {
  for (const type of ["pointerdown", "keydown"]) {
    const [, show] = render();
    show();
    expect(shown()).toBe(true);
    vi.advanceTimersByTime(500);
    window.dispatchEvent(new Event(type));
    expect(shown()).toBe(false);
    // Hidden by the action, no timer of its own is left to fire.
    vi.advanceTimersByTime(10_000);
    expect(shown()).toBe(false);
  }
});

test("a second miss restarts the 4 s from its own moment", () => {
  const [, show] = render();
  show();
  expect(shown()).toBe(true);
  vi.advanceTimersByTime(3000);
  show();
  expect(shown()).toBe(true);
  // 3999 ms after the second miss (6999 ms after the first): still shown; 1 ms later it is gone.
  vi.advanceTimersByTime(3999);
  expect(shown()).toBe(true);
  vi.advanceTimersByTime(1);
  expect(shown()).toBe(false);
});

test("after an action hid it, a new miss shows it again for its own 4 s", () => {
  const [, show] = render();
  show();
  shown();
  vi.advanceTimersByTime(2000);
  window.dispatchEvent(new Event("keydown"));
  expect(shown()).toBe(false);
  show();
  expect(shown()).toBe(true);
  vi.advanceTimersByTime(3999);
  expect(shown()).toBe(true);
  vi.advanceTimersByTime(1);
  expect(shown()).toBe(false);
});
