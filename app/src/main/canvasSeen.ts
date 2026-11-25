import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MarkerRead, RecordRead } from "./seenRecords";
import { validCanvasId } from "./seenRecords";

// Whether each canvas is new or changed since the person last had it on the canvas page. The state lives on this
// device only (`<userData>/canvas-seen.json` v3), so showing a canvas changes no project file; only TS reads it.

export type Verdict = "new" | "changed" | "seen";

// An older Doan's per-root memory (v1, v2), read only to convert a root not migrated yet: `legacy` mtimes, `baseline`
// fingerprints frozen until the shared records landed, `known` IDs that had a shared record at the last good read.
export interface RootMemory {
  legacy?: Record<string, number>;
  baseline?: Record<string, string>;
  known: Record<string, "seen" | "changed">;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const time = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const HASH = /^sha256:[0-9a-f]{64}$/;

function entries<T>(value: unknown, keep: (item: unknown) => item is T): Record<string, T> | undefined {
  if (!isObject(value)) return undefined;
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, T] => keep(entry[1])));
}

function memoryOf(item: unknown): RootMemory | undefined {
  if (!isObject(item)) return undefined;
  const memory: RootMemory = { known: entries(item.known, (v): v is "seen" | "changed" => v === "seen" || v === "changed") ?? {} };
  const legacy = entries(item.legacy, time);
  const baseline = entries(item.baseline, (v): v is string => typeof v === "string" && HASH.test(v));
  if (legacy) memory.legacy = legacy;
  if (baseline) memory.baseline = baseline;
  return memory;
}

// Field by field per canvas, `kept`'s first: one root's memory under two spellings.
function mergeMemory(kept: RootMemory | undefined, from: RootMemory): RootMemory {
  const merged: RootMemory = { known: { ...from.known, ...kept?.known } };
  const legacy = from.legacy || kept?.legacy ? { ...from.legacy, ...kept?.legacy } : undefined;
  const baseline = from.baseline || kept?.baseline ? { ...from.baseline, ...kept?.baseline } : undefined;
  if (legacy) merged.legacy = legacy;
  if (baseline) merged.baseline = baseline;
  return merged;
}

export interface LocalSeen {
  root(root: string): RootRecord | undefined;
  // The root's record moves and the file is written. A failed write leaves the memory ahead of the file: the next
  // write carries it and quit flushes it. For records whose loss is harmless (a first listing, a new-canvas verdict).
  set(root: string, record: RootRecord): void;
  // The root's record moves only once the file holds it: a canvas shown whose record could not be saved stays unseen.
  commit(root: string, record: RootRecord): boolean;
  // Writes the file if an earlier write failed. Called at quit.
  flushSync(): void;
  // Copies each alias root's record to its real path before the first listing; a spelling change is the same project
  // (mergeRoots). The alias's record stays. False, with nothing changed, when the file cannot be written.
  copyRoots(aliases: ReadonlyMap<string, string>): boolean;
  // What the load found: `corrupt`, a file that was not a canvas-seen.json, moved aside so this run starts empty;
  // `newer`, a later Doan's file, never overwritten, so this run's verdicts live in memory only.
  readonly problem: "corrupt" | "newer" | undefined;
}

// Synchronous temp-and-rename: the file is small, and a synchronous write cannot land after a later one.
function writeAtomic(file: string, text: string): void {
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temp, text, { flag: "wx", mode: 0o600 });
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

export function createLocalSeen(file: string, write: (file: string, text: string) => void = writeAtomic): LocalSeen {
  let roots = new Map<string, RootRecord>();
  let problem: LocalSeen["problem"];
  // Memory only: a later Doan's file, or a damaged one that could not be moved aside, is never overwritten.
  let frozen = false;
  let text: string | undefined;
  try { text = readFileSync(file, "utf8"); } catch { /* no file yet */ }
  if (text !== undefined) {
    const read = parseLocalSeen(text);
    if (read.kind === "ok") roots = read.roots;
    else if (read.kind === "newer") {
      problem = "newer";
      frozen = true;
    } else {
      // As onboarding.json: the damaged bytes are kept beside it for diagnosis, and every root starts as on its first
      // registration, so nothing lights up.
      problem = "corrupt";
      try { renameSync(file, join(dirname(file), `canvas-seen.corrupt-${randomUUID()}.json`)); } catch (error) {
        frozen = true;
        console.error("doan: cannot move the damaged canvas-seen.json aside", error);
      }
    }
  }
  let dirty = false;
  let written = frozen ? "" : localSeenText(roots);
  const save = (): boolean => {
    if (frozen) return true;
    const next = localSeenText(roots);
    if (next === written && !dirty) return true;
    try {
      write(file, next);
      written = next;
      dirty = false;
      return true;
    } catch (error) {
      dirty = true;
      console.error("doan: cannot save canvas-seen.json", error);
      return false;
    }
  };
  return {
    problem,
    root: root => roots.get(root),
    set(root, record) {
      roots.set(root, record);
      save();
    },
    commit(root, record) {
      const before = roots.get(root), wasDirty = dirty;
      roots.set(root, record);
      if (save()) return true;
      if (before === undefined) roots.delete(root);
      else roots.set(root, before);
      dirty = wasDirty;
      return false;
    },
    flushSync() { if (dirty) save(); },
    copyRoots(aliases) {
      if (frozen) return false;
      const next = new Map(roots);
      let changed = false;
      for (const [alias, real] of aliases) {
        const from = roots.get(alias), kept = next.get(real);
        if (!from || alias === real) continue;
        const merged = mergeRoots(kept, from);
        if (kept && JSON.stringify(merged) === JSON.stringify(kept)) continue;
        next.set(real, merged);
        changed = true;
      }
      if (!changed) return true;
      const previous = roots, wasDirty = dirty;
      roots = next;
      if (save() && !dirty) return true;
      // A failed write leaves the memory as it was read.
      roots = previous;
      dirty = wasDirty;
      return false;
    },
  };
}

export interface SeenRow {
  path: string;
  // As listed; only a valid ID that no other listed canvas of the root has keys a record.
  id?: string | undefined;
  mtimeMs?: number | undefined;
  // null when the HTML could not be read whole.
  fingerprint: string | null;
}
// A root's `.doan/seen/` as read once for its migration (seenRecords.ts).
export interface SeenReads { dir: "ok" | "absent" | "refused"; marker: MarkerRead; records: ReadonlyMap<string, RecordRead> }

// IDs listed once with a valid shape. A missing or duplicated ID keys nothing: its row keeps its last verdict and no
// record is written for it, so a path or a guessed ID never stands in for it.
export function uniqueIds(rows: readonly { id?: string | undefined }[]): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) if (validCanvasId(row.id)) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  return new Set([...counts].filter(([, count]) => count === 1).map(([id]) => id));
}

// The verdict an older Doan showed from the shared records and its v2 memory (no `legacy`: migrateRoot converts mtimes
// itself), used only to carry it into the local record. Anything the records cannot tell keeps `last`.
function judgeV2(memory: RootMemory, reads: SeenReads, rows: readonly SeenRow[], last: (row: SeenRow) => Verdict | undefined): Map<string, Verdict | undefined> {
  const baseline = memory.baseline;
  const ids = uniqueIds(rows);
  const verdicts = new Map<string, Verdict | undefined>();
  // A device that knew the project and finds no marker lost the records (a deleted folder, a checkout without them).
  const unreadable = reads.dir === "refused" || (reads.marker.kind !== "absent" && reads.marker.kind !== "present") ||
    (baseline === undefined && reads.marker.kind === "absent");
  const against = (row: SeenRow, base: string): Verdict | undefined => row.fingerprint === null ? last(row) : row.fingerprint === base ? "seen" : "changed";
  for (const row of rows) {
    if (row.id === undefined || !ids.has(row.id) || unreadable) { verdicts.set(row.path, last(row)); continue; }
    const record = reads.records.get(row.id) ?? { kind: "absent" };
    switch (record.kind) {
      case "seen": verdicts.set(row.path, against(row, record.html)); break;
      case "migrated": verdicts.set(row.path, "changed"); break;
      case "absent": {
        if (baseline !== undefined) {
          const base = baseline[row.id];
          verdicts.set(row.path, base === undefined ? "new" : against(row, base));
        } else verdicts.set(row.path, memory.known[row.id] !== undefined ? last(row) : "new");
        break;
      }
      default: verdicts.set(row.path, last(row));
    }
  }
  return verdicts;
}

// v3 keeps the whole read state on this device. `canvases` by ID: `{html}` (content last shown) or `{unseen}`;
// `migrated`: the root's `.doan/seen/` was read once and never again; `v2`: older memory kept until migrateRoot.

export type CanvasRecord = { html: string } | { unseen: "new" | "migrated" };
export interface RootRecord {
  migrated?: true;
  canvases: Record<string, CanvasRecord>;
  v2?: RootMemory;
}
// `corrupt`: not a canvas-seen.json at all; `newer`: a later Doan's, never overwritten.
export type LocalSeenRead = { kind: "ok"; roots: Map<string, RootRecord> } | { kind: "corrupt" | "newer" };

const canvasRecord = (value: unknown): value is CanvasRecord => isObject(value) && Object.keys(value).length === 1 &&
  ((typeof value.html === "string" && HASH.test(value.html)) || value.unseen === "new" || value.unseen === "migrated");
// A canvas ID such as "constructor" must not read Object.prototype.
const recordOf = (record: RootRecord, id: string): CanvasRecord | undefined => Object.hasOwn(record.canvases, id) ? record.canvases[id] : undefined;

// v1 and v2 roots become roots still to migrate, carrying their memory. A wrong-typed root, field or entry is dropped
// on its own; only a file that is not a versioned object with roots at all is corrupt.
export function parseLocalSeen(text: string): LocalSeenRead {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { kind: "corrupt" }; }
  if (!isObject(value) || typeof value.v !== "number") return { kind: "corrupt" };
  if (value.v > 3) return { kind: "newer" };
  const v = value.v;
  if ((v !== 1 && v !== 2 && v !== 3) || !isObject(value.roots)) return { kind: "corrupt" };
  const roots = new Map<string, RootRecord>();
  for (const [root, item] of Object.entries(value.roots)) {
    if (v === 1) {
      const legacy = entries(item, time);
      if (legacy) roots.set(root, { canvases: {}, v2: { legacy, known: {} } });
    } else if (v === 2) {
      const memory = memoryOf(item);
      if (memory) roots.set(root, { canvases: {}, v2: memory });
    } else if (isObject(item)) {
      const canvases = Object.fromEntries(Object.entries(entries(item.canvases, canvasRecord) ?? {}).filter(([id]) => validCanvasId(id)));
      const record: RootRecord = item.migrated === true ? { migrated: true, canvases } : { canvases };
      const memory = memoryOf(item.v2);
      if (memory) record.v2 = memory;
      roots.set(root, record);
    }
  }
  return { kind: "ok", roots };
}

export function localSeenText(roots: ReadonlyMap<string, RootRecord>): string {
  const value = Object.fromEntries([...roots].map(([root, record]) => [root, {
    ...(record.migrated ? { migrated: true } : {}), canvases: record.canvases, ...(record.v2 ? { v2: record.v2 } : {}),
  }]));
  return `${JSON.stringify({ v: 3, roots: value })}\n`;
}

// A root's one read of `.doan/seen/`, keeping each dot. Valid records under a present marker are copied only if this
// device remembers the root; every other row carries its v2 verdict or old mtime, else starts seen.
export function migrateRoot(memory: RootMemory | undefined, reads: SeenReads, rows: readonly SeenRow[], last: (row: SeenRow) => Verdict | undefined): RootRecord {
  const ids = uniqueIds(rows);
  // Only a root this device knew under an older Doan carries its shared records over: a new worktree or another machine
  // gets tracked records that say what someone else saw, and starts as a first registration instead.
  const copy = memory !== undefined && reads.dir === "ok" && reads.marker.kind === "present";
  const before = memory && !memory.legacy ? judgeV2(memory, reads, rows, last) : undefined;
  const canvases: Record<string, CanvasRecord> = {};
  for (const row of rows) {
    if (row.id === undefined || !ids.has(row.id)) continue;
    const read = reads.records.get(row.id);
    if (copy && read?.kind === "seen") { canvases[row.id] = { html: read.html }; continue; }
    if (copy && read?.kind === "migrated") { canvases[row.id] = { unseen: "migrated" }; continue; }
    let verdict: Verdict | undefined;
    if (memory?.legacy) {
      const seen = memory.legacy[row.path];
      verdict = seen !== undefined && seen === row.mtimeMs ? "seen" : "changed";
    } else verdict = before ? before.get(row.path) : last(row);
    if (verdict === "new") canvases[row.id] = { unseen: "new" };
    else if (verdict === "changed") canvases[row.id] = { unseen: "migrated" };
    // Seen, or never judged: the content now is the baseline. Unreadable content has none, so no record.
    else if (row.fingerprint !== null) canvases[row.id] = { html: row.fingerprint };
  }
  return { migrated: true, canvases };
}

// The first listing after start or registration records every unique ID without a record as seen, so canvases that
// appeared while the app was not watching light nothing. Existing records are kept; the same record when nothing is added.
export function absorbFirst(record: RootRecord, rows: readonly SeenRow[]): RootRecord {
  const ids = uniqueIds(rows);
  const added: Record<string, CanvasRecord> = {};
  for (const row of rows) {
    if (row.id === undefined || !ids.has(row.id) || row.fingerprint === null || recordOf(record, row.id)) continue;
    added[row.id] = { html: row.fingerprint };
  }
  return Object.keys(added).length === 0 ? record : { ...record, canvases: { ...record.canvases, ...added } };
}

// The verdict of every listed canvas of one root from its local record. A missing or duplicated ID, or content that
// cannot be read, keeps `last`; a unique ID without a record shows nothing (it is still pending, decided elsewhere).
export function judge(record: RootRecord, rows: readonly SeenRow[], last: (row: SeenRow) => Verdict | undefined): Map<string, Verdict | undefined> {
  const ids = uniqueIds(rows);
  const verdicts = new Map<string, Verdict | undefined>();
  for (const row of rows) {
    if (row.id === undefined || !ids.has(row.id)) { verdicts.set(row.path, last(row)); continue; }
    const kept = recordOf(record, row.id);
    if (kept === undefined) verdicts.set(row.path, undefined);
    else if ("unseen" in kept) verdicts.set(row.path, kept.unseen === "new" ? "new" : "changed");
    else verdicts.set(row.path, row.fingerprint === null ? last(row) : row.fingerprint === kept.html ? "seen" : "changed");
  }
  return verdicts;
}

// Records `hash` as shown for `row`, whatever it held before (also a pending ID). A row without an ID unique among
// `rows` records nothing. The same record when nothing changes, so the caller writes only what moved.
export function markShown(record: RootRecord, row: { id?: string | undefined }, hash: string, rows: readonly { id?: string | undefined }[]): RootRecord {
  if (row.id === undefined || !uniqueIds(rows).has(row.id)) return record;
  const kept = recordOf(record, row.id);
  if (kept && "html" in kept && kept.html === hash) return record;
  return { ...record, canvases: { ...record.canvases, [row.id]: { html: hash } } };
}

// One root under two spellings (FolderStore's alias step): the real path's record wins per canvas and the alias's fills
// what it lacks. Migrated if either was, and then the older memory has nothing left to do.
export function mergeRoots(real: RootRecord | undefined, alias: RootRecord): RootRecord {
  const canvases = { ...alias.canvases, ...real?.canvases };
  if (real?.migrated || alias.migrated) return { migrated: true, canvases };
  const v2 = alias.v2 ? mergeMemory(real?.v2, alias.v2) : real?.v2;
  return v2 ? { canvases, v2 } : { canvases };
}
