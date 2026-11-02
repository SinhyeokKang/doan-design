import { randomBytes } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { FolderEntry } from "./view";

// `<userData>/canvas-seen.json`: per root, each canvas's mtime when the person last had it on the canvas page
// (canvas-viewport-units D9). Only TS reads and writes it, so its tests are its schema.
//
// A root gets a record the first time it is listed without one, holding every canvas present: a project added, or the
// first run after this file existed, lights nothing up. Paths are never pruned from a listing, because an editor's
// temp-and-rename save can drop a canvas from one listing and a pruned path would come back as new; a root's record
// goes only when the root leaves Doan's list, so adding it again starts from a fresh baseline.

export interface CanvasSeenStore {
  // The entries with `unseen` set on each canvas that is new since its root's baseline or changed since last seen.
  // Records a baseline for a newly listed root and forgets removed roots, writing the file when either changed.
  apply(entries: readonly FolderEntry[]): FolderEntry[];
  // `{root, path, mtimeMs}` from the renderer for a listed canvas the canvas page shows; refused unless `mtimeMs` is
  // that row's current one, so a mark from an earlier listing or any other value cannot record a revision never shown.
  // True when the record moved.
  mark(entries: readonly FolderEntry[], value: unknown): boolean;
  // Writes the record if an earlier write failed. Called at quit.
  flushSync(): void;
}

type Seen = Map<string, Map<string, number>>;

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const time = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// A missing or broken file is empty: every root is baselined again, so a lost file never lights everything up. A
// wrong-typed root or path entry is dropped on its own. `newer`: a later Doan wrote it, so it is never overwritten.
function parse(text: string): { seen: Seen; newer: boolean } {
  const seen: Seen = new Map();
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { seen, newer: false }; }
  if (!record(value) || typeof value.v !== "number") return { seen, newer: false };
  if (value.v > 1) return { seen, newer: true };
  if (value.v !== 1 || !record(value.roots)) return { seen, newer: false };
  for (const [root, paths] of Object.entries(value.roots)) {
    if (!record(paths)) continue;
    seen.set(root, new Map(Object.entries(paths).filter((entry): entry is [string, number] => time(entry[1]))));
  }
  return { seen, newer: false };
}

// Synchronous temp-and-rename: the file is small and changes only on a new root, a removal or a canvas shown, and
// a synchronous write cannot land after a later one.
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

export function createCanvasSeenStore(file: string, write: (file: string, text: string) => void = writeAtomic): CanvasSeenStore {
  let seen: Seen = new Map(), newer = false;
  try { ({ seen, newer } = parse(readFileSync(file, "utf8"))); } catch { /* no file yet */ }

  // A failed write leaves the record `dirty`: memory has moved ahead of the file, so the next apply or mark writes
  // again even when nothing changed, and quit flushes it.
  let dirty = false;
  const save = () => {
    if (newer) return;
    const roots = Object.fromEntries([...seen].map(([root, paths]) => [root, Object.fromEntries(paths)]));
    try {
      write(file, `${JSON.stringify({ v: 1, roots })}\n`);
      dirty = false;
    } catch (error) {
      dirty = true;
      console.error("doan: cannot save canvas-seen.json", error);
    }
  };
  const baseline = (entry: Extract<FolderEntry, { kind: "list" }>): boolean => {
    if (seen.has(entry.path)) return false;
    seen.set(entry.path, new Map(entry.canvases.flatMap(row => row.mtimeMs === undefined ? [] : [[row.path, row.mtimeMs] as const])));
    return true;
  };

  return {
    apply(entries) {
      let changed = false;
      const registered = new Set(entries.map(entry => entry.path));
      for (const root of seen.keys()) if (!registered.has(root)) { seen.delete(root); changed = true; }
      const next = entries.map((entry): FolderEntry => {
        if (entry.kind !== "list") return entry;
        if (baseline(entry)) changed = true;
        const paths = seen.get(entry.path)!;
        return {
          ...entry,
          canvases: entry.canvases.map(row => {
            if (row.mtimeMs === undefined) return row;
            // Equality, not order: a clock corrected backwards or a restored file can give a changed canvas an
            // older mtime than the one seen.
            const last = paths.get(row.path);
            return last === undefined ? { ...row, unseen: "new" } : row.mtimeMs !== last ? { ...row, unseen: "changed" } : row;
          }),
        };
      });
      if (changed || dirty) save();
      return next;
    },
    mark(entries, value) {
      if (!record(value) || typeof value.root !== "string" || typeof value.path !== "string" || !time(value.mtimeMs)) return false;
      const { root, path, mtimeMs } = value;
      const entry = entries.find(item => item.path === root);
      if (entry?.kind !== "list" || !entry.canvases.some(row => row.path === path && row.mtimeMs === mtimeMs)) return false;
      const based = baseline(entry);
      const paths = seen.get(root)!;
      const moved = paths.get(path) !== mtimeMs;
      if (moved) paths.set(path, mtimeMs);
      if (moved || based || dirty) save();
      return moved || based;
    },
    flushSync() {
      if (dirty) save();
    },
  };
}
