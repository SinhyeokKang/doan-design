import { EventEmitter } from "node:events";
import { beforeEach, expect, test, vi } from "vitest";
import type { FolderEntry } from "./view";

// Enough of Electron for the window's lifecycle: the window and its webContents are emitters, destroy() emits
// `closed` as Electron does.
const created: FakeWindow[] = [];
class FakeWindow extends EventEmitter {
  destroyed = false;
  shown = true;
  minimized = false;
  webContents = Object.assign(new EventEmitter(), {
    debugger: Object.assign(new EventEmitter(), { attach: vi.fn(), sendCommand: vi.fn(async () => ({})) }),
    send: vi.fn(),
    isDestroyed: () => this.destroyed,
    getOSProcessId: () => 1,
    mainFrame: { frames: [] },
  });
  constructor() { super(); created.push(this); }
  isDestroyed() { return this.destroyed; }
  destroy() { if (this.destroyed) return; this.destroyed = true; this.emit("closed"); }
  close() { this.emit("close"); this.destroy(); }
  bounds = { x: 0, y: 0, width: 406, height: 908 };
  minimum: [number, number] = [0, 0];
  setContentBounds(bounds: { x: number; y: number; width: number; height: number }) { this.bounds = bounds; }
  getContentBounds() { return this.bounds; }
  setMinimumSize(width: number, height: number) { this.minimum = [width, height]; }
  getBounds() { return this.getContentBounds(); }
  loadFile = vi.fn(async () => {});
  loadURL = vi.fn(async () => {});
  show() { order.push("window.show"); }
  focus() { order.push("window.focus"); }
  isMinimized() { return this.minimized; }
  isVisible() { return this.shown; }
}
const order: string[] = [];
vi.mock("electron", () => ({
  app: { isPackaged: true, show: () => order.push("app.show") },
  Menu: { buildFromTemplate: (template: unknown[]) => ({ popup: () => order.push(`menu ${template.length}`) }) },
  BrowserWindow: FakeWindow,
  screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1600, height: 1000 } }), getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1600, height: 1000 } }) },
  session: { fromPartition: () => ({}) },
  webFrameMain: { fromId: () => undefined },
}));

const proto = { path: ".doan/canvases/proto.html", url: "http://127.0.0.1:5123/t/tok/k1/.doan/canvases/proto.html", id: "proto" };
const entries: FolderEntry[] = [{ path: "/r", kind: "list", canvases: [proto], servedRev: 0 }];
const play = { root: "/r", path: proto.path, frame: "phone", mark: "390x844" };

beforeEach(() => { created.length = 0; order.length = 0; vi.resetModules(); });

async function opened() {
  const { createPrototypeWindow } = await import("./prototypeWindow");
  const closed = vi.fn();
  const focusChanged = vi.fn();
  const prototype = createPrototypeWindow({ entries: () => entries, mainWindow: () => undefined, closed, denyPermissions: vi.fn(), reread: vi.fn(), focusChanged, buddy: () => "puri" });
  prototype.controller.play("main", play);
  expect(created).toHaveLength(1);
  return { prototype, closed, focusChanged, window: created[0]! };
}

test("a host renderer that dies closes the window by the normal path", async () => {
  const { prototype, closed, window } = await opened();
  window.webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: 1 });
  expect(window.destroyed).toBe(true);
  expect(closed).toHaveBeenCalledTimes(1);
  // The state is closed: the next Play makes a new window instead of activating the dead one.
  prototype.controller.play("main", play);
  expect(created).toHaveLength(2);
});

test("a dead renderer of a window already replaced does not touch the new one", async () => {
  const { prototype, closed, window } = await opened();
  window.close();
  prototype.controller.play("main", play);
  window.webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: 1 });
  expect(created[1]!.destroyed).toBe(false);
  expect(closed).toHaveBeenCalledTimes(1);
});

// The menu follows these: the main window's items go off while the prototype window has focus and come back when it
// loses it or closes, before main hears prototype:closed.
test("focus, blur and close report focus changes in order", async () => {
  const { closed, focusChanged, window } = await opened();
  const order: string[] = [];
  focusChanged.mockImplementation((focused: boolean) => order.push(`focus:${focused}`));
  closed.mockImplementation(() => order.push("closed"));
  window.emit("focus");
  window.emit("blur");
  window.emit("focus");
  window.destroy();
  expect(order).toEqual(["focus:true", "focus:false", "focus:true", "focus:false", "closed"]);
});

test("a replaced window's late focus and blur are not reported", async () => {
  const { prototype, focusChanged, window } = await opened();
  window.close();
  prototype.controller.play("main", play);
  focusChanged.mockClear();
  window.emit("focus");
  window.emit("blur");
  expect(focusChanged).not.toHaveBeenCalled();
});

// `doan open --prototype` arrives while another app is in front or Doan is hidden (⌘H): a hidden app is shown first,
// since a window's show alone may not bring back a hidden app.
test("a play while the app is hidden shows the app before the window, for a new window and a raised one", async () => {
  const { createPrototypeWindow } = await import("./prototypeWindow");
  let hidden = true;
  const prototype = createPrototypeWindow({ entries: () => entries, mainWindow: () => undefined, closed: vi.fn(), denyPermissions: vi.fn(), reread: vi.fn(), appHidden: () => hidden, buddy: () => "puri" });
  const target = { root: "/r", canvas: { id: "proto" }, frame: "phone" };
  expect(prototype.controller.playFromCli({ target, size: { width: 390, height: 844 } })).toBe("played");
  expect(order).toEqual(["app.show", "window.show", "window.focus"]);
  order.length = 0;
  expect(prototype.controller.playFromCli({ target, size: { width: 390, height: 844 } })).toBe("activated");
  expect(order).toEqual(["app.show", "window.show", "window.focus"]);
  order.length = 0;
  hidden = false;
  prototype.controller.playFromCli({ target, size: { width: 390, height: 844 } });
  expect(order).toEqual(["window.show", "window.focus"]);
});

// The page's toast clock stops while the window is not shown natively; document.hidden misses a minimized window and a
// hidden app, so main pushes `prototype:visible` on each change, and answers the page's first read the same way.
test("the window's native visibility goes to its page on show, hide, minimize, restore and an app hide", async () => {
  const { createPrototypeWindow } = await import("./prototypeWindow");
  let hidden = false;
  const prototype = createPrototypeWindow({ entries: () => entries, mainWindow: () => undefined, closed: vi.fn(), denyPermissions: vi.fn(), reread: vi.fn(), appHidden: () => hidden, buddy: () => "puri" });
  prototype.controller.play("main", play);
  const window = created[0]!;
  const pushed = () => window.webContents.send.mock.calls.filter(call => call[0] === "prototype:visible").map(call => call[1]);
  expect(prototype.visible()).toBe(true);
  window.minimized = true; window.emit("minimize");
  window.minimized = false; window.emit("restore");
  window.shown = false; window.emit("hide");
  window.shown = true; window.emit("show");
  hidden = true; prototype.visibilityChanged();
  expect(prototype.visible()).toBe(false);
  hidden = false; prototype.visibilityChanged();
  expect(pushed()).toEqual([{ visible: false }, { visible: true }, { visible: false }, { visible: true }, { visible: false }, { visible: true }]);
});

test("the page gets the saved buddy in its query, as the main window's does", async () => {
  const { window } = await opened();
  expect(window.loadFile).toHaveBeenCalledWith(expect.stringContaining("prototype.html"), { query: { buddy: "puri" } });
});

test("opening the conversation panel widens a narrow window to 640 and keeps it there; closing leaves the size", async () => {
  const { prototype, window } = await opened();
  window.bounds = { x: 1400, y: 50, width: 406, height: 908 };
  prototype.controller.request("prototype:panel", "prototype", { open: true });
  // 1400 + 640 would leave the 1600 work area: moved left to 960.
  expect(window.bounds).toEqual({ x: 960, y: 50, width: 640, height: 908 });
  expect(window.minimum).toEqual([640, 0]);
  prototype.controller.request("prototype:panel", "prototype", { open: false });
  expect(window.bounds).toEqual({ x: 960, y: 50, width: 640, height: 908 });
  expect(window.minimum).toEqual([360, 0]);
});

test("the text edit menu opens for the window's own page", async () => {
  const { window } = await opened();
  window.webContents.emit("context-menu", {}, { isEditable: true, editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true }, selectionText: "", formControlType: "none", misspelledWord: "", dictionarySuggestions: [], frame: { parent: null }, x: 1, y: 1 });
  expect(order.some(entry => entry.startsWith("menu "))).toBe(true);
});
