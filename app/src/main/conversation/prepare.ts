import { accessSync, constants, readdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { probeShell, runProcess } from "../onboarding/machine";
import { findOnPath } from "../onboarding/states";
import { agentEnv } from "./environment";
import { canonicalDirectory, claudeOccupancy, codexSessionExists, readRegular, readSessionTail } from "./io";
import { PROVIDER_AUTH } from "../agentAuth/providers";
import { insideRoot, pickSession, supportedRuntime } from "./sessions";
import { judgeConnection } from "../agentAuth/connection";
import type { Lease, Started } from "../agentAuth/manager";
import type { AuthState, ConnectionJudgment, Provider } from "../agentAuth/types";
import type { Prepare, Prepared, StartRequest } from "./service";
import { externalConversation, type ConversationMetadata, type ExternalSession } from "./store";
// The pinned @anthropic-ai/claude-agent-sdk in app/package.json.
export const BUNDLED_CLAUDE_SDK = "0.3.312";
export type ExternalPrepare = (request: StartRequest, stored?: ExternalSession) => Promise<Prepared>;
export type AccountPrepare = (request: StartRequest, stored?: ConversationMetadata & { owner: { kind: "doan" } }) => Promise<Prepared>;
// New conversations run on the doan account; a resumed external association and legacy entries keep the external
// profile. Neither path falls back to the other.
export function routePrepare(external: ExternalPrepare, account: AccountPrepare): Prepare {
  return (request, stored) => {
    if (!stored) return request.mode === "resume" ? external(request) : account(request);
    if (externalConversation(stored)) return external(request, stored.session);
    if (stored.owner.kind !== "doan") throw new Error("session_unavailable");
    return account(request, { ...stored, owner: stored.owner });
  };
}
export function createPrepare(userData: string, appRuntime: string, inherited: NodeJS.ProcessEnv): ExternalPrepare {
  return async (request: StartRequest, stored?: ExternalSession): Promise<Prepared> => {
    const picked = request.mode === "resume" && !stored ? pickSession(readSessionTail(userData), request.root, request.canvas ?? null, () => null) : null;
    if (picked && !picked.available) throw new Error("no_session");
    const session = stored ?? (picked?.available ? picked.record : undefined);
    const runtime = session?.runtime ?? request.runtime; if (!runtime) throw new Error("no_agent");
    // External profiles exist only for the shared sessions' two runtimes.
    if (runtime !== "claude" && runtime !== "codex") throw new Error("session_unavailable");
    const probe = await probeShell(inherited); if (!probe.ok) throw new Error("cli_missing");
    const command = findOnPath(probe.path, runtime, path => { try { accessSync(path, constants.X_OK); return statSync(path).isFile(); } catch { return false; } });
    if (!command) throw new Error("cli_missing");
    const version = await runProcess(command, ["--version"], { ...inherited, PATH: probe.path }, 5000);
    const match = version.exitCode === 0 && !version.timedOut ? version.stdout.match(/\b\d+\.\d+\.\d+\b/)?.[0] ?? null : null;
    if (!supportedRuntime(runtime, match, BUNDLED_CLAUDE_SDK)) throw new Error(request.mode === "resume" ? "session_unavailable" : "runtime_unsupported");
    let root: string, cwd: string, configDir: string;
    try {
      root = canonicalDirectory(request.root); cwd = canonicalDirectory(session?.cwd ?? root);
      configDir = canonicalDirectory((runtime === "claude" ? probe.claudeConfigDir : probe.codexHome) || join(inherited.HOME ?? "", runtime === "claude" ? ".claude" : ".codex"));
      if (root !== request.root || (session && (canonicalDirectory(session.configDir) !== session.configDir || configDir !== session.configDir))) throw new Error("session_unavailable");
    } catch { throw new Error("session_unavailable"); }
    if (!insideRoot(root, cwd)) throw new Error("outside_root");
    if (session && runtime === "claude") {
      const occupancy = await claudeOccupancy(configDir, session.sessionId);
      if (occupancy !== "free") throw new Error(occupancy === "occupied" ? "session_in_use" : "session_unavailable");
      if (!claudeSessionExists(configDir, session.sessionId)) throw new Error("session_unavailable");
    }
    if (session && runtime === "codex" && !codexSessionExists(configDir, session.sessionId, cwd)) throw new Error("session_unavailable");
    const env = agentEnv({ env: inherited, path: probe.path, configDir }, runtime, appRuntime, { root, cwd, configDir });
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
  state(provider: Provider): AuthState; check(provider: Provider): Promise<Started>; checked(provider: Provider): Promise<void>; acquire(provider: Provider): Promise<Lease>;
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
// Exact versions whose ACP behaviour was checked live (B3, 2026-10-28). The Antigravity server has no version run:
// it is the sha-pinned download (agentAuth/antigravity.ts) and its initialize reply names its version.
export const ACP_VERSIONS: Partial<Record<Provider, string>> = { cursor: "2026.10.22-27dcf5f", copilot: "1.0.105" };
// The provider CLI's --version output names a build doan checked; account status readiness reads the same rule.
export function supportedVersion(provider: Provider, output: string): boolean {
  const match = output.match(/\b\d+\.\d+\.\d+(?:-[0-9a-f]+)?\b/)?.[0] ?? null;
  return provider === "claude" || provider === "codex" ? supportedRuntime(provider, match?.split("-")[0] ?? null, BUNDLED_CLAUDE_SDK) : match !== null && match === ACP_VERSIONS[provider];
}
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
// cli is the bundled doan executable; its directory goes first on PATH so the agent runs that doan, not whatever
// another install put on the login shell's PATH. toolsFailed: the provider CLI was not found or its version is not one
// doan checked, so the readiness facts read at launch may be stale (an install, removal or self-update since).
export function createAccountPrepare(auth: AccountRuntime, cli: string, toolsFailed: (provider: Provider) => void = () => {}): AccountPrepare {
  return async (request, stored) => {
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
    try { lease = await auth.acquire(provider); } catch (error) {
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
    try {
      recheck();
      if (!adapter.acpAuth) {
        const version = await runProcess(lease.command, ["--version"], lease.env, 5000);
        recheck();
        if (version.exitCode !== 0 || version.timedOut || !supportedVersion(provider, version.stdout)) { toolsFailed(provider); throw new Error(stored ? "session_unavailable" : "runtime_unsupported"); }
      }
      let root: string, cwd: string, configDir: string;
      try { root = canonicalDirectory(request.root); cwd = canonicalDirectory(stored?.session.cwd ?? root); configDir = canonicalDirectory(lease.profileDir); }
      catch { throw new Error("session_unavailable"); }
      if (root !== request.root || (stored && stored.session.configDir !== configDir)) throw new Error("session_unavailable");
      if (!insideRoot(root, cwd)) throw new Error("outside_root");
      if (stored) {
        const id = stored.session.sessionId;
        const exists = provider === "claude" ? claudeSessionExists(configDir, id) : provider === "codex" ? codexSessionExists(configDir, id, cwd) : acpSessionExists(configDir, adapter.acp!.sessions, id);
        // Codex admits a writer at thread/resume and ACP servers at session/load; there is no registry to read first.
        // Only doan runs in the dedicated profile, and doan's reservations keep one runner per session.
        const occupancy = provider === "claude" ? await claudeOccupancy(configDir, id) : "free";
        recheck();
        const current = auth.state(provider);
        // An unchecked Copilot connection runs as verified; recheck() already refused any check or write-back failure.
        const judgment = judgeConnection(stored.owner, adapter.verifyByRun && !current.error ? { ...current, verified: true } : current, { exists, occupancy });
        if (judgment.decision !== "resume") throw new Error(judgmentCode(judgment));
      }
      const connection = recheck();
      const runArgs = provider === "claude" || provider === "codex" ? RUN_ARGS[provider] : adapter.acp!.args;
      return {
        runtime: provider, command: lease.command, args: [...adapter.args, ...runArgs], configDir, cwd,
        env: { ...lease.env, PATH: `${dirname(cli)}:${lease.env.PATH}` }, ...(stored ? { sessionId: stored.session.sessionId } : {}),
        owner: { kind: "doan", provider, connectionId: connection.connectionId, accountId: connection.account.id, workspaceId: connection.account.workspace, profile: connection.profile },
        release: lease.release, recheck: () => { recheck(); },
        ...(adapter.acp?.authenticate ? { authenticate: adapter.acp.authenticate } : {}),
        ...(adapter.verifyByRun ? { confirm: () => auth.confirm(provider, connection.connectionId) } : {}),
      };
    } catch (error) { await lease.release(); throw error; }
  };
}
