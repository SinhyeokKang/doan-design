// The canvas page's three folding columns, true while shown (the inspector by its saved flag, so a yielding one counts).
export interface UiColumns { sidebar: boolean; conversation: boolean; inspector: boolean }

const FOLDED: UiColumns = { sidebar: false, conversation: false, inspector: false };
// What Show UI brings back when nothing was hidden by Hide UI: the first-launch layout.
const DEFAULT_SHOWN: UiColumns = { sidebar: true, conversation: true, inspector: false };

export function uiHidden(shown: UiColumns): boolean {
  return !shown.sidebar && !shown.conversation && !shown.inspector;
}

export function toggleUi(shown: UiColumns, saved: UiColumns | null): { shown: UiColumns; saved: UiColumns | null } {
  if (!uiHidden(shown)) return { shown: FOLDED, saved: shown };
  return { shown: saved ?? DEFAULT_SHOWN, saved: null };
}

// A column shown by its own control ends Hide UI, so a later ⌘\ never brings back a stale set.
export function keptColumns(shown: UiColumns, saved: UiColumns | null): UiColumns | null {
  return uiHidden(shown) ? saved : null;
}
