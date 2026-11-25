import { afterEach, beforeEach, expect, test, vi } from "vitest";

// The Project step's phase focus, with hooks as plain state so its effect runs on each phase change.
const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], deps: [] as (unknown[] | undefined)[], cursor: 0, effectCursor: 0, pending: [] as (() => void)[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useRef: (value: unknown) => { const index = hooks.cursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
  useEffect: (run: () => unknown, deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.deps[index];
    if (previous && deps && deps.every((dep, i) => Object.is(dep, previous[i]))) return;
    hooks.deps[index] = deps;
    hooks.pending.push(() => { run(); });
  },
}));
const { useProjectFocus } = await import("./Onboarding");

let win: EventTarget;
const doc: { activeElement: unknown; body: unknown; hasFocus(): boolean; querySelectorAll(): unknown[] } = { activeElement: null, body: { name: "body" }, hasFocus: () => false, querySelectorAll: () => [] };
beforeEach(() => {
  hooks.refs = []; hooks.deps = []; hooks.pending = [];
  win = new EventTarget();
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const node = (name: string) => Object.assign(new (globalThis.HTMLElement as unknown as new () => object)(), { name, isConnected: true, matches: () => false, focus: vi.fn() });
type Session = Parameters<typeof useProjectFocus>[0];
function session(phase: string, error: { code: string } | null, busy: boolean): Session {
  return { state: { phase: { kind: phase }, error }, busy: () => busy, picking: () => false, restart: vi.fn() } as unknown as Session;
}
function render(current: Session, scope: unknown, heading: unknown) {
  hooks.cursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  useProjectFocus(current, { current: scope } as never, { current: heading } as never, () => true, true);
  for (const run of hooks.pending.splice(0)) run();
}

// A clone or check can end while the person is in another app; activation then restores the focus the window had before
// (POSTMORTEM 2026-11-17 'Window activation put focus on Hide sidebar'), so the phase's focus is made again on activation,
// and only while the same phase shows.
test("a phase that ends with the window in the background focuses its target again on activation, only while it still shows", () => {
  const alert = node("alert"), heading = node("heading");
  const scope = { querySelector: (selector: string) => selector.includes('role="alert"') ? alert : null };
  const cancel = node("Cancel");
  doc.activeElement = cancel;
  render(session("cloning", null, true), scope, heading);
  expect(cancel.focus).not.toHaveBeenCalled();
  // The clone failed: Cancel went with the wait, and the failure's notice takes focus.
  cancel.isConnected = false;
  doc.activeElement = doc.body;
  render(session("choose", { code: "clone_failed" }, false), scope, heading);
  expect(alert.focus).toHaveBeenCalledOnce();
  win.dispatchEvent(new Event("focus"));
  vi.runAllTimers();
  expect(alert.focus).toHaveBeenCalledTimes(3);

  // A later phase before activation: the earlier target is not focused again.
  alert.focus.mockClear();
  render(session("cloning", null, true), scope, heading);
  render(session("choose", { code: "clone_failed" }, false), scope, heading);
  expect(alert.focus).toHaveBeenCalledOnce();
  doc.activeElement = heading;
  render(session("inspecting", null, true), scope, heading);
  win.dispatchEvent(new Event("focus"));
  vi.runAllTimers();
  expect(alert.focus).toHaveBeenCalledOnce();
});
