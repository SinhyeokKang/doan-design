import { afterEach, expect, it, vi } from "vitest";
import { closeSync, mkdtempSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mocks = vi.hoisted(() => ({ probe: vi.fn(), run: vi.fn() }));
vi.mock("../onboarding/machine", () => ({ probeShell: mocks.probe, runProcess: mocks.run }));
import { BUNDLED_CLAUDE_SDK, createAccountPrepare, createPrepare, judgmentCode, routePrepare, type AccountRuntime } from "./prepare";
import { openFolderStore } from "../folderStore";
import { initialAuthState } from "../agentAuth/state";
import type { Lease } from "../agentAuth/manager";
import type { AccountConnection, AuthState, ConnectionJudgment, ConversationOwner } from "../agentAuth/types";
import { judgeConnection } from "../agentAuth/connection";
import { CLAUDE_REGISTRY_FLOOR, CODEX_ROLLOUT_FLOOR, MINIMUM_VERSIONS, storedVersionAtLeast } from "./sessions";
import { conversationHandler } from "./ipc";
import { processStart } from "./io";
import { ConversationService } from "./service";
import { ConversationStore } from "./store";
import { DOCK, TERMINAL } from "../launchEnv.fixture";
const paths: string[] = []; afterEach(() => { vi.clearAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
function temp() { const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-prepare-"))); paths.push(root); return root; }
it("fails closed with a missing installed CLI despite the SDK platform dependency", async () => {
  const root = temp(); mocks.probe.mockResolvedValue({ ok: true, path: root });
  const prepare = createPrepare(root, join(root, "runtime.json"), { HOME: root });
  await expect(prepare({ root, mode: "new", runtime: "claude", canvas: { path: ".doan/canvases/a.html" }, text: "hello", anchors: [] })).rejects.toThrow("cli_missing");
  expect(mocks.run).not.toHaveBeenCalled();
});
it("uses selected canonical profile and fails unknown versions before opening", async () => {
  const root = temp(); const config = join(root, "profile"); mkdirSync(config); writeFileSync(join(root, "codex"), "fake", { mode: 0o700 });
  mocks.probe.mockResolvedValue({ ok: true, path: root, codexHome: config }); mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli 0.164.0" });
  const prepare = createPrepare(root, join(root, "runtime.json"), { HOME: root, CLAUDE_CODE_SESSION_ID: "stale", CODEX_THREAD_ID: "stale", CODEX_SESSION_ID: "stale" });
  const request = { root, mode: "new" as const, runtime: "codex" as const, text: "hello", anchors: [] };
  const ready = await prepare(request); expect(ready.command).toBe(join(root, "codex")); expect(ready.env.CODEX_HOME).toBe(config); expect(ready.env.CLAUDE_CODE_SESSION_ID).toBeUndefined();
  mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli 0.165.0" }); expect((await prepare(request)).command).toBe(join(root, "codex"));
  mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli 0.157.0" }); await expect(prepare(request)).rejects.toThrow("runtime_unsupported");
  mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli" }); await expect(prepare(request)).rejects.toThrow("runtime_unsupported");
  mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli 0.157.0" });
  await expect(prepare({ ...request, mode: "resume" }, { runtime: "codex", origin: "new", sessionId: "01a178ba-f9dc-7161-9544-f20f656064a1", configDir: config, cwd: root })).rejects.toThrow("session_unavailable");
  mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli" });
  await expect(prepare({ ...request, mode: "resume" }, { runtime: "codex", origin: "new", sessionId: "01a178ba-f9dc-7161-9544-f20f656064a1", configDir: config, cwd: root })).rejects.toThrow("session_unavailable");
});
it("checks the external CLI's version with the launch environment and the login shell's PATH", async () => {
  const root = temp(); const config = join(root, "profile"); mkdirSync(config); writeFileSync(join(root, "codex"), "fake", { mode: 0o700 });
  mocks.probe.mockResolvedValue({ ok: true, path: root, codexHome: config }); mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli 0.164.0" });
  await createPrepare(root, join(root, "runtime.json"), { ...TERMINAL, HOME: root })({ root, mode: "new", runtime: "codex", text: "hello", anchors: [] });
  expect(mocks.run.mock.calls[0]?.[2]).toEqual({ ...DOCK, HOME: root, PATH: root });
});
// A legacy external run has no readiness wiring: nothing it sees is recorded.
it.each([
  ["claude", "2.1.312 (Claude Code)"],
  ["codex", "codex-cli 0.164.0"],
] as const)("hands a legacy %s run no recording closures", async (runtime, stdout) => {
  const root = temp(); const config = join(root, "profile"); mkdirSync(config); writeFileSync(join(root, runtime), "fake", { mode: 0o700 });
  mocks.probe.mockResolvedValue({ ok: true, path: root, claudeConfigDir: config, codexHome: config }); mocks.run.mockResolvedValue({ exitCode: 0, stdout });
  const ready = await createPrepare(root, join(root, "runtime.json"), { HOME: root })({ root, mode: "new", runtime, text: "hello", anchors: [] });
  expect(ready.runtime).toBe(runtime); expect(ready).not.toHaveProperty("incompatible"); expect(ready).not.toHaveProperty("compatible");
});
it("refuses a Codex resume preview with a record but no verifiable stored session", async () => {
  const root = temp(); writeFileSync(join(root, "codex"), "fake", { mode: 0o700 });
  mocks.probe.mockResolvedValue({ ok: true, path: root, codexHome: root }); mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli 0.164.0" });
  const canvas = { id: "a", path: ".doan/canvases/a.html" };
  writeFileSync(join(root, "sessions.jsonl"), JSON.stringify({ v: 1, at: "2026-10-27T00:00:00.000Z", root, canvas, hash: "sha256:" + "a".repeat(64), runtime: "codex", sessionId: "01a178ba-f9dc-7161-9544-f20f656064a1", configDir: root, cwd: root }) + "\n");
  const prepare = createPrepare(root, join(root, "runtime.json"), { HOME: root });
  await expect(prepare({ root, mode: "resume", canvas, text: "", anchors: [] })).rejects.toThrow("session_unavailable");
  const routed = routePrepare(prepare, () => Promise.reject(new Error("not_logged_in")));
  const service = new ConversationService(new ConversationStore(root), routed, vi.fn(), () => {});
  const handler = conversationHandler(service, routed, () => [{ path: root, kind: "list", canvases: [canvas] }]);
  expect(await handler(true, "resumeTarget", { root, canvas })).toEqual({ available: false, reason: "session_unavailable" });
});

// A live Claude process on the linked session refuses the run, but the resume target
// still names the session, so the panel can show its choice as waiting. Start keeps the bare refusal.
it("names a linked Claude session that a live terminal process holds, and still refuses to run it", async () => {
  const root = temp(); const config = join(root, "profile"); mkdirSync(join(config, "sessions"), { recursive: true }); writeFileSync(join(root, "claude"), "fake", { mode: 0o700 });
  mocks.probe.mockResolvedValue({ ok: true, path: root, claudeConfigDir: config }); mocks.run.mockResolvedValue({ exitCode: 0, stdout: "2.1.312 (Claude Code)" });
  const canvas = { id: "a", path: ".doan/canvases/a.html" }, sessionId = "5f0c2a9e-claude-session";
  writeFileSync(join(root, "sessions.jsonl"), JSON.stringify({ v: 1, at: "2026-11-01T00:00:00.000Z", root, canvas, hash: "sha256:" + "a".repeat(64), runtime: "claude", sessionId, configDir: config, cwd: root }) + "\n");
  // This test process stands for the terminal's claude: its registry record names the session and its real start time.
  writeFileSync(join(config, "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId, procStart: await processStart(process.pid), cwd: root, version: "2.1.312", kind: "interactive" }));
  const prepare = createPrepare(root, join(root, "runtime.json"), { HOME: root });
  const refused = await prepare({ root, mode: "resume", canvas, text: "", anchors: [] }).then(() => null, (error: unknown) => error);
  expect(refused).toBeInstanceOf(Error); expect(refused).toMatchObject({ message: "session_in_use", runtime: "claude", sessionId });
  const routed = routePrepare(prepare, () => Promise.reject(new Error("not_logged_in")));
  const service = new ConversationService(new ConversationStore(root), routed, vi.fn(), () => {});
  const handler = conversationHandler(service, routed, () => [{ path: root, kind: "list", canvases: [canvas] }]);
  expect(await handler(true, "resumeTarget", { root, canvas })).toEqual({ available: false, reason: "session_in_use", runtime: "claude", session: sessionId });
  expect(await handler(true, "start", { root, canvas, mode: "resume", text: "hello" })).toEqual({ error: "session_in_use" });
});

// A Codex session still open in a terminal is refused up front, like Claude, instead of failing at thread/resume.
it("names a linked Codex session whose writer lock a live process holds, and refuses an unreadable lock directory", async () => {
  const root = temp(); writeFileSync(join(root, "codex"), "fake", { mode: 0o700 });
  mocks.probe.mockResolvedValue({ ok: true, path: root, codexHome: root }); mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli 0.166.0" });
  const canvas = { id: "a", path: ".doan/canvases/a.html" }, sessionId = "01a1a1f0-3466-7691-96f0-37f5415d3cb9";
  const directory = join(root, "sessions", "2026", "11", "04"); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `rollout-2026-11-04T00-03-56-${sessionId}.jsonl`), JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: root, cli_version: "0.166.0" } }) + "\n");
  writeFileSync(join(root, "sessions.jsonl"), JSON.stringify({ v: 1, at: "2026-11-04T00:00:00.000Z", root, canvas, hash: "sha256:" + "a".repeat(64), runtime: "codex", sessionId, configDir: root, cwd: root }) + "\n");
  const prepare = createPrepare(root, join(root, "runtime.json"), { HOME: root });
  const routed = routePrepare(prepare, () => Promise.reject(new Error("not_logged_in")));
  const service = new ConversationService(new ConversationStore(root), routed, vi.fn(), () => {});
  const handler = conversationHandler(service, routed, () => [{ path: root, kind: "list", canvases: [canvas] }]);
  expect((await prepare({ root, mode: "resume", canvas, text: "", anchors: [] })).sessionId).toBe(sessionId);
  // This test process stands for the terminal's Codex writer holding the thread's lock file open.
  const locks = join(root, "thread-writer-locks"); mkdirSync(locks); writeFileSync(join(locks, `${sessionId}.lock`), "");
  const fd = openSync(join(locks, `${sessionId}.lock`), "r");
  try {
    const refused = await prepare({ root, mode: "resume", canvas, text: "", anchors: [] }).then(() => null, (error: unknown) => error);
    expect(refused).toBeInstanceOf(Error); expect(refused).toMatchObject({ message: "session_in_use", runtime: "codex", sessionId });
    expect(await handler(true, "resumeTarget", { root, canvas })).toEqual({ available: false, reason: "session_in_use", runtime: "codex", session: sessionId });
  } finally { closeSync(fd); }
  // A lock file nobody holds is what a killed writer leaves behind.
  expect((await prepare({ root, mode: "resume", canvas, text: "", anchors: [] })).sessionId).toBe(sessionId);
  rmSync(locks, { recursive: true }); symlinkSync(temp(), locks);
  await expect(prepare({ root, mode: "resume", canvas, text: "", anchors: [] })).rejects.toThrow("session_unavailable");
  expect(await handler(true, "resumeTarget", { root, canvas })).toEqual({ available: false, reason: "session_unavailable" });
});

// The reused Codex server Doan opened holds the thread's lock, and the next send must not read it as a
// terminal. This test process holds the lock open, so only skipping the check for a reused server lets the send through.
it("sends again on the Codex server Doan reused although the thread's lock is held", async () => {
  const root = temp(); writeFileSync(join(root, "codex"), "fake", { mode: 0o700 });
  mocks.probe.mockResolvedValue({ ok: true, path: root, codexHome: root }); mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli 0.166.0" });
  const canvas = { id: "a", path: ".doan/canvases/a.html" }, sessionId = "01a1a1f0-3466-7691-96f0-37f5415d3cb9";
  const directory = join(root, "sessions", "2026", "11", "04"); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `rollout-2026-11-04T00-03-56-${sessionId}.jsonl`), JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: root, cli_version: "0.166.0" } }) + "\n");
  writeFileSync(join(root, "sessions.jsonl"), JSON.stringify({ v: 1, at: "2026-11-04T00:00:00.000Z", root, canvas, hash: "sha256:" + "a".repeat(64), runtime: "codex", sessionId, configDir: root, cwd: root }) + "\n");
  const routed = routePrepare(createPrepare(root, join(root, "runtime.json"), { HOME: root }), () => Promise.reject(new Error("not_logged_in")));
  const send = vi.fn(async () => {});
  const open = vi.fn(async () => ({ sessionId, send, answer: () => false, stop: async () => {}, close: async () => {} }));
  const service = new ConversationService(new ConversationStore(root), routed, open, () => {}, () => canvas);
  const { conversationId } = await service.start({ root, mode: "resume", canvas, text: "first", anchors: [] });
  const locks = join(root, "thread-writer-locks"); mkdirSync(locks); writeFileSync(join(locks, `${sessionId}.lock`), "");
  const fd = openSync(join(locks, `${sessionId}.lock`), "r");
  try {
    service.receive(conversationId, { type: "turn.done" });
    await service.send(conversationId, "second", []);
    expect(open).toHaveBeenCalledOnce(); expect(send).toHaveBeenCalledTimes(2);
  } finally { closeSync(fd); }
});

it.each(["valid", "valid-0.158.0", "valid-0.170.0", "wrong-id", "wrong-cwd", "wrong-version", "version-prefixed", "version-trailing", "version-number", "version-null", "version-missing", "malformed", "linked", "linked-directory", "oversized-header", "duplicate"])("checks Codex stored session evidence: %s", async kind => {
  const root = temp(); writeFileSync(join(root, "codex"), "fake", { mode: 0o700 });
  mocks.probe.mockResolvedValue({ ok: true, path: root, codexHome: root }); mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli 0.164.0" });
  const sessionId = "01a178ba-f9dc-7161-9544-f20f656064a1";
  const directory = join(root, "sessions", "2026", "10", "27"); mkdirSync(directory, { recursive: true });
  const path = join(directory, `rollout-2026-10-27T00-01-23-${sessionId}.jsonl`);
  const versions: Record<string, unknown> = { "wrong-version": "0.157.0", "valid-0.158.0": "0.158.0", "valid-0.170.0": "0.170.0", "version-prefixed": "v0.164.0", "version-trailing": "0.164.0 x", "version-number": 164, "version-null": null };
  const cliVersion = kind in versions ? versions[kind] : "0.164.0";
  const payload: Record<string, unknown> = { id: kind === "wrong-id" ? "other" : sessionId, cwd: kind === "wrong-cwd" ? temp() : root, cli_version: cliVersion };
  if (kind === "version-missing") delete payload.cli_version;
  const header = JSON.stringify({ type: "session_meta", payload }) + "\n";
  writeFileSync(path, kind === "malformed" ? "broken\n" : kind === "oversized-header" ? " ".repeat(65536) + header : header);
  if (kind === "linked-directory") { const target = temp(); writeFileSync(join(target, path.split("/").at(-1)!), header); rmSync(directory, { recursive: true }); symlinkSync(target, directory); }
  if (kind === "linked") { rmSync(path); const target = join(temp(), "header"); writeFileSync(target, header); symlinkSync(target, path); }
  if (kind === "duplicate") writeFileSync(join(directory, `rollout-duplicate-${sessionId}.jsonl`), header);
  const prepare = createPrepare(root, join(root, "runtime.json"), { HOME: root });
  const ready = prepare({ root, mode: "resume", text: "", anchors: [] }, { runtime: "codex", origin: "new", sessionId, configDir: root, cwd: root });
  if (kind.startsWith("valid")) expect((await ready).sessionId).toBe(sessionId); else await expect(ready).rejects.toThrow("session_unavailable");
  expect(mocks.run).toHaveBeenCalledTimes(1); expect(mocks.run.mock.calls[0]?.[1]).toEqual(["--version"]);
});

it("keeps each stored-session floor at or below its runtime's minimum", () => {
  expect(storedVersionAtLeast(MINIMUM_VERSIONS.codex, CODEX_ROLLOUT_FLOOR)).toBe(true);
  expect(storedVersionAtLeast(MINIMUM_VERSIONS.claude, CLAUDE_REGISTRY_FLOOR)).toBe(true);
});

it("pins the manifest and installed Claude Agent SDK to the bundled version", () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, "../../../package.json"), "utf8"));
  expect(manifest.dependencies["@anthropic-ai/claude-agent-sdk"]).toBe(BUNDLED_CLAUDE_SDK);
  const installed = JSON.parse(readFileSync(join(__dirname, "../../../node_modules/@anthropic-ai/claude-agent-sdk/package.json"), "utf8"));
  expect(installed.version).toBe(BUNDLED_CLAUDE_SDK);
});

// BACKLOG 'A project registered through a symlinked path': prepare compares the canonical root with the request's
// string and fails closed (ARCHITECTURE §7 'Identity and admission'), so the folder store hands out the real path for a
// root saved through a symlink. These start from the root the store lists, as a Home start does.
async function storedRoot(): Promise<{ real: string; root: string }> {
  const real = temp(), links = temp(), data = temp();
  const linked = join(links, "repo"); symlinkSync(real, linked);
  writeFileSync(join(data, "folders.json"), JSON.stringify([linked]));
  const root = (await openFolderStore(join(data, "folders.json"))).list()[0]!;
  return { real, root };
}
it.each([
  ["claude", "2.1.312 (Claude Code)"],
  ["codex", "codex-cli 0.164.0"],
] as const)("starts a %s run on the doan account for a project saved through a symlinked path", async (provider, stdout) => {
  const { real, root } = await storedRoot();
  const profile = temp();
  const connection: AccountConnection = { provider, connectionId: "conn-1", profile: provider, account: { id: "acct-1", workspace: null, email: "ada@example.com" } };
  const state: AuthState = { ...initialAuthState(provider, connection), verified: true, generation: 1 };
  mocks.run.mockResolvedValue({ exitCode: 0, timedOut: false, stdout });
  const runtime: AccountRuntime = {
    state: () => state, check: vi.fn(), checked: vi.fn(async () => {}), confirm: vi.fn(),
    acquire: vi.fn(async (): Promise<Lease> => ({ command: `/bin/${provider}`, env: { PATH: "/shell/bin" }, profileDir: profile, release: async () => {} })),
  };
  const ready = await createAccountPrepare(runtime, "/Applications/doan.app/Contents/Resources/bin/doan")({ root, mode: "new", runtime: provider, text: "hello", anchors: [] });
  expect(ready.cwd).toBe(real);
});
// The terminal-profile path also canonicalizes the selected configuration directory, so a linked CLAUDE_CONFIG_DIR or
// CODEX_HOME starts on its real directory.
it.each([
  ["claude", "2.1.312 (Claude Code)", "claudeConfigDir", "CLAUDE_CONFIG_DIR"],
  ["codex", "codex-cli 0.164.0", "codexHome", "CODEX_HOME"],
] as const)("starts a %s run on the terminal profile for a symlinked root and a symlinked configuration directory", async (runtime, stdout, probeKey, envKey) => {
  const { real, root } = await storedRoot();
  const bin = temp(), config = temp(), linkedConfig = join(temp(), "profile"); symlinkSync(config, linkedConfig);
  writeFileSync(join(bin, runtime), "fake", { mode: 0o700 });
  mocks.probe.mockResolvedValue({ ok: true, path: bin, [probeKey]: linkedConfig }); mocks.run.mockResolvedValue({ exitCode: 0, stdout });
  const ready = await createPrepare(bin, join(bin, "runtime.json"), { HOME: bin })({ root, mode: "new", runtime, text: "hello", anchors: [] });
  expect(ready.cwd).toBe(real); expect(ready.configDir).toBe(config); expect(ready.env[envKey]).toBe(config);
});

// Another account's conversation (account_changed) can continue after signing in to that account again; an earlier
// sign-in's (sign_in_changed) never can. A retry or another agent brings back neither.
it("reads another account as account_changed, an unprovable or replaced sign-in as sign_in_changed, and keeps the other refusals", () => {
  expect(judgmentCode({ decision: "reject", cause: "account_mismatch" }, "claude")).toBe("account_changed");
  expect(judgmentCode({ decision: "reject", cause: "account_mismatch" }, "copilot")).toBe("account_changed");
  expect(judgmentCode({ decision: "reject", cause: "workspace_mismatch" }, "claude")).toBe("account_changed");
  for (const cause of ["account_unverifiable", "profile_mismatch"] as const) expect(judgmentCode({ decision: "reject", cause }, "claude"), cause).toBe("sign_in_changed");
  expect(judgmentCode({ decision: "reject", cause: "session_unavailable" }, "claude")).toBe("session_unavailable");
  expect(judgmentCode({ decision: "reject", cause: "provider_mismatch" }, "claude")).toBe("session_unavailable");
  expect(judgmentCode({ decision: "reject", cause: "busy" }, "claude")).toBe("busy");
  expect(judgmentCode({ decision: "reject", cause: "session_in_use" }, "claude")).toBe("session_in_use");
  expect(judgmentCode({ decision: "reject", cause: "sign_out_failed" }, "claude")).toBe("not_logged_in");
  expect(judgmentCode({ decision: "reject", cause: "unverified" }, "claude")).toBe("not_logged_in");
  expect(judgmentCode({ decision: "reauth", cause: "not_connected" }, "claude")).toBe("not_logged_in");
  expect(judgmentCode({ decision: "legacy" }, "claude")).toBe("session_unavailable");
});
// Only a Claude Code conversation whose two organization values are both known says "another organization"; a missing
// value or Copilot's host keeps the account wording, which is the safe reading.
it("reads another organization of a Claude Code account as workspace_changed and every other workspace_mismatch as account_changed", () => {
  const owner: ConversationOwner = { kind: "doan", provider: "claude", connectionId: "conn-1", accountId: "acct-1", workspaceId: "org-1", profile: "claude" };
  const connection = (over: Partial<AccountConnection["account"]> & { connectionId?: string } = {}): AccountConnection => {
    const { connectionId = "conn-1", ...account } = over;
    return { provider: "claude", connectionId, profile: "claude", account: { id: "acct-1", workspace: "org-2", ...account } };
  };
  const judged = (who: ConversationOwner, current: AccountConnection) => judgeConnection(who, { ...initialAuthState(current.provider, current), verified: true, generation: 1 }, { exists: true, occupancy: "free" });
  const code = (who: ConversationOwner, current: AccountConnection, provider: "claude" | "copilot" = "claude") => judgmentCode(judged(who, current) as Exclude<ConnectionJudgment, { decision: "resume" }>, provider);
  expect(code(owner, connection())).toBe("workspace_changed");
  // No stable account ID: the same connection's organization still compares.
  expect(code({ ...owner, accountId: null }, connection({ id: null }))).toBe("workspace_changed");
  expect(code({ ...owner, workspaceId: null }, connection())).toBe("account_changed");
  expect(code(owner, connection({ workspace: null }))).toBe("account_changed");
  expect(code({ ...owner, provider: "copilot" }, { ...connection(), provider: "copilot" }, "copilot")).toBe("account_changed");
  expect(code(owner, connection({ id: "acct-2" }))).toBe("account_changed");
  // Another account that also differs in organization is still another account.
  expect(code(owner, connection({ id: "acct-2", workspace: "org-3" }))).toBe("account_changed");
});
// A sign-in whose check found another account or organization carries account_mismatch; both the lease and the recheck
// read it as not_logged_in before the conversation is judged, so it never reaches workspace_changed.
it("keeps a send on a login state with an account_mismatch error as not_logged_in", async () => {
  const profile = temp(), root = temp();
  mkdirSync(join(profile, "projects", "repo"), { recursive: true }); mkdirSync(join(profile, "sessions"), { recursive: true });
  const sessionId = "4f0c8c1e-6a43-4c8e-9a39-6c1f5b7a2d10";
  writeFileSync(join(profile, "projects", "repo", `${sessionId}.jsonl`), "{}\n");
  const connection: AccountConnection = { provider: "claude", connectionId: "conn-1", profile: "claude", account: { id: "acct-1", workspace: "org-2" } };
  const state: AuthState = { ...initialAuthState("claude", connection), verified: true, generation: 1, error: { code: "account_mismatch" } };
  mocks.run.mockResolvedValue({ exitCode: 0, timedOut: false, stdout: "2.1.312 (Claude Code)" });
  const stored = {
    conversationId: "c1", root, canvas: { path: ".doan/canvases/a.html" }, title: "t", state: "current" as const,
    owner: { kind: "doan" as const, provider: "claude" as const, connectionId: "conn-1", accountId: "acct-1", workspaceId: "org-1", profile: "claude" },
    session: { runtime: "claude" as const, origin: "new" as const, sessionId, configDir: profile, cwd: root },
  };
  const lease = async (): Promise<Lease> => ({ command: "/bin/claude", env: { PATH: "/shell/bin" }, profileDir: profile, release: async () => {} });
  const prepare = (acquire: AccountRuntime["acquire"]) => createAccountPrepare({ state: () => state, check: vi.fn(), checked: vi.fn(async () => {}), confirm: vi.fn(), acquire }, "/Applications/doan.app/Contents/Resources/bin/doan");
  // The manager's own lease refuses first, with the cause its readiness reports.
  await expect(prepare(vi.fn(async () => { throw new Error("account_mismatch"); }))({ root, mode: "resume", text: "x", anchors: [] }, stored)).rejects.toThrow("not_logged_in");
  // A lease that was already held still fails the recheck.
  await expect(prepare(vi.fn(lease))({ root, mode: "resume", text: "x", anchors: [] }, stored)).rejects.toThrow("not_logged_in");
});
