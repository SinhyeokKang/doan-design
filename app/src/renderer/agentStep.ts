import type { AuthPromptEvent, AuthReason, AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { DoanApi } from "../preload";
import {
  authListView, cancelledAnnouncement, MAX_PASTE, PROVIDER_NAMES, pasteDialog, pasteSubmittable, readyAnnouncements, replyEffect, stopDialog,
  type AuthCommand, type ProviderContext,
} from "./agentAuthView";
import { canAdvance, newerAuth, ownedSignIns } from "./onboardingScene";

type Api = Pick<DoanApi, "readAgentAuth" | "onAgentAuth" | "checkAgentAuth" | "signInAgent" | "signOutAgent" | "cancelAgentSignIn" |
  "submitAgentSignInCode" | "openAgentSignInLink" | "onAgentSignInPrompt">;
export interface AgentStepDeps {
  api: Api;
  // Resolves false when the page could not be opened.
  openInstall(provider: Provider): Promise<boolean>;
  hasFocus(): boolean;
  changed(): void;
  // Attempt ids this window started, kept across a renderer reload; agent-auth still names the window their owner.
  remember?(ids: readonly string[]): void;
  recall?(): string[];
}
export type AgentDialog =
  | { kind: "stop"; provider: Provider; intent: "signIn" | "signOut" }
  | { kind: "paste"; provider: Provider; attemptId: string; value: string; submitting: boolean };
// seq makes a repeated request distinct, so the component acts on each one once.
export interface AgentStepState {
  // undefined: not read yet. null: the account store is unreadable.
  auth: AuthSnapshot | null | undefined;
  contexts: Partial<Record<Provider, ProviderContext>>;
  dialog: AgentDialog | null;
  announcement: { text: string; seq: number } | null;
  focus: { target: "continue" | "paste"; provider?: Provider; seq: number } | null;
  installError: string | null;
  continuing: boolean;
}

// Providers whose check is free and whose state a check can settle: re-checked on step entry and on return from
// an install page (design '이동·취소·포커스 계약'). Copilot's check spends a model request, so only its Retry checks.
const AUTO_CHECK = new Set(["unverified", "tools_missing", "tools_failed"]);
// Cursor and Copilot open the browser themselves (2026-10-28 user), so only these links open on the first prompt.
const AUTO_OPEN: readonly Provider[] = ["claude", "codex", "antigravity"];
// Codex prints its local callback server before the auth page; opening the server's address shows nothing useful.
function loopback(url: string): boolean {
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname); } catch { return false; }
}

// The onboarding Agent step's state over agent-auth. It never judges readiness itself (authListView does), and it
// cancels only attempts this window started.
export class AgentStepSession {
  state: AgentStepState = { auth: undefined, contexts: {}, dialog: null, announcement: null, focus: null, installError: null, continuing: false };
  private live = false;
  private stops: (() => void)[] = [];
  private seq = 0;
  // Attempt ids this window started: Continue and Back cancel only these.
  private owned: string[];
  private opened = new Set<string>();
  // Sign-in calls of this window still waiting for their attempt id, and prompts that came before that id: a main
  // event and an invoke reply have no guaranteed order, so a prompt cannot be judged until the reply lands.
  private starting = 0;
  private held: AuthPromptEvent[] = [];
  // The provider of each sign-in this window started, until it settles: its ready change is announced here.
  private ownedBy = new Map<Provider, string>();
  // Replies that open a dialog belong to the Agent step only; one landing after Back or Continue is dropped.
  private onStep = false;
  private cancelled = new Set<Provider>();
  // Install pages opened, checked again when the window regains focus.
  private installs = new Set<Provider>();
  private pending: string[] = [];
  constructor(private readonly deps: AgentStepDeps) { this.owned = deps.recall?.() ?? []; }

  start(): void {
    this.live = true;
    const { api } = this.deps;
    this.stops.push(api.onAgentAuth(snapshot => this.apply(snapshot)), api.onAgentSignInPrompt(event => this.prompted(event)));
  }
  // Each entry to the Agent step reads, then checks what a free check can settle.
  enter(): void {
    this.onStep = true;
    void this.read().then(() => {
      if (!this.live) return;
      for (const status of this.providers()) if (status.provider !== "copilot" && !status.attempt && !status.readiness.ready && AUTO_CHECK.has(status.readiness.cause)) this.check(status.provider);
    });
  }
  dispose(): void {
    this.live = false;
    for (const stop of this.stops.splice(0)) stop();
  }
  view() { return authListView(this.state.auth, this.state.contexts, { autoCheck: true }); }
  canContinue(): boolean { return canAdvance(this.state.auth ?? null) && !this.state.continuing; }

  retryRead(): void { void this.read(); }
  // Returning from a browser or an install page: read everything; only install returns check, and never Copilot.
  windowFocused(): void {
    const installed = [...this.installs].filter(provider => provider !== "copilot");
    this.installs.clear();
    void this.read().then(() => { if (this.live) for (const provider of installed) this.check(provider); });
    this.flushAnnouncements();
  }

  command(provider: Provider, command: AuthCommand): void {
    if (!this.live) return;
    const attempt = this.status(provider)?.attempt;
    switch (command) {
      case "signIn": case "reauth": this.write(provider, "signIn"); return;
      case "signOut": this.write(provider, "signOut"); return;
      case "check": this.context(provider, { reply: null }); this.check(provider); return;
      case "install": case "update": void this.install(provider); return;
      case "cancel":
        if (attempt?.kind !== "signIn") return;
        this.cancelled.add(provider);
        void this.reply(provider, this.deps.api.cancelAgentSignIn(provider, attempt.id), "signIn");
        return;
      case "openLink":
        if (attempt?.kind !== "signIn") return;
        this.context(provider, { reply: null });
        void this.reply(provider, this.deps.api.openAgentSignInLink(provider, attempt.id), "signIn");
        return;
      case "pasteAddress":
        if (attempt?.kind !== "signIn") return;
        this.set({ dialog: { kind: "paste", provider, attemptId: attempt.id, value: "", submitting: false } });
        return;
      case "read": this.retryRead(); return;
      case "submitCode": case "dismiss": return;
    }
  }

  stopView() { const d = this.state.dialog; return d?.kind === "stop" ? stopDialog(d.provider, d.intent) : null; }
  pasteView() { return this.state.dialog?.kind === "paste" ? pasteDialog() : null; }
  pasteSubmittable(): boolean { const d = this.state.dialog; return d?.kind === "paste" && !d.submitting && pasteSubmittable(d.value); }
  // The field keeps the whole paste so a cut-off address is never submitted; the limit is shown instead.
  pasteTooLong(): boolean { const d = this.state.dialog; return d?.kind === "paste" && d.value.length > MAX_PASTE; }
  setPaste(value: string): void { const d = this.state.dialog; if (d?.kind === "paste") this.set({ dialog: { ...d, value } }); }
  async submitPaste(): Promise<void> {
    const d = this.state.dialog;
    if (d?.kind !== "paste" || !this.pasteSubmittable()) return;
    this.set({ dialog: { ...d, submitting: true } });
    const result = await this.settle(this.deps.api.submitAgentSignInCode(d.provider, d.attemptId, d.value));
    if (!this.live || this.state.dialog?.kind !== "paste") return;
    this.set({ dialog: null });
    this.focusOn("paste", d.provider);
    if (!result.ok) this.refused(d.provider, result.reason, "signIn");
  }
  async confirmStop(): Promise<void> {
    const d = this.state.dialog;
    if (d?.kind !== "stop") return;
    this.set({ dialog: null });
    await this.write(d.provider, d.intent, true);
  }
  // Escape or Cancel: a paste modal hands focus back to its Paste its address button.
  closeDialog(): void {
    const d = this.state.dialog;
    // A submitted address is answered before the modal goes, so a late reply cannot close a newer one.
    if (!d || (d.kind === "paste" && d.submitting)) return;
    this.set({ dialog: null });
    if (d.kind === "paste") this.focusOn("paste", d.provider);
  }

  // Continue with another provider ready cancels this window's own sign-ins still running (2026-10-28 user).
  async continue(): Promise<boolean> {
    if (!this.canContinue()) return false;
    this.set({ continuing: true });
    this.leave();
    await this.cancelOwned();
    if (this.live) this.set({ continuing: false });
    return true;
  }
  // Back keeps saved connections; only this window's running sign-ins are cancelled.
  async back(): Promise<void> { this.leave(); await this.cancelOwned(); }
  private leave(): void { this.onStep = false; if (this.state.dialog) this.set({ dialog: null }); }

  private async cancelOwned(): Promise<void> {
    const auth = this.state.auth ?? null;
    await Promise.all(ownedSignIns(auth, this.owned).map(({ provider, attemptId }) => this.settle(this.deps.api.cancelAgentSignIn(provider, attemptId))));
  }
  private async read(): Promise<void> {
    let snapshot: AuthSnapshot | null;
    try { snapshot = await this.deps.api.readAgentAuth(); } catch {
      // A failed call is not an unreadable store: a list already shown stays until the next read or event.
      snapshot = this.state.auth ? this.state.auth : null;
    }
    if (!this.live) return;
    if (snapshot === null) { this.set({ auth: null }); return; }
    this.apply(snapshot);
  }
  private apply(incoming: AuthSnapshot): void {
    if (!this.live) return;
    const previous = this.state.auth ?? null;
    const next = newerAuth(previous, incoming);
    if (next === previous) return;
    const contexts = { ...this.state.contexts };
    const holder = next.providers.find(p => p.attempt && p.attempt.kind !== "check");
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
        if (!status.readiness.ready && !status.error) this.announce(cancelledAnnouncement(provider));
      }
    }
    const paste = this.state.dialog?.kind === "paste" ? this.state.dialog : null;
    const pasteLive = paste && next.providers.some(p => p.provider === paste.provider && p.attempt?.kind === "signIn" && p.attempt.id === paste.attemptId);
    this.set({ auth: next, contexts, ...(paste && !pasteLive ? { dialog: null } : {}) });
    // The attempt behind the modal ended (the page loaded after all, or it was cancelled): nothing is left to submit.
    if (paste && !pasteLive) this.focusOn("paste", paste.provider);
    // A sign-in finishes in the browser: the change is announced once with role=status when the window regains focus,
    // which never raises the window (2026-10-28 user). One seen while the window has focus (a check, a Retry) is on
    // screen already and must not pull focus away from where the user is.
    // Conductor 2026-10-29: a sign-in this window started that turns ready while the window has focus (a pasted address,
    // a quick return) is still announced once, without moving focus.
    const focused = this.deps.hasFocus();
    for (const status of next.providers) {
      const became = readyAnnouncements(previous, { revision: next.revision, providers: [status] });
      if (became.length === 0) continue;
      if (!focused) this.pending.push(...became);
      else if (this.ownedBy.has(status.provider)) this.announce(became.join(". "));
      this.ownedBy.delete(status.provider);
    }
  }
  private flushAnnouncements(): void {
    if (!this.live || this.pending.length === 0) return;
    const text = this.pending.splice(0).join(". ");
    this.announce(text);
    if (canAdvance(this.state.auth ?? null)) this.focusOn("continue");
  }
  private prompted(event: AuthPromptEvent): void {
    if (!this.live) return;
    this.context(event.provider, { prompt: event.attemptId });
    if (this.owned.includes(event.attemptId)) this.autoOpen(event);
    else if (this.starting > 0) this.held.push(event);
    // Otherwise the attempt was started elsewhere (CLI or MCP, owned by this window too): main opens its link (D15).
  }
  private autoOpen(event: AuthPromptEvent): void {
    if (!AUTO_OPEN.includes(event.provider) || this.opened.has(event.attemptId) || loopback(event.url)) return;
    this.opened.add(event.attemptId);
    void this.reply(event.provider, this.deps.api.openAgentSignInLink(event.provider, event.attemptId), "signIn");
  }
  // A check already on its way is not sent again (a second entry before its snapshot shows the attempt).
  private checking = new Set<Provider>();
  private check(provider: Provider): void {
    if (this.checking.has(provider)) return;
    this.checking.add(provider);
    void this.settle(this.deps.api.checkAgentAuth(provider)).then(result => {
      this.checking.delete(provider);
      if (!result.ok) this.refused(provider, result.reason, "signIn");
    });
  }
  private async write(provider: Provider, intent: "signIn" | "signOut", stop = false): Promise<void> {
    this.context(provider, { reply: null });
    const signIn = intent === "signIn";
    if (signIn) this.starting++;
    const call = signIn ? this.deps.api.signInAgent(provider, stop ? { stop: true } : {}) : this.deps.api.signOutAgent(provider, stop ? { stop: true } : {});
    const result = await this.settle(call);
    if (signIn) this.starting--;
    if (!this.live) return;
    if (result.ok && "attemptId" in result && signIn) { this.owned.push(result.attemptId); this.ownedBy.set(provider, result.attemptId); this.deps.remember?.(this.owned); }
    if (signIn) {
      const held = this.held;
      this.held = this.starting > 0 ? held.filter(event => !this.owned.includes(event.attemptId)) : [];
      for (const event of held) if (this.owned.includes(event.attemptId)) this.autoOpen(event);
    }
    if (!result.ok) this.refused(provider, result.reason, intent);
  }
  // Only the latest Install or Update result is shown (POSTMORTEM 2026-10-25, an older install failure).
  private installRequests = 0;
  private async install(provider: Provider): Promise<void> {
    const request = ++this.installRequests;
    this.set({ installError: null });
    const opened = await this.deps.openInstall(provider).catch(() => false);
    if (!this.live) return;
    // Every page that opened is checked on return; only the latest result decides the error line.
    if (opened) this.installs.add(provider);
    if (request === this.installRequests && !opened) this.set({ installError: `Couldn’t open the ${PROVIDER_NAMES[provider]} install page.` });
  }
  private async reply(provider: Provider, call: Promise<{ ok: true } | { ok: false; reason: AuthReason }>, intent: "signIn" | "signOut"): Promise<void> {
    const result = await this.settle(call);
    if (this.live && !result.ok) this.refused(provider, result.reason, intent);
  }
  private replyAttempt = new Map<Provider, string>();
  private refused(provider: Provider, reason: AuthReason, intent: "signIn" | "signOut"): void {
    if (!this.live) return;
    switch (replyEffect(reason)) {
      case "dialog": if (this.onStep) this.set({ dialog: { kind: "stop", provider, intent } }); return;
      case "reread": void this.read(); return;
      case "show": {
        const attempt = this.status(provider)?.attempt;
        if (attempt) this.replyAttempt.set(provider, attempt.id);
        this.context(provider, { reply: reason });
      }
    }
  }
  // A rejected IPC call reads like a forged one: the latest state is read again.
  private settle<T>(call: Promise<T>): Promise<T | { ok: false; reason: "invalid" }> {
    return call.catch(() => ({ ok: false as const, reason: "invalid" as const }));
  }
  private announce(text: string): void { this.set({ announcement: { text, seq: ++this.seq } }); }
  private focusOn(target: "continue" | "paste", provider?: Provider): void { this.set({ focus: { target, ...(provider ? { provider } : {}), seq: ++this.seq } }); }
  private providers() { return this.state.auth?.providers ?? []; }
  private status(provider: Provider) { return this.providers().find(p => p.provider === provider); }
  private context(provider: Provider, patch: ProviderContext): void {
    this.set({ contexts: { ...this.state.contexts, [provider]: { ...this.state.contexts[provider], ...patch } } });
  }
  private set(patch: Partial<AgentStepState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.changed();
  }
}
