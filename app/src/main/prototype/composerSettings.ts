// The prototype window's composer settings (`prototype:composer` and its push). The main window's saves come here as
// main parsed them, and the file stands in only until the first; a read of the file that finishes after a save takes
// the save instead, and a push overtaken by a newer one is dropped, so the window never gets an older value last
// (an earlier read can land after a newer value: POSTMORTEM 2026-10-26). Electron-free.
import type { UiState } from "../../restore/uiState";
import type { Preferences } from "../preferences";
import { prototypeComposerSettings } from "./conversationScope";
import type { PrototypeComposerSettings } from "./ipc";

export interface ComposerSettingsDeps {
  // ui-state.json as on disk, which lags behind the main window's saves.
  read(): Promise<UiState | null>;
  preferences(): Preferences;
  // The prototype window is open.
  open(): boolean;
  send(settings: PrototypeComposerSettings): void;
}

export function createComposerSettings(deps: ComposerSettingsDeps) {
  let saved: UiState | null | undefined;
  let sent: string | null = null;
  let revision = 0;
  const current = async (): Promise<PrototypeComposerSettings> => {
    const read = saved === undefined ? await deps.read() : null;
    return prototypeComposerSettings(saved !== undefined ? saved : read, deps.preferences());
  };
  const changed = async (): Promise<void> => {
    if (!deps.open()) return;
    const mine = ++revision;
    const settings = await current();
    if (mine !== revision) return;
    const text = JSON.stringify(settings);
    if (text === sent) return;
    sent = text;
    deps.send(settings);
  };
  return {
    // The main window saved ui-state, as main parsed it.
    saved(ui: UiState | null): Promise<void> { saved = ui; return changed(); },
    // Preferences changed.
    changed,
    async read(): Promise<PrototypeComposerSettings> {
      const settings = await current();
      sent = JSON.stringify(settings);
      return settings;
    },
  };
}
