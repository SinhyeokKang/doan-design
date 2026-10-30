import { expect, test } from "vitest";
import type { AuthReason, AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import { PROVIDERS, type AccountIdentity, type AuthAttempt, type AuthErrorCode, type AuthPhase, type AuthState, type AuthStatusDto, type Provider, type RecoveryAction, type ToolFacts } from "../main/agentAuth/types";
import {
  agentsSettingsView, authListView, cancelledAnnouncement, MAX_PASTE, noAgentReadyNotice, pasteDialog, pasteSubmittable, pickerAction, pickerFooter, PROVIDER_NAMES, providerShortStatus, providerView, readyAnnouncements, replyEffect, signInToast, stopDialog,
  type AuthButton, type ProviderView,
} from "./agentAuthView";

// DTOs come from agent-auth's own authStatus, so readiness, actions and error shapes are the backend's.
const FACTS: ToolFacts = { cli: "found", version: "supported", tools: "ready" };
const ACCOUNT: AccountIdentity = { id: "acct-1", workspace: "org-1", email: "ada@example.com", displayName: "Ada" };
interface Fixture { phase?: AuthPhase; account?: AccountIdentity | null; verified?: boolean; expired?: boolean; attempt?: Partial<AuthAttempt> & { kind: AuthAttempt["kind"] } | null; error?: AuthErrorCode | null; facts?: Partial<ToolFacts> }
function dto(provider: Provider, f: Fixture = {}, revision = 1): AuthStatusDto {
  const account = f.account === undefined ? null : f.account;
  const state: AuthState = {
    provider, generation: 1, verified: f.verified ?? false, expired: f.expired ?? false,
    connection: account ? { provider, connectionId: "conn-1", profile: provider, account } : null,
    attempt: f.attempt ? { id: "a1", owner: 7, cancelled: false, ...f.attempt } : null,
    error: f.error ? { code: f.error } : null,
    phase: f.phase ?? (f.attempt ? (f.attempt.kind === "check" ? "checking" : f.attempt.kind === "signIn" ? "signingIn" : "signingOut") : account ? (f.expired ? "reauthRequired" : "connected") : f.error ? "error" : "disconnected"),
  };
  return authStatus(state, { ...FACTS, ...f.facts }, revision);
}
const ready = (provider: Provider, account: AccountIdentity | null = ACCOUNT) => dto(provider, { account, verified: true });
const labels = (buttons: AuthButton[] | undefined) => (buttons ?? []).map(b => `${b.variant}${b.disabled ? "-disabled" : ""}:${b.label}:${b.command}`);
function only(view: ProviderView) { return { detail: view.detail, button: view.button && labels([view.button])[0], notice: view.notice && { role: view.notice.role, spinner: view.notice.spinner, title: view.notice.title, body: view.notice.body, actions: labels(view.notice.actions) }, helper: view.helper }; }

test("every provider has its draft name and vendor line before connecting", () => {
  const vendors: Record<Provider, string> = { claude: "Anthropic", codex: "OpenAI", cursor: "Cursor", antigravity: "Google", copilot: "GitHub" };
  for (const provider of PROVIDERS) {
    const view = providerView(dto(provider));
    expect(view.name).toBe(PROVIDER_NAMES[provider]);
    expect(only(view)).toEqual({ detail: vendors[provider], button: "prominent:Sign in:signIn", notice: null, helper: null });
    expect(view.button?.ariaLabel).toBe(`Sign in to ${PROVIDER_NAMES[provider]}`);
  }
  expect(PROVIDER_NAMES).toEqual({ claude: "Claude Code", codex: "Codex", cursor: "Cursor", antigravity: "Antigravity", copilot: "GitHub Copilot" });
});

test("readiness action install: Not installed with Install and the return check note", () => {
  const status = dto("cursor", { facts: { cli: "missing" } });
  expect(status.readiness).toEqual({ ready: false, cause: "cli_missing", action: "install" });
  const view = providerView(status);
  expect(only(view)).toEqual({ detail: "Not installed", button: "prominent:Install:install", notice: null, helper: "After you install it, Doan checks again when you return." });
  expect(view.button?.ariaLabel).toBe("Install Cursor");
});

test("readiness action update: below the minimum shows Update, even before sign-in", () => {
  const status = dto("cursor", { facts: { version: "unsupported" } });
  expect(status.readiness).toMatchObject({ action: "update" });
  const view = providerView(status);
  expect(only(view)).toEqual({ detail: "This version is older than Doan supports.", button: "prominent:Update:update", notice: null, helper: "After you update it, Doan checks again when you return." });
  expect(view.button?.ariaLabel).toBe("Update Cursor");
});

test("readiness action retry for version causes: alerts in the tools-check format with a Retry that costs nothing", () => {
  const unknown = providerView(dto("copilot", { account: ACCOUNT, verified: true, facts: { version: "unknown" } }));
  expect(only(unknown)).toEqual({ detail: "ada@example.com", button: null, helper: null, notice: { role: "alert", spinner: false, title: "Couldn’t read the GitHub Copilot version", body: "Check that GitHub Copilot is installed correctly, then retry.", actions: ["prominent:Retry:check"] } });
  expect(unknown.notice?.actions[0]?.ariaLabel).toBeUndefined();
  const incompatible = providerView(dto("codex", { facts: { version: "incompatible" } }));
  expect(only(incompatible).notice).toEqual({ role: "alert", spinner: false, title: "Doan can’t run this Codex version", body: "Update Codex or wait for a Doan update, then retry.", actions: ["prominent:Retry:check"] });
});

test("readiness action repair: missing or failed doan tools show Check again", () => {
  for (const tools of ["missing", "failed"] as const) {
    const status = dto("claude", { account: ACCOUNT, verified: true, facts: { tools } });
    expect(status.readiness).toMatchObject({ action: "repair" });
    expect(only(providerView(status)).notice).toEqual({ role: "alert", spinner: false, title: undefined, body: "Doan couldn’t find its command-line tool. Reinstall Doan, then check again.", actions: ["prominent:Check again:check"] });
  }
  // Copilot's check spends a model request, so the cost is visible next to the button and in its accessible name.
  const copilot = providerView(dto("copilot", { account: ACCOUNT, verified: true, facts: { tools: "failed" } }));
  expect(copilot.notice?.actions[0]).toMatchObject({ ariaLabel: "Check GitHub Copilot again, uses one Copilot request", note: "Uses one Copilot request" });
  expect(providerView(dto("claude", { account: ACCOUNT, verified: true, facts: { tools: "failed" } })).notice?.actions[0]?.note).toBeUndefined();
});

test("readiness action retry for unverified: Connected · not checked, with the Copilot request cost", () => {
  const codex = providerView(dto("codex", { account: { id: null, workspace: null } }));
  expect(only(codex)).toEqual({ detail: "Connected · not checked", button: "prominent:Retry:check", notice: null, helper: null });
  // The automatic-check sentence is true only where the consumer checks on entry (the onboarding Agent step).
  expect(providerView(dto("codex", { account: ACCOUNT }), { autoCheck: true }).helper).toBe("Doan checks this automatically when you open this step.");
  expect(providerView(dto("copilot", { account: ACCOUNT }), { autoCheck: true }).helper).toBeNull();
  expect(authListView({ revision: 1, providers: [dto("codex", { account: ACCOUNT })] }, {}, { autoCheck: true }).providers[0]?.helper).toBe("Doan checks this automatically when you open this step.");
  expect(authListView({ revision: 1, providers: [dto("codex", { account: ACCOUNT })] }).providers[0]?.helper).toBeNull();
  expect(codex.button?.ariaLabel).toBe("Check Codex again");
  const copilot = providerView(dto("copilot", { account: ACCOUNT }));
  expect(only(copilot)).toEqual({ detail: "Connected · not checked · Retry uses one Copilot request", button: "prominent:Retry:check", notice: null, helper: null });
  expect(copilot.button?.ariaLabel).toBe("Check GitHub Copilot again, uses one Copilot request");
  // The unverified row already shows the cost in its detail line, so the button carries no second copy.
  expect(copilot.button?.note).toBeUndefined();
});

test("readiness action wait: a running check disables the row; a running sign-out shows progress", () => {
  const checking = dto("codex", { account: ACCOUNT, attempt: { kind: "check" } });
  expect(checking.readiness).toMatchObject({ action: "wait" });
  expect(only(providerView(checking))).toMatchObject({ detail: "Connected · not checked", button: "prominent-disabled:Retry:check" });
  const signingOut = dto("codex", { account: ACCOUNT, verified: true, attempt: { kind: "signOut" } });
  expect(signingOut.readiness).toMatchObject({ cause: "busy", action: "wait" });
  expect(only(providerView(signingOut))).toEqual({ detail: "ada@example.com", button: null, helper: null, notice: { role: "status", spinner: true, title: "Signing out of Codex", body: undefined, actions: [] } });
});

test("readiness action signOut: a failed sign-out is its own alert with Sign out only", () => {
  const status = dto("codex", { account: ACCOUNT, verified: true, error: "sign_out_failed", phase: "error" });
  expect(status.readiness).toEqual({ ready: false, cause: "sign_out_failed", action: "signOut" });
  expect(only(providerView(status)).notice).toEqual({ role: "alert", spinner: false, title: undefined, body: "Doan couldn’t sign out of Codex. Sign out again before you use it.", actions: ["prominent:Sign out:signOut"] });
});

test("readiness action reauth: expiry, a missing Claude organization and a different account each have their own copy", () => {
  const expired = dto("codex", { account: ACCOUNT, verified: true, expired: true });
  expect(expired.readiness).toMatchObject({ cause: "reauth_required", action: "reauth" });
  expect(only(providerView(expired)).notice).toEqual({ role: "alert", spinner: false, title: undefined, body: "Your Codex connection expired. Sign in again.", actions: ["subtle:Sign out:signOut", "prominent:Sign in again:reauth"] });
  const org = dto("claude", { account: { id: "acct-1", workspace: null, email: "ada@example.com" }, verified: true });
  expect(org).toMatchObject({ phase: "connected", readiness: { cause: "reauth_required" } });
  expect(only(providerView(org))).toMatchObject({ button: null, notice: { body: "Sign in to Claude Code again so Doan can confirm your organization.", actions: ["subtle:Sign out:signOut", "prominent:Sign in again:reauth"] } });
  const mismatch = dto("claude", { account: ACCOUNT, verified: true, error: "account_mismatch", phase: "error" });
  expect(mismatch.readiness).toMatchObject({ cause: "account_mismatch", action: "reauth" });
  expect(only(providerView(mismatch)).notice).toEqual({ role: "alert", spinner: false, title: undefined, body: "You signed in with a different Claude Code account. Sign in again with the same account, or sign out first.", actions: ["subtle:Sign out:signOut", "prominent:Sign in again:reauth"] });
});

test("readiness ready: only the account identifier under the name, or nothing, and a disabled Connected", () => {
  const view = providerView(ready("claude"));
  expect(only(view)).toEqual({ detail: "ada@example.com", button: "prominent-disabled:Connected:signIn", notice: null, helper: null });
  expect(view.button?.ariaLabel).toBe("Connected to Claude Code");
  expect(providerView(ready("cursor", { id: "c", workspace: "t", email: "only@example.com" })).detail).toBe("only@example.com");
  expect(providerView(ready("cursor", { id: "c", workspace: "t", displayName: "Only Name" })).detail).toBe("Only Name");
  // Codex and Antigravity have no account display value: no line under the name.
  expect(providerView(ready("antigravity", { id: null, workspace: null })).detail).toBeNull();
  expect(providerView(ready("codex", { id: null, workspace: null })).detail).toBeNull();
  const long = "sinhyeok.kang@product-and-design-team.example.com".repeat(3);
  expect(providerView(ready("claude", { ...ACCOUNT, email: long })).detail).toBe(long);
});

test("every readiness action in the table is covered", () => {
  const seen = new Set<RecoveryAction>();
  for (const status of [
    dto("cursor", { facts: { cli: "missing" } }), dto("cursor", { facts: { version: "unsupported" } }), dto("codex"), dto("codex", { account: ACCOUNT }),
    dto("codex", { account: ACCOUNT, attempt: { kind: "signOut" } }), dto("codex", { account: ACCOUNT, error: "sign_out_failed" }), dto("codex", { account: ACCOUNT, expired: true }),
    dto("claude", { account: ACCOUNT, verified: true, facts: { tools: "missing" } }),
  ]) if (!status.readiness.ready) seen.add(status.readiness.action);
  expect([...seen].sort()).toEqual(["install", "reauth", "repair", "retry", "signIn", "signOut", "update", "wait"]);
});

test("a running sign-in shows preparing, then waiting, with per-provider browser copy", () => {
  const signingIn = (provider: Provider) => dto(provider, { attempt: { kind: "signIn" } });
  expect(only(providerView(signingIn("antigravity"))).notice).toEqual({
    role: "status", spinner: true, title: "Preparing Antigravity sign-in", body: "The first sign-in downloads Antigravity’s sign-in server. This can take a moment.", actions: ["subtle:Cancel:cancel", "subtle-disabled:Open browser:openLink"],
  });
  expect(only(providerView(signingIn("claude"), {})).notice).toMatchObject({ title: "Preparing Claude Code sign-in", body: undefined });
  expect(only(providerView(signingIn("claude"), { prompt: "a1" })).notice).toEqual({
    role: "status", spinner: true, title: "Finish signing in to Claude Code", body: "Complete sign-in in your browser, then return here.", actions: ["subtle:Cancel:cancel", "subtle:Open again:openLink"],
  });
  for (const provider of ["codex", "cursor", "copilot"] as const) {
    expect(only(providerView(signingIn(provider), { prompt: "a1" })).notice?.body).toBe("A browser tab may already be open. Complete sign-in there, then return here.");
  }
  const antigravity = providerView(signingIn("antigravity"), { prompt: "a1" });
  expect(antigravity.paste).toEqual({ prompt: "Browser page didn’t load?", button: { command: "pasteAddress", label: "Paste its address", variant: "ghost", disabled: false } });
  expect(providerView(signingIn("claude"), { prompt: "a1" }).paste).toBeNull();
  // A link for an older attempt is not this attempt's link.
  expect(providerView(signingIn("claude"), { prompt: "a0" }).notice?.title).toBe("Preparing Claude Code sign-in");
});

test("a cancelling sign-in keeps its notice with every action disabled", () => {
  const view = providerView(dto("claude", { attempt: { kind: "signIn", cancelled: true } }), { prompt: "a1" });
  expect(view.notice?.actions.every(b => b.disabled)).toBe(true);
  expect(view.paste).toBeNull();
});

test("only reply not_owner shows where to finish a sign-in started in another window", () => {
  const status = dto("claude", { attempt: { kind: "signIn" } });
  const view = providerView(status, { reply: "not_owner" });
  expect(only(view)).toEqual({ detail: "Finish this sign-in in the window that started it.", button: "prominent-disabled:Sign in:signIn", notice: null, helper: null });
  expect(view.detailRole).toBe("status");
  // After a reload or for a CLI-started sign-in the window cannot prove ownership but may still own it: Cancel stays usable.
  expect(only(providerView(status)).notice).toMatchObject({ title: "Preparing Claude Code sign-in", actions: ["subtle:Cancel:cancel", "subtle-disabled:Open browser:openLink"] });
  expect(providerView(status).detailRole).toBeNull();
});

test("a failed sign-in again on a reauth row shows the failure with the reauth actions", () => {
  const expiredFailed = providerView(dto("codex", { account: ACCOUNT, verified: true, expired: true, error: "sign_in_failed" }), { failures: 2 });
  expect(only(expiredFailed).notice).toEqual({ role: "alert", spinner: false, title: undefined, body: "Sign-in to Codex keeps failing. Check your browser and network, or connect another agent.", actions: ["subtle:Sign out:signOut", "prominent:Sign in again:reauth"] });
  const orgNetwork = providerView(dto("claude", { account: { id: "acct-1", workspace: null }, verified: true, error: "network" }));
  expect(only(orgNetwork).notice).toEqual({ role: "alert", spinner: false, title: undefined, body: "Couldn’t reach Claude Code. Check your connection and try again.", actions: ["subtle:Sign out:signOut", "prominent:Sign in again:reauth"] });
});

test("a Claude organization reauth keeps its copy while a check runs", () => {
  const view = providerView(dto("claude", { account: { id: "acct-1", workspace: null }, verified: true, attempt: { kind: "check" } }));
  expect(view.notice?.body).toBe("Sign in to Claude Code again so Doan can confirm your organization.");
  expect(view.notice?.actions.every(b => b.disabled)).toBe(true);
});

test("reply busy names the sign-in that holds the lock", () => {
  const view = providerView(dto("codex"), { reply: "busy", busyWith: "claude" });
  expect(only(view)).toEqual({ detail: "Finish or cancel the Claude Code sign-in first.", button: "prominent-disabled:Sign in:signIn", notice: null, helper: null });
  expect(view.detailRole).toBe("status");
  expect(providerView(dto("codex"), { reply: "busy" }).detail).toBe("Finish or cancel the other sign-in first.");
});

test("reply open_failed is an alert with a prominent Open browser", () => {
  const view = providerView(dto("claude", { attempt: { kind: "signIn" } }), { prompt: "a1", reply: "open_failed" });
  expect(only(view).notice).toEqual({ role: "alert", spinner: false, title: undefined, body: "Couldn’t open your browser. Try again.", actions: ["subtle:Cancel:cancel", "prominent:Open browser:openLink"] });
});

test("every reply reason has a fixed effect", () => {
  const effects: Record<AuthReason, ReturnType<typeof replyEffect>> = {
    busy: "show", not_owner: "show", open_failed: "show", stop_required: "dialog",
    stale: "reread", invalid: "reread", not_connected: "reread", sign_out_failed: "reread",
  };
  for (const [reason, effect] of Object.entries(effects)) expect(replyEffect(reason as AuthReason), reason).toBe(effect);
  // A reread reply leaves the row as the snapshot shows it.
  for (const reason of ["stale", "invalid", "not_connected", "sign_out_failed"] as const) expect(only(providerView(dto("codex"), { reply: reason }))).toEqual(only(providerView(dto("codex"))));
});

test("reply stop_required opens a confirmation for sign-out and for sign-in", () => {
  expect(stopDialog("claude", "signOut")).toEqual({
    title: "Stop Claude Code conversations?", body: "Claude Code is running a conversation. Signing out stops it. Your conversation history stays.",
    cancel: { command: "dismiss", label: "Cancel", variant: "subtle", disabled: false }, confirm: { command: "signOut", label: "Stop and sign out", variant: "prominent", disabled: false },
  });
  expect(stopDialog("codex", "signIn")).toMatchObject({ title: "Stop Codex conversations?", body: "Codex is running a conversation. Signing in again stops it. Your conversation history stays.", confirm: { command: "signIn", label: "Stop and sign in" } });
});

test("every agent-auth error code maps to its alert and next action", () => {
  const disconnected = (error: AuthErrorCode) => providerView(dto("codex", { error }));
  const connected = (error: AuthErrorCode) => providerView(dto("codex", { account: ACCOUNT, error }));
  expect(only(disconnected("sign_in_failed")).notice).toEqual({ role: "alert", spinner: false, title: undefined, body: "Sign-in didn’t finish. Try again.", actions: ["prominent:Sign in:signIn"] });
  expect(only(providerView(dto("claude", { error: "sign_in_failed" }), { failures: 2 })).notice?.body).toBe("Sign-in to Claude Code keeps failing. Check your browser and network, or connect another agent.");
  expect(only(providerView(dto("claude", { error: "sign_in_failed" }), { failures: 1 })).notice?.body).toBe("Sign-in didn’t finish. Try again.");
  expect(only(disconnected("network")).notice).toMatchObject({ body: "Couldn’t reach Codex. Check your connection and try again.", actions: ["prominent:Sign in:signIn"] });
  expect(only(connected("network")).notice).toMatchObject({ body: "Couldn’t reach Codex. Check your connection and try again.", actions: ["prominent:Retry:check"] });
  expect(only(disconnected("storage_failed")).notice).toMatchObject({ body: "Couldn’t save this connection securely. Allow Doan to use your Keychain, then sign in again.", actions: ["prominent:Sign in:signIn"] });
  expect(only(connected("storage_failed")).notice).toMatchObject({ actions: ["prominent:Sign in:signIn"] });
  expect(only(providerView(dto("antigravity", { error: "cli_install_failed" }))).notice).toMatchObject({ body: "Couldn’t download Antigravity’s sign-in server. Check your connection and try again.", actions: ["prominent:Sign in:signIn"] });
  expect(only(providerView(dto("antigravity", { account: ACCOUNT, error: "cli_install_failed" }))).notice).toMatchObject({ actions: ["prominent:Retry:check"] });
  expect(only(connected("check_failed")).notice).toMatchObject({ role: "alert", body: "Couldn’t check your connections.", actions: ["prominent:Retry:check"] });
  expect(only(providerView(dto("copilot", { account: ACCOUNT, error: "check_failed" }))).notice?.actions).toEqual(["prominent:Retry:check"]);
  for (const error of ["check_failed", "network"] as const) {
    expect(providerView(dto("copilot", { account: ACCOUNT, error })).notice?.actions[0], error).toMatchObject({ ariaLabel: "Check GitHub Copilot again, uses one Copilot request", note: "Uses one Copilot request" });
  }
  // A version Retry only re-reads tool facts: no cost anywhere.
  expect(providerView(dto("copilot", { account: ACCOUNT, verified: true, facts: { version: "unknown" } })).notice?.actions[0]?.note).toBeUndefined();
  // account_mismatch and sign_out_failed are covered by the reauth and signOut rows.
  const codes: AuthErrorCode[] = ["sign_in_failed", "network", "storage_failed", "check_failed", "account_mismatch", "sign_out_failed", "cli_install_failed"];
  for (const code of codes) expect(providerView(dto("codex", { account: ACCOUNT, error: code })).notice?.role, code).toBe("alert");
});

test("readAgentAuth null is an unreadable store with Retry; loading and checks show one status", () => {
  expect(authListView(null)).toEqual({ notice: { role: "alert", spinner: false, title: undefined, body: "Doan couldn’t read its agent connections.", actions: [{ command: "read", label: "Retry", variant: "prominent", disabled: false }] }, providers: [], anyReady: false });
  expect(authListView(undefined)).toEqual({ notice: { role: "status", spinner: true, title: "Checking connections", body: undefined, actions: [] }, providers: [], anyReady: false });
  const checking: AuthSnapshot = { revision: 2, providers: [ready("claude"), dto("codex", { account: ACCOUNT, attempt: { kind: "check" } })] };
  expect(authListView(checking)).toMatchObject({ notice: { role: "status", title: "Checking connections" }, anyReady: true });
  const settled: AuthSnapshot = { revision: 3, providers: [ready("claude"), dto("codex")] };
  expect(authListView(settled)).toMatchObject({ notice: null, anyReady: true });
  expect(authListView(settled).providers.map(p => p.provider)).toEqual(["claude", "codex"]);
});

test("the list fills busyWith from the sign-in that holds the lock", () => {
  const auth: AuthSnapshot = { revision: 4, providers: [dto("claude", { attempt: { kind: "signIn" } }), dto("codex")] };
  const view = authListView(auth, { codex: { reply: "busy" } });
  expect(view.providers[1]?.detail).toBe("Finish or cancel the Claude Code sign-in first.");
});

test("Project step: no ready agent is an alert with Back to agents; any ready agent clears it", () => {
  const none: AuthSnapshot = { revision: 1, providers: [dto("claude", { account: ACCOUNT, expired: true, verified: true }), dto("codex")] };
  expect(noAgentReadyNotice(none)).toEqual({
    role: "alert", spinner: false, title: undefined, body: "No agent is ready. Go back and connect an agent to finish setup.", note: "Your project selection stays here.",
    actions: [{ command: "chooseFolder", label: "Choose another folder", variant: "subtle", disabled: false }, { command: "backToAgents", label: "Back to agents", variant: "prominent", disabled: false }],
  });
  expect(noAgentReadyNotice(null)).not.toBeNull();
  expect(noAgentReadyNotice({ revision: 2, providers: [...none.providers, ready("cursor")] })).toBeNull();
});

test("first ready announces once per provider; cancel announces without an error", () => {
  const before: AuthSnapshot = { revision: 1, providers: [dto("claude"), dto("codex", { account: ACCOUNT })] };
  const after: AuthSnapshot = { revision: 2, providers: [ready("claude"), ready("codex")] };
  expect(readyAnnouncements(before, after)).toEqual(["Claude Code connected", "Codex connected"]);
  expect(readyAnnouncements(after, after)).toEqual([]);
  expect(readyAnnouncements(null, after)).toEqual([]);
  expect(readyAnnouncements(after, before)).toEqual([]);
  expect(cancelledAnnouncement("antigravity")).toBe("Antigravity sign-in was cancelled.");
});

test("the Antigravity paste dialog accepts one address up to 16,384 characters", () => {
  expect(pasteDialog()).toEqual({
    title: "Paste the page address", body: "Copy the address from the browser tab that didn’t load and paste it here to finish signing in to Antigravity.",
    inputLabel: "Page address", placeholder: "Page address from your browser", maxLength: MAX_PASTE,
    cancel: { command: "dismiss", label: "Cancel", variant: "subtle", disabled: false }, submit: { command: "submitCode", label: "Submit", variant: "prominent", disabled: false },
  });
  expect(MAX_PASTE).toBe(16384);
  expect(pasteSubmittable("")).toBe(false);
  expect(pasteSubmittable("   ")).toBe(false);
  expect(pasteSubmittable("http://127.0.0.1:5/?code=c")).toBe(true);
  expect(pasteSubmittable("x".repeat(MAX_PASTE))).toBe(true);
  expect(pasteSubmittable("x".repeat(MAX_PASTE + 1))).toBe(false);
});

test("copy never ends with an ellipsis", () => {
  const texts: string[] = [];
  const collect = (value: unknown) => { if (typeof value === "string") texts.push(value); else if (value && typeof value === "object") Object.values(value).forEach(collect); };
  for (const provider of PROVIDERS) for (const f of [{}, { facts: { cli: "missing" } }, { attempt: { kind: "signIn" } }, { account: ACCOUNT }] as Fixture[]) collect(providerView(dto(provider, f), { prompt: "a1" }));
  collect(authListView(undefined)); collect(pasteDialog()); collect(stopDialog("claude", "signIn"));
  expect(texts.filter(t => /…|\.\.\.$/.test(t))).toEqual([]);
});

test("Home's short status names why a connected provider can't run, with no action words", () => {
  const short = (status: AuthStatusDto) => providerShortStatus(status);
  expect(short(ready("claude"))).toBeNull();
  expect(short(dto("claude"))).toBeNull();
  expect(short(dto("antigravity", { account: ACCOUNT }))).toBe("Checks your connection when you send.");
  expect(short(dto("codex", { account: ACCOUNT, expired: true }))).toBe("Sign-in expired");
  expect(short(dto("cursor", { account: ACCOUNT, verified: true, facts: { version: "unsupported" } }))).toBe("Needs an update");
  expect(short(dto("codex", { account: ACCOUNT, verified: true, facts: { version: "incompatible" } }))).toBe("Needs an update");
  for (const facts of [{ version: "unknown" }, { cli: "missing" }, { tools: "missing" }] as Partial<ToolFacts>[])
    expect(short(dto("copilot", { account: ACCOUNT, verified: true, facts }))).toBe("Not available right now");
});

test("the short status leaves the onboarding row copy unchanged", () => {
  const status = dto("codex", { account: ACCOUNT, expired: true });
  providerShortStatus(status);
  expect(only(providerView(status)).notice?.body).toBe("Your Codex connection expired. Sign in again.");
});

// buzz-settings design 'Agents': the Settings page reuses the same rows with a Settings context.
const S = { settings: true } as const;
const signOutOf = (view: ProviderView) => view.signOut && labels([view.signOut])[0];

test("settings context: a ready connection shows its account and Sign out only", () => {
  const view = providerView(ready("claude"), S);
  expect(only(view)).toEqual({ detail: "ada@example.com", button: null, notice: null, helper: null });
  expect(signOutOf(view)).toBe("subtle:Sign out:signOut");
  expect(view.signOut?.ariaLabel).toBe("Sign out of Claude Code");
  expect(providerView(ready("codex", { id: null, workspace: null }), S).detail).toBeNull();
  // First run keeps its disabled Connected and no row Sign out.
  expect(providerView(ready("claude")).signOut).toBeNull();
});

test("settings context: an unchecked connection says so after the account, with Check and Sign out", () => {
  const codex = providerView(dto("codex", { account: ACCOUNT }), { ...S, autoCheck: true });
  expect(only(codex)).toEqual({ detail: "ada@example.com · not checked", button: "subtle:Check:check", notice: null, helper: "Doan checks this automatically when you open Agents." });
  expect(codex.button?.ariaLabel).toBe("Check Codex");
  expect(signOutOf(codex)).toBe("subtle:Sign out:signOut");
  expect(providerView(dto("codex", { account: { id: null, workspace: null } }), S).detail).toBe("Not checked");
  expect(providerView(dto("codex", { account: ACCOUNT }), S).helper).toBeNull();
});

test("settings context: Copilot is checked only by Check, and the row says what a check costs", () => {
  const copilot = providerView(dto("copilot", { account: ACCOUNT }), { ...S, autoCheck: true });
  expect(only(copilot)).toEqual({ detail: "ada@example.com · not checked", button: "subtle:Check:check", notice: null, helper: "Checking uses one Copilot request." });
  expect(copilot.button?.ariaLabel).toBe("Check GitHub Copilot, uses one Copilot request");
  expect(copilot.button?.note).toBeUndefined();
});

test("settings context: Sign out stays on every connected row unless the row already offers it or an attempt runs", () => {
  // An expired connection's notice already has Sign out; a second one would repeat it.
  expect(providerView(dto("codex", { account: ACCOUNT, verified: true, expired: true }), S).signOut).toBeNull();
  expect(providerView(dto("codex", { account: ACCOUNT, verified: true, error: "sign_out_failed", phase: "error" }), S).signOut).toBeNull();
  expect(signOutOf(providerView(dto("codex", { account: ACCOUNT, verified: true, facts: { version: "unknown" } }), S))).toBe("subtle:Sign out:signOut");
  expect(signOutOf(providerView(dto("cursor", { account: ACCOUNT, verified: true, facts: { cli: "missing" } }), S))).toBe("subtle:Sign out:signOut");
  expect(providerView(dto("codex", { account: ACCOUNT, verified: true, attempt: { kind: "signOut" } }), S).signOut).toBeNull();
  expect(providerView(dto("codex", { account: ACCOUNT, verified: true, expired: true, attempt: { kind: "signIn" } }), S).signOut).toBeNull();
  // A running check disables the row, Sign out included.
  expect(signOutOf(providerView(dto("codex", { account: ACCOUNT, attempt: { kind: "check" } }), S))).toBe("subtle-disabled:Sign out:signOut");
  // Not connected rows have nothing to sign out of.
  expect(providerView(dto("cursor"), S).signOut).toBeNull();
});

test("settings context: a sign-in owned elsewhere says to finish it where it started", () => {
  const view = providerView(dto("codex", { attempt: { kind: "signIn" } }), { ...S, reply: "not_owner" });
  expect(view.detail).toBe("Finish this sign-in where it started.");
  expect(providerView(dto("codex", { attempt: { kind: "signIn" } }), { reply: "not_owner" }).detail).toBe("Finish this sign-in in the window that started it.");
});

test("settings context: rows split into Connected (any saved account) and Not connected, and an empty section is hidden", () => {
  const auth: AuthSnapshot = { revision: 1, providers: [
    ready("claude"), dto("codex", { account: ACCOUNT, verified: true, expired: true }), dto("cursor", { facts: { cli: "missing" } }),
    dto("antigravity", { attempt: { kind: "signIn" } }), dto("copilot", { account: ACCOUNT }),
  ] };
  const view = agentsSettingsView(auth);
  expect(view.sections.map(s => [s.title, s.providers.map(p => p.provider)])).toEqual([
    ["Connected", ["claude", "codex", "copilot"]], ["Not connected", ["cursor", "antigravity"]],
  ]);
  expect(view.sections[0]!.providers[0]!.signOut?.command).toBe("signOut");
  expect(agentsSettingsView({ revision: 1, providers: [ready("claude")] }).sections.map(s => s.title)).toEqual(["Connected"]);
  expect(agentsSettingsView({ revision: 1, providers: [dto("claude")] }).sections.map(s => s.title)).toEqual(["Not connected"]);
  expect(agentsSettingsView(undefined)).toMatchObject({ sections: [], notice: { title: "Checking connections" } });
  expect(agentsSettingsView(null)).toMatchObject({ sections: [], notice: { body: "Doan couldn’t read its agent connections." } });
});

test("settings context: a provider moves to the other section when its connection changes, keeping its row group", () => {
  const before = agentsSettingsView({ revision: 1, providers: [dto("codex", { attempt: { kind: "signIn" } })] });
  const after = agentsSettingsView({ revision: 2, providers: [ready("codex")] });
  expect(before.sections.map(s => [s.id, s.providers[0]?.provider])).toEqual([["notConnected", "codex"]]);
  expect(after.sections.map(s => [s.id, s.providers[0]?.provider])).toEqual([["connected", "codex"]]);
});

test("settings context: Home's picker offers one Settings action per group that cannot run", () => {
  const target = (provider: Provider) => ({ section: "agents", provider });
  expect(pickerAction(dto("codex", { account: ACCOUNT, verified: true, expired: true }))).toEqual({ label: "Sign in again…", target: target("codex") });
  expect(pickerAction(dto("copilot", { account: ACCOUNT, verified: true, facts: { version: "unsupported" } }))).toEqual({ label: "Update…", target: target("copilot") });
  expect(pickerAction(dto("cursor", { account: ACCOUNT, verified: true, facts: { version: "incompatible" } }))).toEqual({ label: "Update…", target: target("cursor") });
  expect(pickerAction(dto("claude", { account: ACCOUNT, verified: true, facts: { tools: "failed" } }))).toEqual({ label: "Open Agents settings…", target: target("claude") });
  expect(pickerAction(dto("claude", { account: { id: "acct-1", workspace: null, email: "ada@example.com" }, verified: true }))).toEqual({ label: "Open Agents settings…", target: target("claude") });
  // Ready and unverified run (main checks on send); a provider without a connection is not in the picker.
  expect(pickerAction(ready("claude"))).toBeNull();
  expect(pickerAction(dto("codex", { account: ACCOUNT }))).toBeNull();
  expect(pickerAction(dto("cursor"))).toBeNull();
});

test("settings context: the picker ends with Manage agents…, or with no agent ready only Sign in to an agent…", () => {
  expect(pickerFooter(true)).toEqual({ note: null, action: { label: "Manage agents…", target: { section: "agents" } } });
  expect(pickerFooter(false)).toEqual({ note: "No agent is ready to run.", action: { label: "Sign in to an agent…", target: { section: "agents" } } });
});

test("settings context: a sign-in that ends while Agents is not shown is told once in a toast", () => {
  expect(signInToast("codex", true)).toEqual({ text: "Codex connected.", action: null });
  expect(signInToast("codex", false)).toEqual({ text: "Codex sign-in didn’t finish.", action: { label: "Open Agents settings", target: { section: "agents", provider: "codex" } } });
});

test("settings context: a connected row refused as busy keeps its account and a disabled Sign out, never a Sign in", () => {
  const view = providerView(ready("claude"), { ...S, reply: "busy", busyWith: "codex" });
  expect(view.detail).toBe("Finish or cancel the Codex sign-in first.");
  expect(view.button).toBeNull();
  expect(signOutOf(view)).toBe("subtle-disabled:Sign out:signOut");
  // A row without a connection keeps first run's disabled Sign in.
  expect(only(providerView(dto("cursor"), { ...S, reply: "busy", busyWith: "codex" })).button).toBe("prominent-disabled:Sign in:signIn");
});
