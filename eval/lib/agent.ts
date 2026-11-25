import { execFileSync, spawn } from "node:child_process";
import { closeSync, openSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, realpathSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { LOG_BYTES, readArtifact } from "./artifact.ts";
import type { Agent } from "./args.ts";
import type { Check } from "./types.ts";
import { toolCalls, type ToolCalls } from "./transcript.ts";

// A child agent establishes its own session; the runner's identity would make
// cross-provider work signals ambiguous and leak into fixture evidence.
export function agentEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const child = { ...env };
  // A runner started inside a Doan conversation must not pass its identity: the CLI would refuse onboarding and remove
  // and hold back work signals there. A Claude or Codex conversation's home is Doan's profile for it, not the user's.
  const homes = env.DOAN_APP_CONVERSATION === "1" ? ["CLAUDE_CONFIG_DIR", "CODEX_HOME"] : [];
  for (const key of ["CLAUDE_CODE_SESSION_ID", "CODEX_THREAD_ID", "CODEX_SESSION_ID", "DOAN_HANDOFF", "DOAN_APP_CONVERSATION", "DOAN_CONVERSATION_ID", ...homes]) delete child[key];
  return child;
}

// Runs get none of the user's instruction files yet sign in as the user: Codex through its own CODEX_HOME (auth and
// lock links, config.toml copy), Claude through CLAUDE_CODE_DISABLE_CLAUDE_MDS (ARCHITECTURE §14 'Isolation').
export function isolateUserInstructions(agent: Agent, env: NodeJS.ProcessEnv, dir: string, trusted: readonly string[] = []): NodeJS.ProcessEnv {
  if (agent === "claude") return { ...env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" };
  const user = env.CODEX_HOME || join(env.HOME || homedir(), ".codex");
  mkdirSync(dir, { recursive: true });
  const signedIn = existsSync(join(user, "auth.json"));
  for (const name of ["auth.json", "auth.lock", "auth.json.lock"])
    if (existsSync(join(user, name)) || (signedIn && name.endsWith(".lock"))) symlinkSync(join(user, name), join(dir, name));
  const config = existsSync(join(user, "config.toml")) ? readFileSync(join(user, "config.toml"), "utf8") : null;
  // A JSON string of a path is a valid TOML basic string.
  const trust = trusted.map(path => `[projects.${JSON.stringify(path)}]\ntrust_level = "trusted"\n`).join("\n");
  if (config !== null || trust) writeFileSync(join(dir, "config.toml"), [config && (config.endsWith("\n") ? config : `${config}\n`), trust].filter(Boolean).join("\n"));
  return { ...env, CODEX_HOME: dir };
}

// `codexServers` are the MCP servers the machine's Codex config registers (registeredCodexMcpServers).
// `git` is the scenario's: false when the agent's folder is in no Git repository.
export function agentCommand(agent: Agent, prompt: string, codexServers: readonly string[] = [], git = true): { cmd: string; args: string[] } {
  // Pinned flags keep machine config and profiles out of a run: MCP servers, approvals and the login shell, which would
  // put an installed doan ahead of the run's (ARCHITECTURE §14 'Agent commands').
  if (agent === "claude") {
    // --allowedTools is variadic, so `--` separates the prompt from tool names.
    return { cmd: "claude", args: ["-p", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--allowedTools", "Bash Read Write Edit Glob Grep", "--", prompt] };
  }
  const doan = codexServers.includes("doan") ? ["-c", "mcp_servers.doan.enabled=false"] : [];
  return { cmd: "codex", args: ["exec", "--sandbox", "workspace-write", ...(git ? [] : ["--skip-git-repo-check"]), "-c", "features.shell_snapshot=false", "-c", 'approval_policy="never"', "-c", "allow_login_shell=false", ...doan, prompt] };
}

// Asks Codex itself, so project-level config and profiles count as well as $CODEX_HOME/config.toml.
// Throws when the list cannot be read: guessing could let a doan server load into the run.
export function registeredCodexMcpServers(env: NodeJS.ProcessEnv, cwd: string): string[] {
  try {
    const list: unknown = JSON.parse(execFileSync("codex", ["mcp", "list", "--json"], { cwd, env, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] }));
    if (!Array.isArray(list)) throw new Error("not an array");
    return list.map(entry => String((entry as { name?: unknown }).name));
  } catch (error) {
    throw new Error(`Cannot read the Codex MCP server list: ${(error as Error).message}`);
  }
}

// Read evidence produced by the agent's shell, not the runner's own PATH lookup.
export function cliProvenance(report: string, expected: string | null, evidencePath?: string): Check {
  const invalid = (error: unknown) => ({ id: "agent_cli_provenance", pass: false, detail: `Missing or invalid agent CLI resolution: ${(error as Error).message}` });
  let bytes: Buffer;
  try { bytes = readArtifact(report, 4 << 10); } catch (error) { return invalid(error); }
  if (evidencePath) writeFileSync(evidencePath, bytes, { mode: 0o600 });
  try {
    const resolved = bytes.toString("utf8").trim();
    if (expected === null) return { id: "agent_cli_provenance", pass: resolved === "", detail: `agent resolved ${resolved || "(no doan on PATH)"}; expected no shell CLI` };
    const pass = realpathSync(resolved) === realpathSync(expected);
    return { id: "agent_cli_provenance", pass, detail: `agent resolved ${resolved}; expected ${expected}` };
  } catch (error) {
    return invalid(error);
  }
}

export function readAgentTranscript(agent: Agent, dir: string, env: NodeJS.ProcessEnv): { transcript: string; calls: ToolCalls } {
  const stderr = readArtifact(join(dir, "stderr.log"), LOG_BYTES).toString("utf8");
  const transcript = readArtifact(join(dir, "stdout.log"), LOG_BYTES).toString("utf8") + "\n" + stderr;
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
    const source = join(matches[0]!.parentPath, matches[0]!.name);
    const dest = join(dir, "codex-rollout.jsonl");
    const rollout = readArtifact(source, LOG_BYTES);
    writeFileSync(dest, rollout, { mode: 0o600 });
    return { transcript, calls: toolCalls(transcript + "\n" + rollout.toString("utf8")) };
  } catch (error) {
    // Keep older Codex versions usable, but leave an explicit evidence gap.
    writeFileSync(join(dir, "codex-rollout-error.txt"), `${(error as Error).message}\n`);
    return { transcript, calls: toolCalls(transcript) };
  }
}

// Process groups still running, so an interrupted runner can take them down;
// detached children do not get the terminal's SIGINT.
const running = new Set<number>();
let stopping = false;

// Also refuses later spawns, so an interrupted run cannot start its judge while the runner unwinds.
export function killRunning(): void {
  stopping = true;
  for (const pid of running) {
    try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ }
  }
}

export interface ProcessResult { code: number | null; signal: string | null; timedOut: boolean; durationSec: number }

// stdin is /dev/null so an agent waiting on it cannot hang (POSTMORTEM 2026-10-21); output goes to files, not
// pipes, so nothing fills up and stalls the child.
export function runProcess(o: { cmd: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; timeoutSec: number; stdoutPath: string; stderrPath: string }): Promise<ProcessResult> {
  if (stopping) return Promise.reject(new Error("the runner is stopping"));
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
      // The group is killed after a normal exit too: a dev server or watcher the agent started must not outlive its run.
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
