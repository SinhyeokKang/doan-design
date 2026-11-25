import { constants } from "node:fs";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import { join } from "node:path";

// A project's former shared read state, read once per root into its local record and never written or deleted. Only
// TS reads it: `{"v":1,"html":"sha256:<hex>"}`, `{"v":1,"unseen":"migrated"}`, and the `_project.json` marker `{"v":1}`.

export const SEEN_DIR = ".doan/seen";
export const MARKER = "_project.json";
// `_` can never start a canvas ID, so the marker never collides with a record and IDs need no escaping.
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const CAP = 4096;
// macOS refuses a symlink at any component of the path with this flag, not only the last one (Node has no constant).
const NOFOLLOW = process.platform === "darwin" ? 0x20000000 : constants.O_NOFOLLOW;

export type RecordRead =
  | { kind: "absent" }
  | { kind: "seen"; html: string }
  | { kind: "migrated" }
  | { kind: "corrupt" | "conflict" | "unsupported" | "unreadable" };
export type MarkerRead = { kind: "absent" | "present" | "corrupt" | "conflict" | "unsupported" | "unreadable" };

export interface SeenSnapshot {
  // `refused`: `.doan` or `.doan/seen` is not a real directory inside the root, so nothing under it is read.
  dir: "ok" | "absent" | "refused";
  marker: MarkerRead;
  records: Map<string, RecordRead>;
}

export const validCanvasId = (id: unknown): id is string => typeof id === "string" && ID.test(id);
export const recordName = (id: string): string => `${id}.json`;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// A Git conflict is told apart from other damage; neither is a record.
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

class NotARecord extends Error {}

const codeOf = (error: unknown): string | undefined => isObject(error) && typeof error.code === "string" ? error.code : undefined;

// `.doan` and `.doan/seen` must be real directories in the real root: a symlink at either is refused, never followed,
// so a swapped link cannot point the read outside the repository.
async function seenDir(root: string): Promise<string | "absent" | "refused"> {
  const realRoot = await realpath(root);
  const doan = join(realRoot, ".doan");
  const doanStat = await lstat(doan).catch(() => null);
  if (!doanStat?.isDirectory()) return "refused";
  const dir = join(doan, "seen");
  const stat = await lstat(dir).catch((error: unknown) => { if (codeOf(error) === "ENOENT") return null; throw error; });
  if (!stat) return "absent";
  if (!stat.isDirectory() || await realpath(dir) !== dir) return "refused";
  return dir;
}

// null when there is no file. A link, a non-file or a file larger than any record throws.
async function readBytes(file: string): Promise<Buffer | null> {
  let handle: FileHandle;
  // O_NONBLOCK so a FIFO opens at once and fails the regular-file check instead of holding a libuv thread.
  try { handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK | NOFOLLOW); }
  catch (error) { if (codeOf(error) === "ENOENT") return null; throw error; }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > CAP) throw new NotARecord();
    const buffer = Buffer.alloc(CAP + 1);
    const { bytesRead } = await handle.read(buffer, 0, CAP + 1, 0);
    if (bytesRead > CAP) throw new NotARecord();
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function readOne<T>(file: string, parse: (bytes: Buffer | null) => T, unreadable: T, damaged: T): Promise<T> {
  try {
    return parse(await readBytes(file));
  } catch (error) {
    // A link or an oversized file is not a record; other errors (EACCES, EIO) are a read failure.
    return error instanceof NotARecord || codeOf(error) === "ELOOP" ? damaged : unreadable;
  }
}

// Reads the marker and the records of `ids`. Never writes.
export async function readSeen(root: string, ids: Iterable<string>): Promise<SeenSnapshot> {
  const records = new Map<string, RecordRead>();
  let dir: string | "absent" | "refused";
  try { dir = await seenDir(root); } catch { dir = "refused"; }
  if (dir === "absent" || dir === "refused") {
    const absent = dir === "absent";
    for (const id of ids) records.set(id, absent ? { kind: "absent" } : { kind: "unreadable" });
    return { dir, marker: absent ? { kind: "absent" } : { kind: "unreadable" }, records };
  }
  const where = dir;
  const marker = await readOne<MarkerRead>(join(where, MARKER), parseMarker, { kind: "unreadable" }, { kind: "corrupt" });
  await Promise.all([...new Set(ids)].map(async id => {
    records.set(id, validCanvasId(id) ? await readOne<RecordRead>(join(where, recordName(id)), parseRecord, { kind: "unreadable" }, { kind: "corrupt" }) : { kind: "corrupt" });
  }));
  return { dir: "ok", marker, records };
}
