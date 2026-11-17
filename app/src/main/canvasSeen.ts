import { randomBytes } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { MarkerRead, RecordRead, RecordValue } from "./seenRecords";
import { validCanvasId } from "./seenRecords";

// Whether each canvas is new or changed since the person last had it on the canvas page. The shared truth is the
// project's `.doan/seen/` records (seenRecords.ts), compared by HTML content; this file holds the pure verdicts and the
// device-local memory beside them.
//
// `<userData>/canvas-seen.json` v2 is that memory, per root: `legacy`, an older Doan's mtimes kept until the root's
// records are written from them; `baseline`, the first listing's fingerprints frozen until the project's records and
// marker land, so a canvas added before a retry is never baselined as seen; `known`, the canvas IDs that had a shared
// record at the last good read, with their verdict, so a record that disappears later is an error and not a new
// canvas. A valid shared record always wins over it. Only TS reads and writes it, so its tests are its schema; an older
// Doan reads v2 as a later version's file and never overwrites it.

export type Verdict = "new" | "changed" | "seen";
export interface RootMemory {
  legacy?: Record<string, number>;
  baseline?: Record<string, string>;
  known: Record<string, "seen" | "changed">;
}

export interface LocalSeen {
  root(root: string): RootMemory | undefined;
  // undefined forgets the root. Writes the file when the value moved; true once the file holds it.
  set(root: string, memory: RootMemory | undefined): boolean;
  roots(): string[];
  // Writes the file if an earlier write failed. Called at quit.
  flushSync(): void;
  // Copies each alias root's memory to its real path (FolderStore's startup step), before the first listing: a
  // spelling change is the same project, not one leaving the list. The real path's memory wins field by field per
  // canvas; the alias's fills what it lacks. The alias's memory stays, so whichever spelling this run lists keeps it, and
  // the listing drops the other as a root that left the list. True once the file holds the copy; false, with nothing
  // changed, when it cannot be written (a write error, or a later Doan's file).
  copyRoots(aliases: ReadonlyMap<string, string>): boolean;
}

type Roots = Map<string, RootMemory>;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const time = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const HASH = /^sha256:[0-9a-f]{64}$/;

function entries<T>(value: unknown, keep: (item: unknown) => item is T): Record<string, T> | undefined {
  if (!isObject(value)) return undefined;
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, T] => keep(entry[1])));
}

// A missing or broken file is empty: each root is read again as on its first registration, where a project with
// records is compared and one without is baselined, so a lost file never lights everything up. A wrong-typed field or
// entry is dropped on its own. `newer`: a later Doan wrote it, so it is never overwritten.
function parse(text: string): { roots: Roots; newer: boolean } {
  const roots: Roots = new Map();
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { roots, newer: false }; }
  if (!isObject(value) || typeof value.v !== "number") return { roots, newer: false };
  if (value.v > 2) return { roots, newer: true };
  if (!isObject(value.roots)) return { roots, newer: false };
  if (value.v === 1) {
    for (const [root, paths] of Object.entries(value.roots)) {
      const legacy = entries(paths, time);
      if (legacy) roots.set(root, { legacy, known: {} });
    }
  } else if (value.v === 2) {
    for (const [root, item] of Object.entries(value.roots)) {
      const memory = memoryOf(item);
      if (memory) roots.set(root, memory);
    }
  }
  return { roots, newer: false };
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

const serialize = (roots: Roots): string => `${JSON.stringify({ v: 2, roots: Object.fromEntries(roots) })}\n`;

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
  let roots: Roots = new Map(), newer = false;
  try { ({ roots, newer } = parse(readFileSync(file, "utf8"))); } catch { /* no file yet */ }
  // A failed write leaves the memory `dirty`: it has moved ahead of the file, so the next change writes again and quit
  // flushes it. The memory still serves this run: the shared records are the truth, this is only a cache of them.
  let dirty = false;
  let written = newer ? "" : serialize(roots);
  const save = (): boolean => {
    if (newer) return false;
    const text = serialize(roots);
    if (text === written && !dirty) return true;
    try {
      write(file, text);
      written = text;
      dirty = false;
      return true;
    } catch (error) {
      dirty = true;
      console.error("doan: cannot save canvas-seen.json", error);
      return false;
    }
  };
  return {
    root: root => roots.get(root),
    set(root, memory) {
      if (memory === undefined) roots.delete(root);
      else roots.set(root, memory);
      return save();
    },
    roots: () => [...roots.keys()],
    flushSync() { if (dirty) save(); },
    copyRoots(aliases) {
      if (newer) return false;
      const next: Roots = new Map(roots);
      let changed = false;
      for (const [alias, real] of aliases) {
        const from = roots.get(alias), kept = next.get(real);
        if (!from || alias === real) continue;
        const merged = mergeMemory(kept, from);
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

// ---- verdicts ------------------------------------------------------------------------------------------------------

export interface SeenRow {
  path: string;
  // As listed; only a valid ID that no other listed canvas of the root has keys a shared record.
  id?: string | undefined;
  mtimeMs?: number | undefined;
  // null when the HTML could not be read whole.
  fingerprint: string | null;
}
export interface SeenReads { dir: "ok" | "absent" | "refused"; marker: MarkerRead; records: ReadonlyMap<string, RecordRead> }
export type RootProblem = "records" | "unsupported";
export type Phase = "first" | "migrate" | "baseline" | "ready";
export interface Judgement {
  // By path; undefined keeps no verdict at all (no dot).
  verdicts: Map<string, Verdict | undefined>;
  problem?: RootProblem;
}

// IDs listed once with a valid shape. A missing or duplicated ID keys nothing: its row keeps its last verdict (an older
// Doan's while converting) and no record is written for it, so a path or a guessed ID never stands in for it.
export function uniqueIds(rows: readonly { id?: string | undefined }[]): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) if (validCanvasId(row.id)) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  return new Set([...counts].filter(([, count]) => count === 1).map(([id]) => id));
}

function phaseOf(memory: RootMemory | undefined): Phase {
  return memory === undefined ? "first" : memory.legacy ? "migrate" : memory.baseline ? "baseline" : "ready";
}

function markerProblem(reads: SeenReads): RootProblem | undefined {
  if (reads.dir === "refused") return "records";
  switch (reads.marker.kind) {
    case "absent": case "present": return undefined;
    case "unsupported": return "unsupported";
    default: return "records";
  }
}

const worse = (a: RootProblem | undefined, b: RootProblem): RootProblem => a === "unsupported" || b === "unsupported" ? "unsupported" : "records";

// The pure verdict of every listed canvas of one root. `last` is the verdict this device showed before, kept whenever
// the shared state cannot be read: a damaged, missing or later-version record never resets to "first registration" and
// never guesses a change.
export function judge(memory: RootMemory | undefined, reads: SeenReads, rows: readonly SeenRow[], last: (row: SeenRow) => Verdict | undefined): Judgement {
  const phase = phaseOf(memory);
  const ids = uniqueIds(rows);
  const verdicts = new Map<string, Verdict | undefined>();
  // A device that knew the project and finds no marker lost the records (a deleted folder, a checkout without them).
  const unreadable = markerProblem(reads) ?? (phase === "ready" && reads.marker.kind === "absent" ? "records" : undefined);
  let problem = unreadable;
  const legacyVerdict = (row: SeenRow): Verdict => {
    const seen = memory?.legacy?.[row.path];
    return seen === undefined ? "new" : row.mtimeMs === seen ? "seen" : "changed";
  };
  const against = (row: SeenRow, base: string): Verdict | undefined => row.fingerprint === null ? last(row) : row.fingerprint === base ? "seen" : "changed";
  // An older Doan's verdict holds for a row the conversion cannot record yet (no usable ID, a record it cannot read).
  const held = (row: SeenRow): Verdict | undefined => phase === "migrate" ? legacyVerdict(row) : last(row);
  for (const row of rows) {
    if (row.id === undefined || !ids.has(row.id)) { verdicts.set(row.path, held(row)); continue; }
    if (unreadable && phase !== "ready") {
      // An older Doan's verdict still holds while the records cannot be read; a first registration shows nothing.
      verdicts.set(row.path, phase === "migrate" ? legacyVerdict(row) : phase === "baseline" ? last(row) : undefined);
      continue;
    }
    if (unreadable) { verdicts.set(row.path, last(row)); continue; }
    const record = reads.records.get(row.id) ?? { kind: "absent" };
    switch (record.kind) {
      case "seen": verdicts.set(row.path, against(row, record.html)); break;
      case "migrated": verdicts.set(row.path, "changed"); break;
      case "unsupported": problem = worse(problem, "unsupported"); verdicts.set(row.path, held(row)); break;
      case "corrupt": case "conflict": case "unreadable": problem = worse(problem, "records"); verdicts.set(row.path, held(row)); break;
      case "absent": {
        if (phase === "migrate") verdicts.set(row.path, legacyVerdict(row));
        else if (phase === "baseline") {
          const base = memory?.baseline?.[row.id];
          verdicts.set(row.path, base === undefined ? "new" : against(row, base));
        } else if (phase === "first") verdicts.set(row.path, reads.marker.kind === "present" ? "new" : row.fingerprint === null ? undefined : "seen");
        else if (memory?.known[row.id] !== undefined) { problem = worse(problem, "records"); verdicts.set(row.path, last(row)); }
        else verdicts.set(row.path, "new");
        break;
      }
    }
  }
  return problem ? { verdicts, problem } : { verdicts };
}

// The writes a root needs before it can be compared from its shared records alone: the first registration of a
// project without records (its baseline), a retry of that baseline, or the conversion of an older Doan's mtimes.
// `before` is stored locally before the first write, so an interruption at any write retries the same set; `after`
// once the last write landed. Records first, the marker last; an ID that already has any record is never written, so a
// record that came with the project (or another device's) wins. null: nothing to do, or the records cannot be read.
export interface Plan {
  before: RootMemory;
  writes: { id?: string; value: RecordValue | null }[];
  after: RootMemory;
}

export function plan(memory: RootMemory | undefined, reads: SeenReads, rows: readonly SeenRow[]): Plan | null {
  if (markerProblem(reads)) return null;
  const phase = phaseOf(memory);
  const markerPresent = reads.marker.kind === "present";
  const ids = uniqueIds(rows);
  const absent = (id: string) => (reads.records.get(id) ?? { kind: "absent" }).kind === "absent";
  const marker = markerPresent ? [] : [{ value: null }];
  const known = (written: Record<string, "seen" | "changed">) => ({ ...memory?.known, ...written });
  if (phase === "first") {
    // A project that came with its records is compared with them; nothing is written.
    if (markerPresent) return { before: { known: {} }, writes: [], after: { known: {} } };
    const baseline: Record<string, string> = {};
    for (const row of rows) if (row.id !== undefined && ids.has(row.id) && row.fingerprint !== null) baseline[row.id] = row.fingerprint;
    return baselinePlan({ baseline, known: {} }, absent, marker);
  }
  if (phase === "baseline") {
    const listed = new Set([...ids]);
    const baseline = Object.fromEntries(Object.entries(memory!.baseline!).filter(([id]) => listed.has(id)));
    return baselinePlan({ ...memory!, baseline }, absent, marker, memory!);
  }
  if (phase === "migrate") {
    const writes: Plan["writes"] = [];
    const written: Record<string, "seen" | "changed"> = {};
    let complete = true;
    for (const row of rows) {
      // No usable ID, a record that cannot be read, or HTML that cannot be read now: its old verdict is kept until a
      // later listing can record what it holds.
      const id = row.id !== undefined && ids.has(row.id) ? row.id : undefined;
      const kind = id === undefined ? undefined : (reads.records.get(id) ?? { kind: "absent" }).kind;
      if (kind === "seen" || kind === "migrated") continue;
      if (id === undefined || kind !== "absent" || row.fingerprint === null) { complete = false; continue; }
      const seen = memory!.legacy![row.path];
      const value: RecordValue = seen !== undefined && seen === row.mtimeMs ? { html: row.fingerprint } : { unseen: "migrated" };
      writes.push({ id, value });
      written[id] = "html" in value ? "seen" : "changed";
    }
    const after: RootMemory = complete ? { known: known(written) } : { ...memory!, known: known(written) };
    return { before: memory!, writes: [...writes, ...marker], after };
  }
  return null;
}

function baselinePlan(before: RootMemory, absent: (id: string) => boolean, marker: Plan["writes"], stored?: RootMemory): Plan {
  const writes: Plan["writes"] = [];
  const written: Record<string, "seen" | "changed"> = {};
  for (const [id, html] of Object.entries(before.baseline ?? {})) {
    if (!absent(id)) continue;
    writes.push({ id, value: { html } });
    written[id] = "seen";
  }
  // The frozen set is stored first (unchanged for a retry), then dropped once the marker landed.
  return { before: stored ?? before, writes: [...writes, ...marker], after: { known: { ...before.known, ...written } } };
}

// ---- device-local records (canvas-seen.json v3) ---------------------------------------------------------------------
//
// v3 keeps the whole read state on this device, so showing a canvas changes no file in the project. Per root:
// `canvases`, keyed by canvas ID, holds `{html}` (the content last shown) or `{unseen}` ("new": judged a new canvas;
// "migrated": unseen when the root's shared records were converted, content never recorded); `migrated` says the root's
// `.doan/seen/` was read once into it and is never read again; `v2` is an older Doan's memory of a root not migrated
// yet, kept until migrateRoot reads it.

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

// A root's first read of its `.doan/seen/`, turned into its local record so every canvas shows the same dot as before.
// A valid record under a present marker is copied. Anything else (a damaged, conflicted, unreadable or later-version
// record, a bad or missing marker, a refused folder, no record) carries what this device showed: its v2 verdict, which
// already falls back to `last` where the records could not be read; an older Doan's mtimes convert as they always did.
// Without either, the canvas starts seen: a first registration lights nothing.
export function migrateRoot(memory: RootMemory | undefined, reads: SeenReads, rows: readonly SeenRow[], last: (row: SeenRow) => Verdict | undefined): RootRecord {
  const ids = uniqueIds(rows);
  const copy = reads.dir === "ok" && reads.marker.kind === "present";
  const before = memory && !memory.legacy ? judge(memory, reads, rows, last).verdicts : undefined;
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

// The first listing after start or registration: every unique ID without a record is recorded as seen, so canvases
// that appeared while the app was not watching (a pull, a branch switch, a run while it was closed) light nothing.
// Records already there are kept, so a root registered again compares with them. The same record when nothing is added.
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
export function judgeLocal(record: RootRecord, rows: readonly SeenRow[], last: (row: SeenRow) => Verdict | undefined): Map<string, Verdict | undefined> {
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
