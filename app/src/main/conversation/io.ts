import { accessSync, constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFile } from "node:child_process";
import { absolutePath, CLAUDE_REGISTRY_FLOOR, CODEX_ROLLOUT_FLOOR, object, parseSessionRecords, SESSION_TAIL_BYTES, storedVersionAtLeast } from "./sessions";

export const CONVERSATION_HISTORY_BYTES = 256 * 1024 * 1024;

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
    return readDescriptor(fd, limit);
  } finally { closeSync(fd); }
}
export function readDescriptor(fd: number, limit: number, prefixSize?: number): string {
  const actualSize = fstatSync(fd).size, size = prefixSize ?? actualSize;
  if (!Number.isSafeInteger(size) || size < 0 || size > actualSize) throw new Error("Invalid read size");
  if (size > limit) throw new Error("File exceeds limit");
  const bytes = Buffer.alloc(size); let offset = 0;
  while (offset < size) { const count = readSync(fd, bytes, offset, size - offset, offset); if (!count) throw new Error("Incomplete conversation read"); offset += count; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
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
      // 2.1.312 keeps a per-process <pid>.<sha256>.key beside each record; it is not a registry record and is never read.
      if (/^[1-9][0-9]*\.[0-9a-f]{64}\.key$/.test(name)) continue;
      if (!/^[1-9][0-9]*\.json$/.test(name)) return "unknown";
      const raw: unknown = JSON.parse(readRegular(join(directory, name), 65536));
      if (!object(raw) || raw.pid !== Number(name.slice(0, -5)) || !Number.isSafeInteger(raw.pid) || typeof raw.pid !== "number" ||
          typeof raw.sessionId !== "string" || !raw.sessionId || typeof raw.procStart !== "string" || !Number.isFinite(Date.parse(raw.procStart)) || typeof raw.cwd !== "string" || !absolutePath(raw.cwd) ||
          !storedVersionAtLeast(raw.version, CLAUDE_REGISTRY_FLOOR) || typeof raw.kind !== "string") return "unknown";
      const actual = await inspect(raw.pid);
      if (actual !== null && actual.replace(/\s+/g, " ").trim() === raw.procStart.replace(/\s+/g, " ").trim()) {
        if (raw.kind !== "interactive") return "unknown";
        if (raw.sessionId === sessionId) occupied = true;
      }
    }
    return occupied ? "occupied" : "free";
  } catch { return "unknown"; }
}

// The processes that have the file open, read with lsof: read-only, while Node has no flock call and probing with
// lockf(1) would take the exclusive lock itself, so a Codex writer acquiring at that instant would be refused. It costs
// ~100 ms, which is why callers run it only when a lock file exists. Exit 1 with no output means nobody has it open;
// any other reply it cannot read rejects.
export interface FileHolder { pid: number; pgid: number; ppid: number }
export function fileHolders(path: string): Promise<FileHolder[]> {
  return new Promise((resolve, reject) => {
    execFile("/usr/sbin/lsof", ["-FpgR", "-n", "-P", "-l", "-w", "--", path], { timeout: 2000, maxBuffer: 65536 }, (error, stdout, stderr) => {
      if (error) { if (error.code === 1 && !stdout.trim() && !stderr.trim()) resolve([]); else reject(error); return; }
      const holders = parseHolders(stdout); if (holders) resolve(holders); else reject(new Error("Malformed lsof output"));
    });
  });
}
// -F output: a p<pid> line opens each process, followed by its g<pgid> and R<ppid> and then f<fd> lines.
function parseHolders(stdout: string): FileHolder[] | null {
  const holders: Partial<FileHolder>[] = [];
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const field = line[0], value = line.slice(1), current = holders.at(-1);
    if (field === "f") { if (!current) return null; continue; }
    if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return null;
    if (field === "p") holders.push({ pid: Number(value) });
    else if ((field === "g" || field === "R") && current) {
      const key = field === "g" ? "pgid" : "ppid"; if (current[key] !== undefined) return null; current[key] = Number(value);
    } else return null;
  }
  if (!holders.length || holders.some(h => !h.pid || h.pgid === undefined || h.ppid === undefined)) return null;
  return holders as FileHolder[];
}
// Codex (0.164.0 and later) admits one writer per thread through an exclusive flock on
// <CODEX_HOME>/thread-writer-locks/<id>.lock, the same lock thread/resume refuses on ("already has an active writer").
// A plain `codex` TUI loads the thread in its managed app-server daemon, which keeps holding it for about a minute
// after /exit. A clean exit deletes the file; a SIGKILL leaves it with nobody holding it, so the file alone is not
// occupancy. A missing directory means no supported writer has run in this profile.
// A Codex server Doan opened holds the lock of the thread it resumed; that is not a terminal holding the session, and
// Doan's reservations already keep it to one runner. Runners spawn each provider detached, so it leads its own process
// group as a direct child of this (main) process: holders in such a group are ignored. A holder whose group leader is
// not among the holders cannot be traced to Doan and counts.
export async function codexOccupancy(config: string, threadId: string, inspect = fileHolders, self = process.pid): Promise<"free" | "occupied" | "unknown"> {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(threadId)) return "unknown";
  try {
    const directory = join(canonicalDirectory(config), "thread-writer-locks");
    try { lstatSync(directory); } catch (error) { if (object(error) && error.code === "ENOENT") return "free"; throw error; }
    if (canonicalDirectory(directory) !== directory) return "unknown";
    accessSync(directory, constants.R_OK | constants.X_OK);
    const lock = join(directory, `${threadId}.lock`);
    let entry;
    try { entry = lstatSync(lock); } catch (error) { if (object(error) && error.code === "ENOENT") return "free"; throw error; }
    if (!entry.isFile()) return "unknown";
    const holders = await inspect(lock);
    const doan = new Set(holders.filter(h => h.pid === h.pgid && h.ppid === self).map(h => h.pid));
    return holders.some(h => !doan.has(h.pgid)) ? "occupied" : "free";
  } catch { return "unknown"; }
}

// The rollout header records the Codex version that created the session and is never rewritten: a resume appends
// without touching the first session_meta, so a conversation started on 0.163.0 keeps that cli_version under 0.164.0.
// Any version at or above the minimum may have created one, so the header is checked against a fixed floor, never
// against the installed version.
export function codexSessionExists(config: string, id: string, cwd: string): boolean {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id)) return false;
  try {
    const matches: string[] = []; let remaining = 65536;
    const visit = (directory: string, depth: number): void => {
      if (canonicalDirectory(directory) !== directory) throw new Error("Linked session directory");
      const names = readdirSync(directory);
      remaining -= names.length; if (remaining < 0) throw new Error("Session scan limit");
      for (const name of names) {
        if (depth < 3) {
          if ((depth === 0 ? /^\d{4}$/ : /^\d{2}$/).test(name)) visit(join(directory, name), depth + 1);
        } else if (name.startsWith("rollout-") && name.endsWith(`-${id}.jsonl`)) matches.push(join(directory, name));
      }
    };
    visit(join(config, "sessions"), 0);
    const path = matches.length === 1 ? matches[0] : undefined; if (!path) return false;
    const fd = openRegular(path);
    try {
      const bytes = Buffer.alloc(65536); const count = readSync(fd, bytes, 0, bytes.length, 0);
      const end = bytes.subarray(0, count).indexOf(10); if (end < 0) return false;
      const raw: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, end)));
      return object(raw) && raw.type === "session_meta" && object(raw.payload) && raw.payload.id === id &&
        typeof raw.payload.cwd === "string" && canonicalDirectory(raw.payload.cwd) === cwd &&
        storedVersionAtLeast(raw.payload.cli_version, CODEX_ROLLOUT_FLOOR);
    } finally { closeSync(fd); }
  } catch { return false; }
}
