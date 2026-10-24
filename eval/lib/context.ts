import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize, relative } from "node:path";
import type { CheckContext } from "./types.ts";

export function resolveInside(repo: string, path: string): string {
  if (path === "" || isAbsolute(path)) throw new Error(`not a repo-relative path: ${JSON.stringify(path)}`);
  const full = join(repo, path);
  const rel = relative(repo, full);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`path leaves the repo: ${path}`);
  return normalize(full);
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
  agent: CheckContext["agent"];
  transcript: string;
  cli: string;
  env: NodeJS.ProcessEnv;
  seedCommit: string;
}

export function sh(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const result = spawnSync(cmd, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000, killSignal: "SIGKILL", maxBuffer: 64 << 20 });
  return { code: result.status ?? -1, stdout: result.stdout ?? "", stderr: (result.stderr ?? "") + (result.error ? `\n${result.error.message}` : "") };
}

export function createContext(o: ContextOptions): CheckContext {
  const git = (args: string[]) => sh("git", ["-C", o.repo, ...args], o.repo, o.env);
  const seed = (path: string): string | null => {
    const result = git(["show", `${o.seedCommit}:${repoPath(o.repo, path)}`]);
    return result.code === 0 ? result.stdout : null;
  };
  const read = (path: string): string | null => {
    const full = resolveInside(o.repo, path);
    try { return readFileSync(full, "utf8"); } catch { return null; }
  };
  return {
    repo: o.repo,
    agent: o.agent,
    transcript: o.transcript,
    doan(args) {
      const result = sh(o.cli, [...args, "--json", "--repo", o.repo], o.repo, o.env);
      let json: any = null;
      try { json = JSON.parse(result.stdout); } catch { /* left null for the check to report */ }
      return { code: result.code, json };
    },
    read,
    exists: path => existsSync(resolveInside(o.repo, path)),
    seed,
    changedFiles() {
      // Against the seed commit, not HEAD, so an agent that commits its work is still seen.
      const tracked = git(["diff", "--name-only", "-z", "--no-renames", o.seedCommit]);
      const untracked = git(["ls-files", "-z", "--others"]);
      // git's last stderr line names the cause; the rest is a usage dump.
      if (tracked.code !== 0 || untracked.code !== 0) throw new Error(`git failed: ${(tracked.stderr || untracked.stderr).trim().split("\n").pop()}`);
      return [...new Set([...tracked.stdout.split("\0"), ...untracked.stdout.split("\0")].filter(Boolean))].sort();
    },
    commentEvents(canvasId) {
      if (!CANVAS_ID.test(canvasId)) throw new Error(`not a canvas id: ${canvasId}`);
      const path = `.doan/comments/${canvasId}.jsonl`;
      return parseEvents(addedLines(seed(path), read(path)));
    },
    run: (cmd, args) => sh(cmd, args, o.repo, o.env),
  };
}
