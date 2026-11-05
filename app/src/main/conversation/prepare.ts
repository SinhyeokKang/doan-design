import { accessSync, constants, readdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { probeShell, runProcess } from "../onboarding/machine";
import { findOnPath } from "../onboarding/states";
import { agentEnv, promptSuggestionEnv } from "./environment";
import { launchEnv } from "../launchEnv";
import { canonicalDirectory, claudeOccupancy, codexOccupancy, codexSessionExists, readRegular, readSessionTail } from "./io";
import { PROVIDER_AUTH } from "../agentAuth/providers";
import { insideRoot, parseCliVersion, pickSession, versionStatus } from "./sessions";
import { judgeConnection } from "../agentAuth/connection";
import type { Lease, Started } from "../agentAuth/manager";
import type { AuthState, ConnectionJudgment, Provider } from "../agentAuth/types";
import type { McpRun, Prepare, Prepared, StartRequest } from "./service";
import { connectorLabels, MCP_PROVIDERS, type McpProvider } from "../mcpConnectors/presets";
import { externalConversation, type ConversationMetadata, type ExternalSession } from "./store";
// The pinned @anthropic-ai/claude-agent-sdk in app/package.json. It ships with the app, so a test pins it rather
// than a check at run time.
export const BUNDLED_CLAUDE_SDK = "0.3.312";
// reusing: the send goes to this conversation's live Codex server, which already holds the thread.
export type ExternalPrepare = (request: StartRequest, stored?: ExternalSession, reusing?: boolean) => Promise<Prepared>;
export type AccountPrepare = (request: StartRequest, stored?: ConversationMetadata & { owner: { kind: "doan" } }, use?: "run" | "listing") => Promise<Prepared>;
// New conversations run on the doan account; a resumed external association and legacy entries keep the external
// profile. Neither path falls back to the other.
export function routePrepare(external: ExternalPrepare, account: AccountPrepare): Prepare {
  return (request, stored, use, reusing) => {
    if (!stored) return request.mode === "resume" ? external(request) : account(request, undefined, use);
    if (externalConversation(stored)) return reusing ? external(request, stored.session, true) : external(request, stored.session);
    if (stored.owner.kind !== "doan") throw new Error("session_unavailable");
    return account(request, { ...stored, owner: stored.owner });
  };
}
export function createPrepare(userData: string, appRuntime: string, inherited: NodeJS.ProcessEnv): ExternalPrepare {
  return async (request: StartRequest, stored?: ExternalSession, reusing = false): Promise<Prepared> => {
    const picked = request.mode === "resume" && !stored ? pickSession(readSessionTail(userData), request.root, request.canvas ?? null, () => null) : null;
    if (picked && !picked.available) throw new Error("no_session");
    const session = stored ?? (picked?.available ? picked.record : undefined);
    const runtime = session?.runtime ?? request.runtime; if (!runtime) throw new Error("no_agent");
    // External profiles exist only for the shared sessions' two runtimes.
    if (runtime !== "claude" && runtime !== "codex") throw new Error("session_unavailable");
    const probe = await probeShell(inherited); if (!probe.ok) throw new Error("cli_missing");
    const command = findOnPath(probe.path, runtime, path => { try { accessSync(path, constants.X_OK); return statSync(path).isFile(); } catch { return false; } });
    if (!command) throw new Error("cli_missing");
    const version = await runProcess(command, ["--version"], { ...launchEnv(inherited), PATH: probe.path }, 5000);
    if (version.exitCode !== 0 || version.timedOut || versionStatus(runtime, version.stdout) !== "supported") throw new Error(request.mode === "resume" ? "session_unavailable" : "runtime_unsupported");
    let root: string, cwd: string, configDir: string;
    try {
      root = canonicalDirectory(request.root); cwd = canonicalDirectory(session?.cwd ?? root);
      configDir = canonicalDirectory((runtime === "claude" ? probe.claudeConfigDir : probe.codexHome) || join(inherited.HOME ?? "", runtime === "claude" ? ".claude" : ".codex"));
      if (root !== request.root || (session && (canonicalDirectory(session.configDir) !== session.configDir || configDir !== session.configDir))) throw new Error("session_unavailable");
    } catch { throw new Error("session_unavailable"); }
    if (!insideRoot(root, cwd)) throw new Error("outside_root");
    if (session && runtime === "claude") {
      const occupancy = await claudeOccupancy(configDir, session.sessionId);
      // The resume target still names a session a terminal process holds, so the panel can show it waiting.
      if (occupancy === "occupied") throw Object.assign(new Error("session_in_use"), { runtime, sessionId: session.sessionId });
      if (occupancy !== "free") throw new Error("session_unavailable");
      if (!claudeSessionExists(configDir, session.sessionId)) throw new Error("session_unavailable");
    }
    // A reused server opens no thread/resume, and Doan's reservation already makes it the session's only owner.
    if (session && runtime === "codex" && !reusing) {
      const occupancy = await codexOccupancy(configDir, session.sessionId);
      if (occupancy === "occupied") throw Object.assign(new Error("session_in_use"), { runtime, sessionId: session.sessionId });
      if (occupancy !== "free") throw new Error("session_unavailable");
      if (!codexSessionExists(configDir, session.sessionId, cwd)) throw new Error("session_unavailable");
    }
    const env = agentEnv({ env: inherited, path: probe.path, configDir, ...(probe.promptSuggestion ? { promptSuggestion: probe.promptSuggestion } : {}) }, runtime, appRuntime, { root, cwd, configDir });
    if (!env) throw new Error("session_unavailable");
    return { runtime, command, configDir, cwd, env: env.env, ...(session ? { sessionId: session.sessionId } : {}), ...(picked?.available ? { lastCheckAt: picked.record.at } : {}) };
  };
}
export function claudeSessionExists(config: string, id: string): boolean {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return false;
  try {
    const base = join(config, "projects"), names = readdirSync(base); if (names.length > 4096) return false;
    for (const name of names) {
      const dir = join(base, name); if (canonicalDirectory(dir) !== dir) return false;
      try { readRegular(join(dir, `${id}.jsonl`), 256 * 1024 * 1024); return true; } catch { /* A missing session in one project is not a fallback session. */ }
    }
  } catch { return false; }
  return false;
}

export interface AccountRuntime {
  state(provider: Provider): AuthState; check(provider: Provider): Promise<Started>; checked(provider: Provider): Promise<void>; acquire(provider: Provider, use?: "run" | "listing"): Promise<Lease>;
  confirm(provider: Provider, connectionId: string): void;
}
// Account refusals that a sign-in or reauth resolves read as not_logged_in; the rest keep the conversation codes.
function accountCode(cause: string): string {
  if (["not_connected", "reauth_required", "unverified", "account_mismatch", "sign_out_failed"].includes(cause)) return "not_logged_in";
  return ["busy", "cli_missing", "cli_install_failed", "session_in_use"].includes(cause) ? cause : "session_unavailable";
}
// A conversation owned by another account, workspace or profile cannot run here whatever the user signs into now.
function judgmentCode(judgment: Exclude<ConnectionJudgment, { decision: "resume" }>): string {
  if (judgment.decision === "reauth") return "not_logged_in";
  if (judgment.decision === "legacy") return "session_unavailable";
  return ["busy", "session_in_use"].includes(judgment.cause) ? judgment.cause : ["sign_out_failed", "unverified"].includes(judgment.cause) ? "not_logged_in" : "session_unavailable";
}
// Codex runs tool commands through a login shell by default, whose profile puts the user's own doan back first on
// PATH (live 2026-10-28); allow_login_shell=false (official config key) keeps the PATH prepared below.
const RUN_ARGS: Record<"claude" | "codex", string[]> = { claude: [], codex: ["-c", "allow_login_shell=false"] };
// A stored ACP session is a directory or <id>.<ext> file in the provider's sessions directory; session/load is the
// final admission. Cursor .cursor/acp-sessions/<id>/, Copilot .copilot/session-state/<id>/ (B3 live check).
export function acpSessionExists(profileDir: string, sessions: string, id: string): boolean {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return false;
  try {
    const dir = join(profileDir, sessions);
    if (canonicalDirectory(dir) !== dir) return false;
    return readdirSync(dir).some(name => name === id || name.startsWith(`${id}.`));
  } catch { return false; }
}
// The run-time incompatibility records readiness shows (AuthIpc). versionRead: the installed version a run read, which
// drops a record of another build (a self-update); a handshake then records or clears the version it ran.
export interface VersionRecords {
  versionRead(provider: Provider, installed: string): void; incompatible(provider: Provider, installed: string): void; compatible(provider: Provider, installed: string): void;
}
// cli is the bundled doan executable; its directory goes first on PATH so the agent runs that doan, not whatever
// another install put on the login shell's PATH. toolsFailed: the provider CLI was not found or its version is below
// the minimum or unreadable, so the readiness facts read at launch may be stale (an install, removal or downgrade since).
// The Antigravity server has no version run: it is the sha-pinned download (agentAuth/antigravity.ts) and its
// initialize reply names its version.
// What a Claude or Codex run needs from the MCP connectors (mcp-connectors design 'conversation (Codex)'): the
// provider's connector generation, which a successful Connect, Disconnect or Remove raises, and the connector names by
// doan- name. Both are read when the run asks, so a reused Codex server sees later changes. A replacement sign-in does
// not raise the generation: a Codex replacement moves to a new staging profile, so its runners are new, and Claude
// starts the SDK afresh for every turn.
export interface McpConnectorFacts { generation(provider: McpProvider): number; labels(): Readonly<Record<string, string>> }
// Before the connectors service is wired in: nothing changes, and the presets are the only connectors.
const NO_CONNECTORS: McpConnectorFacts = { generation: () => 0, labels: () => connectorLabels([]) };
// The connectors service as main has it when a run asks; the defaults while there is none (agent sign-in storage
// unreadable).
export function connectorFacts(current: () => McpConnectorFacts | undefined): McpConnectorFacts {
  return { generation: provider => (current() ?? NO_CONNECTORS).generation(provider), labels: () => (current() ?? NO_CONNECTORS).labels() };
}
export function createAccountPrepare(auth: AccountRuntime, cli: string, toolsFailed: (provider: Provider) => void = () => {}, versions?: VersionRecords, connectors: McpConnectorFacts = NO_CONNECTORS): AccountPrepare {
  return async (request, stored, use = "run") => {
    const provider = stored ? stored.session.runtime : request.runtime;
    if (!provider) throw new Error("no_agent");
    if (!isAbsolute(cli) || basename(cli) !== "doan") throw new Error("cli_missing");
    const adapter = PROVIDER_AUTH[provider];
    // Stored metadata loads unverified; the first run checks it, or waits for a check another caller started.
    // Copilot's check costs a request, so its first completed run verifies it instead (confirm below).
    if (auth.state(provider).attempt?.kind === "check") await auth.checked(provider);
    let state = auth.state(provider);
    if (!adapter.verifyByRun && state.connection && !state.verified && !state.expired && !state.attempt) {
      const started = await auth.check(provider); if (started.ok) await started.done; else await auth.checked(provider);
      state = auth.state(provider);
    }
    const pinned = { generation: state.generation, connectionId: state.connection?.connectionId };
    let lease: Lease;
    try { lease = await auth.acquire(provider, use); } catch (error) {
      const code = accountCode(error instanceof Error ? error.message : "");
      if (code === "cli_missing") toolsFailed(provider);
      throw new Error(code);
    }
    // A sign-in, sign-out or failed check during any await must not let this run continue on another account.
    const recheck = () => {
      const now = auth.state(provider);
      if (now.attempt && now.attempt.kind !== "check") throw new Error("busy");
      if (now.generation !== pinned.generation || now.connection?.connectionId !== pinned.connectionId || (!now.verified && !(adapter.verifyByRun && !now.error)) || now.expired ||
          now.error?.code === "account_mismatch" || now.error?.code === "sign_out_failed") throw new Error("not_logged_in");
      return now.connection!;
    };
    let installed: string | undefined;
    try {
      recheck();
      if (provider !== "antigravity") {
        const version = await runProcess(lease.command, ["--version"], lease.env, 5000);
        recheck();
        installed = version.exitCode === 0 && !version.timedOut ? parseCliVersion(version.stdout)?.installed : undefined;
        if (installed) versions?.versionRead(provider, installed);
        if (version.exitCode !== 0 || version.timedOut || versionStatus(provider, version.stdout) !== "supported") { toolsFailed(provider); throw new Error(stored ? "session_unavailable" : "runtime_unsupported"); }
      }
      let root: string, cwd: string, configDir: string;
      try { root = canonicalDirectory(request.root); cwd = canonicalDirectory(stored?.session.cwd ?? root); configDir = canonicalDirectory(lease.profileDir); }
      catch { throw new Error("session_unavailable"); }
      if (root !== request.root || (stored && stored.session.configDir !== configDir)) throw new Error("session_unavailable");
      if (!insideRoot(root, cwd)) throw new Error("outside_root");
      if (stored) {
        const id = stored.session.sessionId;
        const exists = provider === "claude" ? claudeSessionExists(configDir, id) : provider === "codex" ? codexSessionExists(configDir, id, cwd) : acpSessionExists(configDir, adapter.acp!.sessions, id);
        // Codex admits a writer at thread/resume and ACP servers at session/load. Codex's writer lock is not read here:
        // only doan runs in the dedicated profile, and doan's reservations keep one runner per session.
        const occupancy = provider === "claude" ? await claudeOccupancy(configDir, id) : "free";
        recheck();
        const current = auth.state(provider);
        // An unchecked Copilot connection runs as verified; recheck() already refused any check or write-back failure.
        const judgment = judgeConnection(stored.owner, adapter.verifyByRun && !current.error ? { ...current, verified: true } : current, { exists, occupancy });
        if (judgment.decision !== "resume") throw new Error(judgmentCode(judgment));
      }
      const connection = recheck(), ran = installed;
      const mcp: McpRun | undefined = (MCP_PROVIDERS as readonly Provider[]).includes(provider) ? { generation: () => connectors.generation(provider as McpProvider), labels: () => connectors.labels() } : undefined;
      const runArgs = provider === "claude" || provider === "codex" ? RUN_ARGS[provider] : adapter.acp!.args;
      return {
        runtime: provider, command: lease.command, args: [...adapter.args, ...runArgs], configDir, cwd,
        env: { ...lease.env, PATH: `${dirname(cli)}:${lease.env.PATH}`, ...(provider === "claude" ? promptSuggestionEnv(lease.promptSuggestion) : {}) }, ...(stored ? { sessionId: stored.session.sessionId } : {}),
        owner: { kind: "doan", provider, connectionId: connection.connectionId, accountId: connection.account.id, workspaceId: connection.account.workspace, profile: connection.profile },
        release: lease.release, recheck: () => { recheck(); },
        ...(adapter.acp?.authenticate ? { authenticate: adapter.acp.authenticate } : {}),
        ...(adapter.verifyByRun ? { confirm: () => auth.confirm(provider, connection.connectionId) } : {}),
        ...(versions && ran ? { incompatible: () => versions.incompatible(provider, ran), compatible: () => versions.compatible(provider, ran) } : {}),
        ...(ran ? { installed: ran } : {}),
        ...(mcp ? { mcp } : {}),
      };
    } catch (error) { await lease.release(); throw error; }
  };
}
