import { validAuthId } from "./metadata";
import { authStatus, readiness, recordedFacts } from "./state";
import { PROVIDERS, validProvider, type AuthRejection, type AuthState, type AuthStatusDto, type AuthTransition, type Provider, type ToolFacts } from "./types";
import type { AuthPrompt, Started, WriteOptions } from "./manager";

// Kebab-case namespaces like ui-state and review-state. Main window and Settings both reach these (senderAllowed);
// neither gets conversation-run rights from them.
export const AUTH_CHANNELS = {
  read: "agent-auth:read", check: "agent-auth:check", signIn: "agent-auth:sign-in", cancel: "agent-auth:cancel",
  submitCode: "agent-auth:submit-code", openLink: "agent-auth:open-link", signOut: "agent-auth:sign-out",
  changed: "agent-auth:changed", prompt: "agent-auth:prompt",
} as const;
// One revision for the whole snapshot: a reader keeps the newest and drops anything older.
export interface AuthSnapshot { revision: number; providers: AuthStatusDto[] }
export type AuthReason = AuthRejection | "open_failed";
export type AuthStartReply = { ok: true; attemptId: string } | { ok: false; reason: AuthReason };
export type AuthReply = { ok: true } | { ok: false; reason: AuthReason };
// A check started an attempt, or, while readiness has a version cause, only re-read the tool facts and started none.
export type AuthCheckReply = AuthStartReply | AuthReply;
// Sent only to the window that started the sign-in.
export interface AuthPromptEvent { provider: Provider; attemptId: string; url: string }
export interface AuthBackend {
  state(provider: Provider): AuthState;
  check(provider: Provider): Promise<Started>;
  signIn(provider: Provider, owner: number, options: WriteOptions): Promise<Started>;
  cancel(provider: Provider, attemptId: string, owner: number): Promise<AuthTransition>;
  submitCode(provider: Provider, attemptId: string, owner: number, code: string): { ok: true } | { ok: false; reason: AuthRejection };
  signOut(provider: Provider, options: WriteOptions): Promise<Started>;
}
export interface AuthIpcOptions {
  backend: AuthBackend;
  // Never throws; a fact it cannot establish is "unknown".
  probe(provider: Provider): Promise<ToolFacts>;
  openExternal(url: string): Promise<void>;
  publish(snapshot: AuthSnapshot): void;
  prompt(owner: number, event: AuthPromptEvent): void;
}
// Until probed, readiness asks for a retry rather than claiming a ready or missing tool.
const UNPROBED: ToolFacts = { cli: "found", version: "unknown", tools: "ready" };
const invalid = { ok: false, reason: "invalid" } as const;
const MAX_CODE = 16384;
function fields(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return required.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => required.includes(k) || optional.includes(k));
}
function started(result: Started): AuthStartReply { return result.ok ? { ok: true, attemptId: result.attemptId } : { ok: false, reason: result.reason }; }

export class AuthIpc {
  private revision = 0;
  private facts = new Map<Provider, ToolFacts>();
  private probed: Promise<void> | null = null;
  // The latest sign-in link of each current attempt; open-link opens only this, never a URL from a window.
  private links = new Map<string, AuthPrompt>();
  // The installed version a new session's handshake refused, per provider. Memory only: an app restart clears it.
  private incompatibles = new Map<Provider, string>();
  constructor(private readonly options: AuthIpcOptions) {}

  async read(): Promise<AuthSnapshot> {
    // One new revision for the first facts: a window may already hold a snapshot built without them.
    this.probed ??= Promise.all(PROVIDERS.map(provider => this.refresh(provider, false))).then(() => this.changed());
    await this.probed;
    return this.snapshot();
  }
  // Without waiting for the first probe: the socket answers within its 2 s limit, and unprobed facts read as a retry.
  latest(): AuthSnapshot { return this.snapshot(); }
  // Every auth state change; links of attempts that ended are dropped here.
  changed(): void {
    for (const [attemptId, link] of this.links) if (!this.current(link.provider, attemptId)) this.links.delete(attemptId);
    this.revision += 1;
    this.options.publish(this.snapshot());
  }
  // A run found the CLI missing or its version not one doan checked: read that provider again instead of polling.
  refreshTools(provider: Provider): Promise<void> { return this.refresh(provider, true); }
  // Published directly: the facts of the refused build are unchanged, so a refresh would not publish it.
  incompatible(provider: Provider, installed: string): void { this.incompatibles.set(provider, installed); this.changed(); }
  compatible(provider: Provider, installed: string): void {
    if (this.incompatibles.get(provider) !== installed) return;
    this.incompatibles.delete(provider); this.changed();
  }
  // A run read another build than the refused one (a self-update or reinstall). The facts may still name the refused
  // build until the probe reads the new one, so the drop is published whether or not they change.
  versionRead(provider: Provider, installed: string): void {
    const recorded = this.incompatibles.get(provider);
    if (recorded === undefined || recorded === installed) return;
    this.incompatibles.delete(provider);
    void this.refresh(provider, false).then(() => this.changed());
  }
  prompted(prompt: AuthPrompt): void {
    if (!this.current(prompt.provider, prompt.attemptId)) return;
    this.links.set(prompt.attemptId, prompt);
    this.options.prompt(prompt.owner, { provider: prompt.provider, attemptId: prompt.attemptId, url: prompt.url });
  }

  // owner is the sending window's webContents id; the caller has already checked it is a main frame of an app window.
  async handle(channel: string, value: unknown, owner: number): Promise<AuthCheckReply | AuthSnapshot> {
    const backend = this.options.backend;
    switch (channel) {
      case AUTH_CHANNELS.read: return value === undefined ? this.read() : invalid;
      case AUTH_CHANNELS.check: {
        if (!fields(value, ["provider"]) || !validProvider(value.provider)) return invalid;
        const ready = readiness(backend.state(value.provider), this.factsOf(value.provider));
        void this.refresh(value.provider, true);
        // A version cause clears only with new tool facts; an account check (Copilot's costs a request) cannot clear it.
        if (!ready.ready && ready.cause.startsWith("version_")) return { ok: true };
        return started(await backend.check(value.provider));
      }
      case AUTH_CHANNELS.signIn: case AUTH_CHANNELS.signOut: {
        if (!fields(value, ["provider"], ["stop"]) || !validProvider(value.provider) || (value.stop !== undefined && typeof value.stop !== "boolean")) return invalid;
        const options = { stop: value.stop === true };
        return started(channel === AUTH_CHANNELS.signIn ? await backend.signIn(value.provider, owner, options) : await backend.signOut(value.provider, options));
      }
      case AUTH_CHANNELS.cancel: case AUTH_CHANNELS.openLink: {
        if (!fields(value, ["provider", "attemptId"]) || !validProvider(value.provider) || !validAuthId(value.attemptId)) return invalid;
        if (channel === AUTH_CHANNELS.cancel) { const result = await backend.cancel(value.provider, value.attemptId, owner); return result.ok ? { ok: true } : { ok: false, reason: result.reason }; }
        const link = this.links.get(value.attemptId);
        if (!link || link.provider !== value.provider || !this.current(value.provider, value.attemptId)) return { ok: false, reason: "stale" };
        if (link.owner !== owner) return { ok: false, reason: "not_owner" };
        try { await this.options.openExternal(link.url); return { ok: true }; } catch { return { ok: false, reason: "open_failed" }; }
      }
      case AUTH_CHANNELS.submitCode: {
        if (!fields(value, ["provider", "attemptId", "code"]) || !validProvider(value.provider) || !validAuthId(value.attemptId) ||
          typeof value.code !== "string" || value.code.length > MAX_CODE) return invalid;
        return backend.submitCode(value.provider, value.attemptId, owner, value.code);
      }
    }
    return invalid;
  }

  private async refresh(provider: Provider, publish: boolean): Promise<void> {
    // A probe that breaks its contract must not leave every later read rejected.
    const facts = await this.options.probe(provider).catch(() => UNPROBED);
    const previous = this.facts.get(provider) ?? UNPROBED;
    this.facts.set(provider, facts);
    if (publish && JSON.stringify(previous) !== JSON.stringify(facts)) this.changed();
  }
  private current(provider: Provider, attemptId: string): boolean {
    const attempt = this.options.backend.state(provider).attempt;
    return !!attempt && attempt.id === attemptId && attempt.kind === "signIn" && !attempt.cancelled;
  }
  // Applied at every read, so a refresh that started before a record cannot cover it with the build's unchanged facts.
  private factsOf(provider: Provider): ToolFacts { return recordedFacts(this.facts.get(provider) ?? UNPROBED, this.incompatibles.get(provider)); }
  private snapshot(): AuthSnapshot {
    return { revision: this.revision, providers: PROVIDERS.map(p => authStatus(this.options.backend.state(p), this.factsOf(p), this.revision)) };
  }
}
