import { accessSync, constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync, readdirSync, statSync, type Stats } from "node:fs";
import { join, dirname } from "node:path";
import { execFile } from "node:child_process";
import { absolutePath, CODEX_ROLLOUT_FLOOR, mergeOccupancy, object, parseSessionRecords, registryIdentity, registryRecordVerdict, type RegistryVerdict, SESSION_TAIL_BYTES, storedVersionAtLeast } from "./sessions";

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
  let directory: string, listed: Stats, names: string[];
  try {
    directory = join(canonicalDirectory(config), "sessions");
    if (canonicalDirectory(directory) !== directory) return "unknown";
    listed = lstatSync(directory);
    names = readdirSync(directory); if (names.length > 4096) return "unknown";
  } catch { return "unknown"; }
  const verdicts: RegistryVerdict[] = [];
  for (const name of names) verdicts.push(await claudeRecordVerdict(directory, listed, name, sessionId, inspect));
  return mergeOccupancy(verdicts);
}
async function claudeRecordVerdict(directory: string, listed: Stats, name: string, sessionId: string, inspect: typeof processStart): Promise<RegistryVerdict> {
  // Claude Code keeps a per-process <pid>.<sha256>.key beside each record; it is not a registry record and is never read.
  if (/^[1-9][0-9]*\.[0-9a-f]{64}\.key$/.test(name)) return "skip";
  // An unknown name may be a new record format that holds the target, so it is not skipped.
  if (!/^[1-9][0-9]*\.json$/.test(name)) return "unknown";
  const path = join(directory, name);
  try {
    let text: string;
    // Claude Code deletes its record when the process ends, so a record ENOENT is an ended process, but only while the
    // listed sessions directory is unchanged (same dev/ino); otherwise the record is unreadable.
    try { text = readRegular(path, 65536); }
    catch (error) {
      if (!object(error) || error.code !== "ENOENT" || error.path !== path) throw error;
      const now = lstatSync(directory);
      if (!now.isDirectory() || now.dev !== listed.dev || now.ino !== listed.ino) return "unknown";
      return "skip";
    }
    const raw: unknown = JSON.parse(text);
    const identity = registryIdentity(name, raw); if (!identity) return "unknown";
    if (!identity.host) return registryRecordVerdict(raw, sessionId, "foreign");
    const actual = await inspect(identity.pid);
    // Without procStart a reused pid cannot be told apart: a live one is judged by its sessionId, which only refuses the
    // resume of the session it names.
    const live = actual !== null && (identity.procStart === undefined || actual.replace(/\s+/g, " ").trim() === identity.procStart.replace(/\s+/g, " ").trim());
    return registryRecordVerdict(raw, sessionId, live ? "live" : "dead");
  } catch { return "unknown"; }
}

// Holders read with lsof, read-only: Node has no flock call, and lockf(1) would take the lock itself and refuse a Codex
// writer. It is slow, so callers run it only when a lock file exists. Exit 1 with no output: nobody has it open.
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
// Codex admits one writer per thread by an exclusive flock on <CODEX_HOME>/thread-writer-locks/<id>.lock; a SIGKILL
// leaves the file unheld, so only a holder is occupancy. Holders in a group Doan's runners lead are Doan's own.
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

// The rollout header's cli_version is the version that created the session and a resume never rewrites it, so it is
// checked against a fixed floor, never against the installed version.
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

// The asked client uuids a Claude transcript holds, in asked order. The CLI writes a uuid when it takes the message off
// its queue (a user line's uuid, or a folded steer's queued_command source_uuid), so an unread message is not found.
export function readInTranscript(appended: string, uuids: readonly string[]): string[] {
  const found = new Set<string>();
  for (const line of appended.split("\n")) {
    if (!line) continue;
    let record: unknown; try { record = JSON.parse(line); } catch { continue; }
    if (!object(record)) continue;
    if (record.type === "user" && typeof record.uuid === "string") found.add(record.uuid);
    if (record.type === "attachment" && object(record.attachment) && record.attachment.type === "queued_command" && typeof record.attachment.source_uuid === "string") found.add(record.attachment.source_uuid);
  }
  return uuids.filter((uuid, index) => found.has(uuid) && uuids.indexOf(uuid) === index);
}
// The first <project>/<id>.jsonl under the profile's projects/ that `held` accepts; null when none. A plain file (.DS_Store)
// or a name gone since the listing is no project; a link fails the whole lookup.
export function claudeProjectFind(config: string, id: string, held: (path: string) => boolean): string | null {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return null;
  try {
    const base = join(config, "projects"), names = readdirSync(base); if (names.length > 4096) return null;
    for (const name of names) {
      const dir = join(base, name); let entry: Stats;
      try { entry = lstatSync(dir); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (canonicalDirectory(dir) !== dir) return null;
      const path = join(dir, `${id}.jsonl`);
      if (held(path)) return path;
    }
  } catch { return null; }
  return null;
}
// The session's transcript under any project directory of the profile, as claudeSessionExists finds it; null when none.
export function claudeTranscript(config: string, id: string): string | null {
  return claudeProjectFind(config, id, path => { try { return lstatSync(path).isFile(); } catch { return false; } });
}
// The cwds a Claude session transcript's own lines name (each user, assistant and system line carries its sessionId and
// cwd); broken lines and other sessions' lines are skipped.
export function transcriptCwds(text: string, sessionId: string): string[] {
  const cwds: string[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    let record: unknown; try { record = JSON.parse(line); } catch { continue; }
    if (object(record) && record.sessionId === sessionId && typeof record.cwd === "string") cwds.push(record.cwd);
  }
  return cwds;
}
// The session a person's /clear moved a conversation to, proved by its own transcript in the current session's project
// folder naming only the conversation's cwd. Read whole and small: a new session's file holds only its /clear lines yet.
const CLEARED_TRANSCRIPT_BYTES = 8 * 1024 * 1024;
export function claudeClearedSession(config: string, previous: string, next: string, cwd: string): boolean {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(next) || next.startsWith("-")) return false;
  const held = claudeTranscript(config, previous); if (!held) return false;
  try {
    const cwds = transcriptCwds(readRegular(join(dirname(held), `${next}.jsonl`), CLEARED_TRANSCRIPT_BYTES), next);
    return cwds.length > 0 && cwds.every(named => canonicalDirectory(named) === cwd);
  } catch { return false; }
}
// The transcript's size now, 0 when it does not exist yet (a new session writes it with its first turn).
export function transcriptSize(config: string, id: string): number {
  const path = claudeTranscript(config, id); if (!path) return 0;
  try { return lstatSync(path).size; } catch { return 0; }
}
const TRANSCRIPT_READ_BYTES = 64 * 1024 * 1024;
// The bytes written after from, or from the start when the file is shorter now (rewritten). A turn's own lines are what
// is looked for, so only the last TRANSCRIPT_READ_BYTES are read; a line cut by that is skipped by readInTranscript.
export function readTranscriptFrom(config: string, id: string, from: number): string | null {
  const path = claudeTranscript(config, id); if (!path) return null;
  try {
    const fd = openRegular(path);
    try {
      const size = fstatSync(fd).size;
      let start = from >= 0 && from <= size ? from : 0;
      start = Math.max(start, size - TRANSCRIPT_READ_BYTES);
      const bytes = Buffer.alloc(size - start); let offset = 0;
      while (offset < bytes.length) { const count = readSync(fd, bytes, offset, bytes.length - offset, start + offset); if (!count) break; offset += count; }
      return new TextDecoder("utf-8").decode(bytes.subarray(0, offset));
    } finally { closeSync(fd); }
  } catch { return null; }
}
