import { posix } from "node:path";
import { validateSessionRecord } from "../../formats/validate";
import { MINIMUM_VERSIONS } from "./minimumVersions";
import type { AvailabilityFacts, Canvas, Runtime, SessionRecord, UnavailableReason } from "./types";

export { MINIMUM_VERSIONS };

export const SESSION_TAIL_BYTES = 1024 * 1024;
export type VersionedProvider = keyof typeof MINIMUM_VERSIONS;
// Stored sessions keep the version that wrote them, so these floors stay put when a minimum rises: the oldest Codex
// doan supported, and the Claude version of every terminal sharing a registry. Raising one abandons those sessions.
export const CODEX_ROLLOUT_FLOOR = "0.163.0";
export const CLAUDE_REGISTRY_FLOOR = "2.1.312";
const CLI_VERSION = /(\d+)\.(\d+)\.(\d+)((?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)/;
const STORED_VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
// Numeric per part, so 0.99.0 < 0.164.0; suffixes never take part.
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
