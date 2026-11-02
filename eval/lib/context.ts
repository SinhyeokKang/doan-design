import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
import { toolCalls, type ToolCalls } from "./transcript.ts";
import type { CheckContext } from "./types.ts";

export function resolveInside(repo: string, path: string): string {
  if (path === "" || isAbsolute(path)) throw new Error(`not a repo-relative path: ${JSON.stringify(path)}`);
  const full = join(repo, path);
  const rel = relative(repo, full);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`path leaves the repo: ${path}`);
  return normalize(full);
}

// readFileSync and existsSync follow links, and the agent may have left one (as
// the target or any ancestor) pointing out of the repo. The deepest part of the
// path that exists is resolved, so a missing file under an outside link is
// refused too, instead of being reported as missing.
function resolveOnDisk(repo: string, path: string): string {
  const full = resolveInside(repo, path);
  let probe = full;
  let real: string;
  for (;;) {
    try { real = realpathSync(probe); break; } catch { probe = dirname(probe); }
  }
  const rel = relative(realpathSync(repo), real);
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) throw new Error(`path leaves the repo: ${path}`);
  return full;
}

// The repo-relative form git understands, after the same checks as resolveInside.
export function repoPath(repo: string, path: string): string {
  return relative(repo, resolveInside(repo, path));
}

function lines(text: string | null): string[] {
  return (text ?? "").split("\n").filter(line => line.trim() !== "");
}

// A multiset difference rather than "lines after the seed's last line", so an
// agent that rewrites the file instead of appending still shows only what it added.
export function addedLines(seed: string | null, current: string | null): string[] {
  const left = new Map<string, number>();
  for (const line of lines(seed)) left.set(line, (left.get(line) ?? 0) + 1);
  return lines(current).filter(line => {
    const n = left.get(line) ?? 0;
    if (n === 0) return true;
    left.set(line, n - 1);
    return false;
  });
}

export function parseEvents(added: string[]): any[] {
  return added.map(line => {
    try { return JSON.parse(line); } catch { return { invalid: line }; }
  });
}

const CANVAS_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface ContextOptions {
  repo: string;
  // Defaults to `repo`.
  cwd?: string;
  agent: CheckContext["agent"];
  transcript: string;
  calls?: ToolCalls;
  cli: string;
  env: NodeJS.ProcessEnv;
  seedCommit: string;
  onboardingLog?: string;
  workLog?: string;
  openLog?: string;
  // The fake app's record of the files it wrote into `repo` (socket.ts initializeRepo).
  appWrites?: string;
}

export function sh(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const result = spawnSync(cmd, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000, killSignal: "SIGKILL", maxBuffer: 64 << 20 });
  return { code: result.status ?? -1, stdout: result.stdout ?? "", stderr: (result.stderr ?? "") + (result.error ? `\n${result.error.message}` : "") };
}

// Post-agent Git reads must not launch repository-configured helpers. Filters
// also run during diff conversion and intent-to-add, independently of textconv.
function checkedGit(repo: string, args: string[], env: NodeJS.ProcessEnv) {
  const config = sh("git", ["-C", repo, "config", "--null", "--get-regexp", "^filter\\..*\\.(clean|process|required)$"], repo, env);
  if (config.code !== 0 && config.code !== 1) throw new Error(`git config failed: ${config.stderr}`);
  const overrides = ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"];
  for (const entry of config.stdout.split("\0").filter(Boolean)) {
    const key = entry.split("\n")[0];
    overrides.push("-c", `${key}=${key.endsWith(".required") ? "false" : ""}`);
  }
  return sh("git", ["-C", repo, ...overrides, ...args], repo, env);
}

// The files the fake app wrote that still hold exactly what it wrote: the app's
// work, not the agent's. One the agent changed afterwards counts as the agent's.
export function appWritten(repo: string, manifest: string | undefined): string[] {
  if (!manifest || !existsSync(manifest)) return [];
  const written: Record<string, string> = JSON.parse(readFileSync(manifest, "utf8"));
  return Object.keys(written).filter(path => {
    try { return readFileSync(resolveOnDisk(repo, path), "utf8") === written[path]; } catch { return false; }
  });
}

function diffSinceSeed(dir: string, env: NodeJS.ProcessEnv, seedCommit: string, exclude: string[] = []): string {
  const added = checkedGit(dir, ["add", "-A", "-N", "-f"], env);
  if (added.code !== 0) throw new Error(`git add failed: ${added.stderr}`);
  const pathspec = exclude.length ? ["--", ".", ...exclude.map(path => `:(exclude,literal)${path}`)] : [];
  const diff = checkedGit(dir, ["diff", "--no-color", "--no-ext-diff", "--no-textconv", seedCommit, ...pathspec], env);
  if (diff.code !== 0) throw new Error(`git diff failed: ${diff.stderr}`);
  return diff.stdout;
}

// The agent's own worktree is labelled so the judge can tell it from the root.
export function judgeMaterial(ws: { repo: string; cwd?: string; env: NodeJS.ProcessEnv; seedCommit: string; appWrites?: string }, ctx: CheckContext) {
  const diff = diffSinceSeed(ws.repo, ws.env, ws.seedCommit, appWritten(ws.repo, ws.appWrites));
  if (!ws.cwd || ws.cwd === ws.repo) return { changed: ctx.changedFiles(), diff };
  const cwdDiff = diffSinceSeed(ws.cwd, ws.env, ws.seedCommit);
  return {
    changed: [...ctx.changedFiles(), ...ctx.cwdChangedFiles().map(path => `(working directory) ${path}`)],
    diff: `${diff}\n# Working directory ${ws.cwd}\n${cwdDiff}`,
  };
}

export function createContext(o: ContextOptions): CheckContext {
  const cwd = o.cwd ?? o.repo;
  const git = (args: string[], dir = o.repo) => checkedGit(dir, args, o.env);
  const changedFiles = (dir: string): string[] => {
    // Against the seed commit, not HEAD, so an agent that commits its work is still seen.
    const tracked = git(["diff", "--name-only", "-z", "--no-renames", "--no-ext-diff", "--no-textconv", o.seedCommit], dir);
    const untracked = git(["ls-files", "-z", "--others"], dir);
    // git's last stderr line names the cause; the rest is a usage dump.
    if (tracked.code !== 0 || untracked.code !== 0) throw new Error(`git failed: ${(tracked.stderr || untracked.stderr).trim().split("\n").pop()}`);
    const app = dir === o.repo ? appWritten(o.repo, o.appWrites) : [];
    return [...new Set([...tracked.stdout.split("\0"), ...untracked.stdout.split("\0")].filter(path => path && !app.includes(path)))].sort();
  };
  const seed = (path: string): string | null => {
    const result = git(["show", `${o.seedCommit}:${repoPath(o.repo, path)}`]);
    return result.code === 0 ? result.stdout : null;
  };
  const read = (path: string): string | null => {
    const full = resolveOnDisk(o.repo, path);
    try { return readFileSync(full, "utf8"); } catch { return null; }
  };
  return {
    repo: o.repo,
    cwd,
    agent: o.agent,
    transcript: o.transcript,
    calls: o.calls ?? toolCalls(o.transcript),
    doan(args) {
      const result = sh(o.cli, [...args, "--json", "--repo", o.repo], o.repo, o.env);
      let json: any = null;
      try { json = JSON.parse(result.stdout); } catch { /* left null for the check to report */ }
      return { code: result.code, json };
    },
    read,
    exists: path => existsSync(resolveOnDisk(o.repo, path)),
    seed,
    changedFiles: () => changedFiles(o.repo),
    cwdChangedFiles: () => changedFiles(cwd),
    commentEvents(canvasId) {
      if (!CANVAS_ID.test(canvasId)) throw new Error(`not a canvas id: ${canvasId}`);
      const path = `.doan/comments/${canvasId}.jsonl`;
      return parseEvents(addedLines(seed(path), read(path)));
    },
    onboarding() {
      if (!o.onboardingLog || !existsSync(o.onboardingLog)) return [];
      return readFileSync(o.onboardingLog, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    },
    work() {
      if (!o.workLog || !existsSync(o.workLog)) return [];
      return readFileSync(o.workLog, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    },
    open() {
      if (!o.openLog || !existsSync(o.openLog)) return [];
      return readFileSync(o.openLog, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    },
    run: (cmd, args) => sh(cmd, args, o.repo, o.env),
  };
}
