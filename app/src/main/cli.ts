import { initArgs } from "./onboarding/states";
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { folderState, type CliRun, type FolderState } from "./folderState";

const CLI_TIMEOUT_MS = 10_000;

export type LsTarget = { repo: string } | { cwd: string };

export type FolderView = FolderState | { kind: "notFound" };

// A packaged app never falls back to PATH: another doan version there could
// break the init/ls contract the app depends on.
export function cliCommand(env: NodeJS.ProcessEnv = process.env, packaged = false, resourcesPath = ""): string {
  return env.DOAN_CLI || (packaged ? `${resourcesPath.replace(/\/+$/, "")}/bin/doan` : "doan");
}

// `--repo` never walks up, so a saved folder is read as itself. `{cwd}` is for a
// folder the human just picked: the CLI walks up and reports the repo `root`.
// `signal` ends the run early (a cancelled scan); the result is then a CLI error.
export function runLs(cli: string, target: LsTarget, timeoutMs = CLI_TIMEOUT_MS, signal?: AbortSignal): Promise<CliRun> {
  const args = "repo" in target ? ["ls", "--json", "--repo", target.repo] : ["ls", "--json"];
  return runCli(cli, args, "cwd" in target ? target.cwd : undefined, timeoutMs, signal);
}

export function runInit(cli: string, folder: string, tokenCss: string | null, timeoutMs = CLI_TIMEOUT_MS): Promise<CliRun> {
  return runCli(cli, initArgs(folder, tokenCss), undefined, timeoutMs);
}

// `args` holds only absolute paths, so the CLI's root-relative rule never
// meets a path the app spelled relative to something else.
export function runConfig(cli: string, root: string, args: readonly string[], timeoutMs = CLI_TIMEOUT_MS): Promise<CliRun> {
  return runCli(cli, ["config", "--json", "--repo", root, ...args], undefined, timeoutMs);
}

// No repo and no cwd: the presets are embedded in the CLI. The id goes after
// `--` so a value like `--repo` stays the positional id, never an option.
// `spawn` throws synchronously on argv it cannot pass (an id with NUL), which
// would reject the page's call; it is a CLI that could not start instead.
export function runDesignSkill(cli: string, id?: string, timeoutMs = CLI_TIMEOUT_MS): Promise<CliRun> {
  return runCli(cli, id === undefined ? ["design-skill", "--json"] : ["design-skill", "--json", "--", id], undefined, timeoutMs)
    .catch((error: unknown) => ({ exitCode: null, timedOut: false, spawnError: error instanceof Error ? error.message : String(error), stdout: "", stderr: "" }));
}

// Checked before running, because a missing folder must show as "folder not
// found" rather than as the CLI's `repo_not_found` ("not initialized").
export async function readFolder(cli: string, path: string, timeoutMs = CLI_TIMEOUT_MS): Promise<FolderView> {
  try {
    if (!(await stat(path)).isDirectory()) return { kind: "notFound" };
  } catch {
    return { kind: "notFound" };
  }
  return folderState(await runLs(cli, { repo: path }, timeoutMs));
}

// Not `execFile`: its 1 MiB default `maxBuffer` is below a large repo's normal
// `ls` output. stdin is ignored so the CLI never waits for an answer (POSTMORTEM
// "A character device is not necessarily a terminal").
function runCli(cli: string, args: string[], cwd: string | undefined, timeoutMs: number, signal?: AbortSignal): Promise<CliRun> {
  if (signal?.aborted) return Promise.resolve({ exitCode: null, timedOut: false, spawnError: "cancelled", stdout: "", stderr: "" });
  return new Promise((resolve) => {
    const child = spawn(cli, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    const finish = (run: Omit<CliRun, "stdout" | "stderr">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve({ ...run, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() });
    };
    // Resolve at the timeout instead of waiting for `close`: a child the CLI
    // started could keep the pipes open long after the CLI itself is killed.
    const kill = (run: Omit<CliRun, "stdout" | "stderr">) => {
      child.kill("SIGKILL");
      child.stdout.destroy();
      child.stderr.destroy();
      finish(run);
    };
    const timer = setTimeout(() => kill({ exitCode: null, timedOut: true }), timeoutMs);
    const abort = () => kill({ exitCode: null, timedOut: false, spawnError: "cancelled" });
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => finish({ exitCode: null, timedOut: false, spawnError: error.message }));
    child.on("close", (exitCode) => finish({ exitCode, timedOut: false }));
  });
}
