import { useEffect, useRef } from "react";

// Focus moved while the window is in the background (`doan open` from a terminal, which then activates the window)
// is lost to the platform's own restore: activation puts focus back on the element it remembered, and when that element
// is gone it focuses the first focusable control (the header's Hide sidebar). Once the window gains focus, `refocus`
// runs at once and again after the platform's restore (`defer`). A pointer press chooses focus itself, so it cancels
// the hold. Only the next activation counts. Returns the cancel.
export function refocusOnActivation(win: EventTarget, hasFocus: () => boolean, refocus: () => void, defer: (run: () => void) => void = run => { setTimeout(run, 0); }): () => void {
  if (hasFocus()) return () => {};
  let live = true;
  const cancel = () => { live = false; win.removeEventListener("focus", focused); win.removeEventListener("pointerdown", cancel, true); };
  const focused = () => {
    win.removeEventListener("focus", focused);
    refocus();
    defer(() => { if (live) { cancel(); refocus(); } });
  };
  win.addEventListener("focus", focused);
  win.addEventListener("pointerdown", cancel, true);
  return cancel;
}

const DIALOGS = '[role="dialog"], [role="alertdialog"], dialog[open]';

// A focus recovery that can run while the window is in the background: `focus` runs at once and, if the window lacks
// focus, again on its activation, unless a dialog opened meanwhile (it holds focus by its own rule). `focus` finds its
// target again each time, since the control may have been redrawn. Returns the cancel.
export function focusThroughActivation(focus: () => void, win?: EventTarget, doc: { hasFocus(): boolean; querySelectorAll(selector: string): ArrayLike<unknown> } = document, defer?: (run: () => void) => void): () => void {
  focus();
  if (doc.hasFocus()) return () => {};
  const open = Array.from(doc.querySelectorAll(DIALOGS));
  return refocusOnActivation(win ?? window, () => doc.hasFocus(), () => {
    if (Array.from(doc.querySelectorAll(DIALOGS)).some(dialog => !open.includes(dialog))) return;
    focus();
  }, defer);
}

// One component's focus recoveries: a newer one replaces the activation focus of the last, and unmounting cancels it.
export function useActivationFocus(): (focus: () => void) => void {
  const cancel = useRef<() => void>(() => {});
  useEffect(() => () => cancel.current(), []);
  return focus => {
    cancel.current();
    cancel.current = focusThroughActivation(focus);
  };
}
