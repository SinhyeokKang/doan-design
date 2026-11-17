import { expect, test, vi } from "vitest";
import { refocusOnActivation } from "./activationFocus";

// The sidebar hands a vanished row's focus to its canvas row while the window is in the background (`doan open` from a
// terminal); activating the window then lets the platform restore focus to the first header control, because the row it
// remembered is gone. The handed-over focus is put back once the window gains focus.

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
  // Only that activation: later focus events are the person's own.
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
