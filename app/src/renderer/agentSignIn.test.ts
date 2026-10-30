import { expect, test, vi } from "vitest";
import type { AuthPromptEvent, AuthReply, AuthSnapshot, AuthStartReply } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import { PROVIDERS, type AccountIdentity, type AuthAttempt, type AuthErrorCode, type AuthState, type AuthStatusDto, type Provider } from "../main/agentAuth/types";
import { AgentSignIn, type RowsConsumer } from "./agentSignIn";
import { authListView } from "./agentAuthView";

const ACCOUNT: AccountIdentity = { id: "acct-1", workspace: "org-1", email: "ada@example.com", displayName: "Ada" };
interface Fixture { account?: AccountIdentity | null; verified?: boolean; attempt?: { id?: string; kind: AuthAttempt["kind"] } | null; error?: AuthErrorCode | null }
function dto(provider: Provider, f: Fixture = {}): AuthStatusDto {
  const account = f.account ?? null;
  const state: AuthState = {
    provider, generation: 1, verified: f.verified ?? false, expired: false,
    connection: account ? { provider, connectionId: "conn-1", profile: provider, account } : null,
    attempt: f.attempt ? { id: "a1", owner: 7, cancelled: false, ...f.attempt } : null,
    error: f.error ? { code: f.error } : null,
    phase: f.attempt ? (f.attempt.kind === "check" ? "checking" : f.attempt.kind === "signIn" ? "signingIn" : "signingOut") : account ? "connected" : f.error ? "error" : "disconnected",
  };
  return authStatus(state, { cli: "found", version: "supported", tools: "ready" }, 1);
}
const snap = (revision: number, over: Partial<Record<Provider, Fixture>> = {}): AuthSnapshot => ({ revision, providers: PROVIDERS.map(p => dto(p, over[p])) });
const connected = { account: ACCOUNT, verified: true };
const signingIn = (id: string) => ({ attempt: { id, kind: "signIn" as const } });

function harness(focused = true) {
  // Sets, so a subscription a dispose failed to remove would still be reached.
  const auth = new Set<(s: AuthSnapshot) => void>(), prompt = new Set<(e: AuthPromptEvent) => void>();
  let attempts = 0;
  const api = {
    readAgentAuth: vi.fn(async (): Promise<AuthSnapshot | null> => snap(1)),
    onAgentAuth: vi.fn((listener: (s: AuthSnapshot) => void) => { auth.add(listener); return () => { auth.delete(listener); }; }),
    checkAgentAuth: vi.fn(async (_p: Provider): Promise<AuthStartReply> => ({ ok: true, attemptId: `check-${++attempts}` })),
    signInAgent: vi.fn(async (_p: Provider, _o?: { stop?: boolean }): Promise<AuthStartReply> => ({ ok: true, attemptId: `sign-${++attempts}` })),
    signOutAgent: vi.fn(async (_p: Provider, _o?: { stop?: boolean }): Promise<AuthStartReply> => ({ ok: true, attemptId: `out-${++attempts}` })),
    cancelAgentSignIn: vi.fn(async (_p: Provider, _id: string): Promise<AuthReply> => ({ ok: true })),
    submitAgentSignInCode: vi.fn(async (_p: Provider, _id: string, _code: string): Promise<AuthReply> => ({ ok: true })),
    openAgentSignInLink: vi.fn(async (_p: Provider, _id: string): Promise<AuthReply> => ({ ok: true })),
    onAgentSignInPrompt: vi.fn((listener: (e: AuthPromptEvent) => void) => { prompt.add(listener); return () => { prompt.delete(listener); }; }),
  };
  const controller = new AgentSignIn({ api, hasFocus: () => focused });
  const toasts: unknown[] = [];
  controller.onToast(toast => toasts.push(toast));
  const announced: [string, boolean][] = [];
  const rows: RowsConsumer = { announce: (text, returning) => announced.push([text, returning]), dialog: vi.fn() };
  return {
    controller, api, toasts, announced, rows,
    setFocus(value: boolean) { focused = value; },
    emit(next: AuthSnapshot) { for (const listener of auth) listener(next); },
    prompt(event: AuthPromptEvent) { for (const listener of prompt) listener(event); },
    listening: () => ({ auth: auth.size, prompt: prompt.size }),
    row(provider: Provider) { return authListView(controller.state.auth, controller.state.contexts).providers.find(p => p.provider === provider)!; },
  };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test("one controller subscribes once, however many screens read it", () => {
  const h = harness();
  h.controller.start(); h.controller.start();
  const stops = [h.controller.subscribe(() => {}), h.controller.subscribe(() => {})];
  expect(h.api.onAgentAuth).toHaveBeenCalledTimes(1);
  expect(h.api.onAgentSignInPrompt).toHaveBeenCalledTimes(1);
  for (const stop of stops) stop();
});

test("a prompt that arrives while no page shows the rows is kept: shown again, the row has Open again and Paste its address", async () => {
  const h = harness();
  h.controller.start();
  const hide = h.controller.show(h.rows);
  h.controller.signIn("antigravity");
  await flush();
  h.emit(snap(2, { antigravity: signingIn("sign-1") }));
  hide();
  h.prompt({ provider: "antigravity", attemptId: "sign-1", url: "https://accounts.google.com/o/oauth2/auth" });
  await flush();
  // The attempt is this renderer's, so its link still opens once while the page is away.
  expect(h.api.openAgentSignInLink.mock.calls).toEqual([["antigravity", "sign-1"]]);
  h.controller.show(h.rows);
  const row = h.row("antigravity");
  expect(row.notice?.title).toBe("Finish signing in to Antigravity");
  expect(row.notice?.actions.map(a => a.label)).toEqual(["Cancel", "Open again"]);
  expect(row.paste?.button.label).toBe("Paste its address");
});

test("a prompt that comes before this renderer's sign-in reply is held, then opened once the reply names it", async () => {
  const h = harness();
  h.controller.start();
  let reply: (r: AuthStartReply) => void = () => {};
  h.api.signInAgent.mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
  h.controller.signIn("claude");
  h.prompt({ provider: "claude", attemptId: "sign-9", url: "https://claude.ai/oauth/authorize" });
  await flush();
  expect(h.api.openAgentSignInLink).not.toHaveBeenCalled();
  reply({ ok: true, attemptId: "sign-9" });
  await flush();
  expect(h.api.openAgentSignInLink.mock.calls).toEqual([["claude", "sign-9"]]);
  expect(h.controller.owned()).toEqual(["sign-9"]);
});

test("a ready change is announced exactly once on the page that shows the rows", async () => {
  const h = harness();
  h.controller.start();
  h.controller.show(h.rows);
  h.controller.signIn("codex");
  await flush();
  h.emit(snap(2, { codex: signingIn("sign-1") }));
  h.emit(snap(3, { codex: connected }));
  h.emit(snap(4, { codex: connected }));
  h.controller.windowFocused();
  await flush();
  expect(h.announced).toEqual([["Codex connected", false]]);
  expect(h.toasts).toEqual([]);
});

test("a ready change while the window is in the background is announced once when it returns", async () => {
  const h = harness(false);
  h.controller.start();
  h.controller.show(h.rows);
  h.emit(snap(2, { codex: signingIn("cli-1") }));
  h.emit(snap(3, { codex: connected }));
  expect(h.announced).toEqual([]);
  h.setFocus(true);
  h.controller.windowFocused();
  h.controller.windowFocused();
  await flush();
  expect(h.announced).toEqual([["Codex connected", true]]);
  expect(h.toasts).toEqual([]);
});

test("a sign-in that finishes while no page shows the rows is told once in a toast, and never announced later", async () => {
  const h = harness();
  h.controller.start();
  const hide = h.controller.show(h.rows);
  h.controller.signIn("codex");
  await flush();
  h.emit(snap(2, { codex: signingIn("sign-1") }));
  hide();
  h.emit(snap(3, { codex: connected }));
  h.emit(snap(4, { codex: connected }));
  h.controller.show(h.rows);
  h.controller.windowFocused();
  await flush();
  expect(h.toasts).toEqual([{ text: "Codex connected.", action: null }]);
  expect(h.announced).toEqual([]);
});

test("a background ready change with no page shown is told once in a toast when the window returns", async () => {
  const h = harness(false);
  h.controller.start();
  h.emit(snap(2, { codex: signingIn("cli-1") }));
  h.emit(snap(3, { codex: connected }));
  h.setFocus(true);
  h.controller.windowFocused();
  h.controller.windowFocused();
  await flush();
  expect(h.toasts).toEqual([{ text: "Codex connected.", action: null }]);
});

test("a sign-in that fails while no page shows the rows offers Open Agents settings; a cancelled one says nothing", async () => {
  const h = harness();
  h.controller.start();
  h.emit(snap(2, { codex: signingIn("sign-1"), cursor: signingIn("sign-2") }));
  h.emit(snap(3, { codex: { error: "sign_in_failed" } }));
  expect(h.toasts).toEqual([{ text: "Codex sign-in didn’t finish.", action: { label: "Open Agents settings", target: { section: "agents", provider: "codex" } } }]);
});

test("a check that turns a connection ready while no page shows the rows makes no toast", async () => {
  const h = harness();
  h.controller.start();
  h.emit(snap(2, { codex: { account: ACCOUNT } }));
  h.emit(snap(3, { codex: { account: ACCOUNT, attempt: { id: "check-1", kind: "check" } } }));
  h.emit(snap(4, { codex: connected }));
  h.controller.windowFocused();
  await flush();
  expect(h.toasts).toEqual([]);
});

test("a stop_required reply opens the dialog only on the page that shows the rows", async () => {
  const h = harness();
  h.controller.start();
  h.api.signOutAgent.mockResolvedValueOnce({ ok: false, reason: "stop_required" });
  h.controller.signOut("codex");
  await flush();
  expect(h.rows.dialog).not.toHaveBeenCalled();
  h.controller.show(h.rows);
  h.api.signOutAgent.mockResolvedValueOnce({ ok: false, reason: "stop_required" });
  h.controller.signOut("codex");
  await flush();
  expect(h.rows.dialog).toHaveBeenCalledWith("codex", "signOut");
});

test("cancelOwned cancels only the sign-ins this renderer started", async () => {
  const h = harness();
  h.controller.start();
  h.controller.signIn("claude");
  await flush();
  h.emit(snap(2, { claude: signingIn("sign-1"), codex: signingIn("cli-1") }));
  await h.controller.cancelOwned();
  expect(h.api.cancelAgentSignIn.mock.calls).toEqual([["claude", "sign-1"]]);
});

// review-BP 🟡1: a queued row announcement keeps where it came from, so a check is never told as a sign-in.
test("a check that turned ready in the background is not a toast once the page that would announce it is gone", async () => {
  const h = harness(false);
  h.controller.start();
  const hide = h.controller.show(h.rows);
  h.emit(snap(2, { codex: { account: ACCOUNT, attempt: { id: "check-1", kind: "check" } } }));
  h.emit(snap(3, { codex: connected }));
  hide();
  h.setFocus(true);
  h.controller.windowFocused();
  expect(h.toasts).toEqual([]);
  expect(h.announced).toEqual([]);
});

test("a sign-in that finished in the background is one toast once the page that would announce it is gone", async () => {
  const h = harness(false);
  h.controller.start();
  const hide = h.controller.show(h.rows);
  h.emit(snap(2, { codex: signingIn("cli-1") }));
  h.emit(snap(3, { codex: connected }));
  hide();
  h.setFocus(true);
  h.controller.windowFocused();
  h.controller.windowFocused();
  expect(h.toasts).toEqual([{ text: "Codex connected.", action: null }]);
  expect(h.announced).toEqual([]);
});

// review-BP ⚪1: the controller's own lifetime.
test("start after dispose subscribes again, and each snapshot and prompt is handled once", async () => {
  const h = harness();
  const changed = vi.fn();
  h.controller.subscribe(changed);
  h.controller.start();
  h.controller.dispose();
  expect(h.listening()).toEqual({ auth: 0, prompt: 0 });
  h.controller.start();
  expect(h.listening()).toEqual({ auth: 1, prompt: 1 });
  h.controller.signIn("claude");
  await flush();
  changed.mockClear();
  h.emit(snap(2, { claude: signingIn("sign-1") }));
  expect(changed).toHaveBeenCalledTimes(1);
  h.prompt({ provider: "claude", attemptId: "sign-1", url: "https://claude.ai/oauth/authorize" });
  await flush();
  expect(h.api.openAgentSignInLink.mock.calls).toEqual([["claude", "sign-1"]]);
});

test("a reply that lands after dispose touches no screen, toast or subscriber", async () => {
  const h = harness();
  const changed = vi.fn();
  h.controller.start();
  h.controller.show(h.rows);
  h.controller.subscribe(changed);
  let reply: (r: AuthStartReply) => void = () => {};
  h.api.signOutAgent.mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
  const pending = h.controller.signOut("codex");
  changed.mockClear();
  h.controller.dispose();
  reply({ ok: false, reason: "stop_required" });
  await pending;
  h.emit(snap(2, { codex: connected }));
  expect(h.rows.dialog).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  expect(h.toasts).toEqual([]);
});
