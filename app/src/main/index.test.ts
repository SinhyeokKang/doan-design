import { beforeEach, expect, test, vi } from "vitest";
import type { BrowserWindowConstructorOptions, MenuItemConstructorOptions } from "electron";

const mocks = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  class Window extends EventEmitter {
    static instances: Window[] = [];
    destroyed = false;
    contentsDestroyed = false;
    webContents = Object.assign(new EventEmitter(), { send: vi.fn(), isDestroyed: () => this.contentsDestroyed, debugger: { name: "debugger" } });
    show = vi.fn();
    hide = vi.fn();
    isFullScreen = vi.fn(() => false);
    setFullScreen = vi.fn();
    close = vi.fn();
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
    app: Object.assign(new EventEmitter(), { setName: vi.fn(), whenReady: vi.fn<() => Promise<void>>(), isPackaged: true, getPath: () => "/tmp/doan-index-test", exit: vi.fn(), quit: vi.fn(), requestSingleInstanceLock: vi.fn(() => true) }),
    ipc: new Map<string, (...args: unknown[]) => unknown>(),
    shell: { tokenBase: "http://127.0.0.1:1/t/tok/", entries: vi.fn<() => { path: string; kind?: string }[]>(() => []), open: vi.fn<() => Promise<{ root: string } | { refused: string }>>(), close: vi.fn(), reopen: vi.fn(), initialize: vi.fn(), epoch: vi.fn(), dispose: vi.fn() },
    startShell: vi.fn(),
    cliCommand: vi.fn(() => "/bundled/doan"),
    runtime: { socket: "/tmp/doan-x/app.sock", token: "t", file: "/tmp/doan-index-test/runtime.json", disposeSync: vi.fn() },
    startRuntime: vi.fn(),
    sessionOn: vi.fn(),
    inspector: { inspect: vi.fn() },
    createInspector: vi.fn(),
    mkdir: vi.fn(),
    machine: { read: vi.fn(), run: vi.fn(), answer: vi.fn(), cancelConfirmation: vi.fn(), isBusy: vi.fn(() => false) },
    needsOnboarding: vi.fn(), markClosed: vi.fn(), clipboard: { writeText: vi.fn() },
    menu: vi.fn<(template: MenuItemConstructorOptions[]) => unknown>(),
    dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
  };
});

vi.mock("electron", () => ({
  clipboard: mocks.clipboard, app: mocks.app, BrowserWindow: mocks.Window,
  dialog: mocks.dialog,
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => mocks.ipc.set(channel, handler) },
  Menu: { buildFromTemplate: mocks.menu, setApplicationMenu: vi.fn() },
  session: { defaultSession: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn(), on: mocks.sessionOn } },
  webFrameMain: { fromId: vi.fn() },
}));
vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdir }));
vi.mock("./onboarding/machine", () => ({ createMachine: () => mocks.machine, needsOnboarding: mocks.needsOnboarding, markClosed: mocks.markClosed, PATH_LINE: 'export PATH="$HOME/.local/bin:$PATH"' }));
vi.mock("./cli", () => ({ cliCommand: mocks.cliCommand }));
vi.mock("./shell", () => ({ startShell: mocks.startShell }));
vi.mock("./runtime", () => ({ startRuntime: mocks.startRuntime }));
vi.mock("./inspector", async (importOriginal) => ({ ...await importOriginal<typeof import("./inspector")>(), createInspector: mocks.createInspector }));

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.app.removeAllListeners();
  mocks.Window.instances.length = 0;
  mocks.ipc.clear();
  mocks.needsOnboarding.mockResolvedValue(true);
  mocks.markClosed.mockResolvedValue(undefined);
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
function item(label: string): MenuItemConstructorOptions {
  const template = mocks.menu.mock.calls[0]?.[0] ?? [];
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
  expect(item("Open Project…").accelerator).toBe("CmdOrCtrl+O");
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

test("File menu opens the project picker and closes the window", async () => {
  const open = item("Open Project…").click;
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

test("clears the selection when its project closes", async () => {
  mocks.shell.entries.mockReturnValue([{ path: ROOT }, { path: "/Users/sam/code/other" }]);
  const contents = window().webContents;
  await invoke("selection:set", contents, null, SELECTION);
  await invoke("folders:close", contents, null, "/Users/sam/code/other");
  expect(runtimeState().selection()).toEqual(SELECTION);
  await invoke("folders:close", contents, null, ROOT);
  expect(mocks.shell.close).toHaveBeenCalledWith(ROOT);
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


test("onboarding opens initially, menu reopens without a shortcut and shows the hidden window", async () => {
  const contents = window().webContents;
  const first = await invoke("onboarding:get-open", contents, null);
  expect(first).toEqual({ session: expect.any(String) });
  const setup = item("Set Up doan…"); expect(setup.accelerator).toBeUndefined();
  const menu = mocks.menu.mock.calls[0]?.[0][0];
  expect(Array.isArray(menu?.submenu) && menu.submenu.slice(0, 2).map(i => i.role ?? i.label)).toEqual(["about", "Set Up doan…"]);
  Reflect.apply(setup.click!, undefined, []);
  expect(window().show).toHaveBeenCalled();
  expect(await invoke("onboarding:get-open", contents, null)).not.toEqual(first);
  expect(mocks.markClosed).not.toHaveBeenCalled();
});
test("stale wizard read cannot publish after reopening and rejects iframe callers", async () => {
  const contents = window().webContents;
  const opened = await invoke("onboarding:get-open", contents, null) as { session: string };
  let finish!: (value: unknown) => void;
  mocks.machine.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const waiting = invoke("onboarding:read", contents, null, { session: opened.session, requestId: "r" });
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
