import { execFileSync } from "node:child_process";
import { accessSync, chmodSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { AUTH_LINK_MARKER, BROWSER_HOOK } from "./antigravity";
import { AuthManager, removeStaleLinkDirs, spawnAuthProcess, type AuthProcess, type Spawn } from "./manager";
import type { ProviderAuth } from "./providers";
import { AuthStorage, type Cipher } from "./storage";
import { fakeCipher } from "./fixtures/cipher";
import type { CheckResult, Provider } from "./types";

type Step = "login" | "status" | "logout" | "acp";
class FakeProcess implements AuthProcess {
  listeners: ((text: string, stream?: "stderr") => void)[] = [];
  stopped = false;
  written: string[] = [];
  private exitWith!: (code: number | null) => void;
  private goneWith!: () => void;
  readonly exit = new Promise<number | null>(resolve => { this.exitWith = resolve; });
  readonly gone = new Promise<void>(resolve => { this.goneWith = resolve; });
  constructor(readonly step: Step, readonly args: string[], readonly env: Record<string, string>, readonly cwd: string) {}
  onOutput(listener: (text: string, stream?: "stderr") => void): void { this.listeners.push(listener); }
  print(text: string, stream?: "stderr"): void { for (const listener of this.listeners) listener(text, stream); }
  // ACP requests the client wrote, and a reply to the latest one with this method.
  requests(): { id: number; method: string; params: Record<string, unknown> }[] { return this.written.join("").split("\n").filter(Boolean).map(line => JSON.parse(line)).filter(m => "method" in m); }
  reply(method: string, result: unknown): void {
    const request = this.requests().filter(r => r.method === method).at(-1); if (!request) throw new Error(`no ${method} request`);
    this.print(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n");
  }
  // A finished leader is not a finished group; tests release the group separately when they need to.
  finish(code: number | null, groupGone = true): void { this.exitWith(code); if (groupGone) this.goneWith(); }
  release(): void { this.goneWith(); }
  stop(): void { this.stopped = true; this.finish(null, stopReleases); }
  write(text: string): void { this.written.push(text); }
}
let stopReleases = true;
const fileProvider = (status: (dir: string) => CheckResult): ProviderAuth => ({
  command: "fake-cli", args: [], env: { FAKE_STORE: "file" }, login: ["login"], status: ["status"], logout: null,
  vault: ["creds/token.json"], plaintext: [], settings: { "conf/settings.json": '{"storeTokenPlaintext":true}' }, acpAuth: null, acp: null, verifyByRun: false, hookLink: null,
  parseStatus: run => run.code === 0 ? status(run.profileDir) : { status: "failed", code: "check_failed" },
});
// Antigravity's shape: sign-in, status and sign-out are ACP calls on one server binary.
const acpProvider = (): ProviderAuth => ({
  command: "fake-server", args: [], env: {}, login: [], status: [], logout: null, vault: ["creds/token.json"], plaintext: [], settings: {},
  acpAuth: { method: "oauth-personal", agent: "fake-acp", version: "1.3.0" }, acp: { args: [], authenticate: "oauth-personal", sessions: "sessions" }, verifyByRun: false, hookLink: null,
  parseStatus: run => run.code === 2 ? { status: "disconnected" } : run.code === 0 ? { status: "connected", account: { id: null, workspace: null } } : { status: "failed", code: "check_failed", detail: run.stderr },
});
const INIT = { protocolVersion: 1, agentInfo: { name: "fake-acp", version: "1.3.0" }, authMethods: [{ id: "oauth-personal" }], agentCapabilities: { loadSession: true } };
const replied = new Set<string>();
// The next live ACP process with an unanswered request for this method.
async function acpRequest(method: string): Promise<FakeProcess> {
  for (let i = 0; i < 50; i++) {
    const found = processes.find(p => p.step === "acp" && !p.stopped && p.requests().some(r => r.method === method) && !replied.has(`${processes.indexOf(p)}:${method}`));
    if (found) { replied.add(`${processes.indexOf(found)}:${method}`); return found; }
    await flush();
  }
  throw new Error(`no ${method} request`);
}
const googleLink = (port: number) => `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=x&redirect_uri=${encodeURIComponent(`http://127.0.0.1:${port}/`)}&state=st-1`;
const withAcp = () => ({ claude: keychainProvider(() => keychain), codex: keychainProvider(() => keychain), cursor: fileProvider(tokenAccount), antigravity: acpProvider(), copilot: fileProvider(tokenAccount) });
const keychainProvider = (status: () => CheckResult): ProviderAuth => ({
  command: "fake-cli", args: ["-c", "store=keyring"], env: {}, login: ["login"], status: ["status"], logout: ["logout"],
  vault: null, plaintext: ["auth.json"], settings: {}, acpAuth: null, acp: null, verifyByRun: false, hookLink: null, parseStatus: run => run.code === 0 ? status() : { status: "failed", code: "check_failed" },
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
  processes = []; settledSet.clear(); replied.clear(); keychain = { status: "disconnected" }; ids = 0; stopReleases = true;
  spawn = vi.fn<Spawn>((_command, args, options) => {
    const step: Step = options.input ? "acp" : args.includes("login") ? "login" : args.includes("logout") ? "logout" : "status";
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
  it("signs in through the ACP server, routes only its sign-in link to the owner and verifies with a fresh ACP status", async () => {
    const prompts: unknown[] = [];
    const m = manager({ onPrompt: prompt => prompts.push(prompt), adapters: withAcp() });
    await m.load();
    const run = started(await m.signIn("antigravity", 7));
    const login = await acpRequest("initialize"); login.reply("initialize", INIT);
    await acpRequest("authenticate");
    expect(login.requests().find(r => r.method === "authenticate")?.params).toEqual({ methodId: "oauth-personal" });
    // Server log lines and other URLs are not sign-in links; only a Google request returning to the loopback is.
    login.print("I1028 Started local credentials injection proxy on http://127.0.0.1:5000\n", "stderr");
    login.print(`${AUTH_LINK_MARKER}https://example.com/o/oauth2/v2/auth?response_type=code&state=s&redirect_uri=http%3A%2F%2F127.0.0.1%3A4321%2F\n`, "stderr");
    login.print(`${AUTH_LINK_MARKER}${googleLink(4321)}\n`, "stderr");
    expect(prompts).toEqual([{ provider: "antigravity", attemptId: run.attemptId, owner: 7, url: googleLink(4321) }]);
    writeToken(login, { id: "g1" }); login.reply("authenticate", {});
    const status = await acpRequest("initialize"); status.reply("initialize", INIT);
    await acpRequest("authenticate"); status.reply("authenticate", {});
    const state = await run.done;
    expect(state).toMatchObject({ phase: "connected", verified: true, connection: { provider: "antigravity", account: { id: null, workspace: null } } });
    expect(await storage.loadVault("antigravity")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify({ id: "g1" })) });
    expect(existsSync(tokenFile("antigravity"))).toBe(false);
    expect(login.stopped && status.stopped).toBe(true);
  });
  it("delivers a pasted callback address only from the owner, for this attempt's listener and state", async () => {
    const hits: string[] = [];
    const server = createServer((request, response) => { hits.push(request.url ?? ""); response.end("ok"); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const m = manager({ adapters: withAcp() });
      await m.load();
      const run = started(await m.signIn("antigravity", 7));
      const login = await acpRequest("initialize"); login.reply("initialize", INIT);
      await acpRequest("authenticate");
      const address = `http://127.0.0.1:${port}/?state=st-1&code=c1&scope=email`;
      expect(m.submitCode("antigravity", run.attemptId, 7, address)).toEqual({ ok: false, reason: "invalid" });
      login.print(`${AUTH_LINK_MARKER}${googleLink(port)}\n`, "stderr");
      expect(m.submitCode("antigravity", run.attemptId, 8, address)).toEqual({ ok: false, reason: "not_owner" });
      expect(m.submitCode("antigravity", "other", 7, address)).toEqual({ ok: false, reason: "stale" });
      for (const wrong of [`http://127.0.0.1:${port}/?state=other&code=c1`, `http://127.0.0.1:${port + 1}/?state=st-1&code=c1`, `http://localhost:${port}/?state=st-1&code=c1`, `http://127.0.0.1:${port}/?state=st-1`, "4/0code"]) {
        expect(m.submitCode("antigravity", run.attemptId, 7, wrong)).toEqual({ ok: false, reason: "invalid" });
      }
      expect(m.submitCode("antigravity", run.attemptId, 7, address)).toEqual({ ok: true });
      for (let i = 0; i < 100 && !hits.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
      expect(hits).toEqual(["/?state=st-1&code=c1&scope=email"]);
      await m.cancel("antigravity", run.attemptId, 7);
      expect(await run.done).toMatchObject({ phase: "disconnected", attempt: null });
      expect(login.stopped).toBe(true);
      expect(m.submitCode("antigravity", run.attemptId, 7, address)).toEqual({ ok: false, reason: "stale" });
    } finally { server.close(); }
  });
  it("reports an ACP status that asks for a new browser sign-in as signed out and stops the server", async () => {
    const m = manager({ adapters: withAcp() });
    storage.writeMetadata({ v: 1, accounts: [{ provider: "antigravity", connectionId: "c-1", profile: "antigravity", account: { id: null, workspace: null } }] });
    await m.load();
    const check = started(await m.check("antigravity"));
    const status = await acpRequest("initialize"); status.reply("initialize", INIT);
    await acpRequest("authenticate");
    status.print(`${AUTH_LINK_MARKER}${googleLink(4321)}\n`, "stderr");
    expect(await check.done).toMatchObject({ phase: "reauthRequired", expired: true, verified: false });
    expect(status.stopped).toBe(true);
  });
  it("points every server process at doan's executable browser hook and starts none without it", async () => {
    const m = manager({ adapters: withAcp() });
    await m.load();
    const run = started(await m.signIn("antigravity", 7));
    const login = await acpRequest("initialize");
    const hook = join(root, BROWSER_HOOK.name);
    expect(login.env.BROWSER).toBe(hook);
    expect(readFileSync(hook, "utf8")).toBe(BROWSER_HOOK.script);
    expect(() => accessSync(hook, constants.X_OK)).not.toThrow();
    await m.cancel("antigravity", run.attemptId, 7); await run.done;
    // A hook that cannot be written would let webbrowser fall back to the default browser.
    rmSync(hook); mkdirSync(hook);
    const spawned = spawn.mock.calls.length;
    const again = started(await m.signIn("antigravity", 7));
    expect(await again.done).toMatchObject({ phase: "error", error: { code: "sign_in_failed" } });
    storage.writeMetadata({ v: 1, accounts: [{ provider: "antigravity", connectionId: "c-1", profile: "antigravity", account: { id: null, workspace: null } }] });
    await m.load();
    expect(await started(await m.check("antigravity")).done).toMatchObject({ error: { code: "check_failed" } });
    expect(spawn.mock.calls.length).toBe(spawned);
  });
  it("refuses an ACP server that is not the pinned agent and version", async () => {
    const m = manager({ adapters: withAcp() });
    await m.load();
    const run = started(await m.signIn("antigravity", 7));
    (await acpRequest("initialize")).reply("initialize", { ...INIT, agentInfo: { name: "fake-acp", version: "1.3.1" } });
    expect(await run.done).toMatchObject({ phase: "error", error: { code: "sign_in_failed" }, connection: null });
    expect(await storage.loadVault("antigravity")).toBeNull();
  });
  it("signs out with the server's logout on the materialized token, then removes doan's copy and checks again", async () => {
    const m = manager({ adapters: withAcp() });
    await m.load();
    const run = started(await m.signIn("antigravity", 7));
    const login = await acpRequest("initialize"); login.reply("initialize", INIT);
    await acpRequest("authenticate"); writeToken(login, { id: "g1" }); login.reply("authenticate", {});
    const status = await acpRequest("initialize"); status.reply("initialize", INIT);
    await acpRequest("authenticate"); status.reply("authenticate", {});
    await run.done;
    const out = started(await m.signOut("antigravity"));
    const logout = await acpRequest("initialize");
    expect(existsSync(join(logout.cwd, "creds/token.json"))).toBe(true);
    logout.reply("initialize", INIT); await acpRequest("logout"); logout.reply("logout", {});
    const after = await acpRequest("initialize");
    expect(existsSync(join(after.cwd, "creds/token.json"))).toBe(false);
    after.reply("initialize", INIT); await acpRequest("authenticate");
    after.print(`${AUTH_LINK_MARKER}${googleLink(4321)}\n`, "stderr");
    expect(await out.done).toMatchObject({ phase: "disconnected", connection: null });
    expect(await storage.loadVault("antigravity")).toBeNull();
    expect(storage.readMetadata().accounts).toEqual([]);
  });
  it("admits an unchecked run-verified connection and verifies it only from its own connection's completed run", async () => {
    const copilot = { ...fileProvider(tokenAccount), verifyByRun: true };
    const m = manager({ adapters: { ...withAcp(), copilot } });
    storage.writeMetadata({ v: 1, accounts: [{ provider: "copilot", connectionId: "c-1", profile: "copilot", account: { id: "octo", workspace: null } },
      { provider: "cursor", connectionId: "c-2", profile: "cursor", account: { id: "u1", workspace: null } }] });
    await storage.saveVault("copilot", { "creds/token.json": Buffer.from(JSON.stringify({ id: "octo" })) });
    await m.load();
    expect(m.state("copilot").verified).toBe(false);
    const lease = await m.acquire("copilot");
    expect(processes).toEqual([]);
    m.confirm("copilot", "c-other");
    expect(m.state("copilot").verified).toBe(false);
    m.confirm("copilot", "c-1");
    expect(m.state("copilot")).toMatchObject({ verified: true, phase: "connected" });
    await lease.release();
    // Every other provider still needs a check before a run.
    await expect(m.acquire("cursor")).rejects.toThrow("unverified");
    // A run that logged in as someone else writes that login back; its confirmation reads it without a request.
    const next = await m.acquire("copilot");
    writeFileSync(tokenFile("copilot"), JSON.stringify({ id: "someone-else" }));
    m.confirm("copilot", "c-1");
    expect(m.state("copilot")).toMatchObject({ phase: "error", error: { code: "account_mismatch" } });
    expect(processes).toEqual([]);
    await next.release();
  });
  it("signs Claude in with only the link the CLI hands doan's browser hook, never a printed one", async () => {
    const prompts: unknown[] = [];
    const claude: ProviderAuth = { ...keychainProvider(() => keychain), hookLink: raw => raw.startsWith("https://login.example/") ? raw : null };
    const m = manager({ onPrompt: prompt => prompts.push(prompt), adapters: { ...withAcp(), claude } }); await m.load();
    const run = started(await m.signIn("claude", 7));
    const login = await next("login");
    const hook = join(root, BROWSER_HOOK.name);
    expect(login.env.BROWSER).toBe(hook);
    // The printed link would need a pasted code, which doan cannot take.
    login.print("If the browser didn't open, visit: https://login.example/manual?code=true\nPaste code here if prompted > ");
    // claude 2.1.312 runs $BROWSER with the link as its only argument and discards the hook's output.
    execFileSync(hook, ["https://evil.example/authorize"], { env: login.env, stdio: "ignore" });
    execFileSync(hook, ["https://login.example/authorize?redirect_uri=localhost"], { env: login.env, stdio: "ignore" });
    await vi.waitFor(() => expect(prompts).toEqual([{ provider: "claude", attemptId: run.attemptId, owner: 7, url: "https://login.example/authorize?redirect_uri=localhost" }]));
    keychain = { status: "connected", account: { id: "c1", workspace: null } };
    await finish("login", 0);
    const status = await finish("status", 0);
    expect(await run.done).toMatchObject({ phase: "connected", connection: { provider: "claude", account: { id: "c1" } } });
    // Every Claude process gets the hook; only the login's has a place to leave the link.
    expect(status.env.BROWSER).toBe(hook);
    expect(Object.keys(status.env).filter(name => !Object.keys(login.env).includes(name))).toEqual([]);
    expect(Object.keys(login.env).filter(name => !Object.keys(status.env).includes(name))).toHaveLength(1);
    expect(prompts).toHaveLength(1);
  });
  describe("Claude login that prints a link but receives no usable hook link", () => {
    const hooked = (accept: (raw: string) => string | null = raw => raw.startsWith("https://login.example/") ? raw : null): ProviderAuth => ({ ...keychainProvider(() => keychain), hookLink: accept });
    const printed = "If the browser didn't open, visit: https://login.example/manual?code=true\n";
    let errors: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { errors = vi.spyOn(console, "error").mockImplementation(() => {}); });
    afterEach(() => errors.mockRestore());

    it("ends as sign_in_failed, stops the login, removes the link directory and logs why", async () => {
      const prompts: unknown[] = [];
      const m = manager({ hookLinkTimeoutMs: 40, onPrompt: prompt => prompts.push(prompt), adapters: { ...withAcp(), claude: hooked() } }); await m.load();
      const run = started(await m.signIn("claude", 7));
      const login = await next("login");
      const dir = dirname(login.env.DOAN_AUTH_LINK!);
      login.print(printed);
      execFileSync(join(root, BROWSER_HOOK.name), ["https://evil.example/authorize?state=secret-state"], { env: login.env, stdio: "ignore" });
      const state = await run.done;
      expect(state).toMatchObject({ phase: "error", error: { code: "sign_in_failed" } });
      expect(login.stopped).toBe(true); expect(existsSync(dir)).toBe(false); expect(prompts).toEqual([]);
      const logged = errors.mock.calls.map((call: unknown[]) => call.join(" ")).join("\n");
      expect(logged).toContain("claude"); expect(logged).toContain("https://evil.example/authorize");
      // The rejected link's query values (state) stay out of the log.
      expect(logged).not.toContain("secret-state");
    });
    it("keeps waiting when the hook link arrives after the printed one", async () => {
      const prompts: unknown[] = [];
      // The hook link is read by a 100 ms poll, so the timeout must be well above it.
      const m = manager({ hookLinkTimeoutMs: 400, onPrompt: prompt => prompts.push(prompt), adapters: { ...withAcp(), claude: hooked() } }); await m.load();
      const run = started(await m.signIn("claude", 7));
      const login = await next("login");
      login.print(printed);
      execFileSync(join(root, BROWSER_HOOK.name), ["https://login.example/authorize"], { env: login.env, stdio: "ignore" });
      await vi.waitFor(() => expect(prompts).toHaveLength(1));
      // The user approves long after the timeout would have fired.
      await new Promise(resolve => setTimeout(resolve, 600));
      expect(login.stopped).toBe(false);
      keychain = { status: "connected", account: { id: "c1", workspace: null } };
      await finish("login", 0); await finish("status", 0);
      expect(await run.done).toMatchObject({ phase: "connected" });
    });
    it("does not time out a login that has printed nothing yet", async () => {
      const m = manager({ hookLinkTimeoutMs: 20, adapters: { ...withAcp(), claude: hooked() } }); await m.load();
      const run = started(await m.signIn("claude", 7));
      const login = await next("login");
      // A slow start is not a missing hook link: only a printed link says the CLI reached its browser step.
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(login.stopped).toBe(false);
      await m.cancel("claude", run.attemptId, 7); await run.done;
    });
    it("logs a rejected hook link even while the login is still waiting", async () => {
      const m = manager({ adapters: { ...withAcp(), claude: hooked() } }); await m.load();
      const run = started(await m.signIn("claude", 7));
      const login = await next("login");
      execFileSync(join(root, BROWSER_HOOK.name), ["https://login.example.evil/authorize?state=s&redirect_uri=http%3A%2F%2Flocalhost%3A5%2Fcb"], { env: login.env, stdio: "ignore" });
      await vi.waitFor(() => expect(errors.mock.calls.some((call: unknown[]) => call.join(" ").includes("https://login.example.evil/authorize"))).toBe(true));
      await m.cancel("claude", run.attemptId, 7); await run.done;
    });
  });
  it("starts no Claude login when the browser hook cannot be installed", async () => {
    const claude: ProviderAuth = { ...keychainProvider(() => keychain), hookLink: raw => raw };
    const m = manager({ adapters: { ...withAcp(), claude } }); await m.load();
    mkdirSync(join(root, BROWSER_HOOK.name));
    // Without the hook the CLI would open the user's default browser itself.
    expect(await started(await m.signIn("claude", 7)).done).toMatchObject({ phase: "error", error: { code: "sign_in_failed" } });
    expect(spawn).not.toHaveBeenCalled();
  });
  it("refuses a code for a login that reads no input", async () => {
    const m = manager(); await m.load();
    const run = started(await m.signIn("cursor", 7));
    await next("login");
    expect(m.submitCode("cursor", run.attemptId, 7, "4/abc")).toEqual({ ok: false, reason: "invalid" });
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
  it("reports a failed server install with its own code for sign-in and check", async () => {
    const m = manager({ adapters: withAcp(), locate: async provider => { if (provider === "antigravity") throw new Error("cli_install_failed"); return { command: "/bin/fake-cli", path: "/verified/bin" }; } });
    await m.load();
    expect(await started(await m.signIn("antigravity", 7)).done).toMatchObject({ phase: "error", error: { code: "cli_install_failed" } });
    storage.writeMetadata({ v: 1, accounts: [{ provider: "antigravity", connectionId: "c-1", profile: "antigravity", account: { id: null, workspace: null } }] });
    await m.load();
    const checked = await started(await m.check("antigravity")).done;
    expect(checked).toMatchObject({ error: { code: "cli_install_failed" } });
    expect(m.status("antigravity", { cli: "found", version: "supported", tools: "ready" }).actions).toEqual(["retry", "signOut"]);
    expect(spawn).not.toHaveBeenCalled();
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
  it("keeps the previous vault as the live, still verified profile when a replacement fails", async () => {
    const m = manager(); await m.load();
    const first = await signedInCursor(m, "u1");
    const run = started(await m.signIn("cursor", 7));
    await finish("login", 1, p => writeToken(p, { id: "u2" }));
    const state = await run.done;
    expect(state).toMatchObject({ connection: first.connection, verified: true, error: { code: "sign_in_failed" } });
    expect(await storage.loadVault("cursor")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify({ id: "u1" })) });
    expect(existsSync(tokenFile("cursor"))).toBe(false);
  });
});

// V defect 2 (2026-10-29): a cancelled replacement sign-in unverified every connection it was tried on.
describe("a replacement that does not finish", () => {
  const vaultU1 = { "creds/token.json": Buffer.from(JSON.stringify({ id: "u1" })) };
  it("leaves a vault provider's connection, vault and metadata as they were when the owner cancels", async () => {
    const m = manager(); await m.load();
    const first = await signedInCursor(m, "u1");
    keychain = { status: "connected", account: { id: "c1", workspace: null } };
    const claude = started(await m.signIn("claude", 7)); await finish("login", 0); await finish("status", 0); await claude.done;
    const run = started(await m.signIn("cursor", 7));
    await next("login");
    await m.cancel("cursor", run.attemptId, 7);
    expect(await run.done).toMatchObject({ phase: "connected", connection: first.connection, verified: true, error: null, attempt: null });
    expect(await storage.loadVault("cursor")).toEqual(vaultU1);
    expect(storage.readMetadata().accounts.find(a => a.provider === "cursor")).toEqual(first.connection);
    expect(m.state("claude")).toMatchObject({ phase: "connected", verified: true });
  });
  it("does not store the new login in the vault before its last cancellation point", async () => {
    let hold: (() => void) | undefined;
    const gate = () => new Promise<void>(resolve => { hold = resolve; });
    let gated = false;
    storage = new AuthStorage(root, fakeCipher({ encrypt: async text => { if (gated) await gate(); return Buffer.from("ENC:" + Buffer.from(text, "utf8").toString("base64")); } }));
    const m = manager(); await m.load();
    const first = await signedInCursor(m, "u1");
    gated = true;
    const run = started(await m.signIn("cursor", 7));
    await finish("login", 0, p => writeToken(p, { id: "u2" }));
    await finish("status", 0);
    await vi.waitFor(() => expect(hold).toBeDefined());
    // The user cancels while the new login is being sealed, after the provider reported it connected.
    await m.cancel("cursor", run.attemptId, 7);
    hold!();
    expect(await run.done).toMatchObject({ phase: "connected", connection: first.connection, verified: true });
    expect(await storage.loadVault("cursor")).toEqual(vaultU1);
    expect(storage.readMetadata().accounts).toEqual([first.connection]);
  });
  it("restores the previous vault when the new login's metadata cannot be written", async () => {
    const m = manager(); await m.load();
    const first = await signedInCursor(m, "u1");
    const write = vi.spyOn(storage, "writeMetadata").mockImplementation(() => { throw new Error("disk full"); });
    const run = started(await m.signIn("cursor", 7));
    await finish("login", 0, p => writeToken(p, { id: "u2" }));
    await finish("status", 0);
    const state = await run.done;
    write.mockRestore();
    expect(state).toMatchObject({ connection: first.connection, verified: true, error: { code: "storage_failed" } });
    expect(await storage.loadVault("cursor")).toEqual(vaultU1);
  });
  it("keeps a keychain connection verified when its login is stopped or fails before it stored anything", async () => {
    const m = manager(); await m.load();
    keychain = { status: "connected", account: { id: "c1", workspace: null } };
    const first = started(await m.signIn("claude", 7)); await finish("login", 0); await finish("status", 0);
    const connection = (await first.done).connection;
    const cancelled = started(await m.signIn("claude", 7));
    await next("login");
    await m.cancel("claude", cancelled.attemptId, 7);
    expect(await cancelled.done).toMatchObject({ phase: "connected", connection, verified: true, error: null });
    const failed = started(await m.signIn("claude", 7));
    await finish("login", 1);
    expect(await failed.done).toMatchObject({ phase: "connected", connection, verified: true, error: { code: "sign_in_failed" } });
    // The live login is never logged out for a replacement.
    expect(processes.filter(p => p.step === "logout")).toEqual([]);
  });
  it("unverifies a keychain connection once its login finished, since the profile may hold the new login", async () => {
    const m = manager(); await m.load();
    keychain = { status: "connected", account: { id: "c1", workspace: null } };
    const first = started(await m.signIn("claude", 7)); await finish("login", 0); await finish("status", 0);
    const connection = (await first.done).connection;
    const run = started(await m.signIn("claude", 7));
    keychain = { status: "disconnected" };
    await finish("login", 0); await finish("status", 0);
    expect(await run.done).toMatchObject({ connection, verified: false, error: { code: "sign_in_failed" } });
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
    expect(await check.outcome).toBe("replaced");
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

describe("stop before spawn", () => {
  // The first locate call waits until the test resumes it, as probeShell does on a slow login shell.
  function pausedLocate() {
    let resume: (() => void) | null = null, calls = 0;
    const locate = async () => {
      if (++calls === 1) await new Promise<void>(resolve => { resume = resolve; });
      return { command: "/bin/fake-cli", path: "/verified/bin" };
    };
    const paused = async () => { for (let i = 0; i < 50 && !resume; i++) await flush(); if (!resume) throw new Error("locate never ran"); return resume as () => void; };
    return { locate, paused };
  }
  const stoppers: [string, (m: AuthManager, attemptId: string) => Promise<unknown>][] = [
    ["cancel", (m, attemptId) => m.cancel("cursor", attemptId, 7)],
    ["owner window close", m => m.ownerClosed(7)],
    ["quit", m => m.quit()],
  ];
  it.each(stoppers)("leaves no login running when %s lands while the CLI is being located", async (_name, stopIt) => {
    const { locate, paused } = pausedLocate();
    const m = manager({ locate }); await m.load();
    const run = started(await m.signIn("cursor", 7));
    const resume = await paused();
    const stopping = stopIt(m, run.attemptId);
    resume(); await stopping;
    expect(await run.done).toMatchObject({ phase: "disconnected", attempt: null, connection: null });
    expect(processes.filter(p => !p.stopped)).toEqual([]);
  });
  // Antigravity's locate can be a long server download; a stop must end it, not wait for it.
  it.each(stoppers)("aborts the locate signal when %s lands while the CLI is being located", async (_name, stopIt) => {
    let seen: AbortSignal | undefined;
    const m = manager({ locate: (_provider, signal) => { seen = signal; return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("cancelled")))); } });
    await m.load();
    const run = started(await m.signIn("cursor", 7));
    for (let i = 0; i < 50 && !seen; i++) await flush();
    await stopIt(m, run.attemptId);
    expect(seen?.aborted).toBe(true);
    expect(await run.done).toMatchObject({ phase: "disconnected", attempt: null, error: null });
  });
  it("releases the write lock for other providers after a cancel before spawn", async () => {
    const { locate, paused } = pausedLocate();
    const m = manager({ locate }); await m.load();
    const run = started(await m.signIn("cursor", 7));
    const resume = await paused();
    await m.cancel("cursor", run.attemptId, 7);
    resume(); await run.done;
    expect((await m.signIn("codex", 7)).ok).toBe(true);
  });
  // A process that ignores the first stop request is still the attempt's and must be stopped again.
  it("stops a lingering login again on a repeated cancel or window close of an already cancelled attempt", async () => {
    const m = manager(); await m.load();
    const run = started(await m.signIn("cursor", 7));
    const login = await next("login");
    stopReleases = false;
    await m.cancel("cursor", run.attemptId, 7);
    expect(login.stopped).toBe(true);
    login.stopped = false;
    expect(await m.cancel("cursor", run.attemptId, 7)).toMatchObject({ ok: true, outcome: "unchanged" });
    expect(login.stopped).toBe(true);
    login.stopped = false;
    await m.ownerClosed(7);
    expect(login.stopped).toBe(true);
    login.release(); await run.done;
  });
  it("sends no login prompt once the attempt is cancelled", async () => {
    const prompts: unknown[] = [];
    const m = manager({ onPrompt: prompt => prompts.push(prompt) }); await m.load();
    const run = started(await m.signIn("cursor", 7));
    const login = await next("login");
    stopReleases = false;
    await m.cancel("cursor", run.attemptId, 7);
    login.print("Open https://example.com/device?x=1\n");
    expect(prompts).toEqual([]);
    login.release(); await run.done;
  });
  it("stops a check that is still locating its CLI when a sign-in replaces it", async () => {
    const { locate, paused } = pausedLocate();
    const m = manager({ locate }); await m.load();
    keychain = { status: "connected", account: { id: "acct", workspace: null } };
    const check = started(await m.check("claude"));
    const resume = await paused();
    const run = started(await m.signIn("claude", 7));
    resume();
    await finish("login", 0);
    await finish("status", 0);
    expect(await run.done).toMatchObject({ phase: "connected", verified: true });
    await check.done;
    expect(processes.filter(p => p.step === "status")).toHaveLength(1);
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

describe("stopping runs for sign-out and replacement", () => {
  // A conversation runner whose group goes away only when the test (or the stop request) says so.
  function runs(m: AuthManager, linger = false) {
    const leases: Awaited<ReturnType<AuthManager["acquire"]>>[] = [];
    const stopRuns = vi.fn(async (_provider: Provider) => { if (!linger) for (const lease of leases.splice(0)) setTimeout(() => void lease.release(), 5); });
    return { leases, stopRuns, take: async (provider: Provider) => { leases.push(await m.acquire(provider)); } };
  }
  it("stops the provider's runs on request, waits for their groups, then signs out", async () => {
    let stopRuns!: ReturnType<typeof runs>["stopRuns"];
    const m = manager({ stopRuns: provider => stopRuns(provider) }); await m.load();
    await signedInCursor(m, "u1");
    const r = runs(m); stopRuns = r.stopRuns;
    await r.take("cursor"); await r.take("cursor");
    expect(await m.signOut("cursor")).toEqual(expect.objectContaining({ ok: false, reason: "stop_required" }));
    expect(r.stopRuns).not.toHaveBeenCalled();
    const out = started(await m.signOut("cursor", { stop: true }));
    expect(m.state("cursor").phase).toBe("signingOut");
    await expect(m.acquire("cursor")).rejects.toThrow("busy");
    expect(r.stopRuns).toHaveBeenCalledWith("cursor");
    const status = await next("status");
    expect(r.leases).toEqual([]);
    settledSet.add(status); status.finish(0);
    expect(await out.done).toMatchObject({ phase: "disconnected", connection: null });
    expect(await storage.loadVault("cursor")).toBeNull();
  });
  it("fails the sign-out without touching the credential when a stopped run's group lingers", async () => {
    let stopRuns!: ReturnType<typeof runs>["stopRuns"];
    const m = manager({ stopRuns: provider => stopRuns(provider), drainTimeoutMs: 30 }); await m.load();
    await signedInCursor(m, "u1");
    const r = runs(m, true); stopRuns = r.stopRuns;
    await r.take("cursor");
    const out = started(await m.signOut("cursor", { stop: true }));
    expect(await out.done).toMatchObject({ phase: "error", error: { code: "sign_out_failed" }, connection: { account: { id: "u1" } } });
    expect(processes.filter(p => p.step === "status")).toHaveLength(1);
    expect(existsSync(tokenFile("cursor"))).toBe(true);
    expect(await storage.loadVault("cursor")).not.toBeNull();
    expect(storage.readMetadata()).toMatchObject({ accounts: [{ provider: "cursor" }], signOutFailed: ["cursor"] });
    await r.leases[0]!.release();
    await expect(m.acquire("cursor")).rejects.toThrow("sign_out_failed");
  });
  it("ends the drain at its deadline even when stopping the runs never settles", async () => {
    const m = manager({ stopRuns: () => new Promise<void>(() => {}), drainTimeoutMs: 30 }); await m.load();
    await signedInCursor(m, "u1");
    await m.acquire("cursor");
    const out = started(await m.signOut("cursor", { stop: true }));
    expect(await out.done).toMatchObject({ phase: "error", error: { code: "sign_out_failed" }, connection: { account: { id: "u1" } } });
  }, 2000);
  it("keeps a failed sign-out blocking runs and sign-ins after a restart until a sign-out succeeds", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    chmodSync(join(root, "vault"), 0o500);
    expect(await started(await m.signOut("cursor")).done).toMatchObject({ error: { code: "sign_out_failed" } });
    expect(storage.readMetadata().signOutFailed).toEqual(["cursor"]);
    chmodSync(join(root, "vault"), 0o700);
    const restarted = manager(); await restarted.load();
    expect(restarted.state("cursor")).toMatchObject({ phase: "error", error: { code: "sign_out_failed" } });
    await expect(restarted.acquire("cursor")).rejects.toThrow("sign_out_failed");
    expect(await restarted.signIn("cursor", 7)).toEqual(expect.objectContaining({ ok: false, reason: "sign_out_failed" }));
    const retry = started(await restarted.signOut("cursor"));
    await finish("status", 0);
    expect(await retry.done).toMatchObject({ phase: "disconnected", error: null });
    expect(storage.readMetadata()).toEqual({ v: 1, accounts: [] });
  });
  it("keeps other providers' failed sign-outs when one provider signs in or out", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    const copilot = started(await m.signIn("copilot", 7)); await finish("login", 0, p => writeToken(p, { id: "gh" })); await finish("status", 0); await copilot.done;
    chmodSync(join(root, "vault"), 0o500);
    await started(await m.signOut("cursor")).done;
    chmodSync(join(root, "vault"), 0o700);
    const again = started(await m.signIn("copilot", 7)); await finish("login", 0, p => writeToken(p, { id: "gh" })); await finish("status", 0); await again.done;
    expect(storage.readMetadata().signOutFailed).toEqual(["cursor"]);
  });
  it("replaces the account only after the provider's runs have stopped", async () => {
    let stopRuns!: ReturnType<typeof runs>["stopRuns"];
    const m = manager({ stopRuns: provider => stopRuns(provider) }); await m.load();
    await signedInCursor(m, "u1");
    const r = runs(m); stopRuns = r.stopRuns;
    await r.take("cursor");
    expect(await m.signIn("cursor", 7)).toEqual(expect.objectContaining({ ok: false, reason: "stop_required" }));
    const replace = started(await m.signIn("cursor", 7, { stop: true }));
    await expect(m.acquire("cursor")).rejects.toThrow("busy");
    const login = await next("login");
    expect(r.leases).toEqual([]);
    expect(existsSync(tokenFile("cursor"))).toBe(false);
    settledSet.add(login); writeToken(login, { id: "u2" }); login.finish(0);
    await finish("status", 0);
    expect(await replace.done).toMatchObject({ phase: "connected", verified: true, connection: { account: { id: "u2" } } });
  });
  it("leaves the previous login untouched when the runs do not stop before a replacement, or the owner cancels", async () => {
    let stopRuns!: ReturnType<typeof runs>["stopRuns"];
    const m = manager({ stopRuns: provider => stopRuns(provider), drainTimeoutMs: 30 }); await m.load();
    await signedInCursor(m, "u1");
    const r = runs(m, true); stopRuns = r.stopRuns;
    await r.take("cursor");
    const lingering = started(await m.signIn("cursor", 7, { stop: true }));
    const logins = () => processes.filter(p => p.step === "login").length, signedIn = logins();
    expect(await lingering.done).toMatchObject({ phase: "connected", connection: { account: { id: "u1" } }, error: { code: "sign_in_failed" } });
    expect(logins()).toBe(signedIn);
    expect(existsSync(tokenFile("cursor"))).toBe(true);
    const cancelled = started(await m.signIn("cursor", 7, { stop: true }));
    await m.cancel("cursor", cancelled.attemptId, 7);
    expect(await cancelled.done).toMatchObject({ attempt: null, connection: { account: { id: "u1" } } });
    expect(logins()).toBe(signedIn);
    expect(existsSync(tokenFile("cursor"))).toBe(true);
  });
  it("disconnects Copilot by deleting doan's copy and a fresh failed request, never its /logout", async () => {
    const { PROVIDER_AUTH } = await import("./providers");
    const m = manager({ adapters: { ...withAcp(), copilot: PROVIDER_AUTH.copilot } }); await m.load();
    const signIn = started(await m.signIn("copilot", 7));
    await finish("login", 0, p => { mkdirSync(join(p.cwd, ".copilot"), { recursive: true }); writeFileSync(join(p.cwd, ".copilot/config.json"), '// c\n{"lastLoggedInUser":{"login":"octo","host":"https://github.com"},"copilotTokens":{"x":"y"}}'); });
    await finish("status", 0);
    await signIn.done;
    const out = started(await m.signOut("copilot"));
    const status = await finish("status", 1, p => { expect(existsSync(join(p.cwd, ".copilot/config.json"))).toBe(false); p.print("Error: No authentication information found.", "stderr"); });
    expect(status.args).toEqual(PROVIDER_AUTH.copilot.status);
    expect(await out.done).toMatchObject({ phase: "disconnected", connection: null });
    expect(processes.flatMap(p => p.args).filter(a => /logout/.test(a))).toEqual([]);
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
  it("refuses sign-out until a released lease has written its refresh back, so the vault is never recreated", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    const lease = await m.acquire("cursor");
    writeFileSync(tokenFile("cursor"), JSON.stringify({ id: "u1", refreshed: true }));
    let unblock: (() => void) | null = null;
    vi.spyOn(cipher, "encrypt").mockImplementationOnce(async text => { await new Promise<void>(resolve => { unblock = resolve; }); return fakeCipher().encrypt(text); });
    const released = lease.release();
    for (let i = 0; i < 50 && !unblock; i++) await flush();
    expect(await m.signOut("cursor")).toEqual(expect.objectContaining({ ok: false, reason: "stop_required" }));
    expect(await m.signIn("cursor", 7)).toEqual(expect.objectContaining({ ok: false, reason: "stop_required" }));
    unblock!(); await released;
    const out = started(await m.signOut("cursor"));
    await finish("status", 0);
    expect(await out.done).toMatchObject({ phase: "disconnected" });
    expect(await storage.loadVault("cursor")).toBeNull();
  });
  it("unverifies the connection with a storage error when a lease's refresh cannot be written back", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    const lease = await m.acquire("cursor");
    writeFileSync(tokenFile("cursor"), JSON.stringify({ id: "u1", refreshed: true }));
    vi.spyOn(cipher, "encrypt").mockRejectedValueOnce(new Error("user denied keychain access"));
    await lease.release();
    expect(existsSync(tokenFile("cursor"))).toBe(false);
    expect(m.state("cursor")).toMatchObject({ phase: "connected", verified: false, error: { code: "storage_failed" } });
    await expect(m.acquire("cursor")).rejects.toThrow("unverified");
  });
  it("reports a check whose refresh cannot be written back as a storage error, not a verified connection", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    const check = started(await m.check("cursor"));
    vi.spyOn(cipher, "encrypt").mockRejectedValueOnce(new Error("user denied keychain access"));
    await finish("status", 0, p => writeToken(p, { id: "u1", refreshed: true }));
    expect(await check.done).toMatchObject({ phase: "connected", verified: false, error: { code: "storage_failed" } });
    // The status itself passed; the outcome still reports the write-back published after it.
    expect(await check.outcome).toBe("storage_failed");
  });
  it("reports each check's own outcome, apart from errors the state keeps", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    const ok = started(await m.check("cursor"));
    await finish("status", 0, p => writeToken(p, { id: "u1" }));
    expect(await ok.outcome).toBe("ok");
    const other = started(await m.check("cursor"));
    await finish("status", 0, p => writeToken(p, { id: "u2" }));
    expect(await other.outcome).toBe("account_mismatch");
    // A failed sign-out stays the shown error; a check that then fails is still a failed check.
    const metadata = storage.readMetadata();
    storage.writeMetadata({ ...metadata, signOutFailed: ["cursor"] });
    const restarted = manager(); await restarted.load();
    expect(restarted.state("cursor").error).toEqual({ code: "sign_out_failed" });
    const failing = started(await restarted.check("cursor"));
    await finish("status", 1);
    expect(await failing.outcome).toBe("check_failed");
    expect(restarted.state("cursor").error).toEqual({ code: "sign_out_failed" });
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
  it("keeps the stored credential when a crash left only an interrupted temporary write", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    mkdirSync(dirname(tokenFile("cursor")), { recursive: true });
    writeFileSync(`${tokenFile("cursor")}.abc.tmp`, "partial");
    const restarted = manager(); await restarted.load();
    expect(await storage.loadVault("cursor")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify({ id: "u1" })) });
    expect(existsSync(`${tokenFile("cursor")}.abc.tmp`)).toBe(false);
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

describe("stale sign-in link directories", () => {
  const hour = 60 * 60 * 1000;
  let tmp: string, outside: string;
  const dir = (name: string, ageMs = 2 * hour) => {
    const path = join(tmp, name); mkdirSync(path); writeFileSync(join(path, "links"), "https://claude.com/x\n");
    const old = new Date(Date.now() - ageMs); utimesSync(path, old, old); return path;
  };
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "doan-auth-tmp-")); outside = mkdtempSync(join(tmpdir(), "doan-auth-outside-")); writeFileSync(join(outside, "keep"), "x"); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });

  it("removes only doan's own old directories left by a crash", () => {
    const stale = dir("doan-auth-link-abc"), other = dir("not-doan-auth-link-abc"), file = join(tmp, "doan-auth-link-file");
    writeFileSync(file, "x");
    removeStaleLinkDirs(tmp);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(other)).toBe(true); expect(existsSync(file)).toBe(true);
  });
  it("keeps a recent directory, which another running doan may still be using", () => {
    const live = dir("doan-auth-link-live", 60_000);
    removeStaleLinkDirs(tmp);
    expect(existsSync(live)).toBe(true);
  });
  it("does not follow a symlink with doan's prefix", () => {
    symlinkSync(outside, join(tmp, "doan-auth-link-link"));
    removeStaleLinkDirs(tmp);
    expect(readFileSync(join(outside, "keep"), "utf8")).toBe("x");
  });
  it("leaves a directory owned by someone else", () => {
    const foreign = dir("doan-auth-link-foreign");
    removeStaleLinkDirs(tmp, (process.getuid?.() ?? 0) + 1);
    expect(existsSync(foreign)).toBe(true);
  });
  it("does not throw when the temporary directory cannot be read", () => {
    expect(() => removeStaleLinkDirs(join(tmp, "missing"))).not.toThrow();
  });
});
