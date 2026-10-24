import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { accessSync, constants, linkSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { CliRun } from "../folderState";
import { findOnPath, isTranslocated, linkState, mcpAddArgs, mcpRemoveArgs, mcpState, parseShellProbe, pathIncludes, rcFileFor, stubState, type Agent, type LinkState, type McpState, type PathStat, type ShellProbe, type StubState } from "./states";
import stub from "./SKILL.md?raw";

// PoC 7a: 83 ms; 7c: slowest write 741 ms. Leave room for cold startup.
export const SHELL_TIMEOUT_MS = 5000;
export const AGENT_TIMEOUT_MS = 10000;
const OUTPUT_LIMIT = 1024 * 1024;
export const PATH_LINE = 'export PATH="$HOME/.local/bin:$PATH"';

export function runProcess(command: string, args: string[], env: NodeJS.ProcessEnv, timeout: number, nonce?: string): Promise<CliRun> {
  return new Promise(resolveRun => {
    let stdout = "", stderr = "", settled = false;
    const child = spawn(command, args, { env, cwd: env.HOME, stdio: ["ignore", "pipe", "pipe"] });
    const finish = (result: Partial<CliRun>) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      child.stdout.destroy(); child.stderr.destroy(); child.unref();
      resolveRun({ stdout, stderr, exitCode: null, timedOut: false, ...result });
    };
    const kill = () => { try { child.kill("SIGKILL"); } catch { /* Settlement cannot depend on kill success. */ } };
    const timer = setTimeout(() => { kill(); finish({ timedOut: true }); }, timeout);
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (data: string) => {
      stdout += data;
      if (stdout.length > OUTPUT_LIMIT) { kill(); finish({ spawnError: "Process output exceeded the limit." }); }
      else if (nonce && parseShellProbe(stdout, nonce).ok) { kill(); finish({ exitCode: 0 }); }
    });
    child.stderr.on("data", (data: string) => { stderr += data; if (stderr.length > OUTPUT_LIMIT) { kill(); finish({ spawnError: "Process output exceeded the limit." }); } });
    child.once("error", error => finish({ spawnError: error.message }));
    // A daemon can inherit a pipe. Waiting for close would strand the caller.
    child.once("exit", code => finish({ exitCode: code }));
  });
}

function shellName(env: NodeJS.ProcessEnv, fallback = () => userInfo().shell): string {
  try { return env.SHELL || fallback() || ""; } catch { return ""; }
}
export async function probeShell(env: NodeJS.ProcessEnv, fallback?: () => string): Promise<ShellProbe> {
  const shell = shellName(env, fallback);
  if (!isAbsolute(shell)) return { ok: false, reason: "No executable login shell is available." };
  const nonce = randomUUID().replaceAll("-", "");
  const script = `printf '\\nDOAN_PROBE_${nonce}_BEGIN\\n%s\\n%s\\n%s\\nDOAN_PROBE_${nonce}_END\\n' "$PATH" "$CLAUDE_CONFIG_DIR" "$CODEX_HOME"`;
  const result = await runProcess(shell, [ ["zsh", "bash"].includes(basename(shell)) ? "-lic" : "-lc", script ], env, SHELL_TIMEOUT_MS, nonce);
  if (result.timedOut || result.spawnError || result.exitCode !== 0) return { ok: false, reason: result.spawnError ?? (result.timedOut ? `Your login shell (${shell}) didn’t answer in time.` : "Login shell failed.") };
  return parseShellProbe(result.stdout, nonce);
}
function errorCode(error: unknown): string { return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN"; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function stat(path: string): PathStat {
  try { const s = lstatSync(path); return { kind: s.isSymbolicLink() ? "symlink" : s.isDirectory() ? "directory" : s.isFile() ? "file" : "other" }; }
  catch (error) { const code = errorCode(error); return code === "ENOENT" ? { kind: "missing" } : { kind: "error", code }; }
}
function blockedParent(path: string): string | null {
  const parent = dirname(path);
  if (parent === path) return null;
  const ancestor = blockedParent(parent);
  if (ancestor) return ancestor;
  const s = stat(parent);
  if (s.kind === "symlink") {
    try { return statSync(parent).isDirectory() ? null : parent; } catch { return parent; }
  }
  return s.kind === "directory" || s.kind === "missing" ? null : parent;
}
function safeParents(path: string): boolean { return blockedParent(path) === null; }
function blockedPath(path: string): string { return blockedParent(path) ?? path; }
function blockedMessage(path: string): string {
  const ancestor = blockedParent(path);
  if (ancestor) return stat(ancestor).kind === "symlink"
    ? `${ancestor} is a link. It does not resolve to a directory. Move or delete it, then Check Again.`
    : `${ancestor} is not a directory. Move or delete it, then Check Again.`;
  return `${path} is in use by something else. Move or delete it, then Check Again.`;
}
function observedStat(path: string): PathStat { return { ...stat(path), parentBlocked: !safeParents(path) }; }
function canonical(path: string): string | null { try { return realpathSync.native(path); } catch { return null; } }
// Missing suffixes retain their names under the nearest existing real directory.
function realDirectory(path: string): string | null {
  const s = stat(path);
  if (s.kind === "missing") {
    const parent = dirname(path);
    if (parent === path) return null;
    const real = realDirectory(parent);
    return real === null ? null : join(real, basename(path));
  }
  try { return statSync(path).isDirectory() ? canonical(path) : null; } catch { return null; }
}
function realTarget(path: string): string | null {
  const parent = realDirectory(dirname(path));
  return parent === null ? null : join(parent, basename(path));
}
function stamp(path: string): string {
  const location = realTarget(path);
  try { const s = lstatSync(path); return `${location}:${s.dev}:${s.ino}:${s.mode}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`; } catch (error) { return `${location}:${errorCode(error)}`; }
}
export interface LinkObservation { state: LinkState; value: string | null; stamp: string }
export interface StubObservation { state: StubState; stamp: string }
export interface McpObservation { state: McpState; value: string }
function observeLink(path: string, expected: string): LinkObservation {
  const s = observedStat(path); let value: string | null = null;
  if (!s.parentBlocked && s.kind === "symlink") { try { value = readlinkSync(path); } catch { /* An unreadable link is blocked. */ } }
  return { state: linkState(s, value === null ? null : { value, resolved: canonical(path) }, canonical(expected) ?? expected), value, stamp: stamp(path) };
}
function observeStub(path: string): StubObservation {
  const d = observedStat(dirname(path)), f = observedStat(path); let content: string | null = null;
  if (!d.parentBlocked && d.kind === "directory" && !f.parentBlocked && f.kind === "file") { try { content = readFileSync(path, "utf8"); } catch { /* Failed reads are blocked. */ } }
  return { state: stubState(d, f, content, stub), stamp: `${stamp(path)}:${digest(content ?? "")}` };
}
function executable(path: string): boolean { try { accessSync(path, constants.X_OK); return statSync(path).isFile(); } catch { return false; } }
export interface Expected {
  cli: LinkObservation; stub: StubObservation; claudeLink: LinkObservation;
  agents: Record<Agent, { executable: string | null; config: string; mcp: McpObservation }>;
}
// What the wizard shows next to each item. Main computes every path; the
// renderer only shortens `home` to `~`.
export interface MachineDisplay {
  home: string; cliPath: string; cliTarget: string | null; stubPath: string;
  claudeLinkPath: string; claudeLinkTarget: string; mcpCommand: string;
  configFile: Record<Agent, string>; configFromEnv: Record<Agent, boolean>;
  // The item in the way (the target or a non-directory ancestor) of a blocked state.
  blocked: { cli: string | null; stub: string | null; claudeLink: string | null };
  realPaths?: Partial<Record<"cli" | "stub" | "claudeLink", string>>;
  appVersion: string;
}
export interface MachineState {
  requestId: string; expected: Expected; cli: LinkObservation; stub: StubObservation;
  available: boolean; reason: string | null; pathPresent: boolean; rcFile: string | null;
  probe: ShellProbe; agents: Expected["agents"]; claudeLink: LinkObservation; display: MachineDisplay;
}
export interface StepRequest { step: "cli" | "connect"; agent?: Agent; expected: Expected }
export type StepResult = { kind: "success"; warning?: string } | { kind: "busy" | "stale" | "cancelled" } |
  { kind: "unavailable" | "error"; message: string; original?: string } |
  { kind: "confirm"; id: string; target: "cli" | "stub" | "claudeLink" | "mcp"; message: string };
class AncestorChanged extends Error {}
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function equal(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

export function createMachine(options: { command: string; version: string; env?: NodeJS.ProcessEnv }) {
  const env = { ...(options.env ?? process.env) };
  const home = canonical(env.HOME ?? homedir()) ?? resolve(env.HOME ?? homedir());
  env.HOME = home;
  const cliPath = join(home, ".local/bin/doan"), stubPath = join(home, ".agents/skills/doan/SKILL.md");
  let busy = false;
  let pending: { id: string; request: StepRequest; target: "cli" | "stub" | "claudeLink" | "mcp" } | null = null;
  const available = isAbsolute(options.command) && !isTranslocated(options.command);
  const reason = isTranslocated(options.command) ? "Move doan to Applications, then open it again." : !isAbsolute(options.command) ? "This build has no bundled CLI. Set DOAN_CLI." : null;
  async function context() {
    const probe = await probeShell(env);
    const runEnv = { ...env };
    delete runEnv.CLAUDE_CONFIG_DIR; delete runEnv.CODEX_HOME;
    if (probe.ok) { runEnv.PATH = probe.path; if (probe.claudeConfigDir) runEnv.CLAUDE_CONFIG_DIR = probe.claudeConfigDir; if (probe.codexHome) runEnv.CODEX_HOME = probe.codexHome; }
    const claudeDir = runEnv.CLAUDE_CONFIG_DIR || join(home, ".claude"), codexDir = runEnv.CODEX_HOME || join(home, ".codex");
    const configValid = { claude: isAbsolute(claudeDir), codex: isAbsolute(codexDir) };
    return { probe, runEnv, claudeDir, codexDir, configValid, claudeLink: join(claudeDir, "skills/doan") };
  }
  type Context = Awaited<ReturnType<typeof context>>;
  const configInvalid = (agent: Agent, ctx: Context) => `${agent === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME"} must be an absolute path: ${agent === "claude" ? ctx.claudeDir : ctx.codexDir}`;
  const claudeConfigFile = (ctx: Context) => ctx.runEnv.CLAUDE_CONFIG_DIR ? join(ctx.claudeDir, ".claude.json") : join(home, ".claude.json");
  async function readMcp(agent: Agent, ctx: Context, exe: string | null): Promise<McpObservation> {
    if (!ctx.configValid[agent]) return { state: "unknown", value: configInvalid(agent, ctx) };
    if (!ctx.probe.ok || !exe) return { state: "unknown", value: "" };
    let result: CliRun;
    if (agent === "claude") {
      const file = claudeConfigFile(ctx);
      try { result = { stdout: readFileSync(file, "utf8"), stderr: "", exitCode: 0, timedOut: false }; }
      catch (error) { result = errorCode(error) === "ENOENT" ? { stdout: "{}", stderr: "", exitCode: 0, timedOut: false } : { stdout: "", stderr: message(error), exitCode: 1, timedOut: false }; }
    } else {
      result = await runProcess(exe, ["mcp", "get", "doan", "--json"], ctx.runEnv, AGENT_TIMEOUT_MS);
      // The renderer adds the Check Again hint; these only name what failed.
      if (result.spawnError) return { state: "unknown", value: `Couldn't run Codex at ${exe}. ${result.spawnError}` };
      if (result.timedOut) return { state: "unknown", value: `Codex at ${exe} didn’t answer in ${AGENT_TIMEOUT_MS / 1000} s.` };
    }
    const state = mcpState(agent, { ...result, scope: "user" }, cliPath);
    // Only the doan registration is shown on failure; never expose other servers.
    let value = "";
    try { const parsed: unknown = JSON.parse(result.stdout); if (agent === "claude") { if (object(parsed) && object(parsed.mcpServers)) value = JSON.stringify(parsed.mcpServers.doan) ?? ""; } else value = JSON.stringify(parsed); } catch { value = state === "unknown" ? result.stderr || "Unreadable registration." : ""; }
    return { state, value };
  }
  async function snapshot(ctx: Context): Promise<Expected> {
    const readAgent = async (agent: Agent) => {
      const exe = ctx.probe.ok ? findOnPath(ctx.probe.path, agent, executable) : null;
      return { executable: exe, config: agent === "claude" ? ctx.claudeDir : ctx.codexDir, mcp: await readMcp(agent, ctx, exe) };
    };
    const agents = { claude: await readAgent("claude"), codex: await readAgent("codex") };
    return { cli: observeLink(cliPath, options.command), stub: observeStub(stubPath), claudeLink: observeLink(ctx.claudeLink, dirname(stubPath)), agents };
  }
  const claudeLinkValue = (ctx: Context) => relative(realDirectory(dirname(ctx.claudeLink)) ?? dirname(ctx.claudeLink), realDirectory(dirname(stubPath)) ?? dirname(stubPath));
  async function read(requestId: string): Promise<MachineState> {
    const ctx = await context(), expected = await snapshot(ctx);
    const realPaths: NonNullable<MachineDisplay["realPaths"]> = {};
    for (const [key, path] of [["cli", cliPath], ["stub", stubPath], ["claudeLink", ctx.claudeLink]] as const) {
      const real = realTarget(path);
      if (real !== null && real !== path) realPaths[key] = real;
    }
    const display: MachineDisplay = {
      home, cliPath, cliTarget: available ? options.command : null, stubPath,
      claudeLinkPath: ctx.claudeLink, claudeLinkTarget: claudeLinkValue(ctx), mcpCommand: `${cliPath} mcp`,
      configFile: { claude: claudeConfigFile(ctx), codex: join(ctx.codexDir, "config.toml") },
      configFromEnv: { claude: !!ctx.runEnv.CLAUDE_CONFIG_DIR, codex: !!ctx.runEnv.CODEX_HOME },
      blocked: {
        cli: expected.cli.state === "blocked" ? blockedPath(cliPath) : null,
        stub: expected.stub.state === "blocked" ? blockedPath(stubPath) : null,
        claudeLink: expected.claudeLink.state === "blocked" ? blockedPath(ctx.claudeLink) : null,
      },
      ...(Object.keys(realPaths).length ? { realPaths } : {}),
      appVersion: options.version,
    };
    return { requestId, expected, ...expected, available, reason, pathPresent: ctx.probe.ok && pathIncludes(ctx.probe.path, dirname(cliPath)), rcFile: rcFileFor(shellName(env)), probe: ctx.probe, display };
  }
  function writeTarget(path: string, content: string, link: boolean, missing: boolean, check: () => boolean): void {
    if (!check() || !safeParents(path)) throw new Error("Target changed. Check Again.");
    const destination = realTarget(path);
    if (destination === null) throw new AncestorChanged();
    mkdirSync(dirname(destination), { recursive: true });
    if (!safeParents(path) || realTarget(path) !== destination) throw new AncestorChanged();
    const temporary = join(dirname(destination), `.doan-${randomUUID()}.tmp`);
    try {
      if (link) symlinkSync(content, temporary); else writeFileSync(temporary, content, { flag: "wx", mode: 0o644 });
      // Recheck after staging; missing targets must still be created exclusively.
      if (!safeParents(path) || realTarget(path) !== destination) throw new AncestorChanged();
      if (!check()) throw new Error("Target changed. Check Again.");
      if (missing) {
        if (link) symlinkSync(content, destination); else linkSync(temporary, destination);
      } else renameSync(temporary, destination);
    } catch (error) {
      if (errorCode(error) === "EEXIST") throw new Error("Target changed. Check Again.");
      throw error;
    } finally { rmSync(temporary, { force: true }); }
  }
  async function execute(request: Omit<StepRequest, "expected"> & { expected: unknown }, approved?: string): Promise<StepResult> {
    const ctx = await context(); let current = await snapshot(ctx);
    if (!equal(current, request.expected)) return { kind: "stale" };
    if (!available) return { kind: "unavailable", message: reason ?? "CLI unavailable." };
    const confirm = (target: "cli" | "stub" | "claudeLink" | "mcp", detail: string): StepResult => {
      const id = randomUUID(); pending = { id, request: { ...request, expected: current }, target };
      return { kind: "confirm", id, target, message: detail };
    };
    const writeLink = (path: string, value: string, expected: string, before: LinkObservation) => {
      const signature = stamp(path);
      writeTarget(path, value, true, before.state === "missing", () => {
        const now = observeLink(path, expected);
        return now.stamp === before.stamp && now.state === before.state && now.value === before.value && stamp(path) === signature;
      });
    };
    if (request.step === "cli") {
      if (current.cli.state === "blocked") return { kind: "unavailable", message: blockedMessage(cliPath) };
      if (current.cli.state === "ours") return { kind: "success" };
      if (current.cli.state === "link-other" && approved !== "cli") return confirm("cli", `Replace the link pointing to ${current.cli.value}?`);
      writeLink(cliPath, options.command, options.command, current.cli); return { kind: "success" };
    }
    const agent = request.agent;
    if (!agent) return { kind: "unavailable", message: "Choose an agent first." };
    const cliWasOurs = current.cli.state === "ours";
    if (!ctx.probe.ok) return { kind: "unavailable", message: ctx.probe.reason };
    if (!ctx.configValid[agent]) return { kind: "unavailable", message: configInvalid(agent, ctx) };
    if (!current.agents[agent].executable) return { kind: "unavailable", message: `Couldn't find ${agent}. Install it, then Check Again.` };
    if (current.stub.state === "blocked") return { kind: "unavailable", message: blockedMessage(stubPath) };
    if (current.stub.state !== "ours") {
      if (current.stub.state === "differs" && approved !== "stub") return confirm("stub", "Your edits to SKILL.md will be replaced.");
      const before = current.stub, signature = stamp(stubPath);
      writeTarget(stubPath, stub, false, before.state === "missing", () => {
        const now = observeStub(stubPath);
        return stamp(stubPath) === signature && now.stamp === before.stamp && now.state === before.state;
      });
      current = await snapshot(ctx);
    }
    if (agent === "claude" && current.claudeLink.state !== "ours") {
      if (current.claudeLink.state === "blocked") return { kind: "unavailable", message: blockedMessage(ctx.claudeLink) };
      if (current.claudeLink.state === "link-other" && approved !== "claudeLink") return confirm("claudeLink", `Replace the link pointing to ${current.claudeLink.value}?`);
      writeLink(ctx.claudeLink, claudeLinkValue(ctx), dirname(stubPath), current.claudeLink);
      current = await snapshot(ctx);
    }
    if (current.stub.state !== "ours" || (agent === "claude" && current.claudeLink.state !== "ours")) return { kind: "stale" };
    // The stub and Claude link do not need step 1; MCP registers the step 1 link,
    // so it waits for it. A link that was ours and changed during the writes is stale.
    if (current.cli.state !== "ours") return cliWasOurs ? { kind: "stale" } : { kind: "unavailable", message: "Install the CLI link in step 1 before connecting MCP." };
    const registration = current.agents[agent].mcp, exe = current.agents[agent].executable;
    if (registration.state === "ours") return { kind: "success" };
    if (registration.state === "unknown" || !exe) return { kind: "unavailable", message: "Couldn't check the MCP registration. Check Again." };
    if (registration.state === "other" && approved !== "mcp") return confirm("mcp", `Replace the existing doan MCP registration? ${registration.value}`);
    const latest = await snapshot(ctx);
    if (!equal(current, latest) || latest.cli.state !== "ours") return { kind: "stale" };
    const invoke = async (args: string[]) => {
      if (observeLink(cliPath, options.command).state !== "ours") throw new Error("CLI link changed. Check Again.");
      const result = await runProcess(exe, args, ctx.runEnv, AGENT_TIMEOUT_MS);
      if (result.timedOut || result.spawnError || result.exitCode !== 0) throw new Error(result.spawnError ? `Couldn't run ${agent} at ${exe}. Check Again. ${result.spawnError}` : result.timedOut ? `${agent} timed out. Check Again.` : result.stderr || `${agent} failed.`);
    };
    try {
      if (registration.state === "other" && agent === "claude") {
        await invoke(mcpRemoveArgs(agent));
        if ((await readMcp(agent, ctx, exe)).state !== "missing") return { kind: "error", message: "Registration changed after removal. Check Again.", original: registration.value };
      }
      await invoke(mcpAddArgs(agent, cliPath)); return { kind: "success" };
    } catch (error) { return { kind: "error", message: message(error), ...(registration.state === "other" ? { original: registration.value } : {}) }; }
  }
  async function locked(request: Omit<StepRequest, "expected"> & { expected: unknown }, approved?: string): Promise<StepResult> {
    if (busy) return { kind: "busy" }; busy = true;
    try { return await execute(request, approved); } catch (error) { return error instanceof AncestorChanged ? { kind: "stale" } : { kind: "error", message: message(error) }; } finally { busy = false; }
  }
  return {
    read,
    run(value: unknown): Promise<StepResult> {
      if (!object(value) || !["cli", "connect"].includes(String(value.step)) || !object(value.expected) ||
        Object.keys(value).some(key => !["step", "agent", "expected"].includes(key)) ||
        (value.step === "cli" ? value.agent !== undefined : value.agent !== "claude" && value.agent !== "codex")) return Promise.resolve({ kind: "unavailable", message: "Invalid setup request." });
      if (pending) return Promise.resolve({ kind: "busy" });
      // expected is compared with a freshly built snapshot before any field is used.
      if (value.step === "cli") return locked({ step: "cli", expected: value.expected });
      return locked({ step: "connect", agent: value.agent as Agent, expected: value.expected });
    },
    answer(value: unknown): Promise<StepResult> {
      if (!object(value) || Object.keys(value).length !== 2 || typeof value.id !== "string" || typeof value.allow !== "boolean" || !pending || value.id !== pending.id) return Promise.resolve({ kind: "stale" });
      const saved = pending; pending = null;
      return value.allow ? locked(saved.request, saved.target) : Promise.resolve({ kind: "cancelled" });
    },
    cancelConfirmation() { pending = null; },
    isBusy: () => busy,
  };
}

export async function needsOnboarding(userData: string): Promise<boolean> {
  try { const value: unknown = JSON.parse(readFileSync(join(userData, "onboarding.json"), "utf8")); return !object(value); } catch { return true; }
}
export async function markClosed(userData: string): Promise<void> {
  const temporary = join(userData, `.onboarding-${randomUUID()}.tmp`);
  try { writeFileSync(temporary, "{}\n", { flag: "wx" }); renameSync(temporary, join(userData, "onboarding.json")); } finally { rmSync(temporary, { force: true }); }
}
