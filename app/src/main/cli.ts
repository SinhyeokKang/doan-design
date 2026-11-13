import { findOnPath, initArgs } from "./onboarding/states";
import { spawn } from "node:child_process";
import { accessSync, constants as fsConstants, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { CLI_TIMEOUT_MS, folderState, type CliRun, type FolderState } from "./folderState";
import { launchEnv } from "./launchEnv";

export type LsTarget = { repo: string } | { cwd: string };

// `code` is the errno code of the failed check: only ENOENT and ENOTDIR say the folder is gone (autoFolders.ts).
export type FolderView = FolderState | { kind: "notFound"; code?: string };

// A packaged app never falls back to PATH: another doan version there could
// break the init/ls contract the app depends on.
export function cliCommand(env: NodeJS.ProcessEnv = process.env, packaged = false, resourcesPath = ""): string {
  return env.DOAN_CLI || (packaged ? `${resourcesPath.replace(/\/+$/, "")}/bin/doan` : "doan");
}

// `--repo` never walks up, so a saved folder is read as itself. `{cwd}` is for a
// folder the human just picked: the CLI walks up and reports the repo `root`.
export function runLs(cli: string, target: LsTarget, timeoutMs = CLI_TIMEOUT_MS): Promise<CliRun> {
  const args = "repo" in target ? ["ls", "--json", "--repo", target.repo] : ["ls", "--json"];
  return runCli(cli, args, "cwd" in target ? target.cwd : undefined, timeoutMs);
}

// What the CLI's git (git init for Keep out of Git) is found with, under the names Go reads: the login shell's PATH and
// the inherited DEVELOPER_DIR, as clone finds its git (onboarding/clone.ts locateGit, cloneEnv). A login shell that could
// not be read gives an empty PATH, so the CLI finds no git and answers git_missing as clone does, rather than run one
// from the app's own PATH (PRODUCT §3 'Launch environment').
export interface CliEnv { PATH?: string; DEVELOPER_DIR?: string }
export function cliEnv(loginPath: string | null, inherited: NodeJS.ProcessEnv): CliEnv {
  return { PATH: loginPath ?? "", ...(inherited.DEVELOPER_DIR ? { DEVELOPER_DIR: inherited.DEVELOPER_DIR } : {}) };
}

// gitInit: the screen showed the repository this setup creates (initArgs). env: CliEnv, for a run that may create it.
export function runInit(cli: string, folder: string, tokenCss: string | null, storage: "local" | null = null, options: { gitInit?: boolean; env?: CliEnv; timeoutMs?: number } = {}): Promise<CliRun> {
  return runCli(cli, initArgs(folder, tokenCss, storage, options.gitInit), undefined, options.timeoutMs ?? CLI_TIMEOUT_MS, options.env);
}

// `args` holds only absolute paths, so the CLI's root-relative rule never
// meets a path the app spelled relative to something else.
export function runConfig(cli: string, root: string, args: readonly string[], env: CliEnv = {}, timeoutMs = CLI_TIMEOUT_MS): Promise<CliRun> {
  return runCli(cli, ["config", "--json", "--repo", root, ...args], undefined, timeoutMs, env);
}

// No repo and no cwd: the presets are embedded in the CLI. The id goes after
// `--` so a value like `--repo` stays the positional id, never an option.
// `spawn` throws synchronously on argv it cannot pass (an id with NUL), which
// would reject the page's call; it is a CLI that could not start instead.
export function runDesignSkill(cli: string, id?: string, timeoutMs = CLI_TIMEOUT_MS): Promise<CliRun> {
  return runCli(cli, id === undefined ? ["design-skill", "--json"] : ["design-skill", "--json", "--", id], undefined, timeoutMs)
    .catch((error: unknown) => ({ exitCode: null, timedOut: false, spawnError: error instanceof Error ? error.message : String(error), stdout: "", stderr: "" }));
}

// `doan export` reads every asset of a canvas and may write up to 50 MiB, well past the 10 s of the other calls.
// Measured: the slowest export found, 5,000 assets in one directory, takes about 1.5 s on the development machine;
// 120 s leaves room for slower machines and disks.
export const EXPORT_TIMEOUT_MS = 120_000;

// `path` is a listed canvas row (`.doan/...`) and `output` the absolute file the save panel returned, so neither can
// read as an option. `--force`: the save panel already asked before replacing a file. `frame`: the prototype window's
// Export, in the flag's own argument, since a frame ID such as `--` or `-o` would otherwise read as a separator or flag.
export function runExport(cli: string, root: string, path: string, output: string, options: { frame?: string; timeoutMs?: number } = {}): Promise<CliRun> {
  const frame = options.frame === undefined ? [] : [`--frame=${options.frame}`, "--prototype"];
  return runCli(cli, ["export", path, ...frame, "-o", output, "--force", "--repo", root, "--json"], undefined, options.timeoutMs ?? EXPORT_TIMEOUT_MS)
    .catch((error: unknown) => ({ exitCode: null, timedOut: false, spawnError: error instanceof Error ? error.message : String(error), stdout: "", stderr: "" }));
}

// Checked before running, because a missing folder must show as "folder not
// found" rather than as the CLI's `repo_not_found` ("not initialized").
export async function readFolder(cli: string, path: string, timeoutMs = CLI_TIMEOUT_MS): Promise<FolderView> {
  try {
    if (!(await stat(path)).isDirectory()) return { kind: "notFound", code: "ENOTDIR" };
  } catch (error) {
    const code: unknown = typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined;
    return typeof code === "string" ? { kind: "notFound", code } : { kind: "notFound" };
  }
  return folderState(await runLs(cli, { repo: path }, timeoutMs));
}

function executable(path: string): boolean {
  try { accessSync(path, fsConstants.X_OK); return statSync(path).isFile(); } catch { return false; }
}

// Not `execFile`: its 1 MiB default `maxBuffer` is below a large repo's normal
// `ls` output. stdin is ignored so the CLI never waits for an answer (POSTMORTEM
// "A character device is not necessarily a terminal"). The launching terminal's session IDs would let the CLI record
// session associations for that session, so the CLI gets the launchd environment. PATH is the app's own unless
// `git` (CliEnv) names the login shell's: the CLI starts git through PATH only for git init. spawn looks a bare command
// up on the child's PATH, so an unpackaged run's bare `doan` (cliCommand) is found on the app's own PATH first.
function runCli(cli: string, args: string[], cwd: string | undefined, timeoutMs: number, git: CliEnv = {}): Promise<CliRun> {
  return new Promise((resolve) => {
    const own = process.env.PATH ?? "";
    const env = { ...launchEnv(process.env), ...(own ? { PATH: own } : {}), ...git };
    const command = git.PATH !== undefined && !cli.includes("/") ? findOnPath(own, cli, executable) ?? cli : cli;
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
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
    const kill = (run: Omit<CliRun, "stdout" | "stderr">) => {
      child.kill("SIGKILL");
      child.stdout.destroy();
      child.stderr.destroy();
      finish(run);
    };
    const timer = setTimeout(() => kill({ exitCode: null, timedOut: true }), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => finish({ exitCode: null, timedOut: false, spawnError: error.message }));
    child.on("close", (exitCode) => finish({ exitCode, timedOut: false }));
  });
}
