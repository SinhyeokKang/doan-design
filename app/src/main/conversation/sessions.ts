import { posix } from "node:path";
import { validateSessionRecord } from "../../formats/validate";
import type { AvailabilityFacts, Canvas, Runtime, SessionRecord, UnavailableReason } from "./types";

export const SESSION_TAIL_BYTES = 1024 * 1024;
export const SUPPORTED_VERSIONS = { claude: "2.1.312", codex: "0.164.0", claudeSdk: "0.3.312" };
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
export function supportedRuntime(runtime: Runtime, version: string | null, sdkVersion?: string): boolean {
  return version === SUPPORTED_VERSIONS[runtime] && (runtime !== "claude" || sdkVersion === SUPPORTED_VERSIONS.claudeSdk);
}
export function sessionAvailability(record: SessionRecord, facts: AvailabilityFacts): UnavailableReason | null {
  if (!facts.cli) return "cli_missing";
  if (!supportedRuntime(record.runtime, facts.version, facts.sdkVersion)) return "session_unavailable";
  if (!absolutePath(facts.root) || !absolutePath(facts.cwd) || !absolutePath(facts.configDir) ||
      facts.root !== record.root || facts.configDir !== record.configDir || facts.configDir !== facts.selectedConfigDir) return "session_unavailable";
  if (!insideRoot(facts.root, facts.cwd)) return "outside_root";
  if (!facts.sessionExists || facts.occupancy === "unknown") return "session_unavailable";
  return facts.occupancy === "occupied" ? "session_in_use" : null;
}
