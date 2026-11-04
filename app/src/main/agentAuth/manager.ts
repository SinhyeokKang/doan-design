import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACP_PROTOCOL_VERSION, AcpConnection, AcpError } from "../conversation/acp";
import { CodexDispatcher, RpcError } from "../conversation/dispatcher";
import { OwnedGroup } from "../conversation/process";
import { object } from "../conversation/sessions";
import { AUTH_LINK_FILE, BROWSER_HOOK, callbackAddress, INSTALL_FAILED, forwardCallback, signInLink, type SignInLink } from "./antigravity";
import { probeShell } from "../onboarding/machine";
import { findOnPath } from "../onboarding/states";
import { providerEnv } from "./environment";
import { codexAccountEmail, GOOGLE_USERINFO_URL, googleAccessToken, googleEmail, googleRefreshRequest, withIdentity } from "./identity";
import { PROVIDER_AUTH, type ProviderAuth } from "./providers";
import { authStatus, checkVerdict, initialAuthState, transition } from "./state";
import type { AuthStorage, CleanupRecord } from "./storage";
import { PROVIDERS, type AccountConnection, type AuthEvent, type AuthMetadata, type AuthRejection, type AuthState, type AuthStatusDto, type AuthTransition, type CheckResult, type Provider, type SignInResult, type ToolFacts } from "./types";

export interface AuthProcess { onOutput(listener: (text: string, stream?: "stderr") => void): void; exit: Promise<number | null>; gone: Promise<void>; stop(): void; write?(text: string): void }
export type Spawn = (command: string, args: string[], options: { cwd: string; env: Record<string, string>; input?: boolean }) => AuthProcess;
export interface AuthPrompt { provider: Provider; attemptId: string; owner: number; url: string }
// A provider process using the dedicated profile; sign-in and sign-out wait until every lease is released.
export interface Lease { command: string; env: Record<string, string>; profileDir: string; release(): Promise<void> }
export type Started = { ok: true; attemptId: string; done: Promise<AuthState> } | { ok: false; reason: AuthRejection; state: AuthState };
// A check's own result once its write-back is done; "replaced": a sign-in or sign-out took its place before the result.
export type CheckOutcome = "ok" | "replaced" | "network" | "check_failed" | "cli_install_failed" | "account_mismatch" | "storage_failed";
export type CheckStarted = (Extract<Started, { ok: true }> & { outcome: Promise<CheckOutcome> }) | Extract<Started, { ok: false }>;
// The MCP connector step of a sign-out or a committed replacement (mcp-connectors design 'sign-out·교체의 MCP 로그아웃
// 경계'). agentAuth knows no connector file: the step decides from the provider's own list. run executes the provider
// CLI (with its base arguments) in the profile being left, the live one or a replaced one, and resolves after its
// group is gone. staging: the new profile of a staged replacement (Codex), which takes the servers still valid.
// profileDir: that profile's directory, whose own config names its servers when the provider's list cannot be read.
export interface McpLogoutRequest {
  kind: "signOut" | "replace"; previousAccountId: string | null; nextAccountId: string | null; staging: string | null; profileDir: string;
  run(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }>;
}
export interface AuthManagerOptions {
  storage: AuthStorage; spawn: Spawn; inherited: Record<string, string | undefined>; appRuntime: string;
  // signal aborts when the attempt is stopped; Antigravity's locate may be a long server download.
  locate(provider: Provider, signal?: AbortSignal): Promise<{ command: string; path: string } | null>;
  adapters?: Record<Provider, ProviderAuth>; newId?: () => string; statusTimeoutMs?: number; hookLinkTimeoutMs?: number;
  onChange?(state: AuthState, revision: number): void; onPrompt?(prompt: AuthPrompt): void;
  // Closes the provider's doan-account conversation runs for a sign-out or replacement the user chose to stop them for.
  stopRuns?(provider: Provider): Promise<void>; drainTimeoutMs?: number;
  // Stops the provider's MCP connector work at the start of every sign-in or sign-out write. That work may hold no
  // lease (a pending Codex logout runs in a temporary CODEX_HOME), so the drain would not reach it; it never needs the
  // person's stop either, which stays the conversations' rule (stopRuns, stop_required).
  stopMcp?(provider: Provider): Promise<void>;
  // Never fails the sign-out or replacement it runs in: a failed logout is the step's own pending record.
  mcpLogout?(provider: Provider, request: McpLogoutRequest): Promise<{ failed: string[] }>;
  // Antigravity's account lookup (Google token and userinfo requests); globalThis.fetch when absent.
  fetch?: typeof globalThis.fetch;
}
export interface WriteOptions { stop?: boolean }
interface Run { code: number | null; stdout: string; stderr: string }
const OUTPUT_LIMIT = 1024 * 1024;
const QUIT_WAIT_MS = 5000;
const ACP_OPEN_MS = 60_000;
const LINK_POLL_MS = 100;
// The CLI launches the browser right after printing its link (D1: the hook ran within the same second), so a printed
// link with no accepted hook link this long after it means the CLI no longer behaves as `claudeLink` expects.
const HOOK_LINK_MS = 10_000;
const LINK_DIR_PREFIX = "doan-auth-link-";
// A running login's directory is minutes old at most; the margin keeps another doan instance's live one.
const STALE_LINK_DIR_MS = 60 * 60 * 1000;
// An ACP run answers a cancel within 5 s before its group is stopped (acpRunner); SIGKILL follows 500 ms after SIGTERM.
const DRAIN_MS = 15_000;
// One budget for a provider's account lookup: Codex from the app-server start to the account/read answer, Antigravity
// both Google requests. Sign-in, a check and so the first run after a restart wait for it.
const IDENTITY_MS = 5000;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const tail = (text: string) => text.trim().slice(-2000) || undefined;
class Cancelled extends Error {}
class Failure extends Error { constructor(readonly code: "sign_in_failed" | "storage_failed" | "cli_install_failed", detail?: string) { super(detail ?? code); } }
// A failed ACP exchange is logged in Doan's own words only: the server's messages, RPC error text and data, payloads and
// exception lines can hold the sign-in link, the account and tokens (the 1.3.0 server puts the whole loadCodeAssist
// reply into an onboarding error). reason is Doan's category of how the exchange ended; events are the server's
// recognized log lines, reworded. The detail stays the full message for the in-memory outcome only.
class ServerError extends Error { constructor(detail: string, readonly reason: string, readonly events: readonly string[], readonly withheld: number) { super(detail); } }
class UnexpectedServer extends Error {}
// An account lookup's failure in Doan's own words: never a reply body, a token or a provider message.
class LookupFailure extends Error {}
type Found = { email: string } | null;
// The refresh grant built from Antigravity's token file inside the hold, so its requests can run after the drop and
// only the values they send outlive the read.
type TokenSource = { request: { url: string; body: string } } | { failure: string };
const SERVER_EVENTS = 20;
// An absl log line of the 1.3.0 server: level and date, time, thread, file:line]. Traceback and payload continuation
// lines and the printed sign-in link do not match and are withheld.
const SERVER_LINE = /^([IWEF])\d{4} (\d\d:\d\d:\d\d)\.\d+ +\d+ ([A-Za-z0-9_]{1,64}\.py):(\d{1,6})\] (.*)$/;
// Messages of the 1.3.0 auth path (credential_manager.py, onboard.py, oauth_manager.py, server.py, settings_writer.py).
const SERVER_EVENT_NAMES: [RegExp, string | ((found: RegExpExecArray) => string)][] = [
  [/^Starting AGY ACP Server\b/, "server started"],
  [/^Authenticate called\b/, "authenticate received"],
  [/^Credentials missing or invalid\. Launching browser login flow\b/, "no usable stored credential; browser sign-in started"],
  [/^Access token expired\. Refreshing silently\b/, "refreshing the stored credential"],
  [/^Running CCPA loadCodeAssist\b/, "onboarding check started"],
  [/^User is already onboarded\b/, "onboarding check passed"],
  [/^settings: recorded auth\.type\b/, "sign-in method saved"],
  [/^Signing out after (onboarding_failed|ge_license_cancelled|ge_license_failed|ge_auth_failed|ge_backend_http_\d{3}):/, found => `server signed out after ${found[1]}`],
  [/^Cleared credential file\b/, "server deleted its stored credential"],
  [/^Refusing to persist credentials without a refresh token\b/, "no refresh token returned; credential not saved"],
  [/^Failed to refresh token\b/, "credential refresh failed"],
  [/^Onboarding failed with terminal error\b/, "onboarding failed (terminal)"],
  [/^Failed to run onboarding\b/, "onboarding failed"],
];
function serverEvent(line: string): string | null {
  const parts = SERVER_LINE.exec(line);
  if (!parts) return null;
  const [, level, time, file, at, text] = parts as unknown as [string, string, string, string, string, string];
  for (const [pattern, name] of SERVER_EVENT_NAMES) {
    const found = pattern.exec(text);
    if (found) return `${time} ${file}:${at} ${typeof name === "string" ? name : name(found)}`;
  }
  return level === "I" ? null : `${time} ${level} ${file}:${at} (message withheld)`;
}
const serverLog = (error: unknown) => {
  if (!(error instanceof ServerError) || (!error.events.length && !error.withheld)) return "";
  return `; server events:${error.events.map(event => `\n  ${event}`).join("")}${error.withheld ? `\n  (${error.withheld} other lines withheld)` : ""}`;
};
const exchangeReason = (error: unknown) => error instanceof ServerError ? error.reason : "the server could not be started";

export class AuthManager {
  private states = new Map<Provider, AuthState>();
  private revision = 0;
  // One sign-in or sign-out write across all providers at a time.
  private writer: string | null = null;
  private processes = new Map<string, Set<AuthProcess>>();
  // Stop requests outlive process registration: exec honours one that arrived before its spawn.
  private stopRequests = new Set<string>();
  private locating = new Map<string, AbortController>();
  private lookups = new Map<string, AbortController>();
  private checks = new Map<Provider, { attemptId: string; done: Promise<unknown> }>();
  private holds = new Map<Provider, number>();
  // Providers whose committed replacement is still running its MCP step; they admit no lease meanwhile.
  private settlings = new Set<Provider>();
  private runs = new Map<Provider, number>();
  private conversations = new Map<Provider, number>();
  private queues = new Map<Provider, Promise<void>>();
  // The sign-in link of each ACP sign-in attempt; a pasted callback address must answer this one.
  private links = new Map<string, SignInLink>();
  private pending = new Set<Promise<unknown>>();
  private closed = false;
  private readonly adapters: Record<Provider, ProviderAuth>;
  private readonly newId: () => string;
  constructor(private readonly options: AuthManagerOptions) {
    this.adapters = options.adapters ?? PROVIDER_AUTH; this.newId = options.newId ?? randomUUID;
    for (const provider of PROVIDERS) this.states.set(provider, initialAuthState(provider, null));
  }

  // Throws on unreadable metadata rather than treating it as empty: a later save would erase every connection.
  async load(): Promise<void> {
    const { accounts, signOutFailed = [] } = this.options.storage.readMetadata();
    for (const provider of PROVIDERS) {
      const stored = accounts.find(a => a.provider === provider) ?? null;
      this.states.set(provider, initialAuthState(provider, stored, signOutFailed.includes(provider)));
      await this.recover(provider, stored !== null);
    }
    let pending: CleanupRecord[] = [];
    try { pending = this.options.storage.pendingCleanup(); } catch (error) { console.error("doan: pending profile cleanups could not be read", message(error)); }
    if (pending.length) void this.track(this.sweep(pending));
  }
  state(provider: Provider): AuthState { return this.states.get(provider)!; }
  // A committed replacement still running its MCP step: connected in state, but admitting no lease yet.
  settling(provider: Provider): boolean { return this.settlings.has(provider); }
  status(provider: Provider, facts: ToolFacts): AuthStatusDto { return settlingStatus(authStatus(this.state(provider), facts, this.revision), this.settling(provider)); }

  async check(provider: Provider): Promise<CheckStarted> {
    const attemptId = this.newId();
    const result = this.closed ? this.refuse(provider, "busy") : this.apply(provider, { type: "check", attemptId });
    if (!result.ok) return result;
    let outcome: CheckOutcome = "replaced";
    const done = this.track((async () => {
      let checked: CheckResult, lost: string | null = null, found: Found = null, source: TokenSource | null = null;
      const identity = this.adapters[provider].identity;
      try {
        await this.hold(provider);
        try {
          checked = await this.statusRun(provider, attemptId);
          if (checked.status === "connected" && identity === "codex-app-server") found = await this.lookup(provider, attemptId, this.profileOf(provider));
          // Antigravity's token file exists only while held.
          else if (checked.status === "connected" && identity === "google-userinfo") source = this.tokenFile(provider, this.profileOf(provider));
        } finally { lost = await this.drop(provider); }
        // Requests run after the drop: quit force-releases holds after its wait, and a later drop by a check still
        // waiting on the network would absorb the removed working copy as a sign-out and empty the vault.
        if (source) found = await this.lookup(provider, attemptId, this.profileOf(provider), source);
      } catch (error) { checked = { status: "failed", code: error instanceof Failure && error.code === "cli_install_failed" ? error.code : "check_failed", detail: message(error) }; }
      try {
        // The account shown when the result applies keeps its email if this lookup found none; never stored (writer slot).
        if (identity && checked.status === "connected") checked = { ...checked, account: withIdentity(checked.account, found, this.state(provider).connection?.account ?? null) };
        // Judged before applying: a kept failed sign-out would hide this check's own failure in the new state.
        const verdict = checkVerdict(this.state(provider), checked);
        if (this.apply(provider, { type: "checked", attemptId, result: checked }).ok) outcome = verdict;
        // After the result: the status ran on the refreshed copy that just failed to reach the vault.
        if (lost !== null) { this.apply(provider, { type: "writeBackFailed", detail: lost }); if (outcome === "ok") outcome = "storage_failed"; }
      } finally {
        this.stopRequests.delete(attemptId);
        if (this.checks.get(provider)?.attemptId === attemptId) this.checks.delete(provider);
      }
      return this.state(provider);
    })());
    this.checks.set(provider, { attemptId, done });
    return { ok: true, attemptId, done, outcome: done.then(() => outcome, () => outcome) };
  }

  // Resolves when the provider's running check, if any, has applied its result.
  async checked(provider: Provider): Promise<void> { await this.checks.get(provider)?.done.catch(() => {}); }

  // A replacement with running conversations needs stop: the attempt then closes them and waits for their groups.
  async signIn(provider: Provider, owner: number, options: WriteOptions = {}): Promise<Started> {
    if (this.closed || this.writer) return this.refuse(provider, "busy");
    if (this.running(provider) && !options.stop) return this.refuse(provider, "stop_required");
    const attemptId = this.newId();
    const result = this.apply(provider, { type: "signIn", attemptId, owner });
    if (!result.ok) return result;
    this.writer = attemptId;
    const check = this.replaceCheck(provider);
    const done = this.track((async () => {
      try {
        await check;
        if (this.options.stopMcp) await this.stopMcp(provider);
        if ((options.stop || this.leased(provider)) && !await this.drain(provider, attemptId)) {
          // Nothing was touched: the previous login stays as it was, still used by the run that did not stop.
          this.apply(provider, this.cancelled(provider, attemptId) ? { type: "settled", attemptId, kept: true }
            : { type: "signedIn", attemptId, result: { status: "failed", code: "sign_in_failed", detail: "running conversations did not stop" }, kept: true });
          return this.state(provider);
        }
        const previous = this.state(provider).connection;
        // A login that logs the profile out first would destroy the stored login before the user approves anything,
        // so its replacement signs in to a fresh profile that becomes the connection's only on success (D22).
        const staged = this.adapters[provider].loginClears && previous ? `${provider}-${this.newId()}` : null;
        const touch = { live: false };
        let outcome: SignInResult | null, recorded = false;
        try {
          // Recorded before the profile exists, so a crash at any later point leaves a cleanup the next start finishes.
          if (staged) await this.storageStep(() => this.options.storage.markCleanup(provider, staged));
          recorded = true;
          outcome = { status: "stored", connection: await this.signInFlow(provider, attemptId, owner, touch, staged ?? this.profileOf(provider)) };
        }
        catch (error) {
          // An unrecorded stage was never created: cleaning it would create the directory it must not leave behind.
          if (recorded) await this.discard(provider, attemptId, previous !== null, staged);
          outcome = error instanceof Cancelled || this.cancelled(provider, attemptId) ? null
            : { status: "failed", code: error instanceof Failure ? error.code : "sign_in_failed", detail: message(error) };
        }
        // The MCP step runs only after the commit, so a replacement that does not finish leaves the MCP registrations
        // and tokens as they were (POSTMORTEM 2026-10-29), and before a staged replacement's previous profile is logged
        // out and removed: the MCP logouts run in it. Until it ends the provider admits nothing: a run would use the
        // previous account's MCP tokens, or start Codex before its staging profile has its servers.
        const settle = previous !== null && outcome?.status === "stored" && this.options.mcpLogout !== undefined;
        if (settle) this.settlings.add(provider);
        this.apply(provider, outcome ? { type: "signedIn", attemptId, result: outcome, kept: !touch.live } : { type: "settled", attemptId, kept: !touch.live });
        if (settle && outcome?.status === "stored") {
          try {
            await this.mcpStep(provider, attemptId, previous.profile, { kind: "replace", previousAccountId: previous.account.id, nextAccountId: outcome.connection.account.id, staging: staged && this.options.storage.profileDir(provider, staged) });
          } finally {
            this.settlings.delete(provider);
            // Admission reopened without a state change: published as one, so readers (MCP Connectors) look again.
            this.revision += 1;
            this.options.onChange?.(this.state(provider), this.revision);
          }
        }
        if (staged && previous && outcome?.status === "stored") await this.retire(provider, attemptId, previous.profile);
      } finally { if (this.writer === attemptId) this.writer = null; this.stopRequests.delete(attemptId); this.links.delete(attemptId); }
      return this.state(provider);
    })());
    return { ok: true, attemptId, done };
  }

  async cancel(provider: Provider, attemptId: string, owner: number): Promise<AuthTransition> {
    const result = this.apply(provider, { type: "cancel", attemptId, owner });
    if (result.ok) this.stop(attemptId);
    return result;
  }
  // ACP sign-ins (Antigravity) return to the server's loopback listener. When the browser cannot reach it, the user
  // pastes the address the browser ended on and main delivers it to that listener, for this attempt's link only.
  submitCode(provider: Provider, attemptId: string, owner: number, code: string): { ok: true } | { ok: false; reason: AuthRejection } {
    const attempt = this.state(provider).attempt;
    if (!attempt || attempt.id !== attemptId || attempt.kind !== "signIn" || attempt.cancelled) return { ok: false, reason: "stale" };
    if (attempt.owner !== owner) return { ok: false, reason: "not_owner" };
    const link = this.links.get(attemptId);
    const url = link && code.length <= 16384 ? callbackAddress(link, code) : null;
    if (!url) return { ok: false, reason: "invalid" };
    // A failed delivery leaves the attempt waiting; the user can paste again or cancel.
    void forwardCallback(url).catch(error => console.error(`doan: ${provider} sign-in callback was not delivered`, message(error)));
    return { ok: true };
  }
  // A run's completed request is the verification for providers whose status check costs a request (Copilot). The
  // account comes from the run's working copy, which the lease writes back next; reading it sends no request.
  confirm(provider: Provider, connectionId: string): void {
    const read = this.adapters[provider].parseStatus({ code: 0, stdout: "", stderr: "", profileDir: this.options.storage.profileDir(provider, this.profileOf(provider)) });
    if (read.status === "connected") this.apply(provider, { type: "runConfirmed", connectionId, account: read.account });
  }
  async ownerClosed(owner: number): Promise<void> {
    for (const provider of PROVIDERS) {
      const attempt = this.state(provider).attempt;
      this.apply(provider, { type: "ownerClosed", owner });
      // Also when already cancelled: a process spawned or lingering after the first request is still the attempt's.
      if (attempt?.kind === "signIn" && attempt.owner === owner) this.stop(attempt.id);
    }
  }

  async signOut(provider: Provider, options: WriteOptions = {}): Promise<Started> {
    if (this.closed || this.writer) return this.refuse(provider, "busy");
    const attemptId = this.newId();
    const result = this.apply(provider, { type: "signOut", attemptId, running: this.running(provider), stop: options.stop === true });
    if (!result.ok) return result;
    this.writer = attemptId;
    const check = this.replaceCheck(provider);
    const done = this.track((async () => {
      try {
        await check;
        if (this.options.stopMcp) await this.stopMcp(provider);
        let removed: { status: "removed" } | { status: "failed"; detail?: string };
        try {
          if ((options.stop || this.leased(provider)) && !await this.drain(provider, attemptId)) throw new Error("running conversations did not stop");
          await this.signOutFlow(provider, attemptId); removed = { status: "removed" };
        } catch (error) {
          removed = { status: "failed", detail: message(error) };
          // Persisted so a restart does not unblock runs on credentials that may still be there.
          try {
            const metadata = this.options.storage.readMetadata(), stored = metadata.accounts.find(a => a.provider === provider);
            if (stored) this.options.storage.writeMetadata(replaceAccount(metadata, provider, stored, true));
          } catch (failure) { console.error(`doan: ${provider} sign-out failure could not be recorded`, message(failure)); }
        }
        this.apply(provider, { type: "signedOut", attemptId, result: removed });
      } finally { if (this.writer === attemptId) this.writer = null; }
      return this.state(provider);
    })());
    return { ok: true, attemptId, done };
  }

  // listing: a model list read; mcp: an MCP connector command (mcp-connectors). Either holds the profile like a run,
  // but neither is a conversation the person would be asked to stop: a sign-out or replacement stops it (stopRuns)
  // and waits for it without stop_required. added: extra environment, such as the MCP sign-in's link file.
  async acquire(provider: Provider, use: "run" | "listing" | "mcp" = "run", added: Record<string, string> = {}): Promise<Lease> {
    this.admit(provider);
    const { command, env, profileDir } = await this.launch(provider, undefined, added);
    // A sign-in or sign-out may have started while the CLI was being located.
    this.admit(provider);
    const counts = (delta: number) => {
      this.runs.set(provider, (this.runs.get(provider) ?? 0) + delta);
      if (use === "run") this.conversations.set(provider, (this.conversations.get(provider) ?? 0) + delta);
    };
    counts(1);
    try { await this.hold(provider); } catch (error) { counts(-1); throw error; }
    let released = false;
    return { command, env, profileDir, release: async () => {
      if (released) return;
      released = true;
      // The run counts until its write-back lands, so a sign-out cannot delete a vault the write-back recreates.
      try { this.lost(provider, await this.drop(provider)); } finally { counts(-1); }
    } };
  }

  private admit(provider: Provider): void {
    const state = this.state(provider);
    const refusal = this.closed || (state.attempt && state.attempt.kind !== "check") || this.settlings.has(provider) ? "busy"
      : state.error?.code === "sign_out_failed" ? "sign_out_failed" : !state.connection ? "not_connected"
      : state.error?.code === "account_mismatch" ? "account_mismatch" : state.expired ? "reauth_required"
      : !state.verified && !(this.adapters[provider].verifyByRun && !state.error) ? "unverified" : null;
    if (refusal) throw new Error(refusal);
  }

  // Cancels sign-ins, stops checks and waits for owned processes; sign-outs finish because they are short local writes.
  async quit(): Promise<void> {
    this.closed = true;
    for (const provider of PROVIDERS) {
      const attempt = this.state(provider).attempt;
      if (attempt?.kind === "signIn" && attempt.owner !== null) await this.cancel(provider, attempt.id, attempt.owner);
      else if (attempt?.kind === "check") this.stop(attempt.id);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.allSettled([...this.pending]), new Promise(resolve => { timer = setTimeout(resolve, QUIT_WAIT_MS); timer.unref?.(); })]);
    clearTimeout(timer);
    for (const provider of PROVIDERS) if ((this.holds.get(provider) ?? 0) > 0) { this.holds.set(provider, 1); await this.drop(provider); }
  }

  // touch.live turns true once the attempt may have changed the login the stored connection uses; until then a
  // cancel or failure leaves that connection exactly as it was.
  private async signInFlow(provider: Provider, attemptId: string, owner: number, touch: { live: boolean }, profile: string): Promise<AccountConnection> {
    const auth = this.adapters[provider], current = this.profileOf(provider), live = profile === current;
    // A login starts from no working copy so a failed or cancelled replacement cannot leave the old one exposed.
    if (auth.vault) await this.storageStep(() => this.options.storage.scrub(provider, auth.vault!));
    if (auth.acpAuth) await this.acpSignIn(provider, attemptId, owner);
    else {
      const seen = new Set<string>();
      const show = (url: string) => {
        if (this.stopRequests.has(attemptId) || this.cancelled(provider, attemptId) || seen.has(url)) return;
        seen.add(url); this.options.onPrompt?.({ provider, attemptId, owner, url });
      };
      let accepted = false, missing = false, deadline: ReturnType<typeof setTimeout> | undefined;
      const hooked = auth.hookLink ? hookLinks(raw => {
        const url = auth.hookLink!(raw);
        if (!url) { console.error(`doan: ${provider} sign-in ignored a browser-hook link it does not accept: ${describeLink(raw)}`); return; }
        accepted = true; clearTimeout(deadline); show(url);
      }) : null;
      let login: Run;
      if (auth.loginClears && live) touch.live = true;
      try {
        login = await this.exec(provider, attemptId, auth.login, null, profile, text => {
          const printed = (text.match(/https?:\/\/[^\s"'<>]+/g) ?? []).map(found => found.replace(/[.,;:!?)\]]+$/, ""));
          if (!hooked) {
            // Sentence punctuation after a printed URL is not part of it.
            for (const url of printed) show(url);
          } else if (printed.length && !accepted && deadline === undefined) {
            // Armed by the printed link, not the process start: a slow CLI start is not a missing hook link.
            deadline = setTimeout(() => {
              missing = true;
              console.error(`doan: ${provider} sign-in printed a link but its browser hook received no acceptable link within ${this.options.hookLinkTimeoutMs ?? HOOK_LINK_MS} ms`);
              this.stop(attemptId);
            }, this.options.hookLinkTimeoutMs ?? HOOK_LINK_MS);
          }
        }, hooked?.env);
      } finally { clearTimeout(deadline); hooked?.close(); }
      // A keychain login stores its credential into the live profile when it succeeds; before that, Claude keeps
      // (or on a refused login restores) the previous one. Vault providers log in on a scrubbed working copy.
      if (!auth.vault && live && login.code === 0) touch.live = true;
      if (this.cancelled(provider, attemptId)) throw new Cancelled();
      if (missing) throw new Failure("sign_in_failed", "no browser-hook link was accepted");
      if (login.code !== 0) throw new Failure("sign_in_failed", tail(login.stderr) ?? tail(login.stdout));
    }
    if (this.cancelled(provider, attemptId)) throw new Cancelled();
    const checked = await this.statusRun(provider, attemptId, profile);
    if (this.cancelled(provider, attemptId)) throw new Cancelled();
    if (checked.status !== "connected") throw new Failure("sign_in_failed", `status after login: ${checked.status}`);
    let account = checked.account;
    if (auth.identity) {
      // Before the seal and scrub (the token file goes with them) and before the commit, after which nothing may fail.
      // previous is null: a replacement never shows the replaced account's email.
      const source = auth.identity === "google-userinfo" ? this.tokenFile(provider, profile) : undefined;
      account = withIdentity(account, await this.lookup(provider, attemptId, profile, source), null);
      if (this.cancelled(provider, attemptId)) throw new Cancelled();
    }
    const profileDir = this.options.storage.profileDir(provider, profile), storage = this.options.storage;
    let sealed: Buffer | null = null;
    // The working copy goes before the commit: after the vault and metadata name the new login nothing may fail and
    // hand the previous connection back over it.
    if (auth.vault) await this.storageStep(async () => { sealed = await storage.seal(provider, auth.vault!); storage.scrub(provider, auth.vault!); });
    else if (auth.plaintext.some(rel => existsSync(join(profileDir, rel)))) throw new Failure("storage_failed", "provider wrote a plaintext credential file");
    const connection: AccountConnection = { provider, connectionId: this.newId(), profile, account };
    // Last cancellation point: from the vault and metadata writes to the signedIn transition only microtasks run, so
    // no cancel or window-close event can land between a persisted connection and its state.
    if (this.cancelled(provider, attemptId)) throw new Cancelled();
    await this.storageStep(() => {
      const previous = sealed && storage.sealedVault(provider);
      // A staged login replaces the stored connection's profile, which then waits for its logout like a staged one.
      const replaced = !live && this.state(provider).connection ? current : null;
      if (replaced) storage.markCleanup(provider, replaced);
      if (sealed) storage.storeSealed(provider, sealed);
      try { storage.writeMetadata(replaceAccount(storage.readMetadata(), provider, connection, false)); }
      catch (error) {
        // The stored connection must keep the credential it was verified with.
        if (sealed) { try { storage.storeSealed(provider, previous); } catch (restore) { touch.live = true; console.error(`doan: ${provider} previous credential could not be restored`, message(restore)); } }
        if (replaced) { try { storage.clearCleanup(replaced); } catch (clear) { console.error(`doan: ${provider} cleanup record could not be cleared`, message(clear)); } }
        throw error;
      }
    });
    // Committed: a record left behind names the live profile, which cleanup never touches.
    if (!live) { try { storage.clearCleanup(profile); } catch (error) { console.error(`doan: ${provider} cleanup record could not be cleared`, message(error)); } }
    return connection;
  }

  // Without a stored connection everything the attempt left is an orphan; with one, the vault stays the live profile.
  // A staged profile is an orphan either way, and only it is touched.
  private async discard(provider: Provider, attemptId: string, hadConnection: boolean, staged: string | null): Promise<void> {
    const auth = this.adapters[provider], storage = this.options.storage;
    try {
      if (auth.vault) { storage.scrub(provider, auth.vault); if (!hadConnection) storage.removeVault(provider); return; }
      // Cleanup is not the stopped work: a cancelled login may already have written its keychain item.
      this.stopRequests.delete(attemptId);
      if (staged) { await this.cleanProfile(provider, attemptId, staged); return; }
      const profileDir = storage.profileDir(provider, this.profileOf(provider));
      for (const rel of auth.plaintext) rmSync(join(profileDir, rel), { force: true });
      if (!hadConnection && auth.logout) await this.exec(provider, attemptId, auth.logout, this.options.statusTimeoutMs ?? 20_000);
    } catch (error) { console.error(`doan: ${provider} sign-in cleanup failed`, message(error)); }
  }
  // The replaced profile's login (still valid until now) is logged out, which revokes it, and the directory goes
  // with it.
  private async retire(provider: Provider, attemptId: string, profile: string): Promise<void> { await this.cleanProfile(provider, attemptId, profile); }
  // A profile no stored connection owns goes, with its cleanup record, only after its logout succeeded; otherwise both
  // stay so a later start can retry instead of leaving a keychain item no directory leads to.
  private async cleanProfile(provider: Provider, attemptId: string, profile: string): Promise<boolean> {
    const auth = this.adapters[provider], storage = this.options.storage;
    try {
      const profileDir = storage.profileDir(provider, profile);
      for (const rel of auth.plaintext) rmSync(join(profileDir, rel), { force: true });
      if (auth.logout) {
        const logout = await this.exec(provider, attemptId, auth.logout, this.options.statusTimeoutMs ?? 20_000, profile);
        if (logout.code !== 0) throw new Error(`logout exited ${logout.code}: ${tail(logout.stderr) ?? ""}`);
      }
      storage.removeProfile(provider, profile);
      storage.clearCleanup(profile);
      return true;
    } catch (error) { console.error(`doan: ${provider} profile ${profile} could not be cleaned up`, message(error)); return false; }
  }
  // Cleanups a previous run left: one at a time in the write slot, so no sign-in shares a profile being logged out.
  // A busy slot leaves the rest for the next start.
  private async sweep(records: CleanupRecord[]): Promise<void> {
    for (const record of records) {
      if (this.closed || this.writer) return;
      // Only a stored connection makes a profile live; a signed-out provider's own name is just another leftover.
      if (record.profile === this.state(record.provider).connection?.profile) continue;
      const id = this.newId();
      this.writer = id;
      try { await this.cleanProfile(record.provider, id, record.profile); } finally { if (this.writer === id) this.writer = null; }
    }
  }

  private async signOutFlow(provider: Provider, attemptId: string): Promise<void> {
    const auth = this.adapters[provider], storage = this.options.storage;
    // Before the provider logout: Codex keeps MCP tokens in keychain entries its logout does not clear (P1).
    const connection = this.state(provider).connection;
    if (connection) await this.mcpStep(provider, attemptId, connection.profile, { kind: "signOut", previousAccountId: connection.account.id, nextAccountId: null, staging: null });
    // The server's own logout clears its stored token (logout.py, 1.3.0; no remote revocation is documented). doan's
    // copy goes either way, and only the fresh status below decides the result.
    if (auth.acpAuth && auth.vault) await this.acpLogout(provider, attemptId);
    if (auth.vault) { storage.removeVault(provider); storage.scrub(provider, auth.vault); }
    else if (auth.logout) {
      const logout = await this.exec(provider, attemptId, auth.logout, this.options.statusTimeoutMs ?? 20_000);
      if (logout.code !== 0) throw new Error(`logout exited ${logout.code}: ${tail(logout.stderr) ?? ""}`);
    }
    const profileDir = storage.profileDir(provider, this.profileOf(provider));
    for (const rel of auth.plaintext) rmSync(join(profileDir, rel), { force: true });
    // A deleted file proves nothing until a fresh provider process reports the profile signed out.
    const checked = await this.statusRun(provider, attemptId);
    if (checked.status !== "disconnected" && checked.status !== "expired") throw new Error(`profile still reports ${checked.status}`);
    storage.writeMetadata(replaceAccount(storage.readMetadata(), provider, null, false));
  }

  private async stopMcp(provider: Provider): Promise<void> {
    if (!this.options.stopMcp) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = this.options.stopMcp(provider).catch(error => console.error(`doan: ${provider} MCP work could not be stopped`, message(error)));
    await Promise.race([stopped, new Promise(resolve => { timer = setTimeout(resolve, this.options.drainTimeoutMs ?? DRAIN_MS); timer.unref?.(); })]);
    clearTimeout(timer);
  }

  private async mcpStep(provider: Provider, attemptId: string, profile: string, request: Omit<McpLogoutRequest, "run" | "profileDir">): Promise<void> {
    if (!this.options.mcpLogout) return;
    const run = (args: string[]) => this.exec(provider, attemptId, args, this.options.statusTimeoutMs ?? 20_000, profile);
    try { await this.options.mcpLogout(provider, { ...request, profileDir: this.options.storage.profileDir(provider, profile), run }); }
    catch (error) { console.error(`doan: ${provider} MCP logout step failed`, message(error)); }
  }

  // The runs were asked to stop; each lease goes only when its process group is gone and its write-back landed. The
  // lease count, not stopRuns settling, ends the wait, so a close that never settles still meets the deadline.
  private async drain(provider: Provider, attemptId: string): Promise<boolean> {
    const deadline = Date.now() + (this.options.drainTimeoutMs ?? DRAIN_MS);
    if (this.leased(provider)) {
      void (async () => { await this.options.stopRuns?.(provider); })().catch(error => console.error(`doan: ${provider} runs could not be stopped`, message(error)));
    }
    while (this.leased(provider)) {
      if (this.stopRequests.has(attemptId) || Date.now() >= deadline) return false;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return true;
  }

  private async statusRun(provider: Provider, attemptId: string, profile = this.profileOf(provider)): Promise<CheckResult> {
    const run = this.adapters[provider].acpAuth ? await this.acpStatus(provider, attemptId) : await this.exec(provider, attemptId, this.adapters[provider].status, this.options.statusTimeoutMs ?? 20_000, profile);
    return this.adapters[provider].parseStatus({ ...run, profileDir: this.options.storage.profileDir(provider, profile) });
  }

  private async acpSignIn(provider: Provider, attemptId: string, owner: number): Promise<void> {
    const method = this.adapters[provider].acpAuth!.method;
    try {
      await this.acpExec(provider, attemptId, null, link => {
        if (this.stopRequests.has(attemptId) || this.cancelled(provider, attemptId) || this.links.get(attemptId)?.url === link.url) return false;
        this.links.set(attemptId, link); this.options.onPrompt?.({ provider, attemptId, owner, url: link.url });
        return false;
      }, "authenticate", { methodId: method });
    } catch (error) {
      if (error instanceof Cancelled || this.cancelled(provider, attemptId)) throw new Cancelled();
      if (error instanceof Failure) throw error;
      console.error(`doan: ${provider} sign-in failed: ${exchangeReason(error)}${serverLog(error)}`);
      throw new Failure("sign_in_failed", message(error));
    }
  }
  // authenticate with a stored token returns at once (refreshing it if needed); without a usable one the server starts
  // a new browser sign-in instead, which this check stops and reports as signed out (exit 2).
  private async acpStatus(provider: Provider, attemptId: string): Promise<Run> {
    let asked = false;
    try {
      await this.acpExec(provider, attemptId, this.options.statusTimeoutMs ?? 20_000, () => { asked = true; return true; },
        "authenticate", { methodId: this.adapters[provider].acpAuth!.method });
      return { code: 0, stdout: "", stderr: "" };
    } catch (error) {
      if (error instanceof Cancelled || error instanceof Failure) throw error;
      console.error(`doan: ${provider} status check ${asked ? "found no usable login: the server asked for a new browser sign-in" : `failed: ${exchangeReason(error)}`}${serverLog(error)}`);
      return { code: asked ? 2 : 1, stdout: "", stderr: message(error) };
    }
  }
  private async acpLogout(provider: Provider, attemptId: string): Promise<void> {
    await this.hold(provider);
    try {
      await this.acpExec(provider, attemptId, this.options.statusTimeoutMs ?? 20_000, () => true, "logout", {});
    } catch (error) { console.error(`doan: ${provider} server logout failed; removing Doan's copy: ${exchangeReason(error)}${serverLog(error)}`); }
    // In the queue like every hold and drop, but not drop(): absorbing the logged-out copy would write it back to the
    // vault, and signOutFlow removes both right after.
    finally { await this.serial(provider, async () => { this.holds.set(provider, Math.max(0, (this.holds.get(provider) ?? 1) - 1)); }); }
  }
  private async acpOpen(provider: Provider, acp: AcpConnection): Promise<void> {
    const expected = this.adapters[provider].acpAuth!;
    const init = await acp.request("initialize", { protocolVersion: ACP_PROTOCOL_VERSION, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: "doan", version: "0.1.0" } }, ACP_OPEN_MS);
    const info = object(init) && object(init.agentInfo) ? init.agentInfo : {};
    const methods = object(init) && Array.isArray(init.authMethods) ? init.authMethods.filter(object).map(m => m.id) : [];
    if (!object(init) || init.protocolVersion !== ACP_PROTOCOL_VERSION || info.name !== expected.agent || info.version !== expected.version || !methods.includes(expected.method)) {
      throw new UnexpectedServer(`unexpected ACP server ${String(info.name)} ${String(info.version)}`);
    }
  }
  // One ACP exchange with the provider's server, after its checked initialize; resolves or rejects only after its
  // process group is gone. onLink sees each sign-in link the server asks the browser to open and returns true to stop
  // the server. timeoutMs starts at the initialize answer: under heavy load the 278 MB server alone took about 30 s to
  // start, which a status check right after an approved sign-in must not count (ACP_OPEN_MS bounds the start).
  private async acpExec(provider: Provider, attemptId: string, timeoutMs: number | null, onLink: (link: SignInLink) => boolean, method: string, params: unknown): Promise<unknown> {
    const { command, env, profileDir } = await this.launch(provider, attemptId);
    if (this.stopRequests.has(attemptId)) throw new Cancelled();
    const child = this.options.spawn(command, this.adapters[provider].args, { cwd: profileDir, env, input: true });
    const owned = this.processes.get(attemptId) ?? new Set();
    owned.add(child); this.processes.set(attemptId, owned);
    if (this.stopRequests.has(attemptId)) child.stop();
    let failure = "", protocol = "", stage = "initialize", stopped = false, exited = false, exitCode: number | null = null;
    // protocol details are acp.ts's own fixed sentences, never server text.
    const acp = new AcpConnection(line => { if (!child.write) throw new Error("process_exited"); child.write(line); },
      (_params, id) => acp.respond(id, { outcome: { outcome: "cancelled" } }), () => {}, detail => { failure = protocol = detail; child.stop(); });
    void child.exit.then(code => { exited = true; exitCode = code; });
    let errors = "", withheld = 0;
    const events: string[] = [];
    child.onOutput((text, stream) => {
      if (stream !== "stderr") { acp.receive(text); return; }
      errors = (errors + text).slice(-OUTPUT_LIMIT);
      let end: number;
      while ((end = errors.indexOf("\n")) >= 0) {
        const line = errors.slice(0, end); errors = errors.slice(end + 1);
        const event = serverEvent(line);
        if (event) { events.push(event); if (events.length > SERVER_EVENTS) events.shift(); } else if (line.trim()) withheld += 1;
        const link = signInLink(line);
        if (link && onLink(link)) child.stop();
      }
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const exchange = async () => {
      await this.acpOpen(provider, acp);
      stage = method;
      if (timeoutMs !== null) timer = setTimeout(() => { stopped = true; failure ||= `the server was stopped after ${timeoutMs} ms without an answer`; child.stop(); }, timeoutMs);
      return acp.request(method, params, null);
    };
    const reason = (error: unknown) => {
      if (stopped) return `the server was stopped after ${timeoutMs} ms without an answer`;
      if (protocol) return `the server broke the ACP protocol (${protocol})`;
      if (error instanceof UnexpectedServer) { const expected = this.adapters[provider].acpAuth!; return `the server is not ${expected.agent} ${expected.version}`; }
      if (error instanceof AcpError && typeof error.code === "number") return `the server refused ${stage} (code ${Number.isSafeInteger(error.code) ? error.code : "not an integer"})`;
      if (error instanceof AcpError && error.message === `${stage} timed out`) return `the server did not answer ${stage} within ${ACP_OPEN_MS} ms`;
      if (exited) return `the server exited (code ${exitCode})`;
      return "the exchange failed";
    };
    let result: unknown;
    try { result = await Promise.race([exchange(), child.exit.then(() => { throw new Error(failure || "the ACP server exited"); })]); }
    catch (error) { if (this.stopRequests.has(attemptId)) throw new Cancelled(); throw new ServerError(message(error), reason(error), [...events], withheld); }
    finally {
      clearTimeout(timer); acp.close(); child.stop(); await child.gone;
      owned.delete(child); if (!owned.size) this.processes.delete(attemptId);
    }
    if (this.stopRequests.has(attemptId)) throw new Cancelled();
    return result;
  }

  // Never throws and never changes the result it adds to: every failure is "no email", logged in Doan's words only.
  // The budget and the attempt's stop share one abort, so a cancel, replacement or quit ends the lookup at once.
  private async lookup(provider: Provider, attemptId: string, profile: string, source?: TokenSource): Promise<Found> {
    const controller = new AbortController();
    this.lookups.set(attemptId, controller);
    if (this.stopRequests.has(attemptId)) controller.abort();
    let late = false, timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => { timer ??= setTimeout(() => { late = true; controller.abort(); }, IDENTITY_MS); };
    try {
      const codex = this.adapters[provider].identity === "codex-app-server";
      if (!codex) arm();
      const email = codex ? await this.codexEmail(provider, attemptId, profile, controller.signal, arm) : await this.googleLookup(provider, source, controller.signal);
      if (email) return { email };
      throw new LookupFailure("the answer had no account email");
    } catch (error) {
      if (!this.stopRequests.has(attemptId)) {
        console.error(`doan: ${provider} account lookup failed: ${late ? `no answer within ${IDENTITY_MS} ms` : error instanceof LookupFailure ? error.message : "the request could not be completed"}`);
      }
      return null;
    } finally { clearTimeout(timer); if (this.lookups.get(attemptId) === controller) this.lookups.delete(attemptId); }
  }
  // account/read from a short app-server in the profile, with a Codex conversation's store and handshake. The
  // dispatcher is the conversation runner's: AcpConnection refuses Codex messages, which carry no jsonrpc field.
  // arm starts the budget once the CLI is located: the login-shell probe is the status run's cost as well, not the lookup's.
  private async codexEmail(provider: Provider, attemptId: string, profile: string, signal: AbortSignal, arm: () => void): Promise<string | undefined> {
    let child: AuthProcess;
    try {
      const { command, env, profileDir } = await this.launch(provider, attemptId, {}, profile);
      if (signal.aborted) throw new Cancelled();
      arm();
      child = this.options.spawn(command, [...this.adapters[provider].args, "app-server"], { cwd: profileDir, env, input: true });
    } catch (error) { throw error instanceof Cancelled ? error : new LookupFailure("the app-server could not be started"); }
    const owned = this.processes.get(attemptId) ?? new Set();
    owned.add(child); this.processes.set(attemptId, owned);
    const stop = () => child.stop();
    if (signal.aborted) stop(); else signal.addEventListener("abort", stop, { once: true });
    let broken = false, buffer = "", stage = "initialize";
    const send = (value: unknown) => { if (!child.write) throw new Error("process_exited"); child.write(JSON.stringify(value) + "\n"); };
    const dispatcher = new CodexDispatcher(send, () => {}, () => { broken = true; child.stop(); });
    child.onOutput((text, stream) => {
      if (stream === "stderr" || broken) return;
      buffer += text;
      if (buffer.length > OUTPUT_LIMIT) { broken = true; child.stop(); return; }
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        let raw: unknown;
        // A throw here would escape the output listener into main.
        try { raw = JSON.parse(line); dispatcher.receive(raw); } catch { broken = true; child.stop(); return; }
      }
    });
    const exchange = async () => {
      await dispatcher.request("initialize", { clientInfo: { name: "doan", version: "0.1.0" }, capabilities: { experimentalApi: true } });
      send({ method: "initialized" });
      stage = "account/read";
      return codexAccountEmail(await dispatcher.request("account/read", { refreshToken: false }));
    };
    try { return await Promise.race([exchange(), child.exit.then(() => { throw new Error("process_exited"); })]); }
    catch (error) { throw new LookupFailure(broken ? "the app-server broke the protocol" : error instanceof RpcError ? `the app-server refused ${stage}` : "the app-server exited"); }
    finally {
      signal.removeEventListener("abort", stop); dispatcher.close(); child.stop(); await child.gone;
      owned.delete(child); if (!owned.size) this.processes.delete(attemptId);
    }
  }
  // The stored token file of the Antigravity server (the vault's only file), read without following links.
  private tokenFile(provider: Provider, profile: string): TokenSource {
    const rel = this.adapters[provider].vault?.[0];
    let bytes: Buffer | null;
    try { bytes = rel ? this.options.storage.readWorking(provider, rel, profile) : null; } catch { return { failure: "the token file could not be read" }; }
    if (!bytes) return { failure: "the token file is missing" };
    let file: unknown;
    // A parse error quotes its input, which is a credential.
    try { file = JSON.parse(bytes.toString("utf8")); } catch { return { failure: "the token file is not JSON" }; }
    const request = googleRefreshRequest(file);
    return request ? { request } : { failure: "the token file is not one Doan sends" };
  }
  // A refresh grant with the server's own client, then userinfo. The access token lives in this call only, and a
  // returned refresh token is never written: Doan does not change the server's credential file.
  private async googleLookup(provider: Provider, source: TokenSource | undefined, signal: AbortSignal): Promise<string | undefined> {
    if (!source || "failure" in source) throw new LookupFailure(source?.failure ?? "no token file was read");
    const { request } = source;
    const fetch = this.options.fetch ?? globalThis.fetch;
    // No redirects: the client secret and the bearer token go to these exact addresses only.
    const granted = await fetch(request.url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: request.body, signal, redirect: "error" });
    const reply = await replyJson(granted);
    const { token, refreshTokenReturned } = googleAccessToken(reply);
    if (refreshTokenReturned) console.warn(`doan: ${provider} account lookup: Google returned a refresh token; Doan ignored it`);
    if (!granted.ok || !token) throw new LookupFailure(`the token request answered ${granted.status}${googleError(reply)}`);
    const info = await fetch(GOOGLE_USERINFO_URL, { headers: { authorization: `Bearer ${token}` }, signal, redirect: "error" });
    if (!info.ok) throw new LookupFailure(`userinfo answered ${info.status}${googleError(await replyJson(info))}`);
    return googleEmail(await replyJson(info));
  }

  private async launch(provider: Provider, attemptId?: string, added: Record<string, string> = {}, profile = this.profileOf(provider)): Promise<{ command: string; env: Record<string, string>; profileDir: string }> {
    const locating = new AbortController();
    if (attemptId) { this.locating.set(attemptId, locating); if (this.stopRequests.has(attemptId)) locating.abort(); }
    let located: Awaited<ReturnType<AuthManagerOptions["locate"]>>;
    try { located = await this.options.locate(provider, locating.signal); }
    catch (error) {
      if (locating.signal.aborted) throw new Cancelled();
      throw message(error) === INSTALL_FAILED ? new Failure("cli_install_failed") : error;
    } finally { if (attemptId && this.locating.get(attemptId) === locating) this.locating.delete(attemptId); }
    if (!located) throw new Error("cli_missing");
    const profileDir = this.options.storage.profileDir(provider, profile);
    for (const [rel, text] of Object.entries(this.adapters[provider].settings)) this.options.storage.writeSetting(provider, rel, text, profile);
    return { command: located.command, env: this.childEnv(provider, located.path, profileDir, added), profileDir };
  }
  private childEnv(provider: Provider, path: string, profileDir: string, added: Record<string, string>): Record<string, string> {
    let extra = { ...this.adapters[provider].env, ...added };
    if (this.adapters[provider].acpAuth || this.adapters[provider].hookLink) {
      // Every process of a browser sign-in server gets the hook, so neither a check nor an expired run can open a
      // browser itself. Without a usable hook the CLI would open the default browser, so nothing starts.
      const hook = this.options.storage.ownedScript(BROWSER_HOOK.name, BROWSER_HOOK.script);
      if (hook.includes(":")) throw new Error("browser_hook_unusable");
      extra = { ...extra, BROWSER: hook };
    }
    const env = providerEnv({ provider, inherited: this.options.inherited, path, profileDir, appRuntime: this.options.appRuntime, extra });
    if (!env.ok) throw new Error(env.code);
    return env.env;
  }

  // A provider command in a directory Doan owns outside the profiles: a pending MCP logout's temporary CODEX_HOME,
  // whose keychain entry is keyed by server name and URL only, so it runs whether or not the provider is signed in.
  // Same located CLI and child environment allowlist as every provider process; no lease and no profile is touched.
  async environment(provider: Provider, profileDir: string): Promise<{ command: string; env: Record<string, string> }> {
    if (this.closed) throw new Error("busy");
    const located = await this.options.locate(provider);
    if (!located) throw new Error("cli_missing");
    return { command: located.command, env: this.childEnv(provider, located.path, profileDir, {}) };
  }

  // Resolves only after the process group is gone, so no result outruns its process.
  private async exec(provider: Provider, attemptId: string, args: string[], timeoutMs: number | null, profile = this.profileOf(provider), onText?: (text: string) => void, added?: Record<string, string>): Promise<Run> {
    const { command, env, profileDir } = await this.launch(provider, attemptId, added, profile);
    // A cancel, window close or quit can arrive while the CLI is located, before there is a process to stop.
    if (this.stopRequests.has(attemptId)) throw new Cancelled();
    const child = this.options.spawn(command, [...this.adapters[provider].args, ...args], { cwd: profileDir, env });
    const owned = this.processes.get(attemptId) ?? new Set();
    owned.add(child); this.processes.set(attemptId, owned);
    if (this.stopRequests.has(attemptId)) child.stop();
    let stdout = "", stderr = "", timer: ReturnType<typeof setTimeout> | undefined;
    child.onOutput((text, stream) => {
      if (stream === "stderr") { if (stderr.length < OUTPUT_LIMIT) stderr += text; } else if (stdout.length < OUTPUT_LIMIT) stdout += text;
      onText?.(text);
    });
    if (timeoutMs !== null) timer = setTimeout(() => child.stop(), timeoutMs);
    try {
      const code = await child.exit;
      await child.gone;
      return { code, stdout, stderr };
    } finally {
      clearTimeout(timer); owned.delete(child);
      if (!owned.size) this.processes.delete(attemptId);
    }
  }

  private replaceCheck(provider: Provider): Promise<unknown> {
    const check = this.checks.get(provider);
    if (!check) return Promise.resolve();
    this.checks.delete(provider); this.stop(check.attemptId);
    return check.done.catch(() => {});
  }
  // Holds and drops of one provider run in order, so a second holder never sees a half-written working copy.
  private serial<T>(provider: Provider, step: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(provider) ?? Promise.resolve()).then(step);
    this.queues.set(provider, next.then(() => {}, () => {}));
    return next;
  }
  private hold(provider: Provider): Promise<void> {
    return this.serial(provider, async () => {
      const count = this.holds.get(provider) ?? 0, auth = this.adapters[provider];
      if (count === 0 && auth.vault && this.state(provider).connection) await this.options.storage.materialize(provider, auth.vault);
      this.holds.set(provider, count + 1);
    });
  }
  // The last holder writes the provider's refreshed copy back before the plaintext goes away. Resolves to the
  // write-back failure, if any: the plaintext is still removed, so the refresh is lost and the vault may be stale.
  private drop(provider: Provider): Promise<string | null> {
    return this.serial(provider, async () => {
      const count = (this.holds.get(provider) ?? 1) - 1, auth = this.adapters[provider];
      this.holds.set(provider, count);
      if (count > 0 || !auth.vault) return null;
      let lost: string | null = null;
      try { if (this.state(provider).connection) await this.options.storage.absorb(provider, auth.vault); }
      catch (error) { lost = message(error); console.error(`doan: ${provider} refresh could not be stored`, lost); }
      try { this.options.storage.scrub(provider, auth.vault); }
      catch (error) { console.error(`doan: ${provider} working credential could not be removed`, message(error)); }
      return lost;
    });
  }
  private lost(provider: Provider, detail: string | null): void { if (detail !== null) this.apply(provider, { type: "writeBackFailed", detail }); }
  private async recover(provider: Provider, connected: boolean): Promise<void> {
    const auth = this.adapters[provider], storage = this.options.storage;
    try {
      if (!auth.vault) { const dir = storage.profileDir(provider, this.profileOf(provider)); for (const rel of auth.plaintext) rmSync(join(dir, rel), { force: true }); return; }
      // A crash can leave a refreshed working copy; keep it only in encrypted form.
      // Only a working file is a copy to keep: a lone temporary sibling is an interrupted write, and absorbing
      // it would read the missing file as a sign-out and empty the vault.
      if (connected && storage.hasWorkingCopy(provider, auth.vault)) {
        try { await storage.absorb(provider, auth.vault); } catch (error) { console.error(`doan: ${provider} leftover credential could not be stored`, message(error)); }
      }
      storage.scrub(provider, auth.vault);
      if (!connected) storage.removeVault(provider);
    } catch (error) { console.error(`doan: ${provider} credential recovery failed`, message(error)); }
  }
  private async storageStep(step: () => unknown): Promise<void> {
    try { await step(); } catch (error) { throw new Failure("storage_failed", message(error)); }
  }
  // The stored connection's profile; a provider without one signs in to its own.
  private profileOf(provider: Provider): string { return this.state(provider).connection?.profile ?? provider; }
  // running: conversation runs, which need the person's stop. leased: every lease, model list reads included.
  private running(provider: Provider): boolean { return (this.conversations.get(provider) ?? 0) > 0; }
  private leased(provider: Provider): boolean { return (this.runs.get(provider) ?? 0) > 0; }
  private cancelled(provider: Provider, attemptId: string): boolean {
    const attempt = this.state(provider).attempt;
    return !attempt || attempt.id !== attemptId || attempt.cancelled;
  }
  private stop(attemptId: string): void {
    this.stopRequests.add(attemptId);
    this.locating.get(attemptId)?.abort();
    this.lookups.get(attemptId)?.abort();
    for (const child of this.processes.get(attemptId) ?? []) child.stop();
  }
  private track<T>(work: Promise<T>): Promise<T> {
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work)).catch(() => {});
    return work;
  }
  private refuse(provider: Provider, reason: AuthRejection): Started { return { ok: false, reason, state: this.state(provider) }; }
  private apply(provider: Provider, event: AuthEvent): AuthTransition {
    const result = transition(this.state(provider), event);
    if (result.ok && result.outcome === "applied") {
      this.states.set(provider, result.state); this.revision += 1;
      // A settling replacement is announced once its MCP step ended (signIn), not before.
      if (!this.settlings.has(provider)) this.options.onChange?.(result.state, this.revision);
    }
    return result;
  }
}

// The hook leaves each link on its own line in a file only this login is given; polling it needs nothing from the CLI.
// The MCP connector sign-in uses it too (mcpConnectors/service.ts).
export function hookLinks(onLink: (raw: string) => void): { env: Record<string, string>; close(): void } {
  const dir = mkdtempSync(join(tmpdir(), LINK_DIR_PREFIX)), file = join(dir, "links");
  let read = 0;
  const timer = setInterval(() => {
    let text: string;
    try { text = readFileSync(file, "utf8"); } catch { return; }
    const end = text.lastIndexOf("\n");
    if (end < read) return;
    for (const line of text.slice(read, end).split("\n")) if (line) onLink(line);
    read = end + 1;
  }, LINK_POLL_MS);
  timer.unref?.();
  return { env: { [AUTH_LINK_FILE]: file }, close: () => { clearInterval(timer); rmSync(dir, { recursive: true, force: true }); } };
}

// Query values (state, challenge) stay out of the log; the host, path and parameter names are what show a changed CLI.
function describeLink(raw: string): string {
  if (!URL.canParse(raw)) return "(not a URL)";
  const url = new URL(raw), redirect = URL.canParse(url.searchParams.get("redirect_uri") ?? "") ? new URL(url.searchParams.get("redirect_uri")!) : null;
  return `${url.origin}${url.pathname} params=[${[...url.searchParams.keys()].join(",")}]${redirect ? ` redirect=${redirect.origin}${redirect.pathname}` : ""}`;
}

// An app crash skips hookLinks' close(). lstat and rmSync never follow a link, and a younger directory may belong to a
// sign-in another doan instance is running.
export function removeStaleLinkDirs(tmp = tmpdir(), uid = process.getuid?.()): void {
  try {
    for (const entry of readdirSync(tmp, { withFileTypes: true })) {
      if (!entry.name.startsWith(LINK_DIR_PREFIX) || !entry.isDirectory()) continue;
      const path = join(tmp, entry.name);
      try {
        const info = lstatSync(path);
        if (info.isDirectory() && info.uid === uid && Date.now() - info.mtimeMs > STALE_LINK_DIR_MS) rmSync(path, { recursive: true, force: true });
      } catch (error) { console.error("doan: a leftover sign-in link directory could not be removed", message(error)); }
    }
  } catch (error) { console.error("doan: leftover sign-in link directories could not be listed", message(error)); }
}

const replyJson = async (reply: Response): Promise<unknown> => { try { return await reply.json(); } catch { return null; } };
// Google's OAuth error code only (invalid_grant, invalid_token); its description and the rest of the body stay out.
const googleError = (reply: unknown) => object(reply) && typeof reply.error === "string" && /^[a-z_]{1,64}$/.test(reply.error) ? ` (${reply.error})` : "";

// A committed replacement still running its MCP step admits nothing; readers see it busy until then.
export function settlingStatus(status: AuthStatusDto, settling: boolean): AuthStatusDto {
  return settling ? { ...status, readiness: { ready: false, cause: "busy", action: "wait" } } : status;
}

// Other providers' connections and failed sign-outs are kept as they are.
function replaceAccount(metadata: AuthMetadata, provider: Provider, connection: AccountConnection | null, signOutFailed: boolean): AuthMetadata {
  const failed = (metadata.signOutFailed ?? []).filter(p => p !== provider).concat(signOutFailed ? [provider] : []);
  return { v: 1, accounts: [...metadata.accounts.filter(a => a.provider !== provider), ...(connection ? [connection] : [])], ...(failed.length ? { signOutFailed: failed } : {}) };
}

export const spawnAuthProcess: Spawn = (command, args, { cwd, env, input }) => {
  const child = spawn(command, args, { cwd, env, detached: true, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
  // A login that exits first closes the pipe; a late write must not crash main.
  child.stdin?.on("error", () => {});
  let release!: () => void;
  const gone = new Promise<void>(resolve => { release = resolve; });
  const group = child.pid ? new OwnedGroup(child.pid, undefined, undefined, release) : null;
  const exit = new Promise<number | null>(resolve => {
    child.once("error", () => { resolve(null); if (group) group.childExited(); else release(); });
    child.once("exit", code => {
      resolve(code); group?.childExited();
      // A helper the CLI left in its group belongs to this attempt; it must not outlive it.
      setTimeout(() => void group?.stop(), 2000).unref();
    });
  });
  // Both are pipes in every stdio configuration above.
  const stdout = child.stdout!, stderr = child.stderr!;
  stdout.setEncoding("utf8"); stderr.setEncoding("utf8");
  return {
    onOutput: listener => { stdout.on("data", (text: string) => listener(text)); stderr.on("data", (text: string) => listener(text, "stderr")); },
    exit, gone, stop: () => { void group?.stop(); },
    ...(child.stdin ? { write: (text: string) => { if (child.stdin?.writable) child.stdin.write(text); } } : {}),
  };
};

// Same discovery as conversation preparation: the login shell's PATH, not the app's launch environment. A managed
// provider (Antigravity's downloaded server) resolves its executable itself and still runs with that PATH.
export function shellLocator(inherited: NodeJS.ProcessEnv, adapters: Record<Provider, ProviderAuth> = PROVIDER_AUTH, managed: Partial<Record<Provider, (signal?: AbortSignal) => Promise<string>>> = {}): AuthManagerOptions["locate"] {
  return async (provider, signal) => {
    const probe = await probeShell(inherited);
    if (!probe.ok) return null;
    const install = managed[provider];
    if (install) return { command: await install(signal), path: probe.path };
    const command = findOnPath(probe.path, adapters[provider].command, path => { try { accessSync(path, constants.X_OK); return statSync(path).isFile(); } catch { return false; } });
    return command ? { command, path: probe.path } : null;
  };
}
