import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { beforeEach, expect, test, vi } from "vitest";
import { PROTOTYPE_CHANNELS, PROTOTYPE_WINDOW_REQUESTS } from "../main/prototype/ipc";
import type { DoanPrototypeApi } from "./prototype";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  expose: vi.fn<(name: string, api: DoanPrototypeApi) => void>(),
}));
const emitter = new EventEmitter();
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  ipcRenderer: { invoke: mocks.invoke, on: (...args: Parameters<EventEmitter["on"]>) => emitter.on(...args), removeListener: (...args: Parameters<EventEmitter["removeListener"]>) => emitter.removeListener(...args) },
}));

let api: DoanPrototypeApi;
beforeEach(async () => {
  emitter.removeAllListeners();
  vi.clearAllMocks();
  vi.resetModules();
  mocks.invoke.mockResolvedValue(undefined);
  await import("./prototype");
  expect(mocks.expose.mock.calls[0]?.[0]).toBe("doanPrototype");
  api = mocks.expose.mock.calls[0]![1];
});

test("every request goes to its prototype channel with the payload main parses", async () => {
  await api.read();
  await api.reportResult({ gen: 2, state: "timeout" });
  await api.reportFrames({ gen: 2, frames: [] });
  await api.reload(3);
  await api.back();
  await api.forward();
  await api.choose("tablet");
  await api.close();
  await api.setMode("responsive");
  await api.export({ root: "/r", path: ".doan/canvases/a.html", frame: "checkout" });
  await api.revealExport("id-1");
  mocks.invoke.mockResolvedValueOnce({ visible: true });
  api.onWindowVisible(() => {})();
  expect(mocks.invoke.mock.calls).toEqual([
    [PROTOTYPE_CHANNELS.read], [PROTOTYPE_CHANNELS.result, { gen: 2, state: "timeout" }], [PROTOTYPE_CHANNELS.frames, { gen: 2, frames: [] }],
    [PROTOTYPE_CHANNELS.reload, { gen: 3 }], [PROTOTYPE_CHANNELS.back], [PROTOTYPE_CHANNELS.forward], [PROTOTYPE_CHANNELS.choose, { frame: "tablet" }],
    [PROTOTYPE_CHANNELS.close], [PROTOTYPE_CHANNELS.mode, { mode: "responsive" }],
    [PROTOTYPE_CHANNELS.export, { root: "/r", path: ".doan/canvases/a.html", frame: "checkout" }], [PROTOTYPE_CHANNELS.revealExport, "id-1"], [PROTOTYPE_CHANNELS.visible],
  ]);
  expect(new Set(mocks.invoke.mock.calls.map(call => call[0]))).toEqual(new Set(PROTOTYPE_WINDOW_REQUESTS));
});

test("view and snapshot events reach their listeners until unsubscribed", () => {
  const views = vi.fn();
  const snapshots = vi.fn();
  const stopViews = api.onChanged(views);
  const stopSnapshots = api.onSnapshot(snapshots);
  emitter.emit(PROTOTYPE_CHANNELS.changed, {}, null);
  emitter.emit(PROTOTYPE_CHANNELS.snapshot, {}, { gen: 2, png: new Uint8Array([1]), box: { x: 0, y: 28, width: 344, height: 744 } });
  stopViews();
  stopSnapshots();
  emitter.emit(PROTOTYPE_CHANNELS.changed, {}, null);
  emitter.emit(PROTOTYPE_CHANNELS.snapshot, {}, { gen: 3, png: new Uint8Array([1]), box: { x: 0, y: 0, width: 1, height: 1 } });
  expect(views.mock.calls).toEqual([[null]]);
  expect(snapshots.mock.calls).toEqual([[{ gen: 2, png: new Uint8Array([1]), box: { x: 0, y: 28, width: 344, height: 744 } }]]);
});

// Both preloads name channels literally so neither imports a value the other shares.
test("the preloads import no values", () => {
  for (const file of ["./prototype.ts", "./index.ts"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const values = [...source.matchAll(/^import (?!type )[^;]*from "([^"]+)";/gm)].map(match => match[1]);
    expect(values.filter(name => name !== "electron"), file).toEqual([]);
  }
});

test("the export's running event reaches its listener until unsubscribed", () => {
  const running = vi.fn();
  const stop = api.onExportRunning(running);
  emitter.emit(PROTOTYPE_CHANNELS.exportRunning, {}, { root: "/r", path: ".doan/canvases/a.html", frame: "checkout" });
  stop();
  emitter.emit(PROTOTYPE_CHANNELS.exportRunning, {}, { root: "/r", path: ".doan/canvases/a.html", frame: "other" });
  expect(running.mock.calls).toEqual([[{ root: "/r", path: ".doan/canvases/a.html", frame: "checkout" }]]);
});

// The toast's clock stops while the window is not visible natively: document.hidden misses a hidden app.
test("window visibility comes from main's first answer, then its pushes; a push before the answer wins", async () => {
  let answer!: (value: unknown) => void;
  mocks.invoke.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  const seen = vi.fn();
  const stop = api.onWindowVisible(seen);
  emitter.emit(PROTOTYPE_CHANNELS.visible, {}, { visible: false });
  answer({ visible: true });
  await Promise.resolve(); await Promise.resolve();
  expect(seen.mock.calls).toEqual([[false]]);
  stop();
  emitter.emit(PROTOTYPE_CHANNELS.visible, {}, { visible: true });
  expect(seen.mock.calls).toEqual([[false]]);

  mocks.invoke.mockResolvedValueOnce({ visible: true });
  const first = vi.fn();
  api.onWindowVisible(first);
  await vi.waitFor(() => expect(first.mock.calls).toEqual([[true]]));
});
