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

export interface AccountRuntime { state(provider: Provider): AuthState; check(provider: Provider): Promise<Started>; acquire(provider: Provider): Promise<Lease> }
// Account refusals that a sign-in or reauth resolves read as not_logged_in; the rest keep the conversation codes.
function accountCode(cause: string): string {
  if (["not_connected", "reauth_required", "unverified", "account_mismatch", "sign_out_failed"].includes(cause)) return "not_logged_in";
  return ["busy", "cli_missing", "session_in_use"].includes(cause) ? cause : "session_unavailable";
}
// A conversation owned by another account, workspace or profile cannot run here whatever the user signs into now.
function judgmentCode(judgment: Exclude<ConnectionJudgment, { decision: "resume" }>): string {
  if (judgment.decision === "reauth") return "not_logged_in";
  if (judgment.decision === "legacy") return "session_unavailable";
  return ["busy", "session_in_use"].includes(judgment.cause) ? judgment.cause : ["sign_out_failed", "unverified"].includes(judgment.cause) ? "not_logged_in" : "session_unavailable";
}
// cli is the bundled doan executable; its directory goes first on PATH so the agent runs that doan, not whatever
// another install put on the login shell's PATH.
export function createAccountPrepare(auth: AccountRuntime, cli: string): AccountPrepare {
  return async (request, stored) => {
    const provider = stored ? stored.session.runtime : request.runtime;
    if (!provider) throw new Error("no_agent");
    if (provider !== "claude" && provider !== "codex") throw new Error(stored ? "session_unavailable" : "runtime_unsupported");
    if (!isAbsolute(cli) || basename(cli) !== "doan") throw new Error("cli_missing");
    let state = auth.state(provider);
    // Stored metadata loads unverified; the first run checks it rather than refusing until someone else does.
    if (state.connection && !state.verified && !state.expired && !state.attempt) {
      const started = await auth.check(provider); if (started.ok) await started.done;
      state = auth.state(provider);
    }
    if (state.attempt?.kind === "check") throw new Error("busy");
    const pinned = { generation: state.generation, connectionId: state.connection?.connectionId };
    let lease: Lease;
    try { lease = await auth.acquire(provider); } catch (error) { throw new Error(accountCode(error instanceof Error ? error.message : "")); }
    // A sign-in, sign-out or failed check during any await must not let this run continue on another account.
    const recheck = () => {
      const now = auth.state(provider);
      if (now.attempt && now.attempt.kind !== "check") throw new Error("busy");
      if (now.generation !== pinned.generation || now.connection?.connectionId !== pinned.connectionId || !now.verified || now.expired ||
          now.error?.code === "account_mismatch" || now.error?.code === "sign_out_failed") throw new Error("not_logged_in");
      return now.connection!;
    };
    try {
      recheck();
      const version = await runProcess(lease.command, ["--version"], lease.env, 5000);
      recheck();
      const match = version.exitCode === 0 && !version.timedOut ? version.stdout.match(/\b\d+\.\d+\.\d+\b/)?.[0] ?? null : null;
      if (!supportedRuntime(provider, match, BUNDLED_CLAUDE_SDK)) throw new Error(stored ? "session_unavailable" : "runtime_unsupported");
      let root: string, cwd: string, configDir: string;
      try { root = canonicalDirectory(request.root); cwd = canonicalDirectory(stored?.session.cwd ?? root); configDir = canonicalDirectory(lease.profileDir); }
      catch { throw new Error("session_unavailable"); }
      if (root !== request.root || (stored && stored.session.configDir !== configDir)) throw new Error("session_unavailable");
      if (!insideRoot(root, cwd)) throw new Error("outside_root");
      if (stored) {
        const id = stored.session.sessionId;
        const exists = provider === "claude" ? claudeSessionExists(configDir, id) : codexSessionExists(configDir, id, cwd);
        // Codex admits a writer at thread/resume; there is no registry to read first.
        const occupancy = provider === "claude" ? await claudeOccupancy(configDir, id) : "free";
        recheck();
        const judgment = judgeConnection(stored.owner, auth.state(provider), { exists, occupancy });
        if (judgment.decision !== "resume") throw new Error(judgmentCode(judgment));
      }
      const connection = recheck();
      return {
        runtime: provider, command: lease.command, args: PROVIDER_AUTH[provider].args, configDir, cwd,
        env: { ...lease.env, PATH: `${dirname(cli)}:${lease.env.PATH}` }, ...(stored ? { sessionId: stored.session.sessionId } : {}),
        owner: { kind: "doan", provider, connectionId: connection.connectionId, accountId: connection.account.id, workspaceId: connection.account.workspace, profile: connection.profile },
        release: lease.release, recheck: () => { recheck(); },
      };
    } catch (error) { await lease.release(); throw error; }
  };
}
