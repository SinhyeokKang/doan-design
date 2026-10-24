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
    "answerSetupConfirm", "checkSetupAgain", "chooseConfigPath", "copyPathLine", "forwardProjectAction", "getTab", "onProjects", "onSetupStatus", "onTarget",
    "openInstallPage", "readConfig", "readSetup", "revealProject", "runSetupStep", "saveTab", "takeTarget", "writeConfig",
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
