import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { ACP_PROTOCOL_VERSION, AcpConnection } from "../conversation/acp";
import { OwnedGroup } from "../conversation/process";
import { object } from "../conversation/sessions";
import { BROWSER_HOOK, callbackAddress, INSTALL_FAILED, forwardCallback, signInLink, type SignInLink } from "./antigravity";
import { probeShell } from "../onboarding/machine";
import { findOnPath } from "../onboarding/states";
import { providerEnv } from "./environment";
import { PROVIDER_AUTH, type ProviderAuth } from "./providers";
import { authStatus, initialAuthState, transition } from "./state";
import type { AuthStorage } from "./storage";
import { PROVIDERS, type AccountConnection, type AuthEvent, type AuthRejection, type AuthState, type AuthStatusDto, type AuthTransition, type CheckResult, type Provider, type SignInResult, type ToolFacts } from "./types";

export interface AuthProcess { onOutput(listener: (text: string, stream?: "stderr") => void): void; exit: Promise<number | null>; gone: Promise<void>; stop(): void; write?(text: string): void }
export type Spawn = (command: string, args: string[], options: { cwd: string; env: Record<string, string>; input?: boolean }) => AuthProcess;
export interface AuthPrompt { provider: Provider; attemptId: string; owner: number; url: string }
// A provider process using the dedicated profile; sign-in and sign-out wait until every lease is released.
export interface Lease { command: string; env: Record<string, string>; profileDir: string; release(): Promise<void> }
export type Started = { ok: true; attemptId: string; done: Promise<AuthState> } | { ok: false; reason: AuthRejection; state: AuthState };
export interface AuthManagerOptions {
  storage: AuthStorage; spawn: Spawn; inherited: Record<string, string | undefined>; appRuntime: string;
  // signal aborts when the attempt is stopped; Antigravity's locate may be a long server download.
  locate(provider: Provider, signal?: AbortSignal): Promise<{ command: string; path: string } | null>;
  adapters?: Record<Provider, ProviderAuth>; newId?: () => string; statusTimeoutMs?: number;
  onChange?(state: AuthState, revision: number): void; onPrompt?(prompt: AuthPrompt): void;
}
interface Run { code: number | null; stdout: string; stderr: string }
const OUTPUT_LIMIT = 1024 * 1024;
const QUIT_WAIT_MS = 5000;
const ACP_OPEN_MS = 60_000;
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
    const accounts = this.options.storage.readMetadata().accounts;
    for (const provider of PROVIDERS) {
      const stored = accounts.find(a => a.provider === provider) ?? null;
      this.states.set(provider, initialAuthState(provider, stored));
      await this.recover(provider, stored !== null);
    }
  }
  state(provider: Provider): AuthState { return this.states.get(provider)!; }
  status(provider: Provider, facts: ToolFacts): AuthStatusDto { return authStatus(this.state(provider), facts, this.revision); }

  async check(provider: Provider): Promise<Started> {
    const attemptId = this.newId();
    const result = this.closed ? this.refuse(provider, "busy") : this.apply(provider, { type: "check", attemptId });
    if (!result.ok) return result;
    const done = this.track((async () => {
      let checked: CheckResult, lost: string | null = null;
      try {
        await this.hold(provider);
        try { checked = await this.statusRun(provider, attemptId); } finally { lost = await this.drop(provider); }
      } catch (error) { checked = { status: "failed", code: error instanceof Failure && error.code === "cli_install_failed" ? error.code : "check_failed", detail: message(error) }; }
      try {
        this.apply(provider, { type: "checked", attemptId, result: checked });
        // After the result: the status ran on the refreshed copy that just failed to reach the vault.
        if (lost !== null) this.apply(provider, { type: "writeBackFailed", detail: lost });
      } finally {
        this.stopRequests.delete(attemptId);
        if (this.checks.get(provider)?.attemptId === attemptId) this.checks.delete(provider);
      }
      return this.state(provider);
    })());
    this.checks.set(provider, { attemptId, done });
    return { ok: true, attemptId, done };
  }

  // Resolves when the provider's running check, if any, has applied its result.
  async checked(provider: Provider): Promise<void> { await this.checks.get(provider)?.done.catch(() => {}); }

  async signIn(provider: Provider, owner: number): Promise<Started> {
    if (this.closed || this.writer) return this.refuse(provider, "busy");
    if (this.running(provider)) return this.refuse(provider, "stop_required");
    const attemptId = this.newId();
    const result = this.apply(provider, { type: "signIn", attemptId, owner });
    if (!result.ok) return result;
    this.writer = attemptId;
    const check = this.replaceCheck(provider);
    const done = this.track((async () => {
      try {
        await check;
        const hadConnection = this.state(provider).connection !== null;
        let outcome: SignInResult | null;
        try { outcome = { status: "stored", connection: await this.signInFlow(provider, attemptId, owner) }; }
        catch (error) {
          await this.discard(provider, attemptId, hadConnection);
          outcome = error instanceof Cancelled || this.cancelled(provider, attemptId) ? null
            : { status: "failed", code: error instanceof Failure ? error.code : "sign_in_failed", detail: message(error) };
        }
        this.apply(provider, outcome ? { type: "signedIn", attemptId, result: outcome } : { type: "settled", attemptId });
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

  async signOut(provider: Provider): Promise<Started> {
    if (this.closed || this.writer) return this.refuse(provider, "busy");
    const attemptId = this.newId();
    const result = this.apply(provider, { type: "signOut", attemptId, running: this.running(provider) });
    if (!result.ok) return result;
    this.writer = attemptId;
    const check = this.replaceCheck(provider);
    const done = this.track((async () => {
      try {
        await check;
        let removed: { status: "removed" } | { status: "failed"; detail?: string };
        try { await this.signOutFlow(provider, attemptId); removed = { status: "removed" }; }
        catch (error) { removed = { status: "failed", detail: message(error) }; }
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

  private async signInFlow(provider: Provider, attemptId: string, owner: number): Promise<AccountConnection> {
    const auth = this.adapters[provider];
    // A login starts from no working copy so a failed or cancelled replacement cannot leave the old one exposed.
    if (auth.vault) await this.storageStep(() => this.options.storage.scrub(provider, auth.vault!));
    if (auth.acpAuth) await this.acpSignIn(provider, attemptId, owner);
    else {
      const seen = new Set<string>();
      const login = await this.exec(provider, attemptId, auth.login, null, text => {
        if (this.stopRequests.has(attemptId) || this.cancelled(provider, attemptId)) return;
        // Sentence punctuation after a printed URL is not part of it.
        for (const url of (text.match(/https?:\/\/[^\s"'<>]+/g) ?? []).map(found => found.replace(/[.,;:!?)\]]+$/, ""))) {
          if (seen.has(url)) continue;
          seen.add(url); this.options.onPrompt?.({ provider, attemptId, owner, url });
        }
      });
      if (this.cancelled(provider, attemptId)) throw new Cancelled();
      if (login.code !== 0) throw new Failure("sign_in_failed", tail(login.stderr) ?? tail(login.stdout));
    }
    if (this.cancelled(provider, attemptId)) throw new Cancelled();
    const checked = await this.statusRun(provider, attemptId);
    if (this.cancelled(provider, attemptId)) throw new Cancelled();
    if (checked.status !== "connected") throw new Failure("sign_in_failed", `status after login: ${checked.status}`);
    const profileDir = this.options.storage.profileDir(provider);
    if (auth.vault) await this.storageStep(() => this.options.storage.absorb(provider, auth.vault!));
    else if (auth.plaintext.some(rel => existsSync(join(profileDir, rel)))) throw new Failure("storage_failed", "provider wrote a plaintext credential file");
    const connection: AccountConnection = { provider, connectionId: this.newId(), profile: provider, account: checked.account };
    // Last cancellation point: from the metadata write to the signedIn transition only microtasks run, so no
    // cancel or window-close event can land between a persisted connection and its state.
    if (this.cancelled(provider, attemptId)) throw new Cancelled();
    await this.storageStep(() => {
      const metadata = this.options.storage.readMetadata();
      this.options.storage.writeMetadata({ v: 1, accounts: [...metadata.accounts.filter(a => a.provider !== provider), connection] });
    });
    if (auth.vault) await this.storageStep(() => this.options.storage.scrub(provider, auth.vault!));
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
    const metadata = storage.readMetadata();
    storage.writeMetadata({ v: 1, accounts: metadata.accounts.filter(a => a.provider !== provider) });
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
    finally { this.holds.set(provider, Math.max(0, (this.holds.get(provider) ?? 1) - 1)); }
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

  private async launch(provider: Provider, attemptId?: string): Promise<{ command: string; env: Record<string, string>; profileDir: string }> {
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
    let extra = this.adapters[provider].env;
    if (this.adapters[provider].acpAuth) {
      // Every process of a browser sign-in server gets the hook, so neither a check nor an expired run can open a
      // browser itself. Without a usable hook webbrowser would fall back to the default browser, so nothing starts.
      const hook = this.options.storage.ownedScript(BROWSER_HOOK.name, BROWSER_HOOK.script);
      if (hook.includes(":")) throw new Error("browser_hook_unusable");
      extra = { ...extra, BROWSER: hook };
    }
    const env = providerEnv({ provider, inherited: this.options.inherited, path: located.path, profileDir, appRuntime: this.options.appRuntime, extra });
    if (!env.ok) throw new Error(env.code);
    return { command: located.command, env: env.env, profileDir };
  }

  // Resolves only after the process group is gone, so no result outruns its process.
  private async exec(provider: Provider, attemptId: string, args: string[], timeoutMs: number | null, onText?: (text: string) => void): Promise<Run> {
    const { command, env, profileDir } = await this.launch(provider, attemptId);
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
