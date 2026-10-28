import { expect, test, vi } from "vitest";
import type { AuthPromptEvent, AuthReply, AuthSnapshot, AuthStartReply } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import { PROVIDERS, type AccountIdentity, type AuthAttempt, type AuthErrorCode, type AuthState, type AuthStatusDto, type Provider, type ToolFacts } from "../main/agentAuth/types";
import { AgentStepSession, type AgentStepDeps } from "./agentStep";

// DTOs come from agent-auth's own authStatus, as in agentAuthView.test.ts.
const FACTS: ToolFacts = { cli: "found", version: "supported", tools: "ready" };
const ACCOUNT: AccountIdentity = { id: "acct-1", workspace: "org-1", email: "ada@example.com", displayName: "Ada" };
interface Fixture { account?: AccountIdentity | null; verified?: boolean; attempt?: { id?: string; kind: AuthAttempt["kind"]; owner?: number | null; cancelled?: boolean } | null; error?: AuthErrorCode | null; facts?: Partial<ToolFacts> }
function dto(provider: Provider, f: Fixture = {}): AuthStatusDto {
  const account = f.account === undefined ? null : f.account;
  const state: AuthState = {
    provider, generation: 1, verified: f.verified ?? false, expired: false,
    connection: account ? { provider, connectionId: "conn-1", profile: provider, account } : null,
    attempt: f.attempt ? { id: "a1", owner: 7, cancelled: false, ...f.attempt } : null,
    error: f.error ? { code: f.error } : null,
    phase: f.attempt ? (f.attempt.kind === "check" ? "checking" : f.attempt.kind === "signIn" ? "signingIn" : "signingOut") : account ? "connected" : f.error ? "error" : "disconnected",
  };
  return authStatus(state, { ...FACTS, ...f.facts }, 1);
}
function snap(revision: number, over: Partial<Record<Provider, Fixture>> = {}): AuthSnapshot {
  return { revision, providers: PROVIDERS.map(p => dto(p, over[p])) };
}
const connected = { account: ACCOUNT, verified: true };
const unverified = { account: ACCOUNT, verified: false };

function harness(initial: AuthSnapshot | null = snap(1), focused = true) {
  let auth: ((s: AuthSnapshot) => void) | null = null, prompt: ((e: AuthPromptEvent) => void) | null = null;
  const unsubscribed: string[] = [];
  const replies: { signIn: AuthStartReply[]; signOut: AuthStartReply[]; cancel: AuthReply[]; open: AuthReply[]; submit: AuthReply[] } = { signIn: [], signOut: [], cancel: [], open: [], submit: [] };
  let attempts = 0;
  const api = {
    readAgentAuth: vi.fn(async () => current),
    onAgentAuth: vi.fn((listener: (s: AuthSnapshot) => void) => { auth = listener; return () => { unsubscribed.push("auth"); auth = null; }; }),
    checkAgentAuth: vi.fn(async (_p: Provider): Promise<AuthStartReply> => ({ ok: true, attemptId: `check-${++attempts}` })),
    signInAgent: vi.fn(async (_p: Provider, _o?: { stop?: boolean }): Promise<AuthStartReply> => replies.signIn.shift() ?? { ok: true, attemptId: `sign-${++attempts}` }),
    signOutAgent: vi.fn(async (_p: Provider, _o?: { stop?: boolean }): Promise<AuthStartReply> => replies.signOut.shift() ?? { ok: true, attemptId: `out-${++attempts}` }),
    cancelAgentSignIn: vi.fn(async (_p: Provider, _id: string): Promise<AuthReply> => replies.cancel.shift() ?? { ok: true }),
    submitAgentSignInCode: vi.fn(async (_p: Provider, _id: string, _code: string): Promise<AuthReply> => replies.submit.shift() ?? { ok: true }),
    openAgentSignInLink: vi.fn(async (_p: Provider, _id: string): Promise<AuthReply> => replies.open.shift() ?? { ok: true }),
    onAgentSignInPrompt: vi.fn((listener: (e: AuthPromptEvent) => void) => { prompt = listener; return () => { unsubscribed.push("prompt"); prompt = null; }; }),
  };
  let current: AuthSnapshot | null = initial;
  const deps: AgentStepDeps = { api, openInstall: vi.fn(async (_p: Provider) => true), hasFocus: () => focused, changed: vi.fn() };
  const session = new AgentStepSession(deps);
  return {
    session, api, deps, replies, unsubscribed,
    setRead(next: AuthSnapshot | null) { current = next; },
    setFocus(value: boolean) { focused = value; },
    emit(next: AuthSnapshot) { auth?.(next); },
    prompt(event: AuthPromptEvent) { prompt?.(event); },
    listening: () => ({ auth: auth !== null, prompt: prompt !== null }),
  };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const checked = (h: ReturnType<typeof harness>) => h.api.checkAgentAuth.mock.calls.map(call => call[0]);
const row = (h: ReturnType<typeof harness>, provider: Provider) => h.session.view().providers.find(p => p.provider === provider)!;

test("step entry checks connected, unverified and tool-check providers except Copilot", async () => {
  const h = harness(snap(1, { claude: unverified, codex: { account: ACCOUNT, facts: { tools: "failed" } }, cursor: connected, antigravity: {}, copilot: unverified }));
  h.session.start(); h.session.enter();
  await flush();
  expect(h.api.readAgentAuth).toHaveBeenCalledTimes(1);
  expect(checked(h)).toEqual(["claude", "codex"]);
  expect(row(h, "claude").helper).toBe("doan checks this automatically when you open this step.");
  expect(row(h, "copilot").button?.ariaLabel).toBe("Check GitHub Copilot again, uses one Copilot request");
});

test("window focus and auth events only read; Copilot is checked only on its Retry", async () => {
  const h = harness(snap(1, { copilot: unverified }));
  h.session.start(); h.session.enter();
  await flush();
  h.emit(snap(2, { copilot: unverified }));
  h.session.windowFocused();
  await flush();
  expect(h.api.readAgentAuth).toHaveBeenCalledTimes(2);
  expect(checked(h)).toEqual([]);
  h.session.command("copilot", "check");
  await flush();
  expect(checked(h)).toEqual(["copilot"]);
});

test("a version-cause Retry checks without a cost; it still waits for the click", async () => {
  const h = harness(snap(1, { copilot: { facts: { version: "unknown" } } }));
  h.session.start(); h.session.enter();
  await flush();
  expect(checked(h)).toEqual([]);
  h.session.command("copilot", "check");
  await flush();
  expect(checked(h)).toEqual(["copilot"]);
});

test("returning from an install page reads, then checks the installed provider unless it is Copilot", async () => {
  const h = harness(snap(1, { cursor: { facts: { cli: "missing" } }, copilot: { facts: { cli: "missing" } } }));
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("cursor", "install");
  h.session.command("copilot", "install");
  await flush();
  expect(h.deps.openInstall).toHaveBeenCalledWith("cursor");
  expect(h.deps.openInstall).toHaveBeenCalledWith("copilot");
  h.session.windowFocused();
  await flush();
  expect(checked(h)).toEqual(["cursor"]);
  // The return is consumed: a later focus only reads.
  h.session.windowFocused();
  await flush();
  expect(checked(h)).toEqual(["cursor"]);
  expect(h.api.readAgentAuth).toHaveBeenCalledTimes(3);
});

test("a failed install page open is shown and no return check is armed", async () => {
  const h = harness(snap(1, { claude: { facts: { cli: "missing" } } }));
  vi.mocked(h.deps.openInstall).mockResolvedValueOnce(false);
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("claude", "install");
  await flush();
  expect(h.session.state.installError).toBe("Couldn’t open the Claude Code install page.");
  h.session.windowFocused();
  await flush();
  expect(checked(h)).toEqual([]);
});

test("sign-in success: links open automatically for Claude, Codex and Antigravity only, once per attempt", async () => {
  const h = harness();
  h.session.start(); h.session.enter();
  await flush();
  for (const provider of PROVIDERS) {
    h.session.command(provider, "signIn");
    await flush();
  }
  expect(h.api.signInAgent.mock.calls.map(c => c[0])).toEqual([...PROVIDERS]);
  const ids = h.api.signInAgent.mock.results.length;
  expect(ids).toBe(5);
  h.prompt({ provider: "claude", attemptId: "sign-1", url: "https://claude.ai/oauth/authorize?x=1" });
  h.prompt({ provider: "claude", attemptId: "sign-1", url: "https://claude.ai/oauth/authorize?x=2" });
  // Codex prints its local callback server first; only the auth page is worth opening.
  h.prompt({ provider: "codex", attemptId: "sign-2", url: "http://localhost:1455" });
  h.prompt({ provider: "codex", attemptId: "sign-2", url: "https://auth.openai.com/oauth/authorize?x=1" });
  h.prompt({ provider: "cursor", attemptId: "sign-3", url: "https://cursor.com/loginDeepControl" });
  h.prompt({ provider: "antigravity", attemptId: "sign-4", url: "https://accounts.google.com/o/oauth2/auth" });
  h.prompt({ provider: "copilot", attemptId: "sign-5", url: "https://github.com/login/device" });
  await flush();
  expect(h.api.openAgentSignInLink.mock.calls).toEqual([["claude", "sign-1"], ["codex", "sign-2"], ["antigravity", "sign-4"]]);
  h.emit(snap(2, { claude: connected }));
  await flush();
  expect(row(h, "claude").button).toMatchObject({ label: "Connected", disabled: true });
});

test("a prompt moves the waiting notice from Preparing to Finish signing in", async () => {
  const h = harness();
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("cursor", "signIn");
  await flush();
  h.emit(snap(2, { cursor: { attempt: { id: "sign-1", kind: "signIn" } } }));
  expect(row(h, "cursor").notice?.title).toBe("Preparing Cursor sign-in");
  h.prompt({ provider: "cursor", attemptId: "sign-1", url: "https://cursor.com/x" });
  expect(row(h, "cursor").notice?.title).toBe("Finish signing in to Cursor");
  expect(row(h, "cursor").notice?.body).toBe("A browser tab may already be open. Complete sign-in there, then return here.");
});

test("an automatic open that fails shows Couldn’t open your browser until the attempt ends", async () => {
  const h = harness();
  h.replies.open.push({ ok: false, reason: "open_failed" });
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("claude", "signIn");
  await flush();
  h.emit(snap(2, { claude: { attempt: { id: "sign-1", kind: "signIn" } } }));
  h.prompt({ provider: "claude", attemptId: "sign-1", url: "https://claude.ai/oauth" });
  await flush();
  expect(row(h, "claude").notice?.body).toBe("Couldn’t open your browser. Try again.");
  h.session.command("claude", "openLink");
  await flush();
  expect(h.api.openAgentSignInLink.mock.calls.at(-1)).toEqual(["claude", "sign-1"]);
  expect(row(h, "claude").notice?.title).toBe("Finish signing in to Claude Code");
});

test("sign-in cancel: Cancel calls only this attempt and a settled cancel is announced once", async () => {
  const h = harness();
  h.session.start(); h.session.enter();
  await flush();
  h.emit(snap(2, { codex: { attempt: { id: "other-window", kind: "signIn" } } }));
  h.session.command("codex", "cancel");
  await flush();
  expect(h.api.cancelAgentSignIn.mock.calls).toEqual([["codex", "other-window"]]);
  h.emit(snap(3));
  expect(h.session.state.announcement?.text).toBe("Codex sign-in was cancelled.");
  const seq = h.session.state.announcement?.seq;
  h.emit(snap(4));
  expect(h.session.state.announcement?.seq).toBe(seq);
});

test("a cancel that loses to a saved success shows the connection, not a cancel", async () => {
  const h = harness();
  h.session.start(); h.session.enter();
  await flush();
  h.emit(snap(2, { codex: { attempt: { id: "a", kind: "signIn" } } }));
  h.session.command("codex", "cancel");
  await flush();
  h.emit(snap(3, { codex: connected }));
  expect(h.session.state.announcement?.text).not.toBe("Codex sign-in was cancelled.");
  expect(row(h, "codex").button?.label).toBe("Connected");
});

test("cancel refused with not_owner says to finish in the other window", async () => {
  const h = harness();
  h.replies.cancel.push({ ok: false, reason: "not_owner" });
  h.session.start(); h.session.enter();
  await flush();
  h.emit(snap(2, { claude: { attempt: { id: "x", kind: "signIn" } } }));
  h.session.command("claude", "cancel");
  await flush();
  expect(row(h, "claude")).toMatchObject({ detail: "Finish this sign-in in the window that started it.", detailRole: "status" });
  h.emit(snap(3));
  expect(row(h, "claude").detail).toBe("Anthropic");
});

test("sign-in failure: one failure asks to try again, a second in a row says it keeps failing", async () => {
  const h = harness();
  h.session.start(); h.session.enter();
  await flush();
  const fail = async (revision: number) => {
    h.emit(snap(revision, { claude: { attempt: { id: `s${revision}`, kind: "signIn" } } }));
    h.emit(snap(revision + 1, { claude: { error: "sign_in_failed" } }));
  };
  await fail(2);
  expect(row(h, "claude").notice).toMatchObject({ role: "alert", body: "Sign-in didn’t finish. Try again." });
  await fail(4);
  expect(row(h, "claude").notice?.body).toBe("Sign-in to Claude Code keeps failing. Check your browser and network, or connect another agent.");
});

test("busy names the provider holding the lock and clears when it ends", async () => {
  const h = harness();
  h.replies.signIn.push({ ok: false, reason: "busy" });
  h.session.start(); h.session.enter();
  await flush();
  h.emit(snap(2, { claude: { attempt: { id: "c", kind: "signIn" } } }));
  h.session.command("codex", "signIn");
  await flush();
  expect(row(h, "codex")).toMatchObject({ detail: "Finish or cancel the Claude Code sign-in first.", detailRole: "status", button: { disabled: true } });
  h.emit(snap(3));
  expect(row(h, "codex").button).toMatchObject({ label: "Sign in", disabled: false });
});

test("stop_required opens the stop dialog; confirming resends with stop, Cancel sends nothing", async () => {
  const h = harness(snap(1, { codex: connected }));
  h.replies.signOut.push({ ok: false, reason: "stop_required" });
  h.replies.signIn.push({ ok: false, reason: "stop_required" });
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("codex", "signOut");
  await flush();
  expect(h.session.state.dialog).toEqual({ kind: "stop", provider: "codex", intent: "signOut" });
  expect(h.session.stopView()?.confirm.label).toBe("Stop and sign out");
  await h.session.confirmStop();
  expect(h.api.signOutAgent.mock.calls).toEqual([["codex", {}], ["codex", { stop: true }]]);
  expect(h.session.state.dialog).toBeNull();
  h.session.command("claude", "reauth");
  await flush();
  expect(h.session.stopView()?.confirm.label).toBe("Stop and sign in");
  h.session.closeDialog();
  expect(h.session.state.dialog).toBeNull();
  expect(h.api.signInAgent.mock.calls).toEqual([["claude", {}]]);
});

test("stale and invalid replies read the latest state instead of showing anything", async () => {
  const h = harness();
  h.replies.signIn.push({ ok: false, reason: "stale" });
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("claude", "signIn");
  await flush();
  expect(h.api.readAgentAuth).toHaveBeenCalledTimes(2);
  expect(row(h, "claude").detail).toBe("Anthropic");
});

test("Continue cancels this window's own sign-in when another provider is ready", async () => {
  const h = harness();
  h.session.start(); h.session.enter();
  await flush();
  expect(await h.session.continue()).toBe(false);
  h.session.command("codex", "signIn");
  await flush();
  h.emit(snap(2, { claude: connected, codex: { attempt: { id: "sign-1", kind: "signIn" } }, cursor: { attempt: { kind: "check", id: "chk" } } }));
  expect(await h.session.continue()).toBe(true);
  expect(h.api.cancelAgentSignIn.mock.calls).toEqual([["codex", "sign-1"]]);
});

test("Continue leaves a sign-in this window did not start", async () => {
  const h = harness();
  h.session.start(); h.session.enter();
  await flush();
  h.emit(snap(2, { claude: connected, codex: { attempt: { id: "elsewhere", kind: "signIn" } } }));
  expect(await h.session.continue()).toBe(true);
  expect(h.api.cancelAgentSignIn).not.toHaveBeenCalled();
});

test("Back cancels this window's own sign-in and keeps saved connections", async () => {
  const h = harness();
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("cursor", "signIn");
  await flush();
  h.emit(snap(2, { claude: connected, cursor: { attempt: { id: "sign-1", kind: "signIn" } } }));
  await h.session.back();
  expect(h.api.cancelAgentSignIn.mock.calls).toEqual([["cursor", "sign-1"]]);
  expect(h.api.signOutAgent).not.toHaveBeenCalled();
});

test("dispose unsubscribes from auth and prompt events and drops late replies", async () => {
  const h = harness();
  h.session.start(); h.session.enter();
  expect(h.listening()).toEqual({ auth: true, prompt: true });
  h.session.dispose();
  expect(h.unsubscribed.sort()).toEqual(["auth", "prompt"]);
  await flush();
  expect(h.session.state.auth).toBeUndefined();
  expect(h.api.checkAgentAuth).not.toHaveBeenCalled();
});

test("the Antigravity paste modal: bounded input, submit to this attempt, Escape returns focus to Paste its address", async () => {
  const h = harness();
  h.session.start(); h.session.enter();
  await flush();
  h.emit(snap(2, { antigravity: { attempt: { id: "ag-1", kind: "signIn" } } }));
  h.prompt({ provider: "antigravity", attemptId: "ag-1", url: "https://accounts.google.com/o" });
  await flush();
  expect(row(h, "antigravity").paste?.button.label).toBe("Paste its address");
  h.session.command("antigravity", "pasteAddress");
  expect(h.session.state.dialog).toMatchObject({ kind: "paste", provider: "antigravity", attemptId: "ag-1", value: "" });
  h.session.setPaste("x".repeat(16385));
  expect(h.session.pasteSubmittable()).toBe(false);
  h.session.closeDialog();
  expect(h.session.state.dialog).toBeNull();
  expect(h.session.state.focus).toMatchObject({ target: "paste" });
  expect(h.api.submitAgentSignInCode).not.toHaveBeenCalled();
  h.session.command("antigravity", "pasteAddress");
  h.session.setPaste("http://localhost:51121/callback?code=1");
  await h.session.submitPaste();
  expect(h.api.submitAgentSignInCode.mock.calls).toEqual([["antigravity", "ag-1", "http://localhost:51121/callback?code=1"]]);
  expect(h.session.state.dialog).toBeNull();
});

test("first ready is announced with role=status when the window regains focus, then focus moves to Continue", async () => {
  const h = harness(snap(1), false);
  h.session.start(); h.session.enter();
  await flush();
  h.emit(snap(2, { claude: connected }));
  expect(h.session.state.announcement).toBeNull();
  h.setFocus(true);
  h.session.windowFocused();
  await flush();
  expect(h.session.state.announcement?.text).toBe("Claude Code connected");
  expect(h.session.state.focus).toMatchObject({ target: "continue" });
  const seq = h.session.state.announcement?.seq;
  h.session.windowFocused();
  await flush();
  expect(h.session.state.announcement?.seq).toBe(seq);
});

test("a provider already ready on entry is not announced", async () => {
  const h = harness(snap(1, { claude: connected }));
  h.session.start(); h.session.enter();
  await flush();
  h.session.windowFocused();
  await flush();
  expect(h.session.state.announcement).toBeNull();
  expect(h.session.view().anyReady).toBe(true);
});

test("an unreadable account store shows Retry, which reads again", async () => {
  const h = harness(null);
  h.session.start(); h.session.enter();
  await flush();
  expect(h.session.view().notice?.body).toBe("doan couldn’t read its agent connections.");
  h.setRead(snap(1));
  h.session.retryRead();
  await flush();
  expect(h.session.view().notice).toBeNull();
  expect(h.session.view().providers).toHaveLength(5);
});

test("an older read reply never replaces a newer event", async () => {
  const h = harness(snap(1));
  h.session.start(); h.session.enter();
  h.emit(snap(5, { claude: connected }));
  await flush();
  expect(h.session.state.auth?.revision).toBe(5);
});

test("entering again before a check's snapshot arrives does not send the check twice", async () => {
  const h = harness(snap(1, { codex: unverified }));
  h.session.start(); h.session.enter(); h.session.enter();
  await flush();
  expect(checked(h)).toEqual(["codex"]);
});

test("a ready change seen while the window has focus is not announced and does not move focus", async () => {
  const h = harness(snap(1, { codex: unverified }));
  h.session.start(); h.session.enter();
  await flush();
  h.emit(snap(2, { codex: connected }));
  h.session.windowFocused();
  await flush();
  expect(h.session.state.announcement).toBeNull();
  expect(h.session.state.focus).toBeNull();
});

test("an older install page result never replaces a newer one", async () => {
  const h = harness(snap(1, { claude: { facts: { cli: "missing" } }, codex: { facts: { cli: "missing" } } }));
  let first: (ok: boolean) => void = () => {};
  vi.mocked(h.deps.openInstall).mockImplementationOnce(() => new Promise(resolve => { first = resolve; })).mockResolvedValueOnce(true);
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("claude", "install");
  h.session.command("codex", "install");
  await flush();
  first(false);
  await flush();
  expect(h.session.state.installError).toBeNull();
  h.session.windowFocused();
  await flush();
  expect(checked(h)).toEqual(["codex"]);
});

test("the paste modal cannot be dismissed while its address is being submitted", async () => {
  const h = harness();
  let done: (r: AuthReply) => void = () => {};
  h.api.submitAgentSignInCode.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
  h.session.start(); h.session.enter();
  await flush();
  h.emit(snap(2, { antigravity: { attempt: { id: "ag-1", kind: "signIn" } } }));
  h.session.command("antigravity", "pasteAddress");
  h.session.setPaste("http://localhost:1/cb");
  const submitting = h.session.submitPaste();
  h.session.closeDialog();
  expect(h.session.state.dialog).toMatchObject({ kind: "paste", submitting: true });
  done({ ok: true });
  await submitting;
  expect(h.session.state.dialog).toBeNull();
});

test("fix 1: a prompt for an attempt this window did not start (CLI or MCP) never opens a link here", async () => {
  const h = harness();
  h.session.start(); h.session.enter();
  await flush();
  h.prompt({ provider: "claude", attemptId: "cli-started", url: "https://claude.com/oauth" });
  await flush();
  expect(h.api.openAgentSignInLink).not.toHaveBeenCalled();
  expect(h.session.state.contexts.claude?.prompt).toBe("cli-started");
});

test("fix 1: a prompt that arrives before this window's sign-in reply is opened once the reply names it", async () => {
  const h = harness();
  let reply: (r: AuthStartReply) => void = () => {};
  h.api.signInAgent.mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("antigravity", "signIn");
  h.prompt({ provider: "antigravity", attemptId: "ag-early", url: "https://accounts.google.com/o" });
  await flush();
  expect(h.api.openAgentSignInLink).not.toHaveBeenCalled();
  reply({ ok: true, attemptId: "ag-early" });
  await flush();
  expect(h.api.openAgentSignInLink.mock.calls).toEqual([["antigravity", "ag-early"]]);
});

test("fix 1: a held prompt for someone else's attempt is dropped when this window's reply names another", async () => {
  const h = harness();
  let reply: (r: AuthStartReply) => void = () => {};
  h.api.signInAgent.mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("codex", "signIn");
  h.prompt({ provider: "claude", attemptId: "cli-claude", url: "https://claude.com/oauth" });
  reply({ ok: false, reason: "busy" });
  await flush();
  expect(h.api.openAgentSignInLink).not.toHaveBeenCalled();
});

test("fix 3: the paste modal closes when its attempt ends, and focus goes to the heading fallback", async () => {
  const h = harness();
  h.session.start(); h.session.enter();
  await flush();
  h.emit(snap(2, { antigravity: { attempt: { id: "ag-1", kind: "signIn" } } }));
  h.session.command("antigravity", "pasteAddress");
  h.session.setPaste("http://localhost:1/cb");
  h.emit(snap(3, { antigravity: connected }));
  expect(h.session.state.dialog).toBeNull();
  expect(h.session.state.focus).toMatchObject({ target: "paste", provider: "antigravity" });
  await h.session.submitPaste();
  expect(h.api.submitAgentSignInCode).not.toHaveBeenCalled();
});

test("fix 3: an over-long address stays whole in the field and cannot be submitted", async () => {
  const h = harness();
  h.session.start(); h.session.enter();
  await flush();
  h.emit(snap(2, { antigravity: { attempt: { id: "ag-1", kind: "signIn" } } }));
  h.session.command("antigravity", "pasteAddress");
  h.session.setPaste("x".repeat(16385));
  expect(h.session.state.dialog).toMatchObject({ value: "x".repeat(16385) });
  expect(h.session.pasteTooLong()).toBe(true);
  expect(h.session.pasteSubmittable()).toBe(false);
  h.session.setPaste("x".repeat(16384));
  expect(h.session.pasteTooLong()).toBe(false);
});

test("conductor: this window's own sign-in turning ready while focused is announced once without moving focus", async () => {
  const h = harness();
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("claude", "signIn");
  await flush();
  h.emit(snap(2, { claude: { attempt: { id: "sign-1", kind: "signIn" } } }));
  h.emit(snap(3, { claude: connected }));
  expect(h.session.state.announcement?.text).toBe("Claude Code connected");
  expect(h.session.state.focus).toBeNull();
  const seq = h.session.state.announcement?.seq;
  h.emit(snap(4, { claude: connected, codex: connected }));
  expect(h.session.state.announcement?.seq).toBe(seq);
});

test("a stop_required reply that lands after leaving the step opens no dialog", async () => {
  const h = harness(snap(1, { claude: connected }));
  let reply: (r: AuthStartReply) => void = () => {};
  h.api.signInAgent.mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("codex", "signIn");
  await h.session.back();
  reply({ ok: false, reason: "stop_required" });
  await flush();
  expect(h.session.state.dialog).toBeNull();
});

test("a rejected read keeps the list already shown", async () => {
  const h = harness(snap(1, { claude: connected }));
  h.session.start(); h.session.enter();
  await flush();
  h.api.readAgentAuth.mockRejectedValueOnce(new Error("ipc"));
  h.session.windowFocused();
  await flush();
  expect(h.session.state.auth?.revision).toBe(1);
  expect(h.session.view().notice).toBeNull();
});

test("U2: the install line names the provider whose page did not open", async () => {
  const h = harness(snap(1, { cursor: { facts: { cli: "missing" } } }));
  vi.mocked(h.deps.openInstall).mockResolvedValueOnce(false);
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("cursor", "install");
  await flush();
  expect(h.session.state.installError).toBe("Couldn’t open the Cursor install page.");
});

test("U2: a reloaded window still cancels the sign-ins it started before the reload", async () => {
  const stored: string[][] = [];
  const first = harness();
  first.deps.remember = ids => { stored.push([...ids]); };
  first.session.start(); first.session.enter();
  await flush();
  first.session.command("codex", "signIn");
  await flush();
  expect(stored.at(-1)).toEqual(["sign-1"]);
  first.session.dispose();
  const reloaded = harness();
  reloaded.deps.recall = () => stored.at(-1) ?? [];
  const session = new AgentStepSession(reloaded.deps);
  session.start(); session.enter();
  await flush();
  reloaded.emit(snap(2, { claude: connected, codex: { attempt: { id: "sign-1", kind: "signIn" } } }));
  // The harness session is a separate instance; emit reaches the latest subscriber, which is this one.
  expect(await session.continue()).toBe(true);
  expect(reloaded.api.cancelAgentSignIn.mock.calls).toEqual([["codex", "sign-1"]]);
});

test("D21: returning from Copilot's install page checks Copilot while its cause is the CLI or its version (no request is spent)", async () => {
  const h = harness(snap(1, { copilot: { facts: { cli: "missing" } } }));
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("copilot", "install");
  await flush();
  h.session.windowFocused();
  await flush();
  expect(checked(h)).toEqual(["copilot"]);
});

test("D21: Copilot connected but unverified is not checked on return; it stays Retry-only", async () => {
  const h = harness(snap(1, { copilot: unverified }));
  h.session.start(); h.session.enter();
  await flush();
  h.session.command("copilot", "update");
  await flush();
  h.session.windowFocused();
  await flush();
  expect(checked(h)).toEqual([]);
});
