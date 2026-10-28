import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

// Device-local first-run record in userData. Only v1 with completed true ends onboarding; the legacy `{}` written by
// markClosed meant only "the old wizard was closed once" (buzz-onboarding design, 2026-10-28 user).
export const COMPLETION_FILE = "onboarding.json";
export type CompletionRead =
  | { kind: "missing" }
  | { kind: "legacy" }
  | { kind: "complete"; projectRoot: string }
  | { kind: "corrupt" }
  | { kind: "unknown_version"; v: number }
  | { kind: "unreadable"; code: string };
// unknown_version: a newer app wrote it; overwriting would lose its data, so the user is sent to a compatible app.
export type CompletionWrite = { ok: true } | { ok: false; reason: "unknown_version" | "save_failed" };

function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function validRoot(value: unknown): value is string { return typeof value === "string" && isAbsolute(value) && !value.includes("\0"); }
function errorCode(error: unknown): string { return object(error) && "code" in error ? String(error.code) : "UNKNOWN"; }

export function classifyCompletion(text: string): CompletionRead {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { kind: "corrupt" }; }
  if (!object(value)) return { kind: "corrupt" };
  const keys = Object.keys(value);
  if (keys.length === 0) return { kind: "legacy" };
  // Any later version is judged by its number alone; its other fields may mean something this app cannot know.
  if (Number.isSafeInteger(value.v) && (value.v as number) > 1) return { kind: "unknown_version", v: value.v as number };
  if (value.v !== 1 || keys.length !== 3 || value.completed !== true || !validRoot(value.projectRoot)) return { kind: "corrupt" };
  return { kind: "complete", projectRoot: value.projectRoot };
}
export function readCompletion(userData: string): CompletionRead {
  let text: string;
  try { text = readFileSync(join(userData, COMPLETION_FILE), "utf8"); }
  catch (error) { const code = errorCode(error); return code === "ENOENT" ? { kind: "missing" } : { kind: "unreadable", code }; }
  return classifyCompletion(text);
}
export function onboardingComplete(read: CompletionRead): read is { kind: "complete"; projectRoot: string } { return read.kind === "complete"; }

// Same staging as markClosed: a temporary file in userData, then rename, so a crash never leaves a half record.
function replace(path: string, content: string, userData: string): void {
  const temporary = join(userData, `.onboarding-${randomUUID()}.tmp`);
  try { writeFileSync(temporary, content, { flag: "wx", mode: 0o600 }); renameSync(temporary, path); } finally { rmSync(temporary, { force: true }); }
}

// The caller (main) passes the canonical root it has just re-read and found registered.
export function writeCompletion(userData: string, projectRoot: string): CompletionWrite {
  if (!validRoot(projectRoot)) throw new Error("projectRoot must be an absolute path");
  const current = readCompletion(userData);
  if (current.kind === "unknown_version") return { ok: false, reason: "unknown_version" };
  // Nothing to back up from a file that cannot be read, so it is left as it is.
  if (current.kind === "unreadable") return { ok: false, reason: "save_failed" };
  try {
    if (current.kind === "corrupt") {
      // The original bytes are kept for diagnosis; without that copy the corrupt file stays in place.
      writeFileSync(join(userData, `onboarding.corrupt-${randomUUID()}.json`), readFileSync(join(userData, COMPLETION_FILE)), { flag: "wx", mode: 0o600 });
    }
    replace(join(userData, COMPLETION_FILE), `${JSON.stringify({ v: 1, completed: true, projectRoot })}\n`, userData);
    return { ok: true };
  } catch { return { ok: false, reason: "save_failed" }; }
}
