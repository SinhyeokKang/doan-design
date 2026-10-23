import { constants } from "node:fs";
import { open, readdir, type FileHandle } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { createCommentDirectory } from "./mkdir";

const O_NOFOLLOW_ANY = 0x20000000;
export class AppendUncertainError extends Error {
  constructor(cause: unknown) { super("Comment append outcome is uncertain; check saved bytes before retrying", { cause }); }
}
function validate(root: string, canvasId: string): void {
  if (process.platform !== "darwin") throw new Error("Unsupported filesystem platform");
  if (!isAbsolute(root) || root.includes("\0") || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(canvasId)) throw new Error("Invalid comment location");
}
function missing(error: unknown): boolean { return error instanceof Error && "code" in error && error.code === "ENOENT"; }
async function directory(path: string): Promise<void> {
  const fd = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | O_NOFOLLOW_ANY);
  try { if (!(await fd.stat()).isDirectory()) throw new Error("Not a directory"); } finally { await fd.close(); }
}
async function exactName(parent: string, name: string): Promise<void> {
  const names = await readdir(parent);
  if (names.some(entry => entry.toLowerCase() === name.toLowerCase() && entry !== name)) throw new Error("Comment path case conflict");
}
async function directories(root: string, create: boolean): Promise<boolean> {
  await directory(root);
  let parent = root;
  for (const name of [".doan", "comments"] as const) {
    await exactName(parent, name);
    const path = join(parent, name);
    try { await directory(path); } catch (error) {
      if (!missing(error)) throw error;
      if (!create) return false;
      await createCommentDirectory(parent, name);
      await directory(path);
      await exactName(parent, name);
    }
    parent = path;
  }
  return true;
}
async function commentFile(root: string, canvasId: string, write: boolean): Promise<FileHandle | null> {
  validate(root, canvasId);
  if (!await directories(root, write)) return null;
  const parent = join(root, ".doan", "comments"), name = `${canvasId}.jsonl`;
  await exactName(parent, name);
  const flags = O_NOFOLLOW_ANY | constants.O_NONBLOCK | (write ? constants.O_RDWR | constants.O_APPEND : constants.O_RDONLY);
  let fd: FileHandle;
  try { fd = await open(join(parent, name), flags); } catch (error) {
    if (!missing(error)) throw error;
    if (!write) return null;
    // An exclusive collision is an error, never permission to reopen unchecked.
    fd = await open(join(parent, name), flags | constants.O_CREAT | constants.O_EXCL, 0o600);
  }
  try {
    if (!(await fd.stat()).isFile()) throw new Error("Comment target is not a regular file");
    await exactName(parent, name);
    return fd;
  } catch (error) { await fd.close(); throw error; }
}
export async function readCommentBytes(root: string, canvasId: string): Promise<Buffer> {
  const fd = await commentFile(root, canvasId, false);
  if (!fd) return Buffer.alloc(0);
  try { return await fd.readFile(); } finally { await fd.close(); }
}

// The trusted caller serializes this entire operation per file and validates events.
// Returning null skips append. Non-null bytes must be a nonempty LF-terminated batch.
export async function withCommentAppend(root: string, canvasId: string, prepare: (latest: Buffer) => Promise<Buffer | null>): Promise<void> {
  const fd = await commentFile(root, canvasId, true);
  if (!fd) throw new Error("Missing append descriptor");
  let attempted = false;
  let failure: unknown;
  let failed = false;
  try {
    const latest = await fd.readFile();
    const needsLF = latest.length > 0 && latest[latest.length - 1] !== 10;
    const bytes = await prepare(latest);
    if (bytes !== null) {
      if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes[bytes.length - 1] !== 10) throw new Error("Append requires a nonempty LF-terminated batch");
      const batch = needsLF ? Buffer.concat([Buffer.from("\n"), bytes]) : bytes;
      attempted = true;
      if ((await fd.write(batch)).bytesWritten !== batch.length) throw new Error("Short comment write");
    }
  } catch (error) { failed = true; failure = attempted ? new AppendUncertainError(error) : error; }
  try { await fd.close(); } catch (error) { failed = true; failure = new AppendUncertainError(error); }
  if (failed) throw failure;
}
