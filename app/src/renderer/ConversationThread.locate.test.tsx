import { afterEach, beforeEach, expect, test, vi } from "vitest";

// useLocateNote's state and effect run as plain values so its timer and listeners can be driven directly.
const hooks = vi.hoisted(() => ({ state: 0, effect: null as null | (() => void | (() => void)), cleanup: undefined as void | (() => void) }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: () => [hooks.state, (next: number | ((value: number) => number)) => { hooks.state = typeof next === "function" ? next(hooks.state) : next; }],
  useEffect: (effect: () => void | (() => void)) => { hooks.effect = effect; },
}));
const { LOCATE_NOTE_MS, useLocateNote } = await import("./ConversationThread");

// Runs the hook as React would after a render: the previous effect's cleanup, then the new effect.
function render() {
  const result = useLocateNote();
  hooks.cleanup?.();
  hooks.cleanup = hooks.effect?.();
  return result;
}

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("window", new EventTarget()); hooks.state = 0; hooks.cleanup = undefined; });
afterEach(() => { hooks.cleanup?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });

test("the note shows for 4 s after a locate finds nothing", () => {
  const [, show] = render();
  show();
  expect(render()[0]).toBe(true);
  vi.advanceTimersByTime(LOCATE_NOTE_MS - 1);
  expect(render()[0]).toBe(true);
  vi.advanceTimersByTime(LOCATE_NOTE_MS);
  expect(hooks.state).toBe(0);
  expect(render()[0]).toBe(false);
});

test("the person's next action hides it at once: a pointer press or a key", () => {
  for (const type of ["pointerdown", "keydown"]) {
    const [, show] = render();
    show();
    expect(render()[0]).toBe(true);
    window.dispatchEvent(new Event(type));
    expect(render()[0]).toBe(false);
  }
});

test("another miss restarts the 4 s", () => {
  const [, show] = render();
  show();
  render();
  vi.advanceTimersByTime(3000);
  show();
  render();
  vi.advanceTimersByTime(3000);
  expect(render()[0]).toBe(true);
  vi.advanceTimersByTime(LOCATE_NOTE_MS);
  expect(render()[0]).toBe(false);
});
