// A reloaded canvas's own focus() pulls focus into its iframe, and neither `inert` nor the focus policy stops it. The
// host cannot tell that from a click, so it returns focus only for a run created while focus was in the column.
export const FOCUS_GUARD_MS = 1000;

export class ColumnFocusGuard {
  private armed: { gen: number; until: number } | null = null;
  // Waiting for the one-task-later check.
  private from: HTMLElement | null = null;

  constructor(private readonly now: () => number) {}

  // A newer run replaces the guard, armed by where focus is now.
  created(gen: number, columnHasFocus: boolean): void {
    this.armed = columnHasFocus ? { gen, until: Infinity } : null;
  }

  // The guard ends a second later.
  shown(gen: number): void {
    if (this.armed?.gen === gen && this.armed.until === Infinity) this.armed.until = this.now() + FOCUS_GUARD_MS;
  }

  // True when it may have gone into an iframe, so the host checks one task later.
  left(from: HTMLElement, related: EventTarget | null): boolean {
    this.from = related === null && this.armed !== null ? from : null;
    return this.from !== null;
  }

  // By gen, as the host holds them.
  returnTo(active: Element | null, frameOf: (gen: number) => HTMLIFrameElement | null): HTMLElement | null {
    const from = this.from, armed = this.armed;
    this.from = null;
    if (from === null || armed === null || active === null || active !== frameOf(armed.gen) || this.now() >= armed.until) return null;
    return from;
  }
}
