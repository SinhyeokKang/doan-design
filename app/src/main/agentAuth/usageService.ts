import type { Prepared } from "../conversation/service";
import type { CheckStarted, Lease } from "./manager";
import { PROVIDER_AUTH } from "./providers";
import { PROVIDERS, type AuthState, type Provider, type Readiness } from "./types";
import { usageNotSupported } from "./usageParse";
import { parseUsage, type UsageProvider } from "./usageRead";
import { shouldRead } from "./usageSchedule";
import { UsageStore } from "./usageStore";
import type { UsageBlock, UsageEntry, UsageReading, UsageTrigger } from "./usageTypes";

// Antigravity has no usage read Doan can use (PoC U4, U7) and is never shown.
export const USAGE_PROVIDERS = PROVIDERS.filter((provider): provider is UsageProvider => provider !== "antigravity");
const shown = (provider: Provider): provider is UsageProvider => provider !== "antigravity";
// What the service needs of AuthManager. A usage lease is not a conversation: a sign-out stops it (stopRuns) without
// asking the person (POSTMORTEM 2026-10-30).
export interface UsageAuth {
  state(provider: Provider): AuthState;
  check(provider: Provider): Promise<CheckStarted>;
  checked(provider: Provider): Promise<void>;
  acquire(provider: Provider, use: "usage"): Promise<Lease>;
}
export interface UsageServiceOptions {
  auth: UsageAuth;
  // The provider's readiness as Settings > Agents shows it (tool facts included).
  readiness(provider: Provider): Readiness;
  // A read in a process opened only for it (usageRead.ts readUsage), resolving after that process is gone. A Claude
  // lease carries its login's organization, which the read pins as a Doan Claude run does.
  read(provider: UsageProvider, lease: Lease & { organization?: string }, signal: AbortSignal): Promise<UsageReading>;
  // Whether the app window is shown; main decides, the renderer never says.
  visible(): boolean;
  publish(entries: UsageEntry[]): void;
  now?(): number;
}
interface Read { connectionId: string; controller: AbortController; done?: Promise<void> }
// Quit waits this long for stopped reads (as AuthManager.quit waits for its own work); it drops leftover holds itself.
const QUIT_WAIT_MS = 5000;

// Account usage in main memory: what the window shows (entries), when a provider is read (shouldRead's triggers, no
// polling), and which reads a sign-out stops. Nothing here is written to disk.
export class UsageService {
  private readonly store = new UsageStore();
  private readonly connections = new Map<UsageProvider, string>();
  private readonly reads = new Map<UsageProvider, Read>();
  private readonly running = new Set<Promise<void>>();
  // A sign-in whose read could not start yet (its connection still settling, or the window hidden).
  private readonly signedIn = new Set<UsageProvider>();
  private shown: boolean;
  // Set by the first start trigger, which main sends once the tool facts are read: until then readiness reads every
  // version as unknown, and the window shows a first read rather than that cause (ARCHITECTURE §7 'Agent usage').
  private factsRead = false;
  private published = "";
  private closed = false;
  private readonly now: () => number;
  constructor(private readonly options: UsageServiceOptions) {
    this.now = options.now ?? Date.now;
    this.shown = options.visible();
    this.sync(false);
  }

  // Connected providers that show usage, in PROVIDERS order, built field by field: no connection ID, profile, account
  // or diagnostic reaches the window.
  entries(): UsageEntry[] {
    const entries: UsageEntry[] = [];
    for (const provider of USAGE_PROVIDERS) {
      if (!this.connections.has(provider)) continue;
      const slot = this.store.get(provider), blocked = this.factsRead ? this.blocked(provider) : undefined;
      entries.push({ provider, inFlight: slot?.inFlight ?? false, ...(slot?.reading ? { reading: slot.reading } : {}), ...(blocked ? { blocked } : {}) });
    }
    return entries;
  }

  trigger(trigger: { kind: "start" | "open" | "refresh" }): void {
    // A trigger skipped while hidden is made up when the window shows again (visibilityChanged).
    this.shown = this.options.visible();
    if (trigger.kind === "start") this.factsRead = true;
    for (const provider of USAGE_PROVIDERS) this.start(provider, trigger);
    this.publish();
  }

  // Every auth change. A new connectionId (sign-in or replacement) drops the previous account's value and reads the new one.
  authChanged(): void { this.sync(true); }

  // A hidden window reads nothing; shown again, it reads as at app start (the 5-minute rule holds).
  visibilityChanged(): void {
    const visible = this.options.visible(), again = visible && !this.shown;
    this.shown = visible;
    if (again) { this.trigger({ kind: "start" }); for (const provider of this.signedIn) this.start(provider, { kind: "signIn" }); }
  }

  // A Doan-account turn's end: read on the run's own connection (runners.ts usageAtTurnEnd), no lease and no process.
  async turnEnd(provider: Provider, connectionId: string, read: () => Promise<unknown>): Promise<void> {
    if (this.closed || !shown(provider) || this.connections.get(provider) !== connectionId) return;
    if (!shouldRead(this.scheduled(provider), this.now(), { kind: "turnEnd", owner: "doan" }, this.options.visible())) return;
    this.store.begin(provider, connectionId); this.publish();
    const done = (async () => {
      let reading: UsageReading;
      try { reading = parseUsage(provider, await read(), this.now()); }
      catch (error) { reading = { status: "unavailable", reason: usageNotSupported(error) ? "not_supported" : "read_failed", readAt: this.now() }; }
      this.store.settle(provider, connectionId, reading); this.publish();
    })();
    this.track(done);
    await done;
  }

  // A sign-out or replacement (AuthManager stopRuns): the provider's read stops, and this resolves once its lease is released.
  async stop(provider: Provider): Promise<void> {
    if (!shown(provider)) return;
    const read = this.reads.get(provider);
    read?.controller.abort();
    await read?.done;
  }
  async quit(): Promise<void> {
    this.closed = true;
    for (const read of this.reads.values()) read.controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([this.settled(), new Promise(resolve => { timer = setTimeout(resolve, QUIT_WAIT_MS); timer.unref?.(); })]);
    clearTimeout(timer);
  }
  // Resolves when every read started so far has ended.
  async settled(): Promise<void> { while (this.running.size) await Promise.allSettled([...this.running]); }

  private sync(announce: boolean): void {
    for (const provider of USAGE_PROVIDERS) {
      const id = this.options.auth.state(provider).connection?.connectionId ?? null;
      if (id === (this.connections.get(provider) ?? null)) continue;
      if (id) this.connections.set(provider, id); else this.connections.delete(provider);
      this.store.connect(provider, id);
      if (id && announce) this.signedIn.add(provider); else this.signedIn.delete(provider);
    }
    for (const provider of this.signedIn) this.start(provider, { kind: "signIn" });
    this.publish();
  }

  private scheduled(provider: UsageProvider): Pick<UsageEntry, "reading" | "inFlight" | "blocked"> {
    const slot = this.store.get(provider), blocked = this.blocked(provider);
    return { inFlight: slot?.inFlight ?? false, ...(slot?.reading ? { reading: slot.reading } : {}), ...(blocked ? { blocked } : {}) };
  }

  // What a connection that cannot be read shows: the readiness, phase, error code and attempt kind its Settings >
  // Agents row is worded from (ARCHITECTURE §7 'Agent usage'). An unchecked connection is read anyway: the read checks it first, as
  // a run does, and Copilot's check costs a request.
  private blocked(provider: UsageProvider): UsageBlock | undefined {
    const readiness = this.options.readiness(provider);
    if (readiness.ready) return undefined;
    const state = this.options.auth.state(provider);
    if (readiness.cause === "unverified" && !state.error && !state.expired) return undefined;
    return { readiness, phase: state.phase, ...(state.error ? { error: state.error.code } : {}), ...(state.attempt ? { attempt: state.attempt.kind } : {}) };
  }

  private start(provider: UsageProvider, trigger: UsageTrigger): void {
    const connectionId = this.connections.get(provider);
    if (this.closed || !connectionId) return;
    if (!shouldRead(this.scheduled(provider), this.now(), trigger, this.options.visible())) return;
    this.signedIn.delete(provider);
    // A replacement's read takes the earlier account's place: that one is stopped, so quit and stop see every read.
    this.reads.get(provider)?.controller.abort();
    const controller = new AbortController(), read: Read = { connectionId, controller };
    this.reads.set(provider, read);
    this.store.begin(provider, connectionId);
    read.done = (async () => {
      const reading = await this.fresh(provider, connectionId, controller.signal);
      // Dropped when the connection changed meanwhile: one account's usage never shows for the next.
      this.store.settle(provider, connectionId, reading);
      if (this.reads.get(provider) === read) this.reads.delete(provider);
      this.publish();
    })();
    this.track(read.done);
    this.publish();
  }

  private async fresh(provider: UsageProvider, connectionId: string, signal: AbortSignal): Promise<UsageReading> {
    const failed = (): UsageReading => ({ status: "unavailable", reason: "read_failed", readAt: this.now() });
    const auth = this.options.auth;
    // A check runs up to 20 s (statusRun): quit and a sign-out stop waiting for it at once, and AuthManager stops the
    // check itself (quit, replaceCheck).
    const aborted = new Promise<void>(resolve => { if (signal.aborted) resolve(); else signal.addEventListener("abort", () => resolve(), { once: true }); });
    const until = (work: Promise<unknown>) => Promise.race([work, aborted]);
    try {
      // Stored connections load unverified; like a run's preparation, the read checks one first (conversation/prepare.ts).
      if (auth.state(provider).attempt?.kind === "check") await until(auth.checked(provider));
      const state = auth.state(provider);
      if (!signal.aborted && !PROVIDER_AUTH[provider].verifyByRun && state.connection && !state.verified && !state.expired && !state.attempt) {
        const started = await auth.check(provider);
        await until(started.ok ? started.done : auth.checked(provider));
      }
      // A check stopped by a sign-out or quit leaves nothing to read.
      if (signal.aborted || auth.state(provider).connection?.connectionId !== connectionId) return failed();
      const organization = provider === "claude" ? auth.state(provider).connection?.account.workspace : null;
      let lease: Lease;
      try { lease = await auth.acquire(provider, "usage"); }
      catch {
        // The refusal may quote provider output, so only Doan's own words are logged.
        console.error(`doan: ${provider} usage read failed: the connection could not be held`);
        return failed();
      }
      try { return signal.aborted ? failed() : await this.options.read(provider, organization ? { ...lease, organization } : lease, signal); }
      finally { await lease.release(); }
    } catch { return failed(); }
  }

  private track(work: Promise<void>): void {
    this.running.add(work);
    void work.finally(() => this.running.delete(work)).catch(() => {});
  }
  // Only a changed list is sent.
  private publish(): void {
    const entries = this.entries(), text = JSON.stringify(entries);
    if (text === this.published) return;
    this.published = text;
    this.options.publish(entries);
  }
}

// A Doan-account Claude or Codex run reads usage at its turn's end on its own connection. A legacy external run uses
// the person's own profile, whose usage Doan does not show, and ACP runs have no such read.
export function withTurnUsage(prepared: Prepared, usage: Pick<UsageService, "turnEnd">): Prepared {
  const owner = prepared.owner;
  if (!owner || (prepared.runtime !== "claude" && prepared.runtime !== "codex")) return prepared;
  return { ...prepared, usageAtTurnEnd: read => usage.turnEnd(owner.provider, owner.connectionId, read) };
}
