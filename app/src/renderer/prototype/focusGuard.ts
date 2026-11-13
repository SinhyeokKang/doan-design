// A run reloaded while focus is in the conversation column must not take it: a canvas's own focus() or autofocus
// would (PoC). The host sees focus leaving for a cross-origin iframe only as a focusout with no relatedTarget, and it
// cannot tell a script's focus() from the person's click into the frame, so it gives focus back only for the run whose
// iframe was created while focus was in the column, and only until FOCUS_GUARD_MS after that run was ready and shown.
// `inert` and the iframe's focus-without-user-activation policy did not stop the frame's focus() (PoC).
export const FOCUS_GUARD_MS = 1000;

export class ColumnFocusGuard {
  private armed: { gen: number; frame: HTMLIFrameElement; until: number } | null = null;
  // The column element focus left with no relatedTarget, waiting for the one-task-later check.
  private from: HTMLElement | null = null;

  constructor(private readonly now: () => number) {}

  // Every new run's iframe; a newer one replaces the guard, armed by where focus is now.
  created(gen: number, frame: HTMLIFrameElement, columnHasFocus: boolean): void {
    this.armed = columnHasFocus ? { gen, frame, until: Infinity } : null;
  }

  // The run is ready and on screen: the guard ends a second later.
  shown(gen: number): void {
    if (this.armed?.gen === gen && this.armed.until === Infinity) this.armed.until = this.now() + FOCUS_GUARD_MS;
  }

  // A focusout in the column. True when it may have gone into an iframe, so the host checks one task later.
  left(from: HTMLElement, related: EventTarget | null): boolean {
    this.from = related === null && this.armed !== null ? from : null;
    return this.from !== null;
  }

  // The element to give focus back to, when the guarded run's iframe holds it now.
  returnTo(active: Element | null): HTMLElement | null {
    const from = this.from, armed = this.armed;
    this.from = null;
    if (from === null || armed === null || active !== armed.frame || this.now() >= armed.until) return null;
    return from;
  }
}
