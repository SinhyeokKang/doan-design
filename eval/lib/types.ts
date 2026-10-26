import type { ToolCalls } from "./transcript.ts";

// The contract scenario checks are written against (design.md 'Check contract').
// Checks read and run only through the context, so the same checks score a
// real agent run and a self-test fixture.

export type Check = { id: string; pass: boolean; detail: string };

export interface CheckContext {
  // Absolute path of the final repo (the pasted instruction's root).
  repo: string;
  // Absolute path the agent ran in: `repo`, or the second worktree when the
  // scenario sets `worktree`.
  cwd: string;
  agent: "claude" | "codex" | "fixture";
  // stdout + stderr of the agent run.
  transcript: string;
  // Extracted invocation evidence, including the Codex rollout when available.
  calls: ToolCalls;
  // The packaged CLI (a temporary build in self-test); `--json --repo <repo>` is appended.
  // `json` is the parsed stdout, or null when stdout is not JSON.
  doan(args: string[]): { code: number; json: any };
  // Paths are relative to the repo; a path that leaves the repo throws.
  read(path: string): string | null;
  exists(path: string): boolean;
  // Content at the seed commit, or null when the path did not exist there.
  seed(path: string): string | null;
  // Paths changed, added or deleted since the seed commit, sorted.
  changedFiles(): string[];
  // changedFiles() for `cwd`.
  cwdChangedFiles(): string[];
  // Parsed lines of `.doan/comments/<canvasId>.jsonl` added since the seed commit.
  // A line that is not JSON comes back as `{ invalid: "<line>" }`.
  commentEvents(canvasId: string): any[];
  // Runs in the repo with the agent's environment and stdin from /dev/null.
  run(cmd: string, args: string[]): { code: number; stdout: string; stderr: string };
}

// The default export of `eval/scenarios/<id>/checks.ts`.
export type Checks = (ctx: CheckContext) => Check[];
