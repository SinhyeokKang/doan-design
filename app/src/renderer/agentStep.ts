import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { DoanApi } from "../preload";
import {
  authListView, MAX_PASTE, PROVIDER_NAMES, pasteDialog, pasteSubmittable, stopDialog,
  type AuthCommand, type ProviderContext,
} from "./agentAuthView";
import { AgentSignIn } from "./agentSignIn";
import { canAdvance } from "./onboardingScene";

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
  // The renderer's sign-in controller. Without one the step keeps a private controller and disposes it with itself.
  signIn?: AgentSignIn;
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
type OwnState = Omit<AgentStepState, "auth" | "contexts">;

// Providers whose check is free and whose state a check can settle: re-checked on step entry and on return from
// an install page (design '이동·취소·포커스 계약'). Copilot's check spends a model request, so only its Retry checks.
const AUTO_CHECK = new Set(["unverified", "tools_missing", "tools_failed"]);

// The onboarding Agent step's state over the renderer's sign-in controller. It never judges readiness itself
// (authListView does), and it cancels only attempts this renderer started.
export class AgentStepSession {
  private own: OwnState = { dialog: null, announcement: null, focus: null, installError: null, continuing: false };
  private live = false;
  private stops: (() => void)[] = [];
  private seq = 0;
  private readonly signIn: AgentSignIn;
  private readonly owner: boolean;
  // Replies that open a dialog belong to the Agent step only; one landing after Back or Continue is dropped.
  private onStep = false;
  // Install pages opened, checked again when the window regains focus.
  private installs = new Set<Provider>();
  constructor(private readonly deps: AgentStepDeps) {
    this.owner = !deps.signIn;
    this.signIn = deps.signIn ?? new AgentSignIn({ api: deps.api, hasFocus: () => deps.hasFocus(), remember: ids => deps.remember?.(ids), recall: () => deps.recall?.() ?? [] });
  }

  get state(): AgentStepState { return { ...this.own, auth: this.signIn.state.auth, contexts: this.signIn.state.contexts }; }

  // The wizard shows the rows for its whole life, so first-run announcements stay on its live region as before.
  start(): void {
    this.live = true;
    this.signIn.start();
    this.stops.push(this.signIn.subscribe(() => { this.followPaste(); this.deps.changed(); }), this.signIn.show({
      announce: (text, returning) => {
        this.announce(text);
        if (returning && canAdvance(this.signIn.state.auth ?? null)) this.focusOn("continue");
      },
      dialog: (provider, intent) => { if (this.onStep) this.set({ dialog: { kind: "stop", provider, intent } }); },
    }));
  }
  // Each entry to the Agent step reads, then checks what a free check can settle.
  enter(): void {
    this.onStep = true;
    void this.signIn.read().then(() => {
      if (!this.live) return;
      for (const status of this.providers()) if (status.provider !== "copilot" && !status.attempt && !status.readiness.ready && AUTO_CHECK.has(status.readiness.cause)) this.signIn.check(status.provider);
    });
  }
  dispose(): void {
    this.live = false;
    for (const stop of this.stops.splice(0)) stop();
    if (this.owner) this.signIn.dispose();
  }
  view() { return authListView(this.signIn.state.auth, this.signIn.state.contexts, { autoCheck: true }); }
  canContinue(): boolean { return canAdvance(this.signIn.state.auth ?? null) && !this.own.continuing; }

  retryRead(): void { void this.signIn.read(); }
  // Returning from a browser or an install page: read everything; only install returns check. Copilot is checked only
  // while its cause is the CLI or its version, when a check re-reads tool facts and spends no request (D21).
  windowFocused(): void {
    const installed = [...this.installs];
    this.installs.clear();
    void this.signIn.read().then(() => {
      if (!this.live) return;
      for (const provider of installed) {
        const r = this.status(provider)?.readiness;
        if (provider !== "copilot" || (r && !r.ready && (r.cause === "cli_missing" || r.cause.startsWith("version_")))) this.signIn.check(provider);
      }
    });
    this.signIn.windowFocused();
  }

  command(provider: Provider, command: AuthCommand): void {
    if (!this.live) return;
    const attempt = this.status(provider)?.attempt;
    switch (command) {
      case "signIn": case "reauth": void this.signIn.signIn(provider); return;
      case "signOut": void this.signIn.signOut(provider); return;
      case "check": this.signIn.checkAgain(provider); return;
      case "install": case "update": void this.install(provider); return;
      case "cancel": this.signIn.cancel(provider); return;
      case "openLink": this.signIn.openLink(provider); return;
      case "pasteAddress":
        if (attempt?.kind !== "signIn") return;
        this.set({ dialog: { kind: "paste", provider, attemptId: attempt.id, value: "", submitting: false } });
        return;
      case "read": this.retryRead(); return;
      case "submitCode": case "dismiss": return;
    }
  }

  stopView() { const d = this.own.dialog; return d?.kind === "stop" ? stopDialog(d.provider, d.intent) : null; }
  pasteView() { return this.own.dialog?.kind === "paste" ? pasteDialog() : null; }
  pasteSubmittable(): boolean { const d = this.own.dialog; return d?.kind === "paste" && !d.submitting && pasteSubmittable(d.value); }
  // The field keeps the whole paste so a cut-off address is never submitted; the limit is shown instead.
  pasteTooLong(): boolean { const d = this.own.dialog; return d?.kind === "paste" && d.value.length > MAX_PASTE; }
  setPaste(value: string): void { const d = this.own.dialog; if (d?.kind === "paste") this.set({ dialog: { ...d, value } }); }
  async submitPaste(): Promise<void> {
    const d = this.own.dialog;
    if (d?.kind !== "paste" || !this.pasteSubmittable()) return;
    this.set({ dialog: { ...d, submitting: true } });
    const result = await this.signIn.submitCode(d.provider, d.attemptId, d.value);
    if (!this.live || this.own.dialog?.kind !== "paste") return;
    this.set({ dialog: null });
    this.focusOn("paste", d.provider);
    if (!result.ok) this.signIn.refuse(d.provider, result.reason, "signIn");
  }
  async confirmStop(): Promise<void> {
    const d = this.own.dialog;
    if (d?.kind !== "stop") return;
    this.set({ dialog: null });
    await (d.intent === "signIn" ? this.signIn.signIn(d.provider, true) : this.signIn.signOut(d.provider, true));
  }
  // Escape or Cancel: a paste modal hands focus back to its Paste its address button.
  closeDialog(): void {
    const d = this.own.dialog;
    // A submitted address is answered before the modal goes, so a late reply cannot close a newer one.
    if (!d || (d.kind === "paste" && d.submitting)) return;
    this.set({ dialog: null });
    if (d.kind === "paste") this.focusOn("paste", d.provider);
  }

  // Continue with another provider ready cancels this renderer's own sign-ins still running (2026-10-28 user).
  async continue(): Promise<boolean> {
    if (!this.canContinue()) return false;
    this.set({ continuing: true });
    this.leave();
    await this.signIn.cancelOwned();
    if (this.live) this.set({ continuing: false });
    return true;
  }
  // Back keeps saved connections; only this renderer's running sign-ins are cancelled.
  async back(): Promise<void> { this.leave(); await this.signIn.cancelOwned(); }
  private leave(): void { this.onStep = false; if (this.own.dialog) this.set({ dialog: null }); }

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
  // The attempt behind the paste modal ended (the page loaded after all, or it was cancelled): nothing is left to submit.
  private followPaste(): void {
    const d = this.own.dialog, auth = this.signIn.state.auth;
    if (d?.kind !== "paste" || !auth || auth.providers.some(p => p.provider === d.provider && p.attempt?.kind === "signIn" && p.attempt.id === d.attemptId)) return;
    this.own = { ...this.own, dialog: null, focus: { target: "paste", provider: d.provider, seq: ++this.seq } };
  }
  private announce(text: string): void { this.set({ announcement: { text, seq: ++this.seq } }); }
  private focusOn(target: "continue" | "paste", provider?: Provider): void { this.set({ focus: { target, ...(provider ? { provider } : {}), seq: ++this.seq } }); }
  private providers() { return this.signIn.state.auth?.providers ?? []; }
  private status(provider: Provider) { return this.providers().find(p => p.provider === provider); }
  private set(patch: Partial<OwnState>): void {
    this.own = { ...this.own, ...patch };
    this.deps.changed();
  }
}
