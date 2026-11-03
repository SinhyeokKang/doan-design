import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { BrowserWindowConstructorOptions, MenuItemConstructorOptions } from "electron";

const OUTCOME = { added: ["/repo"], duplicate: null, messages: [], confirm: null };
const DEFAULTS = { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: null };

const mocks = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  class Window extends EventEmitter {
    static instances: Window[] = [];
    static ids = 0;
    destroyed = false;
    contentsDestroyed = false;
    webContents = Object.assign(new EventEmitter(), { id: ++Window.ids, send: vi.fn(), isDestroyed: () => this.contentsDestroyed, debugger: { name: "debugger" },
      executeJavaScript: vi.fn(async (_script?: string): Promise<unknown> => ({ x: 0, y: 0, width: 800, height: 500 })), undo: vi.fn(), redo: vi.fn(), getZoomFactor: vi.fn(() => 1),
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
    getContentBounds = vi.fn(() => ({ x: 100, y: 40, width: 1280, height: 800 }));
    isDestroyed = () => this.destroyed;
    isFocused = vi.fn(() => false);
    isMinimized = vi.fn(() => false);
    restore = vi.fn();
    loadFile = vi.fn();
    loadURL = vi.fn();
    constructor(readonly options: BrowserWindowConstructorOptions) {
      super();
      Window.instances.push(this);
    }
  }
  // Electron's Notification as main uses it: shown, closed, clicked, refused.
  class Notification extends EventEmitter {
    static instances: Notification[] = [];
    show = vi.fn();
    close = vi.fn();
    constructor(readonly options: { title: string; body: string }) {
      super();
      Notification.instances.push(this);
    }
  }
  return {
    Window,
    Notification,
    // Conversation metadata the mocked store lists, and the service's event publisher main passed it.
    conversations: [] as unknown[],
    publishConversation: undefined as ((event: unknown) => void) | undefined,
    // The conversation service main created, so a test can pin what main asks it.
    conversationService: undefined as { list(root: string): unknown[]; projectEvidence(root: string): unknown[] } | undefined,
    preferences: { read: vi.fn(), current: vi.fn(), update: vi.fn() },
    createPreferencesStore: vi.fn(),
    app: Object.assign(new EventEmitter(), { setName: vi.fn(), whenReady: vi.fn<() => Promise<void>>(), isPackaged: true, getPath: () => "/tmp/doan-index-test", getVersion: () => "9.8.7", exit: vi.fn(), quit: vi.fn(), show: vi.fn(), requestSingleInstanceLock: vi.fn(() => true) }),
    ipc: new Map<string, (...args: unknown[]) => unknown>(),
    shell: { tokenBase: "http://127.0.0.1:1/t/tok/", entries: vi.fn<() => { path: string; kind?: string }[]>(() => []), open: vi.fn<() => Promise<{ root: string } | { refused: string }>>(), reopen: vi.fn(), initialize: vi.fn(), epoch: vi.fn(), dispose: vi.fn(),
      store: vi.fn(), remove: vi.fn(), restore: vi.fn(), replace: vi.fn(), rereadAll: vi.fn() },
    flow: { add: vi.fn(), confirm: vi.fn(), judge: vi.fn() },
    createAddFlow: vi.fn(),
    electronShell: { showItemInFolder: vi.fn(), openExternal: vi.fn(), trashItem: vi.fn() },
    // AppKit notifications by name, as main last subscribed to them.
    notifications: new Map<string, () => void>(),
    startShell: vi.fn(),
    cliCommand: vi.fn(() => "/bundled/doan"),
    runConfig: vi.fn(),
    runDesignSkill: vi.fn(),
    runExport: vi.fn(),
    runtime: { socket: "/tmp/doan-x/app.sock", token: "t", file: "/tmp/doan-index-test/runtime.json", disposeSync: vi.fn() },
    startRuntime: vi.fn(),
    sessionOn: vi.fn(),
    inspector: { inspect: vi.fn() },
    createInspector: vi.fn(),
    mkdir: vi.fn(),
    readCompletion: vi.fn(), clipboard: { writeText: vi.fn() }, cursor: vi.fn(() => ({ x: 0, y: 0 })),
    menu: vi.fn<(template: MenuItemConstructorOptions[]) => unknown>(),
    dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn(), showSaveDialog: vi.fn() },
    uiState: { read: vi.fn(), save: vi.fn(), flushSync: vi.fn(), idle: vi.fn() },
    // Spied around the real canvas-seen store, so its IPC checks stay real.
    canvasSeenFlushSync: vi.fn(),
    createUiStateStore: vi.fn(),
    thumbnails: { get: vi.fn(), visible: vi.fn(), entriesChanged: vi.fn(), removed: vi.fn(), pause: vi.fn(), resume: vi.fn(), dispose: vi.fn() },
    createThumbnails: vi.fn(),
    readFolder: vi.fn(),
    nativeTheme: { themeSource: "system" },
    // Folder work the Add Projects page and onboarding share; each delegates to the real module unless a test says otherwise.
    projects: { canonicalFolder: vi.fn(), inspectPath: vi.fn(), selectProject: vi.fn(), cloneDestination: vi.fn(), cloneProject: vi.fn() },
    probeShell: vi.fn(),
    runAgentSetup: vi.fn(), osascriptAdmin: vi.fn(),
  };
});

vi.mock("electron", () => ({
  clipboard: mocks.clipboard, app: mocks.app, screen: { getCursorScreenPoint: mocks.cursor }, BrowserWindow: mocks.Window, shell: mocks.electronShell, Notification: mocks.Notification,
  dialog: mocks.dialog,
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => mocks.ipc.set(channel, handler) },
  Menu: { buildFromTemplate: mocks.menu, setApplicationMenu: vi.fn() },
  session: { defaultSession: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn(), on: mocks.sessionOn } },
  webFrameMain: { fromId: vi.fn() },
  webContents: { getFocusedWebContents: () => null },
  nativeTheme: mocks.nativeTheme,
  systemPreferences: { subscribeLocalNotification: (name: string, callback: () => void) => { mocks.notifications.set(name, callback); return mocks.notifications.size; } },
}));
vi.mock("./conversation/store", async (importOriginal) => ({ ...await importOriginal<typeof import("./conversation/store")>(), ConversationStore: class { list() { return mocks.conversations; } } }));
// The fake store makes no conversations directory, so the queue's drafts stay in memory.
vi.mock("./conversation/drafts", async (importOriginal) => { const original = await importOriginal<typeof import("./conversation/drafts")>(); return { ...original, DraftStore: class extends original.DraftStore { constructor() { super(null); } } }; });
vi.mock("./conversation/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./conversation/service")>();
  return { ...actual, ConversationService: class extends actual.ConversationService {
    constructor(...args: ConstructorParameters<typeof actual.ConversationService>) { super(...args); mocks.publishConversation = args[3] as never; mocks.conversationService = this; }
  } };
});
vi.mock("./preferences", async (importOriginal) => ({ ...await importOriginal<typeof import("./preferences")>(), createPreferencesStore: mocks.createPreferencesStore }));
// Move to Trash checks the disk with the real calls (canvasTrash.ts); nothing else here reaches them.
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return { mkdir: mocks.mkdir, lstat: real.lstat, readdir: real.readdir, realpath: real.realpath };
});
vi.mock("./onboarding/completion", async (importOriginal) => ({ ...await importOriginal<typeof import("./onboarding/completion")>(), readCompletion: mocks.readCompletion }));
vi.mock("./onboarding/machine", () => ({ runProcess: vi.fn(async () => ({ code: 1, stdout: "", stderr: "" })), probeShell: mocks.probeShell }));
vi.mock("./agentSetup/runner", () => ({ runAgentSetup: mocks.runAgentSetup, osascriptAdmin: mocks.osascriptAdmin }));
vi.mock("./cli", () => ({ cliCommand: mocks.cliCommand, runConfig: mocks.runConfig, readFolder: mocks.readFolder, runDesignSkill: mocks.runDesignSkill, runExport: mocks.runExport }));
vi.mock("./shell", () => ({ startShell: mocks.startShell }));
vi.mock("./runtime", () => ({ startRuntime: mocks.startRuntime }));
vi.mock("./addProjects", async (importOriginal) => ({ ...await importOriginal<typeof import("./addProjects")>(), createAddFlow: mocks.createAddFlow }));
vi.mock("./inspector", async (importOriginal) => ({ ...await importOriginal<typeof import("./inspector")>(), createInspector: mocks.createInspector }));
vi.mock("./uiState", () => ({ createUiStateStore: mocks.createUiStateStore }));
vi.mock("./canvasSeen", async (importOriginal) => {
  const original = await importOriginal<typeof import("./canvasSeen")>();
  return { createCanvasSeenStore: (file: string) => {
    const store = original.createCanvasSeenStore(file);
    return { ...store, flushSync: () => { mocks.canvasSeenFlushSync(); store.flushSync(); } };
  } };
});
vi.mock("./thumbnails", () => ({ createThumbnails: mocks.createThumbnails }));
vi.mock("./onboarding/projects", async (importOriginal) => ({ ...await importOriginal<typeof import("./onboarding/projects")>(), ...mocks.projects }));
const actualProjects = await vi.importActual<typeof import("./onboarding/projects")>("./onboarding/projects");

// What onboarding.json holds at launch; a describe sets it in beforeAll, before each launch reads it.
let launchCompletion: { kind: string; projectRoot?: string } = { kind: "missing" };
const COMPLETE = { kind: "complete", projectRoot: "/repo" };
// What the launch's login-shell probe answers and what its agent setup resolves to; a describe sets them in beforeAll.
// A held setup stays pending until the test settles it, as while the administrator dialog is open.
let launchProbe: unknown = { ok: false, reason: "Login shell failed." };
let launchSetup: unknown = { home: "/Users/you", items: [], steps: [] };
const HELD = Symbol("held");
let settleSetup: (value: unknown) => void = () => {};
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.app.removeAllListeners();
  mocks.Window.instances.length = 0;
  mocks.ipc.clear();
  mocks.readCompletion.mockReturnValue(launchCompletion);
  mocks.probeShell.mockResolvedValue(launchProbe);
  mocks.runAgentSetup.mockReturnValue(launchSetup === HELD ? new Promise(resolve => { settleSetup = resolve; }) : Promise.resolve(launchSetup));
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
  mocks.conversations = [];
  mocks.Notification.instances.length = 0;
  mocks.createPreferencesStore.mockReturnValue(mocks.preferences);
  mocks.preferences.read.mockReturnValue({ preferences: DEFAULTS, notice: null });
  mocks.preferences.current.mockReturnValue(DEFAULTS);
  mocks.electronShell.openExternal.mockResolvedValue(undefined);
  mocks.createThumbnails.mockReturnValue(mocks.thumbnails);
  mocks.thumbnails.removed.mockResolvedValue(undefined);
  for (const name of Object.keys(mocks.projects) as (keyof typeof mocks.projects)[]) mocks.projects[name].mockImplementation(actualProjects[name] as never);
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

test("File menu opens the Add Projects page and closes the window", async () => {
  const open = item("Add Project…").click;
  Reflect.apply(open ?? (() => { throw new Error("no open handler"); }), undefined, []);
  expect(window().webContents.send).toHaveBeenCalledWith("add-projects:open");
  expect(mocks.dialog.showOpenDialog).not.toHaveBeenCalled();
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

// Nothing asks the renderer before Quit: the teardown is scheduled within the event.
test("a quit goes ahead without asking the renderer", async () => {
  const event = { preventDefault: vi.fn() };
  window().webContents.send.mockClear();
  mocks.app.emit("before-quit", event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(mocks.app.quit).toHaveBeenCalledOnce();
  expect(window().webContents.send).not.toHaveBeenCalled();
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
// window or the CLI. Nothing else opens or closes it (POSTMORTEM "The setup menu discarded an open wizard session").
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
  const { openSettingsPage } = await import("./index");
  expect(openSettingsPage()).toBe(false);
  await completeFirstRun();
  expect(openSettingsPage()).toBe(true);
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
// Built from the operation names so a search for the channel literals finds only live code.
const REMOVED_SETUP_CHANNELS = ["read", "run", "answer", "check-again", "status"].map(op => `setup:${op}`);
test("the old wizard and Connections channels are gone; folder choice and install pages stay", () => {
  for (const channel of ["onboarding:get-open", "onboarding:read", "onboarding:run", "onboarding:answer", "onboarding:close", "onboarding:open-project",
    ...REMOVED_SETUP_CHANNELS]) expect(mocks.ipc.has(channel)).toBe(false);
  expect(mocks.ipc.has("setup:open-external")).toBe(true);
  expect(mocks.ipc.has("onboarding:choose-folder")).toBe(true);
});
describe("a launch with a v1 completion record", () => {
  beforeAll(() => { launchCompletion = COMPLETE; });
  afterAll(() => { launchCompletion = { kind: "missing" }; });
  test("opens no first run: Settings is available", async () => {
    expect(item("Settings…").enabled).not.toBe(false);
  });
});
describe("a launch with the legacy {} marker", () => {
  beforeAll(() => { launchCompletion = { kind: "legacy" }; });
  afterAll(() => { launchCompletion = { kind: "missing" }; });
  test("still runs first run: the old closed marker is not a completion", async () => {
    expect(item("Settings…").enabled).toBe(false);
  });
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
    expect(submenu("Doan").map((entry) => entry.label ?? entry.role ?? entry.type)).toEqual(["About Doan", "Settings…", "separator", "services", "separator", "Hide Doan", "hideOthers", "unhide", "separator", "Quit Doan"]);
    expect(item("Settings…").accelerator).toBe("CmdOrCtrl+,");
    expect(submenu("File").map((entry) => entry.label ?? entry.type)).toEqual(["New Conversation", "Add Project…", "separator", "Close Window"]);
    expect(item("New Conversation").accelerator).toBe("CmdOrCtrl+N");
    expect(item("Add Project…").accelerator).toBe("CmdOrCtrl+O");
    expect(item("Close Window").accelerator).toBe("CmdOrCtrl+W");
    expect(submenu("Go").map((entry) => [entry.label ?? entry.type, entry.accelerator])).toEqual([["Home", "Shift+CmdOrCtrl+H"], ["Quick Open…", "CmdOrCtrl+K"]]);
    // Without a removal toast Undo and Redo keep working in text fields (routed below).
    expect(submenu("Edit").slice(0, 2).map((entry) => [entry.label, entry.accelerator])).toEqual([["Undo", "CmdOrCtrl+Z"], ["Redo", "Shift+CmdOrCtrl+Z"]]);
    expect(submenu("Edit").map((entry) => entry.role).filter(Boolean)).toEqual(expect.arrayContaining(["cut", "copy", "paste", "selectAll"]));
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
    expect(submenu("Edit")[0]?.label).toBe("Undo");
  });

  test("Undo Remove takes ⌘Z only while the removal toast is up", async () => {
    const contents = window().webContents;
    await invoke("menu:state", contents, null, state("home", false, true));
    expect(submenu("Edit")[0]).toMatchObject({ label: "Undo Remove", accelerator: "CmdOrCtrl+Z" });
    click("Undo Remove");
    expect(contents.send).toHaveBeenCalledWith("menu-command", "undoRemove");
    await invoke("menu:state", contents, null, state("home"));
    expect(submenu("Edit")[0]?.label).toBe("Undo");
    expect(() => item("Undo Remove")).toThrow();
  });

  // buzz-canvas-conversation R1: the chip field refuses Chromium's undo, so the role items could not redo it.
  test("Edit > Undo and Redo hand a focused chip field its history step, and run the WebContents undo or redo otherwise", async () => {
    const contents = window().webContents;
    const run = async (label: string) => { Reflect.apply(item(label).click!, undefined, [{}, window(), {}]); await new Promise(resolve => setTimeout(resolve, 0)); };
    contents.executeJavaScript.mockResolvedValueOnce(true);
    await run("Undo");
    expect(String(contents.executeJavaScript.mock.calls.at(-1)?.[0])).toContain('inputType: "historyUndo"');
    expect(contents.undo).not.toHaveBeenCalled();
    contents.executeJavaScript.mockResolvedValueOnce(false);
    await run("Redo");
    expect(String(contents.executeJavaScript.mock.calls.at(-1)?.[0])).toContain('inputType: "historyRedo"');
    expect(contents.redo).toHaveBeenCalledTimes(1);
    contents.executeJavaScript.mockRejectedValueOnce(new Error("gone"));
    await run("Undo");
    expect(contents.undo).toHaveBeenCalledTimes(1);
  });

  test("refuses bad menu states and other senders", async () => {
    const contents = window().webContents;
    const builds = mocks.menu.mock.calls.length;
    for (const bad of [null, "canvas", { screen: "canvas" }, state("about"), { ...state("canvas"), more: 1 }, { screen: "canvas", modal: 1, toast: false },
      { ...state("canvas"), reviewing: true }]) {
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
    expect(submenu("Edit")[0]?.label).toBe("Undo");
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

  // A workspace must show an Overview before it can start a conversation.
  test("New Conversation requires an Overview on a workspace, and tells the renderer", async () => {
    const contents = window().webContents;
    expect(menuEnabled("New Conversation")).toBe(false);
    await invoke("menu:state", contents, null, state("workspace"));
    expect(menuEnabled("New Conversation")).toBe(false);
    await invoke("menu:state", contents, null, { ...state("workspace"), overview: true });
    expect(menuEnabled("New Conversation")).toBe(true);
    click("New Conversation");
    expect(contents.send).toHaveBeenCalledWith("menu-command", "newConversation");
    await invoke("menu:state", contents, null, { ...state("workspace", true), overview: true });
    expect(menuEnabled("New Conversation")).toBe(false);
  });

  test("canvas conversation menu commands follow validated selection and picker state", async () => {
    const contents = window().webContents;
    const ready = { ...state("canvas"), selection: true, pickerAvailable: true };
    await invoke("menu:state", contents, null, state("canvas"));
    expect(menuEnabled("New Conversation")).toBe(true);
    expect(menuEnabled("Add Selection to Conversation")).toBe(false);
    for (const bad of [{ ...ready, selection: "true" }, { ...ready, pickerAvailable: 1 }, { ...ready, unknown: true }]) {
      await invoke("menu:state", contents, null, bad);
      expect(menuEnabled("Add Selection to Conversation")).toBe(false);
    }
    await invoke("menu:state", contents, null, ready);
    expect(menuEnabled("Add Selection to Conversation")).toBe(true);
    click("Add Selection to Conversation");
    expect(contents.send).toHaveBeenCalledWith("menu-command", "addSelectionToConversation");
    await invoke("menu:state", contents, null, { ...ready, selection: false });
    expect(menuEnabled("Add Selection to Conversation")).toBe(false);
    await invoke("menu:state", contents, null, ready);
    await invoke("menu:state", contents, null, { ...ready, pickerAvailable: false });
    expect(menuEnabled("Add Selection to Conversation")).toBe(false);
  });

  test("invalid menu state preserves an enabled canvas conversation action", async () => {
    const contents = window().webContents;
    const ready = { ...state("canvas"), selection: true, pickerAvailable: true };
    await invoke("menu:state", contents, null, ready);
    expect(menuEnabled("Add Selection to Conversation")).toBe(true);
    const builds = mocks.menu.mock.calls.length;
    await invoke("menu:state", contents, null, { ...ready, selection: "true" });
    expect(menuEnabled("Add Selection to Conversation")).toBe(true);
    expect(mocks.menu.mock.calls.length).toBe(builds);
  });

  test("Go > Home tells the renderer", async () => {
    await invoke("menu:state", window().webContents, null, state("workspace"));
    click("Home");
    expect(window().webContents.send).toHaveBeenCalledWith("menu-command", "home");
  });

  // buzz-add-projects: the page opens in the renderer; no native picker, and none with multiSelections, opens here.
  test("Add Project… shows a hidden window first, then tells the renderer to open the Add Projects page", async () => {
    window().emit("close", { preventDefault: vi.fn() });
    expect(window().hide).toHaveBeenCalledOnce();
    click("Add Project…");
    expect(window().show).toHaveBeenCalledOnce();
    expect(window().webContents.send).toHaveBeenCalledWith("add-projects:open");
    expect(window().show.mock.invocationCallOrder[0]).toBeLessThan(window().webContents.send.mock.invocationCallOrder.at(-1) ?? 0);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(mocks.dialog.showOpenDialog).not.toHaveBeenCalled();
    expect(mocks.flow.add).not.toHaveBeenCalled();
  });

  test("the Add Projects page: Add Project… only in its choose phase, Home and Quick Open, no canvas items", async () => {
    const contents = window().webContents;
    await invoke("menu:state", contents, null, { ...state("addProjects"), choose: true });
    expect(menuEnabled("Add Project…")).toBe(true);
    expect(menuEnabled("Home")).toBe(true);
    expect(menuEnabled("Quick Open…")).toBe(true);
    for (const label of ["Zoom In", "Reload Canvas"]) expect(menuEnabled(label), label).toBe(false);
    await invoke("menu:state", contents, null, state("addProjects"));
    expect(menuEnabled("Add Project…")).toBe(false);
    await invoke("menu:state", contents, null, { ...state("addProjects"), choose: false });
    expect(menuEnabled("Add Project…")).toBe(false);
  });

  test("a locked page disables everything that leaves it; Undo Remove gives ⌘Z back", async () => {
    const contents = window().webContents;
    await invoke("menu:state", contents, null, { ...state("addProjects", false, true), choose: true, locked: true });
    for (const label of ["Add Project…", "Home", "Quick Open…"]) expect(menuEnabled(label), label).toBe(false);
    expect(submenu("Edit")[0]?.label).toBe("Undo");
    await invoke("menu:state", contents, null, { ...state("addProjects", false, true), choose: true, locked: false });
    expect(menuEnabled("Add Project…")).toBe(true);
    expect(submenu("Edit")[0]).toMatchObject({ label: "Undo Remove" });
  });

  // buzz-settings: the Settings page is a screen; its lock (and the Add Projects page's) disables Settings… too.
  test("the Settings page keeps Add Project…, Home and Quick Open; a lock on either page disables Settings…", async () => {
    const contents = window().webContents;
    await completeFirstRun();
    await invoke("menu:state", contents, null, state("settings"));
    for (const label of ["Settings…", "Add Project…", "Home", "Quick Open…"]) expect(menuEnabled(label), label).toBe(true);
    expect(menuEnabled("Zoom In")).toBe(false);
    await invoke("menu:state", contents, null, { ...state("settings"), locked: true });
    for (const label of ["Settings…", "Add Project…", "Home", "Quick Open…"]) expect(menuEnabled(label), label).toBe(false);
    await invoke("menu:state", contents, null, { ...state("addProjects"), choose: true, locked: true });
    expect(menuEnabled("Settings…")).toBe(false);
  });

  test("refuses malformed page menu states", async () => {
    const contents = window().webContents;
    await invoke("menu:state", contents, null, { ...state("addProjects"), choose: true });
    const builds = mocks.menu.mock.calls.length;
    for (const bad of [{ ...state("addProjects"), locked: "yes" }, { ...state("addProjects"), choose: 1 }, { ...state("addProjects"), locked: true, more: 1 },
      { ...state("addProjects"), choose: true, locked: false, more: 1 }, { ...state("add-projects") }]) {
      await invoke("menu:state", contents, null, bad);
    }
    expect(mocks.menu.mock.calls.length).toBe(builds);
    expect(menuEnabled("Add Project…")).toBe(true);
  });
});

describe("adding projects", () => {
  test("the add flow lists stored paths and stores through the shell", async () => {
    const deps = mocks.createAddFlow.mock.calls[0]?.[0];
    mocks.shell.entries.mockReturnValue([{ path: "/x" }, { path: "/y" }]);
    expect(deps.saved()).toEqual(["/x", "/y"]);
    mocks.shell.store.mockResolvedValue(["/z"]);
    expect(await deps.store(["/z"])).toEqual(["/z"]);
    expect(mocks.shell.store).toHaveBeenCalledWith(["/z"]);
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

  // Nothing asks the renderer first: the removal starts within the request.
  test("a removal starts at once and clears the removed project's selection", async () => {
    const contents = window().webContents;
    const selection = { root: APP, canvas: { path: ".doan/canvases/a.html", id: "a" }, element: { selector: "button", html: "<button>Go</button>" } };
    await invoke("selection:set", contents, null, selection);
    const pending = invoke("folders:remove", contents, null, { paths: [APP] }) as Promise<unknown>;
    expect(mocks.shell.remove).toHaveBeenCalledOnce();
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

// canvas-hand-tool: a canvas click is the canvas's message, so the renderer asks where the OS cursor is.
describe("pointer", () => {
  test("answers the window's main frame with the OS cursor in content coordinates at the page zoom", async () => {
    const contents = window().webContents;
    mocks.cursor.mockReturnValue({ x: 400, y: 340 });
    expect(await invoke("pointer:get", contents, null)).toEqual({ x: 300, y: 300 });
    contents.getZoomFactor.mockReturnValueOnce(2);
    expect(await invoke("pointer:get", contents, null)).toEqual({ x: 150, y: 150 });
  });

  test("answers null to a canvas frame or another sender", async () => {
    mocks.cursor.mockClear();
    for (const [sender, parent] of [[window().webContents, {}], [{}, null]]) expect(await invoke("pointer:get", sender, parent)).toBeNull();
    expect(mocks.cursor).not.toHaveBeenCalled();
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
    expect(mocks.canvasSeenFlushSync).toHaveBeenCalledOnce();
  });

  // Native teardown can fail before will-quit, so accepted state must already
  // be on disk when teardown starts.
  test("an approved quit flushes the state before disposing thumbnails", async () => {
    mocks.app.emit("before-quit", { preventDefault: vi.fn() });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(mocks.uiState.flushSync).toHaveBeenCalledOnce();
    expect(mocks.uiState.flushSync.mock.invocationCallOrder[0]).toBeLessThan(mocks.thumbnails.dispose.mock.invocationCallOrder[0] ?? 0);
    expect(mocks.canvasSeenFlushSync).toHaveBeenCalledOnce();
    expect(mocks.canvasSeenFlushSync.mock.invocationCallOrder[0]).toBeLessThan(mocks.thumbnails.dispose.mock.invocationCallOrder[0] ?? 0);
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

// canvas-row-menu: Move to Trash and Export from the sidebar's canvas row menu.
describe("canvas trash and export", () => {
  const row = { path: ".doan/canvases/a.html", id: "a", url: "http://127.0.0.1:1/t/tok/k/.doan/canvases/a.html" };
  const listed = { path: "/repo", kind: "list", servedRev: 1, canvases: [row] };
  beforeEach(() => mocks.shell.entries.mockReturnValue([listed]));
  const request = { root: "/repo", path: row.path };

  test.each(["canvas:trashPlan", "canvas:trash"])("%s takes only the main window's frame and refuses rows main does not list", async channel => {
    const contents = window().webContents;
    expect(await invoke(channel, contents, {}, request)).toEqual({ kind: "refused", reason: "notListed" });
    expect(await invoke(channel, {}, null, request)).toEqual({ kind: "refused", reason: "notListed" });
    for (const bad of [{ root: "/other", path: row.path }, { root: "/repo", path: ".doan/canvases/b.html" }, null]) {
      expect(await invoke(channel, contents, null, bad)).toEqual({ kind: "refused", reason: "notListed" });
    }
    expect(mocks.electronShell.trashItem).not.toHaveBeenCalled();
  });

  test("canvas:export takes only the main window's frame and refuses rows main does not list, before any panel", async () => {
    const contents = window().webContents;
    expect(await invoke("canvas:export", contents, {}, request)).toEqual({ kind: "refused", reason: "notListed" });
    expect(await invoke("canvas:export", {}, null, request)).toEqual({ kind: "refused", reason: "notListed" });
    expect(await invoke("canvas:export", contents, null, { root: "/other", path: row.path })).toEqual({ kind: "refused", reason: "notListed" });
    expect(mocks.dialog.showSaveDialog).not.toHaveBeenCalled();
    expect(mocks.runExport).not.toHaveBeenCalled();
  });

  test("canvas:export opens the save panel with the file name only and runs the bundled CLI on the chosen file", async () => {
    mocks.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: "/Users/me/Desktop/a.html" });
    mocks.runExport.mockResolvedValueOnce({ exitCode: 0, timedOut: false, stdout: JSON.stringify({ v: 1, ok: true, result: { external: ["https://cdn.example/x.css"] } }), stderr: "" });
    const reply = await invoke("canvas:export", window().webContents, null, request);
    expect(reply).toEqual({ kind: "exported", external: 1, reveal: expect.any(String) });
    expect(mocks.dialog.showSaveDialog).toHaveBeenCalledExactlyOnceWith(window(), { defaultPath: "a.html", filters: [{ name: "HTML", extensions: ["html"] }] });
    expect(mocks.runExport).toHaveBeenCalledExactlyOnceWith("/bundled/doan", "/repo", row.path, "/Users/me/Desktop/a.html");
    // canvas:exportRunning goes to the window with the listed root and path, after the panel and before the CLI.
    const sends = window().webContents.send.mock.calls.map((call, i) => ({ call, at: window().webContents.send.mock.invocationCallOrder[i]! })).filter(({ call }) => call[0] === "canvas:exportRunning");
    expect(sends.map(({ call }) => call)).toEqual([["canvas:exportRunning", { root: "/repo", path: row.path }]]);
    expect(sends[0]!.at).toBeGreaterThan(mocks.dialog.showSaveDialog.mock.invocationCallOrder[0]!);
    expect(sends[0]!.at).toBeLessThan(mocks.runExport.mock.invocationCallOrder[0]!);
    // Show in Finder: only by the id, only from the main window.
    await invoke("canvas:revealExport", window().webContents, null, "/Users/me/Desktop/a.html");
    await invoke("canvas:revealExport", {}, null, (reply as { reveal: string }).reveal);
    expect(mocks.electronShell.showItemInFolder).not.toHaveBeenCalled();
    await invoke("canvas:revealExport", window().webContents, null, (reply as { reveal: string }).reveal);
    expect(mocks.electronShell.showItemInFolder).toHaveBeenCalledExactlyOnceWith("/Users/me/Desktop/a.html");
  });

  test("a cancelled save panel runs no CLI", async () => {
    mocks.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: "" });
    expect(await invoke("canvas:export", window().webContents, null, request)).toEqual({ kind: "cancelled" });
    expect(mocks.runExport).not.toHaveBeenCalled();
    expect(window().webContents.send.mock.calls.filter(([channel]) => channel === "canvas:exportRunning")).toEqual([]);
  });
});

// canvas-row-menu: main's own busy grounds and trashItem wiring, on a registered root that passes the disk checks
// (POSTMORTEM 2026-11-01: the root is part of the identity; 2026-11-03: pin in main what the renderer relies on).
describe("canvas trash on main's grounds", () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-index-trash-")));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  let root = "", other = "", count = 0;
  const path = ".doan/canvases/a.html";
  const repo = () => {
    const dir = join(tmp, `r${count++}`);
    mkdirSync(join(dir, ".doan/canvases"), { recursive: true });
    mkdirSync(join(dir, ".doan/comments"));
    writeFileSync(join(dir, path), "<!doctype html>");
    writeFileSync(join(dir, ".doan/comments/a.jsonl"), "{}\n");
    return dir;
  };
  const row = { path, id: "a", url: "http://127.0.0.1:1/t/tok/k/.doan/canvases/a.html" };
  const summary = (patch: object) => ({ conversationId: "c1", title: "t", state: "current", owner: "doan", provider: "claude", fromHome: false, phase: "ended",
    unseen: false, queued: 0, working: false, lastActivityAt: "", preview: "", canvas: { path, id: "a" }, ...patch });
  function service() {
    const s = mocks.conversationService;
    if (!s) throw new Error("no conversation service");
    return { list: vi.spyOn(s, "list").mockReturnValue([]), evidence: vi.spyOn(s, "projectEvidence").mockReturnValue([]) };
  }
  function work() {
    const state = mocks.startRuntime.mock.calls[0]?.[1];
    if (typeof state !== "object" || state === null || !("work" in state) || typeof state.work !== "function") throw new Error("no work receiver");
    return (at: string) => (state.work as (request: unknown) => void)({ v: 3, token: "t", root: at, action: "start", path });
  }
  beforeEach(() => {
    root = repo(); other = repo();
    const entries = [root, other].map(at => ({ path: at, kind: "list", servedRev: 1, canvases: [row] }));
    mocks.shell.entries.mockReturnValue(entries);
    const changed = mocks.startShell.mock.calls[0]?.[2];
    if (typeof changed !== "function") throw new Error("no folder listener");
    changed(entries);
    mocks.electronShell.trashItem.mockResolvedValue(undefined);
  });
  const trash = () => invoke("canvas:trash", window().webContents, null, { root, path });

  test("moves the listed canvas, then its comment file, asking main's grounds for exactly this root", async () => {
    const asked = service();
    expect(await invoke("canvas:trashPlan", window().webContents, null, { root, path })).toEqual({ kind: "ready", comments: true });
    expect(await trash()).toEqual({ kind: "trashed", comments: "trashed" });
    expect(asked.list.mock.calls.every(([at]) => at === root)).toBe(true);
    expect(asked.evidence.mock.calls.every(([at]) => at === root)).toBe(true);
    expect(asked.list).toHaveBeenCalled();
    expect(asked.evidence).toHaveBeenCalled();
    expect(mocks.electronShell.trashItem.mock.calls).toEqual([[join(root, path)], [join(root, ".doan/comments/a.jsonl")]]);
  });

  test.each([
    ["a running conversation", { phase: "running" }],
    ["a conversation waiting for an answer", { phase: "waiting" }],
    ["a working conversation", { working: true }],
  ])("refuses as busy for %s on this canvas, for the plan and the move", async (_name, patch) => {
    service().list.mockImplementation(at => at === root ? [summary(patch)] : []);
    expect(await invoke("canvas:trashPlan", window().webContents, null, { root, path })).toEqual({ kind: "refused", reason: "busy" });
    expect(await trash()).toEqual({ kind: "refused", reason: "busy" });
    expect(mocks.electronShell.trashItem).not.toHaveBeenCalled();
  });

  test("refuses as busy for an unjudged project turn of this root that edited the canvas", async () => {
    service().evidence.mockImplementation(at => at === root ? [{ edits: [join(root, path)], changed: [] }] : []);
    expect(await trash()).toEqual({ kind: "refused", reason: "busy" });
    expect(mocks.electronShell.trashItem).not.toHaveBeenCalled();
  });

  test("refuses as busy for terminal work on this root and path", async () => {
    service();
    work()(root);
    expect(await trash()).toEqual({ kind: "refused", reason: "busy" });
    expect(mocks.electronShell.trashItem).not.toHaveBeenCalled();
  });

  test("another root's conversation, project turn or terminal work on the same path does not block this root", async () => {
    const asked = service();
    asked.list.mockImplementation(at => at === other ? [summary({ phase: "running" })] : []);
    asked.evidence.mockImplementation(at => at === other ? [{ edits: [join(other, path)], changed: [path] }] : []);
    work()(other);
    expect(await trash()).toEqual({ kind: "trashed", comments: "trashed" });
    expect(mocks.electronShell.trashItem).toHaveBeenNthCalledWith(1, join(root, path));
  });

  test("a failed canvas move refuses as failed and leaves the comment file alone", async () => {
    service();
    mocks.electronShell.trashItem.mockRejectedValueOnce(new Error("trash failed"));
    expect(await trash()).toEqual({ kind: "refused", reason: "failed" });
    expect(mocks.electronShell.trashItem).toHaveBeenCalledOnce();
  });
});

describe("main-window setup and settings", () => {
  const LIST = { path: ROOT, kind: "list", canvases: [], servedRev: 0, git: { common: `${ROOT}/.git`, main: ROOT, worktrees: [ROOT] } };

  test("Settings… is disabled while the wizard is open, then opens the Settings page without another window", async () => {
    expect(menuEnabled("Settings…")).toBe(false);
    click("Settings…");
    expect(mocks.Window.instances).toHaveLength(1);
    await completeFirstRun();
    expect(menuEnabled("Settings…")).toBe(true);
    click("Settings…");
    expect(mocks.Window.instances).toHaveLength(1);
    expect(window().webContents.send).toHaveBeenLastCalledWith("settings-page:open", {});
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
    expect(await invoke("folders:get", stranger.webContents, null)).toEqual([]);
  });

  test("config:choose attaches the sheet to main and returns only a choice id and the path", async () => {
    mocks.shell.entries.mockReturnValue([LIST]);
    const created = window();
    mocks.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [`${ROOT}/tokens.css`] });
    const chosen = await invoke("config:choose", created.webContents, null, { root: ROOT, kind: "tokenCss" }) as { kind: string; choiceId: string };
    expect(chosen).toEqual({ kind: "selected", choiceId: expect.any(String), path: `${ROOT}/tokens.css` });
    expect(mocks.dialog.showOpenDialog).toHaveBeenCalledWith(created, expect.objectContaining({ defaultPath: ROOT, properties: ["openFile"] }));
    mocks.runConfig.mockResolvedValue({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: true, result: { repo: ROOT, tokenCss: "tokens.css", serve: [], changed: true } }) });
    expect(await invoke("config:write", created.webContents, null, { root: ROOT, op: "setTokenCss", choiceId: chosen.choiceId })).toMatchObject({ kind: "config", changed: true });
    expect(mocks.runConfig).toHaveBeenCalledWith("/bundled/doan", ROOT, ["--token-css", `${ROOT}/tokens.css`]);
  });

  test("install pages: only the two fixed URLs open", async () => {
    expect(await invoke("setup:open-external", window().webContents, null, { target: "codex" })).toBe(true);
    expect(mocks.electronShell.openExternal).toHaveBeenCalledExactlyOnceWith("https://learn.chatgpt.com/docs/codex/cli");
    for (const bad of [{ target: "https://evil.example" }, { target: "claude", url: "x" }, "claude"]) {
      expect(await invoke("setup:open-external", window().webContents, null, bad)).toBe(false);
    }
    expect(mocks.electronShell.openExternal).toHaveBeenCalledOnce();
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

test.each(["window", "app", "both"])("quit does not reveal hidden %s", async hidden => {
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

test("canvas seen refuses foreign windows, subframes, unregistered roots and bad values", async () => {
  const contents = window().webContents;
  expect(await invoke("canvas:seen", {}, null, { root: "/r", path: ".doan/canvases/a.html", mtimeMs: 1 })).toBe(false);
  expect(await invoke("canvas:seen", contents, {}, { root: "/r", path: ".doan/canvases/a.html", mtimeMs: 1 })).toBe(false);
  expect(await invoke("canvas:seen", contents, null, { root: "/not-registered", path: ".doan/canvases/a.html", mtimeMs: 1 })).toBe(false);
  expect(await invoke("canvas:seen", contents, null, null)).toBe(false);
});

// buzz-add-projects: the page's own project instance, beside the onboarding session's (design 'main의 project 처리').
describe("Add Projects page session", () => {
  const PAGE = ["add-projects:read", "add-projects:inspect", "add-projects:select", "add-projects:clone", "add-projects:cancel"];
  const REFUSED = { v: 2, ok: false, error: { code: "bad_request", message: "Doan could not handle this request." } };
  async function pageSession(): Promise<string> {
    const read = await invoke("add-projects:read", window().webContents, null, {}) as { ok: true; result: { sessionId: string } };
    return read.result.sessionId;
  }
  // Clones that hold until released or aborted; destination tells the two instances' clones apart.
  function heldClones() {
    const held = new Map<string, { signal: AbortSignal; release(): void }>();
    mocks.projects.cloneDestination.mockImplementation(async (path: string) => ({ state: "absent", path }));
    mocks.projects.cloneProject.mockImplementation(async (_url: string, destination: string, signal: AbortSignal) => {
      await new Promise<void>(resolve => { held.set(destination, { signal, release: resolve }); signal.addEventListener("abort", () => resolve()); });
      return signal.aborted ? { ok: false, cancelled: true } : { ok: true, root: destination };
    });
    return held;
  }
  async function cloneOnPage(destination: string): Promise<string> {
    const contents = window().webContents, sessionId = await pageSession();
    const plan = await invoke("add-projects:inspect", contents, null, { sessionId, requestId: `plan-${destination.length}`, url: "https://github.com/acme/studio", destination }) as { result: { operation: { inspection: { inspectionId: string } } } };
    const clone = await invoke("add-projects:clone", contents, null, { sessionId, requestId: `clone-${destination.length}`, inspectionId: plan.result.operation.inspection.inspectionId, destination }) as { result: { operation: { operationId: string } } };
    return clone.result.operation.operationId;
  }
  async function cloneInOnboarding(destination: string): Promise<void> {
    const contents = window().webContents;
    const started = await invoke("onboarding:start", contents, null, {}) as { result: { sessionId: string } };
    const sessionId = started.result.sessionId;
    const plan = await invoke("onboarding:inspect", contents, null, { sessionId, requestId: "first-plan", url: "https://github.com/acme/other", destination }) as { result: { operation: { inspection: { inspectionId: string } } } };
    await invoke("onboarding:clone", contents, null, { sessionId, requestId: "first-clone", inspectionId: plan.result.operation.inspection.inspectionId, destination });
  }

  test("every page channel answers the main window's main frame only, and only a valid request", async () => {
    const contents = window().webContents, sessionId = await pageSession();
    const valid: Record<string, unknown> = {
      "add-projects:read": {}, "add-projects:inspect": { sessionId, requestId: "r", path: "/work/studio" },
      "add-projects:select": { sessionId, requestId: "r", inspectionId: "i", path: "/work/studio" },
      "add-projects:clone": { sessionId, requestId: "r", inspectionId: "i", destination: "/work/studio" }, "add-projects:cancel": { sessionId, requestId: "r", operationId: "o" },
    };
    for (const channel of PAGE) {
      expect(await invoke(channel, contents, {}, valid[channel]), channel).toEqual(REFUSED);
      expect(await invoke(channel, {}, null, valid[channel]), channel).toEqual(REFUSED);
      for (const bad of [null, "x", [], { ...valid[channel] as object, more: 1 }]) expect(await invoke(channel, contents, null, bad), channel).toEqual(REFUSED);
    }
    expect(await invoke("add-projects:inspect", contents, null, { sessionId, requestId: "r", path: "relative" })).toEqual(REFUSED);
    expect(await invoke("add-projects:inspect", contents, null, { sessionId, requestId: "r", url: "https://gitlab.com/acme/studio" })).toEqual(REFUSED);
    expect(mocks.projects.canonicalFolder).not.toHaveBeenCalled();
  });

  test("the page has its own session, apart from first run's, and publishes its changes on its own channel", async () => {
    const contents = window().webContents, sessionId = await pageSession();
    const first = await invoke("onboarding:start", contents, null, {}) as { result: { sessionId: string } };
    expect(sessionId).not.toBe(first.result.sessionId);
    const inspected = await invoke("add-projects:inspect", contents, null, { sessionId, requestId: "url", url: "https://github.com/acme/studio" }) as { ok: boolean; result: { operation: { kind: string; state: string } } };
    expect(inspected).toMatchObject({ ok: true, result: { operation: { kind: "project_inspect", state: "succeeded" } } });
    expect(contents.send).toHaveBeenCalledWith("add-projects:changed", expect.objectContaining({ sessionId, operations: [expect.objectContaining({ kind: "project_inspect" })] }));
    const onboardingState = await invoke("onboarding:status", contents, null, { sessionId: first.result.sessionId }) as { result: { operations: unknown[] } };
    expect(onboardingState.result.operations).toEqual([]);
  });

  test("a folder the page selects registers through the same project deps as first run", async () => {
    const contents = window().webContents, sessionId = await pageSession();
    mocks.projects.canonicalFolder.mockResolvedValue("/picked");
    mocks.projects.inspectPath.mockResolvedValue({ ok: true, candidates: [{ path: "/picked", changes: [] }] });
    mocks.projects.selectProject.mockImplementation(async (path: string, _initialize: boolean, _repo: unknown, deps: { add(path: string): Promise<string | null> }) => {
      const root = await deps.add(path);
      return root === null ? { ok: false, code: "project_unavailable" } : { ok: true, root };
    });
    const plan = await invoke("add-projects:inspect", contents, null, { sessionId, requestId: "pick", path: "/picked" }) as { result: { operation: { inspection: { inspectionId: string } } } };
    const selected = await invoke("add-projects:select", contents, null, { sessionId, requestId: "use", inspectionId: plan.result.operation.inspection.inspectionId, path: "/picked" });
    expect(selected).toMatchObject({ ok: true, result: { operation: { kind: "project_select", state: "succeeded", project: { root: "/repo" } } } });
    expect(mocks.flow.add).toHaveBeenCalledExactlyOnceWith("/picked");
  });

  test("a folder Add Project would only confirm is confirmed, because selecting it was the user's setup intent", async () => {
    const contents = window().webContents, sessionId = await pageSession();
    mocks.projects.canonicalFolder.mockResolvedValue("/plain");
    mocks.projects.inspectPath.mockResolvedValue({ ok: true, candidates: [{ path: "/plain", changes: [] }] });
    mocks.projects.selectProject.mockImplementation(async (path: string, _initialize: boolean, _repo: unknown, deps: { add(path: string): Promise<string | null> }) => {
      const root = await deps.add(path);
      return root === null ? { ok: false, code: "project_unavailable" } : { ok: true, root };
    });
    mocks.flow.add.mockResolvedValueOnce({ added: [], duplicate: null, messages: [], confirm: { confirmId: "c1", path: "/plain" } });
    mocks.flow.confirm.mockImplementationOnce(async () => {
      mocks.shell.entries.mockReturnValue([{ path: "/plain" }]);
      return { kind: "added" };
    });
    const plan = await invoke("add-projects:inspect", contents, null, { sessionId, requestId: "pick", path: "/plain" }) as { result: { operation: { inspection: { inspectionId: string } } } };
    const selected = await invoke("add-projects:select", contents, null, { sessionId, requestId: "use", inspectionId: plan.result.operation.inspection.inspectionId, path: "/plain" });
    expect(mocks.flow.confirm).toHaveBeenCalledExactlyOnceWith({ confirmId: "c1" });
    expect(selected).toMatchObject({ ok: true, result: { operation: { kind: "project_select", state: "succeeded", project: { root: "/plain" } } } });
  });

  // review-BS ⚪3: a confirmation answered "added" counts only once the registry holds the path.
  test("a confirmed folder the registry does not list is not registered", async () => {
    const contents = window().webContents, sessionId = await pageSession();
    mocks.projects.canonicalFolder.mockResolvedValue("/plain");
    mocks.projects.inspectPath.mockResolvedValue({ ok: true, candidates: [{ path: "/plain", changes: [] }] });
    mocks.projects.selectProject.mockImplementation(async (path: string, _initialize: boolean, _repo: unknown, deps: { add(path: string): Promise<string | null> }) => {
      const root = await deps.add(path);
      return root === null ? { ok: false, code: "project_unavailable" } : { ok: true, root };
    });
    mocks.flow.add.mockResolvedValueOnce({ added: [], duplicate: null, messages: [], confirm: { confirmId: "c1", path: "/plain" } });
    mocks.flow.confirm.mockResolvedValueOnce({ kind: "added" });
    const plan = await invoke("add-projects:inspect", contents, null, { sessionId, requestId: "pick", path: "/plain" }) as { result: { operation: { inspection: { inspectionId: string } } } };
    const selected = await invoke("add-projects:select", contents, null, { sessionId, requestId: "use", inspectionId: plan.result.operation.inspection.inspectionId, path: "/plain" });
    expect(mocks.flow.confirm).toHaveBeenCalledExactlyOnceWith({ confirmId: "c1" });
    expect(selected).toMatchObject({ ok: true, result: { operation: { kind: "project_select", state: "failed" } } });
  });

  test.each(["did-navigate", "render-process-gone"])("a replaced renderer (%s) cancels the page's clone only", async event => {
    const held = heldClones();
    await cloneInOnboarding("/work/other");
    const operationId = await cloneOnPage("/work/studio");
    await vi.waitFor(() => expect(held.size).toBe(2));
    window().webContents.emit(event);
    expect(held.get("/work/studio")!.signal.aborted).toBe(true);
    expect(held.get("/work/other")!.signal.aborted).toBe(false);
    const sessionId = await pageSession();
    await vi.waitFor(async () => expect(await invoke("add-projects:read", window().webContents, null, { sessionId, operationId })).toMatchObject({ result: { operations: [{ state: "cancelled" }] } }));
    held.get("/work/other")!.release();
  });

  test.each(["did-navigate", "render-process-gone"])("a replaced renderer (%s) also stops a clone still checking its destination", async event => {
    const held = heldClones();
    const contents = window().webContents, sessionId = await pageSession();
    const plan = await invoke("add-projects:inspect", contents, null, { sessionId, requestId: "plan", url: "https://github.com/acme/studio", destination: "/work/studio" }) as { result: { operation: { inspection: { inspectionId: string } } } };
    let checked: (() => void) | undefined;
    mocks.projects.cloneDestination.mockImplementationOnce(async (path: string) => { await new Promise<void>(resolve => { checked = resolve; }); return { state: "absent", path }; });
    const clone = invoke("add-projects:clone", contents, null, { sessionId, requestId: "clone", inspectionId: plan.result.operation.inspection.inspectionId, destination: "/work/studio" });
    await vi.waitFor(() => expect(checked).toBeDefined());
    window().webContents.emit(event);
    checked!();
    expect(await clone).toMatchObject({ ok: false, error: { code: "inspection_stale" } });
    expect(mocks.projects.cloneProject).not.toHaveBeenCalled();
    expect(held.size).toBe(0);
  });

  test("hiding the window stops nothing", async () => {
    const held = heldClones();
    await cloneOnPage("/work/studio");
    await vi.waitFor(() => expect(held.size).toBe(1));
    window().emit("close", { preventDefault: vi.fn() });
    expect(window().hide).toHaveBeenCalledOnce();
    expect(held.get("/work/studio")!.signal.aborted).toBe(false);
    held.get("/work/studio")!.release();
  });

  test("an accepted quit stops and cleans up both instances' clones before the app quits", async () => {
    const held = heldClones();
    await cloneInOnboarding("/work/other");
    await cloneOnPage("/work/studio");
    await vi.waitFor(() => expect(held.size).toBe(2));
    mocks.app.emit("before-quit", { preventDefault: vi.fn() });
    await vi.waitFor(() => expect(mocks.app.quit).toHaveBeenCalled());
    expect(held.get("/work/studio")!.signal.aborted).toBe(true);
    expect(held.get("/work/other")!.signal.aborted).toBe(true);
  });
});

// buzz-settings S2–S4: the Settings page's main-window IPC, notifications and the dialog session.
describe("settings page", () => {
  const LIST = { path: ROOT, kind: "list", canvases: [], servedRev: 0, git: { common: `${ROOT}/.git`, main: ROOT, branch: "main", worktrees: [ROOT] } };
  const configRun = (serve: string[]) => ({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: true, result: { repo: ROOT, serve, changed: false } }) });
  const CHANNELS = ["preferences:read", "preferences:write", "notifications:test", "notifications:open-settings", "about:read", "about:copy", "config:session-start", "config:session-end"];

  test("settings page channels answer the main window's main frame only", async () => {
    const other = new mocks.Window({ show: false }).webContents;
    for (const channel of CHANNELS) {
      const refused = await invoke(channel, {}, null);
      expect(await invoke(channel, other, null), channel).toEqual(refused);
      expect(await invoke(channel, window().webContents, {}), channel).toEqual(refused);
    }
    expect(mocks.preferences.update).not.toHaveBeenCalled();
    expect(mocks.Notification.instances).toEqual([]);
    expect(mocks.electronShell.openExternal).not.toHaveBeenCalled();
    expect(mocks.clipboard.writeText).not.toHaveBeenCalled();
  });

  test("preferences are read and changed through main's store; the renderer's value is data", async () => {
    const contents = window().webContents;
    expect(mocks.createPreferencesStore).toHaveBeenCalledWith("/tmp/doan-index-test/preferences.json");
    expect(await invoke("preferences:read", contents, null)).toEqual({ preferences: DEFAULTS, notice: null });
    mocks.preferences.update.mockResolvedValueOnce({ ok: true, snapshot: { preferences: DEFAULTS, notice: null } });
    expect(await invoke("preferences:write", contents, null, { notifications: { finished: false } })).toEqual({ ok: true, snapshot: { preferences: DEFAULTS, notice: null } });
    expect(mocks.preferences.update).toHaveBeenCalledExactlyOnceWith({ notifications: { finished: false } });
  });

  test("Open System Settings opens only the fixed notification settings URL", async () => {
    expect(await invoke("notifications:open-settings", window().webContents, null, "https://evil.example")).toBe(false);
    expect(mocks.electronShell.openExternal).not.toHaveBeenCalled();
    expect(await invoke("notifications:open-settings", window().webContents, null)).toBe(true);
    expect(mocks.electronShell.openExternal).toHaveBeenCalledExactlyOnceWith("x-apple.systempreferences:com.apple.Notifications-Settings.extension");
    mocks.electronShell.openExternal.mockRejectedValueOnce(new Error("no handler"));
    expect(await invoke("notifications:open-settings", window().webContents, null)).toBe(false);
  });

  test("the test notification reports what macOS answered", async () => {
    const sending = invoke("notifications:test", window().webContents, null);
    await vi.waitFor(() => expect(mocks.Notification.instances).toHaveLength(1));
    const shown = mocks.Notification.instances[0]!;
    expect(shown.options).toMatchObject({ title: "Test notification" });
    shown.emit("failed", {}, "UNErrorDomain error 1");
    expect(await sending).toEqual({ kind: "failed" });
  });

  test("About reads the bundled CLI's version and copies text main builds", async () => {
    mocks.runDesignSkill.mockResolvedValue({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: true, result: { version: "1.2.3", presets: [] } }) });
    const read = await invoke("about:read", window().webContents, null) as { version: string; cli: unknown };
    expect(read).toMatchObject({ version: "9.8.7", cli: { path: "/bundled/doan", version: "1.2.3" } });
    expect(mocks.runDesignSkill).toHaveBeenCalledWith("/bundled/doan");
    expect(await invoke("about:copy", window().webContents, null, "forged text")).toEqual({ kind: "stale" });
    expect(mocks.clipboard.writeText).not.toHaveBeenCalled();
    expect(await invoke("about:copy", window().webContents, null)).toEqual({ kind: "success" });
    expect(mocks.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^Doan 9\.8\.7\ndoan command 1\.2\.3 \(\/bundled\/doan\)\n/));
  });

  test("Copy details before any About read reads in main first; a later copy reads nothing more", async () => {
    mocks.runDesignSkill.mockResolvedValue({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: true, result: { version: "1.2.3", presets: [] } }) });
    expect(await invoke("about:copy", window().webContents, null)).toEqual({ kind: "success" });
    expect(mocks.runDesignSkill).toHaveBeenCalledOnce();
    expect(mocks.clipboard.writeText).toHaveBeenLastCalledWith(expect.stringMatching(/^Doan 9\.8\.7\ndoan command 1\.2\.3 \(\/bundled\/doan\)\n/));
    const first = mocks.clipboard.writeText.mock.calls.at(-1)?.[0];
    expect(await invoke("about:copy", window().webContents, null)).toEqual({ kind: "success" });
    expect(mocks.runDesignSkill).toHaveBeenCalledOnce();
    expect(mocks.clipboard.writeText).toHaveBeenLastCalledWith(first);
  });

  test("About carries this launch's agent setup result, and Copy details its notice", async () => {
    mocks.runDesignSkill.mockResolvedValue({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: true, result: { version: "1.2.3", presets: [] } }) });
    expect(await invoke("about:read", window().webContents, null)).toMatchObject({ setup: { home: "/Users/you", items: [] } });
    expect(await invoke("about:copy", window().webContents, null)).toEqual({ kind: "success" });
    expect(mocks.clipboard.writeText.mock.calls.at(-1)?.[0]).not.toContain("set up");
  });

  test("the main window reads and writes project config, and its file sheet attaches to the main window", async () => {
    mocks.shell.entries.mockReturnValue([LIST]);
    mocks.runConfig.mockResolvedValue(configRun([]));
    const contents = window().webContents;
    expect(await invoke("config:read", contents, null, { root: ROOT })).toMatchObject({ kind: "config", root: ROOT });
    mocks.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [`${ROOT}/tokens.css`] });
    expect(await invoke("config:choose", contents, null, { root: ROOT, kind: "tokenCss" })).toMatchObject({ kind: "selected", path: `${ROOT}/tokens.css` });
    expect(mocks.dialog.showOpenDialog).toHaveBeenCalledWith(window(), expect.objectContaining({ defaultPath: ROOT }));
  });

  describe("dialog session", () => {
    test("다이얼로그를 닫은 뒤 늦게 온 읽기·선택 답은 버려진다", async () => {
      mocks.shell.entries.mockReturnValue([LIST]);
      const contents = window().webContents;
      await invoke("config:session-start", contents, null);
      let finish!: (value: unknown) => void;
      mocks.runConfig.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const reading = invoke("config:read", contents, null, { root: ROOT });
      await vi.waitFor(() => expect(mocks.runConfig).toHaveBeenCalledOnce());
      await invoke("config:session-end", contents, null);
      finish(configRun(["late"]));
      expect(await reading).toEqual({ kind: "unavailable" });
    });

    test.each(["did-navigate", "render-process-gone"])("reload 뒤 대기 중인 config 읽기가 취소된다 (%s)", async event => {
      mocks.shell.entries.mockReturnValue([LIST]);
      const contents = window().webContents;
      let finish!: (value: unknown) => void;
      mocks.runConfig.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const reading = invoke("config:read", contents, null, { root: ROOT });
      await vi.waitFor(() => expect(mocks.runConfig).toHaveBeenCalledOnce());
      contents.emit(event);
      finish(configRun([]));
      expect(await reading).toEqual({ kind: "unavailable" });
    });
  });

  describe("notifications", () => {
    const CONVERSATION = { conversationId: "c1", root: ROOT, title: "t", state: "current", owner: { kind: "legacy-external" }, session: { runtime: "codex", origin: "new", sessionId: "s", configDir: "/c", cwd: ROOT } };
    const turnDone = { v: 1, conversationId: "c1", seq: 2, turnId: "t1", at: "2026-10-30T10:00:00.000Z", type: "turn.done" };
    function publish(event: unknown) {
      if (!mocks.publishConversation) throw new Error("no conversation publisher");
      mocks.publishConversation(event);
    }
    beforeEach(() => {
      mocks.shell.entries.mockReturnValue([LIST]);
      mocks.conversations = [CONVERSATION];
    });

    test("a conversation event reaches the renderer and, while the window is not focused, a notification", () => {
      publish(turnDone);
      expect(window().webContents.send).toHaveBeenCalledWith("conversation:event", turnDone);
      expect(mocks.Notification.instances.map(n => n.options)).toEqual([{ title: "Codex finished", body: "app · main" }]);
      expect(mocks.Notification.instances[0]!.show).toHaveBeenCalledOnce();
      window().isFocused.mockReturnValue(true);
      publish({ ...turnDone, seq: 3 });
      expect(mocks.Notification.instances).toHaveLength(1);
    });

    test("Desktop notifications off shows nothing", () => {
      mocks.preferences.current.mockReturnValue({ ...DEFAULTS, notifications: { ...DEFAULTS.notifications, enabled: false } });
      publish(turnDone);
      expect(mocks.Notification.instances).toEqual([]);
    });

    test("a click shows a hidden, minimized window of a hidden app, focuses it, then sends the conversation", () => {
      window().emit("close", { preventDefault: vi.fn() });
      mocks.notifications.get("NSApplicationDidHideNotification")?.();
      window().isMinimized.mockReturnValue(true);
      publish(turnDone);
      window().webContents.send.mockClear();
      window().show.mockClear();
      mocks.Notification.instances[0]!.emit("click");
      expect(mocks.app.show).toHaveBeenCalled();
      expect(window().restore).toHaveBeenCalledOnce();
      expect(window().show).toHaveBeenCalled();
      expect(window().focus).toHaveBeenCalled();
      expect(window().webContents.send).toHaveBeenCalledWith("notifications:click", { conversationId: "c1", root: ROOT });
      expect(window().show.mock.invocationCallOrder[0]).toBeLessThan(window().webContents.send.mock.invocationCallOrder.at(-1)!);
    });

    test("clicking the test notification only shows the window", async () => {
      window().emit("close", { preventDefault: vi.fn() });
      void invoke("notifications:test", window().webContents, null);
      await vi.waitFor(() => expect(mocks.Notification.instances).toHaveLength(1));
      window().webContents.send.mockClear();
      mocks.Notification.instances[0]!.emit("click");
      expect(window().show).toHaveBeenCalled();
      expect(window().webContents.send).not.toHaveBeenCalledWith("notifications:click", expect.anything());
    });
  });

  test("the open-Settings command shows a hidden window first, then sends the target; not during first run", async () => {
    const { openSettingsPage } = await import("./index");
    expect(openSettingsPage({ section: "agents" })).toBe(false);
    expect(window().webContents.send).not.toHaveBeenCalledWith("settings-page:open", expect.anything());
    await completeFirstRun();
    window().emit("close", { preventDefault: vi.fn() });
    window().show.mockClear();
    expect(openSettingsPage({ section: "agents", provider: "codex" })).toBe(true);
    expect(window().show).toHaveBeenCalledOnce();
    expect(window().webContents.send).toHaveBeenLastCalledWith("settings-page:open", { section: "agents", provider: "codex" });
    expect(window().show.mock.invocationCallOrder[0]).toBeLessThan(window().webContents.send.mock.invocationCallOrder.at(-1)!);
  });
});

// zero-setup-agents: agent setup runs once per launch, beside the window, and About waits for its result.
describe("agent setup on launch", () => {
  const LISTED = { exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: true, result: { version: "1.2.3", presets: [] } }) };
  const ALL = ["claude", "codex", "cursor", "antigravity", "copilot"];
  const FOREIGN = { home: "/Users/you", steps: [], items: [{ target: "cli", path: "/Users/you/.local/bin/doan", providers: ALL, reason: "foreign", found: "file" }] };
  const settled = async (promise: unknown) => { let done = false; void Promise.resolve(promise).then(() => { done = true; }); for (let i = 0; i < 20; i++) await Promise.resolve(); return done; };

  test("runs the runner once with the launch's HOME, bundle, packaging, SHELL, userData and the administrator dialog", async () => {
    mocks.runDesignSkill.mockResolvedValue(LISTED);
    await vi.waitFor(() => expect(mocks.runAgentSetup).toHaveBeenCalledOnce());
    expect(mocks.runAgentSetup).toHaveBeenCalledWith({ home: process.env.HOME, resources: process.resourcesPath, isPackaged: true, loginPath: null,
      shell: process.env.SHELL ?? "", userData: "/tmp/doan-index-test", runAdmin: mocks.osascriptAdmin });
    await invoke("about:read", window().webContents, null);
    await invoke("about:copy", window().webContents, null);
    expect(mocks.runAgentSetup).toHaveBeenCalledOnce();
  });

  describe("with a login shell that answers", () => {
    beforeAll(() => { launchProbe = { ok: true, path: "/Users/you/.local/bin:/usr/bin:/bin" }; });
    afterAll(() => { launchProbe = { ok: false, reason: "Login shell failed." }; });
    test("the runner gets the login shell's PATH", async () => {
      await vi.waitFor(() => expect(mocks.runAgentSetup).toHaveBeenCalledOnce());
      expect(mocks.runAgentSetup.mock.calls[0]?.[0]).toMatchObject({ loginPath: "/Users/you/.local/bin:/usr/bin:/bin" });
    });
  });

  describe("while setup is still running (the administrator dialog is open)", () => {
    beforeAll(() => { launchSetup = HELD; });
    afterAll(() => { launchSetup = { home: "/Users/you", items: [], steps: [] }; });
    test("the window opens, and About's read and Copy details wait for the result", async () => {
      mocks.runDesignSkill.mockResolvedValue(LISTED);
      expect(mocks.Window.instances).toHaveLength(1);
      await vi.waitFor(() => expect(mocks.runAgentSetup).toHaveBeenCalledOnce());
      const read = invoke("about:read", window().webContents, null);
      const copied = invoke("about:copy", window().webContents, null);
      expect(await settled(read)).toBe(false);
      expect(await settled(copied)).toBe(false);
      expect(mocks.clipboard.writeText).not.toHaveBeenCalled();
      settleSetup(FOREIGN);
      expect(await read).toMatchObject({ version: "9.8.7", setup: { home: "/Users/you", items: FOREIGN.items } });
      expect(await copied).toEqual({ kind: "success" });
      expect(mocks.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("Doan couldn’t set up every agent\nAll agents — ~/.local/bin/doan is a file Doan didn’t create"));
    });
  });

  describe("when the runner fails", () => {
    const failed = Promise.reject(new Error("boom"));
    failed.catch(() => {});
    beforeAll(() => { launchSetup = HELD; });
    afterAll(() => { launchSetup = { home: "/Users/you", items: [], steps: [] }; });
    // A crash must not read as "every agent was set up" (design 'About 알림').
    test("the failure is logged and About answers with a crashed item, which Copy details names", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.runDesignSkill.mockResolvedValue(LISTED);
      await vi.waitFor(() => expect(mocks.runAgentSetup).toHaveBeenCalledOnce());
      settleSetup(failed);
      expect(await invoke("about:read", window().webContents, null)).toMatchObject({ setup: { items: [{ target: "setup", providers: ALL, reason: "crashed" }] } });
      expect(logged).toHaveBeenCalledWith("doan: agent setup failed", expect.any(Error));
      expect(await invoke("about:copy", window().webContents, null)).toEqual({ kind: "success" });
      expect(mocks.clipboard.writeText).toHaveBeenLastCalledWith(expect.stringContaining("Doan couldn’t set up every agent\nAll agents — Doan stopped partway through setting up agents, so some may not be set up."));
      logged.mockRestore();
    });
  });
});

test("deep links wait for restoration readiness and only navigate or refuse in the main window", async () => {
  const contents = window().webContents;
  const preventDefault = vi.fn();
  const url = "doan://open?root=%2Frepo&canvas=.doan%2Fcanvases%2Fa.html&frame=hero";
  const entries = [{ path: "/repo", kind: "list", canvases: [{ path: ".doan/canvases/a.html" }] }];
  mocks.shell.entries.mockReturnValue(entries);
  mocks.app.emit("open-url", { preventDefault }, "bad");
  mocks.app.emit("open-url", { preventDefault }, url);
  expect(contents.send.mock.calls.filter(([channel]) => channel === "deep-link:open")).toEqual([]);
  await invoke("deep-link:ready", contents, {});
  expect(contents.send.mock.calls.filter(([channel]) => channel === "deep-link:open")).toEqual([]);
  await invoke("deep-link:ready", contents, null);
  expect(contents.send).toHaveBeenCalledWith("deep-link:open", { kind: "navigate", root: "/repo", canvas: ".doan/canvases/a.html", frame: "hero" });
  await invoke("deep-link:ready", contents, null);
  expect(contents.send.mock.calls.filter(([channel]) => channel === "deep-link:open")).toHaveLength(1);
  mocks.app.emit("open-url", { preventDefault }, "bad");
  expect(contents.send).toHaveBeenCalledWith("deep-link:open", { kind: "malformed" });
  expect(window().show).toHaveBeenCalledTimes(2);
  expect(mocks.shell.open).not.toHaveBeenCalled();
  expect(mocks.shell.store).not.toHaveBeenCalled();
  expect(mocks.uiState.save).not.toHaveBeenCalled();
});

test("unchanged work does not publish during startup or folder refreshes", () => {
  const publications = () => window().webContents.send.mock.calls.filter(([channel]) => channel === "work:changed");
  expect(publications()).toHaveLength(0);
  const changed = mocks.startShell.mock.calls[0]?.[2];
  if (typeof changed !== "function") throw new Error("no folder listener");
  const state = mocks.startRuntime.mock.calls[0]?.[1];
  if (typeof state !== "object" || state === null || !("work" in state) || typeof state.work !== "function") throw new Error("no work receiver");
  const entries = [{ path: "/repo", kind: "list", canvases: [] }];
  changed(entries);
  changed(entries);
  expect(publications()).toHaveLength(0);
  state.work({ v: 3, token: "t", root: "/repo", action: "start", path: ".doan/canvases/new.html" });
  expect(publications()).toHaveLength(1);
  changed(entries);
  state.work({ v: 3, token: "t", root: "/repo", action: "start", path: ".doan/canvases/new.html" });
  expect(publications()).toHaveLength(1);
  changed([]);
  changed([]);
  expect(publications()).toHaveLength(2);
});

test("main exposes work only to its main frame and clears it on root removal", () => {
  const state = mocks.startRuntime.mock.calls[0]?.[1];
  if (typeof state !== "object" || state === null || !("work" in state) || typeof state.work !== "function") throw new Error("no work receiver");
  const changed = mocks.startShell.mock.calls[0]?.[2];
  if (typeof changed !== "function") throw new Error("no folder listener");
  mocks.shell.entries.mockReturnValue([{ path: "/repo", kind: "list" }]);
  changed([{ path: "/repo", kind: "list", canvases: [] }]);
  state.work({ v: 3, token: "t", root: "/repo", action: "start", path: ".doan/canvases/new.html" });
  const expected = [{ root: "/repo", path: ".doan/canvases/new.html", session: null, provider: null }];
  expect(invoke("work:get", window().webContents, null)).toEqual(expected);
  expect(window().webContents.send).toHaveBeenCalledWith("work:changed", expected);
  expect(invoke("work:get", {}, null)).toEqual([]);
  expect(invoke("work:get", window().webContents, {})).toEqual([]);
  changed([]);
  expect(invoke("work:get", window().webContents, null)).toEqual([]);
});

test("a launch link remains pending until the first loading folder has been listed", async () => {
  const contents = window().webContents;
  const loading = [{ path: "/repo", kind: "loading" }];
  mocks.shell.entries.mockReturnValue(loading);
  mocks.app.emit("open-url", { preventDefault: vi.fn() }, "doan://open?root=%2Frepo&canvas=.doan%2Fcanvases%2Fa.html");
  await invoke("deep-link:ready", contents, null);
  expect(contents.send.mock.calls.some(([channel]) => channel === "deep-link:open")).toBe(false);
  const changed = mocks.startShell.mock.calls[0]?.[2];
  if (typeof changed !== "function") throw new Error("no folder listener");
  const entries = [{ path: "/repo", kind: "list", canvases: [{ path: ".doan/canvases/a.html" }] }];
  mocks.shell.entries.mockReturnValue(entries);
  changed(entries);
  const calls = contents.send.mock.calls;
  expect(calls.findIndex(([channel]) => channel === "folders")).toBeLessThan(calls.findIndex(([channel]) => channel === "deep-link:open"));
  expect(contents.send).toHaveBeenCalledWith("deep-link:open", { kind: "navigate", root: "/repo", canvas: ".doan/canvases/a.html" });
});

test("folder revisions renew active work and the main timer expires it without polling", () => {
  vi.useFakeTimers();
  try {
    const state = mocks.startRuntime.mock.calls[0]?.[1];
    if (typeof state !== "object" || state === null || !("work" in state) || typeof state.work !== "function") throw new Error("no work receiver");
    const changed = mocks.startShell.mock.calls[0]?.[2];
    if (typeof changed !== "function") throw new Error("no folder listener");
    const path = ".doan/canvases/a.html";
    changed([{ path: "/repo", kind: "list", canvases: [{ path, rev: 1 }] }]);
    state.work({ v: 3, token: "t", root: "/repo", action: "start", path });
    vi.advanceTimersByTime(299_000);
    changed([{ path: "/repo", kind: "list", canvases: [{ path, rev: 2 }] }]);
    vi.advanceTimersByTime(299_000);
    expect(invoke("work:get", window().webContents, null)).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(invoke("work:get", window().webContents, null)).toEqual([]);
    expect(mocks.shell.rereadAll).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

test("work deadlines use one timeout and file changes stay within their root", () => {
  vi.useFakeTimers();
  const timeout = vi.spyOn(globalThis, "setTimeout");
  const interval = vi.spyOn(globalThis, "setInterval");
  try {
    const state = mocks.startRuntime.mock.calls[0]?.[1];
    if (typeof state !== "object" || state === null || !("work" in state) || typeof state.work !== "function") throw new Error("no work receiver");
    const changed = mocks.startShell.mock.calls[0]?.[2];
    if (typeof changed !== "function") throw new Error("no folder listener");
    const path = ".doan/canvases/shared.html";
    const entries = (rev: number) => [
      { path: "/repo", kind: "list", canvases: [{ path, rev }] },
      { path: "/other", kind: "list", canvases: [{ path, rev: 1 }] },
    ];
    changed(entries(1));
    const baseline = vi.getTimerCount();
    for (const root of ["/repo", "/other"]) state.work({ v: 3, token: "t", root, action: "start", path });
    expect(interval).not.toHaveBeenCalled();
    expect(timeout).toHaveBeenLastCalledWith(expect.any(Function), 300_000);
    expect(vi.getTimerCount()).toBe(baseline + 1);
    vi.advanceTimersByTime(200_000);
    changed(entries(2));
    expect(timeout).toHaveBeenLastCalledWith(expect.any(Function), 100_000);
    expect(vi.getTimerCount()).toBe(baseline + 1);
    vi.advanceTimersByTime(100_000);
    expect(invoke("work:get", window().webContents, null)).toEqual([{ root: "/repo", path, session: null, provider: null }]);
    expect(timeout).toHaveBeenLastCalledWith(expect.any(Function), 200_000);
    vi.advanceTimersByTime(200_000);
    expect(invoke("work:get", window().webContents, null)).toEqual([]);
    expect(vi.getTimerCount()).toBe(baseline);
    state.work({ v: 3, token: "t", root: "/repo", action: "start", path });
    expect(vi.getTimerCount()).toBe(baseline + 1);
    mocks.app.emit("will-quit");
    expect(vi.getTimerCount()).toBe(baseline);
  } finally { timeout.mockRestore(); interval.mockRestore(); vi.useRealTimers(); }
});
