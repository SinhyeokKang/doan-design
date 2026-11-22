import { readCallLog } from "./call-log.ts";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { relative } from "node:path";
import { readRegularFileNoFollowSync } from "../../app/src/main/regularFile.ts";
import { CANVAS_BYTES, LOG_BYTES, MANIFEST_BYTES, readArtifact, resolveInside, resolveOnDisk } from "./artifact.ts";
import { readCanvasNames } from "./canvas-watch.ts";
import { toolCalls, type ToolCalls } from "./transcript.ts";
import type { CheckContext } from "./types.ts";

export { resolveInside } from "./artifact.ts";

// The repo-relative form git understands, after the same checks as resolveInside.
export function repoPath(repo: string, path: string): string {
  return relative(repo, resolveInside(repo, path));
}

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
  // Workspace.gitDir: the baseline lives outside `repo`.
  gitDir?: string | null;
  doanLog?: string | undefined;
  onboardingLog?: string;
  workLog?: string;
  openLog?: string;
  handoffLog?: string;
  prototypeLog?: string;
  // The fake app's record of the files it wrote into `repo` (socket.ts initializeRepo).
  appWrites?: string;
  // Workspace.canvasLog.
  canvasLog?: string;
}

export function sh(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const result = spawnSync(cmd, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000, killSignal: "SIGKILL", maxBuffer: 64 << 20 });
  // spawnSync leaves stdout and stderr null when the command could not start, despite their string type.
  const stdout = result.stdout as string | null, stderr = result.stderr as string | null;
  return { code: result.status ?? -1, stdout: stdout ?? "", stderr: (stderr ?? "") + (result.error ? `\n${result.error.message}` : "") };
}

// Post-agent Git reads must not launch repository-configured helpers. Filters
// also run during diff conversion and intent-to-add, independently of textconv.
function checkedGit(repo: string, args: string[], env: NodeJS.ProcessEnv, gitDir?: string | null) {
  // An explicit Git directory also keeps a repository the agent created in `repo` out of the reads.
  const location = ["-C", repo, ...(gitDir ? ["--git-dir", gitDir, "--work-tree", repo] : [])];
  const config = sh("git", [...location, "config", "--null", "--get-regexp", "^filter\\..*\\.(clean|process|required)$"], repo, env);
  if (config.code !== 0 && config.code !== 1) throw new Error(`git config failed: ${config.stderr}`);
  const overrides = ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"];
  for (const entry of config.stdout.split("\0").filter(Boolean)) {
    const key = entry.split("\n")[0]!;
    overrides.push("-c", `${key}=${key.endsWith(".required") ? "false" : ""}`);
  }
  return sh("git", [...location, ...overrides, ...args], repo, env);
}

// The files the fake app wrote that still hold exactly what it wrote: the app's
// work, not the agent's. One the agent changed afterwards counts as the agent's.
export function appWritten(repo: string, manifest: string | undefined): string[] {
  if (!manifest || !existsSync(manifest)) return [];
  const written: Record<string, string> = JSON.parse(readArtifact(manifest, MANIFEST_BYTES).toString("utf8"));
  return Object.keys(written).filter(path => {
    try {
      const expected = Buffer.from(written[path]!);
      return readRegularFileNoFollowSync(resolveOnDisk(repo, path), expected.length).equals(expected);
    } catch { return false; }
  });
}

function diffSinceSeed(dir: string, env: NodeJS.ProcessEnv, seedCommit: string, exclude: string[] = [], gitDir?: string | null): string {
  const added = checkedGit(dir, ["add", "-A", "-N", "-f"], env, gitDir);
  if (added.code !== 0) throw new Error(`git add failed: ${added.stderr}`);
  const pathspec = exclude.length ? ["--", ".", ...exclude.map(path => `:(exclude,literal)${path}`)] : [];
  const diff = checkedGit(dir, ["diff", "--no-color", "--no-ext-diff", "--no-textconv", seedCommit, ...pathspec], env, gitDir);
  if (diff.code !== 0) throw new Error(`git diff failed: ${diff.stderr}`);
  return diff.stdout;
}

// The agent's own worktree is labelled so the judge can tell it from the root.
export function judgeMaterial(ws: { repo: string; cwd?: string; env: NodeJS.ProcessEnv; seedCommit: string; gitDir?: string | null; appWrites?: string }, ctx: CheckContext) {
  const diff = diffSinceSeed(ws.repo, ws.env, ws.seedCommit, appWritten(ws.repo, ws.appWrites), ws.gitDir);
  if (!ws.cwd || ws.cwd === ws.repo) return { changed: ctx.changedFiles(), diff };
  const cwdDiff = diffSinceSeed(ws.cwd, ws.env, ws.seedCommit);
  return {
    changed: [...ctx.changedFiles(), ...ctx.cwdChangedFiles().map(path => `(working directory) ${path}`)],
    diff: `${diff}\n# Working directory ${ws.cwd}\n${cwdDiff}`,
  };
}

export function createContext(o: ContextOptions): CheckContext {
  const cwd = o.cwd ?? o.repo;
  // Only `repo` can have a separate Git directory; a worktree `cwd` never does (scenario.ts).
  const git = (args: string[], dir = o.repo) => checkedGit(dir, args, o.env, dir === o.repo ? o.gitDir : null);
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
    try { return readRegularFileNoFollowSync(full, CANVAS_BYTES).toString("utf8"); } catch { return null; }
  };
  return {
    repo: o.repo,
    cwd,
    agent: o.agent,
    transcript: o.transcript,
    calls: { ...(o.calls ?? toolCalls(o.transcript)), ...(o.doanLog ? { doan: readCallLog(o.doanLog) } : {}) },
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
    onboarding() {
      if (!o.onboardingLog || !existsSync(o.onboardingLog)) return [];
      return readArtifact(o.onboardingLog, LOG_BYTES).toString("utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    },
    canvasNames: () => readCanvasNames(o.canvasLog && existsSync(o.canvasLog) ? readArtifact(o.canvasLog, LOG_BYTES).toString("utf8") : null),
    work() {
      if (!o.workLog || !existsSync(o.workLog)) return [];
      return readArtifact(o.workLog, LOG_BYTES).toString("utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    },
    open() {
      if (!o.openLog || !existsSync(o.openLog)) return [];
      return readArtifact(o.openLog, LOG_BYTES).toString("utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    },
    prototype() {
      if (!o.prototypeLog || !existsSync(o.prototypeLog)) return [];
      return readArtifact(o.prototypeLog, LOG_BYTES).toString("utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    },
    handoff() {
      if (!o.handoffLog || !existsSync(o.handoffLog)) return [];
      return readArtifact(o.handoffLog, LOG_BYTES).toString("utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    },
    run: (cmd, args) => sh(cmd, args, o.repo, o.env),
    git: args => git(args),
  };
}
