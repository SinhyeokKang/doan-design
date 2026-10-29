import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACP_PROTOCOL_VERSION, AcpConnection } from "../conversation/acp";
import { OwnedGroup } from "../conversation/process";
import { object } from "../conversation/sessions";
import { AUTH_LINK_FILE, BROWSER_HOOK, callbackAddress, INSTALL_FAILED, forwardCallback, signInLink, type SignInLink } from "./antigravity";
import { probeShell } from "../onboarding/machine";
import { findOnPath } from "../onboarding/states";
import { providerEnv } from "./environment";
import { PROVIDER_AUTH, type ProviderAuth } from "./providers";
import { authStatus, checkVerdict, initialAuthState, transition } from "./state";
import type { AuthStorage } from "./storage";
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
export interface AuthManagerOptions {
  storage: AuthStorage; spawn: Spawn; inherited: Record<string, string | undefined>; appRuntime: string;
  // signal aborts when the attempt is stopped; Antigravity's locate may be a long server download.
  locate(provider: Provider, signal?: AbortSignal): Promise<{ command: string; path: string } | null>;
  adapters?: Record<Provider, ProviderAuth>; newId?: () => string; statusTimeoutMs?: number; hookLinkTimeoutMs?: number;
  onChange?(state: AuthState, revision: number): void; onPrompt?(prompt: AuthPrompt): void;
  // Closes the provider's doan-account conversation runs for a sign-out or replacement the user chose to stop them for.
  stopRuns?(provider: Provider): Promise<void>; drainTimeoutMs?: number;
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
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const tail = (text: string) => text.trim().slice(-2000) || undefined;
class Cancelled extends Error {}
class Failure extends Error { constructor(readonly code: "sign_in_failed" | "storage_failed" | "cli_install_failed", detail?: string) { super(detail ?? code); } }

export class AuthManager {
  private states = new Map<Provider, AuthState>();
  private revision = 0;
  // One sign-in or sign-out write across all providers at a time.
  private writer: string | null = null;
  private processes = new Map<string, Set<AuthProcess>>();
  // Stop requests outlive process registration: exec honours one that arrived before its spawn.
  private stopRequests = new Set<string>();
  private locating = new Map<string, AbortController>();
  private checks = new Map<Provider, { attemptId: string; done: Promise<unknown> }>();
  private holds = new Map<Provider, number>();
  private runs = new Map<Provider, number>();
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
  }
  state(provider: Provider): AuthState { return this.states.get(provider)!; }
  status(provider: Provider, facts: ToolFacts): AuthStatusDto { return authStatus(this.state(provider), facts, this.revision); }

  async check(provider: Provider): Promise<CheckStarted> {
    const attemptId = this.newId();
    const result = this.closed ? this.refuse(provider, "busy") : this.apply(provider, { type: "check", attemptId });
    if (!result.ok) return result;
    let outcome: CheckOutcome = "replaced";
    const done = this.track((async () => {
      let checked: CheckResult, lost: string | null = null;
      try {
        await this.hold(provider);
        try { checked = await this.statusRun(provider, attemptId); } finally { lost = await this.drop(provider); }
      } catch (error) { checked = { status: "failed", code: error instanceof Failure && error.code === "cli_install_failed" ? error.code : "check_failed", detail: message(error) }; }
      try {
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
        if (options.stop && !await this.drain(provider, attemptId)) {
          // Nothing was touched: the previous login stays as it was, still used by the run that did not stop.
          this.apply(provider, this.cancelled(provider, attemptId) ? { type: "settled", attemptId, kept: true }
            : { type: "signedIn", attemptId, result: { status: "failed", code: "sign_in_failed", detail: "running conversations did not stop" }, kept: true });
          return this.state(provider);
        }
        const hadConnection = this.state(provider).connection !== null;
        const touch = { live: false };
        let outcome: SignInResult | null;
        try { outcome = { status: "stored", connection: await this.signInFlow(provider, attemptId, owner, touch) }; }
        catch (error) {
          await this.discard(provider, attemptId, hadConnection);
          outcome = error instanceof Cancelled || this.cancelled(provider, attemptId) ? null
            : { status: "failed", code: error instanceof Failure ? error.code : "sign_in_failed", detail: message(error) };
        }
        this.apply(provider, outcome ? { type: "signedIn", attemptId, result: outcome, kept: !touch.live } : { type: "settled", attemptId, kept: !touch.live });
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
    const read = this.adapters[provider].parseStatus({ code: 0, stdout: "", stderr: "", profileDir: this.options.storage.profileDir(provider) });
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
        let removed: { status: "removed" } | { status: "failed"; detail?: string };
        try {
          if (options.stop && !await this.drain(provider, attemptId)) throw new Error("running conversations did not stop");
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

  async acquire(provider: Provider): Promise<Lease> {
    this.admit(provider);
    const { command, env, profileDir } = await this.launch(provider);
    // A sign-in or sign-out may have started while the CLI was being located.
    this.admit(provider);
    this.runs.set(provider, (this.runs.get(provider) ?? 0) + 1);
    try { await this.hold(provider); } catch (error) { this.runs.set(provider, (this.runs.get(provider) ?? 1) - 1); throw error; }
    let released = false;
    return { command, env, profileDir, release: async () => {
      if (released) return;
      released = true;
      // The run counts until its write-back lands, so a sign-out cannot delete a vault the write-back recreates.
      try { this.lost(provider, await this.drop(provider)); } finally { this.runs.set(provider, (this.runs.get(provider) ?? 1) - 1); }
    } };
  }

  private admit(provider: Provider): void {
    const state = this.state(provider);
    const refusal = this.closed || (state.attempt && state.attempt.kind !== "check") ? "busy"
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
  private async signInFlow(provider: Provider, attemptId: string, owner: number, touch: { live: boolean }): Promise<AccountConnection> {
    const auth = this.adapters[provider];
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
      if (auth.loginClears) touch.live = true;
      try {
        login = await this.exec(provider, attemptId, auth.login, null, text => {
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
      if (!auth.vault && login.code === 0) touch.live = true;
      if (this.cancelled(provider, attemptId)) throw new Cancelled();
      if (missing) throw new Failure("sign_in_failed", "no browser-hook link was accepted");
      if (login.code !== 0) throw new Failure("sign_in_failed", tail(login.stderr) ?? tail(login.stdout));
    }
    if (this.cancelled(provider, attemptId)) throw new Cancelled();
    const checked = await this.statusRun(provider, attemptId);
    if (this.cancelled(provider, attemptId)) throw new Cancelled();
    if (checked.status !== "connected") throw new Failure("sign_in_failed", `status after login: ${checked.status}`);
    const profileDir = this.options.storage.profileDir(provider), storage = this.options.storage;
    let sealed: Buffer | null = null;
    if (auth.vault) await this.storageStep(async () => { sealed = await storage.seal(provider, auth.vault!); });
    else if (auth.plaintext.some(rel => existsSync(join(profileDir, rel)))) throw new Failure("storage_failed", "provider wrote a plaintext credential file");
    const connection: AccountConnection = { provider, connectionId: this.newId(), profile: provider, account: checked.account };
    // Last cancellation point: from the vault and metadata writes to the signedIn transition only microtasks run, so
    // no cancel or window-close event can land between a persisted connection and its state.
    if (this.cancelled(provider, attemptId)) throw new Cancelled();
    await this.storageStep(() => {
      const previous = sealed && storage.sealedVault(provider);
      if (sealed) storage.storeSealed(provider, sealed);
      try { storage.writeMetadata(replaceAccount(storage.readMetadata(), provider, connection, false)); }
      catch (error) {
        // The stored connection must keep the credential it was verified with.
        if (sealed) { try { storage.storeSealed(provider, previous); } catch (restore) { touch.live = true; console.error(`doan: ${provider} previous credential could not be restored`, message(restore)); } }
        throw error;
      }
    });
    if (auth.vault) await this.storageStep(() => storage.scrub(provider, auth.vault!));
    return connection;
  }

  // Without a stored connection everything the attempt left is an orphan; with one, the vault stays the live profile.
  private async discard(provider: Provider, attemptId: string, hadConnection: boolean): Promise<void> {
    const auth = this.adapters[provider], storage = this.options.storage;
    try {
      if (auth.vault) { storage.scrub(provider, auth.vault); if (!hadConnection) storage.removeVault(provider); return; }
      const profileDir = storage.profileDir(provider);
      for (const rel of auth.plaintext) rmSync(join(profileDir, rel), { force: true });
      if (!hadConnection && auth.logout) {
        // Cleanup is not the stopped work: a cancelled first login may already have written its keychain item.
        this.stopRequests.delete(attemptId);
        await this.exec(provider, attemptId, auth.logout, this.options.statusTimeoutMs ?? 20_000);
      }
    } catch (error) { console.error(`doan: ${provider} sign-in cleanup failed`, message(error)); }
  }

  private async signOutFlow(provider: Provider, attemptId: string): Promise<void> {
    const auth = this.adapters[provider], storage = this.options.storage;
    // The server's own logout clears its stored token (logout.py, 1.3.0; no remote revocation is documented). doan's
    // copy goes either way, and only the fresh status below decides the result.
    if (auth.acpAuth && auth.vault) await this.acpLogout(provider, attemptId);
    if (auth.vault) { storage.removeVault(provider); storage.scrub(provider, auth.vault); }
    else if (auth.logout) {
      const logout = await this.exec(provider, attemptId, auth.logout, this.options.statusTimeoutMs ?? 20_000);
      if (logout.code !== 0) throw new Error(`logout exited ${logout.code}: ${tail(logout.stderr) ?? ""}`);
    }
    const profileDir = storage.profileDir(provider);
    for (const rel of auth.plaintext) rmSync(join(profileDir, rel), { force: true });
    // A deleted file proves nothing until a fresh provider process reports the profile signed out.
    const checked = await this.statusRun(provider, attemptId);
    if (checked.status !== "disconnected" && checked.status !== "expired") throw new Error(`profile still reports ${checked.status}`);
    storage.writeMetadata(replaceAccount(storage.readMetadata(), provider, null, false));
  }

  // The runs were asked to stop; each lease goes only when its process group is gone and its write-back landed. The
  // lease count, not stopRuns settling, ends the wait, so a close that never settles still meets the deadline.
  private async drain(provider: Provider, attemptId: string): Promise<boolean> {
    const deadline = Date.now() + (this.options.drainTimeoutMs ?? DRAIN_MS);
    if (this.running(provider)) {
      void (async () => { await this.options.stopRuns?.(provider); })().catch(error => console.error(`doan: ${provider} runs could not be stopped`, message(error)));
    }
    while (this.running(provider)) {
      if (this.stopRequests.has(attemptId) || Date.now() >= deadline) return false;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return true;
  }

  private async statusRun(provider: Provider, attemptId: string): Promise<CheckResult> {
    const run = this.adapters[provider].acpAuth ? await this.acpStatus(provider, attemptId) : await this.exec(provider, attemptId, this.adapters[provider].status, this.options.statusTimeoutMs ?? 20_000);
    return this.adapters[provider].parseStatus({ ...run, profileDir: this.options.storage.profileDir(provider) });
  }

  private async acpSignIn(provider: Provider, attemptId: string, owner: number): Promise<void> {
    const method = this.adapters[provider].acpAuth!.method;
    try {
      await this.acpExec(provider, attemptId, null, link => {
        if (this.stopRequests.has(attemptId) || this.cancelled(provider, attemptId) || this.links.get(attemptId)?.url === link.url) return false;
        this.links.set(attemptId, link); this.options.onPrompt?.({ provider, attemptId, owner, url: link.url });
        return false;
      }, async acp => { await this.acpOpen(provider, acp); await acp.request("authenticate", { methodId: method }, null); });
    } catch (error) {
      if (error instanceof Cancelled || this.cancelled(provider, attemptId)) throw new Cancelled();
      if (error instanceof Failure) throw error;
      throw new Failure("sign_in_failed", message(error));
    }
  }
  // authenticate with a stored token returns at once (refreshing it if needed); without a usable one the server starts
  // a new browser sign-in instead, which this check stops and reports as signed out (exit 2).
  private async acpStatus(provider: Provider, attemptId: string): Promise<Run> {
    let asked = false;
    try {
      await this.acpExec(provider, attemptId, this.options.statusTimeoutMs ?? 20_000, () => { asked = true; return true; },
        async acp => { await this.acpOpen(provider, acp); await acp.request("authenticate", { methodId: this.adapters[provider].acpAuth!.method }, null); });
      return { code: 0, stdout: "", stderr: "" };
    } catch (error) {
      if (error instanceof Cancelled || error instanceof Failure) throw error;
      return { code: asked ? 2 : 1, stdout: "", stderr: message(error) };
    }
  }
  private async acpLogout(provider: Provider, attemptId: string): Promise<void> {
    await this.hold(provider);
    try {
      await this.acpExec(provider, attemptId, this.options.statusTimeoutMs ?? 20_000, () => true, async acp => { await this.acpOpen(provider, acp); await acp.request("logout", {}); });
    } catch (error) { console.error(`doan: ${provider} server logout failed; removing doan's copy`, message(error)); }
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
      throw new Error(`unexpected ACP server ${String(info.name)} ${String(info.version)}`);
    }
  }
  // One ACP exchange with the provider's server; resolves or rejects only after its process group is gone.
  // onLink sees each sign-in link the server asks the browser to open and returns true to stop the server.
  private async acpExec<T>(provider: Provider, attemptId: string, timeoutMs: number | null, onLink: (link: SignInLink) => boolean, script: (acp: AcpConnection) => Promise<T>): Promise<T> {
    const { command, env, profileDir } = await this.launch(provider, attemptId);
    if (this.stopRequests.has(attemptId)) throw new Cancelled();
    const child = this.options.spawn(command, this.adapters[provider].args, { cwd: profileDir, env, input: true });
    const owned = this.processes.get(attemptId) ?? new Set();
    owned.add(child); this.processes.set(attemptId, owned);
    if (this.stopRequests.has(attemptId)) child.stop();
    let failure = "";
    const acp = new AcpConnection(line => { if (!child.write) throw new Error("process_exited"); child.write(line); },
      (_params, id) => acp.respond(id, { outcome: { outcome: "cancelled" } }), () => {}, detail => { failure = detail; child.stop(); });
    let errors = "";
    child.onOutput((text, stream) => {
      if (stream !== "stderr") { acp.receive(text); return; }
      errors = (errors + text).slice(-OUTPUT_LIMIT);
      let end: number;
      while ((end = errors.indexOf("\n")) >= 0) {
        const link = signInLink(errors.slice(0, end)); errors = errors.slice(end + 1);
        if (link && onLink(link)) child.stop();
      }
    });
    const timer = timeoutMs === null ? undefined : setTimeout(() => child.stop(), timeoutMs);
    let result: T;
    try { result = await Promise.race([script(acp), child.exit.then(() => { throw new Error(failure || "the ACP server exited"); })]); }
    catch (error) { if (this.stopRequests.has(attemptId)) throw new Cancelled(); throw error; }
    finally {
      clearTimeout(timer); acp.close(); child.stop(); await child.gone;
      owned.delete(child); if (!owned.size) this.processes.delete(attemptId);
    }
    if (this.stopRequests.has(attemptId)) throw new Cancelled();
    return result;
  }

  private async launch(provider: Provider, attemptId?: string, added: Record<string, string> = {}): Promise<{ command: string; env: Record<string, string>; profileDir: string }> {
    const locating = new AbortController();
    if (attemptId) { this.locating.set(attemptId, locating); if (this.stopRequests.has(attemptId)) locating.abort(); }
    let located: Awaited<ReturnType<AuthManagerOptions["locate"]>>;
    try { located = await this.options.locate(provider, locating.signal); }
    catch (error) {
      if (locating.signal.aborted) throw new Cancelled();
      throw message(error) === INSTALL_FAILED ? new Failure("cli_install_failed") : error;
    } finally { if (attemptId && this.locating.get(attemptId) === locating) this.locating.delete(attemptId); }
    if (!located) throw new Error("cli_missing");
    const profileDir = this.options.storage.profileDir(provider);
    for (const [rel, text] of Object.entries(this.adapters[provider].settings)) this.options.storage.writeSetting(provider, rel, text);
    let extra = { ...this.adapters[provider].env, ...added };
    if (this.adapters[provider].acpAuth || this.adapters[provider].hookLink) {
      // Every process of a browser sign-in server gets the hook, so neither a check nor an expired run can open a
      // browser itself. Without a usable hook the CLI would open the default browser, so nothing starts.
      const hook = this.options.storage.ownedScript(BROWSER_HOOK.name, BROWSER_HOOK.script);
      if (hook.includes(":")) throw new Error("browser_hook_unusable");
      extra = { ...extra, BROWSER: hook };
    }
    const env = providerEnv({ provider, inherited: this.options.inherited, path: located.path, profileDir, appRuntime: this.options.appRuntime, extra });
    if (!env.ok) throw new Error(env.code);
    return { command: located.command, env: env.env, profileDir };
  }

  // Resolves only after the process group is gone, so no result outruns its process.
  private async exec(provider: Provider, attemptId: string, args: string[], timeoutMs: number | null, onText?: (text: string) => void, added?: Record<string, string>): Promise<Run> {
    const { command, env, profileDir } = await this.launch(provider, attemptId, added);
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
      if (!auth.vault) { const dir = storage.profileDir(provider); for (const rel of auth.plaintext) rmSync(join(dir, rel), { force: true }); return; }
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
  private running(provider: Provider): boolean { return (this.runs.get(provider) ?? 0) > 0; }
  private cancelled(provider: Provider, attemptId: string): boolean {
    const attempt = this.state(provider).attempt;
    return !attempt || attempt.id !== attemptId || attempt.cancelled;
  }
  private stop(attemptId: string): void {
    this.stopRequests.add(attemptId);
    this.locating.get(attemptId)?.abort();
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
      this.options.onChange?.(result.state, this.revision);
    }
    return result;
  }
}

// The hook leaves each link on its own line in a file only this login is given; polling it needs nothing from the CLI.
function hookLinks(onLink: (raw: string) => void): { env: Record<string, string>; close(): void } {
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
