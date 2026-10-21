import { validateEnvelope } from "../formats/validate";

export interface CliRun {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type FolderState =
  | { kind: "list"; root: string; scope: string[]; canvases: unknown[] }
  | { kind: "uninitialized" }
  | { kind: "error"; message: string }
  | { kind: "cliError"; stderr: string };

type Envelope =
  | { v: 1; ok: true; result: unknown }
  | { v: 1; ok: false; error: { code: string; message: string; nextSteps: string[] } };

interface ListResult {
  root: string;
  scope: string[];
  canvases: unknown[];
}

export function folderState(run: CliRun): FolderState {
  const cliError: FolderState = { kind: "cliError", stderr: run.stderr.split(/\r?\n/, 1)[0] ?? "" };
  if (run.timedOut || run.exitCode === null) return cliError;
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
  return { kind: "list", root, scope, canvases };
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
