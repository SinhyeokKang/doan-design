import { afterEach, expect, test, vi } from "vitest";

// useRetry driven as a plain function: state never re-renders here, refs keep their order.
const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], refCursor: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [initial, () => {}],
  useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
  useEffect: () => {},
}));
const { useRetry } = await import("./ListRetryButton");

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// POSTMORTEM 2026-11-17: a Retry answered in the background takes its line away; activation would otherwise put focus back on
// the Retry that went.
test("a Retry that succeeded with the window in the background focuses its row's control again when the window activates", async () => {
  const win = new EventTarget(), body = {}, control = { focus: vi.fn() };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { activeElement: body, body, hasFocus: () => false, querySelectorAll: () => [] });
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const section = { isConnected: true, querySelector: () => control };
  const pressed = { isConnected: false, closest: (selector: string) => selector === ".settings-section" ? section : null };
  const retry = useRetry();
  retry.run(async () => true, pressed as never);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  expect(control.focus).toHaveBeenCalledTimes(1);
  win.dispatchEvent(new Event("focus"));
  vi.runAllTimers();
  expect(control.focus).toHaveBeenCalledTimes(3);
});
