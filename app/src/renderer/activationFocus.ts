import { useEffect, useRef } from "react";

// Activation overrides focus moved in the background by restoring its own element, so `refocus` runs at once and
// after that restore (`defer`). A pointer press chooses focus itself and cancels the hold.
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

// Runs `focus` now and again on window activation if it lacked focus, unless a dialog opened meanwhile. `focus` finds
// its target each time, since the control may have been redrawn.
export function focusThroughActivation(focus: () => void, win?: EventTarget, doc: { hasFocus(): boolean; querySelectorAll(selector: string): ArrayLike<unknown> } = document, defer?: (run: () => void) => void): () => void {
  focus();
  if (doc.hasFocus()) return () => {};
  const open = Array.from(doc.querySelectorAll(DIALOGS));
  return refocusOnActivation(win ?? window, () => doc.hasFocus(), () => {
    if (Array.from(doc.querySelectorAll(DIALOGS)).some(dialog => !open.includes(dialog))) return;
    focus();
  }, defer);
}

// The returned function is the same on every render, so effects can list it.
export function useActivationFocus(): (focus: () => void) => void {
  const cancel = useRef<() => void>(() => {});
  const hand = useRef<((focus: () => void) => void) | null>(null);
  useEffect(() => () => cancel.current(), []);
  hand.current ??= focus => {
    cancel.current();
    cancel.current = focusThroughActivation(focus);
  };
  return hand.current;
}
