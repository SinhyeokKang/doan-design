import { randomBytes } from "node:crypto";
import { readFileSync, renameSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { validProvider, type Provider } from "./agentAuth/types";
import { permissionModeId, type PermissionModeId } from "./conversation/permissionMode";

// `<userData>/preferences.json` (buzz-settings design '포맷 변경'). Only TS writes and reads it, so, like ui-state,
// its tests are its schema.

export interface NotificationPreferences { enabled: boolean; approval: boolean; finished: boolean; failed: boolean }
// null is Last used: Home starts from the conversation sent last, as before this file existed.
// permissionMode: Default is stored as no key.
export interface NewConversationPreference { provider: Provider; model?: string; effort?: string; permissionMode?: Exclude<PermissionModeId, "default"> }
export interface Preferences { v: 1; notifications: NotificationPreferences; newConversation: NewConversationPreference | null }
// broken: unreadable, so defaults apply until a change moves it aside. newer: a later Doan wrote it; never touched.
export type PreferencesNotice = "broken" | "newer" | null;
export interface PreferencesSnapshot { preferences: Preferences; notice: PreferencesNotice }
export interface PreferencesPatch { notifications?: Partial<NotificationPreferences>; newConversation?: NewConversationPreference | null }
// The snapshot is what applies after the reply: on a refusal or failure, the last saved choices.
export type PreferencesWriteReply = { ok: true; snapshot: PreferencesSnapshot } | { ok: false; reason: "invalid" | "newer" | "write_failed"; snapshot: PreferencesSnapshot };

export const DEFAULT_PREFERENCES: Preferences = { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: null };

const SWITCHES = ["enabled", "approval", "finished", "failed"] as const;
// Model and effort ids come from a provider's model list; the bound only keeps a hostile file small.
const MAX_ID = 256;

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= MAX_ID;

function notifications(value: unknown, base: NotificationPreferences, partial: boolean): Partial<NotificationPreferences> | null {
  if (!record(value)) return null;
  const keys = Object.keys(value);
  if (partial && (keys.length === 0 || keys.some(key => !(SWITCHES as readonly string[]).includes(key)))) return null;
  const read: Partial<NotificationPreferences> = partial ? {} : { ...base };
  for (const key of SWITCHES) {
    const set = value[key];
    if (set === undefined) continue;
    if (typeof set !== "boolean") return null;
    read[key] = set;
  }
  return read;
}

const CHOICE_KEYS = ["provider", "model", "effort", "permissionMode"];
// undefined: not a valid choice. `exact` refuses unknown fields and modes, as a renderer request must. Read from the
// file, a mode this build cannot read is the one field that reads as Default rather than breaking the file: a later
// build may add modes.
function newConversation(value: unknown, exact: boolean): NewConversationPreference | null | undefined {
  if (value === null) return null;
  if (!record(value) || !validProvider(value.provider)) return undefined;
  if (exact && Object.keys(value).some(key => !CHOICE_KEYS.includes(key))) return undefined;
  if ((value.model !== undefined && !id(value.model)) || (value.effort !== undefined && !id(value.effort))) return undefined;
  if (exact && value.permissionMode !== undefined && !permissionModeId(value.permissionMode)) return undefined;
  const mode = permissionModeId(value.permissionMode) && value.permissionMode !== "default" ? value.permissionMode : undefined;
  return { provider: value.provider, ...(value.model === undefined ? {} : { model: value.model as string }), ...(value.effort === undefined ? {} : { effort: value.effort as string }), ...(mode ? { permissionMode: mode } : {}) };
}

// null text: no file. Unknown fields are ignored and a known field left out takes its default; a known field with
// a wrong value makes the whole file broken rather than half-applied.
export function parsePreferences(text: string | null): PreferencesSnapshot {
  const defaults = { preferences: DEFAULT_PREFERENCES, notice: null };
  const broken = { preferences: DEFAULT_PREFERENCES, notice: "broken" as const };
  if (text === null) return defaults;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return broken; }
  if (!record(value) || typeof value.v !== "number" || !Number.isInteger(value.v) || value.v < 1) return broken;
  if (value.v > 1) return { preferences: DEFAULT_PREFERENCES, notice: "newer" };
  const switches = value.notifications === undefined ? DEFAULT_PREFERENCES.notifications : notifications(value.notifications, DEFAULT_PREFERENCES.notifications, false);
  const choice = value.newConversation === undefined ? null : newConversation(value.newConversation, false);
  if (switches === null || choice === undefined) return broken;
  return { preferences: { v: 1, notifications: switches as NotificationPreferences, newConversation: choice }, notice: null };
}

export function parsePreferencesPatch(value: unknown): PreferencesPatch | null {
  if (!record(value)) return null;
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some(key => key !== "notifications" && key !== "newConversation")) return null;
  const patch: PreferencesPatch = {};
  if ("notifications" in value) {
    const switches = notifications(value.notifications, DEFAULT_PREFERENCES.notifications, true);
    if (switches === null) return null;
    patch.notifications = switches;
  }
  if ("newConversation" in value) {
    const choice = newConversation(value.newConversation, true);
    if (choice === undefined) return null;
    patch.newConversation = choice;
  }
  return patch;
}

export function mergePreferences(current: Preferences, patch: PreferencesPatch): Preferences {
  return {
    v: 1,
    notifications: { ...current.notifications, ...patch.notifications },
    newConversation: patch.newConversation === undefined ? current.newConversation : patch.newConversation,
  };
}

// The same write as ui-state: one at a time, an exclusive temporary file, then a rename over the old one.
export interface PreferencesFs {
  readFileSync(path: string): string;
  writeFile(path: string, text: string): Promise<void>;
  renameSync(from: string, to: string): void;
  unlink(path: string): Promise<void>;
}

const defaultFs: PreferencesFs = {
  readFileSync: path => readFileSync(path, "utf8"),
  writeFile: (path, text) => writeFile(path, text, { flag: "wx" }),
  renameSync: (from, to) => renameSync(from, to),
  unlink: path => unlink(path),
};

const missing = (error: unknown) => record(error) && error.code === "ENOENT";

export function createPreferencesStore(file: string, options: { fs?: Partial<PreferencesFs>; now?: () => Date } = {}) {
  const fs: PreferencesFs = { ...defaultFs, ...options.fs };
  const now = options.now ?? (() => new Date());
  let snapshot: PreferencesSnapshot | null = null;
  let writing: Promise<unknown> = Promise.resolve();

  // Read once, synchronously: notifications ask for the switches on every conversation event.
  const load = (): PreferencesSnapshot => {
    if (snapshot) return snapshot;
    let text: string | null;
    try { text = fs.readFileSync(file); } catch (error) { text = missing(error) ? null : ""; }
    snapshot = parsePreferences(text);
    return snapshot;
  };

  const save = async (next: Preferences): Promise<PreferencesWriteReply> => {
    const before = load();
    if (before.notice === "broken") {
      try { fs.renameSync(file, `${file}.broken-${now().toISOString().replace(/[:.]/g, "-")}`); } catch (error) {
        if (!missing(error)) { console.error("doan: cannot move the unreadable preferences.json aside", error); return { ok: false, reason: "write_failed", snapshot: before }; }
      }
    }
    const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      await fs.writeFile(temp, `${JSON.stringify(next)}\n`);
      fs.renameSync(temp, file);
    } catch (error) {
      await fs.unlink(temp).catch(() => {});
      console.error("doan: cannot save preferences.json", error);
      return { ok: false, reason: "write_failed", snapshot: load() };
    }
    snapshot = { preferences: next, notice: null };
    return { ok: true, snapshot };
  };

  return {
    read: load,
    current: (): Preferences => load().preferences,
    // Validates the renderer's change; each one merges onto what the one before it saved.
    update(value: unknown): Promise<PreferencesWriteReply> {
      const patch = parsePreferencesPatch(value);
      const result = writing.then((): Promise<PreferencesWriteReply> | PreferencesWriteReply => {
        const current = load();
        if (patch === null) return { ok: false, reason: "invalid", snapshot: current };
        if (current.notice === "newer") return { ok: false, reason: "newer", snapshot: current };
        return save(mergePreferences(current.preferences, patch));
      });
      writing = result.catch(() => undefined);
      return result;
    },
  };
}

export type PreferencesStore = ReturnType<typeof createPreferencesStore>;
