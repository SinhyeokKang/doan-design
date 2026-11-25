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
    id: created.length + 1,
    debugger: Object.assign(new EventEmitter(), { attach: vi.fn(), sendCommand: vi.fn(async () => ({})) }),
    send: vi.fn(),
    isDestroyed: () => this.destroyed,
    getOSProcessId: () => 1,
    mainFrame: { frames: [] },
  });
  constructor(readonly options: { minWidth?: number; minHeight?: number; webPreferences?: { additionalArguments?: string[] } } = {}) { super(); created.push(this); }
  isDestroyed() { return this.destroyed; }
  destroy() { if (this.destroyed) return; this.destroyed = true; this.emit("closed"); }
  close() { this.emit("close"); this.destroy(); }
  bounds = { x: 0, y: 0, width: 406, height: 908 };
  minimum: [number, number] = [0, 0];
  // As macOS does: bounds smaller than the minimum keep the minimum's size, and a minimum alone resizes nothing.
  setContentBounds(bounds: { x: number; y: number; width: number; height: number }) { this.bounds = { ...bounds, width: Math.max(bounds.width, this.minimum[0]), height: Math.max(bounds.height, this.minimum[1]) }; }
  getContentBounds() { return this.bounds; }
  setMinimumSize(width: number, height: number) { this.minimum = [width, height]; order.push(`minimum ${width}`); }
  getMinimumSize() { return this.minimum; }
  getBounds() { return this.getContentBounds(); }
  loadFile = vi.fn(async () => {});
  loadURL = vi.fn(async () => {});
  show() { order.push("window.show"); }
  focus() { order.push("window.focus"); }
  isMinimized() { return this.minimized; }
  isVisible() { return this.shown; }
}
const order: string[] = [];
let workArea = { x: 0, y: 0, width: 1600, height: 1000 };
vi.mock("electron", () => ({
  app: { isPackaged: true, show: () => order.push("app.show") },
  Menu: { buildFromTemplate: (template: unknown[]) => ({ popup: () => order.push(`menu ${template.length}`) }) },
  BrowserWindow: FakeWindow,
  screen: { getDisplayMatching: () => ({ workArea }), getPrimaryDisplay: () => ({ workArea }) },
  session: { fromPartition: () => ({}) },
  webFrameMain: { fromId: () => undefined },
}));

const proto = { path: ".doan/canvases/proto.html", url: "http://127.0.0.1:5123/t/tok/k1/.doan/canvases/proto.html", id: "proto" };
const entries: FolderEntry[] = [{ path: "/r", kind: "list", canvases: [proto], servedRev: 0 }];
const play = { root: "/r", path: proto.path, frame: "phone", mark: "390x844" };

beforeEach(() => { created.length = 0; order.length = 0; workArea = { x: 0, y: 0, width: 1600, height: 1000 }; vi.resetModules(); });

async function opened() {
  const { createPrototypeWindow } = await import("./prototypeWindow");
  const closed = vi.fn();
  const focusChanged = vi.fn();
  const prototype = createPrototypeWindow({ entries: () => entries, mainWindow: () => undefined, closed, denyPermissions: vi.fn(), reread: vi.fn(), focusChanged, buddy: () => "puri", clockHour12: () => false });
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

// A Play can land between a window's `close` and `closed`. The new window keeps its run, and the old one's own drafts
// still go: nothing else ever releases them.
test("a Play between the old window's close and closed keeps the new window and still releases the old window's drafts", async () => {
  const { prototype, closed, window } = await opened();
  window.emit("close");
  prototype.controller.play("main", play);
  expect(created).toHaveLength(2);
  window.destroy();
  expect(closed.mock.calls).toEqual([[window.webContents.id, true]]);
  // The new window is still the live one: the next Play raises it instead of making a third.
  prototype.controller.play("main", play);
  expect(created).toHaveLength(2);
  created[1]!.destroy();
  expect(closed.mock.calls.at(-1)).toEqual([created[1]!.webContents.id, false]);
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
  const prototype = createPrototypeWindow({ entries: () => entries, mainWindow: () => undefined, closed: vi.fn(), denyPermissions: vi.fn(), reread: vi.fn(), appHidden: () => hidden, buddy: () => "puri", clockHour12: () => true });
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
  const prototype = createPrototypeWindow({ entries: () => entries, mainWindow: () => undefined, closed: vi.fn(), denyPermissions: vi.fn(), reread: vi.fn(), appHidden: () => hidden, buddy: () => "puri", clockHour12: () => true });
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

// Agent usage reads while either window shows, so main hears each change of this window's native visibility, a close
// included, and reads visible() then as the window now is.
test("tells main each time the window is shown, hidden, minimized, restored or closed", async () => {
  const { createPrototypeWindow } = await import("./prototypeWindow");
  const seen: boolean[] = [];
  const prototype = createPrototypeWindow({ entries: () => entries, mainWindow: () => undefined, closed: vi.fn(), denyPermissions: vi.fn(), reread: vi.fn(), buddy: () => "puri", clockHour12: () => true,
    shownChanged: () => seen.push(prototype.visible()) });
  prototype.controller.play("main", play);
  const window = created[0]!;
  seen.length = 0;
  window.minimized = true; window.emit("minimize");
  window.minimized = false; window.emit("restore");
  window.shown = false; window.emit("hide");
  window.shown = true; window.emit("show");
  window.close();
  expect(seen).toEqual([false, true, false, true, false]);
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
  expect(window.minimum).toEqual([640, 360]);
  prototype.controller.request("prototype:panel", "prototype", { open: false });
  expect(window.bounds).toEqual({ x: 960, y: 50, width: 640, height: 908 });
  expect(window.minimum).toEqual([360, 360]);
});

test("the window is created at least 360 high and with the clock's hour cycle main read from macOS", async () => {
  const { window } = await opened();
  expect(window.options.minHeight).toBe(360);
  expect(window.options.webPreferences?.additionalArguments).toEqual(["--doan-clock-hour12=0"]);
});

test("the text edit menu opens for the window's own page", async () => {
  const { window } = await opened();
  window.webContents.emit("context-menu", {}, { isEditable: true, editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true }, selectionText: "", formControlType: "none", misspelledWord: "", dictionarySuggestions: [], frame: { parent: null }, x: 1, y: 1 });
  expect(order.some(entry => entry.startsWith("menu "))).toBe(true);
});

test("the text edit menu opens for a field in the frame content, and nothing opens elsewhere in it", async () => {
  const { window } = await opened();
  const frameParams = (isEditable: boolean) => ({ isEditable, editFlags: { canCut: false, canCopy: true, canPaste: true, canSelectAll: true }, selectionText: "a", formControlType: "none", misspelledWord: "", dictionarySuggestions: [], frame: { parent: {} }, x: 1, y: 1 });
  order.length = 0;
  window.webContents.emit("context-menu", {}, frameParams(false));
  expect(order.some(entry => entry.startsWith("menu "))).toBe(false);
  window.webContents.emit("context-menu", {}, frameParams(true));
  expect(order.some(entry => entry.startsWith("menu "))).toBe(true);
});

// A minimum above the current width does not widen the window, so the bounds go first when it rises; bounds below the
// current minimum keep the minimum's width, so the minimum goes first when it falls.
const ready = (size: string) => ({ gen: 1, state: "ready", size, frames: [{ id: "phone", size, number: 1 }, { id: "tablet", size: "820x1180", number: 2 }], gotos: [] });

// The opening run's ready size differs from its mark: the one refit left.
test("a refit into a work area narrower than 640 lowers the minimum before it narrows the window", async () => {
  const { prototype, window } = await opened();
  prototype.controller.request("prototype:panel", "prototype", { open: true });
  expect(window.minimum).toEqual([640, 360]);
  workArea = { x: 0, y: 0, width: 600, height: 1000 };
  prototype.controller.request("prototype:result", "prototype", ready("820x1180"));
  expect(window.bounds.width).toBe(600);
  expect(window.minimum).toEqual([600, 360]);
});

test("a frame change keeps the window's size, position and minimum, with the panel closed and open", async () => {
  const { prototype, window } = await opened();
  prototype.controller.request("prototype:result", "prototype", ready("390x844"));
  const resized = { x: 50, y: 60, width: 700, height: 500 };
  window.setContentBounds(resized);
  order.length = 0;
  prototype.controller.play("main", { ...play, frame: "tablet", mark: "820x1180" });
  prototype.controller.request("prototype:result", "prototype", { ...ready("820x1180"), gen: 2 });
  expect(window.bounds).toEqual(resized);
  expect(order.filter(entry => entry.startsWith("minimum"))).toEqual([]);
  prototype.controller.request("prototype:panel", "prototype", { open: true });
  expect(window.minimum).toEqual([640, 360]);
  prototype.controller.play("main", play);
  prototype.controller.request("prototype:result", "prototype", { ...ready("1000x700"), gen: 3 });
  expect(window.bounds).toEqual(resized);
  expect(window.minimum).toEqual([640, 360]);
});

test("opening the panel on a narrow window raises the minimum after the bounds", async () => {
  const { prototype, window } = await opened();
  order.length = 0;
  prototype.controller.request("prototype:panel", "prototype", { open: true });
  expect(window.bounds.width).toBe(640);
  expect(order).toEqual(["minimum 640"]);
});

test("the window's own debugger attaches before the opaque fallback sees the window", async () => {
  const { createPrototypeWindow } = await import("./prototypeWindow");
  const vibrancyWindow = vi.fn((window: unknown) => {
    expect((window as FakeWindow).webContents.debugger.attach).toHaveBeenCalledWith("1.3");
  });
  const prototype = createPrototypeWindow({ entries: () => entries, mainWindow: () => undefined, closed: vi.fn(), denyPermissions: vi.fn(), reread: vi.fn(), buddy: () => "puri", clockHour12: () => true, vibrancyWindow });
  prototype.controller.play("main", play);
  expect(vibrancyWindow).toHaveBeenCalledWith(created[0]);
});
