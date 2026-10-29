import { validateEnvelope } from "../formats/validate";
import type { CliRun } from "./folderState";

// `doan design-skill [id] --json` as the app reads it (design §2 '앱용 API').
// Successes and the CLI's own failures pass through as the CLI's v1 envelope;
// a run that produced neither becomes an app failure in the same envelope.

export interface DesignPresetSummary { id: string; title: string; description: string; scope: string; group?: string }
export interface DesignPresetSource { repository: string; commit: string; path: string }
// `version` is the producing CLI's version, shown as provenance only.
export interface DesignSkillList { version: string; presets: DesignPresetSummary[] }
export interface DesignSkillPreset { version: string; preset: DesignPresetSummary; body: string; sources: DesignPresetSource[] }

export type CliFailureReason = "unavailable" | "timeout" | "invalid_response" | "failed";
// A failure the CLI reported itself, unchanged. Its code set belongs to the CLI
// (usage_error, internal_error, ...), so it is a string, not this module's union.
export interface CliReportedFailure { code: string; message: string; nextSteps: string[] }
// Failures the app produced. Only `cli_error` carries `reason`; a caller tells
// these from a CLI failure by their code, which the CLI may not use.
export type AppFailure =
  | { code: "request_refused"; message: string; nextSteps: string[] }
  | { code: "cli_error"; reason: CliFailureReason; message: string; nextSteps: string[] };
export type DesignSkillReply<T> = { v: 1; ok: true; result: T } | { v: 1; ok: false; error: CliReportedFailure | AppFailure };

export const DESIGN_SKILL_CHANNELS = { list: "design-skills:list", get: "design-skills:get" } as const;

export const DESIGN_SKILL_REFUSED: DesignSkillReply<never> = { v: 1, ok: false, error: { code: "request_refused", message: "Doan refused this design preset request.", nextSteps: [] } };

// A CLI reply using one of these would be indistinguishable from an app failure.
const APP_CODES = new Set(["request_refused", "cli_error"]);

const MESSAGES: Record<CliFailureReason, string> = {
  unavailable: "The doan CLI could not be started",
  timeout: "The doan CLI did not answer in time",
  invalid_response: "The doan CLI returned a response Doan cannot read",
  failed: "The doan CLI stopped without a result",
};

function failure(reason: CliFailureReason, detail: string): DesignSkillReply<never> {
  return { v: 1, ok: false, error: { code: "cli_error", reason, message: detail ? `${MESSAGES[reason]}: ${detail}` : `${MESSAGES[reason]}.`, nextSteps: [] } };
}

// The list (no id) or one preset. The id is the caller's string, unchecked:
// the CLI judges it and its usage_error comes back unchanged.
export function designSkillGetRequest(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  const id: unknown = Reflect.get(value, "id");
  return keys.length === 1 && keys[0] === "id" && typeof id === "string" ? id : null;
}

export function interpretList(run: CliRun): DesignSkillReply<DesignSkillList> {
  return interpret(run, result => {
    const version = text(result, "version");
    const presets: unknown = Reflect.get(result, "presets");
    if (version === null || !Array.isArray(presets)) return null;
    const rows = presets.map(summary);
    return rows.every((row): row is DesignPresetSummary => row !== null) ? { version, presets: rows } : null;
  });
}

export function interpretGet(run: CliRun, id: string): DesignSkillReply<DesignSkillPreset> {
  return interpret(run, result => {
    const version = text(result, "version");
    const preset = summary(Reflect.get(result, "preset"));
    const body = text(result, "body");
    const sources: unknown = Reflect.get(result, "sources");
    if (version === null || preset === null || body === null || !Array.isArray(sources) || preset.id !== id) return null;
    // Without the marker the body may be cut short, and a partial preset must not be worked from.
    if (!body.endsWith(`[doan:design-skill] end of preset ${id} v${version}\n`)) return null;
    const rows = sources.map(source);
    return rows.every((row): row is DesignPresetSource => row !== null) ? { version, preset, body, sources: rows } : null;
  });
}

// No retry: a caller sees each run's own outcome. stderr is only quoted, never
// read for meaning (an older CLI is recognised by its list usage_error).
function interpret<T>(run: CliRun, read: (result: object) => T | null): DesignSkillReply<T> {
  if (run.spawnError !== undefined) return failure("unavailable", run.spawnError);
  if (run.timedOut) return failure("timeout", "");
  const exited = run.exitCode === 0 ? "" : `exit ${run.exitCode ?? "by signal"}`;
  let value: unknown;
  try {
    value = JSON.parse(run.stdout);
  } catch {
    return run.exitCode === 0 ? failure("invalid_response", "not JSON") : failure("failed", [exited, run.stderr.split(/\r?\n/, 1)[0]].filter(Boolean).join(", "));
  }
  const v: unknown = typeof value === "object" && value !== null ? Reflect.get(value, "v") : undefined;
  if (v !== undefined && v !== 1) return failure("invalid_response", `unknown envelope version ${JSON.stringify(v)}`);
  if (!validateEnvelope(value)) return run.exitCode === 0 ? failure("invalid_response", "not a v1 envelope") : failure("failed", exited);
  const envelope = value as { ok: true; result: unknown } | { ok: false; error: CliReportedFailure };
  if (!envelope.ok) {
    if (run.exitCode === 0) return failure("invalid_response", "a failure with exit 0");
    if (APP_CODES.has(envelope.error.code)) return failure("invalid_response", `the CLI used the app code ${envelope.error.code}`);
    const { code, message, nextSteps } = envelope.error;
    return { v: 1, ok: false, error: { code, message, nextSteps: [...nextSteps] } };
  }
  if (run.exitCode !== 0) return failure("invalid_response", `a result with ${exited}`);
  const result = typeof envelope.result === "object" && envelope.result !== null ? read(envelope.result) : null;
  return result === null ? failure("invalid_response", "unexpected result") : { v: 1, ok: true, result };
}

// Only the contract's fields are kept, so a newer CLI's extra fields (or a body
// in a list row) never reach the renderer.
function summary(value: unknown): DesignPresetSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const id = text(value, "id"), title = text(value, "title"), description = text(value, "description"), scope = text(value, "scope");
  const group: unknown = Reflect.get(value, "group");
  if (id === null || title === null || description === null || scope === null || (group !== undefined && typeof group !== "string")) return null;
  return { id, title, description, scope, ...(typeof group === "string" ? { group } : {}) };
}

function source(value: unknown): DesignPresetSource | null {
  if (typeof value !== "object" || value === null) return null;
  const repository = text(value, "repository"), commit = text(value, "commit"), path = text(value, "path");
  return repository === null || commit === null || path === null ? null : { repository, commit, path };
}

function text(value: object, key: string): string | null {
  const field: unknown = Reflect.get(value, key);
  return typeof field === "string" ? field : null;
}
