import { describe, expect, test } from "vitest";
import { keptColumns, toggleUi, uiHidden, type UiColumns } from "./hideUi";

const columns = (sidebar: boolean, conversation: boolean, inspector: boolean): UiColumns => ({ sidebar, conversation, inspector });
const ALL_FOLDED = columns(false, false, false);

// PRODUCT §5 item 2 'Hide UI': ⌘\ folds the sidebar, the conversation panel and the inspector together, and the
// next ⌘\ brings back exactly what was shown.
describe("toggleUi", () => {
  test("folds every shown column and remembers which were shown", () => {
    for (const shown of [columns(true, true, true), columns(true, false, false), columns(false, true, false), columns(false, false, true), columns(true, true, false)]) {
      expect(toggleUi(shown, null)).toEqual({ shown: ALL_FOLDED, saved: shown });
    }
  });

  test("brings back exactly the remembered columns, leaving folded ones folded", () => {
    const saved = columns(true, false, true);
    expect(toggleUi(ALL_FOLDED, saved)).toEqual({ shown: saved, saved: null });
  });

  test("with everything folded and nothing remembered, shows the sidebar and the conversation panel", () => {
    expect(toggleUi(ALL_FOLDED, null)).toEqual({ shown: columns(true, true, false), saved: null });
  });

  test("a column shown since hiding replaces what was remembered: the next press hides again", () => {
    const stale = columns(true, true, true);
    expect(toggleUi(columns(true, false, false), stale)).toEqual({ shown: ALL_FOLDED, saved: columns(true, false, false) });
  });
});

describe("uiHidden", () => {
  test("is true only while all three columns are folded", () => {
    expect(uiHidden(ALL_FOLDED)).toBe(true);
    expect(uiHidden(columns(true, false, false))).toBe(false);
    expect(uiHidden(columns(false, true, false))).toBe(false);
    expect(uiHidden(columns(false, false, true))).toBe(false);
  });
});

// Showing any column by its own control (⌘B, Show conversation, Show inspector, an entry that unfolds the panel)
// ends Hide UI, so a later ⌘\ never brings back a stale set.
describe("keptColumns", () => {
  test("keeps what was remembered while all three stay folded", () => {
    const saved = columns(true, true, false);
    expect(keptColumns(ALL_FOLDED, saved)).toBe(saved);
  });

  test("forgets it once any column shows", () => {
    const saved = columns(true, true, false);
    for (const shown of [columns(true, false, false), columns(false, true, false), columns(false, false, true)]) expect(keptColumns(shown, saved)).toBeNull();
  });

  test("stays empty when nothing was remembered", () => {
    expect(keptColumns(ALL_FOLDED, null)).toBeNull();
  });
});
