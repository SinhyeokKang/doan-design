import { execFileSync } from "node:child_process";
import { accessSync, chmodSync, constants, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { AUTH_LINK_MARKER, BROWSER_HOOK } from "./antigravity";
import { AuthManager, hookLinks, removeStaleLinkDirs, spawnAuthProcess, type AuthProcess, type McpLogoutRequest, type Spawn } from "./manager";
import { PROVIDER_AUTH, type ProviderAuth } from "./providers";
import { AuthStorage, type Cipher } from "./storage";
import { fakeCipher } from "./fixtures/cipher";
import { PROVIDERS, type CheckResult, type Provider } from "./types";

type Step = "login" | "status" | "logout" | "acp" | "rpc";
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
  vault: ["creds/token.json"], plaintext: [], settings: { "conf/settings.json": '{"storeTokenPlaintext":true}' }, acpAuth: null, acp: null, verifyByRun: false, hookLink: null, loginClears: false, identity: null,
  parseStatus: run => run.code === 0 ? status(run.profileDir) : { status: "failed", code: "check_failed" },
});
// Antigravity's shape: sign-in, status and sign-out are ACP calls on one server binary.
const acpProvider = (): ProviderAuth => ({
  command: "fake-server", args: [], env: {}, login: [], status: [], logout: null, vault: ["creds/token.json"], plaintext: [], settings: {},
  acpAuth: { method: "oauth-personal", agent: "fake-acp", version: "1.3.0" }, acp: { args: [], authenticate: "oauth-personal", sessions: "sessions" }, verifyByRun: false, hookLink: null, loginClears: false, identity: null,
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
  vault: null, plaintext: ["auth.json"], settings: {}, acpAuth: null, acp: null, verifyByRun: false, hookLink: null, loginClears: false, identity: null, parseStatus: run => run.code === 0 ? status() : { status: "failed", code: "check_failed" },
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
// The real timer, captured before any test fakes timers: the helpers that wait for fake processes keep working while a
// test holds the product's own timers still.
const realTimeout = setTimeout;
const flush = () => new Promise(resolve => realTimeout(resolve, 0));
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
    const step: Step = options.input ? (args.includes("app-server") ? "rpc" : "acp") : args.includes("login") ? "login" : args.includes("logout") ? "logout" : "status";
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
  const signedInAntigravity = async (m: AuthManager) => {
    const run = started(await m.signIn("antigravity", 7));
    const login = await acpRequest("initialize"); login.reply("initialize", INIT);
    await acpRequest("authenticate"); writeToken(login, { id: "g1" }); login.reply("authenticate", {});
    const status = await acpRequest("initialize"); status.reply("initialize", INIT);
    await acpRequest("authenticate"); status.reply("authenticate", {});
    await run.done;
  };
  // An Antigravity sign-in failure left nothing in the app's log (2026-11-01). Its log now says why the exchange ended and
  // which server events led there, as Doan's own categories only: the server's messages, RPC error text, payloads and
  // traceback lines can hold the sign-in link, the account and tokens, and are never printed.
  describe("ACP sign-in diagnostics", () => {
    let errors: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { errors = vi.spyOn(console, "error").mockImplementation(() => {}); });
    afterEach(() => errors.mockRestore());
    const logged = () => errors.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n");
    // A server log line as the 1.3.0 server writes it (absl: level+date, time, thread, file:line]).
    const glog = (level: string, at: string, text: string) => `${level}1101 17:21:04.433963 8505041280 ${at}] ${text}\n`;
    const SENTINELS = ["SENT_A", "SENT_B", "SENT_C", "SENT_D", "SENT_E", "SENT_F", "SENT_G", "SENT_H", "SENT_I", "SENT_J", "SENT_K", "SENT_L", "SENT_M", "SENT_N",
      "accounts.google.com", "example.com", "Onboarding failed", "client_secret", "Traceback"];
    const leaksNothing = (text: string) => { for (const secret of SENTINELS) expect(text).not.toContain(secret); };
    const serverLines = (p: FakeProcess) => {
      p.print(`${AUTH_LINK_MARKER}${googleLink(4321)}\n`, "stderr");
      p.print(`Open the following link to authenticate the ACP server: ${googleLink(4321)}\n`, "stderr");
      p.print(glog("I", "credential_manager.py:529", "Access token expired. Refreshing silently..."), "stderr");
      p.print(glog("I", "onboard.py:142", "loadCodeAssist response: {'upgradeSubscriptionUri': 'https://accounts.google.com/AccountChooser?Email=SENT_H%40example.com'}"), "stderr");
      p.print(glog("E", "oauth_manager.py:77", "Token exchange failed: {'client_secret': 'SENT_C', 'state': 'SENT_D', 'code': 'SENT_E'}"), "stderr");
      p.print(glog("W", "credential_manager.py:12", "accessToken=SENT_F refreshToken=SENT_G for SENT_B@example.com"), "stderr");
      p.print("Traceback (most recent call last):\n  File \"oauth.py\", line 3, in exchange: client_secret='SENT_I'\nValueError: ada@SENT_J.com\n", "stderr");
      // Chunks split inside a line, and inside a secret.
      p.print(glog("I", "server.py:2895", "Signing out after onboarding_failed: user SEN").trimEnd(), "stderr");
      p.print("T_K is unusable.\n", "stderr");
      p.print(glog("E", "storage.py:9", "Failed to save credentials to SEN").trimEnd(), "stderr");
      p.print("T_L\n", "stderr");
      p.print(glog("E", "onboard.py:150", `${"x".repeat(5000)}SENT_M`), "stderr");
    };

    it("logs a refused authenticate by its code only, never the server's message or data", async () => {
      const m = manager({ adapters: withAcp() }); await m.load();
      const run = started(await m.signIn("antigravity", 7));
      const login = await acpRequest("initialize"); login.reply("initialize", INIT);
      await acpRequest("authenticate");
      const request = login.requests().find(r => r.method === "authenticate")!;
      login.print(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32000,
        message: "Onboarding failed: loadCodeAssist response: {'upgradeSubscriptionUri': 'https://accounts.google.com/AccountChooser?Email=SENT_A'}",
        data: { message: "Signed in as SENT_B@example.com", reason: "onboarding_failed" } } }) + "\n");
      expect(await run.done).toMatchObject({ phase: "error", error: { code: "sign_in_failed" } });
      const text = logged();
      expect(text).toContain("doan: antigravity sign-in failed: the server refused authenticate (code -32000)");
      leaksNothing(text);
    });
    it("logs recognized server events by Doan's own wording and withholds every other line", async () => {
      const m = manager({ adapters: withAcp() }); await m.load();
      const run = started(await m.signIn("antigravity", 7));
      const login = await acpRequest("initialize"); login.reply("initialize", INIT);
      await acpRequest("authenticate");
      login.print(glog("I", "main.py:118", "Starting AGY ACP Server..."), "stderr");
      serverLines(login);
      login.finish(1);
      expect(await run.done).toMatchObject({ phase: "error", error: { code: "sign_in_failed" } });
      const text = logged();
      expect(text).toContain("doan: antigravity sign-in failed: the server exited (code 1)");
      expect(text).toContain("17:21:04 main.py:118 server started");
      expect(text).toContain("17:21:04 credential_manager.py:529 refreshing the stored credential");
      expect(text).toContain("17:21:04 server.py:2895 server signed out after onboarding_failed");
      expect(text).toContain("17:21:04 E oauth_manager.py:77 (message withheld)");
      expect(text).toContain("17:21:04 W credential_manager.py:12 (message withheld)");
      expect(text).toContain("17:21:04 E storage.py:9 (message withheld)");
      expect(text).toContain("17:21:04 E onboard.py:150 (message withheld)");
      expect(text).toMatch(/\(\d+ other lines withheld\)/);
      leaksNothing(text);
    });
    it("logs why the status check after a completed authenticate found no login", async () => {
      const m = manager({ adapters: withAcp() }); await m.load();
      const run = started(await m.signIn("antigravity", 7));
      const login = await acpRequest("initialize"); login.reply("initialize", INIT);
      await acpRequest("authenticate"); writeToken(login, { id: "g1" }); login.reply("authenticate", {});
      const status = await acpRequest("initialize"); status.reply("initialize", INIT);
      await acpRequest("authenticate");
      status.print(glog("I", "credential_manager.py:561", "Credentials missing or invalid. Launching browser login flow..."), "stderr");
      serverLines(status);
      expect(await run.done).toMatchObject({ phase: "error", error: { code: "sign_in_failed" } });
      const text = logged();
      expect(text).toContain("doan: antigravity status check found no usable login: the server asked for a new browser sign-in");
      expect(text).toContain("17:21:04 credential_manager.py:561 no usable stored credential; browser sign-in started");
      leaksNothing(text);
    });
    it("logs a status check the time limit stopped", async () => {
      const m = manager({ adapters: withAcp(), statusTimeoutMs: 20 }); await m.load();
      const run = started(await m.signIn("antigravity", 7));
      const login = await acpRequest("initialize"); login.reply("initialize", INIT);
      await acpRequest("authenticate"); writeToken(login, { id: "g1" }); login.reply("authenticate", {});
      const status = await acpRequest("initialize");
      status.print(glog("I", "main.py:118", "Starting AGY ACP Server..."), "stderr");
      status.reply("initialize", INIT);
      await acpRequest("authenticate");
      expect(await run.done).toMatchObject({ phase: "error", error: { code: "sign_in_failed" } });
      const text = logged();
      expect(text).toContain("doan: antigravity status check failed: the server was stopped after 20 ms without an answer");
      expect(text).toContain("17:21:04 main.py:118 server started");
    });
    it("names the expected server, not the reported one, when the server is not the pinned agent", async () => {
      const m = manager({ adapters: withAcp() }); await m.load();
      const run = started(await m.signIn("antigravity", 7));
      (await acpRequest("initialize")).reply("initialize", { ...INIT, agentInfo: { name: "SENT_N", version: "SENT_N" } });
      expect(await run.done).toMatchObject({ phase: "error", error: { code: "sign_in_failed" } });
      const text = logged();
      expect(text).toContain("doan: antigravity sign-in failed: the server is not fake-acp 1.3.0");
      leaksNothing(text);
    });
    it("logs nothing for a cancelled sign-in", async () => {
      const m = manager({ adapters: withAcp() }); await m.load();
      const run = started(await m.signIn("antigravity", 7));
      const login = await acpRequest("initialize"); login.reply("initialize", INIT);
      await acpRequest("authenticate");
      await m.cancel("antigravity", run.attemptId, 7);
      expect(await run.done).toMatchObject({ phase: "disconnected", attempt: null });
      expect(errors).not.toHaveBeenCalled();
    });
    const refusal = (p: FakeProcess, method: string) => {
      const request = p.requests().filter(r => r.method === method).at(-1)!;
      p.print(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32000, message: "Logout failed for SENT_A https://accounts.google.com/?state=SENT_D",
        data: { message: "SENT_B@example.com client_secret=SENT_C" } } }) + "\n");
    };
    it.each(["logout", "initialize"])("logs a server logout whose %s was refused by its code only, and still signs out", async method => {
      const m = manager({ adapters: withAcp() }); await m.load();
      await signedInAntigravity(m);
      const out = started(await m.signOut("antigravity"));
      const logout = await acpRequest("initialize");
      if (method === "logout") { logout.reply("initialize", INIT); await acpRequest("logout"); }
      logout.print(glog("E", "server.py:3001", "Logout failed: {'client_secret': 'SENT_C'}"), "stderr");
      refusal(logout, method);
      const after = await acpRequest("initialize"); after.reply("initialize", INIT); await acpRequest("authenticate");
      after.print(`${AUTH_LINK_MARKER}${googleLink(4321)}\n`, "stderr");
      expect(await out.done).toMatchObject({ phase: "disconnected", connection: null });
      expect(await storage.loadVault("antigravity")).toBeNull();
      const text = logged();
      expect(text).toContain(`doan: antigravity server logout failed; removing Doan's copy: the server refused ${method} (code -32000)`);
      expect(text).toContain("17:21:04 E server.py:3001 (message withheld)");
      leaksNothing(text);
    });
  });
  // Fake clocks pin both limits of an exchange: initialize has 60 s, and the caller's limit starts at its answer.
  describe("ACP exchange time limits", () => {
    const settle = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
    let errors: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { errors = vi.spyOn(console, "error").mockImplementation(() => {}); });
    afterEach(() => { vi.useRealTimers(); errors.mockRestore(); });

    it("stops a sign-in whose server never answers initialize after 60 s", async () => {
      const m = manager({ adapters: withAcp() }); await m.load();
      vi.useFakeTimers();
      const run = started(await m.signIn("antigravity", 7));
      await settle();
      const login = processes.at(-1)!;
      expect(login.requests().map(r => r.method)).toEqual(["initialize"]);
      await vi.advanceTimersByTimeAsync(59_999);
      expect(login.stopped).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(login.stopped).toBe(true);
      expect(await run.done).toMatchObject({ phase: "error", error: { code: "sign_in_failed" } });
      expect(errors.mock.calls.map((call: unknown[]) => call.join(" ")).join("\n")).toContain("doan: antigravity sign-in failed: the server did not answer initialize within 60000 ms");
    });
    it("gives a server logout 20 s from its initialize answer, however late that answer comes", async () => {
      const m = manager({ adapters: withAcp(), statusTimeoutMs: 20_000 }); await m.load();
      await signedInAntigravity(m);
      vi.useFakeTimers();
      const out = started(await m.signOut("antigravity"));
      await settle();
      const logout = processes.at(-1)!;
      expect(logout.requests().map(r => r.method)).toEqual(["initialize"]);
      await vi.advanceTimersByTimeAsync(59_999);
      expect(logout.stopped).toBe(false);
      logout.reply("initialize", INIT); await settle();
      expect(logout.requests().at(-1)?.method).toBe("logout");
      await vi.advanceTimersByTimeAsync(19_999);
      expect(logout.stopped).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(logout.stopped).toBe(true);
      await settle();
      expect(errors.mock.calls.map((call: unknown[]) => call.join(" ")).join("\n")).toContain("server logout failed; removing Doan's copy: the server was stopped after 20000 ms without an answer");
      vi.useRealTimers();
      const after = await acpRequest("initialize"); after.reply("initialize", INIT); await acpRequest("authenticate");
      after.print(`${AUTH_LINK_MARKER}${googleLink(4321)}\n`, "stderr");
      expect(await out.done).toMatchObject({ phase: "disconnected", connection: null });
    });
  });
  it("counts the status check's time limit from the server's initialize answer, not from its start", async () => {
    // Under heavy load (load average ~120 to ~190 on 8 cores) the 278 MB server took about 30 s to answer initialize, so a
    // status check whose limit also covered the server's start failed a sign-in the user had just approved (2026-11-01).
    const m = manager({ adapters: withAcp(), statusTimeoutMs: 30 }); await m.load();
    const run = started(await m.signIn("antigravity", 7));
    const login = await acpRequest("initialize"); login.reply("initialize", INIT);
    await acpRequest("authenticate"); writeToken(login, { id: "g1" }); login.reply("authenticate", {});
    const status = await acpRequest("initialize");
    await new Promise(resolve => setTimeout(resolve, 80));
    expect(status.stopped).toBe(false);
    status.reply("initialize", INIT);
    await acpRequest("authenticate"); status.reply("authenticate", {});
    expect(await run.done).toMatchObject({ phase: "connected", verified: true });
    expect(await storage.loadVault("antigravity")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify({ id: "g1" })) });
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
      // The rejected link is read by the 100 ms poll before it can be logged, so the timeout stays above it.
      const m = manager({ hookLinkTimeoutMs: 500, onPrompt: prompt => prompts.push(prompt), adapters: { ...withAcp(), claude: hooked() } }); await m.load();
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
  // Fix round 1, R-A-1: nothing that can fail runs after the vault and metadata name the new login.
  it("keeps the previous connection, vault and metadata when the working copy cannot be removed before the commit", async () => {
    const m = manager(); await m.load();
    const first = await signedInCursor(m, "u1");
    const scrub = storage.scrub.bind(storage); let calls = 0;
    const spy = vi.spyOn(storage, "scrub").mockImplementation((provider, rels) => { if (++calls === 2) throw new Error("EACCES"); scrub(provider, rels); });
    const run = started(await m.signIn("cursor", 7));
    await finish("login", 0, p => writeToken(p, { id: "u2" }));
    await finish("status", 0);
    const state = await run.done;
    spy.mockRestore();
    expect(state).toMatchObject({ connection: first.connection, verified: true, error: { code: "storage_failed" } });
    expect(storage.readMetadata().accounts).toEqual([first.connection]);
    expect(await storage.loadVault("cursor")).toEqual(vaultU1);
    expect(existsSync(tokenFile("cursor"))).toBe(false);
  });
  it("stores nothing for a first sign-in whose working copy cannot be removed before the commit", async () => {
    const m = manager(); await m.load();
    const scrub = storage.scrub.bind(storage); let calls = 0;
    const spy = vi.spyOn(storage, "scrub").mockImplementation((provider, rels) => { if (++calls === 2) throw new Error("EACCES"); scrub(provider, rels); });
    const state = await signedInCursor(m, "u1");
    spy.mockRestore();
    expect(state).toMatchObject({ connection: null, error: { code: "storage_failed" } });
    expect(storage.readMetadata().accounts).toEqual([]);
    expect(await storage.loadVault("cursor")).toBeNull();
  });
  it("unverifies the previous connection when the previous vault cannot be restored after a failed metadata write", async () => {
    const m = manager(); await m.load();
    const first = await signedInCursor(m, "u1");
    const write = vi.spyOn(storage, "writeMetadata").mockImplementation(() => { throw new Error("disk full"); });
    const store = storage.storeSealed.bind(storage); let calls = 0;
    const restore = vi.spyOn(storage, "storeSealed").mockImplementation((provider, sealed) => { if (++calls === 2) throw new Error("EIO"); store(provider, sealed); });
    const run = started(await m.signIn("cursor", 7));
    await finish("login", 0, p => writeToken(p, { id: "u2" }));
    await finish("status", 0);
    const state = await run.done;
    write.mockRestore(); restore.mockRestore();
    expect(state).toMatchObject({ connection: first.connection, verified: false, error: { code: "storage_failed" } });
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
  describe("a provider whose login clears the profile first (Codex, D22)", () => {
    const codex = () => manager({ adapters: { ...withAcp(), codex: { ...keychainProvider(() => keychain), settings: { "skills/doan/SKILL.md": "stub" }, loginClears: true } } });
    const profiles = () => readdirSync(join(root, "profiles")).filter(name => name.startsWith("codex")).sort();
    async function connectedCodex(m: AuthManager) {
      keychain = { status: "connected", account: { id: null, workspace: null } };
      const first = started(await m.signIn("codex", 7)); await finish("login", 0); await finish("status", 0);
      return (await first.done).connection!;
    }
    it("signs a first connection in to the provider's own profile", async () => {
      const m = codex(); await m.load();
      expect(await connectedCodex(m)).toMatchObject({ profile: "codex" });
      expect(processes[0]!.cwd).toBe(storage.profileDir("codex"));
    });
    it("leaves the stored login untouched and removes the staging profile when a replacement is cancelled or fails", async () => {
      const m = codex(); await m.load();
      const connection = await connectedCodex(m);
      const cancelled = started(await m.signIn("codex", 7));
      const login = await next("login");
      // The replacement never runs in the stored connection's profile, which its login would log out first.
      expect(login.cwd).not.toBe(storage.profileDir("codex"));
      expect(login.env.CODEX_HOME).toBe(login.cwd);
      expect(readFileSync(join(login.cwd, "skills/doan/SKILL.md"), "utf8")).toBe("stub");
      await m.cancel("codex", cancelled.attemptId, 7);
      const cleanup = await finish("logout", 0);
      expect(cleanup.cwd).toBe(login.cwd);
      expect(await cancelled.done).toMatchObject({ phase: "connected", connection, verified: true, error: null });
      const failed = started(await m.signIn("codex", 7));
      const second = await finish("login", 1);
      expect((await finish("logout", 0)).cwd).toBe(second.cwd);
      expect(await failed.done).toMatchObject({ phase: "connected", connection, verified: true, error: { code: "sign_in_failed" } });
      expect(profiles()).toEqual(["codex"]);
      expect(processes.filter(p => p.step === "logout" && p.cwd === storage.profileDir("codex"))).toEqual([]);
      expect(storage.readMetadata().accounts).toEqual([connection]);
    });
    it("moves the connection to the staging profile on success, then logs the previous profile out and removes it", async () => {
      const m = codex(); await m.load();
      const previous = await connectedCodex(m);
      const run = started(await m.signIn("codex", 7));
      const login = await finish("login", 0);
      const staged = login.cwd.split("/").at(-1)!;
      expect((await finish("status", 0)).cwd).toBe(login.cwd);
      const old = await finish("logout", 0);
      expect(old.cwd).toBe(storage.profileDir("codex"));
      expect(old.env.CODEX_HOME).toBe(storage.profileDir("codex"));
      const state = await run.done;
      expect(state).toMatchObject({ phase: "connected", verified: true, connection: { profile: staged } });
      expect(state.connection!.connectionId).not.toBe(previous.connectionId);
      expect(storage.readMetadata().accounts).toEqual([state.connection]);
      expect(profiles()).toEqual([staged]);
      // Checks and runs follow the connection's profile.
      const check = started(await m.check("codex"));
      expect((await finish("status", 0)).cwd).toBe(login.cwd);
      await check.done;
      const lease = await m.acquire("codex");
      expect(lease.profileDir).toBe(login.cwd); expect(lease.env.CODEX_HOME).toBe(login.cwd);
      await lease.release();
      // A later replacement leaves that profile the same way.
      const again = started(await m.signIn("codex", 7));
      const next2 = await finish("login", 0); await finish("status", 0);
      expect((await finish("logout", 0)).cwd).toBe(login.cwd);
      expect((await again.done).connection!.profile).toBe(next2.cwd.split("/").at(-1));
      expect(profiles()).toEqual([next2.cwd.split("/").at(-1)]);
    });
    // Fix round 1, R-A-2/R-A-3: a staged or replaced profile goes only after its logout succeeded, and a record of it
    // outlives a crash or a failed logout until a later start finishes the cleanup.
    it("records the staging profile before its login and keeps it with its record when the cleanup logout fails", async () => {
      const m = codex(); await m.load();
      const connection = await connectedCodex(m);
      for (const code of [1, null]) {
        const run = started(await m.signIn("codex", 7));
        const login = await next("login");
        const staged = login.cwd.split("/").at(-1)!;
        expect(storage.pendingCleanup()).toContainEqual({ provider: "codex", profile: staged });
        await m.cancel("codex", run.attemptId, 7);
        await finish("logout", code);
        expect(await run.done).toMatchObject({ connection, verified: true });
        expect(existsSync(login.cwd)).toBe(true);
        expect(storage.pendingCleanup()).toContainEqual({ provider: "codex", profile: staged });
      }
    });
    it("removes a staging profile's record with the profile once its logout succeeds, and the staged profile's on success", async () => {
      const m = codex(); await m.load();
      await connectedCodex(m);
      const cancelled = started(await m.signIn("codex", 7));
      await next("login"); await m.cancel("codex", cancelled.attemptId, 7); await finish("logout", 0); await cancelled.done;
      expect(storage.pendingCleanup()).toEqual([]);
      const run = started(await m.signIn("codex", 7));
      await finish("login", 0); await finish("status", 0); await finish("logout", 0);
      await run.done;
      expect(storage.pendingCleanup()).toEqual([]);
    });
    it("keeps a replaced profile and its record when its logout fails, and finishes the cleanup at the next start", async () => {
      const m = codex(); await m.load();
      await connectedCodex(m);
      const run = started(await m.signIn("codex", 7));
      const login = await finish("login", 0); await finish("status", 0);
      await finish("logout", 1);
      const state = await run.done;
      expect(state).toMatchObject({ phase: "connected", verified: true, connection: { profile: login.cwd.split("/").at(-1) } });
      expect(existsSync(storage.profileDir("codex"))).toBe(true);
      expect(storage.pendingCleanup()).toEqual([{ provider: "codex", profile: "codex" }]);
      const restarted = codex(); await restarted.load();
      // The cleanup holds the one write slot, so no sign-in can share the profile it logs out.
      expect(await restarted.signIn("claude", 7)).toEqual(expect.objectContaining({ ok: false, reason: "busy" }));
      const retry = await finish("logout", 0);
      expect(retry.cwd).toBe(join(root, "profiles", "codex"));
      await vi.waitFor(() => expect(storage.pendingCleanup()).toEqual([]));
      expect(readdirSync(join(root, "profiles")).filter(name => name.startsWith("codex"))).toEqual([login.cwd.split("/").at(-1)]);
      expect(processes.filter(p => p.step === "logout" && p.cwd === login.cwd)).toEqual([]);
    });
    it("logs out a staging profile abandoned by a crash at the next start, never the stored connection's profile", async () => {
      const m = codex(); await m.load();
      await connectedCodex(m);
      started(await m.signIn("codex", 7));
      const login = await next("login");
      settledSet.add(login);
      // The app dies here; the next start sees the record and the stored connection.
      const restarted = codex(); await restarted.load();
      const cleanup = await finish("logout", 0);
      expect(cleanup.cwd).toBe(login.cwd);
      await vi.waitFor(() => expect(storage.pendingCleanup()).toEqual([]));
      expect(existsSync(login.cwd)).toBe(false);
      expect(existsSync(storage.profileDir("codex"))).toBe(true);
      expect(processes.filter(p => p.step === "logout" && p.cwd === storage.profileDir("codex"))).toEqual([]);
    });
    it("skips a record that names the stored connection's profile", async () => {
      const m = codex(); await m.load();
      await connectedCodex(m);
      storage.markCleanup("codex", "codex");
      const restarted = codex(); await restarted.load();
      await flush(); await flush();
      expect(processes.filter(p => p.step === "logout")).toEqual([]);
      expect(storage.pendingCleanup()).toEqual([{ provider: "codex", profile: "codex" }]);
    });
    // Fix round 2, R-A2-1: only a profile a stored connection references is live; a signed-out provider's own name is not.
    it("cleans a replaced base profile at the next start after the connection that replaced it signed out", async () => {
      const m = codex(); await m.load();
      await connectedCodex(m);
      const replacement = started(await m.signIn("codex", 7)); await finish("login", 0); await finish("status", 0); await finish("logout", 1); await replacement.done;
      const out = started(await m.signOut("codex")); await finish("logout", 0); keychain = { status: "disconnected" }; await finish("status", 0); await out.done;
      expect(storage.readMetadata().accounts).toEqual([]);
      expect(storage.pendingCleanup()).toEqual([{ provider: "codex", profile: "codex" }]);
      const restarted = codex(); await restarted.load();
      const retry = await finish("logout", 0);
      expect(retry.cwd).toBe(join(root, "profiles", "codex"));
      await vi.waitFor(() => expect(storage.pendingCleanup()).toEqual([]));
      expect(existsSync(join(root, "profiles", "codex"))).toBe(false);
    });
    // Fix round 2, R-A2-2: a staging profile that could not be recorded is never created.
    it("fails the replacement without a staging profile or any process when its cleanup record cannot be written", async () => {
      const m = codex(); await m.load();
      const connection = await connectedCodex(m);
      const spy = vi.spyOn(storage, "markCleanup").mockImplementation(() => { throw new Error("ENOSPC"); });
      const before = processes.length;
      const run = started(await m.signIn("codex", 7));
      const state = await run.done;
      spy.mockRestore();
      expect(processes.slice(before)).toEqual([]);
      expect(profiles()).toEqual(["codex"]);
      expect(state).toMatchObject({ phase: "connected", connection, verified: true, error: { code: "storage_failed" } });
    });
    for (const content of ["{bad", '{"v":2,"profiles":[]}', '{"v":1,"profiles":[{"provider":"codex","profile":"../codex"}]}']) {
      it(`leaves a damaged cleanup record file as it is and starts no logout: ${content}`, async () => {
        writeFileSync(join(root, "cleanup.json"), content);
        const m = codex(); await m.load(); await flush();
        expect(processes).toEqual([]);
        expect(() => storage.pendingCleanup()).toThrow();
        expect(() => storage.markCleanup("codex", "codex-test")).toThrow();
        expect(readFileSync(join(root, "cleanup.json"), "utf8")).toBe(content);
      });
    }
    it("signs out the connection's own profile", async () => {
      const m = codex(); await m.load();
      await connectedCodex(m);
      const run = started(await m.signIn("codex", 7)); const login = await finish("login", 0); await finish("status", 0); await finish("logout", 0); await run.done;
      const out = started(await m.signOut("codex"));
      expect((await finish("logout", 0)).cwd).toBe(login.cwd);
      keychain = { status: "disconnected" };
      expect((await finish("status", 0)).cwd).toBe(login.cwd);
      expect(await out.done).toMatchObject({ phase: "disconnected", connection: null });
    });
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
  // buzz-settings R2: Home lists models right after a sign-in. A list read holds a lease but is not a conversation, so
  // a sign-out must not ask the person to stop conversations; it stops the read itself and waits for its group.
  it("a model list read does not need stop: sign-out stops the read, waits for its lease, then signs out", async () => {
    let stopRuns!: ReturnType<typeof runs>["stopRuns"];
    const m = manager({ stopRuns: provider => stopRuns(provider) }); await m.load();
    await signedInCursor(m, "u1");
    const r = runs(m); stopRuns = r.stopRuns;
    r.leases.push(await m.acquire("cursor", "listing"));
    const out = started(await m.signOut("cursor"));
    expect(r.stopRuns).toHaveBeenCalledWith("cursor");
    const status = await next("status");
    expect(r.leases).toEqual([]);
    settledSet.add(status); status.finish(0);
    expect(await out.done).toMatchObject({ phase: "disconnected", connection: null });
  });
  it("a conversation run still needs stop when a model list read is also running", async () => {
    const m = manager(); await m.load();
    await signedInCursor(m, "u1");
    await m.acquire("cursor", "listing"); await m.acquire("cursor");
    expect(await m.signOut("cursor")).toEqual(expect.objectContaining({ ok: false, reason: "stop_required" }));
  });
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

describe("profile doan stub", () => {
  it("rewrites a stale or edited stub with the bundled bytes on every run", async () => {
    const settings = PROVIDER_AUTH.cursor.settings, rel = ".cursor/skills/doan/SKILL.md";
    const bundled = readFileSync(join(__dirname, "../onboarding/SKILL.md"), "utf8");
    expect(settings).toEqual({ [rel]: bundled });
    const m = manager({ adapters: { ...withAcp(), cursor: { ...fileProvider(tokenAccount), settings } } }); await m.load();
    const path = join(storage.profileDir("cursor"), rel); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, readFileSync(join(__dirname, "../onboarding/fixtures/SKILL-c994913.md")));
    await signedInCursor(m, "u1");
    expect(readFileSync(join(processes[0]!.cwd, rel), "utf8")).toBe(bundled);
    writeFileSync(path, "edited");
    const check = started(await m.check("cursor"));
    await finish("status", 0, p => expect(readFileSync(join(p.cwd, rel), "utf8")).toBe(bundled));
    await check.done;
  });
});

describe("account identity lookup", () => {
  const ACCESS = "ya29.ACCESS-SENTINEL";
  const GOOGLE_TOKEN = { client_id: "cid.apps.googleusercontent.com", client_secret: "CLIENT-SECRET", refresh_token: "1//REFRESH-SENTINEL",
    token_uri: "https://oauth2.googleapis.com/token", scopes: ["https://www.googleapis.com/auth/userinfo.email", "openid"], project_id: "p-1" };
  const CHATGPT = (email = "ada@example.com") => ({ account: { type: "chatgpt", email, planType: "free" }, requiresOpenaiAuth: true });
  const NONE = { id: null, workspace: null };
  type Reply = { status?: number; body?: unknown } | "hang" | "reject";
  // Google's two endpoints; "hang" answers only the abort signal, as fetch does.
  const googleFetch = (token: Reply = { body: { access_token: ACCESS, expires_in: 3599, token_type: "Bearer" } }, info: Reply = { body: { sub: "1", email: "ada@gmail.example", email_verified: true } }) =>
    vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const reply = String(url) === "https://oauth2.googleapis.com/token" ? token : info;
      if (reply === "reject") throw new TypeError("fetch failed");
      if (reply === "hang") return new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
    });
  const adapters = () => ({ ...withAcp(), codex: { ...keychainProvider(() => keychain), identity: "codex-app-server" as const }, antigravity: { ...acpProvider(), identity: "google-userinfo" as const } });
  const lookupManager = (fetch: ReturnType<typeof googleFetch> = googleFetch(), over: Partial<ConstructorParameters<typeof AuthManager>[0]> = {}) => manager({ adapters: adapters(), fetch, ...over });
  const until = async (test: () => boolean, what: string) => { for (let i = 0; i < 200; i++) { if (test()) return; await flush(); } throw new Error(`no ${what}`); };
  // The next app-server: answers initialize, then account/read with reply.
  async function codexLookup(reply: unknown): Promise<FakeProcess> {
    const p = await next("rpc"); settledSet.add(p);
    await until(() => p.requests().some(r => r.method === "initialize"), "initialize");
    p.reply("initialize", { userAgent: "codex_app_server/0.164.0" });
    await until(() => p.requests().some(r => r.method === "account/read"), "account/read");
    p.reply("account/read", reply);
    return p;
  }
  const writeFile = (cwd: string, token: object | string) => {
    const path = join(cwd, "creds/token.json"); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, typeof token === "string" ? token : JSON.stringify(token));
  };
  // token null: the login leaves no working copy.
  async function antigravitySignIn(m: AuthManager, token: object | string | null = GOOGLE_TOKEN) {
    const run = started(await m.signIn("antigravity", 7));
    const login = await acpRequest("initialize"); login.reply("initialize", INIT);
    await acpRequest("authenticate"); if (token !== null) writeFile(login.cwd, token); login.reply("authenticate", {});
    const status = await acpRequest("initialize"); status.reply("initialize", INIT);
    await acpRequest("authenticate"); status.reply("authenticate", {});
    return run;
  }
  async function antigravityCheck(m: AuthManager) {
    const check = started(await m.check("antigravity"));
    const status = await acpRequest("initialize"); status.reply("initialize", INIT);
    await acpRequest("authenticate"); status.reply("authenticate", {});
    return check;
  }
  const storedCodex = (account: object = NONE) => storage.writeMetadata({ v: 1, accounts: [{ provider: "codex", connectionId: "c-1", profile: "codex", account: { ...NONE, ...account } }] });
  async function storedAntigravity(token: object | string | null = GOOGLE_TOKEN, account: object = NONE) {
    storage.writeMetadata({ v: 1, accounts: [{ provider: "antigravity", connectionId: "c-1", profile: "antigravity", account: { ...NONE, ...account } }] });
    if (token !== null) await storage.saveVault("antigravity", { "creds/token.json": Buffer.from(typeof token === "string" ? token : JSON.stringify(token)) });
  }
  let errors: ReturnType<typeof vi.spyOn>, warnings: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => {}); warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    keychain = { status: "connected", account: NONE };
  });
  afterEach(() => { vi.useRealTimers(); errors.mockRestore(); warnings.mockRestore(); });
  const logged = () => [...errors.mock.calls, ...warnings.mock.calls].map((call: unknown[]) => call.map(String).join(" ")).join("\n");

  it("looks up only Codex and Antigravity", () => {
    expect(Object.fromEntries(PROVIDERS.map(p => [p, PROVIDER_AUTH[p].identity]))).toEqual({ claude: null, codex: "codex-app-server", cursor: null, antigravity: "google-userinfo", copilot: null });
  });

  describe("Codex", () => {
    it("stores the account/read email with a new connection, read through the profile's own app-server", async () => {
      const m = lookupManager(); await m.load();
      const run = started(await m.signIn("codex", 7));
      await finish("login", 0); await finish("status", 0);
      const rpc = await codexLookup(CHATGPT());
      const state = await run.done;
      expect(state).toMatchObject({ phase: "connected", verified: true, error: null });
      expect(state.connection!.account).toEqual({ ...NONE, email: "ada@example.com" });
      expect(storage.readMetadata().accounts).toEqual([state.connection]);
      expect(rpc.args).toEqual(["-c", "store=keyring", "app-server"]);
      expect(rpc.cwd).toBe(storage.profileDir("codex")); expect(rpc.env.CODEX_HOME).toBe(storage.profileDir("codex"));
      expect(rpc.requests().map(r => r.method)).toEqual(["initialize", "initialized", "account/read"]);
      expect(rpc.requests()[0]!.params).toMatchObject({ clientInfo: { name: "doan" }, capabilities: { experimentalApi: true } });
      expect(rpc.requests().at(-1)!.params).toEqual({ refreshToken: false });
      expect(rpc.stopped).toBe(true);
    });
    it("looks a staged replacement up in the staging profile and never carries the previous email over", async () => {
      const m = manager({ adapters: { ...adapters(), codex: { ...adapters().codex, loginClears: true } }, fetch: googleFetch() }); await m.load();
      const first = started(await m.signIn("codex", 7));
      await finish("login", 0); await finish("status", 0); await codexLookup(CHATGPT("old@example.com"));
      expect((await first.done).connection!.account.email).toBe("old@example.com");
      const replaced = started(await m.signIn("codex", 7));
      const login = await finish("login", 0); await finish("status", 0);
      const rpc = await codexLookup(CHATGPT("new@example.com"));
      expect(rpc.cwd).toBe(login.cwd); expect(rpc.env.CODEX_HOME).toBe(login.cwd);
      await finish("logout", 0);
      expect((await replaced.done).connection!.account).toEqual({ ...NONE, email: "new@example.com" });
      // A replacement whose lookup fails stores no email rather than the replaced account's.
      const again = started(await m.signIn("codex", 7));
      await finish("login", 0); await finish("status", 0); await codexLookup({ account: null, requiresOpenaiAuth: true });
      await finish("logout", 0);
      const state = await again.done;
      expect(state).toMatchObject({ phase: "connected", verified: true, error: null });
      expect(state.connection!.account).toEqual(NONE);
      expect(storage.readMetadata().accounts[0]!.account).toEqual(NONE);
    });
    it("shows the email after a check of a connection stored without one, without writing metadata", async () => {
      storedCodex();
      const m = lookupManager(); await m.load();
      const write = vi.spyOn(storage, "writeMetadata");
      const check = started(await m.check("codex"));
      await finish("status", 0); await codexLookup(CHATGPT());
      expect(await check.outcome).toBe("ok");
      expect(m.state("codex")).toMatchObject({ phase: "connected", verified: true, connection: { account: { ...NONE, email: "ada@example.com" } } });
      expect(write).not.toHaveBeenCalled();
      expect(storage.readMetadata().accounts[0]!.account).toEqual(NONE);
    });
    it("keeps the email a check showed when a later lookup fails", async () => {
      storedCodex();
      const m = lookupManager(); await m.load();
      const first = started(await m.check("codex"));
      await finish("status", 0); await codexLookup(CHATGPT());
      await first.done;
      const second = started(await m.check("codex"));
      await finish("status", 0); await codexLookup({ account: null, requiresOpenaiAuth: true });
      expect(await second.outcome).toBe("ok");
      expect(m.state("codex").connection!.account).toEqual({ ...NONE, email: "ada@example.com" });
    });
    // Each way the app-server can fail leaves sign-in and check as they are without a lookup.
    const failures: [string, (p: FakeProcess) => Promise<void> | void][] = [
      ["exits before answering", p => p.finish(1)],
      ["refuses account/read", async p => {
        await until(() => p.requests().some(r => r.method === "initialize"), "initialize"); p.reply("initialize", {});
        await until(() => p.requests().some(r => r.method === "account/read"), "account/read");
        const id = p.requests().find(r => r.method === "account/read")!.id;
        p.print(JSON.stringify({ id, error: { code: -32600, message: "nope" } }) + "\n");
      }],
      ["answers with an API key account", async p => {
        await until(() => p.requests().some(r => r.method === "initialize"), "initialize"); p.reply("initialize", {});
        await until(() => p.requests().some(r => r.method === "account/read"), "account/read"); p.reply("account/read", { account: { type: "apiKey" }, requiresOpenaiAuth: true });
      }],
      ["breaks the protocol", p => p.print("not json\n")],
    ];
    it.each(failures)("signs in and checks without an email when the app-server %s", async (_name, fail) => {
      const m = lookupManager(); await m.load();
      const run = started(await m.signIn("codex", 7));
      await finish("login", 0); await finish("status", 0);
      let rpc = await next("rpc"); settledSet.add(rpc); await fail(rpc);
      const state = await run.done;
      expect(state).toMatchObject({ phase: "connected", verified: true, error: null });
      expect(state.connection!.account).toEqual(NONE);
      expect(rpc.stopped).toBe(true);
      const check = started(await m.check("codex"));
      await finish("status", 0);
      rpc = await next("rpc"); settledSet.add(rpc); await fail(rpc);
      expect(await check.outcome).toBe("ok");
      expect(m.state("codex")).toMatchObject({ phase: "connected", verified: true, error: null, connection: { account: NONE } });
      expect(logged()).toContain("doan: codex account lookup failed");
    });
    it("signs in and checks without an email when the app-server cannot be started", async () => {
      const m = lookupManager(); await m.load();
      spawn.mockImplementation((_command, args, options) => {
        if (args.includes("app-server")) throw new Error("spawn ENOENT");
        const p = new FakeProcess(args.includes("login") ? "login" : "status", args, options.env, options.cwd); processes.push(p); return p;
      });
      const run = started(await m.signIn("codex", 7));
      await finish("login", 0); await finish("status", 0);
      expect(await run.done).toMatchObject({ phase: "connected", verified: true, error: null, connection: { account: NONE } });
      const check = started(await m.check("codex"));
      await finish("status", 0);
      expect(await check.outcome).toBe("ok");
    });
    it("stops an app-server that does not answer within 5 s and keeps the sign-in and check results", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const m = lookupManager(); await m.load();
      const run = started(await m.signIn("codex", 7));
      await finish("login", 0); await finish("status", 0);
      let rpc = await next("rpc");
      await vi.advanceTimersByTimeAsync(4800);
      expect(rpc.stopped).toBe(false);
      await vi.advanceTimersByTimeAsync(400);
      expect(rpc.stopped).toBe(true);
      expect(await run.done).toMatchObject({ phase: "connected", verified: true, error: null, connection: { account: NONE } });
      const check = started(await m.check("codex"));
      await finish("status", 0);
      rpc = await next("rpc");
      await vi.advanceTimersByTimeAsync(5200);
      expect(rpc.stopped).toBe(true);
      expect(await check.outcome).toBe("ok");
    });
    it("counts the 5 s from the app-server start, not from locating the CLI", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let slow = false;
      const m = lookupManager(googleFetch(), { locate: async () => { if (slow) await new Promise(resolve => setTimeout(resolve, 3000)); return { command: "/bin/fake-cli", path: "/verified/bin" }; } });
      await m.load();
      const run = started(await m.signIn("codex", 7));
      await finish("login", 0); await finish("status", 0);
      slow = true;
      await vi.advanceTimersByTimeAsync(3000);
      const rpc = await next("rpc");
      await vi.advanceTimersByTimeAsync(4800);
      expect(rpc.stopped).toBe(false);
      await vi.advanceTimersByTimeAsync(400);
      expect(rpc.stopped).toBe(true);
      expect(await run.done).toMatchObject({ phase: "connected", verified: true, connection: { account: NONE } });
    });
    it("ends a sign-in cancelled during its app-server lookup at once and stops the app-server", async () => {
      const m = lookupManager(); await m.load();
      const run = started(await m.signIn("codex", 7));
      await finish("login", 0); await finish("status", 0);
      const rpc = await next("rpc");
      await m.cancel("codex", run.attemptId, 7);
      expect(await run.done).toMatchObject({ phase: "disconnected", attempt: null, connection: null });
      expect(rpc.stopped).toBe(true);
      expect(storage.readMetadata().accounts).toEqual([]);
    });
    it("commits or cancels a sign-in only after the app-server's process group is gone", async () => {
      stopReleases = false;
      const m = lookupManager(); await m.load();
      let committed = false;
      const run = started(await m.signIn("codex", 7));
      void run.done.then(() => { committed = true; });
      await finish("login", 0); await finish("status", 0);
      const rpc = await codexLookup(CHATGPT());
      await until(() => rpc.stopped, "stopped app-server");
      for (let i = 0; i < 20; i++) await flush();
      expect(committed).toBe(false);
      expect(storage.readMetadata().accounts).toEqual([]);
      rpc.release();
      expect((await run.done).connection!.account).toEqual({ ...NONE, email: "ada@example.com" });
      let cancelled = false;
      const again = started(await m.signIn("codex", 7));
      void again.done.then(() => { cancelled = true; });
      await finish("login", 0); await finish("status", 0);
      const second = await next("rpc");
      await m.cancel("codex", again.attemptId, 7);
      await until(() => second.stopped, "stopped app-server");
      for (let i = 0; i < 20; i++) await flush();
      expect(cancelled).toBe(false);
      second.release();
      expect(await again.done).toMatchObject({ phase: "connected", attempt: null, connection: { account: { email: "ada@example.com" } } });
    });
    it("leaves a check replaced by a sign-out stale, its lookup stopped", async () => {
      storedCodex({ email: "old@example.com" });
      const m = lookupManager(); await m.load();
      const check = started(await m.check("codex"));
      await finish("status", 0);
      const rpc = await next("rpc");
      const out = started(await m.signOut("codex"));
      await until(() => rpc.stopped, "stopped lookup");
      expect(await check.outcome).toBe("replaced");
      expect(m.state("codex")).toMatchObject({ phase: "signingOut", connection: { account: { email: "old@example.com" } } });
      keychain = { status: "disconnected" };
      await finish("logout", 0); await finish("status", 0);
      expect(await out.done).toMatchObject({ phase: "disconnected", connection: null });
      expect(processes.filter(p => p.step === "rpc")).toEqual([rpc]);
    });
  });

  describe("Antigravity", () => {
    it("stores the Google userinfo email with a new connection and keeps the access token in memory only", async () => {
      const fetch = googleFetch();
      const states: unknown[] = [];
      const m = lookupManager(fetch, { onChange: state => states.push(state) }); await m.load();
      const run = await antigravitySignIn(m);
      const state = await run.done;
      expect(state).toMatchObject({ phase: "connected", verified: true, error: null });
      expect(state.connection!.account).toEqual({ ...NONE, email: "ada@gmail.example" });
      expect(storage.readMetadata().accounts).toEqual([state.connection]);
      const [[tokenUrl, tokenInit], [infoUrl, infoInit]] = fetch.mock.calls as unknown as [[string, RequestInit], [string, RequestInit]];
      expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
      expect(tokenInit).toMatchObject({ method: "POST" });
      expect(new Headers(tokenInit.headers).get("content-type")).toBe("application/x-www-form-urlencoded");
      expect(Object.fromEntries(new URLSearchParams(String(tokenInit.body)))).toEqual({ grant_type: "refresh_token", client_id: GOOGLE_TOKEN.client_id, client_secret: "CLIENT-SECRET", refresh_token: "1//REFRESH-SENTINEL" });
      expect(infoUrl).toBe("https://www.googleapis.com/oauth2/v3/userinfo");
      expect(new Headers(infoInit.headers).get("authorization")).toBe(`Bearer ${ACCESS}`);
      expect(JSON.stringify(state)).not.toContain(ACCESS);
      expect(readFileSync(join(root, "metadata.json"), "utf8")).not.toContain(ACCESS);
      expect(JSON.stringify(states)).not.toContain(ACCESS);
      expect(existsSync(tokenFile("antigravity"))).toBe(false);
      expect(await storage.loadVault("antigravity")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify(GOOGLE_TOKEN)) });
    });
    it("reads the working copy inside the check's hold and sends the requests after the drop", async () => {
      await storedAntigravity();
      const present: boolean[] = [];
      const fetch = googleFetch();
      fetch.mockImplementation(async (url: string | URL | Request) => {
        present.push(existsSync(tokenFile("antigravity")));
        return new Response(JSON.stringify(String(url).endsWith("/token") ? { access_token: ACCESS } : { email: "ada@gmail.example" }));
      });
      const m = lookupManager(fetch); await m.load();
      const write = vi.spyOn(storage, "writeMetadata");
      const check = await antigravityCheck(m);
      expect(await check.outcome).toBe("ok");
      expect(present).toEqual([false, false]);
      expect(m.state("antigravity").connection!.account).toEqual({ ...NONE, email: "ada@gmail.example" });
      expect(write).not.toHaveBeenCalled();
      expect(await storage.loadVault("antigravity")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify(GOOGLE_TOKEN)) });
    });
    it("keeps the email a check showed when a later lookup is refused", async () => {
      await storedAntigravity();
      const fetch = googleFetch();
      const m = lookupManager(fetch); await m.load();
      await (await antigravityCheck(m)).done;
      fetch.mockImplementation(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
      expect(await (await antigravityCheck(m)).outcome).toBe("ok");
      expect(m.state("antigravity").connection!.account).toEqual({ ...NONE, email: "ada@gmail.example" });
    });
    const failures: [string, Reply, Reply, object | string | null][] = [
      ["the token request is refused (invalid_grant)", { status: 400, body: { error: "invalid_grant", error_description: "Bad Request" } }, { body: {} }, GOOGLE_TOKEN],
      ["userinfo answers 401", { body: { access_token: ACCESS } }, { status: 401, body: { error: "invalid_token" } }, GOOGLE_TOKEN],
      ["Google answers 503", { status: 503 }, { body: {} }, GOOGLE_TOKEN],
      ["the request cannot be sent", "reject", "reject", GOOGLE_TOKEN],
      ["the working copy is missing", { body: {} }, { body: {} }, null],
      ["the working copy is not JSON", { body: {} }, { body: {} }, "{not json"],
      ["token_uri is not Google's", { body: {} }, { body: {} }, { ...GOOGLE_TOKEN, token_uri: "https://evil.example/token" }],
    ];
    it.each(failures)("signs in and checks without an email when %s", async (name, token, info, file) => {
      const fetch = googleFetch(token, info);
      const m = lookupManager(fetch); await m.load();
      const state = await (await antigravitySignIn(m, file)).done;
      expect(state).toMatchObject({ phase: "connected", verified: true, error: null });
      expect(state.connection!.account).toEqual(NONE);
      const check = await antigravityCheck(m);
      expect(await check.outcome).toBe("ok");
      expect(m.state("antigravity")).toMatchObject({ phase: "connected", verified: true, error: null, connection: { account: NONE } });
      if (name.startsWith("token_uri") || name.startsWith("the working copy")) expect(fetch).not.toHaveBeenCalled();
      const text = logged();
      expect(text).toContain("doan: antigravity account lookup failed");
      for (const secret of [ACCESS, "CLIENT-SECRET", "1//REFRESH-SENTINEL", "Bad Request"]) expect(text).not.toContain(secret);
    });
    it("warns without the value when Google returns a refresh token, and leaves the credential file alone", async () => {
      const fetch = googleFetch({ body: { access_token: ACCESS, refresh_token: "1//NEW-REFRESH" } });
      const m = lookupManager(fetch); await m.load();
      const state = await (await antigravitySignIn(m)).done;
      expect(state.connection!.account.email).toBe("ada@gmail.example");
      expect(await storage.loadVault("antigravity")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify(GOOGLE_TOKEN)) });
      await (await antigravityCheck(m)).done;
      expect(await storage.loadVault("antigravity")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify(GOOGLE_TOKEN)) });
      const text = logged();
      expect(text).toContain("Google returned a refresh token; Doan ignored it");
      for (const secret of ["1//NEW-REFRESH", ACCESS]) expect(text).not.toContain(secret);
    });
    it("gives up on an unanswered request after 5 s and keeps the sign-in result", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const fetch = googleFetch("hang");
      const m = lookupManager(fetch); await m.load();
      const run = await antigravitySignIn(m);
      await until(() => fetch.mock.calls.length === 1, "token request");
      await vi.advanceTimersByTimeAsync(5200);
      expect(await run.done).toMatchObject({ phase: "connected", verified: true, error: null, connection: { account: NONE } });
      expect((fetch.mock.calls[0]![1] as RequestInit).signal!.aborted).toBe(true);
      expect(logged()).toContain("doan: antigravity account lookup failed: no answer within 5000 ms");
    });
    // These hold the product's timers still (the 5 s budget and quit's own wait never fire), so settling at all proves the
    // attempt ended on the abort, not on a timer. Real time is only a hang guard.
    const frozen = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const settles = <T>(work: Promise<T>) => Promise.race([work, new Promise<never>((_, reject) => realTimeout(() => reject(new Error("did not settle")), 10_000))]);
    const signal = (fetch: ReturnType<typeof googleFetch>) => (fetch.mock.calls[0]![1] as RequestInit).signal!;
    it("ends a sign-in cancelled during an unanswered request on the abort, not the budget", async () => {
      frozen();
      const fetch = googleFetch("hang");
      const m = lookupManager(fetch); await m.load();
      const run = await antigravitySignIn(m);
      await until(() => fetch.mock.calls.length === 1, "token request");
      expect(signal(fetch).aborted).toBe(false);
      await m.cancel("antigravity", run.attemptId, 7);
      expect(signal(fetch).aborted).toBe(true);
      expect(await settles(run.done)).toMatchObject({ phase: "disconnected", attempt: null, connection: null });
      expect(storage.readMetadata().accounts).toEqual([]);
    });
    it("quits during an unanswered request without waiting out a timer and keeps the stored credential", async () => {
      await storedAntigravity();
      frozen();
      const fetch = googleFetch("hang");
      const m = lookupManager(fetch); await m.load();
      const check = await antigravityCheck(m);
      await until(() => fetch.mock.calls.length === 1, "token request");
      await settles(m.quit());
      expect(signal(fetch).aborted).toBe(true);
      await settles(check.done);
      expect(await storage.loadVault("antigravity")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify(GOOGLE_TOKEN)) });
      expect(existsSync(tokenFile("antigravity"))).toBe(false);
    });
    it("quits during a replacement's unanswered request and keeps the previous credential", async () => {
      const OLD = { ...GOOGLE_TOKEN, refresh_token: "1//OLD" };
      await storedAntigravity(OLD, { email: "old@gmail.example" });
      frozen();
      const fetch = googleFetch("hang");
      const m = lookupManager(fetch); await m.load();
      const run = await antigravitySignIn(m);
      await until(() => fetch.mock.calls.length === 1, "token request");
      await settles(m.quit());
      expect(signal(fetch).aborted).toBe(true);
      expect(await settles(run.done)).toMatchObject({ connection: { connectionId: "c-1", account: { email: "old@gmail.example" } } });
      expect(await storage.loadVault("antigravity")).toEqual({ "creds/token.json": Buffer.from(JSON.stringify(OLD)) });
      expect(storage.readMetadata().accounts[0]!.connectionId).toBe("c-1");
    });
  });

  describe("other providers", () => {
    it("start no lookup process or request for Claude, Cursor and Copilot sign-in, check and run confirmation", async () => {
      const fetch = googleFetch();
      const m = lookupManager(fetch); await m.load();
      keychain = { status: "connected", account: { id: "acct", workspace: "org", email: "claude@example.com" } };
      const claude = started(await m.signIn("claude", 7));
      await finish("login", 0); await finish("status", 0);
      expect((await claude.done).connection!.account).toEqual(keychain.account);
      const check = started(await m.check("claude")); await finish("status", 0);
      expect(await check.outcome).toBe("ok");
      expect(m.state("claude").connection!.account).toEqual(keychain.account);
      for (const provider of ["cursor", "copilot"] as const) {
        const run = started(await m.signIn(provider, 7));
        await finish("login", 0, p => writeToken(p, { id: provider })); await finish("status", 0);
        expect((await run.done).connection!.account).toEqual({ id: provider, workspace: null, email: `${provider}@example.com` });
        const again = started(await m.check(provider)); await finish("status", 0);
        expect(await again.outcome).toBe("ok");
        expect(m.state(provider).connection!.account).toEqual({ id: provider, workspace: null, email: `${provider}@example.com` });
      }
      m.confirm("copilot", m.state("copilot").connection!.connectionId);
      expect(m.state("copilot").connection!.account).toEqual({ id: "copilot", workspace: null, email: "copilot@example.com" });
      expect(processes.filter(p => p.step === "rpc" || p.step === "acp")).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});

// mcp-connectors B2/B3: MCP leases, and the MCP logout step a sign-out or a committed replacement runs.
describe("MCP connector steps", () => {
  const account = (id: string | null): CheckResult => ({ status: "connected", account: { id, workspace: null } });
  async function signedInClaude(m: AuthManager, id: string | null) {
    keychain = account(id);
    const run = started(await m.signIn("claude", 7)); await finish("login", 0); await finish("status", 0);
    return run.done;
  }
  it("an mcp lease carries its extra environment and is not a conversation: sign-out stops it without stop_required", async () => {
    const stopRuns = vi.fn(async (_provider: Provider) => { for (const lease of leases.splice(0)) setTimeout(() => void lease.release(), 5); });
    const leases: Awaited<ReturnType<AuthManager["acquire"]>>[] = [];
    const m = manager({ stopRuns }); await m.load();
    await signedInCursor(m, "u1");
    const lease = await m.acquire("cursor", "mcp", { DOAN_AUTH_LINK: "/tmp/doan-auth-link-1/links" });
    expect(lease.env.DOAN_AUTH_LINK).toBe("/tmp/doan-auth-link-1/links");
    leases.push(lease);
    const out = started(await m.signOut("cursor"));
    expect(stopRuns).toHaveBeenCalledWith("cursor");
    const status = await next("status");
    expect(leases).toEqual([]);
    settledSet.add(status); status.finish(0);
    expect(await out.done).toMatchObject({ phase: "disconnected", connection: null });
  });
  it("runs the MCP logout in the live profile before the provider logout of a sign-out", async () => {
    const calls: { provider: Provider; request: Omit<McpLogoutRequest, "run"> }[] = [];
    let listed: { code: number | null; stdout: string } | undefined;
    const m = manager({ mcpLogout: async (provider, request) => {
      const { run, ...rest } = request; calls.push({ provider, request: rest });
      listed = await run(["mcp", "list", "--json"]);
      return { failed: [] };
    } }); await m.load();
    keychain = account(null);
    const first = started(await m.signIn("codex", 7)); await finish("login", 0); await finish("status", 0); await first.done;
    const out = started(await m.signOut("codex"));
    const list = await next("status");
    expect(list.args).toEqual(["-c", "store=keyring", "mcp", "list", "--json"]);
    expect(list.cwd).toBe(storage.profileDir("codex"));
    expect(processes.some(p => p.step === "logout")).toBe(false);
    settledSet.add(list); list.print("[]"); list.finish(0);
    await finish("logout", 0);
    keychain = { status: "disconnected" };
    await finish("status", 0);
    expect(await out.done).toMatchObject({ phase: "disconnected" });
    expect(listed).toEqual({ code: 0, stdout: "[]", stderr: "" });
    expect(calls).toEqual([{ provider: "codex", request: { kind: "signOut", previousAccountId: null, nextAccountId: null, staging: null } }]);
  });
  it("finishes a sign-out whose MCP logout throws", async () => {
    const m = manager({ mcpLogout: async () => { throw new Error("list failed"); } }); await m.load();
    await signedInClaude(m, "a1");
    const out = started(await m.signOut("claude"));
    await finish("logout", 0);
    keychain = { status: "disconnected" };
    await finish("status", 0);
    expect(await out.done).toMatchObject({ phase: "disconnected", connection: null });
  });
  it("runs no MCP logout for a first sign-in, and passes both account ids after a committed live replacement", async () => {
    const mcpLogout = vi.fn(async (_provider: Provider, _request: McpLogoutRequest) => ({ failed: [] }));
    const m = manager({ mcpLogout }); await m.load();
    await signedInClaude(m, "a1");
    expect(mcpLogout).not.toHaveBeenCalled();
    const replaced = await signedInClaude(m, "a2");
    expect(replaced.connection?.account.id).toBe("a2");
    expect(mcpLogout).toHaveBeenCalledOnce();
    expect(mcpLogout.mock.calls[0]![1]).toMatchObject({ kind: "replace", previousAccountId: "a1", nextAccountId: "a2", staging: null });
  });
  it("runs no MCP logout when a replacement is cancelled or fails", async () => {
    const mcpLogout = vi.fn(async () => ({ failed: [] }));
    const m = manager({ mcpLogout }); await m.load();
    await signedInClaude(m, "a1");
    const cancelled = started(await m.signIn("claude", 7));
    await next("login");
    await m.cancel("claude", cancelled.attemptId, 7);
    await cancelled.done;
    const failed = started(await m.signIn("claude", 7));
    await finish("login", 1);
    await failed.done;
    expect(mcpLogout).not.toHaveBeenCalled();
  });
  it("a staged Codex replacement logs out from the previous profile and hands over the staging profile, before that profile goes", async () => {
    let request: McpLogoutRequest | undefined;
    const m = manager({ adapters: { ...withAcp(), codex: { ...keychainProvider(() => keychain), loginClears: true } }, mcpLogout: async (_provider, r) => {
      request = r; await r.run(["mcp", "logout", "doan-notion"]); return { failed: [] };
    } }); await m.load();
    keychain = account(null);
    const first = started(await m.signIn("codex", 7)); await finish("login", 0); await finish("status", 0); await first.done;
    const run = started(await m.signIn("codex", 7));
    const login = await finish("login", 0); await finish("status", 0);
    const mcp = await finish("logout", 0);
    expect(mcp.args).toEqual(["-c", "store=keyring", "mcp", "logout", "doan-notion"]);
    expect(mcp.cwd).toBe(storage.profileDir("codex"));
    expect(request).toMatchObject({ kind: "replace", previousAccountId: null, nextAccountId: null, staging: login.cwd });
    const retired = await finish("logout", 0);
    expect(retired.args).toEqual(["-c", "store=keyring", "logout"]);
    expect(retired.cwd).toBe(storage.profileDir("codex"));
    expect((await run.done).connection!.profile).toBe(login.cwd.split("/").at(-1));
  });
  it("exports the link-file hook the MCP sign-in reuses", () => {
    const hooked = hookLinks(() => {});
    expect(hooked.env.DOAN_AUTH_LINK).toMatch(/doan-auth-link-.*\/links$/);
    hooked.close();
  });
});
