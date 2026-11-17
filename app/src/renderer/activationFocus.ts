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
