import { EventEmitter } from "node:events";
import { beforeEach, expect, test, vi } from "vitest";
import type { DoanApi } from "./index";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  expose: vi.fn<(name: string, api: DoanApi) => void>(),
}));
const emitter = new EventEmitter();
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  ipcRenderer: { invoke: mocks.invoke, on: (...args: Parameters<EventEmitter["on"]>) => emitter.on(...args), removeListener: (...args: Parameters<EventEmitter["removeListener"]>) => emitter.removeListener(...args) },
}));

let api: DoanApi;
beforeEach(async () => {
  emitter.removeAllListeners();
  vi.clearAllMocks();
  vi.resetModules();
  mocks.invoke.mockResolvedValue([]);
  await import("./index");
  const exposed = mocks.expose.mock.calls[0]?.[1];
  if (!exposed) throw new Error("preload API not exposed");
  api = exposed;
});

test("exposes reopen through its dedicated IPC channel", async () => {
  await api.reopenFolder("/repo");
  expect(mocks.invoke).toHaveBeenCalledWith("folders:reopen", "/repo");
});

test("unsubscribes folder updates and suppresses a pending initial read", async () => {
  let resolve: (entries: unknown[]) => void = () => { throw new Error("initial read did not start"); };
  mocks.invoke.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const listener = vi.fn();
  const stop = api.onFolders(listener);
  emitter.emit("folders", {}, [{ path: "/repo", kind: "loading" }]);
  expect(listener).toHaveBeenCalledTimes(1);
  stop();
  stop();
  emitter.emit("folders", {}, []);
  resolve([]);
  await Promise.resolve();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(emitter.listenerCount("folders")).toBe(0);
});

test("independent subscriptions survive another subscriber's cleanup", async () => {
  const first = vi.fn();
  const second = vi.fn();
  const stopFirst = api.onFolders(first);
  const stopSecond = api.onFolders(second);
  await Promise.resolve();
  first.mockClear();
  second.mockClear();
  stopFirst();
  emitter.emit("folders", {}, []);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
  stopSecond();
});

test("unsubscribes view commands", () => {
  const listener = vi.fn();
  const stop = api.onViewCommand(listener);
  emitter.emit("view-command", {}, "fit");
  expect(listener).toHaveBeenCalledWith("fit");
  stop();
  emitter.emit("view-command", {}, "reload");
  expect(listener).toHaveBeenCalledTimes(1);
  expect(emitter.listenerCount("view-command")).toBe(0);
});

test("sends the selection to main on its dedicated IPC channel", async () => {
  const selection = { root: "/repo", canvas: { path: "design/a.html" } };
  await api.setSelection(selection);
  await api.setSelection(null);
  expect(mocks.invoke).toHaveBeenNthCalledWith(1, "selection:set", selection);
  expect(mocks.invoke).toHaveBeenNthCalledWith(2, "selection:set", null);
});
