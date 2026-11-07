import { describe, expect, test } from "vitest";
import { initialToastState, isToastPaused, TOAST_MS, toastState, type Toast, type ToastEvent, type ToastState } from "./toastState";

const run = (events: ToastEvent[], from: ToastState = initialToastState) => events.reduce(toastState, from);
const one: Toast = { id: "1", message: "A removed. Files stay on disk.", action: "Undo" };
const two: Toast = { id: "2", message: "Added B" };

describe("toastState", () => {
  test("shows one toast for 8 s, then expires it", () => {
    const shown = run([{ type: "show", toast: one }]);
    expect(shown).toMatchObject({ toast: one, remainingMs: TOAST_MS });
    expect(TOAST_MS).toBe(8000);
    expect(run([{ type: "tick", elapsedMs: 7999 }], shown).toast).toBe(one);
    expect(run([{ type: "tick", elapsedMs: 8000 }], shown)).toMatchObject({ toast: null, ended: { id: "1", reason: "expired" } });
  });

  test("a new toast replaces the old one and restarts the timer", () => {
    const state = run([{ type: "show", toast: one }, { type: "tick", elapsedMs: 5000 }, { type: "show", toast: two }]);
    expect(state).toMatchObject({ toast: two, remainingMs: TOAST_MS, ended: { id: "1", reason: "replaced" } });
  });

  test("the timer stops while hovered, focused or the window is hidden", () => {
    for (const type of ["hover", "focus", "hidden"] as const) {
      const paused = run([{ type: "show", toast: one }, { type, on: true }, { type: "tick", elapsedMs: 60000 }]);
      expect(isToastPaused(paused)).toBe(true);
      expect(paused).toMatchObject({ toast: one, remainingMs: TOAST_MS });
      const resumed = run([{ type, on: false }, { type: "tick", elapsedMs: 3000 }], paused);
      expect(resumed.remainingMs).toBe(TOAST_MS - 3000);
    }
  });

  test("stays paused until every reason is gone", () => {
    const state = run([{ type: "show", toast: one }, { type: "hover", on: true }, { type: "focus", on: true }, { type: "hover", on: false }]);
    expect(isToastPaused(state)).toBe(true);
  });

  test("the action ends the toast; a toast without one ignores it", () => {
    expect(run([{ type: "show", toast: one }, { type: "action" }])).toMatchObject({ toast: null, ended: { id: "1", reason: "action" } });
    expect(run([{ type: "show", toast: two }, { type: "action" }]).toast).toBe(two);
    expect(run([{ type: "action" }]).toast).toBeNull();
  });

  test("ended describes only the last event", () => {
    const expired = run([{ type: "show", toast: one }, { type: "tick", elapsedMs: 9000 }]);
    expect(run([{ type: "hover", on: true }], expired).ended).toBeUndefined();
  });

  test("a gone toast leaves no hover or focus behind, but a hidden window stays hidden", () => {
    const state = run([{ type: "show", toast: one }, { type: "hover", on: true }, { type: "focus", on: true }, { type: "action" }]);
    expect(isToastPaused(state)).toBe(false);
    const hidden = run([{ type: "hidden", on: true }, { type: "show", toast: one }]);
    expect(isToastPaused(hidden)).toBe(true);
  });

  test("replacing a toast ends the old element's hover and focus", () => {
    const state = run([{ type: "show", toast: one }, { type: "focus", on: true }, { type: "hover", on: true }, { type: "show", toast: two }]);
    expect(isToastPaused(state)).toBe(false);
    expect(run([{ type: "tick", elapsedMs: TOAST_MS }], state)).toMatchObject({ toast: null, ended: { id: "2", reason: "expired" } });
  });

  test("replacing a toast while the window is hidden keeps it hidden", () => {
    const state = run([{ type: "hidden", on: true }, { type: "show", toast: one }, { type: "focus", on: true }, { type: "show", toast: two }]);
    expect(state).toMatchObject({ focused: false, hovered: false, hidden: true });
    expect(run([{ type: "tick", elapsedMs: TOAST_MS }], state).toast).toBe(two);
  });

  test("ticks with no toast change nothing", () => {
    expect(run([{ type: "tick", elapsedMs: 5000 }])).toEqual(initialToastState);
  });
});

test("modal pause composes with native, hover and focus pauses without renewing the deadline", () => {
  let state = toastState(initialToastState, { type: "show", toast: { id: "one", message: "Removed", action: "Undo" } });
  state = toastState(state, { type: "tick", elapsedMs: 3000 });
  state = toastState(state, { type: "modal", on: true });
  state = toastState(state, { type: "tick", elapsedMs: 20000 });
  expect(state.remainingMs).toBe(5000);
  state = toastState(state, { type: "hidden", on: true });
  state = toastState(state, { type: "modal", on: false });
  state = toastState(state, { type: "tick", elapsedMs: 20000 });
  expect(state.remainingMs).toBe(5000);
  state = toastState(state, { type: "hidden", on: false });
  state = toastState(state, { type: "tick", elapsedMs: 4999 });
  expect(state.toast?.id).toBe("one");
  state = toastState(state, { type: "tick", elapsedMs: 1 });
  expect(state.ended).toEqual({ id: "one", reason: "expired" });
});

// defect-sweep C3: a toast drawn inside the open modal dialog is visible and read there, so the modal does not hold its
// clock; once that dialog has gone it is held like any other toast.
test("a toast inside the modal dialog keeps its clock while the modal is up, and is held once it leaves the dialog", () => {
  let state = toastState(initialToastState, { type: "modal", on: true });
  state = toastState(state, { type: "show", toast: { id: "one", message: "Couldn’t open the link.", dialog: {} as HTMLDialogElement } });
  state = toastState(state, { type: "tick", elapsedMs: 3000 });
  expect(state.remainingMs).toBe(TOAST_MS - 3000);
  state = toastState(state, { type: "leftDialog" });
  expect(state.toast).toEqual({ id: "one", message: "Couldn’t open the link." });
  state = toastState(state, { type: "tick", elapsedMs: 20000 });
  expect(state.remainingMs).toBe(TOAST_MS - 3000);
  // A later toast outside the dialog is held by the same modal.
  state = toastState(state, { type: "show", toast: { id: "two", message: "Removed" } });
  state = toastState(state, { type: "tick", elapsedMs: 3000 });
  expect(state.remainingMs).toBe(TOAST_MS);
});

// defect-sweep C3 fix round 1: leaving the dialog unmounts the hovered or focused element without a mouseleave or
// blur, so those pauses go with it; Toast re-reads them from the new element.
test("leaving the dialog drops the hover and focus pauses of the element that unmounted", () => {
  let state = toastState(initialToastState, { type: "show", toast: { id: "one", message: "Couldn’t open the link.", dialog: {} as HTMLDialogElement } });
  state = toastState(state, { type: "hover", on: true });
  state = toastState(state, { type: "focus", on: true });
  state = toastState(state, { type: "leftDialog" });
  expect(state).toMatchObject({ hovered: false, focused: false });
  state = toastState(state, { type: "tick", elapsedMs: 9000 });
  expect(state.ended).toEqual({ id: "one", reason: "expired" });
});
