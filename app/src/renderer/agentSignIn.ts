import type { AuthPromptEvent, AuthReason, AuthReply, AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { DoanApi } from "../preload";
import { cancelledAnnouncement, readyAnnouncements, replyEffect, signInToast, type ProviderContext } from "./agentAuthView";
import { newerAuth, ownedSignIns } from "./onboardingScene";

type Api = Pick<DoanApi, "readAgentAuth" | "onAgentAuth" | "checkAgentAuth" | "signInAgent" | "signOutAgent" | "cancelAgentSignIn" |
  "submitAgentSignInCode" | "openAgentSignInLink" | "onAgentSignInPrompt">;
export interface AgentSignInDeps {
  api: Api;
  hasFocus(): boolean;
  // Attempt ids this renderer started, kept across a renderer reload; agent-auth still names the window their owner.
  remember?(ids: readonly string[]): void;
  recall?(): string[];
}
// The screen that shows the provider rows (Settings > Agents, the first-run Agent step). Ready changes are announced
// there, and a refusal that needs the stop dialog asks it to open one.
export interface RowsConsumer {
  // returning: announced as the window came back to the front, not while it had focus.
  announce(text: string, returning: boolean): void;
  dialog(provider: Provider, intent: "signIn" | "signOut"): void;
}
export type SignInToast = ReturnType<typeof signInToast>;
export interface AgentSignInState {
  // undefined: not read yet. null: the account store is unreadable.
  auth: AuthSnapshot | null | undefined;
  contexts: Partial<Record<Provider, ProviderContext>>;
}

// Providers whose links open on the first prompt. Cursor and Copilot (2026-10-28 user) and codex login (its webbrowser
// crate) open the default browser themselves; opening again showed a second sign-in page.
const AUTO_OPEN: readonly Provider[] = ["claude", "antigravity"];
// Codex prints its local callback server before the auth page; opening the server's address shows nothing useful.
function loopback(url: string): boolean {
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname); } catch { return false; }
}

// Sign-in state for the whole renderer (buzz-settings design 'App 수준 로그인 컨트롤러'). main sends a sign-in prompt
// to its owner window once, and a sign-in outlives the screen it started on, so the prompt, the attempts this renderer
// owns and the ready announcements live here rather than in a component (POSTMORTEM 2026-10-25 'A forwarded Settings
// target discarded a pending setup confirmation': component and main operation lifetimes diverge). Readiness is never
// judged here; agentAuthView reads the snapshot.
export class AgentSignIn {
  state: AgentSignInState = { auth: undefined, contexts: {} };
  private live = false;
  private stops: (() => void)[] = [];
  private listeners = new Set<() => void>();
  private toastListeners = new Set<(toast: SignInToast) => void>();
  // The screens showing the rows, latest last; only the latest one is told.
  private shown: RowsConsumer[] = [];
  private ownedIds: string[];
  private opened = new Set<string>();
  // Sign-in calls still waiting for their attempt id, and prompts that came before that id: a main event and an
  // invoke reply have no guaranteed order, so a prompt cannot be judged until the reply lands.
  private starting = 0;
  private held: AuthPromptEvent[] = [];
  // The provider of each sign-in this renderer started, until it settles: its ready change is announced at once.
  private ownedBy = new Map<Provider, string>();
  private cancelled = new Set<Provider>();
  // Ready changes seen while the window was in the background, told when it returns. ended: a sign-in ended there,
  // so the change is news even if the screen showing the rows has gone by then; a settled check is not.
  private pending: { provider: Provider; text: string; ended: boolean }[] = [];
  private replyAttempt = new Map<Provider, string>();
  // A check already on its way is not sent again (a second entry before its snapshot shows the attempt).
  private checking = new Set<Provider>();
  constructor(private readonly deps: AgentSignInDeps) { this.ownedIds = deps.recall?.() ?? []; }

  start(): void {
    if (this.live) return;
    this.live = true;
    const { api } = this.deps;
    this.stops.push(api.onAgentAuth(snapshot => this.apply(snapshot)), api.onAgentSignInPrompt(event => this.prompted(event)));
  }
  dispose(): void {
    this.live = false;
    for (const stop of this.stops.splice(0)) stop();
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  show(rows: RowsConsumer): () => void {
    this.shown.push(rows);
    return () => { this.shown = this.shown.filter(item => item !== rows); };
  }
  onToast(listener: (toast: SignInToast) => void): () => void {
    this.toastListeners.add(listener);
    return () => { this.toastListeners.delete(listener); };
  }
  owned(): string[] { return [...this.ownedIds]; }

  async read(): Promise<void> {
    let snapshot: AuthSnapshot | null;
    try { snapshot = await this.deps.api.readAgentAuth(); } catch {
      // A failed call is not an unreadable store: a list already shown stays until the next read or event.
      snapshot = this.state.auth ? this.state.auth : null;
    }
    if (!this.live) return;
    if (snapshot === null) { this.set({ auth: null }); return; }
    this.apply(snapshot);
  }
  check(provider: Provider): void {
    if (!this.live || this.checking.has(provider)) return;
    this.checking.add(provider);
    void this.settle(this.deps.api.checkAgentAuth(provider)).then(result => {
      this.checking.delete(provider);
      if (!result.ok) this.refuse(provider, result.reason, "signIn");
    });
  }
  // A person's Check or Retry: an earlier refusal shown on the row no longer applies.
  checkAgain(provider: Provider): void {
    this.context(provider, { reply: null });
    this.check(provider);
  }
  async signIn(provider: Provider, stop = false): Promise<void> {
    if (!this.live) return;
    this.context(provider, { reply: null });
    this.starting++;
    const result = await this.settle(this.deps.api.signInAgent(provider, stop ? { stop: true } : {}));
    this.starting--;
    if (!this.live) return;
    if (result.ok && "attemptId" in result) { this.ownedIds.push(result.attemptId); this.ownedBy.set(provider, result.attemptId); this.deps.remember?.(this.ownedIds); }
    const held = this.held;
    this.held = this.starting > 0 ? held.filter(event => !this.ownedIds.includes(event.attemptId)) : [];
    for (const event of held) if (this.ownedIds.includes(event.attemptId)) this.autoOpen(event);
    if (!result.ok) this.refuse(provider, result.reason, "signIn");
  }
  async signOut(provider: Provider, stop = false): Promise<void> {
    if (!this.live) return;
    this.context(provider, { reply: null });
    const result = await this.settle(this.deps.api.signOutAgent(provider, stop ? { stop: true } : {}));
    if (this.live && !result.ok) this.refuse(provider, result.reason, "signOut");
  }
  cancel(provider: Provider): void {
    const attempt = this.status(provider)?.attempt;
    if (!this.live || attempt?.kind !== "signIn") return;
    this.cancelled.add(provider);
    void this.reply(provider, this.deps.api.cancelAgentSignIn(provider, attempt.id), "signIn");
  }
  openLink(provider: Provider): void {
    const attempt = this.status(provider)?.attempt;
    if (!this.live || attempt?.kind !== "signIn") return;
    this.context(provider, { reply: null });
    void this.reply(provider, this.deps.api.openAgentSignInLink(provider, attempt.id), "signIn");
  }
  // The caller closes its paste modal first, then hands a refusal back through refuse.
  submitCode(provider: Provider, attemptId: string, code: string): Promise<AuthReply | { ok: false; reason: "invalid" }> {
    return this.settle(this.deps.api.submitAgentSignInCode(provider, attemptId, code));
  }
  // Only this renderer's sign-ins still running are cancelled; saved connections and others' attempts stay.
  async cancelOwned(): Promise<void> {
    const auth = this.state.auth ?? null;
    await Promise.all(ownedSignIns(auth, this.ownedIds).map(({ provider, attemptId }) => this.settle(this.deps.api.cancelAgentSignIn(provider, attemptId))));
  }
  // The window came back to the front: ready changes seen meanwhile are told once, on the rows or in a toast.
  windowFocused(): void {
    if (!this.live || this.pending.length === 0) return;
    const pending = this.pending.splice(0), rows = this.rows();
    if (rows) rows.announce(pending.map(item => item.text).join(". "), true);
    else for (const { provider, ended } of pending) if (ended) this.toast(signInToast(provider, true));
  }

  refuse(provider: Provider, reason: AuthReason, intent: "signIn" | "signOut"): void {
    if (!this.live) return;
    switch (replyEffect(reason)) {
      // A reply that lands after its screen went away opens nothing.
      case "dialog": this.rows()?.dialog(provider, intent); return;
      case "reread": void this.read(); return;
      case "show": {
        const attempt = this.status(provider)?.attempt;
        if (attempt) this.replyAttempt.set(provider, attempt.id);
        this.context(provider, { reply: reason });
      }
    }
  }

  private apply(incoming: AuthSnapshot): void {
    if (!this.live) return;
    const previous = this.state.auth ?? null;
    const next = newerAuth(previous, incoming);
    if (next === previous) return;
    const contexts = { ...this.state.contexts };
    const holder = next.providers.find(p => p.attempt && p.attempt.kind !== "check");
    const rows = this.rows();
    for (const status of next.providers) {
      const { provider, attempt } = status, old = previous?.providers.find(p => p.provider === provider);
      const ctx = { ...contexts[provider] };
      if (ctx.reply === "busy" && !holder) ctx.reply = null;
      if ((ctx.reply === "not_owner" || ctx.reply === "open_failed") && (attempt?.kind !== "signIn" || attempt.id !== this.replyAttempt.get(provider))) ctx.reply = null;
      if (old?.attempt?.kind === "signIn" && attempt?.kind !== "signIn" && status.error?.code === "sign_in_failed") ctx.failures = (ctx.failures ?? 0) + 1;
      if (status.readiness.ready) ctx.failures = 0;
      contexts[provider] = ctx;
      if (this.cancelled.has(provider) && attempt?.kind !== "signIn") {
        this.cancelled.delete(provider);
        if (rows && !status.readiness.ready && !status.error) rows.announce(cancelledAnnouncement(provider), false);
      }
    }
    this.set({ auth: next, contexts });
    // With the rows shown, a sign-in finishing in the browser is announced once with role=status when the window
    // regains focus, which never raises the window (2026-10-28 user). One seen while the window has focus (a check, a
    // Retry) is on screen already and must not pull focus away; a sign-in this renderer started is still announced
    // once, without moving focus (conductor 2026-10-29). With no rows shown, only a sign-in that ended is told, in a
    // toast: a check that settles in the background is not news (buzz-settings design 'App 수준 로그인 컨트롤러').
    const focused = this.deps.hasFocus();
    for (const status of next.providers) {
      const { provider } = status, old = previous?.providers.find(p => p.provider === provider);
      const [text] = readyAnnouncements(previous, { revision: next.revision, providers: [status] });
      const ended = old?.attempt?.kind === "signIn" && status.attempt?.kind !== "signIn";
      if (!rows) {
        if (ended && text) {
          if (focused) this.toast(signInToast(provider, true)); else this.pending.push({ provider, text, ended });
        } else if (ended && status.error) this.toast(signInToast(provider, false));
      } else if (text) {
        if (!focused) this.pending.push({ provider, text, ended });
        else if (this.ownedBy.has(provider)) rows.announce(text, false);
      }
      if (text) this.ownedBy.delete(provider);
    }
  }
  private prompted(event: AuthPromptEvent): void {
    if (!this.live) return;
    this.context(event.provider, { prompt: event.attemptId });
    if (this.ownedIds.includes(event.attemptId)) this.autoOpen(event);
    else if (this.starting > 0) this.held.push(event);
    // Otherwise the attempt was started elsewhere (CLI or MCP, owned by this window too): main opens its link (D15).
  }
  private autoOpen(event: AuthPromptEvent): void {
    if (!AUTO_OPEN.includes(event.provider) || this.opened.has(event.attemptId) || loopback(event.url)) return;
    this.opened.add(event.attemptId);
    void this.reply(event.provider, this.deps.api.openAgentSignInLink(event.provider, event.attemptId), "signIn");
  }
  private async reply(provider: Provider, call: Promise<AuthReply>, intent: "signIn" | "signOut"): Promise<void> {
    const result = await this.settle(call);
    if (this.live && !result.ok) this.refuse(provider, result.reason, intent);
  }
  // A rejected IPC call reads like a forged one: the latest state is read again.
  private settle<T>(call: Promise<T>): Promise<T | { ok: false; reason: "invalid" }> {
    return call.catch(() => ({ ok: false as const, reason: "invalid" as const }));
  }
  private rows(): RowsConsumer | null { return this.shown.at(-1) ?? null; }
  private toast(toast: SignInToast): void { for (const listener of this.toastListeners) listener(toast); }
  private status(provider: Provider) { return this.state.auth?.providers.find(p => p.provider === provider); }
  private context(provider: Provider, patch: ProviderContext): void {
    this.set({ contexts: { ...this.state.contexts, [provider]: { ...this.state.contexts[provider], ...patch } } });
  }
  private set(patch: Partial<AgentSignInState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}

// Kept in the window's sessionStorage, which a renderer reload keeps; failures only cost the reload case. The key
// predates the controller, so a reload during first run still finds the ids saved before it.
const OWNED_KEY = "doan.onboarding.ownedSignIns";
function rememberOwned(ids: readonly string[]): void { try { sessionStorage.setItem(OWNED_KEY, JSON.stringify(ids)); } catch { /* reload case only */ } }
function recallOwned(): string[] {
  try { const value: unknown = JSON.parse(sessionStorage.getItem(OWNED_KEY) ?? "[]"); return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []; } catch { return []; }
}

let shared: AgentSignIn | null = null;
// The renderer's one controller, started on first use and kept for the renderer's life.
export function agentSignIn(): AgentSignIn {
  if (!shared) {
    shared = new AgentSignIn({ api: window.doan, hasFocus: () => document.hasFocus(), remember: rememberOwned, recall: recallOwned });
    shared.start();
  }
  return shared;
}
