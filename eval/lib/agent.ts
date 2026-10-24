import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import type { Agent } from "./args.ts";

export function agentCommand(agent: Agent, prompt: string): { cmd: string; args: string[] } {
  // Plain -p prints only the final answer; stream-json keeps every tool call in
  // the transcript, which checks and the judge read (Codex logs commands to stderr).
  // MCP and the Codex sandbox are pinned so a run does not depend on the user's
  // global agent config: rounds measure the shell (CLI) path only (spec non-goal),
  // and a global doan MCP server may point at a CLI other than the one measured.
  // --allowedTools is variadic, so `--` keeps the prompt from being read as a tool.
  return agent === "claude"
    ? { cmd: "claude", args: ["-p", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--allowedTools", "Bash Read Write Edit Glob Grep", "--", prompt] }
    : { cmd: "codex", args: ["exec", "--sandbox", "workspace-write", "-c", "mcp_servers.doan.enabled=false", prompt] };
}

// Process groups still running, so an interrupted runner can take them down;
// detached children do not get the terminal's SIGINT.
const running = new Set<number>();

export function killRunning(): void {
  for (const pid of running) {
    try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ }
  }
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
    let pid: number | undefined;
    const settle = (code: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      // Also after a normal exit: a dev server or watcher the agent started must not outlive its run.
      if (pid !== undefined) {
        try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ }
        running.delete(pid);
      }
      clearTimeout(killTimer);
      clearTimeout(graceTimer);
      closeSync(out);
      closeSync(err);
      resolve({ code, signal, timedOut, durationSec: Math.round((performance.now() - started) / 10) / 100 });
    };
    // detached puts the agent in its own process group, so the kill reaches the tools it started.
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(o.cmd, o.args, { cwd: o.cwd, env: o.env, stdio: ["ignore", out, err], detached: true });
    } catch (error) {
      // Bad arguments (a NUL byte, say) throw here instead of emitting "error".
      settle(null, `spawn: ${(error as Error).message}`);
      return;
    }
    pid = child.pid;
    if (pid !== undefined) running.add(pid);
    child.on("error", error => settle(null, `spawn: ${error.message}`));
    child.on("exit", (code, signal) => settle(code, signal));
    killTimer = setTimeout(() => {
      timedOut = true;
      if (pid !== undefined) {
        try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ }
      }
      graceTimer = setTimeout(() => settle(null, "SIGKILL"), 5000);
    }, o.timeoutSec * 1000);
  });
}
