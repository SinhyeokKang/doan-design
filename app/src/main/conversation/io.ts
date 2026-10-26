import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFile } from "node:child_process";
import { absolutePath, object, parseSessionRecords, SESSION_TAIL_BYTES } from "./sessions";

export function canonicalDirectory(path: string): string {
  if (!absolutePath(path)) throw new Error("session_unavailable");
  const canonical = realpathSync.native(path);
  if (!statSync(canonical).isDirectory()) throw new Error("session_unavailable");
  return canonical;
}
// Identity checks precede reads/writes; opening a FIFO must never block main.
export function openRegular(path: string, flags = constants.O_RDONLY): number {
  const parent = canonicalDirectory(dirname(path));
  if (parent !== dirname(path)) throw new Error("Linked parent refused");
  const parentBefore = lstatSync(parent);
  const fd = openSync(path, flags | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
  try {
    const opened = fstatSync(fd), named = lstatSync(path), parentAfter = lstatSync(parent);
    if (!opened.isFile() || !named.isFile() || opened.ino !== named.ino || opened.dev !== named.dev ||
        parentBefore.ino !== parentAfter.ino || parentBefore.dev !== parentAfter.dev || canonicalDirectory(parent) !== parent) throw new Error("File identity changed");
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}
export function readRegular(path: string, limit = 16 * 1024 * 1024): string {
  const fd = openRegular(path);
  try {
    const size = fstatSync(fd).size;
    if (size > limit) throw new Error("File exceeds limit");
    const bytes = Buffer.alloc(size); let offset = 0;
    while (offset < size) { const count = readSync(fd, bytes, offset, size - offset, offset); if (!count) break; offset += count; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, offset));
  } finally { closeSync(fd); }
}
export function readSessionTail(userData: string) {
  const root = canonicalDirectory(userData);
  let fd: number;
  try { fd = openRegular(join(root, "sessions.jsonl")); }
  catch (error) { if (object(error) && error.code === "ENOENT") return []; throw error; }
  try {
    const size = fstatSync(fd).size, length = Math.min(size, SESSION_TAIL_BYTES);
    const bytes = Buffer.alloc(length); const read = readSync(fd, bytes, 0, length, size - length);
    const complete = bytes.subarray(0, read).lastIndexOf(10);
    return complete < 0 ? [] : parseSessionRecords(bytes.subarray(0, complete + 1).toString("utf8"), size > length);
  } finally { closeSync(fd); }
}
export function processStart(pid: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    execFile("/bin/ps", ["-p", String(pid), "-o", "lstart="], { env: { ...process.env, TZ: "UTC" }, timeout: 2000, maxBuffer: 4096 }, (error, stdout) => {
      if (!error) { const value = stdout.trim(); value ? resolve(value) : reject(new Error("Missing process identity")); }
      else if (error.code === 1 && !stdout.trim()) resolve(null);
      else reject(error);
    });
  });
}
export async function claudeOccupancy(config: string, sessionId: string, inspect = processStart): Promise<"free" | "occupied" | "unknown"> {
  try {
    const directory = join(canonicalDirectory(config), "sessions");
    if (canonicalDirectory(directory) !== directory) return "unknown";
    const names = readdirSync(directory); if (names.length > 4096) return "unknown";
    let occupied = false;
    for (const name of names) {
      if (!/^[1-9][0-9]*\.json$/.test(name)) return "unknown";
      const raw: unknown = JSON.parse(readRegular(join(directory, name), 65536));
      if (!object(raw) || raw.pid !== Number(name.slice(0, -5)) || !Number.isSafeInteger(raw.pid) || typeof raw.pid !== "number" ||
          typeof raw.sessionId !== "string" || !raw.sessionId || typeof raw.procStart !== "string" || !Number.isFinite(Date.parse(raw.procStart)) || typeof raw.cwd !== "string" || !absolutePath(raw.cwd) ||
          raw.version !== "2.1.310" || typeof raw.kind !== "string") return "unknown";
      const actual = await inspect(raw.pid);
      if (actual !== null && actual.replace(/\s+/g, " ").trim() === raw.procStart.replace(/\s+/g, " ").trim()) {
        if (raw.kind !== "interactive") return "unknown";
        if (raw.sessionId === sessionId) occupied = true;
      }
    }
    return occupied ? "occupied" : "free";
  } catch { return "unknown"; }
}
