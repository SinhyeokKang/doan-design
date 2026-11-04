import { afterEach, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mocks = vi.hoisted(() => ({ run: vi.fn(), probe: vi.fn() }));
vi.mock("../onboarding/machine", () => ({ probeShell: mocks.probe, runProcess: mocks.run }));
import { createAccountPrepare, type AccountRuntime } from "./prepare";
import { initialAuthState } from "../agentAuth/state";
import type { Lease } from "../agentAuth/manager";
import type { AccountConnection, AuthState, Provider } from "../agentAuth/types";

const paths: string[] = [];
afterEach(() => { vi.clearAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
function temp() { const dir = realpathSync(mkdtempSync(join(tmpdir(), "doan-prepare-mcp-"))); paths.push(dir); return dir; }
const VERSION: Partial<Record<Provider, string>> = { claude: "2.1.312 (Claude Code)", codex: "codex-cli 0.164.0", cursor: "2026.10.22-27dcf5f\n" };
const CLI = "/Applications/doan.app/Contents/Resources/bin/doan";

// A signed-in, verified account whose lease hands out a profile directory.
function account(provider: Provider): { runtime: AccountRuntime; root: string } {
  const root = temp(), profile = join(temp(), "profile"); mkdirSync(profile);
  const connection: AccountConnection = { provider, connectionId: "conn-1", profile: provider, account: { id: "acct-1", workspace: null, email: "ada@example.com" } };
  const state: AuthState = { ...initialAuthState(provider, connection), verified: true, generation: 1 };
  mocks.run.mockResolvedValue({ exitCode: 0, timedOut: false, stdout: VERSION[provider] });
  const runtime: AccountRuntime = {
    state: () => state, check: vi.fn(), checked: vi.fn(async () => {}), confirm: vi.fn(),
    acquire: vi.fn(async (): Promise<Lease> => ({ command: `/bin/${provider}`, env: { PATH: "/shell/bin" }, profileDir: profile, release: async () => {} })),
  };
  return { runtime, root };
}

// mcp-connectors C1/C2: a Claude or Codex doan-account run carries its provider's connector generation and the
// connector names, read when asked; without the connectors service they are generation 0 and the presets.
it("hands Claude and Codex runs their provider's connector facts, read when asked", async () => {
  const generations = { claude: 3, codex: 7 }; let labels: Record<string, string> = { "doan-example-com": "example.com" };
  const connectors = { generation: (provider: "claude" | "codex") => generations[provider], labels: () => labels };
  for (const provider of ["claude", "codex"] as const) {
    const h = account(provider);
    const run = await createAccountPrepare(h.runtime, CLI, undefined, undefined, connectors)({ root: h.root, mode: "new", runtime: provider, text: "x", anchors: [] });
    expect(run.mcp?.generation()).toBe(generations[provider]);
    generations[provider] += 1; labels = { ...labels, "doan-other": "other.example" };
    expect(run.mcp?.generation()).toBe(generations[provider]);
    expect(run.mcp?.labels()).toEqual(labels);
  }
});
it("defaults to generation 0 and the presets without the connectors service", async () => {
  const h = account("codex");
  const run = await createAccountPrepare(h.runtime, CLI)({ root: h.root, mode: "new", runtime: "codex", text: "x", anchors: [] });
  expect(run.mcp?.generation()).toBe(0);
  expect(run.mcp?.labels()).toEqual({ "doan-notion": "Notion", "doan-atlassian": "Atlassian", "doan-figma": "Figma" });
});
it("gives no connector facts to a provider that cannot use the servers", async () => {
  const h = account("cursor");
  const run = await createAccountPrepare(h.runtime, CLI, undefined, undefined, { generation: () => 9, labels: () => ({}) })({ root: h.root, mode: "new", runtime: "cursor", text: "x", anchors: [] });
  expect(run.mcp).toBeUndefined();
});
