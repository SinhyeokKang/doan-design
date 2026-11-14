import { describe, expect, test } from "vitest";
import type { UiState } from "../../restore/uiState";
import { DEFAULT_PREFERENCES } from "../preferences";
import { createComposerSettings } from "./composerSettings";
import type { PrototypeComposerSettings } from "./ipc";

// The composer settings main pushes the prototype window: a read of ui-state.json that finishes late never publishes
// what the main window's newer save already replaced (POSTMORTEM 2026-10-26: an earlier read can land after a newer
// value).
const ui = (provider: "claude" | "codex"): UiState => ({ screen: "home", expanded: {}, lastByRoot: {}, home: { lastProvider: provider } });

function setup() {
  const reads: ((value: UiState | null) => void)[] = [];
  const sent: PrototypeComposerSettings[] = [];
  let preferences = DEFAULT_PREFERENCES;
  const settings = createComposerSettings({
    read: () => new Promise(resolve => { reads.push(resolve); }),
    preferences: () => preferences,
    open: () => true,
    send: value => sent.push(value),
  });
  return { settings, reads, sent, setPreferences: (next: typeof preferences) => { preferences = next; } };
}
const providers = (sent: PrototypeComposerSettings[]) => sent.map(value => value.home?.lastProvider);

describe("composer settings pushes", () => {
  test("a disk read that finishes after a newer save publishes nothing older", async () => {
    const { settings, reads, sent, setPreferences } = setup();
    setPreferences({ ...DEFAULT_PREFERENCES, buddy: "puri" });
    const preferencesPush = settings.changed();
    await settings.saved(ui("codex"));
    reads[0]!(ui("claude"));
    await preferencesPush;
    expect(providers(sent)).toEqual(["codex"]);
  });

  test("a disk read that finishes before the save is followed by the save's value", async () => {
    const { settings, reads, sent, setPreferences } = setup();
    setPreferences({ ...DEFAULT_PREFERENCES, buddy: "puri" });
    const preferencesPush = settings.changed();
    reads[0]!(ui("claude"));
    await preferencesPush;
    await settings.saved(ui("codex"));
    expect(providers(sent)).toEqual(["claude", "codex"]);
  });

  test("the window's own read answers the newest value too", async () => {
    const { settings, reads } = setup();
    const read = settings.read();
    await settings.saved(ui("codex"));
    reads[0]!(ui("claude"));
    expect((await read).home?.lastProvider).toBe("codex");
  });
});
