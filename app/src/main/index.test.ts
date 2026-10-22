import { beforeEach, expect, test, vi } from "vitest";
import type { BrowserWindowConstructorOptions, MenuItemConstructorOptions } from "electron";

const mocks = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  class Window extends EventEmitter {
    static instances: Window[] = [];
    destroyed = false;
    contentsDestroyed = false;
    webContents = Object.assign(new EventEmitter(), { send: vi.fn(), isDestroyed: () => this.contentsDestroyed });
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
    app: Object.assign(new EventEmitter(), { setName: vi.fn(), whenReady: vi.fn<() => Promise<void>>(), getPath: () => "/tmp/doan-index-test", exit: vi.fn(), quit: vi.fn() }),
    ipc: new Map<string, (...args: unknown[]) => unknown>(),
    shell: { tokenBase: "http://127.0.0.1:1/t/tok/", entries: vi.fn(() => []), open: vi.fn<() => Promise<string | null>>(), close: vi.fn(), reopen: vi.fn(), dispose: vi.fn() },
    startShell: vi.fn(),
    mkdir: vi.fn(),
    menu: vi.fn<(template: MenuItemConstructorOptions[]) => unknown>(),
    dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
  };
});

vi.mock("electron", () => ({
  app: mocks.app, BrowserWindow: mocks.Window,
  dialog: mocks.dialog,
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => mocks.ipc.set(channel, handler) },
  Menu: { buildFromTemplate: mocks.menu, setApplicationMenu: vi.fn() },
  session: { defaultSession: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(), setDevicePermissionHandler: vi.fn() } },
  webFrameMain: { fromId: vi.fn() },
}));
vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdir }));
vi.mock("./shell", () => ({ startShell: mocks.startShell }));

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.app.removeAllListeners();
  mocks.Window.instances.length = 0;
  mocks.ipc.clear();
  mocks.app.whenReady.mockResolvedValue();
  mocks.startShell.mockResolvedValue(mocks.shell);
  mocks.shell.open.mockResolvedValue(null);
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
  expect(window().options).toMatchObject({ width: 1238, height: 780, minWidth: 960, minHeight: 600, titleBarStyle: "hiddenInset" });
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
