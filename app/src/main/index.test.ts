import { beforeEach, describe, expect, test, vi } from "vitest";
import type { BrowserWindowConstructorOptions, MenuItemConstructorOptions } from "electron";

const OUTCOME = { added: ["/repo"], duplicate: null, messages: [], scanId: null, confirms: [] };

const mocks = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  class Window extends EventEmitter {
    static instances: Window[] = [];
    destroyed = false;
    contentsDestroyed = false;
    webContents = Object.assign(new EventEmitter(), { send: vi.fn(), isDestroyed: () => this.contentsDestroyed, debugger: { name: "debugger" },
      executeJavaScript: vi.fn(async () => ({ x: 0, y: 0, width: 800, height: 500 })),
      capturePage: vi.fn(async () => ({ isEmpty: () => false, resize: () => ({ toPNG: () => Buffer.from("png") }) })) });
    show = vi.fn();
    hide = vi.fn();
    isFullScreen = vi.fn(() => false);
    setFullScreen = vi.fn();
    close = vi.fn();
    destroy = vi.fn(() => { this.destroyed = true; });
    setContentSize = vi.fn();
    isDestroyed = () => this.destroyed;
    loadFile = vi.fn();
    loadURL = vi.fn();
    constructor(readonly options: BrowserWindowConstructorOptions) {
      super();
      Window.instances.push(this);
    }
  }
  return {
    Window,
    app: Object.assign(new EventEmitter(), { setName: vi.fn(), whenReady: vi.fn<() => Promise<void>>(), isPackaged: true, getPath: () => "/tmp/doan-index-test", getVersion: () => "9.8.7", exit: vi.fn(), quit: vi.fn(), requestSingleInstanceLock: vi.fn(() => true) }),
    ipc: new Map<string, (...args: unknown[]) => unknown>(),
    shell: { tokenBase: "http://127.0.0.1:1/t/tok/", entries: vi.fn<() => { path: string; kind?: string }[]>(() => []), open: vi.fn<() => Promise<{ root: string } | { refused: string }>>(), reopen: vi.fn(), initialize: vi.fn(), epoch: vi.fn(), dispose: vi.fn(),
      store: vi.fn(), remove: vi.fn(), restore: vi.fn(), replace: vi.fn(), rereadAll: vi.fn() },
    flow: { add: vi.fn(), scan: vi.fn(), cancel: vi.fn(), addCandidates: vi.fn(), confirm: vi.fn(), judge: vi.fn() },
    createAddFlow: vi.fn(),
    electronShell: { showItemInFolder: vi.fn() },
    // AppKit notifications by name, as main last subscribed to them.
    notifications: new Map<string, () => void>(),
    startShell: vi.fn(),
    cliCommand: vi.fn(() => "/bundled/doan"),
    runtime: { socket: "/tmp/doan-x/app.sock", token: "t", file: "/tmp/doan-index-test/runtime.json", disposeSync: vi.fn() },
    startRuntime: vi.fn(),
    sessionOn: vi.fn(),
    inspector: { inspect: vi.fn() },
    createInspector: vi.fn(),
    mkdir: vi.fn(),
    machine: { read: vi.fn(), run: vi.fn(), answer: vi.fn(), cancelConfirmation: vi.fn(), isBusy: vi.fn(() => false) },
    createMachine: vi.fn(),
    needsOnboarding: vi.fn(), markClosed: vi.fn(), clipboard: { writeText: vi.fn() },
    menu: vi.fn<(template: MenuItemConstructorOptions[]) => unknown>(),
    dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
    uiState: { read: vi.fn(), save: vi.fn(), flushSync: vi.fn(), idle: vi.fn() },
    createUiStateStore: vi.fn(),
    thumbnails: { get: vi.fn(), entriesChanged: vi.fn(), removed: vi.fn(), pause: vi.fn(), resume: vi.fn(), dispose: vi.fn() },
    createThumbnails: vi.fn(),
  };
});

vi.mock("electron", () => ({
  clipboard: mocks.clipboard, app: mocks.app, BrowserWindow: mocks.Window, shell: mocks.electronShell,
  dialog: mocks.dialog,
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => mocks.ipc.set(channel, handler) },
  Menu: { buildFromTemplate: mocks.menu, setApplicationMenu: vi.fn() },
  session: { defaultSession: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn(), on: mocks.sessionOn } },
  webFrameMain: { fromId: vi.fn() },
  systemPreferences: { subscribeLocalNotification: (name: string, callback: () => void) => { mocks.notifications.set(name, callback); return mocks.notifications.size; } },
}));
vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdir }));
vi.mock("./onboarding/machine", () => ({ createMachine: mocks.createMachine, needsOnboarding: mocks.needsOnboarding, markClosed: mocks.markClosed, PATH_LINE: 'export PATH="$HOME/.local/bin:$PATH"' }));
vi.mock("./cli", () => ({ cliCommand: mocks.cliCommand }));
vi.mock("./shell", () => ({ startShell: mocks.startShell }));
vi.mock("./runtime", () => ({ startRuntime: mocks.startRuntime }));
vi.mock("./addProjects", async (importOriginal) => ({ ...await importOriginal<typeof import("./addProjects")>(), createAddFlow: mocks.createAddFlow }));
vi.mock("./inspector", async (importOriginal) => ({ ...await importOriginal<typeof import("./inspector")>(), createInspector: mocks.createInspector }));
vi.mock("./uiState", () => ({ createUiStateStore: mocks.createUiStateStore }));
vi.mock("./thumbnails", () => ({ createThumbnails: mocks.createThumbnails }));

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.app.removeAllListeners();
  mocks.Window.instances.length = 0;
  mocks.ipc.clear();
  mocks.needsOnboarding.mockResolvedValue(true);
  mocks.markClosed.mockResolvedValue(undefined);
  mocks.createMachine.mockReturnValue(mocks.machine);
  mocks.machine.read.mockResolvedValue({ requestId: "r" });
  mocks.machine.run.mockResolvedValue({ kind: "success" });
  mocks.machine.isBusy.mockReturnValue(false);
  mocks.app.whenReady.mockResolvedValue();
  mocks.startShell.mockResolvedValue(mocks.shell);
  mocks.startRuntime.mockResolvedValue(mocks.runtime);
  mocks.createInspector.mockReturnValue(mocks.inspector);
  mocks.inspector.inspect.mockResolvedValue({ ok: true, rows: [] });
  mocks.app.requestSingleInstanceLock.mockReturnValue(true);
  mocks.shell.entries.mockReturnValue([]);
  mocks.shell.open.mockResolvedValue({ root: "/repo" });
  mocks.shell.epoch.mockReturnValue(1);
  mocks.shell.initialize.mockResolvedValue({ kind: "success" });
  mocks.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
  mocks.createAddFlow.mockReturnValue(mocks.flow);
  mocks.flow.add.mockResolvedValue(OUTCOME);
  mocks.createUiStateStore.mockReturnValue(mocks.uiState);
  mocks.createThumbnails.mockReturnValue(mocks.thumbnails);
  mocks.thumbnails.removed.mockResolvedValue(undefined);
  await import("./index");
  await vi.waitFor(() => expect(mocks.Window.instances).toHaveLength(1));
});

function window() {
  const window = mocks.Window.instances[0];
  if (!window) throw new Error("no window");
  return window;
}
function invoke(channel: string, sender: unknown, parent: unknown, path?: unknown) {
  const handler = mocks.ipc.get(channel);
  if (!handler) throw new Error(`missing handler ${channel}`);
  return handler({ sender, senderFrame: { parent } }, path);
}
// The menu is rebuilt whenever its enablement changes; the last build is live.
function template(): MenuItemConstructorOptions[] {
  return mocks.menu.mock.calls.at(-1)?.[0] ?? [];
}
function item(label: string): MenuItemConstructorOptions {
  const template = mocks.menu.mock.calls.at(-1)?.[0] ?? [];
  for (const menu of template) {
    if (Array.isArray(menu.submenu)) {
      const found = menu.submenu.find((candidate) => candidate.label === label);
      if (found) return found;
    }
  }
  throw new Error(`missing menu item ${label}`);
}

test("guards reopen by sender frame and path type", async () => {
  const contents = window().webContents;
  await invoke("folders:reopen", contents, null, "/repo");
  expect(mocks.shell.reopen).toHaveBeenCalledExactlyOnceWith("/repo");
  mocks.shell.reopen.mockClear();
  for (const path of [null, undefined, 3, {}, []]) await invoke("folders:reopen", contents, null, path);
  await invoke("folders:reopen", contents, {}, "/repo");
  await invoke("folders:reopen", {}, null, "/repo");
  expect(mocks.shell.reopen).not.toHaveBeenCalled();
});

test.each(["window", "contents"])("does not send to destroyed %s", (target) => {
  const click = item("Zoom In").click;
  const send = () => Reflect.apply(click ?? (() => { throw new Error("no click handler"); }), undefined, []);
  const changed = mocks.startShell.mock.calls[0]?.[2];
  if (typeof changed !== "function") throw new Error("no folder listener");
  send();
  changed([]);
  expect(window().webContents.send).toHaveBeenCalledTimes(2);
  window().webContents.send.mockClear();
  if (target === "window") window().destroyed = true;
  else window().contentsDestroyed = true;
  send();
  changed([]);
  expect(window().webContents.send).not.toHaveBeenCalled();
});

test("defines the requested window geometry and File menu", () => {
  expect(window().options).toMatchObject({ width: 1238, height: 780, minWidth: 960, minHeight: 600, titleBarStyle: "hiddenInset", trafficLightPosition: { x: 12, y: 14 } });
  expect(item("Add Project…").accelerator).toBe("CmdOrCtrl+O");
  expect(item("Close Window").accelerator).toBe("CmdOrCtrl+W");
});

test("hides on close and shows the same window on activate", () => {
  const event = { preventDefault: vi.fn() };
  window().emit("close", event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(window().hide).toHaveBeenCalledOnce();
  mocks.app.emit("activate");
  expect(window().show).toHaveBeenCalledOnce();
  expect(mocks.Window.instances).toHaveLength(1);
  mocks.app.emit("before-quit");
  const quitting = { preventDefault: vi.fn() };
  window().emit("close", quitting);
  expect(quitting.preventDefault).not.toHaveBeenCalled();
});

test("shows the window before the Open Project dialog", async () => {
  await invoke("folders:open", window().webContents, null);
  expect(window().show).toHaveBeenCalledOnce();
  expect(mocks.dialog.showOpenDialog).toHaveBeenCalled();
});

test("Open Project resolves the stored root, or null when cancelled, refused or untrusted", async () => {
  const contents = window().webContents;
  expect(await invoke("folders:open", contents, null)).toBeNull();
  mocks.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/repo/design"] });
  mocks.shell.open.mockResolvedValueOnce({ root: "/repo" });
  expect(await invoke("folders:open", contents, null)).toBe("/repo");
  expect(mocks.shell.open).toHaveBeenLastCalledWith("/repo/design");
  mocks.shell.open.mockResolvedValueOnce({ refused: "Cannot read config" });
  expect(await invoke("folders:open", contents, null)).toBeNull();
  expect(mocks.dialog.showMessageBox).toHaveBeenCalledWith(window(), expect.objectContaining({ type: "error", detail: "Cannot read config" }));
  mocks.shell.open.mockClear();
  expect(await invoke("folders:open", contents, {})).toBeNull();
  expect(mocks.shell.open).not.toHaveBeenCalled();
});


test("ignores activate without a window and disposes only on quit", () => {
  window().emit("closed");
  mocks.app.emit("activate");
  expect(mocks.Window.instances).toHaveLength(1);
  expect(window().show).not.toHaveBeenCalled();
  expect(mocks.shell.dispose).not.toHaveBeenCalled();
  mocks.app.emit("will-quit");
  expect(mocks.shell.dispose).toHaveBeenCalledOnce();
});

test("File menu opens the add picker and closes the window", async () => {
  const open = item("Add Project…").click;
  Reflect.apply(open ?? (() => { throw new Error("no open handler"); }), undefined, []);
  await vi.waitFor(() => expect(mocks.dialog.showOpenDialog).toHaveBeenCalledOnce());
  expect(window().show).toHaveBeenCalledOnce();
  const close = item("Close Window").click;
  Reflect.apply(close ?? (() => { throw new Error("no close handler"); }), undefined, []);
  expect(window().close).toHaveBeenCalledOnce();
});


test("ignores activate while startShell is pending before the first window", async () => {
  vi.resetModules();
  mocks.app.removeAllListeners();
  mocks.Window.instances.length = 0;
  mocks.ipc.clear();
  let finish = (_shell: typeof mocks.shell): void => { throw new Error("pending shell did not start"); };
  const pending = new Promise<typeof mocks.shell>((resolve) => { finish = resolve; });
  mocks.startShell.mockReturnValueOnce(pending);
  await import("./index");
  await vi.waitFor(() => expect(mocks.startShell).toHaveBeenCalledTimes(2));

  mocks.app.emit("activate");
  expect(mocks.Window.instances).toHaveLength(0);
  expect(mocks.dialog.showOpenDialog).not.toHaveBeenCalled();
  expect(mocks.shell.dispose).not.toHaveBeenCalled();

  finish(mocks.shell);
  await vi.waitFor(() => expect(mocks.Window.instances).toHaveLength(1));
  expect(window().show).not.toHaveBeenCalled();
});


test("leaves fullscreen before hiding on close and reuses the window on activate", () => {
  window().isFullScreen.mockReturnValue(true);
  const event = { preventDefault: vi.fn() };
  window().emit("close", event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(window().setFullScreen).toHaveBeenCalledExactlyOnceWith(false);
  expect(window().hide).not.toHaveBeenCalled();
  window().emit("leave-full-screen");
  expect(window().hide).toHaveBeenCalledOnce();
  window().emit("leave-full-screen");
  expect(window().hide).toHaveBeenCalledOnce();
  mocks.app.emit("activate");
  expect(window().show).toHaveBeenCalledOnce();
  expect(mocks.Window.instances).toHaveLength(1);
});

test("does not intercept fullscreen close while quitting", () => {
  window().isFullScreen.mockReturnValue(true);
  mocks.app.emit("before-quit");
  const event = { preventDefault: vi.fn() };
  window().emit("close", event);
  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(window().setFullScreen).not.toHaveBeenCalled();
  expect(window().hide).not.toHaveBeenCalled();
});

test.each(["activate", "open"])("cancels pending fullscreen hide on %s", async (action) => {
  window().isFullScreen.mockReturnValue(true);
  window().emit("close", { preventDefault: vi.fn() });
  if (action === "activate") mocks.app.emit("activate");
  else await invoke("folders:open", window().webContents, null);
  expect(window().show).toHaveBeenCalledOnce();
  expect(window().listenerCount("leave-full-screen")).toBe(0);
  window().emit("leave-full-screen");
  expect(window().hide).not.toHaveBeenCalled();
});

test("expires a fullscreen hide request when the transition event never arrives", () => {
  vi.useFakeTimers();
  try {
    window().isFullScreen.mockReturnValue(true);
    window().emit("close", { preventDefault: vi.fn() });
    vi.runAllTimers();
    expect(window().listenerCount("leave-full-screen")).toBe(0);
    window().emit("leave-full-screen");
    expect(window().hide).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

const ROOT = "/Users/sam/code/app";
const SELECTION = { root: ROOT, canvas: { path: "design/a.html", id: "a" }, element: { selector: "button", html: "<button>Go</button>" } };

function runtimeState() {
  const state = mocks.startRuntime.mock.calls[0]?.[1] as { isOpen(root: string): boolean; selection(): unknown } | undefined;
  if (!state) throw new Error("runtime not started");
  return state;
}

test("starts the runtime in userData with the open projects", () => {
  expect(mocks.startRuntime).toHaveBeenCalledOnce();
  expect(mocks.startRuntime.mock.calls[0]?.[0]).toBe("/tmp/doan-index-test");
  mocks.shell.entries.mockReturnValue([{ path: ROOT }]);
  expect(runtimeState().isOpen(ROOT)).toBe(true);
  expect(runtimeState().isOpen(`${ROOT}/`)).toBe(false);
  expect(runtimeState().isOpen("/Users/sam/code")).toBe(false);
  expect(runtimeState().selection()).toBeNull();
});

test("keeps the selection the window sets, after the schema check", async () => {
  mocks.shell.entries.mockReturnValue([{ path: ROOT }]);
  const contents = window().webContents;
  await invoke("selection:set", contents, null, SELECTION);
  expect(runtimeState().selection()).toEqual(SELECTION);
  await invoke("selection:set", contents, null, null);
  expect(runtimeState().selection()).toBeNull();
  await invoke("selection:set", contents, null, SELECTION);
  // Invalid input clears rather than leaving an older selection the human no longer sees.
  for (const bad of [undefined, 3, "x", {}, { ...SELECTION, extra: 1 }, { ...SELECTION, element: { ...SELECTION.element, text: "x".repeat(501) } }]) {
    await invoke("selection:set", contents, null, SELECTION);
    await invoke("selection:set", contents, null, bad);
    expect(runtimeState().selection(), JSON.stringify(bad)).toBeNull();
  }
});

test("refuses a selection for a project that is not open", async () => {
  mocks.shell.entries.mockReturnValue([{ path: "/Users/sam/code/other" }]);
  await invoke("selection:set", window().webContents, null, SELECTION);
  expect(runtimeState().selection()).toBeNull();
});

test("ignores selection:set from other senders", async () => {
  mocks.shell.entries.mockReturnValue([{ path: ROOT }]);
  const contents = window().webContents;
  await invoke("selection:set", contents, null, SELECTION);
  const other = { ...SELECTION, canvas: { path: "design/b.html" } };
  await invoke("selection:set", contents, {}, other);
  await invoke("selection:set", {}, null, other);
  await invoke("selection:set", contents, {}, null);
  expect(runtimeState().selection()).toEqual(SELECTION);
});

test("clears only the removed project selection", async () => {
  mocks.shell.remove.mockImplementation(async (paths: string[]) => ({ paths, indexes: [0] }));
  mocks.shell.entries.mockReturnValue([{ path: ROOT }, { path: "/Users/sam/code/other" }]);
  const contents = window().webContents;
  await invoke("selection:set", contents, null, SELECTION);
  await invoke("folders:remove", contents, null, { paths: ["/Users/sam/code/other"] });
  expect(runtimeState().selection()).toEqual(SELECTION);
  await invoke("folders:remove", contents, null, { paths: [ROOT] });
  expect(mocks.shell.remove).toHaveBeenCalledWith([ROOT]);
  expect(runtimeState().selection()).toBeNull();
});

test.each(["render-process-gone", "did-navigate"])("clears the selection on %s", async (event) => {
  mocks.shell.entries.mockReturnValue([{ path: ROOT }]);
  await invoke("selection:set", window().webContents, null, SELECTION);
  window().webContents.emit("did-navigate-in-page");
  window().webContents.emit("did-frame-navigate", {}, "http://127.0.0.1:1/t/tok/k/a.html", 200, "OK", false, 1, 2);
  expect(runtimeState().selection()).toEqual(SELECTION);
  window().webContents.emit(event);
  expect(runtimeState().selection()).toBeNull();
});

test("cancels every download in the session", () => {
  const handler = mocks.sessionOn.mock.calls.find(([name]) => name === "will-download")?.[1] as ((event: { preventDefault(): void }) => void) | undefined;
  if (!handler) throw new Error("no will-download handler");
  const event = { preventDefault: vi.fn() };
  handler(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
});

test("removes the runtime files synchronously on will-quit", () => {
  expect(mocks.runtime.disposeSync).not.toHaveBeenCalled();
  mocks.app.emit("will-quit");
  expect(mocks.runtime.disposeSync).toHaveBeenCalledOnce();
});

test("still opens the window when the runtime cannot start", async () => {
  vi.resetModules();
  mocks.app.removeAllListeners();
  mocks.Window.instances.length = 0;
  mocks.ipc.clear();
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    mocks.startRuntime.mockRejectedValueOnce(new Error("listen EADDRINUSE"));
    await import("./index");
    await vi.waitFor(() => expect(mocks.Window.instances).toHaveLength(1));
    expect(mocks.app.exit).not.toHaveBeenCalled();
    expect(() => mocks.app.emit("will-quit")).not.toThrow();
  } finally { error.mockRestore(); }
});

test("shows the existing window when a second instance starts", () => {
  window().hide();
  mocks.app.emit("second-instance");
  expect(window().show).toHaveBeenCalledOnce();
  expect(mocks.Window.instances).toHaveLength(1);
});

test("a second instance quits without starting", async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.app.removeAllListeners();
  mocks.Window.instances.length = 0;
  mocks.ipc.clear();
  mocks.app.requestSingleInstanceLock.mockReturnValue(false);
  await import("./index");
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(mocks.app.quit).toHaveBeenCalledOnce();
  expect(mocks.app.whenReady).not.toHaveBeenCalled();
  expect(mocks.startShell).not.toHaveBeenCalled();
  expect(mocks.startRuntime).not.toHaveBeenCalled();
  expect(mocks.Window.instances).toHaveLength(0);
});

test("creates one inspector on the window's debugger with the token base", () => {
  expect(mocks.createInspector).toHaveBeenCalledOnce();
  const [debuggerArg, base] = mocks.createInspector.mock.calls[0] ?? [];
  expect(debuggerArg).toBe(window().webContents.debugger);
  expect(typeof base === "function" ? base() : undefined).toBe(mocks.shell.tokenBase);
});

test("inspect:get answers the window with the inspector's result", async () => {
  const rows = [{ group: "box", label: "Width", value: "10px", state: "hardcoded" }];
  mocks.inspector.inspect.mockResolvedValueOnce({ ok: true, rows });
  expect(await invoke("inspect:get", window().webContents, null, { selector: "#a" })).toEqual({ ok: true, rows });
  expect(mocks.inspector.inspect).toHaveBeenCalledExactlyOnceWith("#a");
});

test("inspect:get refuses other senders and bad requests without inspecting", async () => {
  const contents = window().webContents;
  expect(await invoke("inspect:get", contents, {}, { selector: "#a" })).toMatchObject({ ok: false });
  expect(await invoke("inspect:get", {}, null, { selector: "#a" })).toMatchObject({ ok: false });
  for (const bad of [undefined, "#a", { selector: "" }, { selector: "a".repeat(1001) }, { selector: "#a", more: 1 }]) {
    expect(await invoke("inspect:get", contents, null, bad)).toMatchObject({ ok: false });
  }
  expect(mocks.inspector.inspect).not.toHaveBeenCalled();
});

test.each(["list", "begin", "mutate", "status", "author", "copy"])("comments %s refuses iframe and other-window callers", async method => {
  for (const [sender, parent] of [[window().webContents, {}], [{}, null]]) {
    expect(await invoke(`comments:${method}`, sender, parent, {})).toEqual({ ok: false, identity: null, error: "The request was refused." });
  }
  expect(await invoke(`comments:${method}`, window().webContents, null, { forged: true })).toMatchObject({ ok: false });
});

test("a guarded quit waits for a matching main-frame acknowledgement", async () => {
  await invoke("comments:guard", window().webContents, null, true);
  const event = { preventDefault: vi.fn() };
  mocks.app.emit("before-quit", event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  const call = window().webContents.send.mock.calls.find(call => call[0] === "comments:transition");
  expect(call?.[1]).toMatchObject({ kind: "quit" });
  await invoke("comments:transition-answer", window().webContents, {}, { id: call?.[1].id, allow: true });
  expect(mocks.app.quit).not.toHaveBeenCalled();
  await invoke("comments:transition-answer", window().webContents, null, { id: call?.[1].id, allow: true });
  expect(mocks.app.quit).toHaveBeenCalledOnce();
});

test("project setup IPC rejects untrusted frames, arbitrary paths and forged choices", async () => {
  for (const channel of ["project:choose-token-css", "project:init"]) {
    expect(await invoke(channel, {}, null, { root: ROOT, choiceId: null })).toMatchObject({ kind: "unavailable" });
    expect(await invoke(channel, window().webContents, {}, { root: ROOT, choiceId: null })).toMatchObject({ kind: "unavailable" });
    expect(await invoke(channel, window().webContents, null, { root: ROOT, choiceId: null })).toMatchObject({ kind: "unavailable" });
  }
  mocks.shell.entries.mockReturnValue([{ path: ROOT, kind: "uninitialized" }]);
  for (const request of [{ root: ROOT, choiceId: "forged" }, { root: ROOT, choiceId: null, tokenCss: "/arbitrary" }, null, { root: ROOT }]) {
    expect(await invoke("project:init", window().webContents, null, request)).toMatchObject({ kind: "unavailable" });
  }
  expect(mocks.shell.initialize).not.toHaveBeenCalled();
  expect(mocks.dialog.showOpenDialog).not.toHaveBeenCalled();
});

test("CSS picker cancellation and choice IDs stay bound to the folder epoch", async () => {
  mocks.shell.entries.mockReturnValue([{ path: ROOT, kind: "uninitialized" }]);
  expect(await invoke("project:choose-token-css", window().webContents, null, { root: ROOT })).toEqual({ kind: "cancelled" });
  expect(mocks.dialog.showOpenDialog).toHaveBeenCalledWith(window(), { properties: ["openFile"], defaultPath: ROOT, filters: [{ name: "CSS", extensions: ["css"] }] });
  mocks.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [ROOT + "/tokens.css"] });
  const picked = await invoke("project:choose-token-css", window().webContents, null, { root: ROOT });
  expect(picked).toMatchObject({ kind: "selected", path: ROOT + "/tokens.css", choiceId: expect.any(String) });
  if (typeof picked !== "object" || picked === null || !("choiceId" in picked)) throw new Error("no choice");
  expect(await invoke("project:init", window().webContents, null, { root: ROOT, choiceId: picked.choiceId })).toEqual({ kind: "success" });
  expect(mocks.shell.initialize).toHaveBeenCalledWith(ROOT, ROOT + "/tokens.css");
  mocks.shell.initialize.mockClear(); mocks.shell.epoch.mockReturnValue(2);
  expect(await invoke("project:init", window().webContents, null, { root: ROOT, choiceId: picked.choiceId })).toMatchObject({ kind: "unavailable" });
  expect(mocks.shell.initialize).not.toHaveBeenCalled();
});

test("a picker finishing after its project closes cannot retain a choice", async () => {
  mocks.shell.entries.mockReturnValue([{ path: ROOT, kind: "uninitialized" }]);
  mocks.dialog.showOpenDialog.mockImplementation(async () => {
    mocks.shell.entries.mockReturnValue([]);
    return { canceled: false, filePaths: [ROOT + "/tokens.css"] };
  });
  expect(await invoke("project:choose-token-css", window().webContents, null, { root: ROOT })).toMatchObject({ kind: "unavailable" });
});

test("forwards the re-root focus mapping with folder updates", () => {
  const changed = mocks.startShell.mock.calls[0]?.[2];
  if (typeof changed !== "function") throw new Error("no listener");
  changed([], { from: "/old", root: ROOT });
  expect(window().webContents.send).toHaveBeenCalledWith("folders", [], { from: "/old", root: ROOT });
});

test("wires packaged CLI selection with the runtime environment", () => {
  expect(mocks.cliCommand).toHaveBeenCalledWith(process.env, true, process.resourcesPath);
  expect(mocks.startShell.mock.calls[0]?.[1]).toBe("/bundled/doan");
});


test.each([false, true])("onboarding menu preserves an open session (hidden: %s)", async hidden => {
  const contents = window().webContents;
  const first = await invoke("onboarding:get-open", contents, null);
  expect(first).toEqual({ session: expect.any(String) });
  const setup = item("Set Up doan…"); expect(setup.accelerator).toBeUndefined();
  const menu = mocks.menu.mock.calls[0]?.[0][0];
  expect(Array.isArray(menu?.submenu) && menu.submenu.slice(0, 2).map(i => i.role ?? i.label)).toEqual(["about", "Set Up doan…"]);
  mocks.machine.cancelConfirmation.mockClear();
  if (hidden) window().emit("close", { preventDefault: vi.fn() });
  Reflect.apply(setup.click!, undefined, []);
  expect(window().show).toHaveBeenCalled();
  expect(mocks.machine.cancelConfirmation).not.toHaveBeenCalled();
  expect(await invoke("onboarding:get-open", contents, null)).toEqual(first);
  expect(window().webContents.send).not.toHaveBeenCalledWith("onboarding:open", expect.anything());
  expect(mocks.markClosed).not.toHaveBeenCalled();
});
test("stale wizard read cannot publish after reopening and rejects iframe callers", async () => {
  const contents = window().webContents;
  const opened = await invoke("onboarding:get-open", contents, null) as { session: string };
  let finish!: (value: unknown) => void;
  mocks.machine.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const waiting = invoke("onboarding:read", contents, null, { session: opened.session, requestId: "r" });
  await invoke("onboarding:close", contents, null, opened);
  Reflect.apply(item("Set Up doan…").click!, undefined, []);
  finish({ requestId: "r" }); expect(await waiting).toEqual({ kind: "stale" });
  mocks.machine.run.mockClear();
  await invoke("onboarding:run", contents, {}, {}); await invoke("onboarding:run", {}, null, {});
  expect(mocks.machine.run).not.toHaveBeenCalled();
});
test("wizard close writes only when idle; window close and quit do not mark it closed", async () => {
  const contents = window().webContents;
  const opened = await invoke("onboarding:get-open", contents, null) as { session: string };
  window().emit("close", { preventDefault: vi.fn() });
  mocks.app.emit("before-quit", { preventDefault: vi.fn() }); expect(mocks.markClosed).not.toHaveBeenCalled();
  mocks.machine.isBusy.mockReturnValue(true);
  expect(await invoke("onboarding:close", contents, null, opened)).toEqual({ kind: "busy" });
  mocks.machine.isBusy.mockReturnValue(false);
  expect(await invoke("onboarding:close", contents, null, opened)).toEqual({ kind: "success" });
  expect(mocks.markClosed).toHaveBeenCalledExactlyOnceWith("/tmp/doan-index-test");
});
test("first prompt is read and copied only for a stored set-up project, after the clipboard settles", async () => {
  const contents = window().webContents;
  const sentence = `Use the doan skill to make a design canvas in ${ROOT} for <what you want to design>.`;
  mocks.shell.entries.mockReturnValue([{ path: ROOT, kind: "list" }, { path: "/plain", kind: "uninitialized" }]);
  expect(await invoke("onboarding:first-prompt", contents, null, { root: ROOT })).toBe(sentence);
  for (const request of [{ root: "/plain" }, { root: "/other" }, { root: ROOT, text: "forged" }, { root: 1 }, null, ROOT]) {
    expect(await invoke("onboarding:first-prompt", contents, null, request)).toBeNull();
  }
  expect(await invoke("onboarding:first-prompt", contents, {}, { root: ROOT })).toBeNull();
  expect(await invoke("onboarding:first-prompt", {}, null, { root: ROOT })).toBeNull();
  let finish!: () => void;
  mocks.clipboard.writeText.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  let settled = false;
  const copied = Promise.resolve(invoke("onboarding:copy", contents, null, { kind: "firstPrompt", root: ROOT })).then(value => { settled = true; return value; });
  await Promise.resolve(); expect(settled).toBe(false); finish();
  expect(await copied).toEqual({ kind: "success" });
  expect(mocks.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(sentence);
  mocks.clipboard.writeText.mockClear();
  for (const request of [{ kind: "firstPrompt", root: "/plain" }, { kind: "firstPrompt" }, { kind: "firstPrompt", root: ROOT, text: "forged" }, { kind: "firstPrompt", root: "/other" }]) {
    expect(await invoke("onboarding:copy", contents, null, request)).toEqual({ kind: "stale" });
  }
  expect(await invoke("onboarding:copy", contents, {}, { kind: "firstPrompt", root: ROOT })).toEqual({ kind: "stale" });
  expect(mocks.clipboard.writeText).not.toHaveBeenCalled();
  mocks.clipboard.writeText.mockRejectedValueOnce(new Error("denied"));
  expect(await invoke("onboarding:copy", contents, null, { kind: "firstPrompt", root: ROOT })).toEqual({ kind: "error", message: "denied" });
});

test("PATH copy awaits the clipboard and refuses arbitrary strings", async () => {
  let finish!: () => void;
  mocks.clipboard.writeText.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  let settled = false;
  const copied = Promise.resolve(invoke("onboarding:copy", window().webContents, null, { kind: "pathLine" })).then(value => { settled = true; return value; });
  await Promise.resolve(); expect(settled).toBe(false); finish();
  expect(await copied).toEqual({ kind: "success" });
  expect(mocks.clipboard.writeText).toHaveBeenCalledWith('export PATH="$HOME/.local/bin:$PATH"');
  mocks.clipboard.writeText.mockRejectedValueOnce(new Error("denied"));
  expect(await invoke("onboarding:copy", window().webContents, null, { kind: "pathLine" })).toMatchObject({ kind: "error" });
  mocks.clipboard.writeText.mockClear();
  await invoke("onboarding:copy", window().webContents, null, { kind: "pathLine", text: "forged" });
  expect(mocks.clipboard.writeText).not.toHaveBeenCalled();
});


test("the wizard's machine shows this app's version", async () => {
  await vi.waitFor(() => expect(mocks.createMachine).toHaveBeenCalledExactlyOnceWith({ command: "/bundled/doan", version: "9.8.7" }));
});

test("the setup menu still shows the window during an active machine operation", async () => {
  const initial = await invoke("onboarding:get-open", window().webContents, null);
  mocks.machine.isBusy.mockReturnValue(true);
  Reflect.apply(item("Set Up doan…").click!, undefined, []);
  expect(window().show).toHaveBeenCalled();
  expect(await invoke("onboarding:get-open", window().webContents, null)).toEqual(initial);
});

test("close failure closes this session and returns a logged warning", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const contents = window().webContents;
  const opened = await invoke("onboarding:get-open", contents, null);
  mocks.markClosed.mockRejectedValueOnce(new Error("disk full"));
  expect(await invoke("onboarding:close", contents, null, opened)).toEqual({ kind: "success", warning: "disk full" });
  expect(await invoke("onboarding:get-open", contents, null)).toBeNull();
  expect(warning).toHaveBeenCalledWith("Could not save onboarding dismissal:", "disk full");
  warning.mockRestore();
});

test("get-open clears a lost confirmation only for the app main frame", async () => {
  const contents = window().webContents;
  mocks.machine.cancelConfirmation.mockClear();
  await invoke("onboarding:get-open", {}, null);
  await invoke("onboarding:get-open", contents, {});
  expect(mocks.machine.cancelConfirmation).not.toHaveBeenCalled();
  await invoke("onboarding:get-open", contents, null);
  expect(mocks.machine.cancelConfirmation).toHaveBeenCalledOnce();
});


test("the onboarding menu starts a fresh session only after the wizard closes", async () => {
  const contents = window().webContents;
  const first = await invoke("onboarding:get-open", contents, null);
  expect(await invoke("onboarding:close", contents, null, first)).toEqual({ kind: "success" });
  Reflect.apply(item("Set Up doan…").click!, undefined, []);
  const second = await invoke("onboarding:get-open", contents, null);
  expect(second).toEqual({ session: expect.any(String) });
  expect(second).not.toEqual(first);
  expect(window().webContents.send).toHaveBeenCalledExactlyOnceWith("onboarding:open", second);
});

function click(label: string): void {
  const handler = item(label).click;
  if (!handler) throw new Error(`no click handler for ${label}`);
  Reflect.apply(handler, undefined, []);
}
function menuEnabled(label: string): boolean {
  return item(label).enabled !== false;
}
function submenu(label: string): MenuItemConstructorOptions[] {
  const menu = template().find((entry) => entry.label === label);
  if (!menu || !Array.isArray(menu.submenu)) throw new Error(`missing menu ${label}`);
  return menu.submenu;
}
const state = (screen: string, modal = false, toast = false) => ({ screen, modal, toast });

describe("menus", () => {
  test("pins the item names and accelerators", () => {
    expect(template().map((menu) => menu.label ?? menu.role)).toEqual(["doan", "File", "Edit", "View", "Go", "windowMenu"]);
    expect(submenu("File").map((entry) => entry.label ?? entry.type)).toEqual(["Add Project…", "separator", "Close Window"]);
    expect(item("Add Project…").accelerator).toBe("CmdOrCtrl+O");
    expect(item("Close Window").accelerator).toBe("CmdOrCtrl+W");
    expect(submenu("Go").map((entry) => [entry.label, entry.accelerator])).toEqual([["Home", "Shift+CmdOrCtrl+H"], ["Quick Open…", "CmdOrCtrl+K"]]);
    // Without a removal toast the system Undo keeps working in text fields.
    expect(submenu("Edit")[0]?.role).toBe("undo");
    expect(submenu("Edit").map((entry) => entry.role).filter(Boolean)).toEqual(expect.arrayContaining(["redo", "cut", "copy", "paste", "selectAll"]));
  });

  test("the app starts on Home, where only canvas-free items are enabled", () => {
    expect(menuEnabled("Add Project…")).toBe(true);
    expect(menuEnabled("Home")).toBe(false);
    for (const label of ["Zoom In", "Zoom Out", "Actual Size", "Fit", "Reload Canvas"]) expect(menuEnabled(label), label).toBe(false);
  });

  test("the renderer's screen sets which items are enabled", async () => {
    const contents = window().webContents;
    await invoke("menu:state", contents, null, state("canvas"));
    expect(menuEnabled("Home")).toBe(true);
    for (const label of ["Zoom In", "Zoom Out", "Actual Size", "Fit", "Reload Canvas"]) expect(menuEnabled(label), label).toBe(true);
    await invoke("menu:state", contents, null, state("workspace"));
    expect(menuEnabled("Home")).toBe(true);
    expect(menuEnabled("Zoom In")).toBe(false);
    await invoke("menu:state", contents, null, state("canvas", true, true));
    for (const label of ["Add Project…", "Home", "Zoom In"]) expect(menuEnabled(label), label).toBe(false);
    // A modal may hold a text field, so its ⌘Z stays a text undo.
    expect(submenu("Edit")[0]?.role).toBe("undo");
  });

  test("Undo Remove takes ⌘Z only while the removal toast is up", async () => {
    const contents = window().webContents;
    await invoke("menu:state", contents, null, state("home", false, true));
    expect(submenu("Edit")[0]).toMatchObject({ label: "Undo Remove", accelerator: "CmdOrCtrl+Z" });
    click("Undo Remove");
    expect(contents.send).toHaveBeenCalledWith("menu-command", "undoRemove");
    await invoke("menu:state", contents, null, state("home"));
    expect(submenu("Edit")[0]?.role).toBe("undo");
    expect(() => item("Undo Remove")).toThrow();
  });

  test("refuses bad menu states and other senders", async () => {
    const contents = window().webContents;
    const builds = mocks.menu.mock.calls.length;
    for (const bad of [null, "canvas", { screen: "canvas" }, state("settings"), { ...state("canvas"), more: 1 }, { screen: "canvas", modal: 1, toast: false }]) {
      await invoke("menu:state", contents, null, bad);
    }
    await invoke("menu:state", contents, {}, state("canvas"));
    await invoke("menu:state", {}, null, state("canvas"));
    expect(mocks.menu.mock.calls.length).toBe(builds);
    expect(menuEnabled("Zoom In")).toBe(false);
  });

  test.each(["did-navigate", "render-process-gone"])("a renderer that is replaced (%s) is back on Home", async (event) => {
    const contents = window().webContents;
    await invoke("menu:state", contents, null, state("canvas", false, true));
    window().webContents.emit(event);
    expect(menuEnabled("Zoom In")).toBe(false);
    expect(submenu("Edit")[0]?.role).toBe("undo");
  });

  test("Quick Open… is enabled on every screen, disabled under a modal, and tells the renderer", async () => {
    const contents = window().webContents;
    expect(menuEnabled("Quick Open…")).toBe(true);
    for (const screen of ["workspace", "canvas", "home"]) {
      await invoke("menu:state", contents, null, state(screen));
      expect(menuEnabled("Quick Open…"), screen).toBe(true);
    }
    click("Quick Open…");
    expect(contents.send).toHaveBeenCalledWith("menu-command", "quickOpen");
    await invoke("menu:state", contents, null, state("workspace", true));
    expect(menuEnabled("Quick Open…")).toBe(false);
  });

  test("Go > Home tells the renderer", async () => {
    await invoke("menu:state", window().webContents, null, state("workspace"));
    click("Home");
    expect(window().webContents.send).toHaveBeenCalledWith("menu-command", "home");
  });

  test("Add Project… shows a hidden window, then a multi-folder picker, and sends the outcome", async () => {
    window().emit("close", { preventDefault: vi.fn() });
    mocks.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/a", "/b"] });
    click("Add Project…");
    await vi.waitFor(() => expect(window().webContents.send).toHaveBeenCalledWith("folders:add-outcome", OUTCOME));
    expect(window().show).toHaveBeenCalledOnce();
    expect(mocks.dialog.showOpenDialog).toHaveBeenCalledWith(window(), expect.objectContaining({ properties: expect.arrayContaining(["openDirectory", "multiSelections"]) }));
    expect(mocks.flow.add).toHaveBeenCalledExactlyOnceWith(["/a", "/b"]);
  });
});

describe("adding projects", () => {
  test("folders:add from the window runs the picker; a cancelled picker adds nothing", async () => {
    const contents = window().webContents;
    await invoke("folders:add", contents, null);
    expect(mocks.dialog.showOpenDialog).toHaveBeenCalledOnce();
    expect(mocks.flow.add).not.toHaveBeenCalled();
    mocks.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/a"] });
    await invoke("folders:add", contents, {});
    await invoke("folders:add", {}, null);
    expect(mocks.dialog.showOpenDialog).toHaveBeenCalledOnce();
    await invoke("folders:add", contents, null);
    expect(mocks.flow.add).toHaveBeenCalledExactlyOnceWith(["/a"]);
    expect(contents.send).toHaveBeenCalledWith("folders:add-outcome", OUTCOME);
  });

  test("folders:add-paths accepts only validated absolute paths from the window", async () => {
    const contents = window().webContents;
    for (const bad of [null, ["/a"], { paths: ["rel"] }, { paths: [1] }, { paths: Array.from({ length: 33 }, (_, i) => `/p${i}`) }, { paths: ["/a"], more: 1 }]) {
      await invoke("folders:add-paths", contents, null, bad);
    }
    await invoke("folders:add-paths", contents, {}, { paths: ["/a"] });
    await invoke("folders:add-paths", {}, null, { paths: ["/a"] });
    expect(mocks.flow.add).not.toHaveBeenCalled();
    await invoke("folders:add-paths", contents, null, { paths: ["/a", "/b"] });
    expect(mocks.flow.add).toHaveBeenCalledExactlyOnceWith(["/a", "/b"]);
    expect(contents.send).toHaveBeenCalledWith("folders:add-outcome", OUTCOME);
  });

  test("the add flow lists stored paths, stores through the shell and sends scan progress", async () => {
    const deps = mocks.createAddFlow.mock.calls[0]?.[0];
    mocks.shell.entries.mockReturnValue([{ path: "/x" }, { path: "/y" }]);
    expect(deps.saved()).toEqual(["/x", "/y"]);
    mocks.shell.store.mockResolvedValue(["/z"]);
    expect(await deps.store(["/z"])).toEqual(["/z"]);
    expect(mocks.shell.store).toHaveBeenCalledWith(["/z"]);
    const snapshot = { scanId: "s", seq: 1, finished: 0, total: 1, done: false, items: [] };
    deps.progress(snapshot);
    expect(window().webContents.send).toHaveBeenCalledWith("folders:scan-progress", snapshot);
  });

  test("scan, cancel, candidates and confirm go to the add flow only from the window", async () => {
    const contents = window().webContents;
    mocks.flow.scan.mockReturnValue({ scanId: "s" });
    mocks.flow.addCandidates.mockResolvedValue({ kind: "added", added: ["/c"] });
    mocks.flow.confirm.mockResolvedValue({ kind: "added", added: ["/p"] });
    expect(await invoke("folders:scan", contents, null, { scanId: "s" })).toEqual({ scanId: "s" });
    expect(mocks.flow.scan).toHaveBeenCalledWith("s");
    await invoke("folders:scan-cancel", contents, null, { scanId: "s" });
    expect(mocks.flow.cancel).toHaveBeenCalledWith("s");
    expect(await invoke("folders:add-candidates", contents, null, { scanId: "s", ids: ["i"] })).toEqual({ kind: "added", added: ["/c"] });
    expect(mocks.flow.addCandidates).toHaveBeenCalledWith({ scanId: "s", ids: ["i"] });
    expect(await invoke("folders:confirm-folder", contents, null, { confirmId: "c" })).toEqual({ kind: "added", added: ["/p"] });
    expect(mocks.flow.confirm).toHaveBeenCalledWith({ confirmId: "c" });
    vi.clearAllMocks();
    for (const [sender, parent] of [[contents, {}], [{}, null]]) {
      expect(await invoke("folders:scan", sender, parent, { scanId: "s" })).toBeNull();
      await invoke("folders:scan-cancel", sender, parent, { scanId: "s" });
      expect(await invoke("folders:add-candidates", sender, parent, { scanId: "s", ids: ["i"] })).toEqual({ kind: "unavailable" });
      expect(await invoke("folders:confirm-folder", sender, parent, { confirmId: "c" })).toEqual({ kind: "unavailable" });
    }
    for (const fn of Object.values(mocks.flow)) expect(fn).not.toHaveBeenCalled();
  });
});

const APP = "/code/app";
const WT = "/code/app-fix";
const entries = [
  { path: APP, kind: "list", canvases: [], servedRev: 0, git: { common: `${APP}/.git`, main: APP, branch: "main", worktrees: [APP, WT] } },
  { path: WT, kind: "list", canvases: [], servedRev: 0, git: { common: `${APP}/.git`, main: APP, branch: "fix", worktrees: [APP, WT] } },
  { path: "/code/other", kind: "notFound" },
];

describe("removing and restoring", () => {
  beforeEach(() => {
    mocks.shell.entries.mockReturnValue(entries);
    mocks.shell.remove.mockImplementation(async (paths: string[]) => ({ paths, indexes: paths.map((path) => entries.findIndex((entry) => entry.path === path)) }));
    mocks.shell.restore.mockImplementation(async (paths: string[]) => paths);
  });

  test("refuses paths that are not stored, and other senders", async () => {
    const contents = window().webContents;
    for (const bad of [null, { paths: [] }, { paths: ["/nope"] }, { paths: [APP, "/nope"] }, { paths: [APP, APP] }, { paths: [APP], more: 1 }, { paths: APP }]) {
      expect(await invoke("folders:remove", contents, null, bad), JSON.stringify(bad)).toEqual({ kind: "unavailable" });
    }
    expect(await invoke("folders:remove", contents, {}, { paths: [APP] })).toEqual({ kind: "unavailable" });
    expect(await invoke("folders:remove", {}, null, { paths: [APP] })).toEqual({ kind: "unavailable" });
    expect(mocks.shell.remove).not.toHaveBeenCalled();
  });

  test("removes a row or a card with a label and a removal id", async () => {
    const contents = window().webContents;
    expect(await invoke("folders:remove", contents, null, { paths: [WT] })).toEqual({ kind: "removed", removalId: expect.any(String), label: "app (fix)" });
    expect(mocks.shell.remove).toHaveBeenCalledWith([WT]);
    expect(await invoke("folders:remove", contents, null, { paths: [APP, WT] })).toEqual({ kind: "removed", removalId: expect.any(String), label: "app and 1 worktree" });
  });

  test("a cancelled draft guard removes nothing", async () => {
    const contents = window().webContents;
    await invoke("comments:guard", contents, null, true);
    const pending = invoke("folders:remove", contents, null, { paths: [APP] }) as Promise<unknown>;
    const request = contents.send.mock.calls.find((call) => call[0] === "comments:transition")?.[1];
    expect(request).toMatchObject({ kind: "remove-projects", roots: [APP] });
    await invoke("comments:transition-answer", contents, null, { id: request.id, allow: false });
    expect(await pending).toEqual({ kind: "cancelled" });
    expect(mocks.shell.remove).not.toHaveBeenCalled();
  });

  test("an allowed draft guard removes once and clears the removed project's selection", async () => {
    const contents = window().webContents;
    const selection = { root: APP, canvas: { path: "design/a.html", id: "a" }, element: { selector: "button", html: "<button>Go</button>" } };
    await invoke("selection:set", contents, null, selection);
    await invoke("comments:guard", contents, null, true);
    const pending = invoke("folders:remove", contents, null, { paths: [APP] }) as Promise<unknown>;
    const request = contents.send.mock.calls.find((call) => call[0] === "comments:transition")?.[1];
    await invoke("comments:transition-answer", contents, null, { id: request.id, allow: true });
    expect(await pending).toMatchObject({ kind: "removed" });
    expect(mocks.shell.remove).toHaveBeenCalledOnce();
    expect(runtimeState().selection()).toBeNull();
  });

  test("restore puts the removed paths back at their indexes once", async () => {
    const contents = window().webContents;
    const removed = await invoke("folders:remove", contents, null, { paths: [APP, WT] }) as { removalId: string };
    expect(await invoke("folders:restore", contents, {}, { removalId: removed.removalId })).toEqual({ kind: "unavailable" });
    expect(await invoke("folders:restore", contents, null, { removalId: removed.removalId })).toEqual({ kind: "restored", paths: [APP, WT] });
    expect(mocks.shell.restore).toHaveBeenCalledExactlyOnceWith([APP, WT], [0, 1]);
    expect(await invoke("folders:restore", contents, null, { removalId: removed.removalId })).toEqual({ kind: "unavailable" });
  });

  test("a removal id expires on the next removal or when the renderer says so", async () => {
    const contents = window().webContents;
    const first = await invoke("folders:remove", contents, null, { paths: [APP] }) as { removalId: string };
    const second = await invoke("folders:remove", contents, null, { paths: [WT] }) as { removalId: string };
    expect(await invoke("folders:restore", contents, null, { removalId: first.removalId })).toEqual({ kind: "unavailable" });
    await invoke("folders:forget-removal", contents, {}, { removalId: second.removalId });
    await invoke("folders:forget-removal", contents, null, { removalId: "forged" });
    await invoke("folders:forget-removal", contents, null, { removalId: second.removalId });
    expect(await invoke("folders:restore", contents, null, { removalId: second.removalId })).toEqual({ kind: "unavailable" });
    for (const bad of [null, "x", { removalId: 1 }, { removalId: second.removalId, more: 1 }]) {
      expect(await invoke("folders:restore", contents, null, bad)).toEqual({ kind: "unavailable" });
    }
    expect(mocks.shell.restore).not.toHaveBeenCalled();
  });

  // The shell changes the list at once and only then waits for folders.json,
  // so an Undo that arrives during that write must already find the old id gone.
  test("a removal id expires when the next removal starts, before it is saved", async () => {
    const contents = window().webContents;
    const first = await invoke("folders:remove", contents, null, { paths: [APP] }) as { removalId: string };
    let save!: () => void;
    mocks.shell.remove.mockImplementationOnce((paths: string[]) => new Promise((resolve) => { save = () => resolve({ paths, indexes: [1] }); }));
    const second = invoke("folders:remove", contents, null, { paths: [WT] }) as Promise<{ removalId: string }>;
    expect(await invoke("folders:restore", contents, null, { removalId: first.removalId })).toEqual({ kind: "unavailable" });
    save();
    expect(await invoke("folders:restore", contents, null, { removalId: (await second).removalId })).toEqual({ kind: "restored", paths: [WT] });
    expect(mocks.shell.restore).toHaveBeenCalledExactlyOnceWith([WT], [1]);
  });

  test("an older removal saved last does not take Undo from the newer one", async () => {
    const contents = window().webContents;
    let save!: () => void;
    mocks.shell.remove.mockImplementationOnce((paths: string[]) => new Promise((resolve) => { save = () => resolve({ paths, indexes: [0] }); }));
    const first = invoke("folders:remove", contents, null, { paths: [APP] }) as Promise<{ removalId: string }>;
    const second = await invoke("folders:remove", contents, null, { paths: [WT] }) as { removalId: string };
    save();
    expect(await invoke("folders:restore", contents, null, { removalId: (await first).removalId })).toEqual({ kind: "unavailable" });
    expect(await invoke("folders:restore", contents, null, { removalId: second.removalId })).toEqual({ kind: "restored", paths: [WT] });
  });

  test("a removal the draft guard cancels keeps the last Undo", async () => {
    const contents = window().webContents;
    const first = await invoke("folders:remove", contents, null, { paths: [APP] }) as { removalId: string };
    await invoke("comments:guard", contents, null, true);
    const pending = invoke("folders:remove", contents, null, { paths: [WT] }) as Promise<unknown>;
    const request = contents.send.mock.calls.find((call) => call[0] === "comments:transition")?.[1];
    await invoke("comments:transition-answer", contents, null, { id: request.id, allow: false });
    expect(await pending).toEqual({ kind: "cancelled" });
    expect(await invoke("folders:restore", contents, null, { removalId: first.removalId })).toEqual({ kind: "restored", paths: [APP] });
  });
});

describe("locate and reveal", () => {
  beforeEach(() => mocks.shell.entries.mockReturnValue(entries));

  test("locate takes a stored path only and replaces it with the judged root", async () => {
    const contents = window().webContents;
    for (const bad of [null, { path: "/nope" }, { path: 1 }, { path: APP, more: 1 }]) {
      expect(await invoke("folders:locate", contents, null, bad)).toEqual({ kind: "unavailable" });
    }
    expect(await invoke("folders:locate", contents, {}, { path: APP })).toEqual({ kind: "unavailable" });
    expect(mocks.dialog.showOpenDialog).not.toHaveBeenCalled();
    expect(await invoke("folders:locate", contents, null, { path: "/code/other" })).toEqual({ kind: "cancelled" });
    expect(mocks.dialog.showOpenDialog).toHaveBeenCalledWith(window(), expect.objectContaining({ properties: ["openDirectory"] }));
    mocks.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/code/moved"] });
    mocks.flow.judge.mockResolvedValueOnce({ root: "/code/moved" });
    await invoke("selection:set", contents, null, { root: "/code/other", canvas: { path: "design/a.html" } });
    expect(runtimeState().selection()).not.toBeNull();
    expect(await invoke("folders:locate", contents, null, { path: "/code/other" })).toEqual({ kind: "located", root: "/code/moved" });
    expect(runtimeState().selection()).toBeNull();
    expect(mocks.flow.judge).toHaveBeenCalledWith("/code/moved");
    expect(mocks.shell.replace).toHaveBeenCalledExactlyOnceWith("/code/other", "/code/moved");
    mocks.flow.judge.mockResolvedValueOnce({ refused: "Only folders can be added." });
    expect(await invoke("folders:locate", contents, null, { path: "/code/other" })).toEqual({ kind: "refused", message: "Only folders can be added." });
    expect(mocks.shell.replace).toHaveBeenCalledOnce();
  });

  test("a located folder removed from the list while the picker was open is not replaced", async () => {
    mocks.dialog.showOpenDialog.mockImplementation(async () => {
      mocks.shell.entries.mockReturnValue([]);
      return { canceled: false, filePaths: ["/code/moved"] };
    });
    mocks.flow.judge.mockResolvedValueOnce({ root: "/code/moved" });
    expect(await invoke("folders:locate", window().webContents, null, { path: "/code/other" })).toEqual({ kind: "unavailable" });
    expect(mocks.shell.replace).not.toHaveBeenCalled();
  });

  test("reveal shows a stored root in Finder and nothing else", async () => {
    const contents = window().webContents;
    for (const bad of [null, { path: "/nope" }, { path: APP, more: 1 }, APP]) await invoke("folders:reveal", contents, null, bad);
    await invoke("folders:reveal", contents, {}, { path: APP });
    await invoke("folders:reveal", {}, null, { path: APP });
    expect(mocks.electronShell.showItemInFolder).not.toHaveBeenCalled();
    await invoke("folders:reveal", contents, null, { path: APP });
    expect(mocks.electronShell.showItemInFolder).toHaveBeenCalledExactlyOnceWith(APP);
  });
});

describe("ui state", () => {
  test("is stored beside folders.json and validated against the saved roots", () => {
    mocks.shell.entries.mockReturnValue([{ path: "/a" }, { path: "/b", kind: "list" }]);
    const [file, saved] = mocks.createUiStateStore.mock.calls[0] ?? [];
    expect(file).toBe("/tmp/doan-index-test/ui-state.json");
    expect(typeof saved === "function" ? saved() : null).toEqual(["/a", "/b"]);
  });

  test("get and save answer only the window's main frame", async () => {
    const contents = window().webContents;
    mocks.uiState.read.mockResolvedValue({ screen: "home", expanded: {}, lastByRoot: {} });
    mocks.uiState.save.mockReturnValue(true);
    expect(await invoke("ui-state:get", contents, null)).toEqual({ screen: "home", expanded: {}, lastByRoot: {} });
    expect(await invoke("ui-state:save", contents, null, { screen: "home" })).toBe(true);
    expect(mocks.uiState.save).toHaveBeenCalledExactlyOnceWith({ screen: "home" });
    mocks.uiState.read.mockClear();
    mocks.uiState.save.mockClear();
    for (const [sender, parent] of [[contents, {}], [{}, null]]) {
      expect(await invoke("ui-state:get", sender, parent)).toBeNull();
      expect(await invoke("ui-state:save", sender, parent, { screen: "home" })).toBe(false);
    }
    expect(mocks.uiState.read).not.toHaveBeenCalled();
    expect(mocks.uiState.save).not.toHaveBeenCalled();
  });

  test("a pending save is flushed on quit", () => {
    mocks.app.emit("will-quit");
    expect(mocks.uiState.flushSync).toHaveBeenCalledOnce();
  });
});

describe("thumbnails", () => {
  function deps(): import("./thumbnails").ThumbnailDeps {
    const value = mocks.createThumbnails.mock.calls[0]?.[0];
    if (!value) throw new Error("thumbnails not created");
    return value;
  }
  // The real capturer on the mocked BrowserWindow: the first capture makes the window.
  async function captureWindow() {
    expect(await deps().capturer.capture("http://127.0.0.1:1/t/tok/k/design/a.html", 800)).toEqual(Buffer.from("png"));
    const hidden = mocks.Window.instances[1];
    if (!hidden) throw new Error("no capture window");
    return hidden;
  }

  test("caches under userData with this app's version and the shell's scope", () => {
    expect(deps()).toMatchObject({ dir: "/tmp/doan-index-test/thumbnails", appVersion: "9.8.7" });
    mocks.shell.entries.mockReturnValue([{ path: "/repo", kind: "list" }]);
    expect(deps().entries()).toEqual([{ path: "/repo", kind: "list" }]);
    expect(mocks.thumbnails.entriesChanged).toHaveBeenCalledWith([]);
  });

  test("folder updates reach the thumbnails and their changes reach the window", () => {
    const changed = mocks.startShell.mock.calls[0]?.[2];
    if (typeof changed !== "function") throw new Error("no folder listener");
    changed([{ path: "/repo", kind: "loading" }]);
    expect(mocks.thumbnails.entriesChanged).toHaveBeenLastCalledWith([{ path: "/repo", kind: "loading" }]);
    deps().changed({ root: "/repo", path: "design/a.html" });
    expect(window().webContents.send).toHaveBeenCalledWith("thumbnails:changed", { root: "/repo", path: "design/a.html" });
  });

  test("thumbnails:get passes a well-formed request from the window and refuses the rest", async () => {
    const contents = window().webContents;
    mocks.thumbnails.get.mockResolvedValue({ kind: "pending" });
    expect(await invoke("thumbnails:get", contents, null, { root: "/repo", path: "design/a.html", visible: true })).toEqual({ kind: "pending" });
    expect(mocks.thumbnails.get).toHaveBeenCalledExactlyOnceWith("/repo", "design/a.html", true);
    mocks.thumbnails.get.mockClear();
    const good = { root: "/repo", path: "design/a.html", visible: false };
    for (const bad of [null, "x", { root: "/repo", path: "design/a.html" }, { ...good, visible: 1 }, { ...good, root: 3 }, { ...good, path: null }, { ...good, more: 1 }]) {
      expect(await invoke("thumbnails:get", contents, null, bad)).toEqual({ kind: "unavailable" });
    }
    expect(await invoke("thumbnails:get", contents, {}, good)).toEqual({ kind: "unavailable" });
    expect(await invoke("thumbnails:get", {}, null, good)).toEqual({ kind: "unavailable" });
    expect(mocks.thumbnails.get).not.toHaveBeenCalled();
  });

  test("the capture window is hidden, sandboxed and has no preload", async () => {
    const hidden = await captureWindow();
    expect(hidden.options).toMatchObject({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    expect(hidden.options.webPreferences).not.toHaveProperty("preload");
    expect(hidden.options.webPreferences).not.toHaveProperty("offscreen");
    expect(hidden.loadURL.mock.calls[0]?.[0]).toMatch(/^data:text\/html;charset=utf-8,/);
    expect(hidden.setContentSize).toHaveBeenCalledWith(800, 500);
  });

  test("the capture window is refused as an IPC sender", async () => {
    const hidden = await captureWindow();
    mocks.shell.entries.mockReturnValue([{ path: "/repo" }]);
    expect(await invoke("folders:get", hidden.webContents, null)).toEqual([]);
    expect(await invoke("ui-state:get", hidden.webContents, null)).toBeNull();
    expect(await invoke("thumbnails:get", hidden.webContents, null, { root: "/repo", path: "design/a.html", visible: true })).toEqual({ kind: "unavailable" });
  });

  test("the capture window stays out of activate, Close Window and the window list", async () => {
    const hidden = await captureWindow();
    mocks.app.emit("activate");
    expect(window().show).toHaveBeenCalledOnce();
    expect(hidden.show).not.toHaveBeenCalled();
    click("Close Window");
    expect(window().close).toHaveBeenCalledOnce();
    expect(hidden.close).not.toHaveBeenCalled();
    // Its end changes nothing about the app window.
    hidden.emit("closed");
    mocks.app.emit("activate");
    expect(window().show).toHaveBeenCalledTimes(2);
    expect(mocks.app.listenerCount("window-all-closed")).toBe(0);
  });

  test("hiding the app window pauses captures and showing it resumes them", () => {
    window().emit("close", { preventDefault: vi.fn() });
    expect(window().hide).toHaveBeenCalledOnce();
    expect(mocks.thumbnails.pause).toHaveBeenCalledOnce();
    expect(mocks.thumbnails.resume).not.toHaveBeenCalled();
    mocks.app.emit("activate");
    expect(mocks.thumbnails.resume).toHaveBeenCalledOnce();
  });

  test("hiding the whole app pauses captures, and unhiding resumes them only while the window is shown", () => {
    const notify = (name: string) => mocks.notifications.get(`NSApplicationDid${name}Notification`)?.();
    notify("Hide");
    expect(mocks.thumbnails.pause).toHaveBeenCalledOnce();
    notify("Unhide");
    expect(mocks.thumbnails.resume).toHaveBeenCalledOnce();
    // Closed, then hidden and shown again: the window is still closed.
    window().emit("close", { preventDefault: vi.fn() });
    notify("Hide");
    notify("Unhide");
    expect(mocks.thumbnails.resume).toHaveBeenCalledOnce();
    // Shown while the app is hidden: nothing runs until the app is back.
    notify("Hide");
    mocks.app.emit("activate");
    expect(mocks.thumbnails.resume).toHaveBeenCalledOnce();
    notify("Unhide");
    expect(mocks.thumbnails.resume).toHaveBeenCalledTimes(2);
  });

  test("a fullscreen window pauses captures once it is really hidden", () => {
    window().isFullScreen.mockReturnValue(true);
    window().emit("close", { preventDefault: vi.fn() });
    expect(mocks.thumbnails.pause).not.toHaveBeenCalled();
    window().emit("leave-full-screen");
    expect(mocks.thumbnails.pause).toHaveBeenCalledOnce();
  });

  test("quitting disposes the thumbnails, and the capturer destroys its window", async () => {
    mocks.app.emit("will-quit");
    expect(mocks.thumbnails.dispose).toHaveBeenCalledOnce();
    const hidden = await captureWindow();
    deps().capturer.close();
    expect(hidden.destroy).toHaveBeenCalledOnce();
  });

  test("a removal drops the removed projects' cache with the list from before", async () => {
    const before = [{ path: "/repo", kind: "list", canvases: [] }, { path: "/other", kind: "list", canvases: [] }];
    mocks.shell.entries.mockReturnValue(before);
    mocks.shell.remove.mockResolvedValue({ paths: ["/repo"], indexes: [0] });
    expect(await invoke("folders:remove", window().webContents, null, { paths: ["/repo"] })).toMatchObject({ kind: "removed" });
    expect(mocks.thumbnails.removed).toHaveBeenCalledExactlyOnceWith(["/repo"], before);
  });
});

test("window focus re-reads every root at most once a minute", () => {
  const now = Date.now();
  const clock = vi.spyOn(Date, "now");
  try {
    clock.mockReturnValue(now);
    window().emit("focus");
    expect(mocks.shell.rereadAll).not.toHaveBeenCalled();
    clock.mockReturnValue(now + 61_000);
    window().emit("focus");
    window().emit("focus");
    expect(mocks.shell.rereadAll).toHaveBeenCalledOnce();
  } finally { clock.mockRestore(); }
});


test("home path is available only to the application main frame", async () => {
  expect(await invoke("app:home", window().webContents, null)).toBe(process.env.HOME ?? "/tmp/doan-index-test");
  expect(await invoke("app:home", {}, null)).toBeNull();
  expect(await invoke("app:home", window().webContents, {})).toBeNull();
});
