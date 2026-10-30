import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createPreferencesStore, DEFAULT_PREFERENCES, mergePreferences, parsePreferences, parsePreferencesPatch, type PreferencesFs } from "./preferences";

// buzz-settings design '포맷 변경': `<userData>/preferences.json`, written and read by TS only, kept by these tests.
const FULL = { v: 1, notifications: { enabled: false, approval: true, finished: false, failed: true }, newConversation: { provider: "codex", model: "gpt-6", effort: "high" } };

describe("parsePreferences", () => {
  test("defaults: notifications all on, Last used for new conversations", () => {
    expect(DEFAULT_PREFERENCES).toEqual({ v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: null });
  });

  test("a missing file is the defaults, with no notice", () => {
    expect(parsePreferences(null)).toEqual({ preferences: DEFAULT_PREFERENCES, notice: null });
  });

  test("reads every field of a v1 file", () => {
    expect(parsePreferences(JSON.stringify(FULL))).toEqual({ preferences: FULL, notice: null });
    const lastUsed = { ...FULL, newConversation: null };
    expect(parsePreferences(JSON.stringify(lastUsed))).toEqual({ preferences: lastUsed, notice: null });
    const providerOnly = { ...FULL, newConversation: { provider: "claude" } };
    expect(parsePreferences(JSON.stringify(providerOnly))).toEqual({ preferences: providerOnly, notice: null });
  });

  test("ignores unknown fields, and a known field left out takes its default", () => {
    const read = parsePreferences(JSON.stringify({ v: 1, theme: "dark", notifications: { approval: false, sound: "ping" }, newConversation: { provider: "cursor", color: 1 } }));
    expect(read).toEqual({ preferences: { v: 1, notifications: { enabled: true, approval: false, finished: true, failed: true }, newConversation: { provider: "cursor" } }, notice: null });
    expect(parsePreferences(JSON.stringify({ v: 1 }))).toEqual({ preferences: DEFAULT_PREFERENCES, notice: null });
  });

  test("a broken file is the defaults with the read notice", () => {
    for (const text of ["", "{", "null", "[]", "1", JSON.stringify({ notifications: FULL.notifications }), JSON.stringify({ v: 0 }), JSON.stringify({ v: "1" }), JSON.stringify({ v: 1.5 }),
      JSON.stringify({ ...FULL, notifications: { ...FULL.notifications, enabled: "yes" } }), JSON.stringify({ ...FULL, notifications: [] }),
      JSON.stringify({ ...FULL, newConversation: { provider: "gemini" } }), JSON.stringify({ ...FULL, newConversation: { model: "x" } }),
      JSON.stringify({ ...FULL, newConversation: { provider: "codex", model: "" } }), JSON.stringify({ ...FULL, newConversation: { provider: "codex", effort: 3 } }),
      JSON.stringify({ ...FULL, newConversation: "codex" })]) {
      expect(parsePreferences(text), text).toEqual({ preferences: DEFAULT_PREFERENCES, notice: "broken" });
    }
  });

  test("a file from a newer version is the defaults with its own notice", () => {
    expect(parsePreferences(JSON.stringify({ ...FULL, v: 2 }))).toEqual({ preferences: DEFAULT_PREFERENCES, notice: "newer" });
    expect(parsePreferences(JSON.stringify({ v: 7, notifications: "anything" }))).toEqual({ preferences: DEFAULT_PREFERENCES, notice: "newer" });
  });
});

describe("changing preferences", () => {
  test("a patch changes only what it names", () => {
    const patch = parsePreferencesPatch({ notifications: { finished: false } });
    expect(patch).toEqual({ notifications: { finished: false } });
    expect(mergePreferences(DEFAULT_PREFERENCES, patch!)).toEqual({ ...DEFAULT_PREFERENCES, notifications: { ...DEFAULT_PREFERENCES.notifications, finished: false } });
    const pick = parsePreferencesPatch({ newConversation: { provider: "codex", model: "gpt-6" } });
    expect(mergePreferences(FULL as never, pick!)).toEqual({ ...FULL, newConversation: { provider: "codex", model: "gpt-6" } });
    expect(mergePreferences(FULL as never, parsePreferencesPatch({ newConversation: null })!)).toEqual({ ...FULL, newConversation: null });
  });

  test("refuses a patch that is not exactly one of the known shapes", () => {
    for (const value of [undefined, null, {}, [], "x", { v: 1 }, { notifications: {} }, { notifications: { enabled: 1 } }, { notifications: { sound: true } },
      { newConversation: { provider: "gemini" } }, { newConversation: { provider: "codex", model: 1 } }, { newConversation: { provider: "codex", extra: "x" } },
      { newConversation: { provider: "codex", model: "x".repeat(257) } }, { notifications: { enabled: true }, other: 1 }]) {
      expect(parsePreferencesPatch(value), JSON.stringify(value)).toBeNull();
    }
  });
});

describe("preferences store", () => {
  let dir: string;
  let file: string;
  const now = () => new Date("2026-10-30T10:15:00.123Z");
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "doan-preferences-")); file = join(dir, "preferences.json"); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const onDisk = () => JSON.parse(readFileSync(file, "utf8")) as unknown;
  const names = () => readdirSync(dir).sort();

  test("starts from the defaults without a file and writes the first change", async () => {
    const store = createPreferencesStore(file, { now });
    expect(store.read()).toEqual({ preferences: DEFAULT_PREFERENCES, notice: null });
    const reply = await store.update({ notifications: { enabled: false } });
    const preferences = { ...DEFAULT_PREFERENCES, notifications: { ...DEFAULT_PREFERENCES.notifications, enabled: false } };
    expect(reply).toEqual({ ok: true, snapshot: { preferences, notice: null } });
    expect(onDisk()).toEqual(preferences);
    expect(store.current()).toEqual(preferences);
    expect(names()).toEqual(["preferences.json"]);
  });

  test("keeps what an existing file says, drops unknown fields on the next write", async () => {
    writeFileSync(file, JSON.stringify({ ...FULL, theme: "dark" }));
    const store = createPreferencesStore(file, { now });
    expect(store.read()).toEqual({ preferences: FULL, notice: null });
    await store.update({ notifications: { enabled: true } });
    expect(onDisk()).toEqual({ ...FULL, notifications: { ...FULL.notifications, enabled: true } });
  });

  test("a broken file is moved aside only when a value changes, then written anew", async () => {
    writeFileSync(file, "{ not json");
    const store = createPreferencesStore(file, { now });
    expect(store.read()).toEqual({ preferences: DEFAULT_PREFERENCES, notice: "broken" });
    expect(names()).toEqual(["preferences.json"]);
    const reply = await store.update({ notifications: { approval: false } });
    expect(reply).toMatchObject({ ok: true, snapshot: { notice: null } });
    expect(names()).toEqual(["preferences.json", "preferences.json.broken-2026-10-30T10-15-00-123Z"]);
    expect(readFileSync(join(dir, "preferences.json.broken-2026-10-30T10-15-00-123Z"), "utf8")).toBe("{ not json");
    expect(onDisk()).toEqual({ ...DEFAULT_PREFERENCES, notifications: { ...DEFAULT_PREFERENCES.notifications, approval: false } });
    expect(store.read().notice).toBeNull();
  });

  test("a newer file is never moved or written; changes are refused", async () => {
    const newer = JSON.stringify({ ...FULL, v: 2 });
    writeFileSync(file, newer);
    const store = createPreferencesStore(file, { now });
    expect(store.read()).toEqual({ preferences: DEFAULT_PREFERENCES, notice: "newer" });
    expect(await store.update({ notifications: { enabled: false } })).toEqual({ ok: false, reason: "newer", snapshot: { preferences: DEFAULT_PREFERENCES, notice: "newer" } });
    expect(readFileSync(file, "utf8")).toBe(newer);
    expect(names()).toEqual(["preferences.json"]);
  });

  test("an invalid change is refused and changes nothing", async () => {
    const store = createPreferencesStore(file, { now });
    expect(await store.update({ notifications: { enabled: "no" } })).toEqual({ ok: false, reason: "invalid", snapshot: { preferences: DEFAULT_PREFERENCES, notice: null } });
    expect(names()).toEqual([]);
  });

  test("a failed write keeps the last saved choices in effect and leaves no temporary file", async () => {
    writeFileSync(file, JSON.stringify(FULL));
    const fs: Partial<PreferencesFs> = { writeFile: vi.fn(async () => { throw new Error("disk full"); }) };
    const store = createPreferencesStore(file, { now, fs });
    expect(await store.update({ notifications: { enabled: true } })).toEqual({ ok: false, reason: "write_failed", snapshot: { preferences: FULL, notice: null } });
    expect(store.current()).toEqual(FULL);
    expect(onDisk()).toEqual(FULL);
    expect(names()).toEqual(["preferences.json"]);
  });

  test("a broken file that cannot be moved aside is not overwritten", async () => {
    writeFileSync(file, "broken");
    const fs: Partial<PreferencesFs> = { renameSync: vi.fn(() => { throw new Error("EPERM"); }) };
    const store = createPreferencesStore(file, { now, fs });
    expect(await store.update({ notifications: { enabled: false } })).toMatchObject({ ok: false, reason: "write_failed", snapshot: { notice: "broken" } });
    expect(readFileSync(file, "utf8")).toBe("broken");
  });

  test("changes are written one after another, so the last one is on disk", async () => {
    const store = createPreferencesStore(file, { now });
    const first = store.update({ notifications: { approval: false } });
    const second = store.update({ newConversation: { provider: "claude", effort: "low" } });
    await Promise.all([first, second]);
    expect(onDisk()).toEqual({ v: 1, notifications: { enabled: true, approval: false, finished: true, failed: true }, newConversation: { provider: "claude", effort: "low" } });
  });
});
