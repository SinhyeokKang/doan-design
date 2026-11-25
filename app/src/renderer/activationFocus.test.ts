import { afterEach, describe, expect, test, vi } from "vitest";
import { focusThroughActivation, refocusOnActivation, useActivationFocus } from "./activationFocus";

// Hooks run as plain state: refs keep their slot, and a mount effect's cleanup runs at unmount.
const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], cursor: 0, mounted: false, cleanups: [] as (() => void)[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useRef: (value: unknown) => { const index = hooks.cursor++; return hooks.refs[index] ??= { current: value }; },
  useEffect: (run: () => unknown) => { if (hooks.mounted) return; const cleanup = run(); if (typeof cleanup === "function") hooks.cleanups.push(cleanup as () => void); },
}));
afterEach(() => vi.unstubAllGlobals());

// Activating the window lets the platform restore focus to the first header control when the remembered row
// is gone, so focus handed over in the background (`doan open`) is put back once the window gains focus.

function setup(hasFocus: boolean) {
  const win = new EventTarget();
  const deferred: (() => void)[] = [];
  const refocus = vi.fn();
  const cancel = refocusOnActivation(win, () => hasFocus, refocus, run => { deferred.push(run); });
  return { win, deferred, refocus, cancel };
}

test("a window with focus needs nothing put back", () => {
  const { win, deferred, refocus } = setup(true);
  win.dispatchEvent(new Event("focus"));
  deferred.forEach(run => run());
  expect(refocus).not.toHaveBeenCalled();
});

test("the next window focus puts focus back at once and again after the platform's own restore", () => {
  const { win, deferred, refocus } = setup(false);
  expect(refocus).not.toHaveBeenCalled();
  win.dispatchEvent(new Event("focus"));
  expect(refocus).toHaveBeenCalledTimes(1);
  deferred.forEach(run => run());
  expect(refocus).toHaveBeenCalledTimes(2);
  // Only the first activation refocuses: later focus events are the person's own.
  win.dispatchEvent(new Event("focus"));
  expect(refocus).toHaveBeenCalledTimes(2);
});

test("a pointer press activating the window chooses focus itself", () => {
  const { win, deferred, refocus } = setup(false);
  win.dispatchEvent(new Event("focus"));
  win.dispatchEvent(new Event("pointerdown"));
  deferred.forEach(run => run());
  expect(refocus).toHaveBeenCalledTimes(1);
  const other = setup(false);
  other.win.dispatchEvent(new Event("pointerdown"));
  other.win.dispatchEvent(new Event("focus"));
  expect(other.refocus).not.toHaveBeenCalled();
});

test("cancelled before the window gains focus, nothing is put back", () => {
  const { win, deferred, refocus, cancel } = setup(false);
  cancel();
  win.dispatchEvent(new Event("focus"));
  deferred.forEach(run => run());
  expect(refocus).not.toHaveBeenCalled();
});

// Every focus recovery that can run in the background (POSTMORTEM 2026-11-17) goes through focusThroughActivation.
describe("focusThroughActivation", () => {
  function page(hasFocus: boolean) {
    const win = new EventTarget();
    const dialogs: object[] = [];
    const doc = { hasFocus: () => hasFocus, querySelectorAll: () => dialogs };
    const deferred: (() => void)[] = [];
    return { win, doc, dialogs, deferred, defer: (run: () => void) => { deferred.push(run); } };
  }

  test("focuses at once, and with the window in front arms nothing", () => {
    const { win, doc, deferred, defer } = page(true);
    const focus = vi.fn();
    focusThroughActivation(focus, win, doc, defer);
    expect(focus).toHaveBeenCalledTimes(1);
    win.dispatchEvent(new Event("focus"));
    deferred.forEach(run => run());
    expect(focus).toHaveBeenCalledTimes(1);
  });

  test("in the background, focuses again on activation and after the platform's restore", () => {
    const { win, doc, deferred, defer } = page(false);
    const focus = vi.fn();
    focusThroughActivation(focus, win, doc, defer);
    expect(focus).toHaveBeenCalledTimes(1);
    win.dispatchEvent(new Event("focus"));
    deferred.forEach(run => run());
    expect(focus).toHaveBeenCalledTimes(3);
  });

  test("a dialog that opened meanwhile keeps its focus; one open already does not stop it", () => {
    const opened = page(false);
    opened.dialogs.push({ settings: true });
    const focus = vi.fn();
    focusThroughActivation(focus, opened.win, opened.doc, opened.defer);
    opened.win.dispatchEvent(new Event("focus"));
    expect(focus).toHaveBeenCalledTimes(2);
    const later = page(false);
    const other = vi.fn();
    focusThroughActivation(other, later.win, later.doc, later.defer);
    later.dialogs.push({ alert: true });
    later.win.dispatchEvent(new Event("focus"));
    later.deferred.forEach(run => run());
    expect(other).toHaveBeenCalledTimes(1);
  });

  test("the returned cancel drops the activation focus", () => {
    const { win, doc, deferred, defer } = page(false);
    const focus = vi.fn();
    focusThroughActivation(focus, win, doc, defer)();
    win.dispatchEvent(new Event("focus"));
    deferred.forEach(run => run());
    expect(focus).toHaveBeenCalledTimes(1);
  });
});

// Each caller's hand-off lives only as long as its component: one left behind would focus a screen no longer shown.
describe("useActivationFocus", () => {
  function mount() {
    hooks.refs = []; hooks.cleanups = []; hooks.mounted = false;
    const render = () => { hooks.cursor = 0; const hand = useActivationFocus(); hooks.mounted = true; return hand; };
    const unmount = () => { for (const cleanup of hooks.cleanups) cleanup(); };
    const win = new EventTarget();
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", { hasFocus: () => false, querySelectorAll: () => [] });
    return { render, unmount, win };
  }

  test("is the same function on every render, and a later hand-off replaces the earlier one", async () => {
    const { render, win } = mount();
    const hand = render();
    expect(render()).toBe(hand);
    const first = vi.fn(), second = vi.fn();
    hand(first);
    hand(second);
    win.dispatchEvent(new Event("focus"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(3);
  });

  test("unmounting drops a hand-off still waiting for activation", async () => {
    const { render, unmount, win } = mount();
    const focus = vi.fn();
    render()(focus);
    unmount();
    win.dispatchEvent(new Event("focus"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
