import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { folderState, type CliRun, type FolderState } from "./folderState";

const CLI_TIMEOUT_MS = 10_000;

export type LsTarget = { repo: string } | { cwd: string };

export type FolderView = FolderState | { kind: "notFound" };

// Bundled CLI paths come with distribution (feature 8); until then a dev build
// is passed in DOAN_CLI, falling back to `doan` on PATH.
export function cliCommand(env: NodeJS.ProcessEnv = process.env): string {
  return env.DOAN_CLI || "doan";
}

// `--repo` never walks up, so a saved folder is read as itself. `{cwd}` is for a
// folder the human just picked: the CLI walks up and reports the repo `root`.
export function runLs(cli: string, target: LsTarget, timeoutMs = CLI_TIMEOUT_MS): Promise<CliRun> {
  const args = "repo" in target ? ["ls", "--json", "--repo", target.repo] : ["ls", "--json"];
  return runCli(cli, args, "cwd" in target ? target.cwd : undefined, timeoutMs);
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
function runCli(cli: string, args: string[], cwd: string | undefined, timeoutMs: number): Promise<CliRun> {
  return new Promise((resolve) => {
    const child = spawn(cli, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    const finish = (run: Omit<CliRun, "stdout" | "stderr">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...run, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() });
    };
    // Resolve at the timeout instead of waiting for `close`: a child the CLI
    // started could keep the pipes open long after the CLI itself is killed.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      child.stdout.destroy();
      child.stderr.destroy();
      finish({ exitCode: null, timedOut: true });
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => finish({ exitCode: null, timedOut: false, spawnError: error.message }));
    child.on("close", (exitCode) => finish({ exitCode, timedOut: false }));
  });
}
