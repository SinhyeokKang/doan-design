import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, rm, type FileHandle } from "node:fs/promises";
import { join } from "node:path";

// A project's shared canvas read state, `<root>/.doan/seen/`: one `<canvas-id>.json` per canvas holding the HTML last
// shown on the canvas page, and `_project.json`, which says the project has read-state records at all. One file per
// canvas so two branches that read different canvases merge cleanly in Git; a conflict stays confined to the one canvas
// both read differently. Only TS reads and writes them, so these tests are their schema.
//
// `{"v":1,"html":"sha256:<hex>"}` is the last content shown; `{"v":1,"unseen":"migrated"}` is a canvas that was unseen
// when an older Doan's device-local record was converted, whose content was never recorded. The marker is `{"v":1}`.
// A file is never deleted by the app, and one that cannot be read as either shape is never overwritten.

export const SEEN_DIR = ".doan/seen";
export const MARKER = "_project.json";
// `_` can never start a canvas ID, so the marker never collides with a record and IDs need no escaping.
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const CAP = 4096;
const TEMP = /^\.(?:_project|[a-z0-9]+(?:-[a-z0-9]+)*)\.json\.[0-9a-f]{12}\.tmp$/;
// A temp file this old is left over from an interrupted write, never one still being written.
const STALE_TEMP_MS = 60_000;
// macOS refuses a symlink at any component of the path with this flag, not only the last one (Node has no constant).
const NOFOLLOW = process.platform === "darwin" ? 0x20000000 : constants.O_NOFOLLOW;

export type RecordRead =
  | { kind: "absent" }
  | { kind: "seen"; html: string }
  | { kind: "migrated" }
  | { kind: "corrupt" | "conflict" | "unsupported" | "unreadable" };
export type MarkerRead = { kind: "absent" | "present" | "corrupt" | "conflict" | "unsupported" | "unreadable" };
export type RecordValue = { html: string } | { unseen: "migrated" };

// `bytes`: what the read decided from, for the write's compare. null: no file; undefined: nothing that may be replaced.
export interface Read<T> { read: T; bytes: Buffer | null | undefined }

export interface SeenSnapshot {
  // `refused`: `.doan` or `.doan/seen` is not a real directory inside the root, so nothing under it is read or written.
  dir: "ok" | "absent" | "refused";
  marker: Read<MarkerRead>;
  records: Map<string, Read<RecordRead>>;
}

export const validCanvasId = (id: unknown): id is string => typeof id === "string" && ID.test(id);
export const recordName = (id: string): string => `${id}.json`;

// One line, no other keys, so the same state is always the same bytes and an unchanged canvas never shows as a diff.
export function recordText(value: RecordValue | null): string {
  if (value === null) return `{"v":1}\n`;
  return "html" in value ? `{"v":1,"html":"${value.html}"}\n` : `{"v":1,"unseen":"migrated"}\n`;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// A Git conflict is told apart from other damage so the toast can say what to restore; neither is ever rewritten.
function versioned(bytes: Buffer): { kind: "conflict" | "corrupt" | "unsupported" } | { kind: "v1"; value: Record<string, unknown> } {
  const text = bytes.toString("utf8");
  if (/^(<{7}|={7}|>{7})( |$)/m.test(text)) return { kind: "conflict" };
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { kind: "corrupt" }; }
  if (!isObject(value) || typeof value.v !== "number" || !Number.isInteger(value.v)) return { kind: "corrupt" };
  if (value.v > 1) return { kind: "unsupported" };
  return value.v === 1 ? { kind: "v1", value } : { kind: "corrupt" };
}

export function parseRecord(bytes: Buffer | null): RecordRead {
  if (bytes === null) return { kind: "absent" };
  const parsed = versioned(bytes);
  if (parsed.kind !== "v1") return parsed;
  const { value } = parsed;
  const keys = Object.keys(value).sort().join();
  if (keys === "html,v" && typeof value.html === "string" && HASH.test(value.html)) return { kind: "seen", html: value.html };
  if (keys === "unseen,v" && value.unseen === "migrated") return { kind: "migrated" };
  return { kind: "corrupt" };
}

export function parseMarker(bytes: Buffer | null): MarkerRead {
  if (bytes === null) return { kind: "absent" };
  const parsed = versioned(bytes);
  if (parsed.kind !== "v1") return parsed;
  return Object.keys(parsed.value).length === 1 ? { kind: "present" } : { kind: "corrupt" };
}

export class SeenWriteError extends Error {
  // `changed`: the file is no longer what the decision was made from; `refused`: a link or a non-directory on the way.
  constructor(readonly code: "changed" | "refused" | "bad-name") { super(`read-state write ${code}`); }
}

const codeOf = (error: unknown): string | undefined => isObject(error) && typeof error.code === "string" ? error.code : undefined;

// `.doan` and `.doan/seen` must be real directories in the real root: a symlink at either is refused, never followed,
// so a swapped link cannot point a write outside the repository.
async function seenDir(root: string, create: boolean): Promise<string | "absent" | "refused"> {
  const realRoot = await realpath(root);
  const doan = join(realRoot, ".doan");
  const doanStat = await lstat(doan).catch(() => null);
  if (!doanStat?.isDirectory()) return "refused";
  const dir = join(doan, "seen");
  let stat = await lstat(dir).catch((error: unknown) => { if (codeOf(error) === "ENOENT") return null; throw error; });
  if (!stat && create) {
    await mkdir(dir).catch((error: unknown) => { if (codeOf(error) !== "EEXIST") throw error; });
    stat = await lstat(dir);
  }
  if (!stat) return "absent";
  if (!stat.isDirectory() || await realpath(dir) !== dir) return "refused";
  return dir;
}

// null when there is no file. A link, a non-file or a file larger than any record throws.
async function readBytes(file: string): Promise<Buffer | null> {
  let handle: FileHandle;
  try { handle = await open(file, constants.O_RDONLY | NOFOLLOW); }
  catch (error) { if (codeOf(error) === "ENOENT") return null; throw error; }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > CAP) throw new SeenWriteError("refused");
    const buffer = Buffer.alloc(CAP + 1);
    const { bytesRead } = await handle.read(buffer, 0, CAP + 1, 0);
    if (bytesRead > CAP) throw new SeenWriteError("refused");
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function readOne<T>(file: string, parse: (bytes: Buffer | null) => T, unreadable: T, damaged: T): Promise<Read<T>> {
  try {
    const bytes = await readBytes(file);
    return { read: parse(bytes), bytes };
  } catch (error) {
    // A link or an oversized file is not a record; other errors (EACCES, EIO) are a read failure.
    return { read: error instanceof SeenWriteError || codeOf(error) === "ELOOP" ? damaged : unreadable, bytes: undefined };
  }
}

// Reads the marker and the records of `ids`. Never writes, so reading after any change can never start a write loop.
export async function readSeen(root: string, ids: Iterable<string>): Promise<SeenSnapshot> {
  const records = new Map<string, Read<RecordRead>>();
  let dir: string | "absent" | "refused";
  try { dir = await seenDir(root, false); } catch { dir = "refused"; }
  if (dir === "absent" || dir === "refused") {
    const absent = dir === "absent";
    for (const id of ids) records.set(id, absent ? { read: { kind: "absent" }, bytes: null } : { read: { kind: "unreadable" }, bytes: undefined });
    return { dir, marker: absent ? { read: { kind: "absent" }, bytes: null } : { read: { kind: "unreadable" }, bytes: undefined }, records };
  }
  const where = dir;
  const marker = await readOne<MarkerRead>(join(where, MARKER), parseMarker, { kind: "unreadable" }, { kind: "corrupt" });
  await Promise.all([...new Set(ids)].map(async id => {
    records.set(id, validCanvasId(id) ? await readOne<RecordRead>(join(where, recordName(id)), parseRecord, { kind: "unreadable" }, { kind: "corrupt" }) : { read: { kind: "corrupt" }, bytes: undefined });
  }));
  return { dir: "ok", marker, records };
}

// Temp-and-rename in the same directory. `expected` is the bytes the decision was made from (null: no file): the
// target is read again right before the rename and anything else refuses the write, so stale memory never replaces a
// record another writer (a pull, another device's copy) put there. Throws SeenWriteError or the file system's error.
export async function writeSeen(root: string, name: string, text: string, expected: Buffer | null): Promise<void> {
  if (name !== MARKER && !(name.endsWith(".json") && validCanvasId(name.slice(0, -5)))) throw new SeenWriteError("bad-name");
  const dir = await seenDir(root, true);
  if (dir === "absent" || dir === "refused") throw new SeenWriteError("refused");
  const target = join(dir, name);
  const temp = join(dir, `.${name}.${randomBytes(6).toString("hex")}.tmp`);
  const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o644);
  try {
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const stat = await lstat(target).catch(() => null);
    if (stat && !stat.isFile()) throw new SeenWriteError("refused");
    let now: Buffer | null;
    try { now = await readBytes(target); } catch { throw new SeenWriteError("changed"); }
    if (expected === null ? now !== null : now === null || !now.equals(expected)) throw new SeenWriteError("changed");
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  await removeStaleTemps(dir);
}

// An interrupted write leaves a hidden temp file that readers ignore; in a project that keeps its Doan files in Git it
// would still show in `git status`, so the next successful write removes ours (this exact name pattern only).
async function removeStaleTemps(dir: string): Promise<void> {
  try {
    const now = Date.now();
    for (const name of await readdir(dir)) {
      if (!TEMP.test(name)) continue;
      const file = join(dir, name);
      const stat = await lstat(file).catch(() => null);
      if (stat?.isFile() && now - stat.mtimeMs >= STALE_TEMP_MS) await rm(file, { force: true });
    }
  } catch {
    // Best effort: a temp left behind is harmless to readers.
  }
}

// EACCES and friends: the toast says the folder is read-only instead of naming the error.
export function readOnlyError(error: unknown): boolean {
  const code = codeOf(error);
  return code === "EACCES" || code === "EPERM" || code === "EROFS";
}
