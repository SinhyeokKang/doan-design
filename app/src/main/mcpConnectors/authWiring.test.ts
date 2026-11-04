import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthManager, type AuthProcess, type Spawn } from "../agentAuth/manager";
import type { ProviderAuth } from "../agentAuth/providers";
import { AuthStorage } from "../agentAuth/storage";
import { fakeCipher } from "../agentAuth/fixtures/cipher";
import type { Provider } from "../agentAuth/types";
import { FakeCli } from "./fixtures/fakeCli";
import { McpService } from "./service";
import { ConnectorStore } from "./store";

// BB review round 2: the real AuthManager and McpService together. A sign-out or replacement must stop the provider's
// MCP work even when that work holds no lease (a pending Codex logout runs in a temporary CODEX_HOME), while
// conversations keep their own stop_required rule.

const realTimeout = setTimeout;
const flush = () => new Promise(resolve => realTimeout(resolve, 0));
async function until<T>(read: () => T | undefined | null | false, what: string): Promise<T> {
  for (let i = 0; i < 400; i++) { const value = read(); if (value) return value; await flush(); }
  throw new Error(`timed out waiting for ${what}`);
}

// Login, status and logout answer at once; `mcp` commands go to the fake MCP CLI.
class AuthCommand implements AuthProcess {
  private listeners: ((text: string, stream?: "stderr") => void)[] = [];
  readonly exit: Promise<number | null>; readonly gone: Promise<void>;
  constructor(code: number, output: string) {
    this.exit = new Promise(resolve => queueMicrotask(() => { for (const listener of this.listeners) listener(output); resolve(code); }));
    this.gone = this.exit.then(() => {});
  }
  onOutput(listener: (text: string, stream?: "stderr") => void): void { this.listeners.push(listener); }
  stop(): void {}
}

let root: string, cli: FakeCli, signedIn: boolean, service: McpService | undefined;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "doan-mcp-wiring-")); cli = new FakeCli(); signedIn = false; service = undefined; });
afterEach(async () => { await service?.quit(); rmSync(root, { recursive: true, force: true }); });

const codex: ProviderAuth = {
  command: "codex", args: ["-c", "store=keyring"], env: {}, login: ["login"], status: ["login", "status"], logout: ["logout"],
  vault: null, plaintext: [], settings: {}, acpAuth: null, acp: null, verifyByRun: false, hookLink: null, loginClears: false, identity: null,
  parseStatus: () => signedIn ? { status: "connected", account: { id: null, workspace: null } } : { status: "disconnected" },
};
const spawn: Spawn = (command, args, options) => {
  if (args.includes("mcp")) return cli.spawn(command, args, options);
  if (args.includes("logout")) signedIn = false;
  else if (args.includes("login") && !args.includes("status")) signedIn = true;
  return new AuthCommand(0, "");
};

it("a Codex sign-out stops a lease-free pending MCP logout before its own MCP step, without asking to stop conversations", async () => {
  const userData = join(root, "userData");
  mkdirSync(userData);
  const store = new ConnectorStore(userData);
  store.record([{ provider: "codex", name: "doan-notion", url: "https://mcp.notion.com/mcp" }]);
  cli.registered.codex.set("doan-notion", { url: "https://mcp.notion.com/mcp", auth: true });
  cli.hanging.add("codex logout doan-notion");
  const stopRuns = vi.fn(async (_provider: Provider) => {});
  const m = new AuthManager({
    storage: new AuthStorage(join(root, "agent-auth"), fakeCipher()), spawn, inherited: { HOME: "/Users/ada", PATH: "/usr/bin" }, appRuntime: "/data/runtime.json",
    adapters: { claude: codex, codex, cursor: codex, antigravity: codex, copilot: codex }, statusTimeoutMs: 60_000,
    locate: async () => ({ command: "/verified/bin/codex", path: "/verified/bin" }), stopRuns,
    stopMcp: provider => service?.stopProvider(provider) ?? Promise.resolve(),
    mcpLogout: (provider, request) => service?.logoutForAuth(provider, request) ?? Promise.resolve({ failed: [] }),
  });
  await m.load();
  await (await m.signIn("codex", 7) as { done: Promise<unknown> }).done;
  service = new McpService({
    store, auth: m, readiness: () => ({ ready: true }), spawn: cli.spawn, spawnPty: cli.spawnPty,
    openExternal: async () => {}, publish: () => {}, tmpdir: root,
  });
  service.authChanged("codex");
  const pending = await until(() => cli.processes.find(p => p.sub[1] === "logout" && p.env.CODEX_HOME?.includes("doan-mcp-logout-")), "pending logout");
  expect(pending.cwd.startsWith(root)).toBe(true);
  // Only the pending retry hangs; the sign-out's own logout in the live profile answers.
  cli.hanging.clear();
  const out = await m.signOut("codex");
  expect(out.ok).toBe(true);
  await until(() => pending.stopped, "pending logout stopped");
  expect(await (out as { done: Promise<{ phase: string }> }).done).toMatchObject({ phase: "disconnected" });
  expect(stopRuns).not.toHaveBeenCalled();
  // The stopped retry never cleared the record; the sign-out's own MCP step logged the server out in the live profile.
  expect(cli.commands("codex").filter(c => c[1] === "logout").length).toBeGreaterThanOrEqual(2);
}, 20_000);
