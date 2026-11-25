import type { AuthReason, AuthSnapshot } from "../main/agentAuth/ipc";
import type { AuthAttempt, AuthErrorCode, AuthStatusDto, Provider } from "../main/agentAuth/types";
import type { InstallResult } from "../main/installCommand";
import type { SettingsTarget } from "./settingsSections";

// Shared by onboarding, Settings, Home and conversations. States come from agent-auth DTOs only, never re-judged here.
export const PROVIDER_NAMES: Record<Provider, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor", antigravity: "Antigravity", copilot: "GitHub Copilot" };
const VENDORS: Record<Provider, string> = { claude: "Anthropic", codex: "OpenAI", cursor: "Cursor", antigravity: "Google", copilot: "GitHub" };
// The sign-in CLIs of these providers open the default browser themselves.
const OPENS_OWN_BROWSER: readonly Provider[] = ["codex", "cursor", "copilot"];
export const MAX_PASTE = 16384;

export type AuthCommand = "install" | "update" | "installPage" | "signIn" | "reauth" | "signOut" | "check" | "cancel" | "openLink" | "pasteAddress" | "submitCode" | "read" | "dismiss";
// note: the Copilot request cost.
export interface Button<C extends string = AuthCommand> { command: C; label: string; variant: "prominent" | "subtle" | "ghost"; disabled: boolean; ariaLabel?: string; note?: string }
export type AuthButton = Button;
export interface Notice<C extends string = AuthCommand> { role: "status" | "alert"; spinner: boolean; title?: string; body?: string; note?: string; actions: Button<C>[] }
export interface ProviderView {
  provider: Provider; name: string;
  // null when a connected account has nothing to show (Codex and Antigravity when their lookup found no email).
  detail: string | null; detailRole: "status" | null;
  // States with a notice put their buttons in the notice instead.
  button: AuthButton | null; helper: string | null; notice: Notice | null;
  paste: { prompt: string; button: AuthButton } | null;
  // Settings only: a connected row's extra Sign out, unless the row already offers one.
  signOut: AuthButton | null;
}
// prompt: the attemptId of the last sign-in link received. autoCheck: the consumer checks unverified connections itself
// when its screen opens, so the row may say so.
export interface ProviderContext { prompt?: string | null; reply?: AuthReason | null; failures?: number; busyWith?: Provider | null; autoCheck?: boolean; settings?: boolean; install?: InstallState | null }
// checked: the window came back after it opened, and the return check ran.
export interface InstallState { provider: Provider; action: "install" | "update"; result: InstallResult; checked: boolean }

function button<C extends string>(command: C, label: string, variant: Button["variant"] = "prominent", disabled = false, ariaLabel?: string): Button<C> {
  return { command, label, variant, disabled, ...(ariaLabel ? { ariaLabel } : {}) };
}
function alert<C extends string>(body: string, actions: Button<C>[], title?: string): Notice<C> { return { role: "alert", spinner: false, ...(title ? { title } : {}), body, actions }; }
function progress(title: string, actions: AuthButton[], body?: string): Notice { return { role: "status", spinner: true, title, ...(body ? { body } : {}), actions }; }
function disable(view: ProviderView): ProviderView {
  const off = (b: AuthButton): AuthButton => ({ ...b, disabled: true });
  return { ...view, button: view.button && off(view.button), notice: view.notice && { ...view.notice, actions: view.notice.actions.map(off) }, paste: view.paste && { ...view.paste, button: off(view.paste.button) }, signOut: view.signOut && off(view.signOut) };
}

// Copilot's check spends one model request; a version cause only re-reads tool facts. The unverified row carries the
// cost in its detail line instead.
function check(provider: Provider, label: string, free: boolean): AuthButton {
  if (provider !== "copilot" || free) return button("check", label);
  // The accessible name starts with the visible label (WCAG 2.5.3), so voice control finds it.
  const name = label === "Retry" ? `Retry checking ${PROVIDER_NAMES[provider]}` : `Check ${PROVIDER_NAMES[provider]} again`;
  return { ...button("check", label, "prominent", false, `${name}, uses one Copilot request`), note: "Uses one Copilot request" };
}
function errorNotice(status: AuthStatusDto, ctx: ProviderContext): Notice | null {
  const name = PROVIDER_NAMES[status.provider], connected = status.account !== null;
  const signIn = button("signIn", "Sign in"), retry = check(status.provider, "Retry", false);
  switch (status.error?.code) {
    case "sign_in_failed":
      return alert((ctx.failures ?? 0) >= 2 ? `Sign-in to ${name} keeps failing. Check your browser and network, or connect another agent.` : "Sign-in didn’t finish. Try again.", [signIn]);
    case "network": return alert(`Couldn’t reach ${name}. Check your connection and try again.`, [connected ? retry : signIn]);
    case "storage_failed": return alert("Couldn’t save this connection securely. Allow Doan to use your Keychain, then sign in again.", [signIn]);
    case "cli_install_failed": return alert(`Couldn’t download ${name}’s sign-in server. Check your connection and try again.`, [connected ? retry : signIn]);
    case "check_failed": return alert("Couldn’t check your connections.", [connected ? retry : signIn]);
    default: return null;
  }
}

function readinessView(status: AuthStatusDto, ctx: ProviderContext, view: ProviderView): ProviderView {
  const { provider } = status, name = PROVIDER_NAMES[provider], r = status.readiness;
  const reauth = [button("signOut", "Sign out", "subtle"), button("reauth", "Sign in again")];
  // Settings sorts rows into Connected and Not connected, so a ready row needs no Connected button of its own.
  if (r.ready) return ctx.settings ? view : { ...view, button: button("signIn", "Connected", "prominent", true, `Connected to ${name}`) };
  switch (r.cause) {
    case "cli_missing": case "version_unsupported": return {
      ...view, detail: r.cause === "cli_missing" ? "Not installed" : "This version is older than Doan supports.", ...installRowView({ cause: r.cause }, ctx.install ?? null, name),
    };
    case "version_unknown": return { ...view, notice: alert(`Check that ${name} is installed correctly, then check again.`, [check(provider, "Check again", true)], `Couldn’t read the ${name} version`) };
    case "version_incompatible": return { ...view, notice: alert(`Update ${name} or wait for a Doan update, then check again.`, [check(provider, "Check again", true)], `Doan can’t run this ${name} version`) };
    case "sign_out_failed": return { ...view, notice: alert(`Doan couldn’t sign out of ${name}. Sign out again before you use it.`, [button("signOut", "Sign out")]) };
    case "account_mismatch": {
      // Main reports a different account and a different organization (Copilot: host) as one code.
      const part = provider === "claude" ? "organization" : provider === "copilot" ? "host" : null;
      return { ...view, notice: alert(part ? `You signed in with a different ${name} account or ${part}. Sign in again with the same account and ${part}, or sign out first.` : `You signed in with a different ${name} account. Sign in again with the same account, or sign out first.`, reauth) };
    }
    case "reauth_required": {
      // A failed Sign in again keeps the connection, so its error is shown with the same recovery buttons.
      const failed = errorNotice(status, ctx)?.body;
      // Expiry settles as phase reauthRequired; otherwise only a Claude connection without an organization needs reauth.
      const organization = provider === "claude" && status.phase !== "reauthRequired";
      return { ...view, notice: alert(failed ?? (organization ? `Sign in to ${name} again so Doan can confirm your organization.` : `Your ${name} sign-in expired. Sign in again.`), reauth) };
    }
    case "tools_missing": case "tools_failed": return { ...view, notice: alert("Doan couldn’t find its command-line tool. Reinstall Doan, then check again.", [check(provider, "Check again", false)]) };
    case "not_connected": {
      const notice = errorNotice(status, ctx);
      return notice ? { ...view, notice } : { ...view, button: button("signIn", "Sign in", "prominent", false, `Sign in to ${name}`) };
    }
    case "unverified": {
      const notice = errorNotice(status, ctx);
      if (notice) return { ...view, notice };
      const copilot = provider === "copilot";
      // Settings checks with Check, not first run's Retry, and says the Copilot cost below the row.
      if (ctx.settings) return {
        ...view, detail: view.detail === null ? "Not checked" : `${view.detail} · not checked`,
        button: button("check", "Check", "subtle", false, copilot ? `Check ${name}, uses one Copilot request` : `Check ${name}`),
        helper: copilot ? "Checking uses one Copilot request." : ctx.autoCheck ? "Doan checks this automatically when you open Agents." : null,
      };
      return {
        ...view, detail: copilot ? "Connected · not checked · Retry uses one Copilot request" : "Connected · not checked",
        button: button("check", "Retry", "prominent", false, copilot ? `Retry checking ${name}, uses one Copilot request` : `Retry checking ${name}`),
        helper: !copilot && ctx.autoCheck ? "Doan checks this automatically when you open this step." : null,
      };
    }
    // agent-auth never sends busy without an attempt; keep the row inert until the next snapshot.
    case "busy": return { ...view, button: button("signIn", "Sign in", "prominent", true, `Sign in to ${name}`) };
  }
}

// A state left from the other action reads as before the click.
export function installRowView(readiness: { cause: "cli_missing" | "version_unsupported" }, install: InstallState | null, name: string): Pick<ProviderView, "button" | "helper" | "notice"> {
  const action = readiness.cause === "cli_missing" ? "install" : "update";
  const label = action === "install" ? "Install" : "Update";
  const before = `After you ${action} it, Doan checks again when you return.`;
  const primary = button(action, label, "prominent", false, `${label} ${name}`);
  const state = install?.action === action ? install : null;
  switch (state?.result) {
    case undefined: return { button: primary, helper: before, notice: null };
    case "failed": return { button: primary, helper: null, notice: alert(`Couldn’t open Terminal to ${action} ${name}. Open the install page to ${action} it yourself.`, [button("installPage", "Open install page", "prominent", false, `Open the ${name} install page`)]) };
    case "pageFailed": return { button: primary, helper: null, notice: alert(`Couldn’t open the ${name} install page.`, []) };
    case "terminal": case "page": {
      const helper = state.result === "terminal" ? `Terminal is open with the ${action} command. Press Return there, then come back to Doan.` : before;
      // The return check already ran, so the cause is still there: this check re-reads tool facts and costs nothing.
      return { button: state.checked ? button("check", "Check again", "prominent", false, `Check ${name} again`) : primary, helper, notice: null };
    }
  }
}
export function installedAnnouncement(provider: Provider, action: InstallState["action"]): string { return `${PROVIDER_NAMES[provider]} is ${action === "install" ? "installed" : "updated"}.`; }

export function providerView(status: AuthStatusDto, ctx: ProviderContext = {}): ProviderView {
  const { provider, attempt } = status, name = PROVIDER_NAMES[provider];
  const account = status.account && (status.account.email ?? status.account.displayName ?? null);
  const view: ProviderView = { provider, name, detail: status.account ? account : VENDORS[provider], detailRole: null, button: null, helper: null, notice: null, paste: null, signOut: null };
  const signInDisabled = button("signIn", "Sign in", "prominent", true, `Sign in to ${name}`);
  // Ownership is not inferred: after a reload or a CLI-started sign-in this window may own the attempt without knowing
  // its id. Only agent-auth's not_owner says otherwise; in Settings the other owner is the CLI.
  if (ctx.reply === "not_owner") return { ...view, detail: ctx.settings ? "Finish this sign-in where it started." : "Finish this sign-in in the window that started it.", detailRole: "status", button: signInDisabled };
  if (attempt?.kind === "signIn") {
    const prompted = ctx.prompt === attempt.id, cancel = button("cancel", "Cancel", "subtle");
    let waiting: ProviderView;
    if (ctx.reply === "open_failed") waiting = { ...view, notice: alert("Couldn’t open your browser. Try again.", [cancel, button("openLink", "Open browser")]) };
    else if (!prompted) waiting = { ...view, notice: progress(`Preparing ${name} sign-in`, [cancel, button("openLink", "Open browser", "subtle", true)], provider === "antigravity" ? "The first sign-in downloads Antigravity’s sign-in server. This can take a moment." : undefined) };
    else waiting = {
      ...view,
      notice: progress(`Finish signing in to ${name}`, [cancel, button("openLink", "Open again", "subtle")], OPENS_OWN_BROWSER.includes(provider) ? "A browser tab may already be open. Complete sign-in there, then return here." : "Complete sign-in in your browser, then return here."),
      paste: provider === "antigravity" && !attempt.cancelling ? { prompt: "Browser page didn’t load?", button: button("pasteAddress", "Paste its address", "ghost") } : null,
    };
    return attempt.cancelling ? disable(waiting) : waiting;
  }
  if (attempt?.kind === "signOut") return { ...view, notice: progress(`Signing out of ${name}`, []) };
  if (ctx.reply === "busy") {
    const busy = { ...view, detail: `Finish or cancel the ${ctx.busyWith ? PROVIDER_NAMES[ctx.busyWith] : "other"} sign-in first.`, detailRole: "status" as const };
    // A refused Sign out on a Settings Connected row: the row keeps its own action, not first run's Sign in.
    if (ctx.settings && status.account !== null) return disable(withSignOut(status, ctx, busy));
    return { ...busy, button: signInDisabled };
  }
  const settled = withSignOut(status, ctx, readinessView(status, ctx, view));
  return attempt?.kind === "check" ? disable(settled) : settled;
}

// Agent usage shows it for a connection that can't be used (ARCHITECTURE §7 'Agent usage'), so the two never word one
// state differently.
export function connectionLine(provider: Provider, facts: Pick<AuthStatusDto, "phase" | "readiness"> & { error?: AuthErrorCode; attempt?: AuthAttempt["kind"] }): string {
  // The wording never reads the revision, generation, actions, attempt ID or retryable flag.
  const status: AuthStatusDto = {
    provider, revision: 0, generation: 0, phase: facts.phase, account: {}, readiness: facts.readiness, actions: [],
    attempt: facts.attempt ? { id: "", kind: facts.attempt, cancelling: false } : null, error: facts.error ? { code: facts.error, retryable: false } : null,
  };
  const view = providerView(status, { settings: true });
  // Only a busy row without an attempt, which agent-auth never produces, has no sentence of its own.
  return view.notice?.title ?? view.notice?.body ?? view.detail ?? "Not available right now";
}

// Settings keeps Sign out on every connected row, once; first run shows it only to recover.
function withSignOut(status: AuthStatusDto, ctx: ProviderContext, view: ProviderView): ProviderView {
  if (!ctx.settings || status.account === null) return view;
  if ([view.button, ...(view.notice?.actions ?? [])].some(b => b?.command === "signOut")) return view;
  return { ...view, signOut: button("signOut", "Sign out", "subtle", false, `Sign out of ${view.name}`) };
}

// One table, so Home's picker and Settings never name one cause differently.
const BLOCKED = {
  expired: { short: "Sign-in expired", sentence: (name: string) => `${name}’s sign-in expired` },
  update: { short: "Needs an update", sentence: (name: string) => `${name} needs an update` },
  incompatible: { short: "Incompatible version", sentence: (name: string) => `Doan can’t run this ${name} version` },
  missing: { short: "Not installed", sentence: (name: string) => `${name} isn’t installed` },
  other: { short: "Not available right now", sentence: (name: string) => `${name} isn’t available right now` },
};
// null: ready, unverified (main checks it on send) or not connected.
function blocked(status: AuthStatusDto): (typeof BLOCKED)[keyof typeof BLOCKED] | null {
  const r = status.readiness;
  if (r.ready) return null;
  switch (r.cause) {
    case "not_connected": case "unverified": return null;
    case "reauth_required": return status.phase === "reauthRequired" ? BLOCKED.expired : BLOCKED.other;
    case "version_unsupported": return BLOCKED.update;
    case "version_incompatible": return BLOCKED.incompatible;
    case "cli_missing": return BLOCKED.missing;
    default: return BLOCKED.other;
  }
}

// null: ready, or not connected (Home doesn't list it). Unverified stays selectable because main checks it on send.
export function providerShortStatus(status: AuthStatusDto): string | null {
  if (!status.readiness.ready && status.readiness.cause === "unverified") return "Checks your connection when you send.";
  return blocked(status)?.short ?? null;
}

export function providerUnavailableReason(provider: Provider, status: AuthStatusDto | undefined): string {
  const name = PROVIDER_NAMES[provider];
  if (!status || status.account === null) return `${name} isn’t signed in`;
  return (blocked(status) ?? BLOCKED.other).sentence(name);
}

// dialog: confirm stopping runs, then resend with stop. reread: read the latest state.
export function replyEffect(reason: AuthReason): "show" | "dialog" | "reread" {
  switch (reason) {
    case "busy": case "not_owner": case "open_failed": return "show";
    case "stop_required": return "dialog";
    case "stale": case "invalid": case "not_connected": case "sign_out_failed": return "reread";
  }
}

// null: the account store is unreadable and every other call fails. shared: context every row gets, before its own.
export function authListView(auth: AuthSnapshot | null | undefined, contexts: Partial<Record<Provider, ProviderContext>> = {}, shared: ProviderContext = {}): { notice: Notice | null; providers: ProviderView[]; anyReady: boolean } {
  if (auth === null) return { notice: alert("Doan couldn’t read its agent connections.", [button("read", "Retry")]), providers: [], anyReady: false };
  if (auth === undefined) return { notice: progress("Checking connections", []), providers: [], anyReady: false };
  const holder = auth.providers.find(p => p.attempt && p.attempt.kind !== "check")?.provider ?? null;
  return {
    notice: auth.providers.some(p => p.attempt?.kind === "check") ? progress("Checking connections", []) : null,
    providers: auth.providers.map(p => providerView(p, { busyWith: holder, ...shared, ...contexts[p.provider] })),
    anyReady: auth.providers.some(p => p.readiness.ready),
  };
}

// A row keeps its provider, so focus on its group follows it into the other section.
export interface AgentsSection { id: "connected" | "notConnected"; title: string; providers: ProviderView[] }
export function agentsSettingsView(auth: AuthSnapshot | null | undefined, contexts: Partial<Record<Provider, ProviderContext>> = {}, shared: ProviderContext = {}): { notice: Notice | null; sections: AgentsSection[]; anyReady: boolean } {
  const list = authListView(auth, contexts, { ...shared, settings: true });
  const saved = new Set(auth?.providers.filter(p => p.account !== null).map(p => p.provider));
  const sections: AgentsSection[] = [
    { id: "connected", title: "Connected", providers: list.providers.filter(view => saved.has(view.provider)) },
    { id: "notConnected", title: "Not connected", providers: list.providers.filter(view => !saved.has(view.provider)) },
  ];
  return { notice: list.notice, sections: sections.filter(section => section.providers.length > 0), anyReady: list.anyReady };
}

// A row that can run (unverified included: main checks it on send) and a provider without a connection have none.
export interface SettingsAction { label: string; target: SettingsTarget }
export function pickerAction(status: AuthStatusDto): SettingsAction | null {
  const r = status.readiness;
  if (status.account === null || r.ready || r.cause === "unverified") return null;
  const target: SettingsTarget = { section: "agents", provider: status.provider };
  if (r.cause === "reauth_required" && status.phase === "reauthRequired") return { label: "Sign in again", target };
  if (r.cause === "version_unsupported") return { label: "Update", target };
  return { label: "Open Agents settings", target };
}
// Providers without a connection are not listed, so the last item is how a new one is added.
export function pickerFooter(anyRunnable: boolean): { note: string | null; action: SettingsAction } {
  return anyRunnable
    ? { note: null, action: { label: "Manage agents", target: { section: "agents" } } }
    : { note: "No agent is ready to run.", action: { label: "Sign in to an agent", target: { section: "agents" } } };
}

// The window is not raised.
export function signInToast(provider: Provider, ok: boolean): { text: string; action: SettingsAction | null } {
  const name = PROVIDER_NAMES[provider];
  return ok ? { text: `${name} connected.`, action: null } : { text: `${name} sign-in didn’t finish.`, action: { label: "Open Agents settings", target: { section: "agents", provider } } };
}

// Completion needs a ready agent at the moment it is saved.
export function noAgentReadyNotice(auth: AuthSnapshot | null): Notice<"chooseFolder" | "backToAgents"> | null {
  if (auth?.providers.some(p => p.readiness.ready)) return null;
  return { ...alert("No agent is ready. Go back and connect an agent to finish setup.", [button("chooseFolder", "Choose another folder", "subtle"), button("backToAgents", "Back to agents")]), note: "Your project selection stays here." };
}

// Announced once with role=status; the window is never raised for it.
export function readyAnnouncements(previous: AuthSnapshot | null, next: AuthSnapshot): string[] {
  if (!previous) return [];
  return next.providers.filter(p => p.readiness.ready && previous.providers.some(old => old.provider === p.provider && !old.readiness.ready)).map(p => `${PROVIDER_NAMES[p.provider]} connected`);
}
export function cancelledAnnouncement(provider: Provider): string { return `${PROVIDER_NAMES[provider]} sign-in was cancelled.`; }

export function stopDialog(provider: Provider, intent: "signIn" | "signOut"): { title: string; body: string; cancel: Button<"dismiss">; confirm: Button<"signIn" | "signOut"> } {
  const name = PROVIDER_NAMES[provider];
  return {
    title: `Stop ${name} conversations?`,
    // Doan does not pass how many run, so "every running" must read right for one or several.
    body: `${intent === "signOut" ? "Signing out" : "Signing in again"} stops every running ${name} conversation. Your conversation history stays.${intent === "signOut" && (provider === "claude" || provider === "codex") ? " Its MCP connectors need connecting again." : ""}`,
    cancel: button("dismiss", "Cancel", "subtle"), confirm: button(intent, intent === "signOut" ? "Stop and sign out" : "Stop and sign in again"),
  };
}

export function pasteDialog(): { title: string; body: string; inputLabel: string; placeholder: string; maxLength: number; cancel: Button<"dismiss">; submit: Button<"submitCode"> } {
  return {
    title: "Paste the page address", body: "Copy the address from the browser tab that didn’t load and paste it here to finish signing in to Antigravity.",
    inputLabel: "Page address", placeholder: "Page address from your browser", maxLength: MAX_PASTE, cancel: button("dismiss", "Cancel", "subtle"), submit: button("submitCode", "Submit"),
  };
}
export function pasteSubmittable(value: string): boolean { return value.trim() !== "" && value.length <= MAX_PASTE; }
