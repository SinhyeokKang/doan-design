import { afterEach, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mocks = vi.hoisted(() => ({ run: vi.fn(), probe: vi.fn() }));
vi.mock("../onboarding/machine", () => ({ probeShell: mocks.probe, runProcess: mocks.run }));
import { createAccountPrepare, routePrepare, type AccountRuntime } from "./prepare";
import { ConversationService, type OpenRunner, type Runner } from "./service";
import { ConversationStore, type ConversationMetadata } from "./store";
import { initialAuthState } from "../agentAuth/state";
import type { Lease } from "../agentAuth/manager";
import type { AccountConnection, AuthState, Provider } from "../agentAuth/types";

const paths: string[] = [];
afterEach(() => { vi.clearAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
function temp() { const dir = realpathSync(mkdtempSync(join(tmpdir(), "doan-account-"))); paths.push(dir); return dir; }
const CLAUDE_SESSION = "4f0c8c1e-6a43-4c8e-9a39-6c1f5b7a2d10", CODEX_SESSION = "01a178ba-f9dc-7161-9544-f20f656064a1";

// A fake account runtime: state is a plain value the test changes; leases count until released.
function account(provider: Provider, profileDir: string, id: string | null = "acct-1") {
  const connection: AccountConnection = { provider, connectionId: "conn-1", profile: provider, account: { id, workspace: null, email: "ada@example.com" } };
  let state: AuthState = { ...initialAuthState(provider, connection), verified: true, generation: 1 };
  const leases = { open: 0, acquired: 0 };
  const onAcquire: (() => void)[] = [];
  const runtime: AccountRuntime = {
    state: () => state,
    check: vi.fn(async () => { state = { ...state, verified: true }; return { ok: true as const, attemptId: "check", done: Promise.resolve(state) }; }),
    checked: vi.fn(async () => { if (state.attempt?.kind === "check") state = { ...state, attempt: null, verified: true }; }),
    acquire: vi.fn(async (): Promise<Lease> => {
      if (!state.connection) throw new Error("not_connected");
      if (!state.verified) throw new Error("unverified");
      onAcquire.shift()?.();
      leases.open += 1; leases.acquired += 1; let released = false;
      return { command: `/bin/${provider}`, env: { PATH: "/shell/bin", HOME: "/Users/ada", [provider === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME"]: profileDir, DOAN_RUNTIME: "/data/runtime.json" }, profileDir,
        release: async () => { if (!released) { released = true; leases.open -= 1; } } };
    }),
  };
  return { runtime, leases, onAcquire, set: (next: Partial<AuthState>) => { state = { ...state, ...next }; }, get: () => state };
}
function version(provider: Provider) { mocks.run.mockResolvedValue({ exitCode: 0, timedOut: false, stdout: provider === "claude" ? "2.1.312 (Claude Code)" : "codex-cli 0.163.0" }); }
function harness(provider: Provider, id: string | null = "acct-1") {
  const data = temp(), root = temp(), profile = join(temp(), "profile"); mkdirSync(profile);
  const auth = account(provider, profile, id); version(provider);
  const external = vi.fn(async () => ({ runtime: provider as "claude" | "codex", configDir: "/external", cwd: root, command: "/external/cli", env: {} }));
  const prepare = routePrepare(external, createAccountPrepare(auth.runtime, "/Applications/doan.app/Contents/Resources/bin/doan"));
  const exits: (() => void)[] = []; const runners: Runner[] = [];
  const open = vi.fn<OpenRunner>(async (input, _emit, exited, registerStop) => {
    registerStop(async () => {}); exits.push(exited);
    const runner: Runner = { sessionId: input.sessionId ?? (provider === "claude" ? CLAUDE_SESSION : CODEX_SESSION), send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    runners.push(runner); return runner;
  });
  const store = new ConversationStore(data);
  const service = new ConversationService(store, prepare, open, () => {});
  return { data, root, profile, auth, external, prepare, open, exits, runners, store, service };
}
const start = (h: ReturnType<typeof harness>, provider: "claude" | "codex") => h.service.start({ root: h.root, mode: "new", runtime: provider, text: "make a canvas", anchors: [] });
function claudeTranscript(profile: string) { mkdirSync(join(profile, "projects", "repo"), { recursive: true }); mkdirSync(join(profile, "sessions"), { recursive: true }); writeFileSync(join(profile, "projects", "repo", `${CLAUDE_SESSION}.jsonl`), "{}\n"); }
function codexRollout(profile: string, cwd: string) {
  const dir = join(profile, "sessions", "2026", "10", "28"); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `rollout-2026-10-28T00-00-00-${CODEX_SESSION}.jsonl`), JSON.stringify({ type: "session_meta", payload: { id: CODEX_SESSION, cwd, cli_version: "0.163.0" } }) + "\n");
}

it("starts a new conversation on the doan account and keeps the lease until the process group is gone", async () => {
  const h = harness("claude");
  const { conversationId } = await start(h, "claude");
  const [input] = h.open.mock.calls[0]!;
  expect(input.configDir).toBe(h.profile); expect(input.command).toBe("/bin/claude");
  expect(input.env.PATH).toBe("/Applications/doan.app/Contents/Resources/bin:/shell/bin");
  expect(h.external).not.toHaveBeenCalled();
  const [stored] = h.store.list();
  expect(stored).toMatchObject({ conversationId, owner: { kind: "doan", provider: "claude", connectionId: "conn-1", accountId: "acct-1", workspaceId: null, profile: "claude" }, session: { runtime: "claude", configDir: h.profile, sessionId: CLAUDE_SESSION, origin: "new" } });
  h.service.receive(conversationId, { type: "turn.done" });
  expect(h.auth.leases.open).toBe(1);
  h.exits[0]!(); await Promise.resolve();
  expect(h.auth.leases.open).toBe(0);
});

it("passes Codex's dedicated credential-store and non-login shell arguments to the runner", async () => {
  const h = harness("codex");
  await start(h, "codex");
  expect(h.open.mock.calls[0]![0].args).toEqual(["-c", 'cli_auth_credentials_store="keyring"', "-c", "allow_login_shell=false"]);
});

it("refuses a start whose account changed while the version check awaited, before anything is stored or spawned", async () => {
  const h = harness("claude");
  mocks.run.mockImplementationOnce(async () => { h.auth.set({ generation: 2, connection: { ...h.auth.get().connection!, connectionId: "conn-2" } }); return { exitCode: 0, timedOut: false, stdout: "2.1.312" }; });
  await expect(start(h, "claude")).rejects.toThrow("not_logged_in");
  expect(h.open).not.toHaveBeenCalled(); expect(h.store.list()).toEqual([]); expect(h.auth.leases.open).toBe(0);
});

it("refuses acceptance when the account changed while the runner was opening and releases only after the group exits", async () => {
  const h = harness("codex");
  h.open.mockImplementationOnce(async (input, _emit, exited, registerStop) => {
    registerStop(async () => {}); h.exits.push(exited);
    h.auth.set({ expired: true });
    const runner: Runner = { sessionId: CODEX_SESSION, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    h.runners.push(runner); return runner;
  });
  await expect(start(h, "codex")).rejects.toThrow("not_logged_in");
  expect(h.store.list()).toEqual([]); expect(h.runners[0]!.close).toHaveBeenCalledOnce();
  expect(h.auth.leases.open).toBe(1);
  h.exits[0]!(); await Promise.resolve(); expect(h.auth.leases.open).toBe(0);
});

it("releases the lease at once when opening fails before anything was spawned", async () => {
  const h = harness("claude");
  h.open.mockImplementationOnce(async () => { throw new Error("process_exited"); });
  await expect(start(h, "claude")).rejects.toThrow("process_exited");
  await Promise.resolve(); expect(h.auth.leases.open).toBe(0);
});

it.each([
  ["signed out", { connection: null }, "not_connected", "not_logged_in"],
  ["reauth required", { expired: true }, "reauth_required", "not_logged_in"],
  ["account mismatch", { error: { code: "account_mismatch" as const } }, "account_mismatch", "not_logged_in"],
  ["sign-in in progress", { attempt: { id: "a", kind: "signIn" as const, owner: 1, cancelled: false } }, "busy", "busy"],
] as [string, Partial<AuthState>, string, string][])("refuses a new run when the account is %s without falling back to the external profile", async (_label, next, refusal, code) => {
  const h = harness("claude"); h.auth.set(next);
  (h.auth.runtime.acquire as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => { throw new Error(refusal); });
  await expect(start(h, "claude")).rejects.toThrow(code);
  expect(h.external).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled();
});

it("checks a stored connection that has not been verified since launch before the first run", async () => {
  const h = harness("codex"); h.auth.set({ verified: false });
  await start(h, "codex");
  expect(h.auth.runtime.check).toHaveBeenCalledOnce(); expect(h.open).toHaveBeenCalledOnce();
});

it("waits for a check another caller started instead of refusing the run", async () => {
  const h = harness("claude"); h.auth.set({ verified: false, attempt: { id: "settings-check", kind: "check", owner: null, cancelled: false } });
  await start(h, "claude");
  expect(h.auth.runtime.checked).toHaveBeenCalled(); expect(h.auth.runtime.check).not.toHaveBeenCalled(); expect(h.open).toHaveBeenCalledOnce();
});

it("refuses an unsupported executable version and a missing bundled doan CLI", async () => {
  const h = harness("claude"); mocks.run.mockResolvedValueOnce({ exitCode: 0, timedOut: false, stdout: "2.1.310 (Claude Code)" });
  await expect(start(h, "claude")).rejects.toThrow("runtime_unsupported"); expect(h.auth.leases.open).toBe(0);
  const devBuild = createAccountPrepare(h.auth.runtime, "doan");
  await expect(devBuild({ root: h.root, mode: "new", runtime: "claude", text: "x", anchors: [] })).rejects.toThrow("cli_missing");
});

it("resumes a doan Claude conversation only for the same account, profile and an existing free session", async () => {
  const h = harness("claude");
  const { conversationId } = await start(h, "claude"); h.service.receive(conversationId, { type: "turn.done" }); h.exits[0]!();
  claudeTranscript(h.profile);
  await h.service.send(conversationId, "again", []);
  expect(h.open).toHaveBeenCalledTimes(2); expect(h.open.mock.calls[1]![0].sessionId).toBe(CLAUDE_SESSION);
  h.service.receive(conversationId, { type: "turn.done" }); h.exits[1]!();
  // Another account signed in on the same profile: the old conversation does not run on it.
  h.auth.set({ connection: { ...h.auth.get().connection!, connectionId: "conn-2", account: { id: "acct-2", workspace: null } }, generation: 2 });
  const before = readFileSync(join(h.data, "conversations", `${conversationId}.jsonl`), "utf8");
  await expect(h.service.send(conversationId, "other account", [])).rejects.toThrow("session_unavailable");
  expect(readFileSync(join(h.data, "conversations", `${conversationId}.jsonl`), "utf8")).toBe(before);
  expect(h.open).toHaveBeenCalledTimes(2); await Promise.resolve(); expect(h.auth.leases.open).toBe(0);
});

it("rebinds a conversation to a new connection of the same account after its session is verified", async () => {
  const h = harness("claude");
  const { conversationId } = await start(h, "claude"); h.service.receive(conversationId, { type: "turn.done" }); h.exits[0]!();
  claudeTranscript(h.profile);
  h.auth.set({ connection: { ...h.auth.get().connection!, connectionId: "conn-2" }, generation: 2 });
  await h.service.send(conversationId, "after reauth", []);
  expect(h.store.list()[0]?.owner).toMatchObject({ kind: "doan", connectionId: "conn-2", accountId: "acct-1" });
});

it("refuses to resume a missing or occupied Claude session", async () => {
  const h = harness("claude");
  const { conversationId } = await start(h, "claude"); h.service.receive(conversationId, { type: "turn.done" }); h.exits[0]!();
  await expect(h.service.send(conversationId, "no transcript", [])).rejects.toThrow("session_unavailable");
  claudeTranscript(h.profile); writeFileSync(join(h.profile, "sessions", "bad.json"), "broken");
  await expect(h.service.send(conversationId, "unknown registry", [])).rejects.toThrow("session_unavailable");
  await Promise.resolve(); expect(h.auth.leases.open).toBe(0);
});

it("resumes a Codex conversation without a stable account ID only on its own connection", async () => {
  const h = harness("codex", null);
  const { conversationId } = await start(h, "codex"); h.service.receive(conversationId, { type: "turn.done" }); h.exits[0]!();
  codexRollout(h.profile, h.root);
  await h.service.send(conversationId, "after restart", []);
  expect(h.open).toHaveBeenCalledTimes(2); expect(h.open.mock.calls[1]![0].sessionId).toBe(CODEX_SESSION);
  h.service.receive(conversationId, { type: "turn.done" }); h.exits[1]!();
  // A reauth stores a new connection; without an ID it cannot be proven to hold the same login.
  h.auth.set({ connection: { ...h.auth.get().connection!, connectionId: "conn-2" }, generation: 2 });
  await expect(h.service.send(conversationId, "after reauth", [])).rejects.toThrow("session_unavailable");
  expect(h.open).toHaveBeenCalledTimes(2); expect(h.store.list()[0]?.owner).toMatchObject({ connectionId: "conn-1" });
});

it("resumes a Codex conversation with a stable account ID and releases the extra lease when the owning server is reused", async () => {
  const h = harness("codex");
  const { conversationId } = await start(h, "codex"); h.service.receive(conversationId, { type: "turn.done" });
  codexRollout(h.profile, h.root);
  await h.service.send(conversationId, "reuse", []);
  expect(h.open).toHaveBeenCalledOnce(); await Promise.resolve(); expect(h.auth.leases.open).toBe(1);
  h.service.receive(conversationId, { type: "turn.done" }); h.exits[0]!();
  await h.service.send(conversationId, "restart", []);
  expect(h.open).toHaveBeenCalledTimes(2); expect(h.open.mock.calls[1]![0].sessionId).toBe(CODEX_SESSION);
});

it("keeps legacy external entries and resumed associations on the external profile", async () => {
  const h = harness("codex");
  const legacy: ConversationMetadata = { conversationId: "legacy-1", root: h.root, title: "t", state: "current", owner: { kind: "legacy-external" }, session: { runtime: "codex", origin: "resumed", sessionId: CODEX_SESSION, configDir: "/external", cwd: h.root } };
  await h.prepare({ root: h.root, mode: "resume", text: "x", anchors: [] }, legacy);
  await h.prepare({ root: h.root, mode: "resume", text: "x", anchors: [] });
  expect(h.external).toHaveBeenCalledTimes(2); expect(h.external.mock.calls[0]).toEqual([expect.anything(), legacy.session]);
  expect(h.auth.runtime.acquire).not.toHaveBeenCalled();
});
