import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthManager, spawnAuthProcess, type AuthProcess, type Spawn } from "./manager";
import type { ProviderAuth } from "./providers";
import { AuthStorage, type Cipher } from "./storage";
import { fakeCipher } from "./fixtures/cipher";
import type { CheckResult, Provider } from "./types";

type Step = "login" | "status" | "logout";
class FakeProcess implements AuthProcess {
  listeners: ((text: string) => void)[] = [];
  stopped = false;
  private exitWith!: (code: number | null) => void;
  private goneWith!: () => void;
  readonly exit = new Promise<number | null>(resolve => { this.exitWith = resolve; });
  readonly gone = new Promise<void>(resolve => { this.goneWith = resolve; });
  constructor(readonly step: Step, readonly args: string[], readonly env: Record<string, string>, readonly cwd: string) {}
  onOutput(listener: (text: string) => void): void { this.listeners.push(listener); }
  print(text: string): void { for (const listener of this.listeners) listener(text); }
  // A finished leader is not a finished group; tests release the group separately when they need to.
  finish(code: number | null, groupGone = true): void { this.exitWith(code); if (groupGone) this.goneWith(); }
  release(): void { this.goneWith(); }
  stop(): void { this.stopped = true; this.finish(null, stopReleases); }
}
let stopReleases = true;
const fileProvider = (status: (dir: string) => CheckResult): ProviderAuth => ({
  command: "fake-cli", args: [], env: { FAKE_STORE: "file" }, login: ["login"], status: ["status"], logout: null,
  vault: ["creds/token.json"], plaintext: [], loginTerminal: false, settings: { "conf/settings.json": '{"storeTokenPlaintext":true}' },
  parseStatus: run => run.code === 0 ? status(run.profileDir) : { status: "failed", code: "check_failed" },
});
const keychainProvider = (status: () => CheckResult): ProviderAuth => ({
  command: "fake-cli", args: ["-c", "store=keyring"], env: {}, login: ["login"], status: ["status"], logout: ["logout"],
  vault: null, plaintext: ["auth.json"], settings: {}, loginTerminal: false, parseStatus: run => run.code === 0 ? status() : { status: "failed", code: "check_failed" },
});
const tokenAccount = (dir: string): CheckResult => {
  const path = join(dir, "creds/token.json");
  if (!existsSync(path)) return { status: "disconnected" };
  const token = JSON.parse(readFileSync(path, "utf8"));
  return token.expired ? { status: "expired" } : { status: "connected", account: { id: token.id, workspace: null, email: `${token.id}@example.com` } };
};

let root: string, storage: AuthStorage, processes: FakeProcess[], spawn: ReturnType<typeof vi.fn<Spawn>>, keychain: CheckResult, ids: number;
let cipher: Cipher;
function manager(over: Partial<ConstructorParameters<typeof AuthManager>[0]> = {}) {
  const adapters = { claude: keychainProvider(() => keychain), codex: keychainProvider(() => keychain), cursor: fileProvider(tokenAccount), antigravity: fileProvider(tokenAccount), copilot: fileProvider(tokenAccount) };
  return new AuthManager({
    storage, spawn, adapters, appRuntime: "/data/runtime.json", statusTimeoutMs: 1000,
    inherited: { HOME: "/Users/ada", PATH: "/inherited", GH_TOKEN: "gho-external", ANTHROPIC_API_KEY: "sk-external", CODEX_HOME: "/Users/ada/.codex" },
    locate: async () => ({ command: "/bin/fake-cli", path: "/verified/bin" }), newId: () => `id-${++ids}`, ...over,
  });
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
async function next(step: Step): Promise<FakeProcess> {
  for (let i = 0; i < 50; i++) { const found = processes.find(p => p.step === step && !p.stopped && !settledSet.has(p)); if (found) return found; await flush(); }
  throw new Error(`no ${step} process`);
}
const settledSet = new Set<FakeProcess>();
async function finish(step: Step, code: number | null, before?: (p: FakeProcess) => void): Promise<FakeProcess> {
  const p = await next(step); before?.(p); settledSet.add(p); p.finish(code); return p;
}
function writeToken(p: FakeProcess, token: object): void {
  const path = join(p.cwd, "creds/token.json"); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(token));
}
function started<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> { if (!result.ok) throw new Error(JSON.stringify(result)); return result as Extract<T, { ok: true }>; }
async function signedInCursor(m: AuthManager, id = "u1") {
  const run = started(await m.signIn("cursor", 7));
  await finish("login", 0, p => writeToken(p, { id }));
  await finish("status", 0);
  return run.done;
}
const tokenFile = (provider: Provider) => join(storage.profileDir(provider), "creds/token.json");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "doan-auth-manager-")); cipher = fakeCipher(); storage = new AuthStorage(root, cipher);
  processes = []; settledSet.clear(); keychain = { status: "disconnected" }; ids = 0; stopReleases = true;
  spawn = vi.fn<Spawn>((_command, args, options) => {
    const step: Step = args.includes("login") ? "login" : args.includes("logout") ? "logout" : "status";
    const p = new FakeProcess(step, args, options.env, options.cwd); processes.push(p); return p;
  });
});
afterEach(() => { try { chmodSync(join(root, "vault"), 0o700); } catch { /* absent */ } rmSync(root, { recursive: true, force: true }); });

describe("sign-in", () => {
  it("stores an encrypted connection, writes metadata and leaves no plaintext working file", async () => {
    const m = manager(); await m.load();
    const state = await signedInCursor(m);
    expect(state).toMatchObject({ phase: "connected", verified: true, connection: { provider: "cursor", profile: "cursor", account: { id: "u1" } } });
    expect(existsSync(tokenFile("cursor"))).toBe(false);
    expect(await storage.loadVault("cursor")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify({ id: "u1" })) });
    expect(storage.readMetadata().accounts).toEqual([state.connection]);
    const login = processes[0]!;
    expect(login.cwd).toBe(storage.profileDir("cursor"));
    expect(login.env).toMatchObject({ HOME: storage.profileDir("cursor"), PATH: "/verified/bin", DOAN_RUNTIME: "/data/runtime.json", FAKE_STORE: "file" });
    for (const name of ["GH_TOKEN", "ANTHROPIC_API_KEY", "CODEX_HOME"]) expect(login.env).not.toHaveProperty(name);
    expect(readFileSync(join(login.cwd, "conf/settings.json"), "utf8")).toBe('{"storeTokenPlaintext":true}');
  });
  it("mints a fresh attempt ID for every attempt and connection", async () => {
    const m = manager(); await m.load();
    const first = await signedInCursor(m);
    const second = started(await m.signIn("cursor", 7));
    expect(second.attemptId).not.toBe("id-1");
    expect(await m.cancel("cursor", "id-1", 7)).toEqual(expect.objectContaining({ ok: false, reason: "stale" }));
    await finish("login", 0, p => writeToken(p, { id: "u1" })); await finish("status", 0);
    const replaced = await second.done;
    expect(replaced.connection?.connectionId).not.toBe(first.connection?.connectionId);
  });
  it("gives a terminal-bound login a terminal and runs status without one", async () => {
    const terminal = { ...fileProvider(tokenAccount), loginTerminal: true };
    const m = manager({ adapters: { claude: keychainProvider(() => keychain), codex: keychainProvider(() => keychain), cursor: fileProvider(tokenAccount), antigravity: terminal, copilot: fileProvider(tokenAccount) } });
    await m.load();
    started(await m.signIn("antigravity", 7));
    await finish("login", 0, p => writeToken(p, { id: "g1" }));
    await finish("status", 0);
    expect(spawn.mock.calls.map(([command, args]) => [command, args])).toEqual([
      ["/usr/bin/script", ["-q", "/dev/null", "/bin/fake-cli", "login"]], ["/bin/fake-cli", ["status"]]]);
  });
  it("routes the login URL and device code only through the attempt's prompt", async () => {
    const prompts: unknown[] = [];
    const m = manager({ onPrompt: prompt => prompts.push(prompt) }); await m.load();
    const run = started(await m.signIn("cursor", 7));
    (await next("login")).print("Open https://example.com/device?x=1 and enter ABCD-1234\nListening on http://localhost:1455.\n");
    expect(prompts).toEqual([{ provider: "cursor", attemptId: run.attemptId, owner: 7, url: "https://example.com/device?x=1" },
      { provider: "cursor", attemptId: run.attemptId, owner: 7, url: "http://localhost:1455" }]);
  });
  it("allows one sign-in or sign-out write across all providers but still allows checks", async () => {
    const m = manager(); await m.load();
    started(await m.signIn("cursor", 7));
    expect(await m.signIn("claude", 8)).toEqual(expect.objectContaining({ ok: false, reason: "busy" }));
    expect(await m.signIn("cursor", 8)).toEqual(expect.objectContaining({ ok: false, reason: "busy" }));
    expect((await m.check("claude")).ok).toBe(true);
  });
  it("reports a spawn failure or missing CLI as a failed sign-in and releases the write lock", async () => {
    const m = manager({ locate: async () => null }); await m.load();
    const run = started(await m.signIn("cursor", 7));
    expect(await run.done).toMatchObject({ phase: "error", error: { code: "sign_in_failed" } });
    spawn.mockImplementationOnce(() => { throw new Error("EACCES"); });
    const m2 = manager(); await m2.load();
    expect(await started(await m2.signIn("claude", 7)).done).toMatchObject({ phase: "error", error: { code: "sign_in_failed" } });
    expect((await m2.signIn("claude", 7)).ok).toBe(true);
  });
  it("fails without plaintext persistence when the OS key is unavailable", async () => {
    storage = new AuthStorage(root, fakeCipher({ available: async () => false }));
    const m = manager(); await m.load();
    const state = await signedInCursor(m);
    expect(state).toMatchObject({ connection: null, error: { code: "storage_failed" } });
    expect(existsSync(tokenFile("cursor"))).toBe(false);
    expect(storage.readMetadata().accounts).toEqual([]);
  });
  it("removes the orphaned vault when the metadata write fails for a first connection", async () => {
    const m = manager(); await m.load();
    const write = vi.spyOn(storage, "writeMetadata").mockImplementation(() => { throw new Error("disk full"); });
    const state = await signedInCursor(m);
    write.mockRestore();
    expect(state).toMatchObject({ connection: null, error: { code: "storage_failed" } });
    expect(await storage.loadVault("cursor")).toBeNull();
    expect(existsSync(tokenFile("cursor"))).toBe(false);
  });
  it("cleans a keychain orphan with the official logout when a first sign-in fails", async () => {
    const m = manager(); await m.load();
    const run = started(await m.signIn("claude", 7));
    await finish("login", 1);
    await finish("logout", 0);
    expect(await run.done).toMatchObject({ connection: null, error: { code: "sign_in_failed" } });
  });
  it("refuses a keychain login that fell back to a plaintext credential file", async () => {
    const m = manager(); await m.load();
    const run = started(await m.signIn("codex", 7));
    keychain = { status: "connected", account: { id: "acct", workspace: null } };
    await finish("login", 0, p => writeFileSync(join(p.cwd, "auth.json"), "{\"token\":\"plain\"}"));
    await finish("status", 0);
    await finish("logout", 0);
    expect(await run.done).toMatchObject({ connection: null, error: { code: "storage_failed" } });
    expect(existsSync(join(storage.profileDir("codex"), "auth.json"))).toBe(false);
  });
  it("keeps the previous vault as the live profile when a replacement fails, and unverifies it", async () => {
    const m = manager(); await m.load();
    const first = await signedInCursor(m, "u1");
    const run = started(await m.signIn("cursor", 7));
    await finish("login", 1, p => writeToken(p, { id: "u2" }));
    const state = await run.done;
    expect(state).toMatchObject({ connection: first.connection, verified: false, error: { code: "sign_in_failed" } });
    expect(await storage.loadVault("cursor")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify({ id: "u1" })) });
    expect(existsSync(tokenFile("cursor"))).toBe(false);
  });
});

describe("attempt lifetime", () => {
  it("lets only the owner cancel, and blocks a late success after cancellation", async () => {
    const m = manager(); await m.load();
    const run = started(await m.signIn("cursor", 7));
    const login = await next("login");
    expect(await m.cancel("cursor", run.attemptId, 8)).toEqual(expect.objectContaining({ ok: false, reason: "not_owner" }));
    stopReleases = false;
    expect((await m.cancel("cursor", run.attemptId, 7)).ok).toBe(true);
    expect(login.stopped).toBe(true);
    writeToken(login, { id: "late" });
    await flush();
    expect(m.state("cursor")).toMatchObject({ phase: "signingIn", attempt: { cancelled: true } });
    login.release();
    expect(await run.done).toMatchObject({ phase: "disconnected", connection: null, attempt: null });
    expect(processes.filter(p => p.step === "status")).toEqual([]);
    expect(existsSync(tokenFile("cursor"))).toBe(false);
    expect(storage.readMetadata().accounts).toEqual([]);
    expect((await m.signIn("claude", 7)).ok).toBe(true);
  });
  it("reports a result only after the attempt's whole process group is gone", async () => {
    const m = manager(); await m.load();
    const run = started(await m.signIn("cursor", 7));
    let resolved = false; void run.done.then(() => { resolved = true; });
    const login = await next("login"); writeToken(login, { id: "u1" }); settledSet.add(login); login.finish(0, false);
    await flush(); await flush();
    expect(resolved).toBe(false);
    expect(processes.filter(p => p.step === "status")).toEqual([]);
    login.release();
    await finish("status", 0);
    expect(await run.done).toMatchObject({ phase: "connected" });
  });
  it("cancels only the closed window's sign-in", async () => {
    const m = manager(); await m.load();
    const run = started(await m.signIn("cursor", 7));
    await next("login");
    await m.ownerClosed(8);
    expect(m.state("cursor").attempt?.cancelled).toBe(false);
    await m.ownerClosed(7);
    expect(await run.done).toMatchObject({ phase: "disconnected", attempt: null });
  });
  it("stops a pending check when a sign-in replaces it and drops the check's late result", async () => {
    const m = manager(); await m.load();
    keychain = { status: "connected", account: { id: "acct", workspace: null } };
    const check = started(await m.check("claude"));
    const status = await next("status");
    const run = started(await m.signIn("claude", 7));
    expect(status.stopped).toBe(true);
    await finish("login", 0);
    await finish("status", 0);
    expect(await run.done).toMatchObject({ phase: "connected", verified: true });
    await check.done;
    expect(m.state("claude")).toMatchObject({ phase: "connected" });
  });
  it("cancels attempts and waits for their processes on quit", async () => {
    const m = manager(); await m.load();
    const run = started(await m.signIn("cursor", 7));
    const login = await next("login");
    await m.quit();
    expect(login.stopped).toBe(true);
    expect(await run.done).toMatchObject({ attempt: null, connection: null });
    expect(await m.signIn("cursor", 7)).toEqual(expect.objectContaining({ ok: false, reason: "busy" }));
  });
});

describe("check", () => {
  it("materializes the vault for the status process and absorbs a runtime refresh", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    const check = started(await m.check("cursor"));
    await finish("status", 0, p => {
      expect(JSON.parse(readFileSync(join(p.cwd, "creds/token.json"), "utf8"))).toEqual({ id: "u1" });
      writeToken(p, { id: "u1", refreshed: true });
    });
    expect(await check.done).toMatchObject({ phase: "connected", verified: true });
    expect(existsSync(tokenFile("cursor"))).toBe(false);
    expect(await storage.loadVault("cursor")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify({ id: "u1", refreshed: true })) });
  });
  it("marks an expired login for reauthentication and keeps the connection", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    await storage.saveVault("cursor", { "creds/token.json": Buffer.from(JSON.stringify({ id: "u1", expired: true })) });
    const check = started(await m.check("cursor"));
    await finish("status", 0);
    expect(await check.done).toMatchObject({ phase: "reauthRequired", expired: true, connection: { account: { id: "u1" } } });
  });
  it("stops a status process that does not answer and reports a check failure", async () => {
    vi.useFakeTimers();
    try {
      const m = manager(); await m.load();
      const check = started(await m.check("claude"));
      await vi.advanceTimersByTimeAsync(1500);
      expect(processes[0]!.stopped).toBe(true);
      expect(await check.done).toMatchObject({ error: { code: "check_failed" } });
    } finally { vi.useRealTimers(); }
  });
  it("reports an unreadable vault as a check failure without deleting it", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    vi.spyOn(cipher, "decrypt").mockImplementation(async () => { throw new Error("key changed"); });
    const check = started(await m.check("cursor"));
    // A failed check keeps the verified connection and shows the error beside it (batch A decision 2).
    expect(await check.done).toMatchObject({ phase: "connected", error: { code: "check_failed" }, connection: { account: { id: "u1" } } });
    expect(existsSync(join(root, "vault", "cursor.bin"))).toBe(true);
  });
});

describe("sign-out", () => {
  it("requires running work to stop first", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    const lease = await m.acquire("cursor");
    expect(await m.signOut("cursor")).toEqual(expect.objectContaining({ ok: false, reason: "stop_required" }));
    expect(await m.signIn("cursor", 7)).toEqual(expect.objectContaining({ ok: false, reason: "stop_required" }));
    await lease.release();
    expect((await m.signOut("cursor")).ok).toBe(true);
  });
  it("deletes the dedicated credential without a provider logout and confirms the profile is unauthenticated", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    expect(await m.signOut("copilot")).toEqual(expect.objectContaining({ ok: false, reason: "not_connected" }));
    const run = started(await m.signOut("cursor"));
    await finish("status", 0, p => expect(existsSync(join(p.cwd, "creds/token.json"))).toBe(false));
    expect(await run.done).toMatchObject({ phase: "disconnected", connection: null });
    expect(processes.filter(p => p.step === "logout")).toEqual([]);
    expect(await storage.loadVault("cursor")).toBeNull();
    expect(storage.readMetadata().accounts).toEqual([]);
  });
  it("runs the official logout for keychain providers and fails when the profile is still signed in", async () => {
    const m = manager(); await m.load();
    keychain = { status: "connected", account: { id: "acct", workspace: null } };
    const signIn = started(await m.signIn("claude", 7)); await finish("login", 0); await finish("status", 0); await signIn.done;
    const run = started(await m.signOut("claude"));
    await finish("logout", 0);
    await finish("status", 0);
    expect(await run.done).toMatchObject({ phase: "error", error: { code: "sign_out_failed" }, connection: { account: { id: "acct" } } });
    expect(await m.signIn("claude", 7)).toEqual(expect.objectContaining({ ok: false, reason: "sign_out_failed" }));
    keychain = { status: "disconnected" };
    const retry = started(await m.signOut("claude"));
    await finish("logout", 0); await finish("status", 0);
    expect(await retry.done).toMatchObject({ phase: "disconnected", connection: null, error: null });
  });
  it("keeps blocking new runs when the dedicated credential cannot be deleted", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    chmodSync(join(root, "vault"), 0o500);
    const run = started(await m.signOut("cursor"));
    expect(await run.done).toMatchObject({ phase: "error", error: { code: "sign_out_failed" } });
    expect(storage.readMetadata().accounts).toHaveLength(1);
    await expect(m.acquire("cursor")).rejects.toThrow("sign_out_failed");
  });
});

describe("leases and recovery", () => {
  it("shares one working copy between concurrent runs and absorbs it when the last one ends", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    const a = await m.acquire("cursor"), b = await m.acquire("cursor");
    expect(a.env).toMatchObject({ HOME: storage.profileDir("cursor"), FAKE_STORE: "file", PATH: "/verified/bin" });
    expect(a.command).toBe("/bin/fake-cli");
    writeFileSync(tokenFile("cursor"), JSON.stringify({ id: "u1", refreshed: 2 }));
    await a.release();
    expect(existsSync(tokenFile("cursor"))).toBe(true);
    await b.release(); await b.release();
    expect(existsSync(tokenFile("cursor"))).toBe(false);
    expect(await storage.loadVault("cursor")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify({ id: "u1", refreshed: 2 })) });
  });
  it("refuses a lease when a sign-in starts while the CLI is being located", async () => {
    let locating = false, resume!: () => void;
    const m = manager({ locate: async () => { if (locating) await new Promise<void>(resolve => { resume = resolve; }); return { command: "/bin/fake-cli", path: "/verified/bin" }; } });
    await m.load();
    await signedInCursor(m, "u1");
    locating = true;
    const lease = m.acquire("cursor");
    await flush();
    locating = false;
    expect((await m.signIn("cursor", 7)).ok).toBe(true);
    resume();
    await expect(lease).rejects.toThrow("busy");
  });
  it("refuses a lease without a verified connection", async () => {
    const m = manager(); await m.load();
    await expect(m.acquire("cursor")).rejects.toThrow("not_connected");
  });
  it("recovers plaintext left by a crash: absorbs it for a stored connection and deletes orphans", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    mkdirSync(dirname(tokenFile("cursor")), { recursive: true });
    writeFileSync(tokenFile("cursor"), JSON.stringify({ id: "u1", refreshed: "crash" }));
    mkdirSync(dirname(tokenFile("copilot")), { recursive: true });
    writeFileSync(tokenFile("copilot"), JSON.stringify({ id: "orphan" }));
    await storage.saveVault("copilot", { "creds/token.json": Buffer.from("orphan") });
    const restarted = manager(); await restarted.load();
    expect(existsSync(tokenFile("cursor"))).toBe(false);
    expect(await storage.loadVault("cursor")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify({ id: "u1", refreshed: "crash" })) });
    expect(existsSync(tokenFile("copilot"))).toBe(false);
    expect(await storage.loadVault("copilot")).toBeNull();
    expect(restarted.state("cursor")).toMatchObject({ phase: "connected", verified: false });
  });
  it("deletes crash leftovers without encrypting them when the key is unavailable", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    mkdirSync(dirname(tokenFile("cursor")), { recursive: true }); writeFileSync(tokenFile("cursor"), "refreshed");
    storage = new AuthStorage(root, fakeCipher({ available: async () => false }));
    const restarted = manager(); await restarted.load();
    expect(existsSync(tokenFile("cursor"))).toBe(false);
  });
});

describe("status", () => {
  it("publishes revisioned states without secrets", async () => {
    const changes: [Provider, number][] = [];
    const m = manager({ onChange: (state, revision) => changes.push([state.provider, revision]) }); await m.load();
    await signedInCursor(m, "u1");
    expect(changes.map(([, revision]) => revision)).toEqual([...changes.keys()].map(i => i + 1));
    expect(JSON.stringify(m.status("cursor", { cli: "found", version: "supported", tools: "ready" }))).not.toMatch(/token|connectionId|id-\d/);
  });
});

describe("owned auth process", () => {
  const options = () => ({ cwd: tmpdir(), env: { PATH: "/usr/bin:/bin" } });
  it("reports the leader's exit first and the group only after a lingering child ends", async () => {
    const child = spawnAuthProcess("/bin/sh", ["-c", "sleep 0.5 & echo hi"], options());
    const out: string[] = []; child.onOutput(text => out.push(text));
    expect(await child.exit).toBe(0);
    let gone = false; void child.gone.then(() => { gone = true; });
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(gone).toBe(false);
    await child.gone;
    expect(out.join("")).toContain("hi");
  });
  it("stops the whole group on request", async () => {
    const child = spawnAuthProcess("/bin/sh", ["-c", "sleep 30 & sleep 30"], options());
    child.stop();
    await child.gone;
    expect(await child.exit).toBeNull();
  });
  it("settles a spawn failure without a process to wait for", async () => {
    const child = spawnAuthProcess("/nonexistent/cli", [], options());
    expect(await child.exit).toBeNull();
    await child.gone;
  });
});
