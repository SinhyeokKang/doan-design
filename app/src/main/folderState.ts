import { validateEnvelope } from "../formats/validate";
import { storageFacts, type StorageFacts } from "./storage";
import type { GitInfo } from "./view";

// How long the runner (cli.ts) lets a CLI call run before killing it. Here so a timeout's reason says the same number.
export const CLI_TIMEOUT_MS = 10_000;

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
  | ({ kind: "list"; root: string; scope: string[]; canvases: unknown[]; git?: GitInfo } & StorageFacts)
  | { kind: "uninitialized" }
  // A Config error: the CLI named the config file it failed on (`error.config`, an absolute path that may be a parent
  // folder's). Only this is a Config error; the code alone does not decide it.
  | { kind: "error"; message: string; config: string }
  // `code`: the CLI answered with a failure envelope and a non-zero exit, for a reason other than a config file (an
  // unreadable canvas folder, say). Absent when the command did not answer that way. With `--repo` (never searching
  // upward) it means Go read the folder as a repository root. Main reads it to decide; screens never show it.
  | { kind: "cliError"; reason: string; code?: string };

type Envelope =
  | { v: 1; ok: true; result: unknown }
  | { v: 1; ok: false; error: { code: string; message: string; nextSteps: string[]; config?: string } };

interface ListResult {
  root: string;
  scope: string[];
  canvases: unknown[];
}

// Details shows this reason (PRODUCT §5 item 3 'Problem states'), so it is never empty: the command's own message
// when it gave one (`message`: an error envelope's), else a short account of how the run ended. A killed or
// crashed process usually leaves no stderr.
function cliReason(run: CliRun, message = ""): string {
  if (run.spawnError !== undefined) return run.spawnError ? `Couldn’t start the doan command: ${run.spawnError}` : "Couldn’t start the doan command.";
  if (run.timedOut) return `The doan command didn’t answer within ${CLI_TIMEOUT_MS / 1000} seconds.`;
  const said = message.trim() || run.stderr.split(/\r?\n/).map(line => line.trim()).find(Boolean);
  if (said) return said;
  if (run.exitCode === null) return "The doan command stopped without a message.";
  if (run.exitCode !== 0) return `The doan command exited with code ${run.exitCode} without a message.`;
  return "The doan command answered, but Doan couldn’t read the answer.";
}

export function folderState(run: CliRun): FolderState {
  const cliError = (message?: string): FolderState => ({ kind: "cliError", reason: cliReason(run, message) });
  if (run.spawnError !== undefined || run.timedOut || run.exitCode === null) return cliError();
  let value: unknown;
  try {
    value = JSON.parse(run.stdout);
  } catch {
    return cliError();
  }
  if (!isEnvelope(value)) return cliError();
  if (!value.ok) {
    if (run.exitCode === 0) return cliError(value.error.message);
    if (value.error.code === "repo_not_found") return { kind: "uninitialized" };
    const { code, message, config } = value.error;
    if (config !== undefined) return { kind: "error", message, config };
    return { kind: "cliError", reason: cliReason(run, message), code };
  }
  if (run.exitCode !== 0 || !isListResult(value.result)) return cliError();
  const { root, scope, canvases } = value.result;
  const git: unknown = Reflect.get(value.result, "git");
  return { kind: "list", root, scope, canvases, ...(isGitInfo(git) ? { git } : {}), ...storageFacts(value.result) };
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
  | { kind: "error"; code: string; message: string; guidance: string }
  | { kind: "cliError"; reason: string };

// The Set Up dialog's sentences for a refused local setup (draft frame setup-dialog). The CLI's messages for these codes
// are short and path-free and do not say that nothing was set up, so the dialog says it; an exclude failure may be a
// link, a permission or an unreadable Git directory, so its recovery covers all of them.
const STORAGE_REFUSALS: Record<string, { message: string; guidance: string }> = {
  local_not_git: { message: "This folder isn’t a Git repository, so Doan can’t keep its files out of Git.", guidance: "Choose Include in Git, or run git init here first." },
  local_exclude_failed: { message: "Couldn’t add Doan’s lines to .git/info/exclude, so nothing was set up.", guidance: "Make sure the repository’s Git metadata and its exclude file can be read and written, then try again." },
};

// tokenCss: a token CSS was chosen, so a usage_error may be about it; otherwise CSS guidance would point elsewhere.
export function initOutcome(run: CliRun, request: { tokenCss?: boolean } = {}): InitOutcome {
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
    const code = value.error.code;
    const refusal = STORAGE_REFUSALS[code];
    if (refusal) return { kind: "error", code, ...refusal };
    const guidance = code === "invalid_config" ? "Fix the project configuration, then try again."
      : code === "usage_error" && request.tokenCss ? "Check the project and choose a CSS file inside it, then try again."
        : "Check the project, then try again.";
    return { kind: "error", code, message: value.error.message, guidance };
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
