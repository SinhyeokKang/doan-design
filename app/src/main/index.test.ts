import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";
import type { BrowserWindowConstructorOptions, MenuItemConstructorOptions } from "electron";

const OUTCOME = { added: ["/repo"], duplicate: null, messages: [], confirm: null };
const DEFAULTS = { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation: null, updates: { autoCheck: true } };

const mocks = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  class Window extends EventEmitter {
    static instances: Window[] = [];
    static ids = 0;
    destroyed = false;
    contentsDestroyed = false;
    webContents = Object.assign(new EventEmitter(), { id: ++Window.ids, send: vi.fn(), isDestroyed: () => this.contentsDestroyed, debugger: { name: "debugger" },
      executeJavaScript: vi.fn(async (_script?: string): Promise<unknown> => ({ x: 0, y: 0, width: 800, height: 500 })), undo: vi.fn(), redo: vi.fn(), cut: vi.fn(), copy: vi.fn(), paste: vi.fn(), selectAll: vi.fn(), replaceMisspelling: vi.fn(), showDefinitionForSelection: vi.fn(), getZoomFactor: vi.fn(() => 1),
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
  // electron-updater's MacUpdater as the update service drives it.
  class Updater extends EventEmitter {
    static instances: Updater[] = [];
    autoDownload = false;
    autoInstallOnAppQuit = false;
    allowPrerelease = false;
    logger: unknown = null;
    checkForUpdates = vi.fn(async (): Promise<unknown> => null);
    downloadUpdate = vi.fn(async (): Promise<unknown> => []);
    quitAndInstall = vi.fn();
    constructor() {
      super();
      Updater.instances.push(this);
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
    Updater,
    // Electron's native autoUpdater: Squirrel.Mac's staging reaches main as its update-downloaded.
    nativeUpdater: new EventEmitter(),
    setupEligibility: vi.fn(), hasFeedConfig: vi.fn(),
    // Conversation metadata the mocked store lists, and the service's event publisher main passed it.
    conversations: [] as unknown[],
    publishConversation: undefined as ((event: unknown) => void) | undefined,
    // The callback main gave the service for a deleted conversation.
    deletedConversation: undefined as ((id: string) => void) | undefined,
    // The callback main gave the service for a turn that can no longer take a work update.
    workEnded: undefined as ((id: string) => void) | undefined,
    // The callback main gave the service for a running turn's stage.
    stageConversation: undefined as ((signal: unknown) => void) | undefined,
    // The conversation service main created, so a test can pin what main asks it.
    conversationService: undefined as { list(root: string): unknown[]; projectEvidence(root: string): unknown[] } | undefined,
    preferences: { read: vi.fn(), current: vi.fn(), update: vi.fn(), buddyKey: vi.fn() },
    createPreferencesStore: vi.fn(),
    app: Object.assign(new EventEmitter(), { setName: vi.fn(), whenReady: vi.fn<() => Promise<void>>(), isPackaged: true, getPath: () => "/tmp/doan-index-test", getVersion: () => "9.8.7", exit: vi.fn(), quit: vi.fn(), relaunch: vi.fn(), show: vi.fn(), requestSingleInstanceLock: vi.fn(() => true),
      isActive: vi.fn(() => true), dock: { bounce: vi.fn(() => 7) } }),
    ipc: new Map<string, (...args: unknown[]) => unknown>(),
    shell: { tokenBase: "http://127.0.0.1:1/t/tok/", entries: vi.fn<() => { path: string; kind?: string }[]>(() => []), open: vi.fn<() => Promise<{ root: string } | { refused: string }>>(), reopen: vi.fn(), initialize: vi.fn(), epoch: vi.fn(), dispose: vi.fn(),
      store: vi.fn(), remove: vi.fn(), replace: vi.fn(), rereadAll: vi.fn(), reread: vi.fn(), adopt: vi.fn() },
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
  autoUpdater: mocks.nativeUpdater,
  systemPreferences: { subscribeLocalNotification: (name: string, callback: () => void) => { mocks.notifications.set(name, callback); return mocks.notifications.size; } },
}));
vi.mock("./conversation/store", async (importOriginal) => ({ ...await importOriginal<typeof import("./conversation/store")>(), ConversationStore: class { list() { return mocks.conversations; } finishDeletions() {} } }));
// The fake store makes no conversations directory, so the queue's drafts stay in memory.
vi.mock("./conversation/drafts", async (importOriginal) => { const original = await importOriginal<typeof import("./conversation/drafts")>(); return { ...original, DraftStore: class extends original.DraftStore { constructor() { super(null); } } }; });
vi.mock("./conversation/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./conversation/service")>();
  return { ...actual, ConversationService: class extends actual.ConversationService {
    constructor(...args: ConstructorParameters<typeof actual.ConversationService>) { super(...args); mocks.publishConversation = args[3] as never; mocks.deletedConversation = args[9] as never; mocks.workEnded = args[10] as never; mocks.stageConversation = args[12] as never; mocks.conversationService = this; }
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
vi.mock("./agentSetup/runner", () => ({ runAgentSetup: mocks.runAgentSetup, osascriptAdmin: mocks.osascriptAdmin, setupEligibility: mocks.setupEligibility }));
vi.mock("electron-updater", () => ({ MacUpdater: mocks.Updater }));
vi.mock("./update/service", async (importOriginal) => ({ ...await importOriginal<typeof import("./update/service")>(), hasFeedConfig: mocks.hasFeedConfig }));
vi.mock("./cli", () => ({ cliCommand: mocks.cliCommand, runConfig: mocks.runConfig, readFolder: mocks.readFolder, runDesignSkill: mocks.runDesignSkill, runExport: mocks.runExport }));
vi.mock("./shell", () => ({ startShell: mocks.startShell }));
vi.mock("./runtime", () => ({ startRuntime: mocks.startRuntime }));
vi.mock("./addProjects", async (importOriginal) => ({ ...await importOriginal<typeof import("./addProjects")>(), createAddFlow: mocks.createAddFlow }));
vi.mock("./inspector", async (importOriginal) => ({ ...await importOriginal<typeof import("./inspector")>(), createInspector: mocks.createInspector }));
vi.mock("./uiState", () => ({ createUiStateStore: mocks.createUiStateStore }));
// The first tool-facts probe and the usage service's triggers, observed where index.ts wires them.
const usageProbe = vi.hoisted(() => ({ read: undefined as undefined | (() => Promise<unknown>), triggers: [] as unknown[] }));
vi.mock("./agentAuth/ipc", async (importOriginal) => {
  const original = await importOriginal<typeof import("./agentAuth/ipc")>();
  return { ...original, AuthIpc: class extends original.AuthIpc { override read() { return usageProbe.read ? usageProbe.read() as ReturnType<InstanceType<typeof original.AuthIpc>["read"]> : super.read(); } } };
});
vi.mock("./agentAuth/usageService", async (importOriginal) => {
  const original = await importOriginal<typeof import("./agentAuth/usageService")>();
  return { ...original, UsageService: class extends original.UsageService { override trigger(event: Parameters<InstanceType<typeof original.UsageService>["trigger"]>[0]) { usageProbe.triggers.push(event); return super.trigger(event); } } };
});
// What main hands the Install/Update opener; its file writes are covered in installCommand.test.ts.
const installOpener = vi.hoisted(() => ({ open: vi.fn<(provider: string, facts: unknown) => Promise<string>>(), deps: [] as { dir: string }[] }));
vi.mock("./installCommand", async (importOriginal) => ({
  ...await importOriginal<typeof import("./installCommand")>(),
  createInstallOpener: (deps: { dir: string }) => { installOpener.deps.push(deps); return installOpener.open; },
}));
vi.mock("./canvasSeen", async (importOriginal) => {
  const original = await importOriginal<typeof import("./canvasSeen")>();
  return { ...original, createLocalSeen: (file: string) => {
    const store = original.createLocalSeen(file);
    return { ...store, flushSync: () => { mocks.canvasSeenFlushSync(); store.flushSync(); } };
  } };
});
vi.mock("./thumbnails", () => ({ createThumbnails: mocks.createThumbnails }));
vi.mock("./onboarding/projects", async (importOriginal) => ({ ...await importOriginal<typeof import("./onboarding/projects")>(), ...mocks.projects }));
const actualProjects = await vi.importActual<typeof import("./onboarding/projects")>("./onboarding/projects");

// What onboarding.json holds at launch; a describe sets it in beforeAll, before each launch reads it.
let launchCompletion: { kind: string; projectRoot?: string } = { kind: "missing" };
const COMPLETE = { kind: "complete", projectRoot: "/repo" };
// The launch's preferences file: whether it has a buddy key, and its notice. Most launches are of someone who has one.
let launchBuddyKey = true;
let launchNotice: string | null = null;
// What the launch's login-shell probe answers and what its agent setup resolves to; a describe sets them in beforeAll.
// A held setup stays pending until the test settles it, as while the administrator dialog is open.
let launchProbe: unknown = { ok: false, reason: "Login shell failed." };
let launchSetup: unknown = { home: "/Users/you", items: [], steps: [] };
// Whether this launch's copy updates: agent setup's eligibility for its bundle, and whether it ships a feed file.
let launchEligibility = "dev";
let launchFeed = false;
const HELD = Symbol("held");
let settleSetup: (value: unknown) => void = () => {};
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  usageProbe.read = undefined;
  usageProbe.triggers.length = 0;
  mocks.app.removeAllListeners();
  mocks.Window.instances.length = 0;
  mocks.ipc.clear();
  mocks.readCompletion.mockReturnValue(launchCompletion);
  mocks.Updater.instances.length = 0;
  mocks.nativeUpdater.removeAllListeners();
  mocks.setupEligibility.mockReturnValue(launchEligibility);
  mocks.hasFeedConfig.mockReturnValue(launchFeed);
  mocks.probeShell.mockResolvedValue(launchProbe);
  mocks.runAgentSetup.mockReturnValue(launchSetup === HELD ? new Promise(resolve => { settleSetup = resolve; }) : Promise.resolve(launchSetup));
  mocks.app.whenReady.mockResolvedValue();
  mocks.startShell.mockResolvedValue(mocks.shell);
  mocks.startRuntime.mockResolvedValue(mocks.runtime);
  mocks.createInspector.mockReturnValue(mocks.inspector);
  mocks.inspector.inspect.mockResolvedValue({ ok: true, rows: [] });
  mocks.app.requestSingleInstanceLock.mockReturnValue(true);
  mocks.app.isActive.mockReturnValue(true);
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
  mocks.preferences.read.mockReturnValue({ preferences: DEFAULTS, notice: launchNotice });
  mocks.preferences.current.mockReturnValue(DEFAULTS);
  mocks.preferences.buddyKey.mockReturnValue(launchBuddyKey);
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

// The first paint has the saved buddy's accent: the renderer reads ?buddy= before React mounts.
test("opens the window with the saved buddy in its query; Doany without one", async () => {
  expect(window().loadFile).toHaveBeenCalledWith(expect.stringMatching(/renderer[\\/]index\.html$/), { query: { buddy: "doany" } });
  vi.resetModules();
  mocks.app.removeAllListeners();
  mocks.Window.instances.length = 0;
  mocks.ipc.clear();
  mocks.preferences.read.mockReturnValue({ preferences: { ...DEFAULTS, buddy: "popo" }, notice: null });
  await import("./index");
  await vi.waitFor(() => expect(mocks.Window.instances).toHaveLength(1));
  expect(window().loadFile).toHaveBeenCalledWith(expect.stringMatching(/renderer[\\/]index\.html$/), { query: { buddy: "popo" } });
});

test("in development the dev server URL carries the same query", async () => {
  vi.resetModules();
  mocks.app.removeAllListeners();
  mocks.Window.instances.length = 0;
  mocks.ipc.clear();
  mocks.preferences.read.mockReturnValue({ preferences: { ...DEFAULTS, buddy: "dori" }, notice: null });
  const packaged = mocks.app.isPackaged, url = process.env.ELECTRON_RENDERER_URL;
  mocks.app.isPackaged = false;
  process.env.ELECTRON_RENDERER_URL = "http://localhost:5173";
  try {
    await import("./index");
    await vi.waitFor(() => expect(mocks.Window.instances).toHaveLength(1));
    expect(window().loadURL).toHaveBeenCalledWith("http://localhost:5173/?buddy=dori");
    expect(window().loadFile).not.toHaveBeenCalled();
  } finally {
    mocks.app.isPackaged = packaged;
    if (url === undefined) delete process.env.ELECTRON_RENDERER_URL; else process.env.ELECTRON_RENDERER_URL = url;
  }
});

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
  // The window's own fullscreen listeners (the renderer's notice) stay; only the pending hide goes.
  const permanent = window().listenerCount("leave-full-screen");
  window().emit("close", { preventDefault: vi.fn() });
  if (action === "activate") mocks.app.emit("activate");
  else await invoke("folders:open", window().webContents, null);
  expect(window().show).toHaveBeenCalledOnce();
  expect(window().listenerCount("leave-full-screen")).toBe(permanent);
  window().emit("leave-full-screen");
  expect(window().hide).not.toHaveBeenCalled();
});

test("expires a fullscreen hide request when the transition event never arrives", () => {
  vi.useFakeTimers();
  try {
    window().isFullScreen.mockReturnValue(true);
    const permanent = window().listenerCount("leave-full-screen");
    window().emit("close", { preventDefault: vi.fn() });
    vi.runAllTimers();
    expect(window().listenerCount("leave-full-screen")).toBe(permanent);
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
  mocks.shell.remove.mockImplementation(async (paths: string[]) => ({ paths }));
  mocks.shell.entries.mockReturnValue([{ path: ROOT }, { path: "/Users/sam/code/other" }]);
  const contents = window().webContents;
  await invoke("selection:set", contents, null, SELECTION);
  await invoke("folders:remove", contents, null, { paths: ["/Users/sam/code/other"] });
  expect(runtimeState().selection()).toEqual(SELECTION);
  await invoke("folders:remove", contents, null, { paths: [ROOT] });
  expect(mocks.shell.remove).toHaveBeenCalledWith([ROOT]);
  expect(runtimeState().selection()).toBeNull();
});

// ARCHITECTURE §4 'Auto-registration': a vanished auto-registered worktree goes through Remove's clean-up.
test("an auto-removed worktree clears its selection and thumbnails", async () => {
  const W = "/orca/workspaces/repo/w1";
  const before = [{ path: ROOT }, { path: W }];
  mocks.shell.entries.mockReturnValue(before);
  await invoke("selection:set", window().webContents, null, { ...SELECTION, root: W });
  expect(runtimeState().selection()).toMatchObject({ root: W });
  const options = mocks.startShell.mock.calls[0]?.[3] as { autoRemoved?: (paths: string[], before: unknown[]) => void } | undefined;
  if (!options?.autoRemoved) throw new Error("no auto-removal hook");
  mocks.shell.entries.mockReturnValue([{ path: ROOT }]);
  options.autoRemoved([W], before);
  expect(runtimeState().selection()).toBeNull();
  expect(mocks.thumbnails.removed).toHaveBeenCalledExactlyOnceWith([W], before);
});

test("an auto-removed worktree keeps another root's selection", async () => {
  mocks.shell.entries.mockReturnValue([{ path: ROOT }, { path: "/w" }]);
  await invoke("selection:set", window().webContents, null, SELECTION);
  const options = mocks.startShell.mock.calls[0]?.[3] as { autoRemoved?: (paths: string[], before: unknown[]) => void } | undefined;
  options?.autoRemoved?.(["/w"], []);
  expect(runtimeState().selection()).toEqual(SELECTION);
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
  // Only the one-way quitting notice, which nothing waits for.
  expect(window().webContents.send.mock.calls).toEqual([["app:quitting", true]]);
});

test("project setup IPC rejects untrusted frames, arbitrary paths and forged choices", async () => {
  for (const channel of ["project:choose-token-css", "project:init"]) {
    expect(await invoke(channel, {}, null, { root: ROOT, choiceId: null })).toMatchObject({ kind: "unavailable" });
    expect(await invoke(channel, window().webContents, {}, { root: ROOT, choiceId: null })).toMatchObject({ kind: "unavailable" });
    expect(await invoke(channel, window().webContents, null, { root: ROOT, choiceId: null })).toMatchObject({ kind: "unavailable" });
  }
  mocks.shell.entries.mockReturnValue([{ path: ROOT, kind: "uninitialized" }]);
  for (const request of [{ root: ROOT, choiceId: "forged", storage: null }, { root: ROOT, choiceId: null, storage: null, tokenCss: "/arbitrary" }, null, { root: ROOT },
    { root: ROOT, choiceId: null }, { root: ROOT, choiceId: null, storage: "repo" }, { root: ROOT, choiceId: null, storage: "unknown" }]) {
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
  expect(await invoke("project:init", window().webContents, null, { root: ROOT, choiceId: picked.choiceId, storage: null })).toEqual({ kind: "success" });
  expect(mocks.shell.initialize).toHaveBeenCalledWith(ROOT, ROOT + "/tokens.css", null);
  mocks.shell.initialize.mockClear(); mocks.shell.epoch.mockReturnValue(2);
  expect(await invoke("project:init", window().webContents, null, { root: ROOT, choiceId: picked.choiceId, storage: null })).toMatchObject({ kind: "unavailable" });
  expect(mocks.shell.initialize).not.toHaveBeenCalled();
});

// ARCHITECTURE §7 'Settings IPC' 'Storage writes' (POSTMORTEM 2026-11-03 'Locate on the Project Settings page…'): a
// setup kept out of Git writes the shared exclude file, so every worktree of the project is read again, as after a
// Project Settings write.
test("a local setup reads every worktree of its project again; a setup in Git or a failed one does not", async () => {
  const A = "/w/studio", B = "/w/studio-b";
  const git = { common: `${A}/.git`, main: A, worktrees: [A, B] };
  mocks.shell.entries.mockReturnValue([{ path: A, kind: "list", canvases: [], servedRev: 0, git, storage: "repo" } as { path: string; kind?: string }, { path: B, kind: "uninitialized" }]);
  mocks.shell.initialize.mockResolvedValue({ kind: "success" });
  expect(await invoke("project:init", window().webContents, null, { root: B, choiceId: null, storage: "local" })).toEqual({ kind: "success" });
  expect(mocks.shell.initialize).toHaveBeenCalledWith(B, null, "local");
  expect(mocks.shell.reread).toHaveBeenCalledExactlyOnceWith([A, B]);
  mocks.shell.reread.mockClear();
  await invoke("project:init", window().webContents, null, { root: B, choiceId: null, storage: null });
  mocks.shell.initialize.mockResolvedValueOnce({ kind: "error", code: "local_not_git", message: "m", guidance: "g" });
  await invoke("project:init", window().webContents, null, { root: B, choiceId: null, storage: "local" });
  expect(mocks.shell.reread).not.toHaveBeenCalled();
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
  expect(mocks.ipc.has("setup:open-install")).toBe(true);
  expect(mocks.ipc.has("onboarding:choose-folder")).toBe(true);
});
describe("a launch with a v1 completion record", () => {
  beforeAll(() => { launchCompletion = COMPLETE; });
  afterAll(() => { launchCompletion = { kind: "missing" }; });
  test("opens no first run: Settings is available", async () => {
    expect(item("Settings…").enabled).not.toBe(false);
  });
});
// The buddy screen for someone who finished first run without a buddy key: main decides it at launch and holds first
// run's lock (Settings…, ⌘B, Check for Updates…, the open-Settings command) until the renderer reports it closed.
describe("a completed launch whose preferences have no buddy key", () => {
  beforeAll(() => { launchCompletion = COMPLETE; launchBuddyKey = false; });
  afterAll(() => { launchCompletion = { kind: "missing" }; launchBuddyKey = true; });
  test("opens the buddy screen with first run's lock", async () => {
    expect(await invoke("buddy-intro:read", window().webContents, null)).toBe(true);
    expect(item("Settings…").enabled).toBe(false);
    expect(item("Hide Sidebar").enabled).toBe(false);
    expect(item("Check for Updates…").enabled).toBe(false);
    const { openSettingsPage } = await import("./index");
    expect(openSettingsPage()).toBe(false);
  });
  test("closing it releases the lock, and a reloaded renderer reads it closed", async () => {
    expect(await invoke("buddy-intro:close", window().webContents, null)).toBeUndefined();
    expect(item("Settings…").enabled).not.toBe(false);
    expect(item("Hide Sidebar").enabled).not.toBe(false);
    const { openSettingsPage } = await import("./index");
    expect(openSettingsPage()).toBe(true);
    expect(await invoke("buddy-intro:read", window().webContents, null)).toBe(false);
  });
  test("the channels answer the main window's main frame only; close takes no value", async () => {
    const other = new mocks.Window({ show: false }).webContents;
    expect(await invoke("buddy-intro:read", other, null)).toBe(false);
    expect(await invoke("buddy-intro:read", window().webContents, {})).toBe(false);
    await invoke("buddy-intro:close", other, null);
    await invoke("buddy-intro:close", window().webContents, {});
    await invoke("buddy-intro:close", window().webContents, null, "closed");
    expect(item("Settings…").enabled).toBe(false);
    expect(await invoke("buddy-intro:read", window().webContents, null)).toBe(true);
  });
});
describe.each([
  ["has a buddy key", true, null, COMPLETE],
  ["is newer", false, "newer", COMPLETE],
  ["is broken", false, "broken", COMPLETE],
  ["has no buddy key but first run is open", false, null, { kind: "missing" }],
])("a launch whose preferences file %s", (_name, key, notice, completion) => {
  beforeAll(() => { launchCompletion = completion; launchBuddyKey = key; launchNotice = notice; });
  afterAll(() => { launchCompletion = { kind: "missing" }; launchBuddyKey = true; launchNotice = null; });
  test("shows no buddy screen", async () => {
    expect(await invoke("buddy-intro:read", window().webContents, null)).toBe(false);
    expect(item("Settings…").enabled).toBe(completion === COMPLETE);
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
const state = (screen: string, modal = false) => ({ screen, modal });

describe("menus", () => {
  test("pins the item names and accelerators", () => {
    expect(template().map((menu) => menu.label ?? menu.role)).toEqual(["Doan", "File", "Edit", "View", "Go", "windowMenu"]);
    // Settings… replaces Set Up doan… right after About (orch.md decision).
    expect(submenu("Doan").map((entry) => entry.label ?? entry.role ?? entry.type)).toEqual(["About Doan", "Check for Updates…", "Settings…", "separator", "services", "separator", "Hide Doan", "hideOthers", "unhide", "separator", "Quit Doan"]);
    expect(item("Settings…").accelerator).toBe("CmdOrCtrl+,");
    expect(submenu("File").map((entry) => entry.label ?? entry.type)).toEqual(["New Conversation", "Add Project…", "separator", "Close Window"]);
    expect(item("New Conversation").accelerator).toBe("CmdOrCtrl+N");
    expect(item("Add Project…").accelerator).toBe("CmdOrCtrl+O");
    expect(item("Close Window").accelerator).toBe("CmdOrCtrl+W");
    expect(submenu("Go").map((entry) => [entry.label ?? entry.type, entry.accelerator])).toEqual([["Home", "Shift+CmdOrCtrl+H"], ["Quick Open…", "CmdOrCtrl+K"]]);
    // Undo and Redo keep working in text fields (routed below); a removal has no Undo of its own.
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
    await invoke("menu:state", contents, null, state("canvas", true));
    for (const label of ["Add Project…", "Home", "Zoom In"]) expect(menuEnabled(label), label).toBe(false);
    // A modal may hold a text field, so its ⌘Z stays a text undo.
    expect(submenu("Edit")[0]?.label).toBe("Undo");
  });

  test("Edit > Undo is always the text Undo; a removal has no Undo Remove", async () => {
    const contents = window().webContents;
    await invoke("menu:state", contents, null, state("home"));
    expect(submenu("Edit")[0]).toMatchObject({ label: "Undo", accelerator: "CmdOrCtrl+Z" });
    expect(() => item("Undo Remove")).toThrow();
  });

  // The chip field refuses Chromium's undo, so the role items could not redo it.
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
    for (const bad of [null, "canvas", { screen: "canvas" }, state("about"), { ...state("canvas"), more: 1 }, { screen: "canvas", modal: 1 }, { ...state("canvas"), toast: false },
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
    await invoke("menu:state", contents, null, state("canvas"));
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

  // View's first item hides and shows the sidebar; its name follows the
  // renderer's state, a page lock keeps it, a modal turns it off.
  test("View > Hide/Show Sidebar follows the validated sidebar state and tells the renderer", async () => {
    const contents = window().webContents;
    expect(submenu("View").slice(0, 2).map((entry) => [entry.label ?? entry.type, entry.accelerator])).toEqual([["Hide Sidebar", "CmdOrCtrl+B"], ["separator", undefined]]);
    // The test app starts in first run, which turns it off.
    expect(menuEnabled("Hide Sidebar")).toBe(false);
    await completeFirstRun();
    expect(menuEnabled("Hide Sidebar")).toBe(true);
    click("Hide Sidebar");
    expect(contents.send).toHaveBeenCalledWith("menu-command", "toggleSidebar");
    await invoke("menu:state", contents, null, { ...state("canvas"), sidebarHidden: true });
    expect(submenu("View")[0]).toMatchObject({ label: "Show Sidebar", accelerator: "CmdOrCtrl+B" });
    expect(menuEnabled("Show Sidebar")).toBe(true);
    await invoke("menu:state", contents, null, { ...state("settings"), locked: true, sidebarHidden: true });
    expect(menuEnabled("Show Sidebar")).toBe(true);
    await invoke("menu:state", contents, null, { ...state("canvas", true), sidebarHidden: true });
    expect(menuEnabled("Show Sidebar")).toBe(false);
    for (const bad of [{ ...state("canvas"), sidebarHidden: "true" }, { ...state("canvas"), sidebarHidden: 1 }]) {
      await invoke("menu:state", contents, null, bad);
      expect(menuEnabled("Show Sidebar")).toBe(false);
    }
    await invoke("menu:state", contents, null, state("canvas"));
    expect(submenu("View")[0]?.label).toBe("Hide Sidebar");
  });

  test("Pick from Canvas follows the validated picker state, without a selection", async () => {
    const contents = window().webContents;
    const ready = { ...state("canvas"), pickerAvailable: true };
    await invoke("menu:state", contents, null, state("canvas"));
    expect(menuEnabled("New Conversation")).toBe(true);
    expect(menuEnabled("Pick from Canvas")).toBe(false);
    expect(submenu("Edit").some(item => item.label === "Add Selection to Conversation")).toBe(false);
    // `selection` is no longer a menu input, so a state carrying it is refused.
    for (const bad of [{ ...ready, pickerAvailable: 1 }, { ...ready, selection: true }, { ...ready, unknown: true }]) {
      await invoke("menu:state", contents, null, bad);
      expect(menuEnabled("Pick from Canvas")).toBe(false);
    }
    await invoke("menu:state", contents, null, ready);
    expect(menuEnabled("Pick from Canvas")).toBe(true);
    expect(submenu("Edit").find(item => item.label === "Pick from Canvas")?.accelerator).toBe("CmdOrCtrl+L");
    click("Pick from Canvas");
    expect(contents.send).toHaveBeenCalledWith("menu-command", "pickFromCanvas");
    await invoke("menu:state", contents, null, { ...ready, pickerAvailable: false });
    expect(menuEnabled("Pick from Canvas")).toBe(false);
    await invoke("menu:state", contents, null, { ...state("workspace"), overview: true, pickerAvailable: true });
    expect(menuEnabled("Pick from Canvas")).toBe(false);
  });

  test("invalid menu state preserves an enabled canvas conversation action", async () => {
    const contents = window().webContents;
    const ready = { ...state("canvas"), pickerAvailable: true };
    await invoke("menu:state", contents, null, ready);
    expect(menuEnabled("Pick from Canvas")).toBe(true);
    const builds = mocks.menu.mock.calls.length;
    await invoke("menu:state", contents, null, { ...ready, pickerAvailable: "true" });
    expect(menuEnabled("Pick from Canvas")).toBe(true);
    expect(mocks.menu.mock.calls.length).toBe(builds);
  });

  test("Go > Home tells the renderer", async () => {
    await invoke("menu:state", window().webContents, null, state("workspace"));
    click("Home");
    expect(window().webContents.send).toHaveBeenCalledWith("menu-command", "home");
  });

  // The page opens in the renderer; no native picker, and none with multiSelections, opens here.
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

  test("a locked page disables everything that leaves it", async () => {
    const contents = window().webContents;
    await invoke("menu:state", contents, null, { ...state("addProjects"), choose: true, locked: true });
    for (const label of ["Add Project…", "Home", "Quick Open…"]) expect(menuEnabled(label), label).toBe(false);
    expect(submenu("Edit")[0]?.label).toBe("Undo");
    await invoke("menu:state", contents, null, { ...state("addProjects"), choose: true, locked: false });
    expect(menuEnabled("Add Project…")).toBe(true);
  });

  // The Settings page is a screen; its lock (and the Add Projects page's) disables Settings… too.
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

describe("removing", () => {
  beforeEach(() => {
    mocks.shell.entries.mockReturnValue(entries);
    mocks.shell.remove.mockImplementation(async (paths: string[]) => ({ paths }));
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

  test("removes a row or a card", async () => {
    const contents = window().webContents;
    expect(await invoke("folders:remove", contents, null, { paths: [WT] })).toEqual({ kind: "removed" });
    expect(mocks.shell.remove).toHaveBeenCalledWith([WT]);
    expect(await invoke("folders:remove", contents, null, { paths: [APP, WT] })).toEqual({ kind: "removed" });
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

  // PRODUCT §5 item 3 'Problem states': a Config error's Show in Finder selects the file the CLI named as the one to
  // fix, which Finder would otherwise hide inside `.doan/`, and which may be a parent folder's. The renderer still
  // passes the root only; main picks the target from the entry it holds.
  test("reveal selects the config the CLI named for a Config error project, else the root", async () => {
    const contents = window().webContents;
    const base = mkdtempSync(join(tmpdir(), "doan-reveal-"));
    try {
      const own = join(base, "own"), parent = join(base, "parent"), sub = join(parent, "web"), gone = join(base, "gone"), dirConfig = join(base, "dir-config"), healthy = join(base, "healthy");
      for (const dir of [own, parent, gone, dirConfig, healthy]) mkdirSync(join(dir, ".doan"), { recursive: true });
      mkdirSync(sub);
      mkdirSync(join(dirConfig, ".doan", "config.json"));
      writeFileSync(join(own, ".doan", "config.json"), "{");
      writeFileSync(join(parent, ".doan", "config.json"), "{");
      writeFileSync(join(healthy, ".doan", "config.json"), "{}");
      const named = (root: string, config: string) => ({ path: root, kind: "error", message: "bad", config });
      mocks.shell.entries.mockReturnValue([
        named(own, join(own, ".doan", "config.json")),
        // A subfolder whose upward re-read stopped at its parent's broken config.
        named(sub, join(parent, ".doan", "config.json")),
        // The named file is gone by the time Show in Finder is pressed.
        named(gone, join(gone, ".doan", "config.json")),
        // A directory where the config should be: still the thing the CLI named.
        named(dirConfig, join(dirConfig, ".doan", "config.json")),
        { path: healthy, kind: "cliError" },
      ]);
      const revealed = async (root: string) => {
        mocks.electronShell.showItemInFolder.mockClear();
        await invoke("folders:reveal", contents, null, { path: root });
        return mocks.electronShell.showItemInFolder.mock.calls;
      };
      expect(await revealed(own)).toEqual([[join(own, ".doan", "config.json")]]);
      expect(await revealed(sub)).toEqual([[join(parent, ".doan", "config.json")]]);
      expect(await revealed(gone)).toEqual([[gone]]);
      expect(await revealed(dirConfig)).toEqual([[join(dirConfig, ".doan", "config.json")]]);
      expect(await revealed(healthy)).toEqual([[healthy]]);
      // A path, not a root, is still refused: the renderer cannot name the file.
      expect(await revealed(join(own, ".doan", "config.json"))).toEqual([]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

// A canvas click is the canvas's message, so the renderer asks where the OS cursor is.
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

describe("text edit menu", () => {
  const FLAGS = { canUndo: true, canRedo: true, canCut: true, canCopy: true, canPaste: true, canDelete: true, canSelectAll: true, canEditRichly: true };
  function params(overrides: Record<string, unknown> = {}) {
    return { frame: { parent: null }, isEditable: true, formControlType: "input-text", selectionText: "teh", editFlags: FLAGS, misspelledWord: "teh", dictionarySuggestions: ["the"], x: 40, y: 60, ...overrides };
  }
  // The context menu is the Menu built after the app menu; each test gives it a popup to observe.
  function rightClick(overrides: Record<string, unknown> = {}) {
    const popup = vi.fn();
    const builds = mocks.menu.mock.calls.length;
    mocks.menu.mockReturnValueOnce({ popup });
    window().webContents.emit("context-menu", { preventDefault: vi.fn() }, params(overrides));
    return { popup, template: mocks.menu.mock.calls.length > builds ? mocks.menu.mock.calls.at(-1)?.[0] ?? [] : null };
  }

  test("a main-frame field pops the planned items on the main window, without a frame", () => {
    const { popup, template } = rightClick();
    expect(template?.map(entry => entry.label ?? entry.type)).toEqual(["the", "separator", "Look Up “teh”", "separator", "Cut", "Copy", "Paste", "separator", "Select All"]);
    expect(popup).toHaveBeenCalledExactlyOnceWith({ window: window() });
    expect(popup.mock.calls[0]?.[0]).not.toHaveProperty("frame");
  });

  test("edit items are click items carrying Chromium's enablement", () => {
    const { template } = rightClick({ selectionText: "", misspelledWord: "", editFlags: { ...FLAGS, canCut: false, canCopy: false } });
    expect(template?.map(entry => entry.type ?? [entry.label, entry.enabled, entry.accelerator, typeof entry.click, entry.role])).toEqual([["Cut", false, "CmdOrCtrl+X", "function", undefined], ["Copy", false, "CmdOrCtrl+C", "function", undefined], ["Paste", true, "CmdOrCtrl+V", "function", undefined], "separator", ["Select All", true, "CmdOrCtrl+A", "function", undefined]]);
  });

  // PRODUCT §5 'Text edit menu': the field the menu opened on may be gone by the time an item is chosen.
  test("a suggestion or Paste acts on the clicked page only when the page says focus is still on the opened field", async () => {
    const contents = window().webContents;
    const { template } = rightClick();
    const run = async (label: string) => { Reflect.apply(template?.find(entry => entry.label === label)?.click ?? (() => { throw new Error(`no ${label}`); }), undefined, []); await new Promise(resolve => setTimeout(resolve, 0)); };
    contents.executeJavaScript.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    await run("the");
    await run("Paste");
    expect(contents.replaceMisspelling).not.toHaveBeenCalled();
    expect(contents.paste).not.toHaveBeenCalled();
    contents.executeJavaScript.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    await run("the");
    await run("Paste");
    expect(String(contents.executeJavaScript.mock.calls.at(-1)?.[0])).toContain("document.elementFromPoint(40, 60)");
    expect(contents.replaceMisspelling).toHaveBeenCalledExactlyOnceWith("the");
    expect(contents.paste).toHaveBeenCalledOnce();
    await run("Look Up “teh”");
    expect(contents.showDefinitionForSelection).toHaveBeenCalledOnce();
  });

  test("a subframe (the canvas iframe) and non-editable text with no selection pop nothing", () => {
    for (const overrides of [{ frame: { parent: { parent: null } } }, { frame: null }, { isEditable: false, selectionText: "" }]) {
      const { popup, template } = rightClick(overrides);
      expect(template, JSON.stringify(overrides)).toBeNull();
      expect(popup).not.toHaveBeenCalled();
    }
  });

  test("the thumbnail capture window gets no menu", async () => {
    const deps = mocks.createThumbnails.mock.calls[0]?.[0] as import("./thumbnails").ThumbnailDeps | undefined;
    await deps?.capturer.capture("http://127.0.0.1:1/t/tok/k/.doan/canvases/a.html", 800);
    const hidden = mocks.Window.instances[1];
    if (!hidden) throw new Error("no capture window");
    expect(window().webContents.listenerCount("context-menu")).toBe(1);
    expect(hidden.webContents.listenerCount("context-menu")).toBe(0);
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

  // The stage goes to the main window only, never to the capture window main also owns.
  test("a conversation stage reaches the main window and not the capture window", async () => {
    const hidden = await captureWindow();
    window().webContents.send.mockClear(); hidden.webContents.send.mockClear();
    const signal = { conversationId: "c1", turnId: "t1", seq: 2, rev: 1, stage: { kind: "general" } };
    mocks.stageConversation!(signal);
    expect(window().webContents.send.mock.calls).toEqual([["conversation:stage", signal]]);
    expect(hidden.webContents.send).not.toHaveBeenCalled();
    expect(mocks.Window.instances).toHaveLength(2);
  });

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

  test("the main renderer learns when the window enters and leaves fullscreen; only it may ask", async () => {
    const sent = () => vi.mocked(window().webContents.send).mock.calls.filter(([channel]) => channel === "window:fullscreen").map(([, value]) => value);
    expect(await invoke("window:fullscreen", window().webContents, null)).toEqual({ fullScreen: false });
    window().isFullScreen.mockReturnValue(true);
    window().emit("enter-full-screen");
    expect(await invoke("window:fullscreen", window().webContents, null)).toEqual({ fullScreen: true });
    window().isFullScreen.mockReturnValue(false);
    window().emit("leave-full-screen");
    expect(sent()).toEqual([{ fullScreen: true }, { fullScreen: false }]);
    expect(await invoke("window:fullscreen", {}, null)).toBeNull();
    expect(await invoke("window:fullscreen", (await captureWindow()).webContents, null)).toBeNull();
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
    mocks.shell.remove.mockResolvedValue({ paths: ["/repo"] });
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

// Move to Trash and Export from the sidebar's canvas row menu.
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

// Main's own busy grounds and trashItem wiring, on a registered root that passes the disk checks
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
    // Left from before comments were removed, named after the canvas id: Move to Trash leaves it.
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

  test("moves only the listed canvas, asking main's grounds for exactly this root", async () => {
    const asked = service();
    expect(await invoke("canvas:trashPlan", window().webContents, null, { root, path })).toEqual({ kind: "ready" });
    expect(await trash()).toEqual({ kind: "trashed" });
    expect(asked.list.mock.calls.every(([at]) => at === root)).toBe(true);
    expect(asked.evidence.mock.calls.every(([at]) => at === root)).toBe(true);
    expect(asked.list).toHaveBeenCalled();
    expect(asked.evidence).toHaveBeenCalled();
    expect(mocks.electronShell.trashItem.mock.calls).toEqual([[join(root, path)]]);
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
    expect(await trash()).toEqual({ kind: "trashed" });
    expect(mocks.electronShell.trashItem).toHaveBeenNthCalledWith(1, join(root, path));
  });

  test("a failed canvas move refuses as failed", async () => {
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

  test("Install and Update: the window names only the provider, and main opens what it chose from its own facts", async () => {
    expect(installOpener.deps.at(-1)?.dir).toBe("/tmp/doan-index-test/terminal");
    installOpener.open.mockResolvedValueOnce("terminal");
    expect(await invoke("setup:open-install", window().webContents, null, { target: "codex" })).toBe("terminal");
    expect(installOpener.open).toHaveBeenCalledOnce();
    expect(installOpener.open.mock.calls[0]![0]).toBe("codex");
    for (const bad of [{ target: "antigravity" }, { target: "evil" }, { target: "toString" }, { target: "codex", action: "update" }, { target: "codex", command: "rm -rf ~" }, {}, "codex", null]) {
      expect(await invoke("setup:open-install", window().webContents, null, bad), JSON.stringify(bad)).toBe("failed");
    }
    expect(installOpener.open).toHaveBeenCalledOnce();
    expect(mocks.electronShell.openExternal).not.toHaveBeenCalled();
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

// conversation:delete answers busy while quitting as while working, so the
// renderer learns of the quit from main and its refusal toast can stay quiet. An aborted quit leaves the conversations
// stopped (the service stays quitting), so main never takes it back.
test("main tells the renderer it is quitting before the conversations stop, and never takes it back after an aborted quit", async () => {
  const contents = window().webContents;
  const service = mocks.conversationService as unknown as { quit(): Promise<void> };
  const stop = vi.spyOn(service, "quit").mockRejectedValueOnce(new Error("EIO"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  contents.send.mockClear();
  mocks.app.emit("before-quit", { preventDefault: vi.fn() });
  expect(contents.send).toHaveBeenCalledExactlyOnceWith("app:quitting", true);
  await new Promise<void>(resolve => setImmediate(resolve));
  await vi.waitFor(() => expect(log).toHaveBeenCalledWith("doan: conversation persistence failed during quit", expect.any(Error)));
  expect(contents.send.mock.invocationCallOrder[0]).toBeLessThan(stop.mock.invocationCallOrder[0] ?? 0);
  expect(mocks.app.quit).not.toHaveBeenCalled();
  expect(contents.send.mock.calls.filter(call => call[0] === "app:quitting")).toEqual([["app:quitting", true]]);
  // The next quit proceeds and says so again.
  contents.send.mockClear();
  mocks.app.emit("before-quit", { preventDefault: vi.fn() });
  await new Promise<void>(resolve => setImmediate(resolve));
  await vi.waitFor(() => expect(mocks.app.quit).toHaveBeenCalledOnce());
  expect(contents.send.mock.calls.filter(call => call[0] === "app:quitting")).toEqual([["app:quitting", true]]);
});

test.each([
  ["mcp", "doan: MCP cleanup failed during quit"],
  ["usage", "doan: usage cleanup failed during quit"],
  ["auth", "doan: agent sign-in cleanup failed during quit"],
] as const)("a failed %s teardown is logged and still runs the later steps before quitting", async (failed, message) => {
  const { McpService } = await import("./mcpConnectors/service");
  const { UsageService } = await import("./agentAuth/usageService");
  const { AuthManager } = await import("./agentAuth/manager");
  const { ConversationService } = await import("./conversation/service");
  const { OnboardingService } = await import("./onboarding/service");
  const { AddPageSession } = await import("./addPage");
  const failure = new Error(`${failed} teardown failed`);
  const conversations = vi.spyOn(ConversationService.prototype, "quit").mockResolvedValueOnce();
  const mcp = vi.spyOn(McpService.prototype, "quit").mockResolvedValue();
  const usage = vi.spyOn(UsageService.prototype, "quit").mockResolvedValue();
  const auth = vi.spyOn(AuthManager.prototype, "quit").mockResolvedValue();
  const onboarding = vi.spyOn(OnboardingService.prototype, "quit").mockResolvedValueOnce();
  const addPage = vi.spyOn(AddPageSession.prototype, "quit").mockResolvedValueOnce();
  ({ mcp, usage, auth })[failed].mockRejectedValueOnce(failure);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => { for (const spy of [conversations, mcp, usage, auth, onboarding, addPage, log]) spy.mockRestore(); });

  mocks.app.emit("before-quit", { preventDefault: vi.fn() });
  await new Promise<void>(resolve => setImmediate(resolve));

  expect(conversations).toHaveBeenCalledOnce();
  expect(mcp).toHaveBeenCalledOnce();
  expect(usage).toHaveBeenCalledOnce();
  expect(auth).toHaveBeenCalledOnce();
  expect(onboarding).toHaveBeenCalledOnce();
  expect(addPage).toHaveBeenCalledOnce();
  expect(log).toHaveBeenCalledWith(message, failure);
  expect(mocks.app.quit).toHaveBeenCalledOnce();
  const order = [conversations, mcp, usage, auth, onboarding, addPage, mocks.app.quit].map(spy => spy.mock.invocationCallOrder[0]);
  expect(order).toEqual([...order].sort((a = 0, b = 0) => a - b));
});

test.each([
  { failed: "onboarding", kind: "rejection" }, { failed: "addPage", kind: "rejection" },
  { failed: "onboarding", kind: "throw" }, { failed: "addPage", kind: "throw" },
])("a failed $failed teardown ($kind) is logged and still waits for the other adder before quitting", async ({ failed, kind }) => {
  const { OnboardingService } = await import("./onboarding/service");
  const { AddPageSession } = await import("./addPage");
  const failure = new Error(`${failed} teardown failed`);
  let release = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  const fail = () => { if (kind === "throw") throw failure; return Promise.reject(failure); };
  const onboarding = vi.spyOn(OnboardingService.prototype, "quit").mockImplementationOnce(() => failed === "onboarding" ? fail() : pending);
  const addPage = vi.spyOn(AddPageSession.prototype, "quit").mockImplementationOnce(() => failed === "addPage" ? fail() : pending);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => { release(); for (const spy of [onboarding, addPage, log]) spy.mockRestore(); });

  mocks.app.emit("before-quit", { preventDefault: vi.fn() });
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(onboarding).toHaveBeenCalledOnce();
  expect(addPage).toHaveBeenCalledOnce();
  expect(mocks.app.quit).not.toHaveBeenCalled();
  release();
  await new Promise<void>(resolve => setImmediate(resolve));

  expect(log).toHaveBeenCalledWith("doan: project cleanup failed during quit", failure);
  expect(mocks.app.quit).toHaveBeenCalledOnce();
});

test("a failed final state flush is logged and still quits", async () => {
  const failure = new Error("state flush failed");
  mocks.uiState.flushSync.mockImplementationOnce(() => { throw failure; });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => { log.mockRestore(); });

  mocks.app.emit("before-quit", { preventDefault: vi.fn() });
  await new Promise<void>(resolve => setImmediate(resolve));

  expect(log).toHaveBeenCalledWith("doan: final cleanup failed during quit", failure);
  expect(mocks.app.quit).toHaveBeenCalledOnce();
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

test("the read-state channels refuse foreign windows, subframes, unregistered roots and bad values", async () => {
  const contents = window().webContents;
  for (const channel of ["read-state:showing", "read-state:retry"]) {
    expect(await invoke(channel, {}, null, { root: "/r", path: ".doan/canvases/a.html" })).toBe(false);
    expect(await invoke(channel, contents, {}, { root: "/r", path: ".doan/canvases/a.html" })).toBe(false);
    expect(await invoke(channel, contents, null, { root: "/not-registered", path: ".doan/canvases/a.html" })).toBe(false);
    expect(await invoke(channel, contents, null, 1)).toBe(false);
  }
  // Showing nothing is always allowed.
  expect(await invoke("read-state:showing", contents, null, null)).toBe(true);
});

// The page's own project instance, beside the onboarding session's.
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

  // Auto-registration marks: selecting an already registered worktree, auto-registered or not, makes it hand-added.
  test("a selected folder that is already registered is stored again as hand-added", async () => {
    const contents = window().webContents, sessionId = await pageSession();
    mocks.projects.canonicalFolder.mockResolvedValue("/w");
    mocks.projects.inspectPath.mockResolvedValue({ ok: true, candidates: [{ path: "/w", changes: [] }] });
    mocks.projects.selectProject.mockImplementation(async (path: string, _initialize: boolean, _repo: unknown, deps: { add(path: string): Promise<string | null> }) => {
      const root = await deps.add(path);
      return root === null ? { ok: false, code: "project_unavailable" } : { ok: true, root };
    });
    mocks.flow.add.mockResolvedValueOnce({ added: [], duplicate: "/w", messages: [], confirm: null });
    mocks.shell.store.mockResolvedValue([]);
    const plan = await invoke("add-projects:inspect", contents, null, { sessionId, requestId: "pick", path: "/w" }) as { result: { operation: { inspection: { inspectionId: string } } } };
    const selected = await invoke("add-projects:select", contents, null, { sessionId, requestId: "use", inspectionId: plan.result.operation.inspection.inspectionId, path: "/w" });
    expect(selected).toMatchObject({ ok: true, result: { operation: { kind: "project_select", state: "succeeded", project: { root: "/w" } } } });
    expect(mocks.shell.store).toHaveBeenCalledExactlyOnceWith(["/w"]);
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

  // A confirmation answered "added" counts only once the registry holds the path.
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

// The Settings page's main-window IPC, notifications and the dialog session.
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
    expect(mocks.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^Doan 9\.8\.7\nUpdates: off \(dev\), last checked never\ndoan command 1\.2\.3 \(\/bundled\/doan\)\n/));
  });

  test("Copy details before any About read reads in main first; a later copy reads nothing more", async () => {
    mocks.runDesignSkill.mockResolvedValue({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: true, result: { version: "1.2.3", presets: [] } }) });
    expect(await invoke("about:copy", window().webContents, null)).toEqual({ kind: "success" });
    expect(mocks.runDesignSkill).toHaveBeenCalledOnce();
    expect(mocks.clipboard.writeText).toHaveBeenLastCalledWith(expect.stringMatching(/^Doan 9\.8\.7\nUpdates: off \(dev\), last checked never\ndoan command 1\.2\.3 \(\/bundled\/doan\)\n/));
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

  // ARCHITECTURE §7 'Settings IPC' 'Storage writes': the mode belongs to every worktree of the project, so writing it
  // in worktree A reads B again, and opening the page reads its group again for a mode changed outside Doan.
  test("a mode written in one worktree reads every worktree of its project again", async () => {
    const git = { common: `${ROOT}/.git`, main: ROOT, worktrees: [ROOT, `${ROOT}-b`, `${ROOT}-c`] };
    const entries = [{ ...LIST, git }, { path: `${ROOT}-b`, kind: "list", canvases: [], servedRev: 0, git }, { path: `${ROOT}-c`, kind: "uninitialized" }, { path: "/elsewhere", kind: "list", canvases: [], servedRev: 0 }];
    mocks.shell.entries.mockReturnValue(entries);
    const contents = window().webContents;
    mocks.runConfig.mockResolvedValueOnce({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: true, result: { repo: ROOT, serve: [], changed: true, storage: "local" } }) });
    expect(await invoke("config:write", contents, null, { root: ROOT, op: "setStorage", storage: "local" })).toMatchObject({ kind: "config", storage: "local" });
    expect(mocks.runConfig).toHaveBeenLastCalledWith(expect.any(String), ROOT, ["--storage", "local"]);
    expect(mocks.shell.reread).toHaveBeenCalledExactlyOnceWith([ROOT, `${ROOT}-b`, `${ROOT}-c`]);
    mocks.shell.reread.mockClear();
    await invoke("config:session-start", contents, null, { root: `${ROOT}-b` });
    expect(mocks.shell.reread).toHaveBeenCalledExactlyOnceWith([ROOT, `${ROOT}-b`, `${ROOT}-c`]);
    mocks.shell.reread.mockClear();
    await invoke("config:session-start", contents, null, { root: "/not-stored" });
    await invoke("config:session-start", contents, null);
    expect(mocks.shell.reread).not.toHaveBeenCalled();
  });

  describe("dialog session", () => {
    test("a read or choose answer that arrives after the dialog closed is dropped", async () => {
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

    test.each(["did-navigate", "render-process-gone"])("a config read pending across a reload is cancelled (%s)", async event => {
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

    test("a stage reaches the main window on its own channel, with no notification and not as an event", () => {
      const signal = { conversationId: "c1", turnId: "t1", seq: 2, rev: 1, stage: { kind: "thinking" } };
      window().webContents.send.mockClear();
      mocks.stageConversation!(signal);
      expect(window().webContents.send.mock.calls).toEqual([["conversation:stage", signal]]);
      expect(mocks.Notification.instances).toEqual([]);
    });

    test("deleting a conversation closes its notification", () => {
      publish(turnDone);
      expect(mocks.Notification.instances[0]!.close).not.toHaveBeenCalled();
      mocks.deletedConversation?.("c1");
      expect(mocks.Notification.instances[0]!.close).toHaveBeenCalledOnce();
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

// Agent setup runs once per launch, beside the window, and About waits for its result.
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
    // A crash must not read as "every agent was set up".
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
  vi.useFakeTimers();
  onTestFinished(() => { vi.useRealTimers(); });
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

// An update's content and a renewed start reach the renderer.
test("work content and a later start publish work:changed", () => {
  vi.useFakeTimers();
  onTestFinished(() => { vi.useRealTimers(); });
  const publications = () => window().webContents.send.mock.calls.filter(([channel]) => channel === "work:changed").map(([, items]) => items);
  const changed = mocks.startShell.mock.calls[0]?.[2];
  if (typeof changed !== "function") throw new Error("no folder listener");
  const state = mocks.startRuntime.mock.calls[0]?.[1] as { work(request: unknown): void } | undefined;
  if (!state) throw new Error("no runtime state");
  changed([{ path: "/repo", kind: "list", canvases: [] }]);
  const path = ".doan/canvases/a.html";
  state.work({ v: 3, token: "t", root: "/repo", action: "update", path, frame: "hero", note: "Drawing the hero" });
  state.work({ v: 3, token: "t", root: "/repo", action: "update", path, frame: "pricing" });
  vi.advanceTimersByTime(10);
  state.work({ v: 3, token: "t", root: "/repo", action: "start", path });
  const published = publications() as { frame?: string; note?: string; touched: number; turn: string }[][];
  expect(published).toHaveLength(3);
  expect(published[0]).toMatchObject([{ root: "/repo", path, frame: "hero", note: "Drawing the hero" }]);
  expect(published[1]?.[0]).toMatchObject({ frame: "pricing" });
  expect(published[1]?.[0]).not.toHaveProperty("note");
  expect(published[2]?.[0]?.touched).toBe((published[1]?.[0]?.touched ?? 0) + 10);
  expect(new Set(published.map(items => items[0]?.turn)).size).toBe(1);
});

// The same conversation update in the same ms publishes once; a later one renews touched and publishes.
test("an identical conversation update publishes again only when its time changed", () => {
  vi.useFakeTimers();
  onTestFinished(() => { vi.useRealTimers(); });
  const state = mocks.startRuntime.mock.calls[0]?.[1] as { conversationWork(request: unknown): void } | undefined;
  if (!state) throw new Error("no runtime state");
  const service = mocks.conversationService as unknown as { liveTurns(): ReadonlyMap<string, unknown> };
  const turns = vi.spyOn(service, "liveTurns").mockReturnValue(new Map([["c1", { root: "/repo", turnId: "t1", running: true }]]));
  onTestFinished(() => { turns.mockRestore(); });
  const publications = () => window().webContents.send.mock.calls.filter(([channel]) => channel === "conversation-work:changed").map(([, items]) => items as { touched: number }[]);
  const request = { v: 3, token: "t", root: "/repo", action: "update", path: ".doan/canvases/a.html", conversation: "c1", frame: "hero", note: "n" };
  state.conversationWork(request);
  state.conversationWork(request);
  expect(publications()).toHaveLength(1);
  vi.advanceTimersByTime(5);
  state.conversationWork(request);
  expect(publications()).toHaveLength(2);
  expect(publications()[1]?.[0]?.touched).toBe((publications()[0]?.[0]?.touched ?? 0) + 5);
});

// An app conversation's update is its own state and channel, never
// terminal work, and its turn's end clears it.
test("conversation work has its own channel, only for a running turn, and a turn's end clears it", () => {
  const state = mocks.startRuntime.mock.calls[0]?.[1] as { conversationWork(request: unknown): void } | undefined;
  if (!state) throw new Error("no runtime state");
  const service = mocks.conversationService as unknown as { liveTurns(): ReadonlyMap<string, unknown> };
  const turns = vi.spyOn(service, "liveTurns").mockReturnValue(new Map([["c1", { root: "/repo", turnId: "t1", running: true }], ["c2", { root: "/repo", turnId: "u1", running: false }]]));
  const publications = () => window().webContents.send.mock.calls.filter(([channel]) => channel === "conversation-work:changed").map(([, items]) => items);
  const path = ".doan/canvases/a.html";
  expect(invoke("conversation-work:get", window().webContents, null)).toEqual([]);
  state.conversationWork({ v: 3, token: "t", root: "/repo", action: "update", path, conversation: "c2", frame: "late" });
  state.conversationWork({ v: 3, token: "t", root: "/other", action: "update", path, conversation: "c1" });
  expect(publications()).toEqual([]);
  state.conversationWork({ v: 3, token: "t", root: "/repo", action: "update", path, conversation: "c1", frame: "hero", note: "n" });
  const expected = [{ conversationId: "c1", root: "/repo", path, frame: "hero", note: "n", touched: expect.any(Number), turnId: "t1" }];
  expect(publications()).toEqual([expected]);
  expect(invoke("conversation-work:get", window().webContents, null)).toEqual(expected);
  expect(invoke("conversation-work:get", {}, null)).toEqual([]);
  expect(invoke("conversation-work:get", window().webContents, {})).toEqual([]);
  expect(invoke("work:get", window().webContents, null)).toEqual([]);
  expect(window().webContents.send.mock.calls.some(([channel]) => channel === "work:changed")).toBe(false);
  mocks.workEnded?.("c2");
  expect(publications()).toHaveLength(1);
  mocks.workEnded?.("c1");
  expect(publications()).toEqual([expected, []]);
  expect(invoke("conversation-work:get", window().webContents, null)).toEqual([]);
  turns.mockRestore();
});

test("main exposes work only to its main frame and clears it on root removal", () => {
  const state = mocks.startRuntime.mock.calls[0]?.[1];
  if (typeof state !== "object" || state === null || !("work" in state) || typeof state.work !== "function") throw new Error("no work receiver");
  const changed = mocks.startShell.mock.calls[0]?.[2];
  if (typeof changed !== "function") throw new Error("no folder listener");
  mocks.shell.entries.mockReturnValue([{ path: "/repo", kind: "list" }]);
  changed([{ path: "/repo", kind: "list", canvases: [] }]);
  state.work({ v: 3, token: "t", root: "/repo", action: "start", path: ".doan/canvases/new.html" });
  const expected = [{ root: "/repo", path: ".doan/canvases/new.html", session: null, provider: null, touched: expect.any(Number), turn: expect.stringMatching(/^none:/) }];
  expect(invoke("work:get", window().webContents, null)).toEqual(expected);
  expect(window().webContents.send).toHaveBeenCalledWith("work:changed", expected);
  expect(invoke("work:get", {}, null)).toEqual([]);
  expect(invoke("work:get", window().webContents, {})).toEqual([]);
  changed([]);
  expect(invoke("work:get", window().webContents, null)).toEqual([]);
});

// ARCHITECTURE §4 'Auto-registration': the adopted root is in the work state before the start's work applies.
test("an adopted worktree takes the start's work at once", () => {
  const W = "/orca/workspaces/repo/w1";
  const state = mocks.startRuntime.mock.calls[0]?.[1] as { roots(): readonly string[]; adopt(root: string, view: unknown): void; work(request: unknown): void } | undefined;
  if (!state) throw new Error("no runtime state");
  const changed = mocks.startShell.mock.calls[0]?.[2];
  if (typeof changed !== "function") throw new Error("no folder listener");
  const before = [{ path: "/repo", kind: "list", canvases: [] }];
  mocks.shell.entries.mockReturnValue(before);
  changed(before);
  expect(state.roots()).toEqual(["/repo"]);
  const view = { kind: "list", root: W, scope: [".doan/canvases"], canvases: [], git: { common: "/repo/.git", worktrees: ["/repo", W] } };
  // The real shell publishes the list synchronously inside adopt.
  mocks.shell.adopt.mockImplementationOnce(() => {
    const after = [...before, { path: W, kind: "list", canvases: [], autoRegistered: true }];
    mocks.shell.entries.mockReturnValue(after);
    changed(after);
    return true;
  });
  state.adopt(W, view);
  expect(mocks.shell.adopt).toHaveBeenCalledExactlyOnceWith(W, view);
  state.work({ v: 3, token: "t", root: W, action: "start", path: ".doan/canvases/a.html" });
  expect(invoke("work:get", window().webContents, null)).toMatchObject([{ root: W, path: ".doan/canvases/a.html", session: null, provider: null }]);
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
    expect(invoke("work:get", window().webContents, null)).toMatchObject([{ root: "/repo", path, session: null, provider: null }]);
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

// `onboarding start` keeps Doan behind the app in use and shows the window on activation.
describe("background onboarding launch and start", () => {
  // Relaunches main with the CLI's background flag in argv (or without it) and the given activation at window creation.
  async function launch({ background, active }: { background: boolean; active: boolean }) {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.app.removeAllListeners();
    mocks.Window.instances.length = 0;
    mocks.ipc.clear();
    mocks.app.isActive.mockReturnValue(active);
    const argv = process.argv;
    process.argv = background ? [...argv, "--doan-launch=background"] : argv;
    try {
      await import("./index");
      await vi.waitFor(() => expect(mocks.Window.instances).toHaveLength(1));
    } finally { process.argv = argv; }
  }
  async function start() {
    const state = mocks.startRuntime.mock.calls[0]?.[1];
    if (typeof state !== "object" || state === null || !("onboarding" in state) || typeof state.onboarding !== "function") throw new Error("no onboarding receiver");
    return await state.onboarding({ v: 2, token: "t", op: "start" }) as { ok: boolean };
  }
  const visibleSent = () => vi.mocked(window().webContents.send).mock.calls.filter(([channel]) => channel === "window:visible").map(([, value]) => value);
  const hideApp = () => mocks.notifications.get("NSApplicationDidHideNotification")?.();

  test("a background launch behind another app creates the window hidden and tells the renderer", async () => {
    await launch({ background: true, active: false });
    expect(window().options.show).toBe(false);
    expect(window().show).not.toHaveBeenCalled();
    expect(mocks.app.show).not.toHaveBeenCalled();
    expect(mocks.app.dock.bounce).not.toHaveBeenCalled();
    expect(await invoke("window:visible", window().webContents, null)).toEqual({ visible: false });
    expect(mocks.thumbnails.pause).toHaveBeenCalled();
    expect(mocks.thumbnails.resume).not.toHaveBeenCalled();
  });

  test("a background launch that became active during startup shows the window at once", async () => {
    await launch({ background: true, active: true });
    expect(window().options.show).not.toBe(false);
    expect(await invoke("window:visible", window().webContents, null)).toEqual({ visible: true });
  });

  test("a launch without the flag shows the window even when another app is in front", async () => {
    await launch({ background: false, active: false });
    expect(window().options.show).not.toBe(false);
    expect(await invoke("window:visible", window().webContents, null)).toEqual({ visible: true });
  });

  test("activation shows the waiting window once and ends the wait", async () => {
    await launch({ background: true, active: false });
    mocks.app.isActive.mockReturnValue(true);
    mocks.app.emit("did-become-active");
    expect(window().show).toHaveBeenCalledOnce();
    expect(await invoke("window:visible", window().webContents, null)).toEqual({ visible: true });
    expect(visibleSent().at(-1)).toEqual({ visible: true });
    expect(mocks.thumbnails.resume).toHaveBeenCalled();
    mocks.app.emit("did-resign-active");
    mocks.app.emit("did-become-active");
    expect(window().show).toHaveBeenCalledOnce();
  });

  test("activation without a wait leaves a closed window closed", async () => {
    await launch({ background: false, active: true });
    window().emit("close", { preventDefault: vi.fn() });
    mocks.app.emit("did-become-active");
    expect(window().show).not.toHaveBeenCalled();
  });

  test("the start after a background launch bounces once without showing; a second start does not bounce", async () => {
    await launch({ background: true, active: false });
    expect((await start()).ok).toBe(true);
    expect(mocks.app.dock.bounce).toHaveBeenCalledExactlyOnceWith("informational");
    expect(window().show).not.toHaveBeenCalled();
    expect(mocks.app.show).not.toHaveBeenCalled();
    await start();
    expect(mocks.app.dock.bounce).toHaveBeenCalledOnce();
    mocks.app.isActive.mockReturnValue(true);
    mocks.app.emit("did-become-active");
    expect(window().show).toHaveBeenCalledOnce();
  });

  test("an inactive start with a closed window waits and bounces; the window shows on activation", async () => {
    await launch({ background: false, active: true });
    window().emit("close", { preventDefault: vi.fn() });
    mocks.app.isActive.mockReturnValue(false);
    await start();
    expect(window().show).not.toHaveBeenCalled();
    expect(mocks.app.show).not.toHaveBeenCalled();
    expect(mocks.app.dock.bounce).toHaveBeenCalledExactlyOnceWith("informational");
    mocks.app.isActive.mockReturnValue(true);
    mocks.app.emit("did-become-active");
    expect(window().show).toHaveBeenCalledOnce();
  });

  test("an inactive start with a minimized window does not restore it until activation", async () => {
    await launch({ background: false, active: true });
    window().isMinimized.mockReturnValue(true);
    mocks.app.isActive.mockReturnValue(false);
    await start();
    expect(window().restore).not.toHaveBeenCalled();
    expect(window().show).not.toHaveBeenCalled();
    expect(mocks.app.dock.bounce).toHaveBeenCalledOnce();
    mocks.app.isActive.mockReturnValue(true);
    mocks.app.emit("did-become-active");
    expect(window().restore).toHaveBeenCalledOnce();
    expect(window().show).toHaveBeenCalledOnce();
  });

  test("an inactive start while the whole app is hidden does not unhide it until activation", async () => {
    await launch({ background: false, active: true });
    hideApp();
    mocks.app.isActive.mockReturnValue(false);
    await start();
    expect(mocks.app.show).not.toHaveBeenCalled();
    expect(window().show).not.toHaveBeenCalled();
    expect(mocks.app.dock.bounce).toHaveBeenCalledOnce();
    mocks.app.isActive.mockReturnValue(true);
    mocks.app.emit("did-become-active");
    expect(mocks.app.show).toHaveBeenCalledOnce();
    expect(window().show).toHaveBeenCalledOnce();
  });

  test("an inactive start with a visible window bounces and does not raise it", async () => {
    await launch({ background: false, active: false });
    await start();
    expect(window().show).not.toHaveBeenCalled();
    expect(mocks.app.dock.bounce).toHaveBeenCalledOnce();
    await start();
    expect(mocks.app.dock.bounce).toHaveBeenCalledTimes(2);
    mocks.app.isActive.mockReturnValue(true);
    mocks.app.emit("did-become-active");
    expect(window().show).not.toHaveBeenCalled();
  });

  test("an active start shows a closed or minimized window, unhides the app and does not bounce", async () => {
    await launch({ background: false, active: true });
    window().emit("close", { preventDefault: vi.fn() });
    hideApp();
    window().isMinimized.mockReturnValue(true);
    await start();
    expect(mocks.app.show).toHaveBeenCalledOnce();
    expect(window().restore).toHaveBeenCalledOnce();
    expect(window().show).toHaveBeenCalledOnce();
    expect(mocks.app.dock.bounce).not.toHaveBeenCalled();
  });

  test.each([
    ["activate", () => { mocks.app.isActive.mockReturnValue(true); mocks.app.emit("activate"); }],
    ["second-instance", () => mocks.app.emit("second-instance")],
    ["Add Project…", () => Reflect.apply(item("Add Project…").click ?? (() => { throw new Error("no click handler"); }), undefined, [])],
  ])("showing the window through %s ends the wait, so a later activation does not show it again", async (_name, reveal) => {
    await launch({ background: true, active: false });
    reveal();
    expect(window().show).toHaveBeenCalledOnce();
    window().emit("close", { preventDefault: vi.fn() });
    mocks.app.isActive.mockReturnValue(true);
    mocks.app.emit("did-become-active");
    expect(window().show).toHaveBeenCalledOnce();
  });

  test("a start while a fullscreen close is still pending waits, bounces once and shows on activation", async () => {
    await launch({ background: false, active: true });
    window().isFullScreen.mockReturnValue(true);
    window().emit("close", { preventDefault: vi.fn() });
    expect(window().setFullScreen).toHaveBeenCalledExactlyOnceWith(false);
    mocks.app.isActive.mockReturnValue(false);
    await start();
    expect(mocks.app.dock.bounce).toHaveBeenCalledExactlyOnceWith("informational");
    expect(window().show).not.toHaveBeenCalled();
    window().isFullScreen.mockReturnValue(false);
    window().emit("leave-full-screen");
    expect(window().hide).toHaveBeenCalledOnce();
    await start();
    expect(mocks.app.dock.bounce).toHaveBeenCalledOnce();
    mocks.app.isActive.mockReturnValue(true);
    mocks.app.emit("did-become-active");
    expect(window().show).toHaveBeenCalledOnce();
  });

  // `open -g` to a running app sends a reopen, which Electron delivers as `activate` without activating Doan.
  test("an activate while another app is in front keeps the wait and leaves the window hidden", async () => {
    await launch({ background: true, active: false });
    mocks.app.emit("activate");
    expect(window().show).not.toHaveBeenCalled();
    expect(mocks.app.show).not.toHaveBeenCalled();
    expect(await invoke("window:visible", window().webContents, null)).toEqual({ visible: false });
    mocks.app.isActive.mockReturnValue(true);
    mocks.app.emit("did-become-active");
    expect(window().show).toHaveBeenCalledOnce();
  });

  test("an activate while another app is in front leaves a closed window closed; an active one shows it", async () => {
    await launch({ background: false, active: true });
    window().emit("close", { preventDefault: vi.fn() });
    mocks.app.isActive.mockReturnValue(false);
    mocks.app.emit("activate");
    expect(window().show).not.toHaveBeenCalled();
    mocks.app.isActive.mockReturnValue(true);
    mocks.app.emit("activate");
    expect(window().show).toHaveBeenCalledOnce();
  });

  test("a Dock click (did-become-active, then activate) restores a waiting minimized window once and ends the wait", async () => {
    await launch({ background: true, active: false });
    window().isMinimized.mockReturnValue(true);
    mocks.app.isActive.mockReturnValue(true);
    mocks.app.emit("did-become-active");
    window().isMinimized.mockReturnValue(false);
    mocks.app.emit("activate");
    expect(window().restore).toHaveBeenCalledOnce();
    expect(window().show).toHaveBeenCalled();
    expect(await invoke("window:visible", window().webContents, null)).toEqual({ visible: true });
    window().emit("close", { preventDefault: vi.fn() });
    const shows = window().show.mock.calls.length;
    mocks.app.emit("did-become-active");
    expect(window().show).toHaveBeenCalledTimes(shows);
  });

  // A variable, not a literal: the mock's entry type has no canvases.
  const listed = [{ path: "/repo", kind: "list", canvases: [{ path: ".doan/canvases/a.html" }] }];
  test.each([
    ["doan open", async () => {
      mocks.shell.entries.mockReturnValue(listed);
      await invoke("deep-link:ready", window().webContents, null);
      const state = mocks.startRuntime.mock.calls[0]?.[1];
      if (typeof state !== "object" || state === null || !("open" in state) || typeof state.open !== "function") throw new Error("no open receiver");
      const opening = state.open({ v: 4, token: "t", root: "/repo", path: ".doan/canvases/a.html" }) as Promise<{ ok: boolean }>;
      const asked = window().webContents.send.mock.calls.find(([channel]) => channel === "doan-open:request")?.[1] as { id: string } | undefined;
      if (!asked) throw new Error("no doan-open request");
      await invoke("doan-open:answer", window().webContents, null, { id: asked.id, kind: "opened", frame: "none" });
      expect((await opening).ok).toBe(true);
    }],
    ["a doan:// link", async () => {
      mocks.shell.entries.mockReturnValue(listed);
      await invoke("deep-link:ready", window().webContents, null);
      mocks.app.emit("open-url", { preventDefault: vi.fn() }, "doan://open?root=%2Frepo&canvas=.doan%2Fcanvases%2Fa.html");
    }],
    ["a notification click", async () => {
      void invoke("notifications:test", window().webContents, null);
      await vi.waitFor(() => expect(mocks.Notification.instances).toHaveLength(1));
      mocks.Notification.instances[0]!.emit("click");
    }],
  ])("%s shows the window and ends the wait", async (_name, reveal) => {
    await launch({ background: true, active: false });
    await reveal();
    expect(window().show).toHaveBeenCalled();
    window().emit("close", { preventDefault: vi.fn() });
    const shows = window().show.mock.calls.length;
    mocks.app.isActive.mockReturnValue(true);
    mocks.app.emit("did-become-active");
    expect(window().show).toHaveBeenCalledTimes(shows);
  });

  test("activation after quit does not touch the destroyed window", async () => {
    await launch({ background: true, active: false });
    mocks.app.emit("before-quit", { preventDefault: vi.fn() });
    await new Promise<void>(resolve => setImmediate(resolve));
    window().destroyed = true;
    mocks.app.isActive.mockReturnValue(true);
    expect(() => mocks.app.emit("did-become-active")).not.toThrow();
    expect(window().show).not.toHaveBeenCalled();
  });
});

// The usage read answers the window's entries; a frame that is not the window gets an empty list.
test("answers agent-usage:read with entries for the window and an empty list for anyone else", async () => {
  const contents = window().webContents;
  const entries = await invoke("agent-usage:read", contents, null, undefined);
  expect(Array.isArray(entries)).toBe(true);
  expect(await invoke("agent-usage:read", contents, {}, { trigger: "refresh" })).toEqual([]);
  expect(await invoke("agent-usage:read", {}, null, undefined)).toEqual([]);
  expect(await invoke("agent-usage:read", contents, null, { trigger: "start" })).toEqual([]);
});

// Decision 17: blocked providers stay hidden only until the first tool-facts probe ends, whichever way it ends.
describe("the usage start trigger", () => {
  const started = () => usageProbe.triggers.filter(trigger => (trigger as { kind: string }).kind === "start");
  test.each([
    ["resolves", () => Promise.resolve({})],
    ["rejects", () => Promise.reject(new Error("probe failed"))],
  ])("comes once the tool probe %s", async (_name, read) => {
    // The file-wide beforeEach already launched once with a real probe; relaunch with this one.
    usageProbe.read = read;
    usageProbe.triggers.length = 0;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await vi.resetModules();
    mocks.Window.instances.length = 0;
    mocks.ipc.clear();
    await import("./index");
    await vi.waitFor(() => expect(started()).toHaveLength(1));
    error.mockRestore();
  });
});

test("Check for Updates… sits under About Doan and waits for first run like Settings…", () => {
  expect(item("Check for Updates…").enabled).toBe(false);
});

// The update service (ARCHITECTURE §7): eligibility from agent setup and the bundle's feed file; checks, the menu item,
// the IPC channels and Restart to Update, which installs only after main's own quit has saved and flushed.
describe("app updates", () => {
  const SNAPSHOT_GATE = { kind: "allowed" };
  const updater = () => { const found = mocks.Updater.instances[0]; if (!found) throw new Error("no updater"); return found; };
  const snapshot = async () => await invoke("update:get", window().webContents, null) as { state: unknown; gate: unknown; autoCheck: boolean; eligibility: unknown; version: string };
  // The launch check finds 0.2.0, downloads it and Squirrel.Mac stages it.
  function readyUpdate() {
    updater().emit("update-available", { version: "0.2.0" });
    updater().emit("update-downloaded", { version: "0.2.0" });
    mocks.nativeUpdater.emit("update-downloaded");
  }
  const quitTurn = () => new Promise<void>(resolve => setImmediate(resolve));

  describe("in a copy that updates", () => {
    beforeAll(() => { launchCompletion = COMPLETE; launchEligibility = "eligible"; launchFeed = true; });
    afterAll(() => { launchCompletion = { kind: "missing" }; launchEligibility = "dev"; launchFeed = false; });
    beforeEach(async () => { await vi.waitFor(() => expect(mocks.Updater.instances).toHaveLength(1)); });

    test("the updater starts after the window from agent setup's eligibility and the bundle's feed, and checks at launch", async () => {
      expect(mocks.setupEligibility).toHaveBeenCalledWith({ home: process.env.HOME, resources: process.resourcesPath, isPackaged: true });
      expect(mocks.hasFeedConfig).toHaveBeenCalledWith(process.resourcesPath);
      expect(updater()).toMatchObject({ autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: false });
      expect(updater().checkForUpdates).toHaveBeenCalledOnce();
      expect(await snapshot()).toEqual({ version: "9.8.7", state: { kind: "checking", manual: false, last: { kind: "idle" } }, eligibility: { kind: "enabled" }, gate: SNAPSHOT_GATE, autoCheck: true, lastCheckedAt: null });
    });

    test("each change reaches the renderer as update:state", async () => {
      updater().emit("update-available", { version: "0.2.0" });
      expect(window().webContents.send).toHaveBeenLastCalledWith("update:state", expect.objectContaining({ state: { kind: "downloading", version: "0.2.0", percent: 0 } }));
      expect((await snapshot()).state).toEqual({ kind: "downloading", version: "0.2.0", percent: 0 });
    });

    test("update channels answer the main window's main frame only", async () => {
      const other = new mocks.Window({ show: false }).webContents;
      readyUpdate();
      for (const channel of ["update:get", "update:check", "update:install", "update:openNotes"]) {
        const refused = await invoke(channel, {}, null);
        expect(await invoke(channel, other, null), channel).toEqual(refused);
        expect(await invoke(channel, window().webContents, {}), channel).toEqual(refused);
        expect(await invoke(channel, window().webContents, null, "forged"), channel).toEqual(refused);
      }
      expect(mocks.app.quit).not.toHaveBeenCalled();
      expect(mocks.electronShell.openExternal).not.toHaveBeenCalled();
      expect(updater().checkForUpdates).toHaveBeenCalledOnce();
    });

    test("update:check is a manual check", async () => {
      updater().emit("update-not-available", { version: "9.8.7" });
      await invoke("update:check", window().webContents, null);
      expect(updater().checkForUpdates).toHaveBeenCalledTimes(2);
      expect((await snapshot()).state).toMatchObject({ kind: "checking", manual: true });
    });

    test("Release Notes opens the ready version's release page and nothing without one", async () => {
      expect(await invoke("update:openNotes", window().webContents, null)).toBe(false);
      readyUpdate();
      expect(await invoke("update:openNotes", window().webContents, null)).toBe(true);
      expect(mocks.electronShell.openExternal).toHaveBeenCalledExactlyOnceWith("https://github.com/SinhyeokKang/doan-design/releases/tag/v0.2.0");
      mocks.electronShell.openExternal.mockRejectedValueOnce(new Error("no handler"));
      expect(await invoke("update:openNotes", window().webContents, null)).toBe(false);
    });

    test("turning automatic checks off in Settings reaches the service", async () => {
      const off = { ...DEFAULTS, updates: { autoCheck: false } };
      mocks.preferences.update.mockResolvedValueOnce({ ok: true, snapshot: { preferences: off, notice: null } });
      mocks.preferences.current.mockReturnValue(off);
      await invoke("preferences:write", window().webContents, null, { updates: { autoCheck: false } });
      expect((await snapshot()).autoCheck).toBe(false);
    });

    test("Copy details carries the update line", async () => {
      mocks.runDesignSkill.mockResolvedValue({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: true, result: { version: "1.2.3", presets: [] } }) });
      readyUpdate();
      expect(await invoke("about:copy", window().webContents, null)).toEqual({ kind: "success" });
      expect(mocks.clipboard.writeText.mock.calls.at(-1)?.[0]).toMatch(/^Doan 9\.8\.7\nUpdates: 0\.2\.0 ready, last checked \d{4}-\d\d-\d\dT[\d:.]+Z\n/);
    });

    // Install happens only after the conversations are saved and the debounced state is flushed (POSTMORTEM
    // 2026-10-25 'A crash during quit teardown lost the debounced ui-state').
    test("Restart to Update quits through main's own quit and installs only after the flush", async () => {
      readyUpdate();
      expect(await invoke("update:install", window().webContents, null)).toEqual({ kind: "allowed" });
      expect(mocks.app.quit).toHaveBeenCalledOnce();
      expect(updater().quitAndInstall).not.toHaveBeenCalled();
      mocks.app.emit("before-quit", { preventDefault: vi.fn() });
      await quitTurn();
      await vi.waitFor(() => expect(updater().quitAndInstall).toHaveBeenCalledOnce());
      const install = updater().quitAndInstall.mock.invocationCallOrder[0]!;
      for (const step of [mocks.uiState.flushSync, mocks.canvasSeenFlushSync, mocks.thumbnails.dispose]) expect(step.mock.invocationCallOrder[0]).toBeLessThan(install);
      // The quit that installs is the updater's, not a second plain one.
      expect(mocks.app.quit).toHaveBeenCalledOnce();
      // quitting is set, so the window closing for the install is not turned into a hide.
      const close = { preventDefault: vi.fn() };
      window().emit("close", close);
      expect(close.preventDefault).not.toHaveBeenCalled();
    });

    test("a quit a conversation's save cancelled installs nothing and stops the restart", async () => {
      readyUpdate();
      const service = mocks.conversationService as unknown as { quit(): Promise<void> };
      vi.spyOn(service, "quit").mockRejectedValueOnce(new Error("EIO"));
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      onTestFinished(() => { log.mockRestore(); });
      await invoke("update:install", window().webContents, null);
      mocks.app.emit("before-quit", { preventDefault: vi.fn() });
      await quitTurn();
      await vi.waitFor(() => expect(log).toHaveBeenCalledWith("doan: conversation persistence failed during quit", expect.any(Error)));
      expect(updater().quitAndInstall).not.toHaveBeenCalled();
      expect(mocks.uiState.flushSync).not.toHaveBeenCalled();
      expect((await snapshot()).state).toEqual({ kind: "restartAborted", version: "0.2.0" });
      expect(mocks.app.quit).toHaveBeenCalledOnce();
    });

    // A downloaded update installs on any quit (autoInstallOnAppQuit), so a plain quit stays a plain quit.
    test("a plain quit with an update ready quits as before", async () => {
      readyUpdate();
      mocks.app.emit("before-quit", { preventDefault: vi.fn() });
      await quitTurn();
      await vi.waitFor(() => expect(mocks.app.quit).toHaveBeenCalledOnce());
      expect(updater().quitAndInstall).not.toHaveBeenCalled();
    });

    // Only a conversation holds the restart back (quitting would stop its turn or drop the answer it waits for), and
    // main asks again at the press.
    test("a running turn or an answer it waits for blocks the press; nothing quits", async () => {
      readyUpdate();
      const service = mocks.conversationService as unknown as { restartHolds(): { liveTurns: number; pendingAnswers: number } };
      const holds = vi.spyOn(service, "restartHolds").mockReturnValue({ liveTurns: 0, pendingAnswers: 1 });
      expect(await invoke("update:install", window().webContents, null)).toEqual({ kind: "blocked", reason: "conversation" });
      holds.mockReturnValue({ liveTurns: 1, pendingAnswers: 0 });
      expect(await invoke("update:install", window().webContents, null)).toEqual({ kind: "blocked", reason: "conversation" });
      expect(mocks.app.quit).not.toHaveBeenCalled();
      expect((await snapshot()).state).toEqual({ kind: "ready", version: "0.2.0" });
    });

    // The conversation service calls both before it finishes applying the change, so main reads the gate after.
    test.each(["a conversation event", "the end of a turn's work"])("%s reads the gate again once the change is applied, and publishes it when it changed", async which => {
      readyUpdate();
      const service = mocks.conversationService as unknown as { restartHolds(): { liveTurns: number; pendingAnswers: number } };
      vi.spyOn(service, "restartHolds").mockReturnValue({ liveTurns: 1, pendingAnswers: 0 });
      window().webContents.send.mockClear();
      if (which === "a conversation event") mocks.publishConversation?.({ v: 1, conversationId: "c1", seq: 1, turnId: "t1", at: "2026-11-08T10:00:00.000Z", type: "turn.started" });
      else mocks.workEnded?.("c1");
      expect(window().webContents.send).not.toHaveBeenCalledWith("update:state", expect.anything());
      await Promise.resolve();
      expect(window().webContents.send).toHaveBeenCalledWith("update:state", expect.objectContaining({ gate: { kind: "blocked", reason: "conversation" } }));
    });

    describe("the Doan menu item", () => {
      test("Check for Updates… opens About and checks", async () => {
        updater().emit("update-not-available", { version: "9.8.7" });
        click("Check for Updates…");
        expect(window().show).toHaveBeenCalled();
        expect(window().webContents.send).toHaveBeenCalledWith("settings-page:open", { section: "about" });
        expect(updater().checkForUpdates).toHaveBeenCalledTimes(2);
        expect((await snapshot()).state).toMatchObject({ kind: "checking", manual: true });
      });

      test("reads Restart to Update once an update is ready, and restarts", () => {
        readyUpdate();
        expect(() => item("Check for Updates…")).toThrow();
        expect(item("Restart to Update").enabled).toBe(true);
        click("Restart to Update");
        expect(mocks.app.quit).toHaveBeenCalledOnce();
        expect(item("Restart to Update").enabled).toBe(false);
      });

      test("a blocked press shows the window and asks the renderer for the header popover", () => {
        readyUpdate();
        const service = mocks.conversationService as unknown as { restartHolds(): { liveTurns: number; pendingAnswers: number } };
        vi.spyOn(service, "restartHolds").mockReturnValue({ liveTurns: 1, pendingAnswers: 0 });
        window().emit("close", { preventDefault: vi.fn() });
        click("Restart to Update");
        expect(mocks.app.quit).not.toHaveBeenCalled();
        expect(window().show).toHaveBeenCalled();
        expect(window().webContents.send).toHaveBeenLastCalledWith("update:popover");
      });

      test("is disabled behind a modal and on a locked page", async () => {
        await invoke("menu:state", window().webContents, null, { screen: "home", modal: true });
        expect(item("Check for Updates…").enabled).toBe(false);
        await invoke("menu:state", window().webContents, null, { screen: "settings", modal: false, locked: true });
        expect(item("Check for Updates…").enabled).toBe(false);
      });
    });
  });

  describe("in a copy that doesn't update", () => {
    beforeAll(() => { launchCompletion = COMPLETE; launchEligibility = "outside-applications"; launchFeed = true; });
    afterAll(() => { launchCompletion = { kind: "missing" }; launchEligibility = "dev"; launchFeed = false; });

    test("no updater is made, nothing checks, and the menu item only opens About", async () => {
      await vi.waitFor(() => expect(mocks.setupEligibility).toHaveBeenCalled());
      expect(mocks.Updater.instances).toHaveLength(0);
      expect(await snapshot()).toMatchObject({ eligibility: { kind: "disabled", reason: "outside-applications" }, state: { kind: "idle" } });
      click("Check for Updates…");
      expect(window().webContents.send).toHaveBeenCalledWith("settings-page:open", { section: "about" });
      expect(mocks.Updater.instances).toHaveLength(0);
      expect(await invoke("update:install", window().webContents, null)).toBeNull();
      expect(mocks.app.quit).not.toHaveBeenCalled();
    });
  });
});
