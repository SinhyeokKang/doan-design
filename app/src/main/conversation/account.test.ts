import { afterEach, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mocks = vi.hoisted(() => ({ run: vi.fn(), probe: vi.fn() }));
vi.mock("../onboarding/machine", () => ({ probeShell: mocks.probe, runProcess: mocks.run }));
import { createAccountPrepare, routePrepare, type AccountRuntime, type VersionRecords } from "./prepare";
import { ConversationService, type OpenRunner, type Runner } from "./service";
import { PRESET_GUIDANCE } from "./prompt";
import { ConversationStore, type ConversationMetadata } from "./store";
import { initialAuthState } from "../agentAuth/state";
import { AuthIpc, type AuthSnapshot } from "../agentAuth/ipc";
import type { Lease } from "../agentAuth/manager";
import type { AccountConnection, AuthState, Provider, ToolFacts } from "../agentAuth/types";

const paths: string[] = [];
afterEach(() => { vi.clearAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
function temp() { const dir = realpathSync(mkdtempSync(join(tmpdir(), "doan-account-"))); paths.push(dir); return dir; }
const CLAUDE_SESSION = "4f0c8c1e-6a43-4c8e-9a39-6c1f5b7a2d10", CODEX_SESSION = "01a178ba-f9dc-7161-9544-f20f656064a1", ACP_SESSION = "f8bbe36d-0a01-43cb-a9f5-086050fe4c6b";

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
    confirm: vi.fn(),
    acquire: vi.fn(async (): Promise<Lease> => {
      if (!state.connection) throw new Error("not_connected");
      if (!state.verified && provider !== "copilot") throw new Error("unverified");
      onAcquire.shift()?.();
      leases.open += 1; leases.acquired += 1; let released = false;
      return { command: `/bin/${provider}`, env: { PATH: "/shell/bin", HOME: provider === "claude" || provider === "codex" ? "/Users/ada" : profileDir, ...(provider === "claude" ? { CLAUDE_CONFIG_DIR: profileDir } : provider === "codex" ? { CODEX_HOME: profileDir } : {}), DOAN_RUNTIME: "/data/runtime.json" }, profileDir,
        release: async () => { if (!released) { released = true; leases.open -= 1; } } };
    }),
  };
  return { runtime, leases, onAcquire, set: (next: Partial<AuthState>) => { state = { ...state, ...next }; }, get: () => state };
}
const VERSION_OUTPUT: Record<Provider, string> = { claude: "2.1.312 (Claude Code)", codex: "codex-cli 0.164.0", cursor: "2026.10.22-27dcf5f\n", copilot: "GitHub Copilot CLI 1.0.105.\nRun 'copilot update' to check for updates.\n", antigravity: "" };
function version(provider: Provider) { mocks.run.mockResolvedValue({ exitCode: 0, timedOut: false, stdout: VERSION_OUTPUT[provider] }); }
function harness(provider: Provider, id: string | null = "acct-1", versions?: VersionRecords) {
  const data = temp(), root = temp(), profile = join(temp(), "profile"); mkdirSync(profile);
  const auth = account(provider, profile, id); version(provider);
  const external = vi.fn(async () => ({ runtime: provider as "claude" | "codex", configDir: "/external", cwd: root, command: "/external/cli", env: {} }));
  const toolsFailed = vi.fn<(provider: Provider) => void>();
  const prepare = routePrepare(external, createAccountPrepare(auth.runtime, "/Applications/doan.app/Contents/Resources/bin/doan", toolsFailed, versions));
  const exits: (() => void)[] = []; const runners: Runner[] = [];
  const open = vi.fn<OpenRunner>(async (input, _emit, exited, registerStop) => {
    registerStop(async () => {}); exits.push(exited);
    const runner: Runner = { sessionId: input.sessionId ?? (provider === "claude" ? CLAUDE_SESSION : provider === "codex" ? CODEX_SESSION : ACP_SESSION), send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    runners.push(runner); return runner;
  });
  const store = new ConversationStore(data);
  const service = new ConversationService(store, prepare, open, () => {});
  return { data, root, profile, auth, external, prepare, open, exits, runners, store, service, toolsFailed };
}
const start = (h: ReturnType<typeof harness>, provider: Provider) => h.service.start({ root: h.root, mode: "new", runtime: provider, text: "make a canvas", anchors: [] });
function claudeTranscript(profile: string) { mkdirSync(join(profile, "projects", "repo"), { recursive: true }); mkdirSync(join(profile, "sessions"), { recursive: true }); writeFileSync(join(profile, "projects", "repo", `${CLAUDE_SESSION}.jsonl`), "{}\n"); }
function codexRollout(profile: string, cwd: string) {
  const dir = join(profile, "sessions", "2026", "10", "28"); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `rollout-2026-10-28T00-00-00-${CODEX_SESSION}.jsonl`), JSON.stringify({ type: "session_meta", payload: { id: CODEX_SESSION, cwd, cli_version: "0.164.0" } }) + "\n");
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

it("acquires a conversation start as a run and a model-list read as a listing", async () => {
  const h = harness("claude"); version("claude");
  await start(h, "claude");
  expect(h.auth.runtime.acquire).toHaveBeenLastCalledWith("claude", "run");
  const input = await h.service.prepareListing(h.root, "claude");
  expect(h.auth.runtime.acquire).toHaveBeenLastCalledWith("claude", "listing");
  await input.release?.();
});
it("passes Codex's dedicated credential-store and non-login shell arguments to the runner", async () => {
  const h = harness("codex");
  await start(h, "codex");
  // mcp-connectors B2: the conversation app-server keeps MCP OAuth tokens in the keyring too.
  expect(h.open.mock.calls[0]![0].args).toEqual(["-c", 'cli_auth_credentials_store="keyring"', "-c", 'mcp_oauth_credentials_store="keyring"', "-c", "allow_login_shell=false"]);
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
  ["missing its server, which failed to install", {}, "cli_install_failed", "cli_install_failed"],
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

it("refuses an executable below the minimum version, an unreadable version and a missing bundled doan CLI", async () => {
  const h = harness("claude"); mocks.run.mockResolvedValueOnce({ exitCode: 0, timedOut: false, stdout: "2.1.310 (Claude Code)" });
  await expect(start(h, "claude")).rejects.toThrow("runtime_unsupported"); expect(h.auth.leases.open).toBe(0);
  mocks.run.mockResolvedValueOnce({ exitCode: 0, timedOut: false, stdout: "Claude Code" });
  await expect(start(h, "claude")).rejects.toThrow("runtime_unsupported"); expect(h.auth.leases.open).toBe(0);
  const devBuild = createAccountPrepare(h.auth.runtime, "doan");
  await expect(devBuild({ root: h.root, mode: "new", runtime: "claude", text: "x", anchors: [] })).rejects.toThrow("cli_missing");
});

it("asks for the provider's tool facts again when a run finds its CLI missing or its version below the minimum, and not for other refusals", async () => {
  const h = harness("cursor");
  mocks.run.mockResolvedValueOnce({ exitCode: 0, timedOut: false, stdout: "2026.10.21-0aa1111\n" });
  await expect(start(h, "cursor")).rejects.toThrow("runtime_unsupported");
  expect(h.toolsFailed).toHaveBeenCalledWith("cursor");
  const { conversationId } = await start(h, "cursor"); h.service.receive(conversationId, { type: "turn.done" }); h.exits[0]!();
  acpSession(h.profile, "cursor"); h.toolsFailed.mockClear();
  // A resume reads the same downgrade as session_unavailable; the facts are still what changed.
  mocks.run.mockResolvedValueOnce({ exitCode: 0, timedOut: false, stdout: "2026.10.21-0aa1111\n" });
  await expect(h.service.send(conversationId, "after an update", [])).rejects.toThrow("session_unavailable");
  expect(h.toolsFailed).toHaveBeenCalledWith("cursor"); h.toolsFailed.mockClear();
  (h.auth.runtime.acquire as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => { throw new Error("cli_missing"); });
  await expect(start(h, "cursor")).rejects.toThrow("cli_missing");
  expect(h.toolsFailed).toHaveBeenCalledWith("cursor"); h.toolsFailed.mockClear();
  (h.auth.runtime.acquire as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => { throw new Error("busy"); });
  await expect(start(h, "cursor")).rejects.toThrow("busy");
  h.auth.set({ connection: { ...h.auth.get().connection!, connectionId: "conn-2", account: { id: "other", workspace: null } }, generation: 2 });
  await expect(h.service.send(conversationId, "other account", [])).rejects.toThrow("session_unavailable");
  expect(h.toolsFailed).not.toHaveBeenCalled();
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

// Where each ACP server keeps a stored session (B3 live check 2026-10-28).
function acpSession(profile: string, provider: Provider) {
  const dir = { cursor: ".cursor/acp-sessions", copilot: ".copilot/session-state", antigravity: ".gemini/antigravity-acp/conversations" }[provider as "cursor"];
  mkdirSync(join(profile, dir, ACP_SESSION), { recursive: true });
}

it.each([
  ["cursor", ["acp"], "cursor_login"],
  ["copilot", ["--acp", "--stdio"], undefined],
  ["antigravity", [], "oauth-personal"],
] as [Provider, string[], string | undefined][])("starts a %s conversation on its ACP server with the bundled doan first on PATH", async (provider, args, authenticate) => {
  const h = harness(provider);
  const { conversationId } = await start(h, provider);
  const [input] = h.open.mock.calls[0]!;
  expect(input).toMatchObject({ runtime: provider, args, configDir: h.profile, command: `/bin/${provider}`, env: { PATH: "/Applications/doan.app/Contents/Resources/bin:/shell/bin", HOME: h.profile } });
  expect(input.authenticate).toBe(authenticate);
  expect(h.store.list()[0]).toMatchObject({ conversationId, owner: { kind: "doan", provider }, session: { runtime: provider, sessionId: ACP_SESSION, configDir: h.profile } });
  // The Antigravity server is the sha-pinned download; it has no version run.
  expect(mocks.run).toHaveBeenCalledTimes(provider === "antigravity" ? 0 : 1);
});

it("refuses a Cursor or Copilot build below the minimum and runs a newer one", async () => {
  for (const [provider, stdout] of [["cursor", "2026.10.21-0aa1111\n"], ["copilot", "GitHub Copilot CLI 1.0.104.\n"]] as const) {
    const h = harness(provider); mocks.run.mockResolvedValueOnce({ exitCode: 0, timedOut: false, stdout });
    await expect(start(h, provider)).rejects.toThrow("runtime_unsupported"); expect(h.auth.leases.open).toBe(0);
  }
  for (const [provider, stdout] of [["cursor", "2026.10.23-0aa1111\n"], ["copilot", "GitHub Copilot CLI 1.0.106.\n"]] as const) {
    const h = harness(provider); mocks.run.mockResolvedValueOnce({ exitCode: 0, timedOut: false, stdout });
    await start(h, provider); expect(h.open).toHaveBeenCalledOnce();
  }
});

it("resumes an ACP conversation only when its stored session is in the dedicated profile", async () => {
  const h = harness("cursor");
  const { conversationId } = await start(h, "cursor"); h.service.receive(conversationId, { type: "turn.done" }); h.exits[0]!();
  await expect(h.service.send(conversationId, "no stored session", [])).rejects.toThrow("session_unavailable");
  acpSession(h.profile, "cursor");
  await h.service.send(conversationId, "after restart", []);
  expect(h.open).toHaveBeenCalledTimes(2); expect(h.open.mock.calls[1]![0]).toMatchObject({ sessionId: ACP_SESSION, args: ["acp"], authenticate: "cursor_login" });
});

it("runs an unchecked Copilot connection without a status request and lets the run verify it", async () => {
  const h = harness("copilot"); h.auth.set({ verified: false });
  const { conversationId } = await start(h, "copilot");
  expect(h.auth.runtime.check).not.toHaveBeenCalled();
  const [input] = h.open.mock.calls[0]!;
  input.confirm?.();
  expect(h.auth.runtime.confirm).toHaveBeenCalledWith("copilot", "conn-1");
  h.service.receive(conversationId, { type: "turn.done" }); h.exits[0]!();
  // A resume after restart is unchecked as well; account, profile and session are still judged.
  acpSession(h.profile, "copilot");
  await h.service.send(conversationId, "after restart", []);
  expect(h.open.mock.calls[1]![0].sessionId).toBe(ACP_SESSION);
  h.service.receive(conversationId, { type: "turn.done" }); h.exits[1]!();
  h.auth.set({ connection: { ...h.auth.get().connection!, connectionId: "conn-2", account: { id: "other", workspace: null } }, generation: 2 });
  await expect(h.service.send(conversationId, "other account", [])).rejects.toThrow("session_unavailable");
  // A failed write-back or check on an unchecked Copilot connection is not run past.
  h.auth.set({ connection: { ...h.auth.get().connection!, connectionId: "conn-1", account: { id: "acct-1", workspace: null } }, error: { code: "storage_failed" } });
  await expect(h.service.send(conversationId, "after a failed write-back", [])).rejects.toThrow("not_logged_in");
});

it("stops only the provider's doan-account runs for a sign-out, as a user interruption that keeps the history", async () => {
  const h = harness("cursor");
  const { conversationId } = await start(h, "cursor");
  await h.service.stopRuns("claude");
  expect(h.runners[0]!.close).not.toHaveBeenCalled();
  await h.service.stopRuns("cursor");
  expect(h.runners[0]!.close).toHaveBeenCalledTimes(1);
  expect(h.service.read(conversationId).events.map(e => e.type)).toEqual(["user.message", "turn.started", "interrupted"]);
  expect(h.service.read(conversationId).events.at(-1)).toMatchObject({ reason: "user" });
  // A late event of the closed run is not appended; the lease goes only when the group is gone.
  h.service.receive(conversationId, { type: "turn.done" });
  expect(h.service.read(conversationId).events).toHaveLength(3);
  expect(h.auth.leases.open).toBe(1);
  h.exits[0]!(); await Promise.resolve();
  expect(h.auth.leases.open).toBe(0);
  expect(h.store.list().map(m => m.state)).toEqual(["current"]);
});

it("stops a run spawned after its provider's runs were stopped, so the sign-out's drain completes", async () => {
  // Before spawn the run has no runner or cleanup for stopRuns to close: once while preparing, once between prepare and spawn.
  for (const when of ["preparing", "opening"] as const) {
    const h = harness("claude");
    let spawn!: () => void; const spawning = new Promise<void>(resolve => { spawn = resolve; });
    let opened!: () => void; const opening = new Promise<void>(resolve => { opened = resolve; });
    const stop = vi.fn<() => Promise<void>>();
    h.open.mockImplementationOnce(async (_input, _emit, exited, registerStop) => {
      opened(); await spawning;
      let stopped = false;
      stop.mockImplementation(async () => { stopped = true; exited(); });
      registerStop(stop);
      if (stopped) throw new Error("process_exited");
      return { sessionId: CLAUDE_SESSION, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    });
    let stopping: Promise<void> | undefined;
    if (when === "preparing") h.auth.onAcquire.push(() => { stopping = h.service.stopRuns("claude"); });
    const run = start(h, "claude");
    await opening;
    if (when === "opening") stopping = h.service.stopRuns("claude");
    await stopping;
    spawn();
    await expect(run).rejects.toThrow("process_exited");
    expect(stop).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(h.auth.leases.open).toBe(0));
  }
});

it("closes an idle run that still holds its lease without adding events", async () => {
  const h = harness("codex");
  const { conversationId } = await start(h, "codex"); h.service.receive(conversationId, { type: "turn.done" });
  await h.service.stopRuns("codex");
  expect(h.runners[0]!.close).toHaveBeenCalledTimes(1);
  expect(h.service.read(conversationId).events.map(e => e.type)).toEqual(["user.message", "turn.started", "turn.done"]);
});

it("leaves a run on the external profile alone when the doan account of the same provider signs out", async () => {
  const h = harness("claude");
  const legacy = (await h.service.start({ root: h.root, mode: "resume", text: "continue", anchors: [] })).conversationId;
  const doan = (await start(h, "claude")).conversationId;
  expect(h.store.list().map(m => [m.conversationId, m.owner.kind])).toEqual([[legacy, "legacy-external"], [doan, "doan"]]);
  await h.service.stopRuns("claude");
  expect(h.runners[0]!.close).not.toHaveBeenCalled();
  expect(h.runners[1]!.close).toHaveBeenCalledTimes(1);
});

it("cancels a send waiting for the previous Claude process when its provider's runs are stopped", async () => {
  const h = harness("claude");
  const { conversationId } = await start(h, "claude"); h.service.receive(conversationId, { type: "turn.done" });
  const pending = h.service.send(conversationId, "after sign-out", []);
  await new Promise(resolve => setTimeout(resolve, 0));
  await h.service.stopRuns("claude");
  await expect(pending).rejects.toThrow("busy");
  h.exits[0]!(); await vi.waitFor(() => expect(h.auth.leases.open).toBe(0));
  expect(h.open).toHaveBeenCalledOnce();
});

it("checks the account again after waiting for the previous Claude process", async () => {
  const h = harness("claude"); claudeTranscript(h.profile);
  const { conversationId } = await start(h, "claude"); h.service.receive(conversationId, { type: "turn.done" });
  const pending = h.service.send(conversationId, "after an account change", []);
  await new Promise(resolve => setTimeout(resolve, 0));
  h.auth.set({ generation: 2, connection: { ...h.auth.get().connection!, connectionId: "conn-2", account: { id: "acct-2", workspace: null } } });
  h.exits[0]!();
  await expect(pending).rejects.toThrow("session_unavailable");
  expect(h.open).toHaveBeenCalledOnce();
});

it("hands each new run closures bound to the installed version it read, and none to Antigravity", async () => {
  for (const [provider, installed] of [["codex", "0.164.0"], ["cursor", "2026.10.22-27dcf5f"], ["copilot", "1.0.105"]] as const) {
    const versions = { versionRead: vi.fn(), incompatible: vi.fn(), compatible: vi.fn() };
    const h = harness(provider, "acct-1", versions); await start(h, provider);
    expect(versions.versionRead).toHaveBeenCalledWith(provider, installed);
    const [input] = h.open.mock.calls[0]!;
    input.incompatible!(); input.compatible!();
    expect(versions.incompatible).toHaveBeenCalledWith(provider, installed); expect(versions.compatible).toHaveBeenCalledWith(provider, installed);
  }
  const versions = { versionRead: vi.fn(), incompatible: vi.fn(), compatible: vi.fn() };
  const h = harness("antigravity", "acct-1", versions); await start(h, "antigravity");
  const [input] = h.open.mock.calls[0]!;
  expect(input.incompatible).toBeUndefined(); expect(input.compatible).toBeUndefined(); expect(versions.versionRead).not.toHaveBeenCalled();
});

it("shows a Cursor build a new session's handshake refused before the refusal returns, clears it on a passing run and on a self-update", async () => {
  // The probe keeps naming the refused build throughout, so only the record decides the cause.
  const facts: ToolFacts = { cli: "found", version: "supported", installed: "2026.10.22-27dcf5f", tools: "ready" };
  const publish = vi.fn<(snapshot: AuthSnapshot) => void>();
  let h!: ReturnType<typeof harness>;
  const ipc = new AuthIpc({ backend: { state: p => p === "cursor" ? h.auth.get() : initialAuthState(p, null), check: vi.fn(), signIn: vi.fn(), cancel: vi.fn(), submitCode: vi.fn(), signOut: vi.fn() },
    probe: async () => facts, openExternal: async () => {}, publish, prompt: () => {} });
  h = harness("cursor", "acct-1", ipc);
  await ipc.read(); publish.mockClear();
  const cursor = () => publish.mock.calls.at(-1)![0].providers.find(p => p.provider === "cursor")!.readiness;
  const refuse = () => h.open.mockImplementationOnce(async input => { input.incompatible?.(); throw new Error("runtime_unsupported"); });
  let publishedAtRefusal = 0;
  refuse();
  await expect(start(h, "cursor").catch((error: unknown) => { publishedAtRefusal = publish.mock.calls.length; throw error; })).rejects.toThrow("runtime_unsupported");
  expect(publishedAtRefusal).toBe(1); expect(cursor()).toMatchObject({ cause: "version_incompatible", action: "retry" });
  // The record does not block the next run on the same build; its passing handshake clears it.
  h.open.mockImplementationOnce(async (input, _emit, exited, registerStop) => {
    registerStop(async () => {}); h.exits.push(exited); input.compatible?.();
    return { sessionId: ACP_SESSION, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
  });
  const { conversationId } = await start(h, "cursor"); h.service.receive(conversationId, { type: "turn.done" }); h.exits[0]!();
  expect(cursor()).toEqual({ ready: true });
  refuse();
  await expect(start(h, "cursor")).rejects.toThrow("runtime_unsupported");
  expect(cursor()).toMatchObject({ cause: "version_incompatible" });
  // Cursor updated itself: the next run reads another build and the record goes.
  publish.mockClear(); mocks.run.mockResolvedValueOnce({ exitCode: 0, timedOut: false, stdout: "2026.10.23-0aa1111\n" });
  await start(h, "cursor");
  await vi.waitFor(() => expect(publish).toHaveBeenCalled());
  expect(cursor()).toEqual({ ready: true });
});

it.each(["claude", "codex", "cursor", "copilot", "antigravity"] as Provider[])("sends a new %s conversation the fixed preset guidance", async provider => {
  const h = harness(provider);
  await start(h, provider);
  expect(vi.mocked(h.runners[0]!.send).mock.calls[0]![0]).toContain(PRESET_GUIDANCE);
});
