import type { AuthReason, AuthSnapshot } from "../main/agentAuth/ipc";
import type { AuthStatusDto, Provider } from "../main/agentAuth/types";

// Shared by onboarding, Settings, Home and conversations (2026-10-28 user). Copy follows the approved
// buzz-onboarding draft's Authentication states tiles; states come from agent-auth DTOs only, never re-judged here.
export const PROVIDER_NAMES: Record<Provider, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor", antigravity: "Antigravity", copilot: "GitHub Copilot" };
const VENDORS: Record<Provider, string> = { claude: "Anthropic", codex: "OpenAI", cursor: "Cursor", antigravity: "Google", copilot: "GitHub" };
// Cursor and Copilot sign-in CLIs open the default browser themselves (accepted limit, 2026-10-28 user).
const OPENS_OWN_BROWSER: readonly Provider[] = ["cursor", "copilot"];
export const MAX_PASTE = 16384;

export type AuthCommand = "install" | "update" | "signIn" | "reauth" | "signOut" | "check" | "cancel" | "openLink" | "pasteAddress" | "submitCode" | "read" | "dismiss";
// note: visible text shown next to the button (the Copilot request cost).
export interface Button<C extends string = AuthCommand> { command: C; label: string; variant: "prominent" | "subtle" | "ghost"; disabled: boolean; ariaLabel?: string; note?: string }
export type AuthButton = Button;
// Errors are role=alert and progress is role=status with an aria-hidden spinner (design '이동·취소·포커스 계약').
export interface Notice<C extends string = AuthCommand> { role: "status" | "alert"; spinner: boolean; title?: string; body?: string; note?: string; actions: Button<C>[] }
export interface ProviderView {
  provider: Provider; name: string;
  // The line under the name; null when a connected account has nothing to show (Codex, Antigravity).
  detail: string | null; detailRole: "status" | null;
  // The row's own button; states with a notice put their buttons in the notice instead.
  button: AuthButton | null; helper: string | null; notice: Notice | null;
  // Antigravity's secondary line under a waiting notice, outside its button row.
  paste: { prompt: string; button: AuthButton } | null;
}
// What this window knows beyond the snapshot. prompt: the attemptId of the last sign-in link it received.
// reply: its last refused call for this provider. failures: sign_in_failed results in a row.
// busyWith: the provider whose sign-in or sign-out holds the lock. autoCheck: the consumer checks unverified
// connections itself when its screen opens (the onboarding Agent step), so the row may say so.
export interface ProviderContext { prompt?: string | null; reply?: AuthReason | null; failures?: number; busyWith?: Provider | null; autoCheck?: boolean }

function button<C extends string>(command: C, label: string, variant: Button["variant"] = "prominent", disabled = false, ariaLabel?: string): Button<C> {
  return { command, label, variant, disabled, ...(ariaLabel ? { ariaLabel } : {}) };
}
function alert<C extends string>(body: string, actions: Button<C>[], title?: string): Notice<C> { return { role: "alert", spinner: false, ...(title ? { title } : {}), body, actions }; }
function progress(title: string, actions: AuthButton[], body?: string): Notice { return { role: "status", spinner: true, title, ...(body ? { body } : {}), actions }; }
function disable(view: ProviderView): ProviderView {
  const off = (b: AuthButton): AuthButton => ({ ...b, disabled: true });
  return { ...view, button: view.button && off(view.button), notice: view.notice && { ...view.notice, actions: view.notice.actions.map(off) }, paste: view.paste && { ...view.paste, button: off(view.paste.button) } };
}

// Copilot's check spends one model request; a version cause only re-reads tool facts and spends nothing.
// The cost is shown, not only announced (spec); the unverified row carries it in its detail line instead.
function check(provider: Provider, label: string, free: boolean): AuthButton {
  if (provider !== "copilot" || free) return button("check", label);
  return { ...button("check", label, "prominent", false, `Check ${PROVIDER_NAMES[provider]} again, uses one Copilot request`), note: "Uses one Copilot request" };
}
function errorNotice(status: AuthStatusDto, ctx: ProviderContext): Notice | null {
  const name = PROVIDER_NAMES[status.provider], connected = status.account !== null;
  const signIn = button("signIn", "Sign in"), retry = check(status.provider, "Retry", false);
  switch (status.error?.code) {
    case "sign_in_failed":
      return alert((ctx.failures ?? 0) >= 2 ? `Sign-in to ${name} keeps failing. Check your browser and network, or connect another agent.` : "Sign-in didn’t finish. Try again.", [signIn]);
    case "network": return alert(`Couldn’t reach ${name}. Check your connection and try again.`, [connected ? retry : signIn]);
    case "storage_failed": return alert("Couldn’t save this connection securely. Allow doan to use your Keychain, then sign in again.", [signIn]);
    case "cli_install_failed": return alert(`Couldn’t download ${name}’s sign-in server. Check your connection and try again.`, [connected ? retry : signIn]);
    case "check_failed": return alert("Couldn’t check your connections.", [connected ? retry : signIn]);
    default: return null;
  }
}

function readinessView(status: AuthStatusDto, ctx: ProviderContext, view: ProviderView): ProviderView {
  const { provider } = status, name = PROVIDER_NAMES[provider], r = status.readiness;
  const reauth = [button("signOut", "Sign out", "subtle"), button("reauth", "Sign in again")];
  if (r.ready) return { ...view, button: button("signIn", "Connected", "prominent", true, `Connected to ${name}`) };
  switch (r.cause) {
    case "cli_missing": return { ...view, detail: "Not installed", button: button("install", "Install", "prominent", false, `Install ${name}`), helper: "After you install it, doan checks again when you return." };
    case "version_unsupported": return { ...view, detail: "This version is older than doan supports.", button: button("update", "Update", "prominent", false, `Update ${name}`), helper: "After you update it, doan checks again when you return." };
    case "version_unknown": return { ...view, notice: alert(`Check that ${name} is installed correctly, then retry.`, [check(provider, "Retry", true)], `Couldn’t read the ${name} version`) };
    case "version_incompatible": return { ...view, notice: alert(`Update ${name} or wait for a Doan update, then retry.`, [check(provider, "Retry", true)], `Doan can’t run this ${name} version`) };
    case "sign_out_failed": return { ...view, notice: alert(`doan couldn’t sign out of ${name}. Sign out again before you use it.`, [button("signOut", "Sign out")]) };
    case "account_mismatch": return { ...view, notice: alert(`You signed in with a different ${name} account. Sign in again with the same account, or sign out first.`, reauth) };
    case "reauth_required": {
      // A failed Sign in again keeps the connection, so its error is shown with the same recovery buttons.
      const failed = errorNotice(status, ctx)?.body;
      // Expiry settles as phase reauthRequired; otherwise only a Claude connection without an organization needs reauth.
      const organization = provider === "claude" && status.phase !== "reauthRequired";
      return { ...view, notice: alert(failed ?? (organization ? `Sign in to ${name} again so doan can confirm your organization.` : `Your ${name} connection expired. Sign in again.`), reauth) };
    }
    case "tools_missing": case "tools_failed": return { ...view, notice: alert("doan couldn’t find its command-line tool. Reinstall doan, then check again.", [check(provider, "Check again", false)]) };
    case "not_connected": {
      const notice = errorNotice(status, ctx);
      return notice ? { ...view, notice } : { ...view, button: button("signIn", "Sign in", "prominent", false, `Sign in to ${name}`) };
    }
    case "unverified": {
      const notice = errorNotice(status, ctx);
      if (notice) return { ...view, notice };
      const copilot = provider === "copilot";
      return {
        ...view, detail: copilot ? "Connected · not checked · Retry uses one Copilot request" : "Connected · not checked",
        button: button("check", "Retry", "prominent", false, copilot ? `Check ${name} again, uses one Copilot request` : `Check ${name} again`),
        helper: !copilot && ctx.autoCheck ? "doan checks this automatically when you open this step." : null,
      };
    }
    // busy without a sign-in or sign-out attempt cannot come from agent-auth; keep the row inert until the next snapshot.
    case "busy": return { ...view, button: button("signIn", "Sign in", "prominent", true, `Sign in to ${name}`) };
  }
}

export function providerView(status: AuthStatusDto, ctx: ProviderContext = {}): ProviderView {
  const { provider, attempt } = status, name = PROVIDER_NAMES[provider];
  const account = status.account && (status.account.email ?? status.account.displayName ?? null);
  const view: ProviderView = { provider, name, detail: status.account ? account : VENDORS[provider], detailRole: null, button: null, helper: null, notice: null, paste: null };
  const signInDisabled = button("signIn", "Sign in", "prominent", true, `Sign in to ${name}`);
  // Ownership is not inferred: after a reload, or for a CLI-started sign-in, this window may own the attempt without
  // knowing its id, and must keep Cancel ('agent-auth 인계'). Only agent-auth's not_owner reply says otherwise.
  if (ctx.reply === "not_owner") return { ...view, detail: "Finish this sign-in in the window that started it.", detailRole: "status", button: signInDisabled };
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
  if (ctx.reply === "busy") return { ...view, detail: `Finish or cancel the ${ctx.busyWith ? PROVIDER_NAMES[ctx.busyWith] : "other"} sign-in first.`, detailRole: "status", button: signInDisabled };
  const settled = readinessView(status, ctx, view);
  return attempt?.kind === "check" ? disable(settled) : settled;
}

// Home's agent picker lists connected providers only and has no recovery buttons (2026-10-29 user), so a row
// that can't run gets a short status without action words; buzz-settings later puts the action in the same place.
// null: ready, or not connected (Home doesn't list it). Unverified stays selectable because main checks it on send.
export function providerShortStatus(status: AuthStatusDto): string | null {
  const r = status.readiness;
  if (r.ready) return null;
  switch (r.cause) {
    case "not_connected": return null;
    case "unverified": return "Checks your connection when you send.";
    case "reauth_required": return status.phase === "reauthRequired" ? "Sign-in expired" : "Not available right now";
    case "version_unsupported": case "version_incompatible": return "Needs an update";
    default: return "Not available right now";
  }
}

// show: the row displays it. dialog: confirm stopping runs, then resend with stop. reread: read the latest state.
export function replyEffect(reason: AuthReason): "show" | "dialog" | "reread" {
  switch (reason) {
    case "busy": case "not_owner": case "open_failed": return "show";
    case "stop_required": return "dialog";
    case "stale": case "invalid": case "not_connected": case "sign_out_failed": return "reread";
  }
}

// undefined: not read yet. null: readAgentAuth returned null, the account store is unreadable and every other call fails.
// shared: context every row gets, before its own (onboarding passes autoCheck).
export function authListView(auth: AuthSnapshot | null | undefined, contexts: Partial<Record<Provider, ProviderContext>> = {}, shared: ProviderContext = {}): { notice: Notice | null; providers: ProviderView[]; anyReady: boolean } {
  if (auth === null) return { notice: alert("doan couldn’t read its agent connections.", [button("read", "Retry")]), providers: [], anyReady: false };
  if (auth === undefined) return { notice: progress("Checking connections", []), providers: [], anyReady: false };
  const holder = auth.providers.find(p => p.attempt && p.attempt.kind !== "check")?.provider ?? null;
  return {
    notice: auth.providers.some(p => p.attempt?.kind === "check") ? progress("Checking connections", []) : null,
    providers: auth.providers.map(p => providerView(p, { busyWith: holder, ...shared, ...contexts[p.provider] })),
    anyReady: auth.providers.some(p => p.readiness.ready),
  };
}

// Project step: completion needs a ready agent at the moment it is saved.
export function noAgentReadyNotice(auth: AuthSnapshot | null): Notice<"chooseFolder" | "backToAgents"> | null {
  if (auth?.providers.some(p => p.readiness.ready)) return null;
  return { ...alert("No agent is ready. Go back and connect an agent to finish setup.", [button("chooseFolder", "Choose another folder", "subtle"), button("backToAgents", "Back to agents")]), note: "Your project selection stays here." };
}

// Announced once with role=status; the window is never raised for it (2026-10-28 user).
export function readyAnnouncements(previous: AuthSnapshot | null, next: AuthSnapshot): string[] {
  if (!previous) return [];
  return next.providers.filter(p => p.readiness.ready && previous.providers.some(old => old.provider === p.provider && !old.readiness.ready)).map(p => `${PROVIDER_NAMES[p.provider]} connected`);
}
export function cancelledAnnouncement(provider: Provider): string { return `${PROVIDER_NAMES[provider]} sign-in was cancelled.`; }

export function stopDialog(provider: Provider, intent: "signIn" | "signOut"): { title: string; body: string; cancel: Button<"dismiss">; confirm: Button<"signIn" | "signOut"> } {
  const name = PROVIDER_NAMES[provider];
  return {
    title: `Stop ${name} conversations?`,
    body: `${name} is running a conversation. ${intent === "signOut" ? "Signing out" : "Signing in again"} stops it. Your conversation history stays.`,
    cancel: button("dismiss", "Cancel", "subtle"), confirm: button(intent, intent === "signOut" ? "Stop and sign out" : "Stop and sign in"),
  };
}

export function pasteDialog(): { title: string; body: string; inputLabel: string; placeholder: string; maxLength: number; cancel: Button<"dismiss">; submit: Button<"submitCode"> } {
  return {
    title: "Paste the page address", body: "Copy the address from the browser tab that didn’t load and paste it here to finish signing in to Antigravity.",
    inputLabel: "Page address", placeholder: "Page address from your browser", maxLength: MAX_PASTE, cancel: button("dismiss", "Cancel", "subtle"), submit: button("submitCode", "Submit"),
  };
}
export function pasteSubmittable(value: string): boolean { return value.trim() !== "" && value.length <= MAX_PASTE; }
