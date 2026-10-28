import { EventEmitter } from "node:events";
import { beforeEach, expect, test, vi } from "vitest";
import type { DoanSettingsApi } from "./settings";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  expose: vi.fn<(name: string, api: DoanSettingsApi) => void>(),
}));
const emitter = new EventEmitter();
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  ipcRenderer: { invoke: mocks.invoke, on: (...args: Parameters<EventEmitter["on"]>) => emitter.on(...args), removeListener: (...args: Parameters<EventEmitter["removeListener"]>) => emitter.removeListener(...args) },
}));

let api: DoanSettingsApi;
beforeEach(async () => {
  emitter.removeAllListeners();
  vi.clearAllMocks();
  vi.resetModules();
  mocks.invoke.mockResolvedValue(null);
  await import("./settings");
  expect(mocks.expose.mock.calls[0]?.[0]).toBe("doanSettings");
  const exposed = mocks.expose.mock.calls[0]?.[1];
  if (!exposed) throw new Error("settings API not exposed");
  api = exposed;
});

test("exposes only setup, tab, project and config calls on their channels", async () => {
  expect(Object.keys(api).sort()).toEqual([
    "answerSetupConfirm", "cancelAgentSignIn", "checkAgentAuth", "checkSetupAgain", "chooseConfigPath", "copyPathLine", "forwardProjectAction", "getTab",
    "onAgentAuth", "onAgentSignInPrompt", "onProjects", "onSetupStatus", "onTarget", "openAgentSignInLink",
    "openInstallPage", "readAgentAuth", "readConfig", "readSetup", "revealProject", "runSetupStep", "saveTab", "signInAgent", "signOutAgent", "submitAgentSignInCode", "takeTarget", "writeConfig",
  ]);
  const calls: [() => Promise<unknown>, unknown[]][] = [
    [() => api.readSetup("r"), ["setup:read", { requestId: "r" }]],
    [() => api.answerSetupConfirm({ id: "q", allow: true }), ["setup:answer", { id: "q", allow: true }]],
    [() => api.copyPathLine(), ["setup:copy-path-line"]],
    [() => api.saveTab("projects"), ["settings:tab-save", { tab: "projects" }]],
    [() => api.takeTarget(), ["settings:take-target"]],
    [() => api.forwardProjectAction("/repo", "locate"), ["projects:forward-action", { path: "/repo", action: "locate" }]],
    [() => api.chooseConfigPath("/repo", "serve"), ["config:choose", { root: "/repo", kind: "serve" }]],
    [() => api.writeConfig({ root: "/repo", op: "removeServe", path: "styles" }), ["config:write", { root: "/repo", op: "removeServe", path: "styles" }]],
  ];
  for (const [call, args] of calls) {
    await call();
    expect(mocks.invoke).toHaveBeenLastCalledWith(...args);
  }
});

test("the projects list starts from the current projection and follows updates", async () => {
  mocks.invoke.mockResolvedValueOnce([{ path: "/repo", kind: "list" }]);
  const listener = vi.fn();
  const stop = api.onProjects(listener);
  expect(mocks.invoke).toHaveBeenCalledWith("projects:get");
  await vi.waitFor(() => expect(listener).toHaveBeenCalledWith([{ path: "/repo", kind: "list" }]));
  emitter.emit("projects", {}, []);
  expect(listener).toHaveBeenLastCalledWith([]);
  stop();
  expect(emitter.listenerCount("projects")).toBe(0);
});

test("sends agent account calls with only a provider, an attempt ID and an explicit stop", async () => {
  mocks.invoke.mockResolvedValue({ ok: true });
  const calls: [() => Promise<unknown>, unknown[]][] = [
    [() => api.readAgentAuth(), ["agent-auth:read"]],
    [() => api.checkAgentAuth("copilot"), ["agent-auth:check", { provider: "copilot" }]],
    [() => api.signInAgent("cursor"), ["agent-auth:sign-in", { provider: "cursor" }]],
    [() => api.signInAgent("cursor", { stop: true }), ["agent-auth:sign-in", { provider: "cursor", stop: true }]],
    [() => api.signOutAgent("codex"), ["agent-auth:sign-out", { provider: "codex" }]],
    [() => api.signOutAgent("codex", { stop: true }), ["agent-auth:sign-out", { provider: "codex", stop: true }]],
    [() => api.cancelAgentSignIn("antigravity", "a1"), ["agent-auth:cancel", { provider: "antigravity", attemptId: "a1" }]],
    [() => api.submitAgentSignInCode("antigravity", "a1", "http://127.0.0.1:5/?code=c"), ["agent-auth:submit-code", { provider: "antigravity", attemptId: "a1", code: "http://127.0.0.1:5/?code=c" }]],
    [() => api.openAgentSignInLink("claude", "a1"), ["agent-auth:open-link", { provider: "claude", attemptId: "a1" }]],
  ];
  for (const [call, args] of calls) { mocks.invoke.mockClear(); await call(); expect(mocks.invoke).toHaveBeenCalledWith(...args); }
});

test("keeps the newest agent account snapshot when the initial read and change events race, and unsubscribes", async () => {
  let resolve: (snapshot: unknown) => void = () => { throw new Error("initial read did not start"); };
  mocks.invoke.mockImplementation(() => new Promise(done => { resolve = done; }));
  const seen: number[] = [];
  const stop = api.onAgentAuth(snapshot => seen.push(snapshot.revision));
  expect(mocks.invoke).toHaveBeenCalledWith("agent-auth:read");
  emitter.emit("agent-auth:changed", {}, { revision: 5, providers: [] });
  resolve({ revision: 3, providers: [] }); await Promise.resolve(); await Promise.resolve();
  emitter.emit("agent-auth:changed", {}, { revision: 4, providers: [] });
  emitter.emit("agent-auth:changed", {}, { revision: 6, providers: [] });
  expect(seen).toEqual([5, 6]);
  stop();
  emitter.emit("agent-auth:changed", {}, { revision: 7, providers: [] });
  expect(seen).toEqual([5, 6]);
  expect(emitter.listenerCount("agent-auth:changed")).toBe(0);
  const later: number[] = [];
  const stopLater = api.onAgentAuth(snapshot => later.push(snapshot.revision));
  stopLater(); resolve({ revision: 9, providers: [] }); await Promise.resolve(); await Promise.resolve();
  expect(later).toEqual([]);
});

test("keeps delivering agent account changes when the initial read is refused", async () => {
  mocks.invoke.mockRejectedValueOnce(new Error("No handler registered for 'agent-auth:read'"));
  const seen: number[] = [];
  const stop = api.onAgentAuth(snapshot => seen.push(snapshot.revision));
  await new Promise(resolve => setTimeout(resolve, 0));
  emitter.emit("agent-auth:changed", {}, { revision: 1, providers: [] });
  expect(seen).toEqual([1]);
  stop();
});

test("delivers this window's sign-in links until unsubscribed", () => {
  const prompts: unknown[] = [];
  const stop = api.onAgentSignInPrompt(prompt => prompts.push(prompt));
  emitter.emit("agent-auth:prompt", {}, { provider: "copilot", attemptId: "a1", url: "https://github.com/login" });
  stop();
  emitter.emit("agent-auth:prompt", {}, { provider: "copilot", attemptId: "a1", url: "https://github.com/login" });
  expect(prompts).toEqual([{ provider: "copilot", attemptId: "a1", url: "https://github.com/login" }]);
  expect(emitter.listenerCount("agent-auth:prompt")).toBe(0);
});
