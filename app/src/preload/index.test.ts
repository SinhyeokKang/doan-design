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

test("asks main for inspector rows on its dedicated IPC channel", async () => {
  mocks.invoke.mockResolvedValue({ ok: false, reason: "No canvas is loaded." });
  await expect(api.inspect('[data-doan-id="cta"]')).resolves.toEqual({ ok: false, reason: "No canvas is loaded." });
  expect(mocks.invoke).toHaveBeenCalledWith("inspect:get", { selector: '[data-doan-id="cta"]' });
});

test("exposes narrow comment methods and removes only its subscriptions", async () => {
  const request = { root: "/repo", path: "design/a.html", canvas: "a", requestID: "read" };
  await api.commentsList(request);
  await api.commentsStatus(request);
  await api.commentsAuthor(request);
  await api.commentsBegin({ ...request, scope: "canvas" });
  await api.commentsCopy({ ...request, scope: { kind: "all" } });
  expect(mocks.invoke.mock.calls.map(call => call[0])).toEqual(["comments:list", "comments:status", "comments:author", "comments:begin", "comments:copy"]);
  const listener = vi.fn(); const stop = api.onCommentsInvalidated(listener);
  emitter.emit("comments:invalidated", {}, { root: "/repo" });
  expect(listener).toHaveBeenCalledWith({ root: "/repo" });
  stop(); expect(emitter.listenerCount("comments:invalidated")).toBe(0);
  const transition = vi.fn(); const cancel = api.onCommentTransition(transition);
  emitter.emit("comments:transition", {}, { kind: "quit", id: "q" });
  expect(transition).toHaveBeenCalledOnce(); cancel();
  await api.setCommentDraftGuard(true); await api.answerCommentTransition({ id: "q", allow: false });
  expect(mocks.invoke).toHaveBeenLastCalledWith("comments:transition-answer", { id: "q", allow: false });
});

test("project setup exposes choice IDs and forwards focus with folder state", async () => {
  await api.chooseTokenCss(ROOT);
  await api.initializeProject({ root: ROOT, choiceId: "choice" });
  expect(mocks.invoke).toHaveBeenCalledWith("project:choose-token-css", { root: ROOT });
  expect(mocks.invoke).toHaveBeenCalledWith("project:init", { root: ROOT, choiceId: "choice" });
  const listener = vi.fn(); const stop = api.onFolders(listener);
  emitter.emit("folders", {}, [], { from: "/old", root: ROOT });
  expect(listener).toHaveBeenCalledWith([], { from: "/old", root: ROOT });
  stop();
});
const ROOT = "/repo";


test("onboarding uses fixed channels and ignores an initial open response after a newer event", async () => {
  let finish!: (value: unknown) => void;
  mocks.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const listener = vi.fn(); const stop = api.onOnboardingOpen(listener);
  emitter.emit("onboarding:open", {}, { session: "new" }); finish({ session: "old" });
  await Promise.resolve(); expect(listener).toHaveBeenCalledExactlyOnceWith({ session: "new" }); stop();
  emitter.emit("onboarding:open", {}, { session: "later" }); expect(listener).toHaveBeenCalledTimes(1);
  await api.readOnboarding({ session: "new", requestId: "r" }); expect(mocks.invoke).toHaveBeenLastCalledWith("onboarding:read", { session: "new", requestId: "r" });
  await api.closeOnboarding({ session: "new" }); expect(mocks.invoke).toHaveBeenLastCalledWith("onboarding:close", { session: "new" });
  await api.copyPathLine(); expect(mocks.invoke).toHaveBeenLastCalledWith("onboarding:copy", { kind: "pathLine" });
});
