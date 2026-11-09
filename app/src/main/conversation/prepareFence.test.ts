import { afterEach, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mocks = vi.hoisted(() => ({ probe: vi.fn(), run: vi.fn() }));
vi.mock("../onboarding/machine", () => ({ probeShell: mocks.probe, runProcess: mocks.run }));
import { createAccountPrepare, type AccountRuntime } from "./prepare";
import { initialAuthState } from "../agentAuth/state";
import type { Lease } from "../agentAuth/manager";
import type { AccountConnection, AuthState, Provider } from "../agentAuth/types";
import type { AttachmentRecord } from "./types";

const roots: string[] = []; afterEach(() => { vi.clearAllMocks(); roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
const VERSION: Partial<Record<Provider, string>> = { claude: "2.1.312 (Claude Code)", codex: "codex-cli 0.164.0" };
// A userData with two providers' profiles, Doan's own files and a pasted image, reached through an unresolved
// /var path so the fence must resolve it (Seatbelt compares /private/var).
function world(provider: Provider, profileName: string = provider) {
  const base = mkdtempSync(join(tmpdir(), "doan-fence-")); roots.push(realpathSync(base));
  const userData = join(base, "user Data"), profile = join(userData, "agent-auth", "profiles", profileName), project = join(base, "project");
  for (const dir of [profile, join(userData, "agent-auth", "profiles", "cursor"), join(userData, "conversations"), join(userData, "attachments", "0f4e"), join(userData, "attachments", "77aa"), project]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(userData, "runtime.json"), "{}"); writeFileSync(join(userData, "attachments", "0f4e", "pasted.png"), "x");
  return { base, userData, real: realpathSync.native(userData), profile, project: realpathSync.native(project), managed: join(base, "managed") };
}
function prepare(provider: Provider, w: ReturnType<typeof world>, fence = true, release = vi.fn(async () => {})) {
  const connection: AccountConnection = { provider, connectionId: "conn-1", profile: provider, account: { id: "acct-1", workspace: provider === "claude" ? "org-1" : null, email: "ada@example.com" } };
  const state: AuthState = { ...initialAuthState(provider, connection), verified: true, generation: 1 };
  mocks.run.mockResolvedValue({ exitCode: 0, timedOut: false, stdout: VERSION[provider] ?? "" });
  const runtime: AccountRuntime = {
    state: () => state, check: vi.fn(), checked: vi.fn(async () => {}), confirm: vi.fn(),
    acquire: vi.fn(async (): Promise<Lease> => ({ command: `/bin/${provider}`, env: { PATH: "/shell/bin" }, profileDir: w.profile, release })),
  };
  return { release, run: createAccountPrepare(runtime, "/Applications/doan.app/Contents/Resources/bin/doan", () => {}, undefined, undefined, fence ? { userData: w.userData, managedDir: w.managed } : undefined) };
}
const pasted = (w: ReturnType<typeof world>): AttachmentRecord => ({ name: "pasted.png", size: 1, kind: "image", path: join(w.real, "attachments", "0f4e", "pasted.png") });

it("fences a conversation run with resolved paths and this turn's pasted image directory", async () => {
  const w = world("claude");
  const ready = await prepare("claude", w).run({ root: w.project, mode: "new", runtime: "claude", text: "hi", anchors: [], attachments: [pasted(w), { name: "shot.png", size: 1, kind: "image", path: "/Users/ada/Desktop/shot.png" }] });
  expect(ready.fence).toEqual({ paths: { userData: w.real, profile: realpathSync.native(w.profile), attachments: [join(w.real, "attachments", "0f4e")] } });
  expect(w.real.startsWith("/private/")).toBe(true);
});
it("gives a list read no fence, and neither a prepare without the fence setup", async () => {
  const w = world("claude");
  expect((await prepare("claude", w).run({ root: w.project, mode: "new", runtime: "claude", text: "", anchors: [] }, undefined, "listing")).fence).toBeUndefined();
  expect((await prepare("claude", w, false).run({ root: w.project, mode: "new", runtime: "claude", text: "", anchors: [] })).fence).toBeUndefined();
});
it("fences an Antigravity run, which reads no version", async () => {
  const w = world("antigravity");
  const ready = await prepare("antigravity", w).run({ root: w.project, mode: "new", runtime: "antigravity", text: "hi", anchors: [] });
  expect(ready.fence?.paths.profile).toBe(realpathSync.native(w.profile));
});
it("gives a Codex run the whole attachment directory, creating it first", async () => {
  const w = world("codex", "codex-7");
  rmSync(join(w.userData, "attachments"), { recursive: true });
  const ready = await prepare("codex", w).run({ root: w.project, mode: "new", runtime: "codex", text: "hi", anchors: [] });
  expect(ready.fence?.paths.attachments).toEqual([join(w.real, "attachments")]);
  // Listed for Doan's Codex permission profile: the other provider's profile and Doan's own files, never userData itself.
  expect(ready.fence?.denied?.map(entry => entry.path).sort()).toEqual([`${w.real}/agent-auth/profiles/cursor`, `${w.real}/conversations`]);
  expect(statSync(join(w.userData, "attachments")).mode & 0o777).toBe(0o700);
});
it("reads Claude's sandbox as on from the profile's settings and adds deny rules for everything else in userData", async () => {
  const w = world("claude");
  writeFileSync(join(w.profile, "settings.json"), JSON.stringify({ sandbox: { enabled: true } }));
  const ready = await prepare("claude", w).run({ root: w.project, mode: "new", runtime: "claude", text: "hi", anchors: [], attachments: [pasted(w)] });
  expect(ready.fence?.claudeSandbox).toBe(true);
  const denied = (ready.fence?.denied ?? []).map(entry => entry.path);
  expect(denied).toEqual(expect.arrayContaining([`${w.real}/agent-auth/profiles/cursor`, `${w.real}/conversations`, `${w.real}/attachments/77aa`]));
  expect(denied.some(path => path.includes("profiles/claude") || path.includes("0f4e") || path.includes("runtime.json") || path === w.real)).toBe(false);
});
it("lets the project's local settings and then managed settings decide Claude's sandbox", async () => {
  const w = world("claude");
  writeFileSync(join(w.profile, "settings.json"), JSON.stringify({ sandbox: { enabled: true } }));
  mkdirSync(join(w.project, ".claude")); writeFileSync(join(w.project, ".claude", "settings.local.json"), JSON.stringify({ sandbox: { enabled: false } }));
  const request = { root: w.project, mode: "new" as const, runtime: "claude" as const, text: "hi", anchors: [] };
  expect((await prepare("claude", w).run(request)).fence?.claudeSandbox).toBeUndefined();
  mkdirSync(join(w.managed, "managed-settings.d"), { recursive: true });
  writeFileSync(join(w.managed, "managed-settings.json"), JSON.stringify({ sandbox: { enabled: false } }));
  writeFileSync(join(w.managed, "managed-settings.d", "10-on.json"), JSON.stringify({ sandbox: { enabled: true } }));
  expect((await prepare("claude", w).run(request)).fence?.claudeSandbox).toBeDefined();
});
it("refuses a run whose fence cannot be built as unknown, before anything starts, and frees the lease", async () => {
  const w = world("claude");
  const outside = mkdtempSync(join(tmpdir(), "doan-fence-outside-")); roots.push(outside);
  const { run, release } = prepare("claude", { ...w, profile: outside });
  await expect(run({ root: w.project, mode: "new", runtime: "claude", text: "hi", anchors: [] })).rejects.toThrow(/^unknown$/);
  expect(release).toHaveBeenCalled();
});
