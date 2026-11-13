import { posix } from "node:path";
import { validateSessionRecord } from "../../formats/validate";
import { MINIMUM_VERSIONS } from "./minimumVersions";
import type { AvailabilityFacts, Canvas, Runtime, SessionRecord, UnavailableReason } from "./types";

export { MINIMUM_VERSIONS };

export const SESSION_TAIL_BYTES = 1024 * 1024;
export type VersionedProvider = keyof typeof MINIMUM_VERSIONS;
// Stored sessions keep the version that wrote them: the oldest Codex doan supports, and the Claude version of every
// terminal sharing a registry. A floor follows a lowered minimum, but never rises with one: raising it abandons the
// sessions the older versions made.
export const CODEX_ROLLOUT_FLOOR = "0.158.0";
export const CLAUDE_REGISTRY_FLOOR = "2.1.284";
const CLI_VERSION = /(\d+)\.(\d+)\.(\d+)((?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)/;
const STORED_VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
// Numeric per part, so 0.99.0 < 0.158.0; suffixes never take part.
function atLeast(match: RegExpExecArray, minimum: string): boolean {
  const floor = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) { const part = Number(match[i + 1]); if (part !== floor[i]) return part > floor[i]!; }
  return true;
}
// The first x.y.z of --version output is the compared core; the installed version keeps any suffix (a Cursor build
// hash), so another build of the same core is another install.
export function parseCliVersion(output: string): { core: string; installed: string } | null {
  const match = CLI_VERSION.exec(output); if (!match) return null;
  const core = `${match[1]}.${match[2]}.${match[3]}`;
  return { core, installed: core + match[4] };
}
export function versionStatus(provider: VersionedProvider, output: string): "supported" | "unsupported" | "unknown" {
  const match = CLI_VERSION.exec(output);
  return !match ? "unknown" : atLeast(match, MINIMUM_VERSIONS[provider]) ? "supported" : "unsupported";
}
// A stored field is a whole version string, not output to search.
export function storedVersionAtLeast(value: unknown, floor: string): boolean {
  const match = typeof value === "string" ? STORED_VERSION.exec(value) : null;
  return !!match && atLeast(match, floor);
}
export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function sessionRecord(value: unknown): value is SessionRecord {
  // The shared validator owns field/path semantics; these checks narrow its untyped result.
  return validateSessionRecord(value) && object(value) && value.v === 1 &&
    typeof value.at === "string" && typeof value.root === "string" &&
    object(value.canvas) && typeof value.canvas.path === "string" &&
    (value.canvas.id === undefined || typeof value.canvas.id === "string") &&
    typeof value.hash === "string" && (value.runtime === "claude" || value.runtime === "codex") &&
    typeof value.sessionId === "string" && typeof value.cwd === "string" && typeof value.configDir === "string";
}
export function parseSessionRecords(tail: string, startsMidLine = false): SessionRecord[] {
  if (Buffer.byteLength(tail, "utf8") > SESSION_TAIL_BYTES) {
    tail = Buffer.from(tail).subarray(-SESSION_TAIL_BYTES).toString("utf8");
    startsMidLine = true;
  }
  const lines = tail.split("\n");
  if (startsMidLine) lines.shift();
  const records: SessionRecord[] = [];
  for (const line of lines) {
    let value: unknown;
    try { value = JSON.parse(line); } catch { continue; }
    if (sessionRecord(value)) records.push(value);
  }
  return records;
}
// A Claude registry record (<config>/sessions/<pid>.json) names the session one Claude process is using. Liveness is
// read first: a record whose process ended blocks nothing, whatever its other fields, so a crashed process's leftovers
// never hide a resume. Only a record that may hold the target session still blocks.
export type RegistryVerdict = "skip" | "occupied" | "unknown";
// procStart: the process's start as ps prints it, which tells a reused pid apart. Claude Code 2.1.323 writes none; the
// pid alone then says whether the process is there (io.ts claudeRecordVerdict).
export interface RegistryIdentity { pid: number; procStart?: string; host: boolean }
// null when liveness cannot even be asked. Claude Code writes pidDomain "darwin" on macOS and a machine-id/PID-namespace
// value on Linux and WSL, so any other string is a process the host's ps cannot see. A procStart that is there but
// unreadable is not dropped: the record is then in a shape this reader does not know.
export function registryIdentity(name: string, raw: unknown): RegistryIdentity | null {
  if (!object(raw) || typeof raw.pid !== "number" || !Number.isSafeInteger(raw.pid) || raw.pid !== Number(name.slice(0, -5))) return null;
  if (raw.procStart !== undefined && (typeof raw.procStart !== "string" || !Number.isFinite(Date.parse(raw.procStart)))) return null;
  if (raw.pidDomain !== undefined && typeof raw.pidDomain !== "string") return null;
  return { pid: raw.pid, ...(typeof raw.procStart === "string" ? { procStart: raw.procStart } : {}), host: raw.pidDomain === undefined || raw.pidDomain === "darwin" };
}
// A live record is judged by its sessionId alone, whatever its kind; one below the floor or in another shape gives no
// reason to trust that sessionId, so it may hold the target. A record from another PID domain may be alive.
export function registryRecordVerdict(raw: unknown, target: string, liveness: "live" | "dead" | "foreign"): RegistryVerdict {
  if (liveness === "dead") return "skip";
  const intact = object(raw) && typeof raw.sessionId === "string" && !!raw.sessionId && typeof raw.cwd === "string" && absolutePath(raw.cwd) &&
    storedVersionAtLeast(raw.version, CLAUDE_REGISTRY_FLOOR) && typeof raw.kind === "string";
  if (!intact) return "unknown";
  if (raw.sessionId !== target) return "skip";
  return liveness === "live" ? "occupied" : "unknown";
}
// Every record is read: "in use" is the more accurate refusal when one holds the target, and both refuse the resume.
export function mergeOccupancy(verdicts: Iterable<RegistryVerdict>): "free" | "occupied" | "unknown" {
  let unknown = false;
  for (const verdict of verdicts) { if (verdict === "occupied") return "occupied"; if (verdict === "unknown") unknown = true; }
  return unknown ? "unknown" : "free";
}
export function sameCanvas(a: Canvas, b: Canvas): boolean {
  return a.id !== undefined || b.id !== undefined ? a.id !== undefined && a.id === b.id : a.path === b.path;
}
export function pickSession(records: readonly SessionRecord[], root: string, canvas: Canvas | null, available: (record: SessionRecord) => UnavailableReason | null):
  { available: true; record: SessionRecord } | { available: false; reason: "no_record" | UnavailableReason } {
  let latest: SessionRecord | undefined;
  if (canvas) for (const record of records) {
    if (record.root === root && sameCanvas(record.canvas, canvas) && (!latest || record.at >= latest.at)) latest = record;
  }
  if (!latest) return { available: false, reason: "no_record" };
  const reason = available(latest);
  return reason ? { available: false, reason } : { available: true, record: latest };
}
export function absolutePath(value: string | null): value is string {
  return value !== null && value.startsWith("/") && !value.includes("\0");
}
export function insideRoot(root: string, path: string): boolean {
  const rel = posix.relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith("../") && !posix.isAbsolute(rel));
}
export function supportedRuntime(runtime: Runtime, version: string | null): boolean {
  return version !== null && versionStatus(runtime, version) === "supported";
}
export function sessionAvailability(record: SessionRecord, facts: AvailabilityFacts): UnavailableReason | null {
  if (!facts.cli) return "cli_missing";
  if (!supportedRuntime(record.runtime, facts.version)) return "session_unavailable";
  if (!absolutePath(facts.root) || !absolutePath(facts.cwd) || !absolutePath(facts.configDir) ||
      facts.root !== record.root || facts.configDir !== record.configDir || facts.configDir !== facts.selectedConfigDir) return "session_unavailable";
  if (!insideRoot(facts.root, facts.cwd)) return "outside_root";
  if (!facts.sessionExists || facts.occupancy === "unknown") return "session_unavailable";
  return facts.occupancy === "occupied" ? "session_in_use" : null;
}
