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
      if (!isObject(item)) continue;
      const memory: RootMemory = { known: entries(item.known, (v): v is "seen" | "changed" => v === "seen" || v === "changed") ?? {} };
      const legacy = entries(item.legacy, time);
      const baseline = entries(item.baseline, (v): v is string => typeof v === "string" && HASH.test(v));
      if (legacy) memory.legacy = legacy;
      if (baseline) memory.baseline = baseline;
      roots.set(root, memory);
    }
  }
  return { roots, newer: false };
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
        const merged: RootMemory = { known: { ...from.known, ...kept?.known } };
        const legacy = from.legacy || kept?.legacy ? { ...from.legacy, ...kept?.legacy } : undefined;
        const baseline = from.baseline || kept?.baseline ? { ...from.baseline, ...kept?.baseline } : undefined;
        if (legacy) merged.legacy = legacy;
        if (baseline) merged.baseline = baseline;
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
