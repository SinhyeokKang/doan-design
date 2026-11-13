// The prototype window's Back/Forward list. `index` is the current entry, -1 while empty.
export interface History<T> {
  readonly entries: readonly T[];
  readonly index: number;
}

export type Direction = "back" | "forward";

export const EMPTY_HISTORY: History<never> = { entries: [], index: -1 };

export function recordEntry<T>(history: History<T>, entry: T, same: (a: T, b: T) => boolean): History<T> {
  const current = history.entries[history.index];
  if (current !== undefined && same(current, entry)) return history;
  return { entries: [...history.entries.slice(0, history.index + 1), entry], index: history.index + 1 };
}

// Skipped entries stay: a frame that is gone now may be restored before the person comes back to it.
export function stepHistory<T>(history: History<T>, direction: Direction, usable: (entry: T) => boolean): History<T> | null {
  if (history.index < 0) return null;
  const delta = direction === "back" ? -1 : 1;
  for (let i = history.index + delta; i >= 0 && i < history.entries.length; i += delta) {
    if (usable(history.entries[i]!)) return { entries: history.entries, index: i };
  }
  return null;
}

export function canStep<T>(history: History<T>, direction: Direction, usable: (entry: T) => boolean): boolean {
  return stepHistory(history, direction, usable) !== null;
}
