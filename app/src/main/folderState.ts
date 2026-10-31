import { validateEnvelope } from "../formats/validate";
import { isRowError, type GitInfo, type OrphanFile } from "./view";

export interface CliRun {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  // Node reports a missing CLI as a spawn error (ENOENT), not exit 127 with
  // stderr, so without this the CLI error would have no reason to show.
  spawnError?: string;
}

export type FolderState =
  | { kind: "list"; root: string; scope: string[]; canvases: unknown[]; git?: GitInfo; orphans?: OrphanFile[] }
  | { kind: "uninitialized" }
  | { kind: "error"; message: string }
  | { kind: "cliError"; reason: string };

type Envelope =
  | { v: 1; ok: true; result: unknown }
  | { v: 1; ok: false; error: { code: string; message: string; nextSteps: string[] } };

interface ListResult {
  root: string;
  scope: string[];
  canvases: unknown[];
}

export function folderState(run: CliRun): FolderState {
  // The runner kills a hung CLI after 10 s (cli.ts), and a killed process
  // usually leaves no stderr, so say why rather than show an empty reason.
  const reason = run.spawnError ?? (run.timedOut ? "timed out after 10 s" : run.stderr.split(/\r?\n/, 1)[0] ?? "");
  const cliError: FolderState = { kind: "cliError", reason };
  if (run.spawnError !== undefined || run.timedOut || run.exitCode === null) return cliError;
  let value: unknown;
  try {
    value = JSON.parse(run.stdout);
  } catch {
    return cliError;
  }
  if (!isEnvelope(value)) return cliError;
  if (!value.ok) {
    if (run.exitCode === 0) return cliError;
    if (value.error.code === "repo_not_found") return { kind: "uninitialized" };
    return { kind: "error", message: value.error.message };
  }
  if (run.exitCode !== 0 || !isListResult(value.result)) return cliError;
  const { root, scope, canvases } = value.result;
  const git: unknown = Reflect.get(value.result, "git");
  const orphans: unknown = Reflect.get(value.result, "orphans");
  return { kind: "list", root, scope, canvases, ...(isGitInfo(git) ? { git } : {}), ...(Array.isArray(orphans) ? { orphans: orphans.flatMap(orphanFile) } : {}) };
}

// CLI orphan counts support the Comments notice after a canvas ID changes.
// Keep only whole entries; a malformed one does not fail an otherwise good listing.
// Preserve empty IDs from the CLI too, matching the `.jsonl` filename.
function orphanFile(value: unknown): OrphanFile[] {
  if (typeof value !== "object" || value === null) return [];
  const id: unknown = Reflect.get(value, "id");
  const file: unknown = Reflect.get(value, "file");
  const uncertain: unknown = Reflect.get(value, "uncertain");
  const comments: unknown = Reflect.get(value, "comments");
  const error: unknown = Reflect.get(value, "error");
  if (typeof id !== "string" || typeof file !== "string" || typeof uncertain !== "boolean") return [];
  if (error !== undefined && !isRowError(error)) return [];
  let counts: OrphanFile["comments"];
  if (comments !== undefined) {
    const open = count(comments, "open");
    const resolved = count(comments, "resolved");
    if (open === null || resolved === null) return [];
    counts = { open, resolved };
  }
  return [{ id, file, ...(counts ? { comments: counts } : {}), ...(error === undefined ? {} : { error: { code: error.code, message: error.message } }), uncertain }];
}

function count(comments: unknown, key: string): number | null {
  const n: unknown = typeof comments === "object" && comments !== null ? Reflect.get(comments, key) : undefined;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
}

// `git` is optional and only shown, so a malformed one is dropped rather than
// failing a listing that is otherwise good.
function isGitInfo(value: unknown): value is GitInfo {
  if (typeof value !== "object" || value === null) return false;
  const optional = (key: string) => !(key in value) || typeof Reflect.get(value, key) === "string";
  const common: unknown = Reflect.get(value, "common");
  const worktrees: unknown = Reflect.get(value, "worktrees");
  return typeof common === "string" && Array.isArray(worktrees) && worktrees.every((entry) => typeof entry === "string") &&
    optional("main") && optional("branch") && optional("detached");
}

function isEnvelope(value: unknown): value is Envelope {
  return validateEnvelope(value);
}

// Only the fields the app reads. An older `doan` without `root`/`scope` fails here.
function isListResult(result: unknown): result is ListResult {
  return typeof result === "object" && result !== null &&
    "root" in result && typeof result.root === "string" &&
    "scope" in result && Array.isArray(result.scope) && result.scope.every((entry) => typeof entry === "string") &&
    "canvases" in result && Array.isArray(result.canvases);
}

export type InitOutcome =
  | { kind: "success" }
  | { kind: "error"; message: string; guidance: string }
  | { kind: "cliError"; reason: string };

export function initOutcome(run: CliRun): InitOutcome {
  const reason = run.spawnError ?? (run.timedOut ? "timed out after 10 s" : run.stderr.split(/\r?\n/, 1)[0] || "Invalid response from doan CLI.");
  const cliError: InitOutcome = { kind: "cliError", reason };
  if (run.spawnError !== undefined || run.timedOut || run.exitCode === null) return cliError;
  let value: unknown;
  try {
    value = JSON.parse(run.stdout);
  } catch {
    return cliError;
  }
  if (!isEnvelope(value)) return cliError;
  if (!value.ok) {
    if (run.exitCode === 0) return cliError;
    const guidance = value.error.code === "invalid_config" ? "Fix the project configuration, then try again."
      : value.error.code === "usage_error" ? "Check the project and choose a CSS file inside it, then try again."
        : "Check the project, then try again.";
    return { kind: "error", message: value.error.message, guidance };
  }
  const result = value.result;
  if (run.exitCode !== 0 || typeof result !== "object" || result === null ||
    !("initialized" in result) || typeof result.initialized !== "boolean" ||
    !("repo" in result) || typeof result.repo !== "string" ||
    !("created" in result) || !Array.isArray(result.created) || !result.created.every((entry) => typeof entry === "string")) return cliError;
  // init's repo spelling is not canonical; the caller must re-read with ls.
  return { kind: "success" };
}

export function reconcileFolders(stored: readonly string[], path: string, upwardResult: FolderState): { folders: string[]; focus: string | null } {
  if (!stored.includes(path)) return { folders: [...stored], focus: null };
  if (upwardResult.kind !== "list") return { folders: [...stored], focus: path };
  const root = upwardResult.root;
  // CLI roots already have disk spelling. Preserve the first resulting row;
  // do not guess identity by lowercasing unrelated paths on case-sensitive disks.
  return { folders: [...new Set(stored.map((entry) => entry === path ? root : entry))], focus: root };
}
