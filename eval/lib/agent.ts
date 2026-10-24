import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import type { Agent } from "./args.ts";

export function agentCommand(agent: Agent, prompt: string): { cmd: string; args: string[] } {
  // Plain -p prints only the final answer; stream-json keeps every tool call in
  // the transcript, which checks and the judge read (Codex logs commands to stderr).
  // --allowedTools is variadic, so `--` keeps the prompt from being read as a tool.
  return agent === "claude"
    ? { cmd: "claude", args: ["-p", "--output-format", "stream-json", "--verbose", "--allowedTools", "Bash Read Write Edit Glob Grep", "--", prompt] }
    : { cmd: "codex", args: ["exec", prompt] };
}

export interface ProcessResult { code: number | null; signal: string | null; timedOut: boolean; durationSec: number }

// stdin is /dev/null: a character device is not necessarily a terminal, and an
// agent that waits on stdin would hang (POSTMORTEM 2026-10-21). Output goes to
// files, not pipes, so nothing here can fill up and stall the child.
export function runProcess(o: { cmd: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; timeoutSec: number; stdoutPath: string; stderrPath: string }): Promise<ProcessResult> {
  const out = openSync(o.stdoutPath, "w");
  const err = openSync(o.stderrPath, "w");
  const started = performance.now();
  return new Promise(resolve => {
    let timedOut = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;
    let graceTimer: NodeJS.Timeout | undefined;
    // Settles exactly once, from exit, spawn error or the grace timer, so the
    // caller is never left pending after a kill (POSTMORTEM 2026-10-23).
    const settle = (code: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      clearTimeout(graceTimer);
      closeSync(out);
      closeSync(err);
      resolve({ code, signal, timedOut, durationSec: Math.round((performance.now() - started) / 10) / 100 });
    };
    // detached puts the agent in its own process group, so the kill reaches the tools it started.
    const child = spawn(o.cmd, o.args, { cwd: o.cwd, env: o.env, stdio: ["ignore", out, err], detached: true });
    child.on("error", error => settle(null, `spawn: ${error.message}`));
    child.on("exit", (code, signal) => settle(code, signal));
    killTimer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid!, "SIGKILL"); } catch { /* already gone */ }
      graceTimer = setTimeout(() => settle(null, "SIGKILL"), 5000);
    }, o.timeoutSec * 1000);
  });
}
