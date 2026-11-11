import { afterEach, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mocks = vi.hoisted(() => ({ probe: vi.fn(), run: vi.fn() }));
vi.mock("../onboarding/machine", () => ({ probeShell: mocks.probe, runProcess: mocks.run }));
import { createAccountPrepare, routePrepare, wireAccountPrepare, type AccountPrepare, type AccountRuntime } from "./prepare";
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
  const socketDir = join(base, "sock"); mkdirSync(socketDir);
  return { base, userData, real: realpathSync.native(userData), profile, project: realpathSync.native(project), managed: join(base, "managed"), socket: join(socketDir, "app.sock") };
}
function prepare(provider: Provider, w: ReturnType<typeof world>, fence = true, release = vi.fn(async () => {})) {
  const connection: AccountConnection = { provider, connectionId: "conn-1", profile: provider, account: { id: "acct-1", workspace: provider === "claude" ? "org-1" : null, email: "ada@example.com" } };
  const state: AuthState = { ...initialAuthState(provider, connection), verified: true, generation: 1 };
  mocks.run.mockResolvedValue({ exitCode: 0, timedOut: false, stdout: VERSION[provider] ?? "" });
  const runtime: AccountRuntime = {
    state: () => state, check: vi.fn(), checked: vi.fn(async () => {}), confirm: vi.fn(),
    acquire: vi.fn(async (): Promise<Lease> => ({ command: `/bin/${provider}`, env: { PATH: "/shell/bin" }, profileDir: w.profile, release })),
  };
  return { release, runtime, run: createAccountPrepare(runtime, "/Applications/doan.app/Contents/Resources/bin/doan", () => {}, undefined, undefined, fence ? { userData: w.userData, managedDir: w.managed, socket: () => w.socket } : undefined) };
}
const pasted = (w: ReturnType<typeof world>): AttachmentRecord => ({ name: "pasted.png", size: 1, kind: "image", path: join(w.real, "attachments", "0f4e", "pasted.png") });

it("fences a conversation run with resolved paths and this turn's pasted image directory", async () => {
  const w = world("claude");
  const ready = await prepare("claude", w).run({ root: w.project, mode: "new", runtime: "claude", text: "hi", anchors: [], attachments: [pasted(w), { name: "shot.png", size: 1, kind: "image", path: "/Users/ada/Desktop/shot.png" }] });
  expect(ready.fence).toEqual({ paths: { userData: w.real, profile: realpathSync.native(w.profile), attachments: [join(w.real, "attachments", "0f4e")] } });
  expect(w.real.startsWith("/private/")).toBe(true);
});
it("opens nothing in the fence for a folder attachment, even one inside a pasted image directory", async () => {
  const w = world("claude");
  const inner = join(w.real, "attachments", "77aa", "inner"); mkdirSync(inner);
  const folders: AttachmentRecord[] = [{ name: "inner", kind: "directory", path: inner }, { name: "attachments", kind: "directory", path: join(w.real, "attachments") }, { name: "user Data", kind: "directory", path: w.real }];
  const ready = await prepare("claude", w).run({ root: w.project, mode: "new", runtime: "claude", text: "hi", anchors: [], attachments: [pasted(w), ...folders] });
  expect(ready.fence?.paths.attachments).toEqual([join(w.real, "attachments", "0f4e")]);
  expect((ready.fence?.denied ?? []).map(entry => entry.path)).toEqual(expect.arrayContaining([`${w.real}/attachments/77aa`, `${w.real}/conversations`]));
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
  expect(ready.fence?.socket).toBe(join(realpathSync.native(join(w.base, "sock")), "app.sock"));
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
it("gives a Codex run the app socket's resolved directory and refuses one whose socket directory does not resolve", async () => {
  const w = world("codex");
  const request = { root: w.project, mode: "new" as const, runtime: "codex" as const, text: "hi", anchors: [] };
  expect((await prepare("codex", w).run(request)).fence?.socket).toBe(join(realpathSync.native(join(w.base, "sock")), "app.sock"));
  const { run, release } = prepare("codex", { ...w, socket: join(w.base, "no-such-dir", "app.sock") });
  await expect(run(request)).rejects.toThrow(/^unknown$/);
  expect(release).toHaveBeenCalled();
});
// Only a profile server allows the socket; a Full access server inside the outer fence starts without one, so an app
// whose runtime did not start refuses only the runs that need it (the runner refuses a profile server).
it("leaves the socket directory out when the app has no runtime", async () => {
  const w = world("codex");
  const ready = await createAccountPrepare(prepare("codex", w).runtime, "/Applications/doan.app/Contents/Resources/bin/doan", () => {}, undefined, undefined, { userData: w.userData, socket: () => undefined })({ root: w.project, mode: "new", runtime: "codex", text: "hi", anchors: [] });
  expect(ready.fence?.paths.profile).toBe(realpathSync.native(w.profile));
  expect(ready.fence && "socket" in ready.fence).toBe(false);
});
// A reused server keeps the fence it started with; listing again would only let a passing listing failure refuse a send
// that changes nothing about that server.
it("builds no fence for a send to a reused Codex server", async () => {
  const w = world("codex");
  rmSync(join(w.userData, "attachments"), { recursive: true });
  const ready = await prepare("codex", w).run({ root: w.project, mode: "new", runtime: "codex", text: "hi", anchors: [] }, undefined, "run", true);
  expect(ready.fence).toBeUndefined();
  expect(() => statSync(join(w.userData, "attachments"))).toThrow();
});
it("tells the Doan-account prepare when a send reuses the live Codex server", async () => {
  const account = vi.fn<AccountPrepare>(async () => ({ runtime: "codex", configDir: "/p", cwd: "/r", command: "/c", env: {} }));
  const stored = { conversationId: "c", root: "/r", title: "t", state: "current" as const, owner: { kind: "doan" as const, provider: "codex" as const, connectionId: "x", accountId: "a", workspaceId: null, profile: "codex" },
    session: { runtime: "codex" as const, origin: "new" as const, sessionId: "s", configDir: "/p", cwd: "/r" } };
  await routePrepare(vi.fn(), account)({ root: "/r", mode: "resume", text: "", anchors: [] }, stored, undefined, true);
  expect(account.mock.calls[0]?.[3]).toBe(true);
});
// main's wiring of the Doan-account side: every argument reaches the account prepare, reusing included.
it("passes a reused Codex send through main's account wiring", async () => {
  const account = vi.fn<AccountPrepare>(async () => ({ runtime: "codex", configDir: "/p", cwd: "/r", command: "/c", env: {} }));
  const wired = wireAccountPrepare(account, () => true, prepared => prepared);
  await wired({ root: "/r", mode: "resume", text: "", anchors: [] }, undefined, "run", true);
  expect(account.mock.calls[0]?.slice(2)).toEqual(["run", true]);
  await expect(wireAccountPrepare(account, () => false, prepared => prepared)({ root: "/r", mode: "new", text: "", anchors: [] })).rejects.toThrow("not_logged_in");
  const withUsage = vi.fn((prepared: Awaited<ReturnType<AccountPrepare>>) => ({ ...prepared, installed: "x" }));
  expect((await wireAccountPrepare(account, () => true, withUsage)({ root: "/r", mode: "new", text: "", anchors: [] }, undefined, "listing")).installed).toBeUndefined();
  expect((await wireAccountPrepare(account, () => true, withUsage)({ root: "/r", mode: "new", text: "", anchors: [] })).installed).toBe("x");
});
