import { EventEmitter } from "node:events";
import { beforeEach, expect, test, vi } from "vitest";
import type { FolderEntry } from "./view";

// Enough of Electron for the window's lifecycle: the window and its webContents are emitters, destroy() emits
// `closed` as Electron does.
const created: FakeWindow[] = [];
class FakeWindow extends EventEmitter {
  destroyed = false;
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
  setContentBounds() {}
  getContentBounds() { return { x: 0, y: 0, width: 406, height: 908 }; }
  getBounds() { return this.getContentBounds(); }
  loadFile = vi.fn(async () => {});
  loadURL = vi.fn(async () => {});
  show() {}
  focus() {}
}
vi.mock("electron", () => ({
  app: { isPackaged: true },
  BrowserWindow: FakeWindow,
  screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1600, height: 1000 } }), getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1600, height: 1000 } }) },
  session: { fromPartition: () => ({}) },
  webFrameMain: { fromId: () => undefined },
}));

const proto = { path: ".doan/canvases/proto.html", url: "http://127.0.0.1:5123/t/tok/k1/.doan/canvases/proto.html", id: "proto" };
const entries: FolderEntry[] = [{ path: "/r", kind: "list", canvases: [proto], servedRev: 0 }];
const play = { root: "/r", path: proto.path, frame: "phone", mark: "390x844" };

beforeEach(() => { created.length = 0; vi.resetModules(); });

async function opened() {
  const { createPrototypeWindow } = await import("./prototypeWindow");
  const closed = vi.fn();
  const prototype = createPrototypeWindow({ entries: () => entries, mainWindow: () => undefined, closed, denyPermissions: vi.fn(), reread: vi.fn() });
  prototype.controller.play("main", play);
  expect(created).toHaveLength(1);
  return { prototype, closed, window: created[0]! };
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
