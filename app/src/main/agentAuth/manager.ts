import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { OwnedGroup } from "../conversation/process";
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
  locate(provider: Provider): Promise<{ command: string; path: string } | null>;
  adapters?: Record<Provider, ProviderAuth>; newId?: () => string; statusTimeoutMs?: number;
  onChange?(state: AuthState, revision: number): void; onPrompt?(prompt: AuthPrompt): void;
}
interface Run { code: number | null; stdout: string; stderr: string }
const OUTPUT_LIMIT = 1024 * 1024;
const QUIT_WAIT_MS = 5000;
// expect(1) ships with macOS: it gives a login a terminal (print mode refuses to sign in headless) and relays
// lines from a pipe into it, which script(1) cannot because it requires a terminal on its own stdin.
export const TERMINAL_RELAY = `log_user 1
set timeout -1
spawn -noecho {*}$argv
set child $spawn_id
fconfigure stdin -blocking 0 -buffering line
fileevent stdin readable {
  if {[gets stdin line] >= 0} { send -i $child -- "$line\\r" } elseif {[eof stdin]} { fileevent stdin readable {} }
}
expect -i $child eof
catch wait result
exit [lindex $result 3]
`;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const tail = (text: string) => text.trim().slice(-2000) || undefined;
class Cancelled extends Error {}
class Failure extends Error { constructor(readonly code: "sign_in_failed" | "storage_failed", detail?: string) { super(detail ?? code); } }

export class AuthManager {
  private states = new Map<Provider, AuthState>();
  private revision = 0;
  // One sign-in or sign-out write across all providers at a time.
  private writer: string | null = null;
  private processes = new Map<string, Set<AuthProcess>>();
  private checks = new Map<Provider, { attemptId: string; done: Promise<unknown> }>();
  private holds = new Map<Provider, number>();
  private runs = new Map<Provider, number>();
  private queues = new Map<Provider, Promise<void>>();
  // Sign-in processes that accept a pasted authorization code, and the codes to keep out of diagnostics.
  private inputs = new Map<string, AuthProcess>();
  private secrets = new Map<string, string[]>();
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
      let checked: CheckResult;
      try { checked = await this.working(provider, () => this.statusRun(provider, attemptId)); }
      catch (error) { checked = { status: "failed", code: "check_failed", detail: message(error) }; }
      this.apply(provider, { type: "checked", attemptId, result: checked });
      return this.state(provider);
    })());
    this.checks.set(provider, { attemptId, done });
    return { ok: true, attemptId, done };
  }

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
      } finally { if (this.writer === attemptId) this.writer = null; }
      return this.state(provider);
    })());
    return { ok: true, attemptId, done };
  }

  async cancel(provider: Provider, attemptId: string, owner: number): Promise<AuthTransition> {
    const result = this.apply(provider, { type: "cancel", attemptId, owner });
    if (result.ok) this.stop(attemptId);
    return result;
  }
  // For logins whose official flow ends in "paste the authorization code" (Antigravity print mode).
  submitCode(provider: Provider, attemptId: string, owner: number, code: string): { ok: true } | { ok: false; reason: AuthRejection } {
    const attempt = this.state(provider).attempt;
    if (!attempt || attempt.id !== attemptId || attempt.kind !== "signIn" || attempt.cancelled) return { ok: false, reason: "stale" };
    if (attempt.owner !== owner) return { ok: false, reason: "not_owner" };
    const child = this.inputs.get(attemptId);
    if (!child?.write || !/^[\x21-\x7e]{1,2048}$/.test(code)) return { ok: false, reason: "invalid" };
    this.secrets.set(attemptId, [...(this.secrets.get(attemptId) ?? []), code]);
    child.write(`${code}\n`);
    return { ok: true };
  }
  async ownerClosed(owner: number): Promise<void> {
    for (const provider of PROVIDERS) {
      const attempt = this.state(provider).attempt;
      const result = this.apply(provider, { type: "ownerClosed", owner });
      if (attempt && result.ok && result.outcome === "applied") this.stop(attempt.id);
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
      released = true; this.runs.set(provider, (this.runs.get(provider) ?? 1) - 1); await this.drop(provider);
    } };
  }

  private admit(provider: Provider): void {
    const state = this.state(provider);
    const refusal = this.closed || (state.attempt && state.attempt.kind !== "check") ? "busy"
      : state.error?.code === "sign_out_failed" ? "sign_out_failed" : !state.connection ? "not_connected"
      : state.error?.code === "account_mismatch" ? "account_mismatch" : state.expired ? "reauth_required" : !state.verified ? "unverified" : null;
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
    const seen = new Set<string>();
    const login = await this.exec(provider, attemptId, auth.login, null, auth.loginTerminal, text => {
      // Sentence punctuation after a printed URL is not part of it.
      for (const url of (text.match(/https?:\/\/[^\s"'<>]+/g) ?? []).map(found => found.replace(/[.,;:!?)\]]+$/, ""))) {
        if (seen.has(url)) continue;
        seen.add(url); this.options.onPrompt?.({ provider, attemptId, owner, url });
      }
    });
    if (this.cancelled(provider, attemptId)) throw new Cancelled();
    if (login.code !== 0) throw new Failure("sign_in_failed", tail(login.stderr) ?? tail(login.stdout));
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
      if (!hadConnection && auth.logout) await this.exec(provider, attemptId, auth.logout, this.options.statusTimeoutMs ?? 20_000);
    } catch (error) { console.error(`doan: ${provider} sign-in cleanup failed`, message(error)); }
  }

  private async signOutFlow(provider: Provider, attemptId: string): Promise<void> {
    const auth = this.adapters[provider], storage = this.options.storage;
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
    const run = await this.exec(provider, attemptId, this.adapters[provider].status, this.options.statusTimeoutMs ?? 20_000);
    return this.adapters[provider].parseStatus({ ...run, profileDir: this.options.storage.profileDir(provider) });
  }

  private async launch(provider: Provider): Promise<{ command: string; env: Record<string, string>; profileDir: string }> {
    const located = await this.options.locate(provider);
    if (!located) throw new Error("cli_missing");
    const profileDir = this.options.storage.profileDir(provider);
    for (const [rel, text] of Object.entries(this.adapters[provider].settings)) this.options.storage.writeSetting(provider, rel, text);
    const env = providerEnv({ provider, inherited: this.options.inherited, path: located.path, profileDir, appRuntime: this.options.appRuntime, extra: this.adapters[provider].env });
    if (!env.ok) throw new Error(env.code);
    return { command: located.command, env: env.env, profileDir };
  }

  // Resolves only after the process group is gone, so no result outruns its process.
  private async exec(provider: Provider, attemptId: string, args: string[], timeoutMs: number | null, terminal = false, onText?: (text: string) => void): Promise<Run> {
    const { command, env, profileDir } = await this.launch(provider);
    const argv = [command, ...this.adapters[provider].args, ...args];
    const [program, ...rest] = terminal ? ["/usr/bin/expect", "-f", this.options.storage.ownedFile("terminal-relay.exp", TERMINAL_RELAY), ...argv] : argv;
    const child = this.options.spawn(program!, rest, { cwd: profileDir, env, input: terminal });
    const owned = this.processes.get(attemptId) ?? new Set();
    owned.add(child); this.processes.set(attemptId, owned);
    if (terminal) this.inputs.set(attemptId, child);
    let stdout = "", stderr = "", timer: ReturnType<typeof setTimeout> | undefined;
    child.onOutput((text, stream) => {
      if (stream === "stderr") { if (stderr.length < OUTPUT_LIMIT) stderr += text; } else if (stdout.length < OUTPUT_LIMIT) stdout += text;
      onText?.(text);
    });
    if (timeoutMs !== null) timer = setTimeout(() => child.stop(), timeoutMs);
    try {
      const code = await child.exit;
      await child.gone;
      // The terminal echoes a pasted code back; it must not reach error details.
      const redact = (text: string) => (this.secrets.get(attemptId) ?? []).reduce((out, secret) => out.split(secret).join("<code>"), text);
      return { code, stdout: redact(stdout), stderr: redact(stderr) };
    } finally {
      clearTimeout(timer); owned.delete(child);
      if (this.inputs.get(attemptId) === child) this.inputs.delete(attemptId);
      if (!owned.size) { this.processes.delete(attemptId); this.secrets.delete(attemptId); }
    }
  }

  private replaceCheck(provider: Provider): Promise<unknown> {
    const check = this.checks.get(provider);
    if (!check) return Promise.resolve();
    this.checks.delete(provider); this.stop(check.attemptId);
    return check.done.catch(() => {});
  }
  private async working<T>(provider: Provider, body: () => Promise<T>): Promise<T> {
    await this.hold(provider);
    try { return await body(); } finally { await this.drop(provider); }
  }
  // Holds and drops of one provider run in order, so a second holder never sees a half-written working copy.
  private serial(provider: Provider, step: () => Promise<void>): Promise<void> {
    const next = (this.queues.get(provider) ?? Promise.resolve()).then(step);
    this.queues.set(provider, next.catch(() => {}));
    return next;
  }
  private hold(provider: Provider): Promise<void> {
    return this.serial(provider, async () => {
      const count = this.holds.get(provider) ?? 0, auth = this.adapters[provider];
      if (count === 0 && auth.vault && this.state(provider).connection) await this.options.storage.materialize(provider, auth.vault);
      this.holds.set(provider, count + 1);
    });
  }
  // The last holder writes the provider's refreshed copy back before the plaintext goes away.
  private drop(provider: Provider): Promise<void> {
    return this.serial(provider, async () => {
      const count = (this.holds.get(provider) ?? 1) - 1, auth = this.adapters[provider];
      this.holds.set(provider, count);
      if (count > 0 || !auth.vault) return;
      try { if (this.state(provider).connection) await this.options.storage.absorb(provider, auth.vault); }
      catch (error) { console.error(`doan: ${provider} refresh could not be stored`, message(error)); }
      try { this.options.storage.scrub(provider, auth.vault); }
      catch (error) { console.error(`doan: ${provider} working credential could not be removed`, message(error)); }
    });
  }
  private async recover(provider: Provider, connected: boolean): Promise<void> {
    const auth = this.adapters[provider], storage = this.options.storage;
    try {
      if (!auth.vault) { const dir = storage.profileDir(provider); for (const rel of auth.plaintext) rmSync(join(dir, rel), { force: true }); return; }
      // A crash can leave a refreshed working copy; keep it only in encrypted form.
      if (connected && storage.leftovers(provider, auth.vault)) {
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
  private stop(attemptId: string): void { for (const child of this.processes.get(attemptId) ?? []) child.stop(); }
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

// Same discovery as conversation preparation: the login shell's PATH, not the app's launch environment.
export function shellLocator(inherited: NodeJS.ProcessEnv, adapters: Record<Provider, ProviderAuth> = PROVIDER_AUTH): AuthManagerOptions["locate"] {
  return async provider => {
    const probe = await probeShell(inherited);
    if (!probe.ok) return null;
    const command = findOnPath(probe.path, adapters[provider].command, path => { try { accessSync(path, constants.X_OK); return statSync(path).isFile(); } catch { return false; } });
    return command ? { command, path: probe.path } : null;
  };
}
