import { EventEmitter } from "node:events";
import { beforeEach, expect, test, vi } from "vitest";
import type { DoanApi } from "./index";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  expose: vi.fn<(name: string, api: DoanApi) => void>(),
  pathForFile: vi.fn<(file: unknown) => string>(),
}));
const emitter = new EventEmitter();
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  webUtils: { getPathForFile: mocks.pathForFile },
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

test("Open Project resolves the stored root main returns", async () => {
  mocks.invoke.mockResolvedValueOnce("/repo");
  expect(await api.openFolder()).toBe("/repo");
  expect(mocks.invoke).toHaveBeenCalledWith("folders:open");
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
  await api.copyFirstPrompt("/repo"); expect(mocks.invoke).toHaveBeenLastCalledWith("onboarding:copy", { kind: "firstPrompt", root: "/repo" });
  await api.firstPrompt("/repo"); expect(mocks.invoke).toHaveBeenLastCalledWith("onboarding:first-prompt", { root: "/repo" });
});

test("project add, scan, remove, restore, locate and reveal use fixed channels", async () => {
  await api.addProjects();
  expect(mocks.invoke).toHaveBeenLastCalledWith("folders:add");
  await api.cancelScan("s");
  expect(mocks.invoke).toHaveBeenLastCalledWith("folders:scan-cancel", { scanId: "s" });
  await api.addCandidates("s", ["a", "b"]);
  expect(mocks.invoke).toHaveBeenLastCalledWith("folders:add-candidates", { scanId: "s", ids: ["a", "b"] });
  await api.confirmFolder("c");
  expect(mocks.invoke).toHaveBeenLastCalledWith("folders:confirm-folder", { confirmId: "c" });
  await api.removeProjects([ROOT]);
  expect(mocks.invoke).toHaveBeenLastCalledWith("folders:remove", { paths: [ROOT] });
  await api.restoreProjects("r");
  expect(mocks.invoke).toHaveBeenLastCalledWith("folders:restore", { removalId: "r" });
  await api.forgetRemoval("r");
  expect(mocks.invoke).toHaveBeenLastCalledWith("folders:forget-removal", { removalId: "r" });
  await api.locateProject(ROOT);
  expect(mocks.invoke).toHaveBeenLastCalledWith("folders:locate", { path: ROOT });
  await api.revealProject(ROOT);
  expect(mocks.invoke).toHaveBeenLastCalledWith("folders:reveal", { path: ROOT });
  await api.setMenuState({ screen: "home", modal: false, toast: true });
  expect(mocks.invoke).toHaveBeenLastCalledWith("menu:state", { screen: "home", modal: false, toast: true });
});

// The wizard's single-folder contract stays as it was.
test("Open Project keeps its own channel next to Add Project", async () => {
  mocks.invoke.mockResolvedValueOnce(null);
  expect(await api.openFolder()).toBeNull();
  expect(mocks.invoke).toHaveBeenLastCalledWith("folders:open");
});

test("dropped files become disk paths in the preload; files without one are left out", async () => {
  const files = [{ name: "a" }, { name: "made-in-page" }, { name: "b" }];
  mocks.pathForFile.mockImplementation((file) => ({ a: "/a", b: "/b" })[(file as { name: string }).name] ?? "");
  await api.addDroppedFiles(files as unknown as File[]);
  expect(mocks.invoke).toHaveBeenLastCalledWith("folders:add-paths", { paths: ["/a", "/b"] });
  mocks.invoke.mockClear();
  await api.addDroppedFiles([files[1]] as unknown as File[]);
  expect(mocks.invoke).not.toHaveBeenCalled();
});

test("ui state is read and saved on fixed channels", async () => {
  mocks.invoke.mockResolvedValueOnce(null).mockResolvedValueOnce(true);
  expect(await api.readUiState()).toBeNull();
  const state = { screen: "home" as const, expanded: {}, lastByRoot: {} };
  expect(await api.saveUiState(state)).toBe(true);
  expect(mocks.invoke.mock.calls).toEqual([["ui-state:get"], ["ui-state:save", state]]);
});

test("thumbnails are asked for on a fixed channel and their changes are a subscription", async () => {
  mocks.invoke.mockResolvedValueOnce({ kind: "pending" });
  expect(await api.getThumbnail("/repo", "design/a.html", true)).toEqual({ kind: "pending" });
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("thumbnails:get", { root: "/repo", path: "design/a.html", visible: true });
  const listener = vi.fn();
  const stop = api.onThumbnailChanged(listener);
  emitter.emit("thumbnails:changed", {}, { root: "/repo", path: "design/a.html" });
  stop();
  emitter.emit("thumbnails:changed", {}, { root: "/repo", path: "design/b.html" });
  expect(listener.mock.calls).toEqual([[{ root: "/repo", path: "design/a.html" }]]);
  expect(emitter.listenerCount("thumbnails:changed")).toBe(0);
});

test("add outcomes and menu commands are subscriptions that unsubscribe", () => {
  const outcome = vi.fn(); const stopOutcome = api.onAddOutcome(outcome);
  const command = vi.fn(); const stopCommand = api.onMenuCommand(command);
  emitter.emit("folders:add-outcome", {}, { added: ["/a"] });
  emitter.emit("menu-command", {}, "home");
  expect(outcome).toHaveBeenCalledWith({ added: ["/a"] });
  expect(command).toHaveBeenCalledWith("home");
  stopOutcome(); stopCommand();
  expect(emitter.listenerCount("folders:add-outcome")).toBe(0);
  expect(emitter.listenerCount("menu-command")).toBe(0);
});

test("a scan watch keeps the newest snapshot of its own scan, whichever arrives first", async () => {
  let reply!: (value: unknown) => void;
  mocks.invoke.mockImplementationOnce(() => new Promise((resolve) => { reply = resolve; }));
  const listener = vi.fn();
  const stop = api.watchScan("s", listener);
  expect(mocks.invoke).toHaveBeenLastCalledWith("folders:scan", { scanId: "s" });
  emitter.emit("folders:scan-progress", {}, { scanId: "other", seq: 9 });
  emitter.emit("folders:scan-progress", {}, { scanId: "s", seq: 3 });
  reply({ scanId: "s", seq: 2 });
  await Promise.resolve(); await Promise.resolve();
  expect(listener.mock.calls.map((call) => call[0].seq)).toEqual([3]);
  emitter.emit("folders:scan-progress", {}, { scanId: "s", seq: 4 });
  expect(listener.mock.calls.map((call) => call[0].seq)).toEqual([3, 4]);
  stop();
  emitter.emit("folders:scan-progress", {}, { scanId: "s", seq: 5 });
  expect(listener).toHaveBeenCalledTimes(2);
  expect(emitter.listenerCount("folders:scan-progress")).toBe(0);
});

test("a scan watch takes the reply when it is newer than any event, and nothing for a gone scan", async () => {
  mocks.invoke.mockResolvedValueOnce({ scanId: "s", seq: 5 });
  const listener = vi.fn();
  const stop = api.watchScan("s", listener);
  await Promise.resolve(); await Promise.resolve();
  expect(listener).toHaveBeenCalledExactlyOnceWith({ scanId: "s", seq: 5 });
  stop();
  mocks.invoke.mockResolvedValueOnce(null);
  const gone = vi.fn();
  api.watchScan("t", gone)();
  await Promise.resolve(); await Promise.resolve();
  expect(gone).not.toHaveBeenCalled();
});


test("thumbnail visibility uses its fixed channel in both directions", async () => {
  await api.setThumbnailVisibility("/repo", "design/a.html", false);
  await api.setThumbnailVisibility("/repo", "design/b.html", true);
  expect(mocks.invoke.mock.calls).toEqual([
    ["thumbnails:visible", { root: "/repo", path: "design/a.html", visible: false }],
    ["thumbnails:visible", { root: "/repo", path: "design/b.html", visible: true }],
  ]);
});

test("first prompt sends the subject only when there is one", async () => {
  await api.firstPrompt("/repo");
  expect(mocks.invoke).toHaveBeenLastCalledWith("onboarding:first-prompt", { root: "/repo" });
  await api.firstPrompt("/repo", "a sign-in screen");
  expect(mocks.invoke).toHaveBeenLastCalledWith("onboarding:first-prompt", { root: "/repo", subject: "a sign-in screen" });
  await api.copyFirstPrompt("/repo", "a sign-in screen");
  expect(mocks.invoke).toHaveBeenLastCalledWith("onboarding:copy", { kind: "firstPrompt", root: "/repo", subject: "a sign-in screen" });
});

test("setup status: the current value is asked for, and an event that came first wins", async () => {
  let resolve: (value: unknown) => void = () => { throw new Error("no initial read"); };
  mocks.invoke.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const listener = vi.fn();
  const stop = api.onSetupStatus(listener);
  expect(mocks.invoke).toHaveBeenCalledWith("setup:status");
  emitter.emit("setup:status", {}, { summary: null, checking: true, busy: false, onboardingClosed: false });
  resolve({ summary: null, checking: false, busy: false, onboardingClosed: false });
  await Promise.resolve();
  expect(listener).toHaveBeenCalledExactlyOnceWith({ summary: null, checking: true, busy: false, onboardingClosed: false });
  stop();
  expect(emitter.listenerCount("setup:status")).toBe(0);
});

test("settings, install pages, the wizard's project and forwarded row actions use their channels", async () => {
  await api.openSettings({ tab: "projects", project: "/repo" });
  expect(mocks.invoke).toHaveBeenLastCalledWith("settings:open", { tab: "projects", project: "/repo" });
  await api.openInstallPage("claude");
  expect(mocks.invoke).toHaveBeenLastCalledWith("setup:open-external", { target: "claude" });
  await api.openProject();
  expect(mocks.invoke).toHaveBeenLastCalledWith("onboarding:open-project");
  const listener = vi.fn();
  const stop = api.onProjectAction(listener);
  emitter.emit("projects:action", {}, { path: "/repo", action: "remove" });
  stop();
  emitter.emit("projects:action", {}, { path: "/repo", action: "remove" });
  expect(listener).toHaveBeenCalledExactlyOnceWith({ path: "/repo", action: "remove" });
});
