import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, rename, rm, rmdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { OwnedGroup } from "../conversation/process";
import { findOnPath } from "./states";

// The one git run onboarding makes: the clone the user approved (buzz-onboarding design 'GitHub 조회·clone 실행 계약').
// Remotes are read from .git/config elsewhere; nothing here runs inside a repository that already exists.

export interface CloneProcess {
  exit: Promise<number | null>;
  // Resolves once no process of the group is left, helpers the clone started included.
  gone: Promise<void>;
  stop(): void;
  // The end of stderr, main-only: it is classified, never shown.
  stderr(): string;
}
export type CloneSpawn = (command: string, args: string[], env: Record<string, string>) => CloneProcess;
export type CloneResult =
  | { kind: "cloned"; destination: string }
  | { kind: "cancelled" }
  | { kind: "failed"; code: "repository_unreachable" | "clone_failed" | "destination_exists" | "cleanup_failed" };

const STDERR_LIMIT = 64 * 1024;
const errno = (error: unknown) => typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
// Credentials and remote access go through the user's own helpers and SSH setup, never a prompt doan cannot show.
const ACCESS = [
  /repository not found/i, /authentication failed/i, /could not read (username|password)/i, /terminal prompts disabled/i,
  /permission denied/i, /could not read from remote repository/i, /host key verification failed/i, /could not resolve host/i,
  /failed to connect/i, /unable to access/i, /connection (timed out|refused|reset)/i, /operation timed out/i, /\b403\b/, /\b401\b/,
];

export function cloneFailure(stderr: string): "repository_unreachable" | "clone_failed" {
  return ACCESS.some(pattern => pattern.test(stderr)) ? "repository_unreachable" : "clone_failed";
}

// Hooks off (a fresh clone runs post-checkout), no submodules, and the URL after `--` so it is never an option.
export function cloneArgs(url: string, target: string): string[] {
  return ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "protocol.ext.allow=never",
    "clone", "--no-recurse-submodules", "--", url, target];
}

// Login-shell PATH so the user's credential helpers (gh among them) are found. Nothing may wait for input:
// no terminal prompt, no askpass window, and SSH in batch mode with host keys still checked.
export function cloneEnv(inherited: NodeJS.ProcessEnv, path: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(inherited)) if (value !== undefined) env[key] = value;
  for (const key of ["GIT_ASKPASS", "SSH_ASKPASS", "GIT_SSH", "GIT_DIR", "GIT_WORK_TREE", "GIT_CONFIG_PARAMETERS"]) delete env[key];
  return { ...env, PATH: path, GIT_TERMINAL_PROMPT: "0", SSH_ASKPASS_REQUIRE: "never", GCM_INTERACTIVE: "never", GIT_SSH_COMMAND: "ssh -o BatchMode=yes" };
}

export interface GitLocation {
  // The login shell's PATH, or null when the shell could not be read.
  path: string | null;
  executable(path: string): boolean;
  realpath(path: string): string | null;
  // The active developer directory (`/var/db/xcode_select_link`, or DEVELOPER_DIR), never `xcode-select`.
  developerDir(): string | null;
}
// macOS /usr/bin/git is a shim that opens the Command Line Tools installer when no developer directory has git;
// that window must not appear from onboarding, so the shim counts as git only when its target exists.
export function locateGit(where: GitLocation): string | null {
  if (where.path === null) return null;
  const git = findOnPath(where.path, "git", where.executable);
  if (git === null) return null;
  if (where.realpath(git) !== "/usr/bin/git") return git;
  const developer = where.developerDir() ?? "/Library/Developer/CommandLineTools";
  return where.executable(join(developer, "usr/bin/git")) ? git : null;
}

// A detached group, like agent sign-ins: cancel stops the clone and anything it started, and `gone` waits for all.
export const spawnClone: CloneSpawn = (command, args, env) => {
  const child = spawn(command, args, { env, cwd: env.HOME ?? "/", detached: true, stdio: ["ignore", "ignore", "pipe"] });
  let text = "";
  child.stderr!.setEncoding("utf8");
  child.stderr!.on("data", (chunk: string) => { text = (text + chunk).slice(-STDERR_LIMIT); });
  let release!: () => void;
  const gone = new Promise<void>(resolve => { release = resolve; });
  const group = child.pid ? new OwnedGroup(child.pid, undefined, undefined, release) : null;
  const exit = new Promise<number | null>(resolve => {
    child.once("error", () => { resolve(null); if (group) group.childExited(); else release(); });
    child.once("exit", code => { resolve(code); group?.childExited(); });
  });
  return { exit, gone, stop: () => { void group?.stop(); }, stderr: () => text };
};

export interface CloneRequest {
  git: string; url: string; destination: string; env: Record<string, string>;
  signal: AbortSignal; spawn?: CloneSpawn;
}

// Clones into a directory this run creates exclusively beside the destination, then claims the destination with an
// exclusive mkdir and renames over that empty directory: a folder made there meanwhile is never replaced. Cleanup
// removes only that temporary directory, and only after the whole process group is gone.
export async function runClone(request: CloneRequest): Promise<CloneResult> {
  const parent = dirname(request.destination);
  let temp: string;
  try { temp = await mkdtemp(join(parent, `.${basename(request.destination)}.doan-clone-`)); }
  catch { return { kind: "failed", code: "clone_failed" }; }
  const cleanup = async (result: CloneResult): Promise<CloneResult> => {
    try { await rm(temp, { recursive: true, force: true }); return result; } catch { return { kind: "failed", code: "cleanup_failed" }; }
  };
  if (request.signal.aborted) return cleanup({ kind: "cancelled" });
  const run = (request.spawn ?? spawnClone)(request.git, cloneArgs(request.url, temp), request.env);
  const stop = () => run.stop();
  request.signal.addEventListener("abort", stop, { once: true });
  const code = await run.exit;
  await run.gone;
  request.signal.removeEventListener("abort", stop);
  // A clone that finished after the cancel was accepted is still discarded: the user asked for nothing to remain.
  if (request.signal.aborted) return cleanup({ kind: "cancelled" });
  if (code !== 0) return cleanup({ kind: "failed", code: cloneFailure(run.stderr()) });
  try { await chmod(temp, 0o755); await mkdir(request.destination); }
  catch (error) { return cleanup({ kind: "failed", code: errno(error) === "EEXIST" ? "destination_exists" : "clone_failed" }); }
  try { await rename(temp, request.destination); }
  catch {
    // Only the empty directory this run made; a competitor's files stay.
    await rmdir(request.destination).catch(() => undefined);
    return cleanup({ kind: "failed", code: "destination_exists" });
  }
  return { kind: "cloned", destination: request.destination };
}
