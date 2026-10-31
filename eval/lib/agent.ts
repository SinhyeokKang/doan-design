import { spawn } from "node:child_process";
import { closeSync, openSync, existsSync, readdirSync, readFileSync, writeFileSync, copyFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Agent } from "./args.ts";
import type { Check } from "./types.ts";
import { toolCalls, type ToolCalls } from "./transcript.ts";

export function agentCommand(agent: Agent, prompt: string): { cmd: string; args: string[] } {
  // A run must not pick up MCP servers from the machine's config. Claude has --strict-mcp-config;
  // Codex has no equivalent and merges `-c mcp_servers={}` into them, so a doan server left
  // registered there is switched off by name.
  // --allowedTools is variadic, so `--` separates the prompt from tool names.
  // Codex's approval policy is pinned so a run does not depend on the machine's own config.
  if (agent === "claude") {
    return { cmd: "claude", args: ["-p", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--allowedTools", "Bash Read Write Edit Glob Grep", "--", prompt] };
  }
  return { cmd: "codex", args: ["exec", "--sandbox", "workspace-write", "-c", "features.shell_snapshot=false", "-c", 'approval_policy="never"', "-c", "mcp_servers.doan.enabled=false", prompt] };
}

// Read evidence produced by the agent's shell, not the runner's own PATH lookup.
export function cliProvenance(report: string, expected: string | null): Check {
  try {
    const resolved = readFileSync(report, "utf8").trim();
    if (expected === null) return { id: "agent_cli_provenance", pass: resolved === "", detail: `agent resolved ${resolved || "(no doan on PATH)"}; expected no shell CLI` };
    const pass = realpathSync(resolved) === realpathSync(expected);
    return { id: "agent_cli_provenance", pass, detail: `agent resolved ${resolved}; expected ${expected}` };
  } catch (error) {
    return { id: "agent_cli_provenance", pass: false, detail: `Missing or invalid agent CLI resolution: ${(error as Error).message}` };
  }
}

export function readAgentTranscript(agent: Agent, dir: string, env: NodeJS.ProcessEnv): { transcript: string; calls: ToolCalls } {
  const stderr = readFileSync(join(dir, "stderr.log"), "utf8");
  const transcript = readFileSync(join(dir, "stdout.log"), "utf8") + "\n" + stderr;
  if (agent !== "codex") return { transcript, calls: toolCalls(transcript) };
  // stderr omits some commands in batched exec calls. Match the run's session
  // rather than picking the newest rollout, which may belong to another agent.
  try {
    const id = stderr.match(/^session id:\s*([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\s*$/im)?.[1];
    if (!id) throw new Error("No Codex session id in stderr");
    const sessions = join(env.CODEX_HOME || join(env.HOME || homedir(), ".codex"), "sessions");
    if (!existsSync(sessions)) throw new Error(`Codex sessions directory not found: ${sessions}`);
    const matches = readdirSync(sessions, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(`-${id}.jsonl`));
    if (matches.length !== 1) throw new Error(`Expected one Codex rollout for ${id}, found ${matches.length}`);
    const source = join(matches[0].parentPath, matches[0].name);
    const dest = join(dir, "codex-rollout.jsonl");
    copyFileSync(source, dest);
    return { transcript, calls: toolCalls(transcript + "\n" + readFileSync(dest, "utf8")) };
  } catch (error) {
    // Keep older Codex versions usable, but leave an explicit evidence gap.
    writeFileSync(join(dir, "codex-rollout-error.txt"), `${(error as Error).message}\n`);
    return { transcript, calls: toolCalls(transcript) };
  }
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
