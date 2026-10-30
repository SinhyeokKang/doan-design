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
  const selection = { root: "/repo", canvas: { path: ".doan/canvases/a.html" } };
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
  const request = { root: "/repo", path: ".doan/canvases/a.html", canvas: "a", requestID: "read" };
  await api.commentsList(request);
  await api.commentsStatus(request);
  await api.commentsAuthor(request);
  await api.commentsBegin({ ...request, scope: "canvas" });
  await api.commentsCopy({ ...request, scope: { comments: ["cmt_a"] } });
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


test("the old wizard calls are gone; the PATH line copy and the folder picker use fixed channels", async () => {
  for (const name of ["onOnboardingOpen", "readOnboarding", "runOnboardingStep", "answerOnboardingReplace", "closeOnboarding", "openProject"]) expect(name in api).toBe(false);
  await api.chooseOnboardingFolder("destination"); expect(mocks.invoke).toHaveBeenLastCalledWith("onboarding:choose-folder", "destination");
  await api.copyPathLine(); expect(mocks.invoke).toHaveBeenLastCalledWith("onboarding:copy", { kind: "pathLine" });
});

test("project remove, restore, locate and reveal use fixed channels", async () => {
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

test("ui state is read and saved on fixed channels", async () => {
  mocks.invoke.mockResolvedValueOnce(null).mockResolvedValueOnce(true);
  expect(await api.readUiState()).toBeNull();
  const state = { screen: "home" as const, expanded: {}, lastByRoot: {} };
  expect(await api.saveUiState(state)).toBe(true);
  expect(mocks.invoke.mock.calls).toEqual([["ui-state:get"], ["ui-state:save", state]]);
});

test("thumbnails are asked for on a fixed channel and their changes are a subscription", async () => {
  mocks.invoke.mockResolvedValueOnce({ kind: "pending" });
  expect(await api.getThumbnail("/repo", ".doan/canvases/a.html", true)).toEqual({ kind: "pending" });
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("thumbnails:get", { root: "/repo", path: ".doan/canvases/a.html", visible: true });
  const listener = vi.fn();
  const stop = api.onThumbnailChanged(listener);
  emitter.emit("thumbnails:changed", {}, { root: "/repo", path: ".doan/canvases/a.html" });
  stop();
  emitter.emit("thumbnails:changed", {}, { root: "/repo", path: ".doan/canvases/b.html" });
  expect(listener.mock.calls).toEqual([[{ root: "/repo", path: ".doan/canvases/a.html" }]]);
  expect(emitter.listenerCount("thumbnails:changed")).toBe(0);
});

test("menu commands are a subscription that unsubscribes", () => {
  const command = vi.fn(); const stopCommand = api.onMenuCommand(command);
  emitter.emit("menu-command", {}, "home");
  expect(command).toHaveBeenCalledWith("home");
  stopCommand();
  expect(emitter.listenerCount("menu-command")).toBe(0);
});

test("thumbnail visibility uses its fixed channel in both directions", async () => {
  await api.setThumbnailVisibility("/repo", ".doan/canvases/a.html", false);
  await api.setThumbnailVisibility("/repo", ".doan/canvases/b.html", true);
  expect(mocks.invoke.mock.calls).toEqual([
    ["thumbnails:visible", { root: "/repo", path: ".doan/canvases/a.html", visible: false }],
    ["thumbnails:visible", { root: "/repo", path: ".doan/canvases/b.html", visible: true }],
  ]);
});

test("first prompt always sends the subject", async () => {
  await api.firstPrompt("/repo", "a sign-in screen");
  expect(mocks.invoke).toHaveBeenLastCalledWith("onboarding:first-prompt", { root: "/repo", subject: "a sign-in screen" });
  await api.copyFirstPrompt("/repo", "a sign-in screen");
  expect(mocks.invoke).toHaveBeenLastCalledWith("onboarding:copy", { kind: "firstPrompt", root: "/repo", subject: "a sign-in screen" });
});

test("window visibility: the current value is asked for, and later changes follow", async () => {
  mocks.invoke.mockResolvedValueOnce({ visible: true });
  const listener = vi.fn();
  const stop = api.onWindowVisible(listener);
  expect(mocks.invoke).toHaveBeenLastCalledWith("window:visible");
  await Promise.resolve(); await Promise.resolve();
  emitter.emit("window:visible", {}, { visible: false });
  expect(listener.mock.calls).toEqual([[true], [false]]);
  stop();
  expect(emitter.listenerCount("window:visible")).toBe(0);
});

test("setup status: the current value is asked for, and an event that came first wins", async () => {
  let resolve: (value: unknown) => void = () => { throw new Error("no initial read"); };
  mocks.invoke.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const listener = vi.fn();
  const stop = api.onSetupStatus(listener);
  expect(mocks.invoke).toHaveBeenCalledWith("setup:status");
  emitter.emit("setup:status", {}, { summary: null, causes: {}, checking: true, busy: false, onboardingClosed: false });
  resolve({ summary: null, causes: {}, checking: false, busy: false, onboardingClosed: false });
  await Promise.resolve();
  expect(listener).toHaveBeenCalledExactlyOnceWith({ summary: null, causes: {}, checking: true, busy: false, onboardingClosed: false });
  stop();
  expect(emitter.listenerCount("setup:status")).toBe(0);
});

test("settings, install pages and forwarded row actions use their channels", async () => {
  await api.openSettings({ tab: "projects", project: "/repo" });
  expect(mocks.invoke).toHaveBeenLastCalledWith("settings:open", { tab: "projects", project: "/repo" });
  await api.openInstallPage("claude");
  expect(mocks.invoke).toHaveBeenLastCalledWith("setup:open-external", { target: "claude" });
  const listener = vi.fn();
  const stop = api.onProjectAction(listener);
  emitter.emit("projects:action", {}, { path: "/repo", action: "remove" });
  stop();
  emitter.emit("projects:action", {}, { path: "/repo", action: "remove" });
  expect(listener).toHaveBeenCalledExactlyOnceWith({ path: "/repo", action: "remove" });
});

test("conversation listener precedes read and drains the final buffered event without resubscribing", async () => {
  const { mergeEvents } = await import("../main/conversation/state");
  type Event = import("../main/conversation/types").ConversationEvent;
  const first: Event = { v: 1, conversationId: "c", seq: 1, turnId: "t", at: "2026-10-27T00:00:00.000Z", type: "turn.started" };
  const final: Event = { ...first, seq: 2, type: "turn.done" };
  const buffer: Event[] = []; let reading = true; let events: Event[] = [];
  const stop = api.onConversationEvent(event => { if (reading) buffer.push(event); else events = mergeEvents(events, [event], "c"); });
  mocks.invoke.mockImplementation(async () => {
    expect(emitter.listenerCount("conversation:event")).toBe(1);
    emitter.emit("conversation:event", {}, first); emitter.emit("conversation:event", {}, final);
    return { events: [first], lastSeq: 1, turn: "streaming" };
  });
  const snapshot = await api.readConversation({ conversationId: "c" });
  if ("error" in snapshot) throw new Error(snapshot.error);
  events = mergeEvents(snapshot.events, buffer.splice(0), "c");
  while (buffer.length) events = mergeEvents(events, buffer.splice(0), "c");
  reading = false;
  expect(events).toEqual([first, final]); expect(emitter.listenerCount("conversation:event")).toBe(1);
  stop(); expect(emitter.listenerCount("conversation:event")).toBe(0);
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

test("types a check reply that may start no attempt, unlike a sign-in reply", async () => {
  mocks.invoke.mockResolvedValue({ ok: true });
  const check = await api.checkAgentAuth("copilot"), signIn = await api.signInAgent("copilot");
  if (check.ok) {
    // @ts-expect-error A version-cause check succeeds without an attempt.
    const attempt: string = check.attemptId;
    expect(attempt).toBeUndefined();
  }
  if (signIn.ok) { const attempt: string = signIn.attemptId; expect(attempt).toBeUndefined(); }
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

test("design skills read through two fixed channels and pass the id as data", async () => {
  const reply = { v: 1, ok: true, result: { version: "dev", presets: [] } };
  mocks.invoke.mockResolvedValueOnce(reply);
  expect(await api.designSkills.list()).toBe(reply);
  expect(mocks.invoke).toHaveBeenLastCalledWith("design-skills:list");
  await api.designSkills.get("clarify");
  expect(mocks.invoke).toHaveBeenLastCalledWith("design-skills:get", { id: "clarify" });
  expect(Object.keys(api.designSkills).sort()).toEqual(["get", "list"]);
});

// buzz-add-projects: the page's project session mirrors the onboarding session's project calls on its own channels.
test("Add Projects page calls use their own fixed channels and pass the request as data", async () => {
  const ids = { sessionId: "s", requestId: "r" };
  await api.readAddPage(); expect(mocks.invoke).toHaveBeenLastCalledWith("add-projects:read", {});
  await api.readAddPage({ sessionId: "s", operationId: "o" }); expect(mocks.invoke).toHaveBeenLastCalledWith("add-projects:read", { sessionId: "s", operationId: "o" });
  await api.inspectAddPageProject({ ...ids, path: "/work/studio" }); expect(mocks.invoke).toHaveBeenLastCalledWith("add-projects:inspect", { ...ids, path: "/work/studio" });
  await api.inspectAddPageProject({ ...ids, url: "https://github.com/acme/studio", destination: "/work/studio" });
  expect(mocks.invoke).toHaveBeenLastCalledWith("add-projects:inspect", { ...ids, url: "https://github.com/acme/studio", destination: "/work/studio" });
  await api.selectAddPageProject({ ...ids, inspectionId: "i", path: "/work/studio", initialize: true });
  expect(mocks.invoke).toHaveBeenLastCalledWith("add-projects:select", { ...ids, inspectionId: "i", path: "/work/studio", initialize: true });
  await api.cloneAddPageProject({ ...ids, inspectionId: "i", destination: "/work/studio" });
  expect(mocks.invoke).toHaveBeenLastCalledWith("add-projects:clone", { ...ids, inspectionId: "i", destination: "/work/studio" });
  await api.cancelAddPageOperation({ ...ids, operationId: "o" }); expect(mocks.invoke).toHaveBeenLastCalledWith("add-projects:cancel", { ...ids, operationId: "o" });
  // The folder sheet is first run's, which belongs to no session.
  await api.chooseOnboardingFolder("project"); expect(mocks.invoke).toHaveBeenLastCalledWith("onboarding:choose-folder", "project");
});

test("Add Projects page changes and the menu's open request are subscriptions that unsubscribe", () => {
  const changed = vi.fn(); const stopChanged = api.onAddPageSession(changed);
  const open = vi.fn(); const stopOpen = api.onOpenAddProjects(open);
  const state = { sessionId: "s", revision: 1, project: null, operations: [] };
  emitter.emit("add-projects:changed", {}, state);
  emitter.emit("add-projects:open", {});
  expect(changed).toHaveBeenCalledExactlyOnceWith(state);
  expect(open).toHaveBeenCalledOnce();
  expect(open.mock.calls[0]).toEqual([]);
  stopChanged(); stopOpen();
  expect(emitter.listenerCount("add-projects:changed")).toBe(0);
  expect(emitter.listenerCount("add-projects:open")).toBe(0);
});

test("a dropped item's disk path is read in the preload; one the page made itself has none", () => {
  mocks.pathForFile.mockImplementation((file) => (file as { name: string }).name === "folder" ? "/work/studio" : "");
  expect(api.droppedPath({ name: "folder" } as unknown as File)).toBe("/work/studio");
  expect(api.droppedPath({ name: "made-in-page" } as unknown as File)).toBeNull();
  expect(mocks.invoke).not.toHaveBeenCalled();
});

// buzz-settings S2: the Settings page and the Project Settings dialog live in the main window.
test("settings page calls use fixed channels and pass their requests as data", async () => {
  const calls: [() => Promise<unknown>, unknown[]][] = [
    [() => api.readPreferences(), ["preferences:read"]],
    [() => api.savePreferences({ notifications: { finished: false } }), ["preferences:write", { notifications: { finished: false } }]],
    [() => api.savePreferences({ newConversation: null }), ["preferences:write", { newConversation: null }]],
    [() => api.sendTestNotification(), ["notifications:test"]],
    [() => api.openNotificationSettings(), ["notifications:open-settings"]],
    [() => api.readAbout(), ["about:read"]],
    [() => api.copyAbout(), ["about:copy"]],
    [() => api.startConfigSession(), ["config:session-start"]],
    [() => api.endConfigSession(), ["config:session-end"]],
    [() => api.readConfig("/repo"), ["config:read", { root: "/repo" }]],
    [() => api.chooseConfigPath("/repo", "serve"), ["config:choose", { root: "/repo", kind: "serve" }]],
    [() => api.writeConfig({ root: "/repo", op: "removeServe", path: "styles" }), ["config:write", { root: "/repo", op: "removeServe", path: "styles" }]],
    [() => api.readSetup("r1"), ["setup:read", { requestId: "r1" }]],
    [() => api.runSetupStep({ step: "cli", expected: {} } as never), ["setup:run", { step: "cli", expected: {} }]],
    [() => api.answerSetupConfirm({ id: "q", allow: false }), ["setup:answer", { id: "q", allow: false }]],
  ];
  for (const [call, args] of calls) {
    await call();
    expect(mocks.invoke).toHaveBeenLastCalledWith(...args);
  }
});

test("notification clicks and the open-Settings command are subscriptions that unsubscribe", () => {
  const clicked = vi.fn();
  const opened = vi.fn();
  const stopClick = api.onNotificationClick(clicked);
  const stopOpen = api.onOpenSettingsPage(opened);
  emitter.emit("notifications:click", {}, { conversationId: "c1", root: "/repo" });
  emitter.emit("settings-page:open", {}, { section: "agents", provider: "codex" });
  stopClick();
  stopOpen();
  emitter.emit("notifications:click", {}, { conversationId: "c2", root: "/repo" });
  emitter.emit("settings-page:open", {}, {});
  expect(clicked).toHaveBeenCalledExactlyOnceWith({ conversationId: "c1", root: "/repo" });
  expect(opened).toHaveBeenCalledExactlyOnceWith({ section: "agents", provider: "codex" });
  expect(emitter.listenerCount("notifications:click") + emitter.listenerCount("settings-page:open")).toBe(0);
});
