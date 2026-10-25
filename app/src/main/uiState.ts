import { randomBytes } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { parseUiState, type UiState } from "../restore/uiState";
import { parseSettingsTab, type SettingsTab } from "./settings";

export const UI_STATE_DELAY_MS = 500;

export interface UiStateStore {
  // The file as validated against the saved roots now; null on any failure,
  // which starts at home and is overwritten by the next save (as folders.json).
  read(): Promise<UiState | null>;
  // Validates the renderer's value and schedules a write of what survived;
  // false when the whole value is refused (wrong shape or over 64 KiB).
  save(value: unknown): boolean;
  // Writes the last accepted value now, synchronously, unless it is already on
  // disk: the app is quitting, and neither the debounce nor a write still
  // running would finish.
  flushSync(): void;
  // Settles after the current write, for callers that must not race it.
  idle(): Promise<void>;
  // The Settings window's last tab, kept in the same file beside the main
  // window's state; neither window's save drops the other's part.
  readSettingsTab(): SettingsTab | null;
  saveSettingsTab(value: unknown): boolean;
}

// The rename is synchronous on purpose: an async rename already handed to the
// thread pool cannot be called back, so it could land after a quit's sync
// flush and put an older value on disk.
export interface UiStateFs {
  writeFile(path: string, text: string): Promise<void>;
  renameSync(from: string, to: string): void;
}

const defaultFs: UiStateFs = {
  writeFile: (path, text) => writeFile(path, text, { flag: "wx" }),
  renameSync,
};

const tempName = (file: string) => `${file}.${randomBytes(6).toString("hex")}.tmp`;

export function createUiStateStore(file: string, savedRoots: () => readonly string[], delayMs = UI_STATE_DELAY_MS, fs: UiStateFs = defaultFs): UiStateStore {
  // The newest accepted value that is not on disk yet, whether its write is
  // waiting for the debounce or already running; a quit flush writes it.
  let unsaved: string | null = null;
  let timer: NodeJS.Timeout | undefined;
  // Writes run one after another so an older value never renames over a newer
  // one; `latest` also stops a queued write that a quit's sync flush overtook.
  let writing: Promise<void> = Promise.resolve();
  let latest = 0;
  // The two parts of the file as last saved or, before the first save of
  // this run, as read from disk once (synchronously: the file is at most
  // 64 KiB and a quit flush must be able to compose it).
  let loaded = false;
  let main: UiState | null = null;
  let tab: SettingsTab | null = null;
  const load = () => {
    if (loaded) return;
    loaded = true;
    try {
      const text = readFileSync(file, "utf8");
      main = parseUiState(text, savedRoots());
      const value: unknown = JSON.parse(text);
      tab = typeof value === "object" && value !== null ? parseSettingsTab(Reflect.get(value, "settingsTab")) : null;
    } catch {
      // A missing or broken file has nothing to keep.
    }
  };
  const compose = () => {
    const state = main ?? { screen: "home", expanded: {}, lastByRoot: {} };
    return `${JSON.stringify(tab === null ? state : { ...state, settingsTab: tab })}\n`;
  };
  const schedule = () => {
    const next = compose();
    unsaved = next;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void write(next);
    }, delayMs);
  };

  const write = (text: string): Promise<void> => {
    const seq = ++latest;
    writing = writing.then(async () => {
      if (seq !== latest) return;
      const temp = tempName(file);
      try {
        await fs.writeFile(temp, text);
        if (seq !== latest) throw new Error("superseded");
        fs.renameSync(temp, file);
        if (unsaved === text) unsaved = null;
      } catch (error) {
        await unlink(temp).catch(() => {});
        if (seq === latest) console.error("doan: cannot save ui-state.json", error);
      }
    });
    return writing;
  };

  return {
    async read() {
      try {
        return parseUiState(await readFile(file, "utf8"), savedRoots());
      } catch {
        return null;
      }
    },
    save(value) {
      let text: string | undefined;
      try {
        text = JSON.stringify(value);
      } catch {
        return false;
      }
      // `parseUiState` measures the bytes, so the 64 KiB limit applies to what
      // the renderer sent, before unknown fields are dropped.
      const state = text === undefined ? null : parseUiState(text, savedRoots());
      if (state === null) return false;
      load();
      main = state;
      schedule();
      return true;
    },
    flushSync() {
      clearTimeout(timer);
      timer = undefined;
      const next = unsaved;
      unsaved = null;
      if (next === null) return;
      latest++;
      const temp = tempName(file);
      try {
        writeFileSync(temp, next, { flag: "wx" });
        renameSync(temp, file);
      } catch (error) {
        console.error("doan: cannot save ui-state.json", error);
      } finally {
        rmSync(temp, { force: true });
      }
    },
    idle: () => writing,
    readSettingsTab() {
      load();
      return tab;
    },
    saveSettingsTab(value) {
      const next = parseSettingsTab(value);
      if (next === null) return false;
      load();
      tab = next;
      schedule();
      return true;
    },
  };
}
