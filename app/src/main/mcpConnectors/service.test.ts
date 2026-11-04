import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lease } from "../agentAuth/manager";
import type { AuthState, Readiness } from "../agentAuth/types";
import { BASE_ARGS, FakeCli, type FakeProcess } from "./fixtures/fakeCli";
import type { McpProvider } from "./presets";
import { McpService, type McpServiceOptions, type McpSnapshot } from "./service";
import { ConnectorStore } from "./store";

const LINK = readFileSync(new URL("./fixtures/link-notion.txt", import.meta.url), "utf8").trim();
const realTimeout = setTimeout;
const flush = () => new Promise(resolve => realTimeout(resolve, 0));
async function until<T>(read: () => T | undefined | null | false, what = "condition"): Promise<T> {
  for (let i = 0; i < 400; i++) { const value = read(); if (value) return value; await flush(); }
  throw new Error(`timed out waiting for ${what}`);
}

let dir: string, cli: FakeCli, store: ConnectorStore, states: Record<McpProvider, AuthState>, refusals: Partial<Record<McpProvider, string>>;
let held: Record<McpProvider, number>, acquired: { provider: McpProvider; use: string; added: Record<string, string> }[];
let opened: string[], hook: ((raw: string) => void) | null, hooks: number, published: McpSnapshot[], readiness: Record<McpProvider, Readiness>;
const profile = (provider: McpProvider) => join(dir, "profiles", provider);
const connected = (provider: McpProvider, connectionId = "c1"): AuthState => ({
  provider, phase: "connected", generation: 1, verified: true, expired: false, attempt: null, error: null,
  connection: { provider, connectionId, profile: provider, account: { id: null, workspace: null } },
});
function service(over: Partial<McpServiceOptions> = {}): McpService {
  return new McpService({
    store, spawn: cli.spawn, spawnPty: cli.spawnPty, baseArgs: BASE_ARGS, tmpdir: join(dir, "tmp"),
    auth: {
      state: provider => states[provider],
      acquire: async (provider, use, added = {}): Promise<Lease> => {
        acquired.push({ provider, use, added });
        const refusal = refusals[provider];
        if (refusal) throw new Error(refusal);
        held[provider] += 1;
        let released = false;
        return { command: `/verified/bin/${provider}`, profileDir: profile(provider), env: { PATH: "/verified/bin", [provider === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME"]: profile(provider), ...added },
          release: async () => { if (!released) { released = true; held[provider] -= 1; } } };
      },
    },
    readiness: provider => readiness[provider],
    openExternal: async url => { opened.push(url); },
    hookLinks: onLink => { hook = onLink; hooks += 1; return { env: { DOAN_AUTH_LINK: "/tmp/doan-auth-link-x/links" }, close: () => { hook = null; } }; },
    publish: snapshot => { published.push(snapshot); },
    ...over,
  });
}
const row = (s: McpService, provider: McpProvider, name: string) => s.snapshot().providers.find(p => p.provider === provider)!.rows.find(r => r.name === name);
const status = (s: McpService, provider: McpProvider, name: string) => row(s, provider, name)?.view.status;
const login = (provider: McpProvider) => until(() => cli.logins(provider)[0], `${provider} login`);
const fileJson = () => JSON.parse(readFileSync(join(dir, "mcp-connectors.json"), "utf8"));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "doan-mcp-service-"));
  for (const provider of ["claude", "codex"] as const) mkdirSync(profile(provider), { recursive: true });
  mkdirSync(join(dir, "tmp"));
  cli = new FakeCli(); store = new ConnectorStore(dir);
  states = { claude: connected("claude"), codex: connected("codex") }; refusals = {};
  held = { claude: 0, codex: 0 }; acquired = []; opened = []; hook = null; hooks = 0; published = [];
  readiness = { claude: { ready: true }, codex: { ready: true } };
});
afterEach(() => { vi.useRealTimers(); rmSync(dir, { recursive: true, force: true }); });

describe("connect", () => {
  it("Claude registers the preset, signs in through a pty with the link file and opens the hook's link once", async () => {
    const s = service();
    expect(s.connect("claude", "doan-notion")).toEqual({ ok: true });
    expect(status(s, "claude", "doan-notion")).toBe("connecting");
    const p = await login("claude");
    expect(p.pty).toBe(true);
    expect(p.command).toBe("/verified/bin/claude");
    expect(p.cwd).toBe(profile("claude"));
    expect(p.env).toMatchObject({ DOAN_AUTH_LINK: "/tmp/doan-auth-link-x/links", CLAUDE_CONFIG_DIR: profile("claude") });
    expect(cli.commands("claude")).toEqual([
      ["mcp", "get", "doan-notion"],
      ["mcp", "add", "--transport", "http", "--scope", "user", "doan-notion", "https://mcp.notion.com/mcp"],
      ["mcp", "login", "doan-notion"],
    ]);
    expect(acquired.every(a => a.use === "mcp")).toBe(true);
    hook!(LINK); hook!(LINK);
    await until(() => opened.length === 1, "link opened");
    expect(opened).toEqual([LINK]);
    expect(row(s, "claude", "doan-notion")?.link).toBe(true);
    expect(await s.openLink("claude", "doan-notion")).toEqual({ ok: true });
    expect(opened).toEqual([LINK, LINK]);
    cli.approve(p);
    await s.idle();
    expect(status(s, "claude", "doan-notion")).toBe("connected");
    expect(fileJson().everConnected).toEqual({ "doan-notion": ["claude"] });
    expect(s.generation("claude")).toBe(1);
    expect(s.generation("codex")).toBe(0);
    expect(held).toEqual({ claude: 0, codex: 0 });
    expect(hook).toBeNull();
  });

  it("Codex registers and signs in with one `codex mcp add`, under its keyring arguments, and Doan opens nothing", async () => {
    const s = service();
    s.connect("codex", "doan-notion");
    const p = await login("codex");
    expect(p.pty).toBe(false);
    expect(p.args).toEqual([...BASE_ARGS.codex, "mcp", "add", "doan-notion", "--url", "https://mcp.notion.com/mcp"]);
    expect(hooks).toBe(0);
    expect(acquired.map(a => a.added)).toEqual([{}]);
    cli.approve(p);
    await s.idle();
    expect(opened).toEqual([]);
    expect(await s.openLink("codex", "doan-notion")).toEqual({ ok: false, reason: "stale" });
    expect(status(s, "codex", "doan-notion")).toBe("connected");
    expect(cli.commands("codex").at(-1)).toEqual(["mcp", "list", "--json"]);
  });

  it("hands a URL server's stored URL to the provider verbatim", async () => {
    const s = service();
    const added = s.add("  HTTPS://Example.COM:443/a/  ");
    expect(added).toEqual({ ok: true, name: "doan-example-com" });
    expect(fileJson().servers).toEqual([{ name: "doan-example-com", url: "https://example.com/a" }]);
    s.connect("codex", "doan-example-com");
    const p = await login("codex");
    expect(p.sub).toEqual(["mcp", "add", "doan-example-com", "--url", "https://example.com/a"]);
    cli.approve(p); await s.idle();
    s.connect("claude", "doan-example-com");
    cli.approve(await login("claude")); await s.idle();
    expect(cli.commands("claude")).toContainEqual(["mcp", "add", "--transport", "http", "--scope", "user", "doan-example-com", "https://example.com/a"]);
  });

  it("allows one attempt per provider: a second Connect there is refused, the other provider is free", async () => {
    const s = service();
    s.connect("claude", "doan-notion");
    expect(s.connect("claude", "doan-figma")).toEqual({ ok: false, reason: "busy" });
    expect(s.disconnect("claude", "doan-figma")).toEqual({ ok: false, reason: "busy" });
    expect(row(s, "claude", "doan-figma")?.view.disabled).toBe("busy");
    expect(s.connect("codex", "doan-figma")).toEqual({ ok: true });
    cli.approve(await login("claude")); cli.approve(await login("codex"));
    await s.idle();
    expect(status(s, "claude", "doan-notion")).toBe("connected");
    expect(status(s, "codex", "doan-figma")).toBe("connected");
  });

  it("refuses an unknown server or one the file does not list", () => {
    const s = service();
    expect(s.connect("claude", "doan-unknown")).toEqual({ ok: false, reason: "not_found" });
  });

  it("a cancelled first Connect returns silently and keeps the registration, which reads as Not connected", async () => {
    const s = service();
    s.connect("claude", "doan-notion");
    const p = await login("claude");
    expect(s.cancel("claude", "doan-figma")).toEqual({ ok: false, reason: "stale" });
    expect(s.cancel("claude", "doan-notion")).toEqual({ ok: true });
    await s.idle();
    expect(p.stopped).toBe(true);
    expect(row(s, "claude", "doan-notion")).toMatchObject({ failure: null, view: { status: "not_connected", action: "connect" } });
    expect(cli.registered.claude.has("doan-notion")).toBe(true);
    expect(s.generation("claude")).toBe(0);
    expect(held.claude).toBe(0);
  });

  it("a Codex callback timeout fails with its reason, keeps the registration, and the next Connect logs in", async () => {
    const s = service();
    cli.loginOutput = "Error: timed out waiting for OAuth callback\n";
    s.connect("codex", "doan-figma");
    await s.idle();
    expect(row(s, "codex", "doan-figma")).toMatchObject({ failure: "approval_timeout", view: { status: "not_connected" } });
    expect(cli.registered.codex.has("doan-figma")).toBe(true);
    cli.loginOutput = "";
    s.connect("codex", "doan-figma");
    expect(row(s, "codex", "doan-figma")?.failure).toBeNull();
    const p = await login("codex");
    expect(p.sub).toEqual(["mcp", "login", "doan-figma"]);
    cli.approve(p); await s.idle();
    expect(status(s, "codex", "doan-figma")).toBe("connected");
  });

  it("a CLI failure is shown with Retry, and the failure stays until the next Connect", async () => {
    const s = service();
    cli.failing.add("claude add doan-notion");
    s.connect("claude", "doan-notion");
    await s.idle();
    expect(row(s, "claude", "doan-notion")?.failure).toBe("failed");
    s.refresh();
    await s.idle();
    expect(row(s, "claude", "doan-notion")?.failure).toBe("failed");
  });

  it("fails with no_link when the hook gets no link (a Claude browser setting), within the link limit", async () => {
    vi.useFakeTimers();
    const s = service();
    s.connect("claude", "doan-notion");
    const p = await login("claude");
    await vi.advanceTimersByTimeAsync(29_000);
    expect(p.stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(p.stopped).toBe(true);
    await s.idle();
    expect(row(s, "claude", "doan-notion")?.failure).toBe("no_link");
    expect(opened).toEqual([]);
  });

  it("opens no link the MCP link check refuses, and so fails with no_link", async () => {
    vi.useFakeTimers();
    const s = service();
    s.connect("claude", "doan-notion");
    await login("claude");
    hook!(LINK.replace("redirect_uri=http%3A%2F%2Flocalhost", "redirect_uri=http%3A%2F%2Fevil.example"));
    hook!("https://example.com/no-pkce");
    await vi.advanceTimersByTimeAsync(31_000);
    await s.idle();
    expect(opened).toEqual([]);
    expect(row(s, "claude", "doan-notion")?.failure).toBe("no_link");
  });

  it("stops waiting for the browser five minutes after the link", async () => {
    vi.useFakeTimers();
    const s = service();
    s.connect("claude", "doan-notion");
    const p = await login("claude");
    await vi.advanceTimersByTimeAsync(20_000);
    hook!(LINK);
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 1_000);
    expect(p.stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    await s.idle();
    expect(row(s, "claude", "doan-notion")?.failure).toBe("approval_timeout");
  });

  it("a plaintext .credentials.json fails the Connect as storage_failed and is deleted", async () => {
    const s = service();
    s.connect("claude", "doan-notion");
    const p = await login("claude");
    writeFileSync(join(profile("claude"), ".credentials.json"), "{}");
    cli.approve(p);
    await s.idle();
    expect(row(s, "claude", "doan-notion")?.failure).toBe("storage_failed");
    expect(existsSync(join(profile("claude"), ".credentials.json"))).toBe(false);
    expect(fileJson().everConnected).toEqual({});
  });

  it("a sign-in or sign-out in progress (admit busy) fails with the busy reason", async () => {
    refusals.codex = "busy";
    const s = service();
    s.connect("codex", "doan-notion");
    await s.idle();
    expect(row(s, "codex", "doan-notion")?.failure).toBe("busy");
    refusals.codex = "reauth_required";
    s.connect("codex", "doan-notion");
    await s.idle();
    expect(row(s, "codex", "doan-notion")?.failure).toBe("not_ready");
  });

  it("quitting cancels a running attempt and writes no result", async () => {
    const s = service();
    s.connect("codex", "doan-notion");
    const p = await login("codex");
    const quit = s.quit();
    expect(p.stopped).toBe(true);
    await quit;
    expect(existsSync(join(dir, "mcp-connectors.json"))).toBe(false);
    expect(row(s, "codex", "doan-notion")?.failure).toBeNull();
    expect(s.generation("codex")).toBe(0);
    expect(s.connect("codex", "doan-notion")).toEqual({ ok: false, reason: "busy" });
  });

  it("a sign-out or replacement start (stopRuns) cancels the provider's attempt silently and releases its lease", async () => {
    const s = service();
    s.connect("claude", "doan-notion");
    const p = await login("claude");
    expect(held.claude).toBe(1);
    await s.stopProvider("claude");
    expect(p.stopped).toBe(true);
    expect(held.claude).toBe(0);
    await s.idle();
    expect(row(s, "claude", "doan-notion")?.failure).toBeNull();
  });
});

describe("status reads", () => {
  it("reads every server on request; Checking until the first read, then each provider's answer", async () => {
    cli.registered.codex.set("doan-figma", { url: "https://mcp.figma.com/mcp", auth: true });
    cli.registered.claude.set("doan-notion", { url: "https://mcp.notion.com/mcp", auth: false });
    store.patch({ everConnected: { name: "doan-notion", provider: "claude", value: true } });
    const s = service();
    expect(status(s, "claude", "doan-notion")).toBe("checking");
    s.refresh();
    await s.idle();
    expect(status(s, "codex", "doan-figma")).toBe("connected");
    expect(status(s, "codex", "doan-notion")).toBe("not_connected");
    expect(status(s, "claude", "doan-notion")).toBe("reconnect_needed");
    expect(status(s, "claude", "doan-atlassian")).toBe("not_connected");
    expect(held).toEqual({ claude: 0, codex: 0 });
  });

  it("a status command that does not answer in time reads as Couldn’t check", async () => {
    vi.useFakeTimers();
    cli.hanging.add("codex list");
    const s = service();
    s.refresh();
    await vi.advanceTimersByTimeAsync(21_000);
    await s.idle();
    expect(row(s, "codex", "doan-notion")?.view).toMatchObject({ status: "check_failed", action: "retry" });
  });

  it("an unreadable answer reads as Couldn’t check, never as signed out", async () => {
    cli.failing.add("claude get doan-figma");
    const s = service();
    s.refresh();
    await s.idle();
    expect(status(s, "claude", "doan-figma")).toBe("check_failed");
    expect(status(s, "claude", "doan-notion")).toBe("not_connected");
  });
});

describe("disconnect", () => {
  it("logs the provider out of that server only, clears everConnected and shows Not connected", async () => {
    cli.registered.codex.set("doan-notion", { url: "https://mcp.notion.com/mcp", auth: true });
    store.patch({ everConnected: { name: "doan-notion", provider: "codex", value: true } });
    store.patch({ everConnected: { name: "doan-notion", provider: "claude", value: true } });
    const s = service();
    expect(s.disconnect("codex", "doan-notion")).toEqual({ ok: true });
    expect(status(s, "codex", "doan-notion")).toBe("disconnecting");
    expect(row(s, "codex", "doan-notion")?.view.action).toBeNull();
    await s.idle();
    expect(cli.commands("codex")).toContainEqual(["mcp", "logout", "doan-notion"]);
    expect(cli.registered.codex.has("doan-notion")).toBe(true);
    expect(fileJson().everConnected).toEqual({ "doan-notion": ["claude"] });
    expect(status(s, "codex", "doan-notion")).toBe("not_connected");
    expect(s.generation("codex")).toBe(1);
  });

  it("a failed logout keeps the previous state and reports disconnect_failed", async () => {
    cli.registered.claude.set("doan-notion", { url: "https://mcp.notion.com/mcp", auth: true });
    cli.failing.add("claude logout doan-notion");
    const s = service();
    s.disconnect("claude", "doan-notion");
    await s.idle();
    expect(row(s, "claude", "doan-notion")).toMatchObject({ failure: "disconnect_failed", view: { status: "connected" } });
    expect(s.generation("claude")).toBe(0);
  });
});

describe("add and remove", () => {
  it("refuses the same URL or a preset's URL, naming the server that has it", () => {
    const s = service();
    expect(s.add("https://mcp.notion.com/mcp/")).toEqual({ ok: false, reason: "duplicate", name: "Notion" });
    expect(s.add("https://mcp.example.com/mcp")).toEqual({ ok: true, name: "doan-mcp-example-com" });
    expect(s.add("https://MCP.example.com/mcp")).toEqual({ ok: false, reason: "duplicate", name: "mcp.example.com" });
    expect(s.add("http://mcp.example.com/mcp")).toEqual({ ok: false, reason: "not_https" });
  });

  it("refuses add and remove while the connectors file is unreadable; presets still connect", async () => {
    writeFileSync(join(dir, "mcp-connectors.json"), "{broken");
    const s = service();
    expect(s.add("https://mcp.example.com/mcp")).toEqual({ ok: false, reason: "file_unreadable" });
    expect(s.remove("doan-mcp-example-com")).toEqual({ ok: false, reason: "file_unreadable" });
    expect(s.snapshot().file).toBe("broken");
    s.connect("codex", "doan-notion");
    cli.approve(await login("codex"));
    await s.idle();
    expect(status(s, "codex", "doan-notion")).toBe("connected");
  });

  it("removes a URL server from every provider, logout before remove, then from the file", async () => {
    const s = service();
    s.add("https://mcp.example.com/mcp");
    cli.registered.claude.set("doan-mcp-example-com", { url: "https://mcp.example.com/mcp", auth: true });
    cli.registered.codex.set("doan-mcp-example-com", { url: "https://mcp.example.com/mcp", auth: true });
    expect(s.remove("doan-mcp-example-com")).toEqual({ ok: true });
    expect(status(s, "claude", "doan-mcp-example-com")).toBe("removing");
    await s.idle();
    for (const provider of ["claude", "codex"] as const) {
      const steps = cli.commands(provider).filter(c => c[1] === "logout" || c[1] === "remove");
      expect(steps.map(c => c[1])).toEqual(["logout", "remove"]);
    }
    expect(cli.commands("claude")).toContainEqual(["mcp", "remove", "doan-mcp-example-com", "-s", "user"]);
    expect(fileJson().servers).toEqual([]);
    expect(s.snapshot().servers.map(server => server.name)).toEqual(["doan-notion", "doan-atlassian", "doan-figma"]);
    expect([s.generation("claude"), s.generation("codex")]).toEqual([1, 1]);
  });

  it("refuses Remove while any provider runs an attempt, and a preset can never be removed", async () => {
    const s = service();
    s.add("https://mcp.example.com/mcp");
    s.connect("codex", "doan-mcp-example-com");
    expect(s.remove("doan-mcp-example-com")).toEqual({ ok: false, reason: "busy" });
    expect(s.remove("doan-notion")).toEqual({ ok: false, reason: "not_found" });
    expect(s.snapshot().servers.find(server => server.name === "doan-mcp-example-com")?.removable).toBe(false);
    cli.approve(await login("codex")); await s.idle();
    expect(s.snapshot().servers.find(server => server.name === "doan-mcp-example-com")?.removable).toBe(true);
  });

  it("a provider without a Doan connection is skipped; a failed step keeps the server with removeFailed", async () => {
    states.claude = { ...connected("claude"), connection: null, phase: "disconnected" };
    const s = service();
    s.add("https://mcp.example.com/mcp");
    cli.registered.codex.set("doan-mcp-example-com", { url: "https://mcp.example.com/mcp", auth: false });
    cli.failing.add("codex remove doan-mcp-example-com");
    s.remove("doan-mcp-example-com");
    await s.idle();
    expect(cli.commands("claude")).toEqual([]);
    expect(fileJson().servers).toHaveLength(1);
    expect(s.snapshot().servers.find(server => server.name === "doan-mcp-example-com")?.removeFailed).toBe(true);
    cli.failing.clear();
    s.remove("doan-mcp-example-com");
    expect(s.snapshot().servers.find(server => server.name === "doan-mcp-example-com")?.removeFailed).toBe(false);
    await s.idle();
    expect(fileJson().servers).toEqual([]);
  });
});

describe("provider ready: pending logouts and reconcile", () => {
  it("removes only doan- registrations the file does not know, never the person's names, and adds nothing back", async () => {
    store.patch({ add: { name: "doan-kept-example", url: "https://kept.example.com/mcp" } });
    cli.registered.codex.set("doan-gone-example", { url: "https://gone.example.com/mcp", auth: true });
    cli.registered.codex.set("doan-kept-example", { url: "https://kept.example.com/mcp", auth: true });
    cli.registered.codex.set("doan-notion", { url: "https://mcp.notion.com/mcp", auth: true });
    cli.registered.codex.set("notion", { url: "https://mcp.notion.com/mcp", auth: true });
    const s = service();
    s.authChanged("codex");
    await s.idle();
    expect(cli.commands("codex").filter(c => c[1] === "logout" || c[1] === "remove")).toEqual([["mcp", "logout", "doan-gone-example"], ["mcp", "remove", "doan-gone-example"]]);
    expect([...cli.registered.codex.keys()]).toEqual(["doan-kept-example", "doan-notion", "notion"]);
    expect(status(s, "codex", "doan-notion")).toBe("connected");
  });

  it("removes nothing while the connectors file is unreadable", async () => {
    writeFileSync(join(dir, "mcp-connectors.json"), "{broken");
    cli.registered.claude.set("doan-gone-example", { url: "https://gone.example.com/mcp", auth: true });
    const s = service();
    s.authChanged("claude");
    await s.idle();
    expect(cli.registered.claude.has("doan-gone-example")).toBe(true);
  });

  it("runs once per connection: a later change of the same connection does not reconcile again", async () => {
    const s = service();
    s.authChanged("codex"); await s.idle();
    const count = cli.processes.length;
    s.authChanged("codex"); await s.idle();
    expect(cli.processes.length).toBe(count);
    states.codex = connected("codex", "c2");
    s.authChanged("codex"); await s.idle();
    expect(cli.processes.length).toBeGreaterThan(count);
  });

  it("retries a pending Codex logout at start in a temporary CODEX_HOME holding only that server, and clears it", async () => {
    store.record([{ provider: "codex", name: "doan-notion", url: "https://mcp.notion.com/mcp" }]);
    let config = "";
    const spawn = cli.spawn;
    const s = service({ spawn: (command, args, options) => {
      if (args.includes("logout")) config = readFileSync(join(options.env.CODEX_HOME!, "config.toml"), "utf8");
      return spawn(command, args, options);
    } });
    cli.registered.codex.set("doan-notion", { url: "https://mcp.notion.com/mcp", auth: true });
    s.authChanged("codex");
    await s.idle();
    const logout = cli.processes.find(p => p.sub[1] === "logout")!;
    expect(logout.env.CODEX_HOME).not.toBe(profile("codex"));
    expect(logout.cwd).toBe(logout.env.CODEX_HOME);
    expect(config).toBe('[mcp_servers.doan-notion]\nurl = "https://mcp.notion.com/mcp"\n');
    expect(existsSync(logout.env.CODEX_HOME!)).toBe(false);
    expect(store.blocked("codex", "doan-notion")).toBe(false);
  });

  it("a Connect behind a pending logout retries it first and connects only after it succeeded", async () => {
    store.record([{ provider: "claude", name: "doan-notion", url: "https://mcp.notion.com/mcp" }]);
    cli.registered.claude.set("doan-notion", { url: "https://mcp.notion.com/mcp", auth: true });
    cli.failing.add("claude logout doan-notion");
    const s = service();
    expect(row(s, "claude", "doan-notion")?.view.blocked).toBe(false);
    s.refresh(); await s.idle();
    expect(row(s, "claude", "doan-notion")?.view).toMatchObject({ status: "reconnect_needed", action: "reconnect", blocked: true });
    s.connect("claude", "doan-notion");
    await s.idle();
    expect(row(s, "claude", "doan-notion")?.failure).toBe("pending_logout");
    expect(cli.commands("claude").some(c => c[1] === "login")).toBe(false);
    cli.failing.clear();
    s.connect("claude", "doan-notion");
    const p = await login("claude");
    expect(store.blocked("claude", "doan-notion")).toBe(false);
    expect(cli.commands("claude").map(c => c[1])).toContain("logout");
    cli.approve(p); await s.idle();
    expect(status(s, "claude", "doan-notion")).toBe("connected");
  });
});

describe("conversation facts", () => {
  it("labels every preset and URL server by its display name", () => {
    const s = service();
    s.add("https://mcp.example.com/mcp");
    expect(s.labels()).toEqual({ "doan-notion": "Notion", "doan-atlassian": "Atlassian", "doan-figma": "Figma", "doan-mcp-example-com": "mcp.example.com" });
  });

  it("publishes each change with a newer revision", async () => {
    const s = service();
    s.connect("codex", "doan-notion");
    cli.approve(await login("codex"));
    await s.idle();
    const revisions = published.map(snapshot => snapshot.revision);
    expect(revisions.length).toBeGreaterThan(1);
    expect([...revisions].sort((a, b) => a - b)).toEqual(revisions);
    expect(published.at(-1)!.providers.find(p => p.provider === "codex")!.lastChanged).toBe("doan-notion");
  });
});

export type { FakeProcess };
