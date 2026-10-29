import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { BrowserWindowConstructorOptions, MenuItemConstructorOptions } from "electron";
import { displayPath } from "../renderer/projectDisplay";

const OUTCOME = { added: ["/repo"], duplicate: null, messages: [], scanId: null, confirms: [] };

const mocks = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  class Window extends EventEmitter {
    static instances: Window[] = [];
    static ids = 0;
    destroyed = false;
    contentsDestroyed = false;
    webContents = Object.assign(new EventEmitter(), { id: ++Window.ids, send: vi.fn(), isDestroyed: () => this.contentsDestroyed, debugger: { name: "debugger" },
      executeJavaScript: vi.fn(async () => ({ x: 0, y: 0, width: 800, height: 500 })),
      capturePage: vi.fn(async () => ({ isEmpty: () => false, resize: () => ({ toPNG: () => Buffer.from("png") }) })) });
    show = vi.fn();
    hide = vi.fn();
    focus = vi.fn();
    setTitle = vi.fn();
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
    app: Object.assign(new EventEmitter(), { setName: vi.fn(), whenReady: vi.fn<() => Promise<void>>(), isPackaged: true, getPath: () => "/tmp/doan-index-test", getVersion: () => "9.8.7", exit: vi.fn(), quit: vi.fn(), show: vi.fn(), requestSingleInstanceLock: vi.fn(() => true) }),
    ipc: new Map<string, (...args: unknown[]) => unknown>(),
    shell: { tokenBase: "http://127.0.0.1:1/t/tok/", entries: vi.fn<() => { path: string; kind?: string }[]>(() => []), open: vi.fn<() => Promise<{ root: string } | { refused: string }>>(), reopen: vi.fn(), initialize: vi.fn(), epoch: vi.fn(), dispose: vi.fn(),
      store: vi.fn(), remove: vi.fn(), restore: vi.fn(), replace: vi.fn(), rereadAll: vi.fn() },
    flow: { add: vi.fn(), scan: vi.fn(), cancel: vi.fn(), addCandidates: vi.fn(), confirm: vi.fn(), judge: vi.fn() },
    createAddFlow: vi.fn(),
    electronShell: { showItemInFolder: vi.fn(), openExternal: vi.fn() },
    // AppKit notifications by name, as main last subscribed to them.
    notifications: new Map<string, () => void>(),
    startShell: vi.fn(),
    cliCommand: vi.fn(() => "/bundled/doan"),
    runConfig: vi.fn(),
    runDesignSkill: vi.fn(),
    runtime: { socket: "/tmp/doan-x/app.sock", token: "t", file: "/tmp/doan-index-test/runtime.json", disposeSync: vi.fn() },
    startRuntime: vi.fn(),
    sessionOn: vi.fn(),
    inspector: { inspect: vi.fn() },
    createInspector: vi.fn(),
    mkdir: vi.fn(),
    machine: { read: vi.fn(), run: vi.fn(), answer: vi.fn(), cancelConfirmation: vi.fn(), isBusy: vi.fn(() => false) },
    createMachine: vi.fn(),
    readCompletion: vi.fn(), clipboard: { writeText: vi.fn() },
    menu: vi.fn<(template: MenuItemConstructorOptions[]) => unknown>(),
    dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
    uiState: { read: vi.fn(), save: vi.fn(), flushSync: vi.fn(), idle: vi.fn(), readSettingsTab: vi.fn(), saveSettingsTab: vi.fn() },
    createUiStateStore: vi.fn(),
    thumbnails: { get: vi.fn(), visible: vi.fn(), entriesChanged: vi.fn(), removed: vi.fn(), pause: vi.fn(), resume: vi.fn(), dispose: vi.fn() },
    createThumbnails: vi.fn(),
    reviewStore: { marker: vi.fn(), raise: vi.fn(), forget: vi.fn() },
    createReviewStore: vi.fn(),
    readProjectComments: vi.fn(),
    readFolder: vi.fn(),
    readFoldersFileForPruning: vi.fn(),
    nativeTheme: { themeSource: "system" },
  };
});

vi.mock("electron", () => ({
  clipboard: mocks.clipboard, app: mocks.app, BrowserWindow: mocks.Window, shell: mocks.electronShell,
  dialog: mocks.dialog,
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => mocks.ipc.set(channel, handler) },
  Menu: { buildFromTemplate: mocks.menu, setApplicationMenu: vi.fn() },
  session: { defaultSession: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn(), on: mocks.sessionOn } },
  webFrameMain: { fromId: vi.fn() },
  nativeTheme: mocks.nativeTheme,
  systemPreferences: { subscribeLocalNotification: (name: string, callback: () => void) => { mocks.notifications.set(name, callback); return mocks.notifications.size; } },
}));
vi.mock("./conversation/store", async (importOriginal) => ({ ...await importOriginal<typeof import("./conversation/store")>(), ConversationStore: class { list() { return []; } } }));
vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdir }));
vi.mock("./onboarding/completion", async (importOriginal) => ({ ...await importOriginal<typeof import("./onboarding/completion")>(), readCompletion: mocks.readCompletion }));
vi.mock("./onboarding/machine", () => ({ createMachine: mocks.createMachine, runProcess: vi.fn(async () => ({ code: 1, stdout: "", stderr: "" })), probeShell: vi.fn(async () => ({ ok: false })), PATH_LINE: 'export PATH="$HOME/.local/bin:$PATH"' }));
vi.mock("./cli", () => ({ cliCommand: mocks.cliCommand, runConfig: mocks.runConfig, readFolder: mocks.readFolder, runDesignSkill: mocks.runDesignSkill }));
vi.mock("./shell", () => ({ startShell: mocks.startShell }));
vi.mock("./folderStore", () => ({ readFoldersFileForPruning: mocks.readFoldersFileForPruning }));
vi.mock("./runtime", () => ({ startRuntime: mocks.startRuntime }));
vi.mock("./addProjects", async (importOriginal) => ({ ...await importOriginal<typeof import("./addProjects")>(), createAddFlow: mocks.createAddFlow }));
vi.mock("./inspector", async (importOriginal) => ({ ...await importOriginal<typeof import("./inspector")>(), createInspector: mocks.createInspector }));
vi.mock("./uiState", () => ({ createUiStateStore: mocks.createUiStateStore }));
vi.mock("./thumbnails", () => ({ createThumbnails: mocks.createThumbnails }));
vi.mock("./reviewState", async (importOriginal) => ({ ...await importOriginal<typeof import("./reviewState")>(), createReviewStore: mocks.createReviewStore }));
vi.mock("./projectComments", async (importOriginal) => ({ ...await importOriginal<typeof import("./projectComments")>(), readProjectComments: mocks.readProjectComments }));

// A machine read where everything is connected.
const MACHINE = {
  requestId: "r", cli: { state: "ours" }, stub: { state: "ours" }, claudeLink: { state: "ours" }, probe: { ok: true, path: "/bin" },
  agents: { claude: { executable: "/bin/claude", mcp: { state: "ours" } }, codex: { executable: "/bin/codex", mcp: { state: "ours" } } },
};

// What onboarding.json holds at launch; a describe sets it in beforeAll, before each launch reads it.
let launchCompletion: { kind: string; projectRoot?: string } = { kind: "missing" };
const COMPLETE = { kind: "complete", projectRoot: "/repo" };
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.app.removeAllListeners();
  mocks.Window.instances.length = 0;
  mocks.ipc.clear();
  mocks.readCompletion.mockReturnValue(launchCompletion);
  mocks.createMachine.mockReturnValue(mocks.machine);
  mocks.machine.read.mockResolvedValue(MACHINE);
  mocks.machine.run.mockResolvedValue({ kind: "success" });
  mocks.machine.isBusy.mockReturnValue(false);
  mocks.app.whenReady.mockResolvedValue();
  mocks.startShell.mockResolvedValue(mocks.shell);
  mocks.readFoldersFileForPruning.mockResolvedValue(entries.map((entry) => entry.path));
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
  mocks.uiState.readSettingsTab.mockReturnValue(null);
  mocks.uiState.saveSettingsTab.mockReturnValue(true);
  mocks.electronShell.openExternal.mockResolvedValue(undefined);
  mocks.createThumbnails.mockReturnValue(mocks.thumbnails);
  mocks.thumbnails.removed.mockResolvedValue(undefined);
  mocks.createReviewStore.mockReturnValue(mocks.reviewStore);
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
  const sent = () => window().webContents.send.mock.calls.filter(([channel]) => channel === "view-command" || channel === "folders").length;
  send();
  changed([]);
  expect(sent()).toBe(2);
  window().webContents.send.mockClear();
  if (target === "window") window().destroyed = true;
  else window().contentsDestroyed = true;
  send();
  changed([]);
  expect(window().webContents.send).not.toHaveBeenCalled();
});

// The renderer's shell colour, resolved from tokens.css so the window paint cannot drift from it.
function shellColour() {
  const tokens = readFileSync(new URL("../renderer/tokens.css", import.meta.url), "utf8");
  let value = "var(--bg-app)";
  for (let reference = /^var\((--[\w-]+)\)$/.exec(value); reference; reference = /^var\((--[\w-]+)\)$/.exec(value)) {
    value = new RegExp(`${reference[1]}:\\s*([^;]+);`).exec(tokens)?.[1]?.trim() ?? "";
  }
  return value;
}

test("draws light whatever the macOS appearance", () => {
  expect(mocks.nativeTheme.themeSource).toBe("light");
});

test("defines the requested window geometry and File menu", () => {
  expect(shellColour()).toMatch(/^#[0-9a-f]{6}$/);
  expect(window().options).toMatchObject({ width: 1238, height: 780, minWidth: 960, minHeight: 600, titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 21 }, backgroundColor: "#00000000", vibrancy: "sidebar", visualEffectState: "followWindow" });
  expect(item("Add Project…").accelerator).toBe("CmdOrCtrl+O");
  expect(item("Close Window").accelerator).toBe("CmdOrCtrl+W");
});

test("hides on close and shows the same window on activate", async () => {
  const event = { preventDefault: vi.fn() };
  window().emit("close", event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(window().hide).toHaveBeenCalledOnce();
  mocks.app.emit("activate");
  expect(window().show).toHaveBeenCalledOnce();
  expect(mocks.Window.instances).toHaveLength(1);
  mocks.app.emit("before-quit", { preventDefault: vi.fn() });
  await new Promise<void>(resolve => setImmediate(resolve));
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
  mocks.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/repo/doan"] });
  mocks.shell.open.mockResolvedValueOnce({ root: "/repo" });
  expect(await invoke("folders:open", contents, null)).toBe("/repo");
  expect(mocks.shell.open).toHaveBeenLastCalledWith("/repo/doan");
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

test("does not intercept fullscreen close while quitting", async () => {
  window().isFullScreen.mockReturnValue(true);
  mocks.app.emit("before-quit", { preventDefault: vi.fn() });
  await new Promise<void>(resolve => setImmediate(resolve));
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
const SELECTION = { root: ROOT, canvas: { path: ".doan/canvases/a.html", id: "a" }, element: { selector: "button", html: "<button>Go</button>" } };

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
  const other = { ...SELECTION, canvas: { path: ".doan/canvases/b.html" } };
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

test.each(["orphan-mutate", "orphan-status"])("comments %s refuses iframe and other-window callers", async method => {
  for (const [sender, parent] of [[window().webContents, {}], [{}, null]]) {
    expect(await invoke(`comments:${method}`, sender, parent, {})).toEqual({ ok: false, identity: null, error: "The request was refused." });
  }
  expect(await invoke(`comments:${method}`, window().webContents, null, { forged: true })).toMatchObject({ ok: false });
});

describe("design skills", () => {
  const LIST = { v: 1, ok: true, result: { version: "9.8.7", presets: [{ id: "clarify", title: "Clarify copy", description: "d", scope: "copy" }] } };
  const BODY = "# Clarify copy\n\n[doan:design-skill] end of preset clarify v9.8.7\n";
  const GET = { v: 1, ok: true, result: { version: "9.8.7", preset: LIST.result.presets[0], body: BODY, sources: [{ repository: "r", commit: "c", path: "p" }] } };
  const USAGE = { v: 1, ok: false, error: { code: "usage_error", message: "unknown design preset \"nonexistent\"", nextSteps: ["Run `doan design-skill --json` to list design preset ids."] } };
  const REFUSED = { v: 1, ok: false, error: { code: "request_refused", message: expect.any(String), nextSteps: [] } };
  const cliRun = (envelope: unknown, exitCode = 0) => ({ exitCode, timedOut: false, stdout: JSON.stringify(envelope), stderr: "" });

  test("the main window lists and reads presets through the bundled CLI", async () => {
    mocks.runDesignSkill.mockResolvedValueOnce(cliRun(LIST)).mockResolvedValueOnce(cliRun(GET));
    expect(await invoke("design-skills:list", window().webContents, null)).toEqual(LIST);
    expect(mocks.runDesignSkill).toHaveBeenLastCalledWith("/bundled/doan");
    expect(await invoke("design-skills:get", window().webContents, null, { id: "clarify" })).toEqual(GET);
    expect(mocks.runDesignSkill).toHaveBeenLastCalledWith("/bundled/doan", "clarify");
  });

  test("keeps a CLI failure and reports a broken run as cli_error", async () => {
    mocks.runDesignSkill.mockResolvedValueOnce(cliRun(USAGE, 2))
      .mockResolvedValueOnce({ exitCode: null, timedOut: true, stdout: "", stderr: "" })
      .mockResolvedValueOnce(cliRun({ ...GET, result: { ...GET.result, body: "# Clarify copy\n" } }));
    expect(await invoke("design-skills:get", window().webContents, null, { id: "nonexistent" })).toEqual(USAGE);
    expect(await invoke("design-skills:list", window().webContents, null)).toMatchObject({ v: 1, ok: false, error: { code: "cli_error", reason: "timeout" } });
    expect(await invoke("design-skills:get", window().webContents, null, { id: "clarify" })).toMatchObject({ v: 1, ok: false, error: { code: "cli_error", reason: "invalid_response" } });
    // No automatic retry: one request, one run.
    expect(mocks.runDesignSkill).toHaveBeenCalledTimes(3);
  });

  test("refuses canvas iframes, other senders and malformed requests without running the CLI", async () => {
    for (const [sender, parent] of [[window().webContents, {}], [{}, null]]) {
      expect(await invoke("design-skills:list", sender, parent)).toEqual(REFUSED);
      expect(await invoke("design-skills:get", sender, parent, { id: "clarify" })).toEqual(REFUSED);
    }
    for (const bad of [undefined, "clarify", { id: 1 }, { id: "clarify", args: ["--repo", "/"] }]) {
      expect(await invoke("design-skills:get", window().webContents, null, bad)).toEqual(REFUSED);
    }
    expect(await invoke("design-skills:list", window().webContents, null, { all: true })).toEqual(REFUSED);
    expect(mocks.runDesignSkill).not.toHaveBeenCalled();
  });
});

test("an orphan write is judged on a fresh ls of its root", async () => {
  mocks.readFolder.mockResolvedValue({ kind: "list", root: APP, scope: [".doan/canvases"], canvases: [], orphans: [] });
  const intent = { type: "resolve", comment: "cmt_00000000-0000-4000-8000-000000000001", expected: { body: "b", status: "open", updatedAt: "2026-10-26T10:00:00.000Z" } };
  expect(await invoke("comments:orphan-mutate", window().webContents, null, { root: APP, canvas: "gone", requestID: "r", project: 1, intent })).toMatchObject({ ok: false, error: "These comments are no longer without a canvas, or the project could not be read fully." });
  expect(mocks.readFolder).toHaveBeenCalledWith("/bundled/doan", APP);
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
  await new Promise<void>(resolve => setImmediate(resolve));
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


// First run is open from a launch without a v1 completion record until the session reports completion, from the
// window, the CLI or MCP. Nothing else opens or closes it (POSTMORTEM "The setup menu discarded an open wizard session").
async function completeFirstRun(): Promise<void> {
  mocks.readCompletion.mockReturnValue(COMPLETE);
  const contents = window().webContents;
  const started = await invoke("onboarding:start", contents, null, {}) as { result: { sessionId: string } };
  // Any session change publishes the state; the completion read is the marker's.
  await invoke("onboarding:inspect", contents, null, { sessionId: started.result.sessionId, requestId: "close-first-run", url: "https://github.com/acme/studio" });
  await vi.waitFor(() => expect(item("Settings…").enabled).not.toBe(false));
}
test("an incomplete first run keeps Settings closed until the session saves completion", async () => {
  expect(item("Settings…").enabled).toBe(false);
  expect(await invoke("settings:open", window().webContents, null, { tab: "connections" })).toBe(false);
  await completeFirstRun();
  expect(await invoke("settings:open", window().webContents, null, { tab: "connections" })).toBe(true);
  await vi.waitFor(() => expect(window().webContents.send).toHaveBeenCalledWith("setup:status", expect.objectContaining({ onboardingClosed: true })));
});
test.each([false, true])("hiding and showing the window keeps the first-run session (hidden: %s)", async hidden => {
  const contents = window().webContents;
  const first = await invoke("onboarding:start", contents, null, {}) as { result: { sessionId: string } };
  if (hidden) window().emit("close", { preventDefault: vi.fn() });
  mocks.app.emit("activate");
  expect(window().show).toHaveBeenCalled();
  const again = await invoke("onboarding:start", contents, null, {}) as { result: { sessionId: string; completed: boolean } };
  expect(again.result).toMatchObject({ sessionId: first.result.sessionId, completed: false });
});
test("the old wizard channels are gone; first prompt and copy stay", () => {
  for (const channel of ["onboarding:get-open", "onboarding:read", "onboarding:run", "onboarding:answer", "onboarding:close", "onboarding:open-project"]) expect(mocks.ipc.has(channel)).toBe(false);
  for (const channel of ["onboarding:first-prompt", "onboarding:copy", "onboarding:choose-folder"]) expect(mocks.ipc.has(channel)).toBe(true);
});
describe("a launch with a v1 completion record", () => {
  beforeAll(() => { launchCompletion = COMPLETE; });
  afterAll(() => { launchCompletion = { kind: "missing" }; });
  test("opens no first run: Settings is available and the home alerts are released", async () => {
    expect(item("Settings…").enabled).not.toBe(false);
    expect(await invoke("setup:check-again", window().webContents, null)).toMatchObject({ onboardingClosed: true });
  });
});
describe("a launch with the legacy {} marker", () => {
  beforeAll(() => { launchCompletion = { kind: "legacy" }; });
  afterAll(() => { launchCompletion = { kind: "missing" }; });
  test("still runs first run: the old closed marker is not a completion", async () => {
    expect(item("Settings…").enabled).toBe(false);
    expect(await invoke("setup:check-again", window().webContents, null)).toMatchObject({ onboardingClosed: false });
  });
});
test("first prompt is read and copied only for a stored set-up project and a subject, after the clipboard settles", async () => {
  const contents = window().webContents;
  const subject = "a sign-in screen";
  const sentence = `Use the doan skill to make a design canvas in ${ROOT} for ${subject}.`;
  mocks.shell.entries.mockReturnValue([{ path: ROOT, kind: "list" }, { path: "/plain", kind: "uninitialized" }]);
  expect(await invoke("onboarding:first-prompt", contents, null, { root: ROOT, subject })).toBe(sentence);
  // The placeholder form without a subject is gone with the composer.
  for (const request of [{ root: ROOT }, { root: "/plain", subject }, { root: "/other", subject }, { root: ROOT, text: "forged" }, { root: ROOT, subject, text: "forged" }, { root: 1, subject }, null, ROOT]) {
    expect(await invoke("onboarding:first-prompt", contents, null, request)).toBeNull();
  }
  expect(await invoke("onboarding:first-prompt", contents, {}, { root: ROOT, subject })).toBeNull();
  expect(await invoke("onboarding:first-prompt", {}, null, { root: ROOT, subject })).toBeNull();
  let finish!: () => void;
  mocks.clipboard.writeText.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  let settled = false;
  const copied = Promise.resolve(invoke("onboarding:copy", contents, null, { kind: "firstPrompt", root: ROOT, subject })).then(value => { settled = true; return value; });
  await Promise.resolve(); expect(settled).toBe(false); finish();
  expect(await copied).toEqual({ kind: "success" });
  expect(mocks.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(sentence);
  mocks.clipboard.writeText.mockClear();
  for (const request of [{ kind: "firstPrompt", root: ROOT }, { kind: "firstPrompt", root: "/plain", subject }, { kind: "firstPrompt", subject }, { kind: "firstPrompt", root: ROOT, text: "forged" }, { kind: "firstPrompt", root: "/other", subject }]) {
    expect(await invoke("onboarding:copy", contents, null, request)).toEqual({ kind: "stale" });
  }
  expect(await invoke("onboarding:copy", contents, {}, { kind: "firstPrompt", root: ROOT, subject })).toEqual({ kind: "stale" });
  expect(mocks.clipboard.writeText).not.toHaveBeenCalled();
  mocks.clipboard.writeText.mockRejectedValueOnce(new Error("denied"));
  expect(await invoke("onboarding:copy", contents, null, { kind: "firstPrompt", root: ROOT, subject })).toEqual({ kind: "error", message: "denied" });
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
    expect(template().map((menu) => menu.label ?? menu.role)).toEqual(["Doan", "File", "Edit", "View", "Go", "windowMenu"]);
    // Settings… replaces Set Up doan… right after About (orch.md decision).
    expect(submenu("Doan").map((entry) => entry.label ?? entry.role ?? entry.type)).toEqual(["about", "Settings…", "separator", "services", "separator", "hide", "hideOthers", "unhide", "separator", "quit"]);
    expect(item("Settings…").accelerator).toBe("CmdOrCtrl+,");
    expect(submenu("File").map((entry) => entry.label ?? entry.type)).toEqual(["Add Project…", "separator", "Close Window"]);
    expect(item("Add Project…").accelerator).toBe("CmdOrCtrl+O");
    expect(item("Close Window").accelerator).toBe("CmdOrCtrl+W");
    expect(submenu("Go").map((entry) => [entry.label ?? entry.type, entry.accelerator])).toEqual([["Home", "Shift+CmdOrCtrl+H"], ["Quick Open…", "CmdOrCtrl+K"], ["separator", undefined],
      ["Next Resolved Comment", "CmdOrCtrl+]"], ["Previous Resolved Comment", "CmdOrCtrl+["]]);
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
    for (const bad of [null, "canvas", { screen: "canvas" }, state("settings"), { ...state("canvas"), more: 1 }, { screen: "canvas", modal: 1, toast: false },
      { ...state("canvas"), reviewing: 1 }, { ...state("canvas"), reviewing: true, more: 1 }]) {
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

  // e2e clicks these items from main: Playwright cannot press native accelerators.
  test("Next/Previous Resolved Comment are enabled only while the renderer reports a Review, and tell the renderer", async () => {
    const contents = window().webContents;
    const labels = ["Next Resolved Comment", "Previous Resolved Comment"];
    await invoke("menu:state", contents, null, state("canvas"));
    for (const label of labels) expect(menuEnabled(label), label).toBe(false);
    await invoke("menu:state", contents, null, { ...state("canvas"), reviewing: true });
    for (const label of labels) expect(menuEnabled(label), label).toBe(true);
    click("Next Resolved Comment");
    click("Previous Resolved Comment");
    expect(contents.send).toHaveBeenCalledWith("menu-command", "nextResolved");
    expect(contents.send).toHaveBeenCalledWith("menu-command", "previousResolved");
    await invoke("menu:state", contents, null, { ...state("canvas", true), reviewing: true });
    for (const label of labels) expect(menuEnabled(label), label).toBe(false);
    await invoke("menu:state", contents, null, { ...state("canvas"), reviewing: true });
    window().webContents.emit("did-navigate");
    for (const label of labels) expect(menuEnabled(label), label).toBe(false);
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
    const selection = { root: APP, canvas: { path: ".doan/canvases/a.html", id: "a" }, element: { selector: "button", html: "<button>Go</button>" } };
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
    await invoke("selection:set", contents, null, { root: "/code/other", canvas: { path: ".doan/canvases/a.html" } });
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

  // Native teardown can fail before will-quit, so accepted state must already
  // be on disk when teardown starts.
  test("an approved quit flushes the state before disposing thumbnails", async () => {
    mocks.app.emit("before-quit", { preventDefault: vi.fn() });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(mocks.uiState.flushSync).toHaveBeenCalledOnce();
    expect(mocks.uiState.flushSync.mock.invocationCallOrder[0]).toBeLessThan(mocks.thumbnails.dispose.mock.invocationCallOrder[0] ?? 0);
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
    expect(await deps().capturer.capture("http://127.0.0.1:1/t/tok/k/.doan/canvases/a.html", 800)).toEqual(Buffer.from("png"));
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
    deps().changed({ root: "/repo", path: ".doan/canvases/a.html" });
    expect(window().webContents.send).toHaveBeenCalledWith("thumbnails:changed", { root: "/repo", path: ".doan/canvases/a.html" });
  });

  test("thumbnails:get passes a well-formed request from the window and refuses the rest", async () => {
    const contents = window().webContents;
    mocks.thumbnails.get.mockResolvedValue({ kind: "pending" });
    expect(await invoke("thumbnails:get", contents, null, { root: "/repo", path: ".doan/canvases/a.html", visible: true })).toEqual({ kind: "pending" });
    expect(mocks.thumbnails.get).toHaveBeenCalledExactlyOnceWith("/repo", ".doan/canvases/a.html", true);
    mocks.thumbnails.get.mockClear();
    const good = { root: "/repo", path: ".doan/canvases/a.html", visible: false };
    for (const bad of [null, "x", { root: "/repo", path: ".doan/canvases/a.html" }, { ...good, visible: 1 }, { ...good, root: 3 }, { ...good, path: null }, { ...good, more: 1 }]) {
      expect(await invoke("thumbnails:get", contents, null, bad)).toEqual({ kind: "unavailable" });
    }
    expect(await invoke("thumbnails:get", contents, {}, good)).toEqual({ kind: "unavailable" });
    expect(await invoke("thumbnails:get", {}, null, good)).toEqual({ kind: "unavailable" });
    expect(mocks.thumbnails.get).not.toHaveBeenCalled();
  });

  test("thumbnails:visible accepts only valid visibility from the app frame", async () => {
    const contents = window().webContents;
    const good = { root: "/repo", path: ".doan/canvases/a.html", visible: false };
    await invoke("thumbnails:visible", contents, null, good);
    expect(mocks.thumbnails.visible).toHaveBeenCalledExactlyOnceWith("/repo", ".doan/canvases/a.html", false);
    mocks.thumbnails.visible.mockClear();
    for (const bad of [null, "x", { root: "/repo", path: ".doan/canvases/a.html" }, { ...good, visible: 1 }, { ...good, root: 3 }, { ...good, path: null }, { ...good, more: 1 }]) {
      await invoke("thumbnails:visible", contents, null, bad);
    }
    await invoke("thumbnails:visible", contents, {}, good);
    await invoke("thumbnails:visible", {}, null, good);
    const hidden = await captureWindow();
    await invoke("thumbnails:visible", hidden.webContents, null, good);
    expect(mocks.thumbnails.visible).not.toHaveBeenCalled();
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
    expect(await invoke("thumbnails:get", hidden.webContents, null, { root: "/repo", path: ".doan/canvases/a.html", visible: true })).toEqual({ kind: "unavailable" });
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

  test("the main renderer learns when the window or the whole app is hidden and shown; only it may ask", async () => {
    const visible = () => vi.mocked(window().webContents.send).mock.calls.filter(([channel]) => channel === "window:visible").map(([, value]) => value);
    const notify = (name: string) => mocks.notifications.get(`NSApplicationDid${name}Notification`)?.();
    expect(await invoke("window:visible", window().webContents, null)).toEqual({ visible: true });
    window().emit("close", { preventDefault: vi.fn() });
    expect(await invoke("window:visible", window().webContents, null)).toEqual({ visible: false });
    mocks.app.emit("activate");
    notify("Hide");
    expect(await invoke("window:visible", window().webContents, null)).toEqual({ visible: false });
    notify("Unhide");
    expect(visible()).toEqual([{ visible: false }, { visible: true }, { visible: false }, { visible: true }]);
    expect(await invoke("window:visible", {}, null)).toBeNull();
    // Settings is refused by the test that runs every main-only channel from it.
    expect(await invoke("window:visible", (await captureWindow()).webContents, null)).toBeNull();
  });

  test("a fullscreen window pauses captures once it is really hidden", () => {
    window().isFullScreen.mockReturnValue(true);
    window().emit("close", { preventDefault: vi.fn() });
    expect(mocks.thumbnails.pause).not.toHaveBeenCalled();
    window().emit("leave-full-screen");
    expect(mocks.thumbnails.pause).toHaveBeenCalledOnce();
  });

  // Quit closes every window before will-quit; captures still running then
  // would open the capture window again and keep the app from quitting.
  test("a quit disposes the thumbnails once it is allowed, before will-quit", async () => {
    await invoke("comments:guard", window().webContents, null, true);
    mocks.app.emit("before-quit", { preventDefault: vi.fn() });
    expect(mocks.thumbnails.dispose).not.toHaveBeenCalled();
    const call = window().webContents.send.mock.calls.find(call => call[0] === "comments:transition");
    await invoke("comments:transition-answer", window().webContents, null, { id: call?.[1].id, allow: true });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(mocks.thumbnails.dispose).toHaveBeenCalledOnce();
  });

  test("quitting disposes the thumbnails, and the capturer destroys its window", async () => {
    mocks.app.emit("before-quit", { preventDefault: vi.fn() });
    await new Promise<void>(resolve => setImmediate(resolve));
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

describe("settings window", () => {
  const LIST = { path: ROOT, kind: "list", canvases: [], servedRev: 0, git: { common: `${ROOT}/.git`, main: ROOT, worktrees: [ROOT] } };
  const closeWizard = completeFirstRun;
  function settings() {
    const found = mocks.Window.instances.find((candidate) => candidate.options.width === 640);
    if (!found) throw new Error("no settings window");
    return found;
  }
  async function openSettings() {
    await closeWizard();
    click("Settings…");
    return settings();
  }

  test("Settings… is disabled while the wizard is open and opens one 640×560 window", async () => {
    expect(menuEnabled("Settings…")).toBe(false);
    click("Settings…");
    expect(mocks.Window.instances).toHaveLength(1);
    await closeWizard();
    expect(menuEnabled("Settings…")).toBe(true);
    click("Settings…");
    click("Settings…");
    expect(mocks.Window.instances).toHaveLength(2);
    const created = settings();
    expect(created.options).toMatchObject({ width: 640, height: 560, resizable: false, minimizable: false, maximizable: false, fullscreenable: false, title: "Connections", backgroundColor: shellColour(),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: expect.stringMatching(/\/preload\/settings\.cjs$/) } });
    expect(created.loadFile).toHaveBeenCalledWith(expect.stringMatching(/\/renderer\/settings\.html$/));
    expect(created.focus).toHaveBeenCalledOnce();
    const titled = { preventDefault: vi.fn() };
    created.emit("page-title-updated", titled);
    expect(titled.preventDefault).toHaveBeenCalled();
  });

  test("opens on the last saved tab", async () => {
    mocks.uiState.readSettingsTab.mockReturnValue("projects");
    expect((await openSettings()).options.title).toBe("Projects");
  });

  test("Settings cannot read design presets", async () => {
    const contents = (await openSettings()).webContents;
    const refused = { v: 1, ok: false, error: { code: "request_refused", message: expect.any(String), nextSteps: [] } };
    expect(await invoke("design-skills:list", contents, null)).toEqual(refused);
    expect(await invoke("design-skills:get", contents, null, { id: "clarify" })).toEqual(refused);
    expect(mocks.runDesignSkill).not.toHaveBeenCalled();
  });

  test("Settings refuses main-only channels like a foreign sender, and only Settings gets config", async () => {
    const { senderAllowed } = await import("./senderAllowed");
    mocks.shell.entries.mockReturnValue([LIST]);
    const contents = (await openSettings()).webContents;
    const value = { root: ROOT, path: ROOT, paths: [ROOT], kind: "firstPrompt", session: "x", requestId: "r", scanId: "s" };
    for (const channel of mocks.ipc.keys()) {
      if (senderAllowed(channel, "settings")) continue;
      expect(await invoke(channel, contents, null, value), channel).toEqual(await invoke(channel, {}, null, value));
    }
    expect(mocks.shell.reopen).not.toHaveBeenCalled();
    expect(mocks.shell.remove).not.toHaveBeenCalled();
    expect(mocks.inspector.inspect).not.toHaveBeenCalled();
    expect(mocks.clipboard.writeText).not.toHaveBeenCalled();
    expect(mocks.electronShell.showItemInFolder).not.toHaveBeenCalled();
    mocks.runConfig.mockResolvedValue({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: true, result: { repo: ROOT, serve: [], changed: false } }) });
    expect(await invoke("config:read", window().webContents, null, { root: ROOT })).toEqual({ kind: "unavailable" });
    expect(await invoke("config:read", contents, {}, { root: ROOT })).toEqual({ kind: "unavailable" });
    expect(mocks.runConfig).not.toHaveBeenCalled();
    expect(await invoke("config:read", contents, null, { root: ROOT })).toEqual({ kind: "config", root: ROOT, tokenCss: null, serve: [], changed: false });
    expect(mocks.runConfig).toHaveBeenCalledExactlyOnceWith("/bundled/doan", ROOT, []);
    expect(await invoke("setup:status", contents, null)).toMatchObject({ busy: false });
  });

  test("an unregistered window (the capture window) and a subframe of the app window are refused on every channel", async () => {
    const stranger = new mocks.Window({ show: false });
    const value = { root: ROOT, path: ROOT, paths: [ROOT], step: "cli", requestId: "r" };
    expect(mocks.ipc.size).toBeGreaterThan(0);
    for (const channel of mocks.ipc.keys()) {
      const refused = await invoke(channel, {}, null, value);
      expect(await invoke(channel, stranger.webContents, null, value), channel).toEqual(refused);
      expect(await invoke(channel, window().webContents, {}, value), channel).toEqual(refused);
    }
    expect(await invoke("setup:status", stranger.webContents, null)).toBeNull();
    expect(await invoke("folders:get", stranger.webContents, null)).toEqual([]);
    expect(await invoke("projects:get", stranger.webContents, null)).toEqual([]);
  });

  test("config:choose attaches the sheet to Settings and returns only a choice id and the path", async () => {
    mocks.shell.entries.mockReturnValue([LIST]);
    const created = await openSettings();
    mocks.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [`${ROOT}/tokens.css`] });
    const chosen = await invoke("config:choose", created.webContents, null, { root: ROOT, kind: "tokenCss" }) as { kind: string; choiceId: string };
    expect(chosen).toEqual({ kind: "selected", choiceId: expect.any(String), path: `${ROOT}/tokens.css` });
    expect(mocks.dialog.showOpenDialog).toHaveBeenCalledWith(created, expect.objectContaining({ defaultPath: ROOT, properties: ["openFile"] }));
    mocks.runConfig.mockResolvedValue({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: true, result: { repo: ROOT, tokenCss: "tokens.css", serve: [], changed: true } }) });
    expect(await invoke("config:write", created.webContents, null, { root: ROOT, op: "setTokenCss", choiceId: chosen.choiceId })).toMatchObject({ kind: "config", changed: true });
    expect(mocks.runConfig).toHaveBeenCalledWith("/bundled/doan", ROOT, ["--token-css", `${ROOT}/tokens.css`]);
  });

  test("Close Window closes Settings only when it has focus; the main window still hides", async () => {
    const created = await openSettings();
    created.emit("focus");
    click("Close Window");
    expect(created.close).toHaveBeenCalledOnce();
    expect(window().close).not.toHaveBeenCalled();
    // Not turned into a hide: Settings really closes, with ⌘Q too.
    const closing = { preventDefault: vi.fn() };
    created.emit("close", closing);
    expect(closing.preventDefault).not.toHaveBeenCalled();
    created.emit("closed");
    click("Close Window");
    expect(window().close).toHaveBeenCalledOnce();
    mocks.app.emit("activate");
    expect(window().show).toHaveBeenCalled();
    expect(created.show).not.toHaveBeenCalled();
  });

  describe("closing while its own write runs", () => {
    async function startWrite(created: ReturnType<typeof settings>) {
      let finish!: (value: unknown) => void;
      mocks.machine.run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const writing = invoke("setup:run", created.webContents, null, { step: "cli", expected: {} });
      return { finish, writing };
    }

    test("the red button and Close Window are held until the write settles", async () => {
      const created = await openSettings();
      const { finish, writing } = await startWrite(created);
      const held = { preventDefault: vi.fn() };
      created.emit("close", held);
      expect(held.preventDefault).toHaveBeenCalledOnce();
      expect(mocks.machine.cancelConfirmation).not.toHaveBeenCalled();
      finish({ kind: "success" });
      expect(await writing).toEqual({ kind: "success" });
      const free = { preventDefault: vi.fn() };
      created.emit("close", free);
      expect(free.preventDefault).not.toHaveBeenCalled();
    });

    test("an answered confirmation is a running write again", async () => {
      const created = await openSettings();
      mocks.machine.run.mockResolvedValueOnce({ kind: "confirm", id: "q", target: "cli", message: "Replace?" });
      await invoke("setup:run", created.webContents, null, { step: "cli", expected: {} });
      const asking = { preventDefault: vi.fn() };
      created.emit("close", asking);
      expect(asking.preventDefault).not.toHaveBeenCalled();
      let finish!: (value: unknown) => void;
      mocks.machine.answer.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const answering = invoke("setup:answer", created.webContents, null, { id: "q", allow: true });
      const held = { preventDefault: vi.fn() };
      created.emit("close", held);
      expect(held.preventDefault).toHaveBeenCalledOnce();
      finish({ kind: "success" });
      await answering;
    });

    test("a pending confirmation does not hold the close; closing cancels it and frees the lock", async () => {
      const created = await openSettings();
      mocks.machine.run.mockResolvedValueOnce({ kind: "confirm", id: "q", target: "cli", message: "Replace?" });
      await invoke("setup:run", created.webContents, null, { step: "cli", expected: {} });
      const closing = { preventDefault: vi.fn() };
      created.emit("close", closing);
      expect(closing.preventDefault).not.toHaveBeenCalled();
      created.emit("closed");
      expect(mocks.machine.cancelConfirmation).toHaveBeenCalledOnce();
      expect(await invoke("setup:run", window().webContents, null, { step: "cli", expected: {} })).toEqual({ kind: "success" });
    });

    test("the wizard's or main window's write does not hold Settings", async () => {
      const created = await openSettings();
      let finish!: (value: unknown) => void;
      mocks.machine.run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const writing = invoke("setup:run", window().webContents, null, { step: "cli", expected: {} });
      const closing = { preventDefault: vi.fn() };
      created.emit("close", closing);
      expect(closing.preventDefault).not.toHaveBeenCalled();
      finish({ kind: "success" });
      await writing;
    });

    test("quitting is not held", async () => {
      const created = await openSettings();
      const { finish, writing } = await startWrite(created);
      mocks.app.emit("before-quit", { preventDefault: vi.fn() });
      await new Promise<void>(resolve => setImmediate(resolve));
      const closing = { preventDefault: vi.fn() };
      created.emit("close", closing);
      expect(closing.preventDefault).not.toHaveBeenCalled();
      finish({ kind: "success" });
      await writing;
    });
  });

  test("Close Window acts on the window Electron reports as focused, and a just-opened Settings counts as focused", async () => {
    const created = await openSettings();
    // No focus event yet (an inactive app gets none): opening it is enough.
    click("Close Window");
    expect(created.close).toHaveBeenCalledOnce();
    created.close.mockClear();
    const close = item("Close Window").click;
    if (!close) throw new Error("no click handler");
    Reflect.apply(close, undefined, [item("Close Window"), window(), undefined]);
    expect(window().close).toHaveBeenCalledOnce();
    expect(created.close).not.toHaveBeenCalled();
    window().emit("focus");
    Reflect.apply(close, undefined, [item("Close Window"), created, undefined]);
    expect(created.close).toHaveBeenCalledOnce();
  });

  test("Settings focus disables main-window items including Undo Remove", async () => {
    const created = await openSettings();
    window().emit("focus");
    await invoke("menu:state", window().webContents, null, state("canvas", false, true));
    expect(submenu("Edit")[0]).toMatchObject({ label: "Undo Remove" });
    created.emit("focus");
    for (const label of ["Add Project…", "Home", "Quick Open…", "Zoom In", "Reload Canvas"]) expect(menuEnabled(label), label).toBe(false);
    expect(submenu("Edit")[0]?.role).toBe("undo");
    expect(menuEnabled("Settings…")).toBe(true);
    window().emit("focus");
    expect(menuEnabled("Add Project…")).toBe(true);
    expect(submenu("Edit")[0]).toMatchObject({ label: "Undo Remove" });
  });

  test("the main window and Settings cannot write at the same time: one gets busy", async () => {
    const contents = window().webContents;
    let finish!: (value: unknown) => void;
    await closeWizard();
    click("Settings…");
    mocks.machine.run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const fromSettings = invoke("setup:run", settings().webContents, null, { step: "cli", expected: {} });
    expect(await invoke("setup:run", contents, null, { step: "cli", expected: {} })).toEqual({ kind: "busy" });
    finish({ kind: "success" });
    expect(await fromSettings).toEqual({ kind: "success" });
  });

  test("a closed Settings window releases its confirmation", async () => {
    const created = await openSettings();
    mocks.machine.run.mockResolvedValueOnce({ kind: "confirm", id: "q", target: "cli", message: "Replace?" });
    expect(await invoke("setup:run", created.webContents, null, { step: "cli", expected: {} })).toMatchObject({ kind: "confirm" });
    expect(await invoke("setup:answer", window().webContents, null, { id: "q", allow: true })).toEqual({ kind: "busy" });
    mocks.machine.cancelConfirmation.mockClear();
    created.emit("closed");
    expect(mocks.machine.cancelConfirmation).toHaveBeenCalledOnce();
    expect(await invoke("setup:run", window().webContents, null, { step: "cli", expected: {} })).toEqual({ kind: "success" });
  });

  test.each(["render-process-gone", "closed"])("the main window's %s releases its confirmation", async event => {
    const contents = window().webContents;
    mocks.machine.run.mockResolvedValueOnce({ kind: "confirm", id: "q", target: "cli", message: "Replace?" });
    expect(await invoke("setup:run", contents, null, { step: "cli", expected: {} })).toMatchObject({ kind: "confirm" });
    mocks.machine.cancelConfirmation.mockClear();
    if (event === "closed") window().emit("closed"); else contents.emit(event);
    expect(mocks.machine.cancelConfirmation).toHaveBeenCalledOnce();
  });

  test("hiding the main window keeps its confirmation", async () => {
    const contents = window().webContents;
    mocks.machine.run.mockResolvedValueOnce({ kind: "confirm", id: "q", target: "cli", message: "Replace?" });
    expect(await invoke("setup:run", contents, null, { step: "cli", expected: {} })).toMatchObject({ kind: "confirm" });
    mocks.machine.cancelConfirmation.mockClear();
    window().emit("close", { preventDefault: vi.fn() });
    expect(mocks.machine.cancelConfirmation).not.toHaveBeenCalled();
  });

  test("the summary is read at start, on main focus once a minute, on Settings open and Check Again, and sent to both windows", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now");
    try {
      await vi.waitFor(() => expect(mocks.machine.read).toHaveBeenCalledOnce());
      await vi.waitFor(() => expect(window().webContents.send).toHaveBeenCalledWith("setup:status", { summary: { cli: "connected", claude: "connected", codex: "connected" }, causes: {}, checking: false, busy: false, onboardingClosed: false }));
      clock.mockReturnValue(now + 1_000);
      window().emit("focus");
      clock.mockReturnValue(now + 120_000);
      window().emit("focus");
      await vi.waitFor(() => expect(mocks.machine.read).toHaveBeenCalledTimes(2));
      mocks.readCompletion.mockReturnValue(COMPLETE);
      const created = await openSettings();
      await vi.waitFor(() => expect(mocks.machine.read).toHaveBeenCalledTimes(3));
      expect(await invoke("setup:check-again", created.webContents, null)).toMatchObject({ onboardingClosed: true });
      expect(mocks.machine.read).toHaveBeenCalledTimes(4);
      expect(created.webContents.send).toHaveBeenCalledWith("setup:status", expect.objectContaining({ onboardingClosed: true }));
    } finally { clock.mockRestore(); }
  });

  test("setup:read answers the Settings window with the state and its summary", async () => {
    const created = await openSettings();
    expect(await invoke("setup:read", created.webContents, null, { requestId: "x" })).toEqual({ kind: "state", state: MACHINE, summary: { cli: "connected", claude: "connected", codex: "connected" } });
    for (const bad of [{}, { requestId: "" }, { requestId: "x", session: "s" }, null]) expect(await invoke("setup:read", created.webContents, null, bad)).toEqual({ kind: "stale" });
  });

  test("install pages: only the two fixed URLs open", async () => {
    expect(await invoke("setup:open-external", window().webContents, null, { target: "codex" })).toBe(true);
    expect(mocks.electronShell.openExternal).toHaveBeenCalledExactlyOnceWith("https://learn.chatgpt.com/docs/codex/cli");
    for (const bad of [{ target: "https://evil.example" }, { target: "claude", url: "x" }, "claude"]) {
      expect(await invoke("setup:open-external", window().webContents, null, bad)).toBe(false);
    }
    expect(mocks.electronShell.openExternal).toHaveBeenCalledOnce();
  });

  test("the PATH line is copied for Settings after the clipboard settles", async () => {
    const created = await openSettings();
    let finish!: () => void;
    mocks.clipboard.writeText.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    let settled = false;
    const copied = Promise.resolve(invoke("setup:copy-path-line", created.webContents, null)).then(value => { settled = true; return value; });
    await Promise.resolve(); expect(settled).toBe(false); finish();
    expect(await copied).toEqual({ kind: "success" });
    expect(mocks.clipboard.writeText).toHaveBeenCalledWith('export PATH="$HOME/.local/bin:$PATH"');
    expect(await invoke("setup:copy-path-line", created.webContents, null, { text: "forged" })).toEqual({ kind: "stale" });
  });

  test("main opens Settings at a tab and row; the target is taken once and later ones are sent", async () => {
    mocks.shell.entries.mockReturnValue([LIST]);
    await closeWizard();
    expect(await invoke("settings:open", window().webContents, null, { tab: "projects", project: "/elsewhere" })).toBe(false);
    expect(await invoke("settings:open", window().webContents, null, { tab: "projects", project: ROOT })).toBe(true);
    const created = settings();
    expect(created.options.title).toBe("Projects");
    expect(await invoke("settings:take-target", created.webContents, null)).toEqual({ tab: "projects", project: ROOT });
    expect(await invoke("settings:take-target", created.webContents, null)).toBeNull();
    expect(await invoke("settings:open", window().webContents, null, { tab: "connections", connection: "cli" })).toBe(true);
    expect(mocks.Window.instances).toHaveLength(2);
    expect(created.webContents.send).toHaveBeenCalledWith("settings:target", { tab: "connections", connection: "cli" });
    expect(created.setTitle).toHaveBeenCalledWith("Connections");
  });

  test("the last tab is read and saved as a tab only, and names the window", async () => {
    const created = await openSettings();
    expect(await invoke("settings:tab-get", created.webContents, null)).toBe("connections");
    expect(await invoke("settings:tab-save", created.webContents, null, { tab: "projects" })).toBe(true);
    expect(mocks.uiState.saveSettingsTab).toHaveBeenCalledExactlyOnceWith("projects");
    expect(created.setTitle).toHaveBeenCalledWith("Projects");
    for (const bad of [{ tab: "general" }, "projects", { tab: "projects", screen: "home" }]) expect(await invoke("settings:tab-save", created.webContents, null, bad)).toBe(false);
    expect(mocks.uiState.save).not.toHaveBeenCalled();
  });

  test("Projects sees a read-only projection, reveals stored roots and forwards row actions to the main window", async () => {
    // The same home Home gets from app:home.
    const home = process.env.HOME ?? "/tmp/doan-index-test";
    mocks.shell.entries.mockReturnValue([LIST, { path: "/plain", kind: "uninitialized" }, { path: `${home}/work`, kind: "uninitialized" }]);
    const created = await openSettings();
    expect(await invoke("app:home", window().webContents, null)).toBe(home);
    expect(await invoke("projects:get", created.webContents, null)).toEqual([
      { path: ROOT, displayPath: displayPath(ROOT, home), kind: "list", git: { common: `${ROOT}/.git`, main: ROOT } },
      { path: "/plain", displayPath: "/plain", kind: "uninitialized" },
      { path: `${home}/work`, displayPath: "~/work", kind: "uninitialized" },
    ]);
    const changed = mocks.startShell.mock.calls[0]?.[2];
    if (typeof changed !== "function") throw new Error("no folder listener");
    changed([{ path: "/plain", kind: "uninitialized" }]);
    expect(created.webContents.send).toHaveBeenCalledWith("projects", [{ path: "/plain", displayPath: "/plain", kind: "uninitialized" }]);
    await invoke("projects:reveal", created.webContents, null, { path: "/plain" });
    await invoke("projects:reveal", created.webContents, null, { path: "/other" });
    expect(mocks.electronShell.showItemInFolder).toHaveBeenCalledExactlyOnceWith("/plain");
    window().emit("close", { preventDefault: vi.fn() });
    expect(await invoke("projects:forward-action", created.webContents, null, { path: "/plain", action: "setUp" })).toBe(true);
    expect(window().show).toHaveBeenCalled();
    expect(window().focus).toHaveBeenCalled();
    expect(window().webContents.send).toHaveBeenCalledWith("projects:action", { path: "/plain", action: "setUp" });
    expect(await invoke("projects:forward-action", created.webContents, null, { path: "/plain", action: "showInFinder" })).toBe(false);
  });

  test("Settings cannot forward project actions while the main window has a modal", async () => {
    mocks.shell.entries.mockReturnValue([{ path: "/plain", kind: "uninitialized" }]);
    const created = await openSettings();
    await invoke("menu:state", window().webContents, null, { screen: "home", modal: true, toast: false });
    window().webContents.send.mockClear();
    window().focus.mockClear();
    for (const action of ["setUp", "locate", "remove", "retry", "details"]) {
      expect(await invoke("projects:forward-action", created.webContents, null, { path: "/plain", action })).toBe(false);
    }
    expect(window().webContents.send).not.toHaveBeenCalledWith("projects:action", expect.anything());
    expect(window().focus).not.toHaveBeenCalled();
    await invoke("menu:state", window().webContents, null, { screen: "home", modal: false, toast: false });
    expect(await invoke("projects:forward-action", created.webContents, null, { path: "/plain", action: "setUp" })).toBe(true);
  });

  test("first prompt takes a subject and builds the sentence with promptSentence", async () => {
    const contents = window().webContents;
    mocks.shell.entries.mockReturnValue([{ path: ROOT, kind: "list" }]);
    const sentence = `Use the doan skill to make a design canvas in ${ROOT} for a sign-in screen.`;
    expect(await invoke("onboarding:first-prompt", contents, null, { root: ROOT, subject: "  a sign-in screen... " })).toBe(sentence);
    for (const subject of ["", "a\nb", "x".repeat(501), 3]) expect(await invoke("onboarding:first-prompt", contents, null, { root: ROOT, subject })).toBeNull();
    expect(await invoke("onboarding:first-prompt", contents, null, { root: "/other", subject: "a" })).toBeNull();
    mocks.clipboard.writeText.mockResolvedValue(undefined);
    expect(await invoke("onboarding:copy", contents, null, { kind: "firstPrompt", root: ROOT, subject: "a sign-in screen" })).toEqual({ kind: "success" });
    expect(mocks.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(sentence);
    expect(await invoke("onboarding:copy", contents, null, { kind: "firstPrompt", root: ROOT, subject: "a\u0007" })).toEqual({ kind: "stale" });
    expect(await invoke("onboarding:copy", contents, null, { kind: "firstPrompt", root: ROOT, subject: "a", extra: 1 })).toEqual({ kind: "stale" });
  });

  test("the Project step's folder picker returns a path only and registers nothing", async () => {
    const contents = window().webContents;
    expect(await invoke("onboarding:choose-folder", contents, null, "project")).toBeNull();
    mocks.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/picked"] });
    expect(await invoke("onboarding:choose-folder", contents, null, "project")).toBe("/picked");
    expect(mocks.dialog.showOpenDialog).toHaveBeenLastCalledWith(window(), expect.objectContaining({ properties: ["openDirectory"] }));
    expect(await invoke("onboarding:choose-folder", contents, null, "destination")).toBe("/picked");
    expect(mocks.dialog.showOpenDialog).toHaveBeenLastCalledWith(window(), expect.objectContaining({ properties: ["openDirectory", "createDirectory"] }));
    expect(mocks.flow.add).not.toHaveBeenCalled();
    mocks.dialog.showOpenDialog.mockClear();
    for (const purpose of [undefined, "other", 1]) expect(await invoke("onboarding:choose-folder", contents, null, purpose)).toBeNull();
    expect(await invoke("onboarding:choose-folder", contents, {}, "project")).toBeNull();
    expect(mocks.dialog.showOpenDialog).not.toHaveBeenCalled();
  });
});

// A quit can reenter Electron while a BrowserWindow constructor is emitting
// layout events, before its JS wrapper exists (macOS SIGSEGV at WillCloseWindow).
test("an approved quit prevents native window teardown until the next event-loop turn", async () => {
  const event = { preventDefault: vi.fn() };
  mocks.app.emit("before-quit", event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(mocks.thumbnails.dispose).not.toHaveBeenCalled();
  expect(mocks.app.quit).not.toHaveBeenCalled();
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(mocks.uiState.flushSync).toHaveBeenCalledOnce();
  expect(mocks.thumbnails.dispose).toHaveBeenCalledOnce();
  expect(mocks.uiState.flushSync.mock.invocationCallOrder[0]).toBeLessThan(mocks.thumbnails.dispose.mock.invocationCallOrder[0] ?? 0);
  expect(mocks.app.quit).toHaveBeenCalledOnce();
  expect(mocks.thumbnails.dispose.mock.invocationCallOrder[0]).toBeLessThan(mocks.app.quit.mock.invocationCallOrder[0] ?? 0);
  const resumed = { preventDefault: vi.fn() };
  mocks.app.emit("before-quit", resumed);
  expect(resumed.preventDefault).not.toHaveBeenCalled();
});

test("repeated quit requests before deferred teardown schedule only one quit", async () => {
  const events = [{ preventDefault: vi.fn() }, { preventDefault: vi.fn() }];
  for (const event of events) mocks.app.emit("before-quit", event);
  for (const event of events) expect(event.preventDefault).toHaveBeenCalledOnce();
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(mocks.thumbnails.dispose).toHaveBeenCalledOnce();
  expect(mocks.app.quit).toHaveBeenCalledOnce();
});

test("a cancelled quit leaves thumbnails alive and allows a later approved quit", async () => {
  await invoke("comments:guard", window().webContents, null, true);
  mocks.app.emit("before-quit", { preventDefault: vi.fn() });
  const call = window().webContents.send.mock.calls.find(call => call[0] === "comments:transition");
  await invoke("comments:transition-answer", window().webContents, null, { id: call?.[1].id, allow: false });
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(mocks.thumbnails.dispose).not.toHaveBeenCalled();
  expect(mocks.app.quit).not.toHaveBeenCalled();
  await invoke("comments:guard", window().webContents, null, false);
  mocks.app.emit("before-quit", { preventDefault: vi.fn() });
  expect(mocks.thumbnails.dispose).not.toHaveBeenCalled();
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(mocks.thumbnails.dispose).toHaveBeenCalledOnce();
  expect(mocks.app.quit).toHaveBeenCalledOnce();
});


test.each(["window", "app", "both"])("guarded quit reveals and focuses main before dispatch after hiding %s", async hidden => {
  const main = window(), contents = main.webContents;
  if (hidden !== "app") main.emit("close", { preventDefault: vi.fn() });
  if (hidden !== "window") mocks.notifications.get("NSApplicationDidHideNotification")?.();
  mocks.app.show.mockImplementationOnce(() => { mocks.notifications.get("NSApplicationDidUnhideNotification")?.(); });
  await invoke("comments:guard", contents, null, true);
  contents.send.mockClear();
  mocks.app.emit("before-quit", { preventDefault: vi.fn() });
  expect(main.show).toHaveBeenCalledOnce();
  expect(main.focus).toHaveBeenCalledOnce();
  expect(mocks.app.show).toHaveBeenCalledTimes(hidden === "window" ? 0 : 1);
  const index = contents.send.mock.calls.findIndex(call => call[0] === "comments:transition");
  const request = contents.send.mock.calls[index]?.[1];
  expect(request).toMatchObject({ kind: "quit" });
  expect(main.show.mock.invocationCallOrder[0]).toBeLessThan(main.focus.mock.invocationCallOrder[0] ?? 0);
  expect(main.focus.mock.invocationCallOrder[0]).toBeLessThan(contents.send.mock.invocationCallOrder[index] ?? 0);
  if (hidden !== "window") expect(mocks.app.show.mock.invocationCallOrder[0]).toBeLessThan(main.show.mock.invocationCallOrder[0] ?? 0);
  expect(await invoke("window:visible", contents, null)).toEqual({ visible: true });
  mocks.app.emit("before-quit", { preventDefault: vi.fn() });
  expect(main.show).toHaveBeenCalledOnce();
  expect(contents.send.mock.calls.filter(call => call[0] === "comments:transition")).toHaveLength(1);
  await invoke("comments:transition-answer", contents, null, { id: "stale", allow: true });
  await invoke("comments:transition-answer", contents, {}, { id: request.id, allow: true });
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(mocks.app.quit).not.toHaveBeenCalled();
  await invoke("comments:transition-answer", contents, null, { id: request.id, allow: false });
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(mocks.app.quit).not.toHaveBeenCalled();
  expect(mocks.thumbnails.dispose).not.toHaveBeenCalled();
});

test.each(["window", "app", "both"])("unguarded quit does not reveal hidden %s", async hidden => {
  const main = window();
  if (hidden !== "app") main.emit("close", { preventDefault: vi.fn() });
  if (hidden !== "window") mocks.notifications.get("NSApplicationDidHideNotification")?.();
  mocks.app.emit("before-quit", { preventDefault: vi.fn() });
  expect(main.show).not.toHaveBeenCalled();
  expect(main.focus).not.toHaveBeenCalled();
  expect(mocks.app.show).not.toHaveBeenCalled();
  expect(mocks.app.quit).not.toHaveBeenCalled();
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(mocks.app.quit).toHaveBeenCalledOnce();
});

test("guarded quit cancels a pending fullscreen hide before presenting the guard", async () => {
  const main = window();
  main.isFullScreen.mockReturnValue(true);
  main.emit("close", { preventDefault: vi.fn() });
  await invoke("comments:guard", main.webContents, null, true);
  mocks.app.emit("before-quit", { preventDefault: vi.fn() });
  main.emit("leave-full-screen");
  expect(main.show).toHaveBeenCalledOnce();
  expect(main.hide).not.toHaveBeenCalled();
});

describe("review state and project comments", () => {
  const MARKER = { since: "2026-10-26T09:00:00.000Z" };
  const RAISED = { since: "2026-10-26T09:00:00.000Z", lastReviewedAt: "2026-10-26T10:00:00.000Z" };
  beforeEach(() => {
    mocks.shell.entries.mockReturnValue(entries);
    mocks.shell.remove.mockImplementation(async (paths: string[]) => ({ paths, indexes: paths.map((path) => entries.findIndex((entry) => entry.path === path)) }));
    mocks.shell.restore.mockImplementation(async (paths: string[]) => paths);
    mocks.reviewStore.marker.mockReturnValue(MARKER);
    mocks.reviewStore.raise.mockReturnValue(RAISED);
  });

  test("the store lives beside folders.json and prunes against the saved roots", () => {
    const [file, saved] = mocks.createReviewStore.mock.calls[0] ?? [];
    expect(file).toBe("/tmp/doan-index-test/review-state.json");
    expect(typeof saved === "function" ? saved() : null).toEqual(entries.map((entry) => entry.path));
    mocks.shell.entries.mockReturnValue([]);
    expect(typeof saved === "function" ? saved() : null).toEqual(entries.map((entry) => entry.path));
  });

  test("startup leaves pruning unauthorized when folders.json could not be read", async () => {
    mocks.readFoldersFileForPruning.mockResolvedValue(null);
    vi.resetModules();
    mocks.createReviewStore.mockClear();
    await import("./index");
    await vi.waitFor(() => expect(mocks.createReviewStore).toHaveBeenCalledOnce());
    const [, saved] = mocks.createReviewStore.mock.calls[0] ?? [];
    expect(mocks.readFoldersFileForPruning).toHaveBeenCalledWith("/tmp/doan-index-test/folders.json");
    expect(typeof saved === "function" ? saved() : "missing callback").toBeNull();
  });

  test("read and raise answer only the window's main frame, for a saved root and a valid request", async () => {
    const contents = window().webContents;
    expect(await invoke("review-state:get", contents, null, { root: APP, canvas: "home" })).toEqual(MARKER);
    expect(mocks.reviewStore.marker).toHaveBeenCalledExactlyOnceWith(APP, "home");
    expect(await invoke("review-state:raise", contents, null, { root: APP, canvas: "home", at: RAISED.lastReviewedAt })).toEqual(RAISED);
    expect(mocks.reviewStore.raise).toHaveBeenCalledExactlyOnceWith(APP, "home", RAISED.lastReviewedAt);
    mocks.reviewStore.marker.mockClear();
    mocks.reviewStore.raise.mockClear();
    for (const [sender, parent] of [[contents, {}], [{}, null]]) {
      expect(await invoke("review-state:get", sender, parent, { root: APP, canvas: "home" })).toBeNull();
      expect(await invoke("review-state:raise", sender, parent, { root: APP, canvas: "home", at: RAISED.lastReviewedAt })).toBeNull();
    }
    for (const bad of [null, { root: "/nope", canvas: "home" }, { root: APP, canvas: "Bad" }, { root: APP }]) {
      expect(await invoke("review-state:get", contents, null, bad), JSON.stringify(bad)).toBeNull();
    }
    for (const bad of [{ root: "/nope", canvas: "home", at: RAISED.lastReviewedAt }, { root: APP, canvas: "home", at: "yesterday" }, { root: APP, canvas: "home" }]) {
      expect(await invoke("review-state:raise", contents, null, bad), JSON.stringify(bad)).toBeNull();
    }
    expect(mocks.reviewStore.marker).not.toHaveBeenCalled();
    expect(mocks.reviewStore.raise).not.toHaveBeenCalled();
  });

  test("comments:project reads a saved root with one fresh ls, the comment files, the Git name and the markers", async () => {
    const contents = window().webContents;
    const reply = { root: APP, revision: 3, kind: "list", canvases: [] };
    mocks.readProjectComments.mockResolvedValue(reply);
    expect(await invoke("comments:project", contents, null, { root: APP, revision: 3 })).toEqual(reply);
    const [deps, request] = mocks.readProjectComments.mock.calls[0] ?? [];
    expect(request).toEqual({ root: APP, revision: 3 });
    mocks.readFolder.mockResolvedValue({ kind: "uninitialized" });
    expect(await deps.list(APP)).toEqual({ kind: "uninitialized" });
    expect(mocks.readFolder).toHaveBeenCalledExactlyOnceWith("/bundled/doan", APP);
    expect(deps.marker(APP, "home")).toEqual(MARKER);
    expect(mocks.reviewStore.marker).toHaveBeenCalledWith(APP, "home");
    // The same epoch the orphan write checks, so a reply's project matches it.
    mocks.shell.epoch.mockReturnValue(5);
    expect(deps.epoch(APP)).toBe(5);
    expect(mocks.shell.epoch).toHaveBeenLastCalledWith(APP);
    mocks.shell.epoch.mockReturnValue(null);
    expect(deps.epoch(APP)).toBeNull();
  });

  test("comments:project refuses other senders, bad requests and roots that are not saved", async () => {
    const contents = window().webContents;
    for (const [sender, parent] of [[contents, {}], [{}, null]]) {
      expect(await invoke("comments:project", sender, parent, { root: APP, revision: 1 })).toBeNull();
    }
    for (const bad of [null, { root: APP }, { root: "/nope", revision: 1 }, { root: APP, revision: -1 }]) {
      expect(await invoke("comments:project", contents, null, bad), JSON.stringify(bad)).toBeNull();
    }
    expect(mocks.readProjectComments).not.toHaveBeenCalled();
  });

  test("a removal keeps the markers while Undo is possible and forgets them when the toast expires", async () => {
    const contents = window().webContents;
    const removed = await invoke("folders:remove", contents, null, { paths: [APP] }) as { removalId: string };
    expect(mocks.reviewStore.forget).not.toHaveBeenCalled();
    mocks.shell.entries.mockReturnValue(entries.filter((entry) => entry.path !== APP));
    await invoke("folders:forget-removal", contents, null, { removalId: removed.removalId });
    expect(mocks.reviewStore.forget).toHaveBeenCalledExactlyOnceWith([APP]);
  });

  test("Undo keeps the markers", async () => {
    const contents = window().webContents;
    const removed = await invoke("folders:remove", contents, null, { paths: [APP, WT] }) as { removalId: string };
    expect(await invoke("folders:restore", contents, null, { removalId: removed.removalId })).toMatchObject({ kind: "restored" });
    expect(mocks.reviewStore.forget).not.toHaveBeenCalled();
  });

  test("a newer removal makes the previous one permanent and forgets its markers", async () => {
    const contents = window().webContents;
    await invoke("folders:remove", contents, null, { paths: [APP] });
    mocks.shell.entries.mockReturnValue(entries.filter((entry) => entry.path !== APP));
    await invoke("folders:remove", contents, null, { paths: [WT] });
    expect(mocks.reviewStore.forget).toHaveBeenCalledExactlyOnceWith([APP]);
  });

  test("an older removal saved after a newer one started is permanent at once", async () => {
    const contents = window().webContents;
    let save!: () => void;
    mocks.shell.remove.mockImplementationOnce((paths: string[]) => new Promise((resolve) => { save = () => resolve({ paths, indexes: [0] }); }));
    const first = invoke("folders:remove", contents, null, { paths: [APP] }) as Promise<unknown>;
    await invoke("folders:remove", contents, null, { paths: [WT] });
    expect(mocks.reviewStore.forget).not.toHaveBeenCalled();
    mocks.shell.entries.mockReturnValue(entries.filter((entry) => entry.path !== APP && entry.path !== WT));
    save();
    await first;
    expect(mocks.reviewStore.forget).toHaveBeenCalledExactlyOnceWith([APP]);
  });

  test("a root added again before the removal became permanent keeps its markers", async () => {
    const contents = window().webContents;
    const removed = await invoke("folders:remove", contents, null, { paths: [APP, WT] }) as { removalId: string };
    mocks.shell.entries.mockReturnValue(entries.filter((entry) => entry.path !== WT));
    await invoke("folders:forget-removal", contents, null, { removalId: removed.removalId });
    expect(mocks.reviewStore.forget).toHaveBeenCalledExactlyOnceWith([WT]);
  });
});

test("conversation IPC rejects foreign windows and canvas frames", async () => {
  for (const method of ["resumeTarget", "forCanvas", "start", "send", "interrupt", "answerPermission", "read"]) {
    expect(await invoke(`conversation:${method}`, {}, null, {})).toEqual({ error: "bad_request" });
    expect(await invoke(`conversation:${method}`, window().webContents, {}, {})).toEqual({ error: "bad_request" });
  }
});

test("shell activity refuses foreign windows, subframes, unknown roots, and sparse requests", async () => {
  const contents = window().webContents;
  expect(await invoke("shell:activity", {}, null, { roots: [] })).toBeNull();
  expect(await invoke("shell:activity", contents, {}, { roots: [] })).toBeNull();
  expect(await invoke("shell:activity", contents, null, { roots: ["/not-registered"] })).toBeNull();
  expect(await invoke("shell:activity", contents, null, { roots: Array(1) })).toBeNull();
  expect(await invoke("shell:activity", contents, null, { roots: [] })).toEqual([]);
});
