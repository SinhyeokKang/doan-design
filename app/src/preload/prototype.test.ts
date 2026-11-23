import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { beforeEach, expect, expectTypeOf, test, vi } from "vitest";
import { PROTOTYPE_CHANNELS, PROTOTYPE_WINDOW_REQUESTS } from "../main/prototype/ipc";
import type { DoanApi } from "./index";
import type { DoanPrototypeApi, SharedWithMain } from "./prototype";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  expose: vi.fn<(name: string, api: DoanPrototypeApi) => void>(),
  pathForFile: vi.fn<(file: unknown) => string>(),
}));
const emitter = new EventEmitter();
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  webUtils: { getPathForFile: mocks.pathForFile },
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
  await api.reportFrames({ gen: 2, frames: [], gotos: [] });
  await api.goto({ gen: 2, goto: "tablet" });
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
  await api.setPanel({ open: true, width: 300 });
  await api.setShowing("c1");
  await api.setShowing(null);
  await api.reveal({ kind: "settings", provider: "claude" });
  api.onAgentAuth(() => {})();
  await api.getWork();
  await api.readComposerSettings();
  await api.rememberChoice({ provider: "claude", model: "sonnet", effort: null, modelPicked: true });
  await api.readTargetEntry();
  await api.rememberedConversation();
  await api.reveal({ kind: "settings" });
  expect(mocks.invoke.mock.calls).toEqual([
    [PROTOTYPE_CHANNELS.read], [PROTOTYPE_CHANNELS.result, { gen: 2, state: "timeout" }], [PROTOTYPE_CHANNELS.frames, { gen: 2, frames: [], gotos: [] }], [PROTOTYPE_CHANNELS.goto, { gen: 2, goto: "tablet" }],
    [PROTOTYPE_CHANNELS.reload, { gen: 3 }], [PROTOTYPE_CHANNELS.back], [PROTOTYPE_CHANNELS.forward], [PROTOTYPE_CHANNELS.choose, { frame: "tablet" }],
    [PROTOTYPE_CHANNELS.close], [PROTOTYPE_CHANNELS.mode, { mode: "responsive" }],
    [PROTOTYPE_CHANNELS.export, { root: "/r", path: ".doan/canvases/a.html", frame: "checkout" }], [PROTOTYPE_CHANNELS.revealExport, "id-1"], [PROTOTYPE_CHANNELS.visible],
    [PROTOTYPE_CHANNELS.panel, { open: true, width: 300 }], [PROTOTYPE_CHANNELS.showing, { conversationId: "c1" }], [PROTOTYPE_CHANNELS.showing, { conversationId: null }],
    [PROTOTYPE_CHANNELS.reveal, { kind: "settings", provider: "claude" }], [PROTOTYPE_CHANNELS.auth], [PROTOTYPE_CHANNELS.work], [PROTOTYPE_CHANNELS.composer],
    [PROTOTYPE_CHANNELS.remember, { provider: "claude", model: "sonnet", effort: null, modelPicked: true }], [PROTOTYPE_CHANNELS.entry],
    [PROTOTYPE_CHANNELS.rememberedConversation], [PROTOTYPE_CHANNELS.reveal, { kind: "settings" }],
  ]);
  expect(new Set(mocks.invoke.mock.calls.map(call => call[0]))).toEqual(new Set(PROTOTYPE_WINDOW_REQUESTS));
});

test("reads the clock's hour cycle main passed to the window, 12-hour by default, as the main preload does", async () => {
  expect(api.clockHour12).toBe(true);
  const argv = process.argv;
  try {
    process.argv = [...argv, "--doan-clock-hour12=0"];
    vi.resetModules(); mocks.expose.mockClear(); await import("./prototype");
    expect(mocks.expose.mock.calls[0]?.[1].clockHour12).toBe(false);
  } finally { process.argv = argv; }
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

// A followed link: the host forwards the script's message as it is; main judges it.
test("a followed link goes to main on its own channel", async () => {
  mocks.invoke.mockClear();
  await api.goto({ gen: 4, goto: "account" });
  expect(mocks.invoke.mock.calls).toEqual([[PROTOTYPE_CHANNELS.goto, { gen: 4, goto: "account" }]]);
});

test("reads the main window's remembered conversation of the playing canvas through its own channel", async () => {
  mocks.invoke.mockClear();
  mocks.invoke.mockResolvedValueOnce("0a1b2c3d-0000-4000-8000-000000000001");
  expect(await api.rememberedConversation()).toBe("0a1b2c3d-0000-4000-8000-000000000001");
  expect(mocks.invoke.mock.calls).toEqual([["prototype:rememberedConversation"]]);
});

test("has no conversationForCanvas, which main no longer answers", () => {
  expect(api).not.toHaveProperty("conversationForCanvas");
});

// The panel's body runs on either preload: the calls it shares with the main window keep their names, signatures,
// channels and payloads, so the renderer passes either one as its calls object.
const canvas = { id: "proto", path: ".doan/canvases/proto.html" };
const SHARED_CALLS: [SharedWithMain, (api: Pick<DoanApi, SharedWithMain>) => Promise<unknown>][] = [
  ["conversationResumeTarget", a => a.conversationResumeTarget({ root: "/r", canvas })],
  ["deleteConversation", a => a.deleteConversation({ conversationId: "c" })],
  ["startConversation", a => a.startConversation({ root: "/r", mode: "new", runtime: "claude", canvas, text: "hi", attachments: [{ id: "a" }] })],
  ["sendConversation", a => a.sendConversation({ conversationId: "c", text: "{{1}} x", anchors: [{ frame: { id: "f" } }], model: "opus" })],
  ["scheduledMessages", a => a.scheduledMessages({ conversationId: "c" })],
  ["queueConversation", a => a.queueConversation({ conversationId: "c", text: "x" })],
  ["setConversationPermissionMode", a => a.setConversationPermissionMode({ conversationId: "c", permissionMode: "plan" })],
  ["removeQueuedMessage", a => a.removeQueuedMessage({ conversationId: "c", itemId: "i" })],
  ["sendQueuedNow", a => a.sendQueuedNow({ conversationId: "c", itemId: "i" })],
  ["takeConversationDraft", a => a.takeConversationDraft({ conversationId: "c" })],
  ["markConversationSeen", a => a.markConversationSeen({ conversationId: "c", seq: 3 })],
  ["openLink", a => a.openLink("https://example.com")],
  ["interruptConversation", a => a.interruptConversation({ conversationId: "c", turnId: "t" })],
  ["answerConversationPermission", a => a.answerConversationPermission({ conversationId: "c", requestId: "r", optionId: "o" })],
  ["answerConversationQuestion", a => a.answerConversationQuestion({ conversationId: "c", requestId: "r", outcome: "skipped" })],
  ["readConversation", a => a.readConversation({ conversationId: "c" })],
  ["listConversationModels", a => a.listConversationModels({ root: "/r", runtime: "codex" })],
  ["listConversationSkills", a => a.listConversationSkills({ root: "/r", provider: "claude" })],
  ["chooseAttachments", a => a.chooseAttachments()],
  ["addAttachmentFiles", a => a.addAttachmentFiles([{ name: "a.png" } as File])],
  ["addPastedImage", a => a.addPastedImage(new Uint8Array([1, 2]))],
  ["removeAttachment", a => a.removeAttachment("a")],
  ["recheckAttachments", a => a.recheckAttachments(["a"])],
  ["attachmentsFromPaths", a => a.attachmentsFromPaths(["/tmp/a.png"])],
  ["releaseAttachments", a => a.releaseAttachments(["a"])],
  ["designSkills", a => a.designSkills.list()],
  ["designSkills", a => a.designSkills.get("clarify")],
  ["readAgentUsage", a => a.readAgentUsage()],
  ["readAgentUsage", a => a.readAgentUsage("open")],
  ["readAgentUsage", a => a.readAgentUsage("refresh")],
];
const SHARED_EVENTS: [SharedWithMain, string][] = [
  ["onConversationEvent", "conversation:event"], ["onConversationStage", "conversation:stage"], ["onConversationBoundary", "conversation:boundary"],
  ["onConversationListChanged", "conversation:listChanged"], ["onConversationHandoff", "conversation:handoff"],
];

// The context ring's drawer reads usage on the main window's channels: entries carry no account identity
// (usageTypes.ts), so the window's narrow-read rule holds.
test("usage reads and changes use the main window's literal channels", async () => {
  const { USAGE_CHANNELS } = await import("../main/agentAuth/usageIpc");
  expect(USAGE_CHANNELS).toEqual({ read: "agent-usage:read", changed: "agent-usage:changed" });
  mocks.invoke.mockClear();
  mocks.invoke.mockResolvedValue([]);
  await api.readAgentUsage();
  await api.readAgentUsage("open");
  await api.readAgentUsage("refresh");
  expect(mocks.invoke.mock.calls).toEqual([["agent-usage:read", {}], ["agent-usage:read", { trigger: "open" }], ["agent-usage:read", { trigger: "refresh" }]]);
});

test("usage entries come from the first read unless a change came first, until unsubscribed", async () => {
  let answer!: (value: unknown) => void;
  mocks.invoke.mockClear();
  mocks.invoke.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  const seen: unknown[] = [];
  const stop = api.onAgentUsage(entries => seen.push(entries));
  expect(mocks.invoke.mock.calls).toEqual([["agent-usage:read", {}]]);
  emitter.emit("agent-usage:changed", {}, [{ provider: "codex", inFlight: false }]);
  answer([{ provider: "claude", inFlight: false }]);
  await Promise.resolve(); await Promise.resolve();
  expect(seen).toEqual([[{ provider: "codex", inFlight: false }]]);
  stop();
  emitter.emit("agent-usage:changed", {}, []);
  expect(seen).toHaveLength(1);
  expect(emitter.listenerCount("agent-usage:changed")).toBe(0);

  mocks.invoke.mockResolvedValueOnce([{ provider: "claude", inFlight: true }]);
  const first: unknown[] = [];
  const stopFirst = api.onAgentUsage(entries => first.push(entries));
  await Promise.resolve(); await Promise.resolve();
  expect(first).toEqual([[{ provider: "claude", inFlight: true }]]);
  stopFirst();
});

async function mainPreload(): Promise<DoanApi> {
  vi.resetModules();
  mocks.expose.mockClear();
  await import("./index");
  return mocks.expose.mock.calls.find(call => call[0] === "doan")![1] as unknown as DoanApi;
}

test("the calls shared with the main window have the main preload's signatures", () => {
  expectTypeOf<Pick<DoanPrototypeApi, SharedWithMain>>().toEqualTypeOf<Pick<DoanApi, SharedWithMain>>();
});

test("the calls shared with the main window go to the same channels with the same payloads", async () => {
  mocks.pathForFile.mockReturnValue("/Users/me/a.png");
  const own = api;
  const calls = async (target: Pick<DoanApi, SharedWithMain>) => {
    mocks.invoke.mockClear();
    mocks.invoke.mockResolvedValue([{ ok: true }]);
    for (const [, call] of SHARED_CALLS) await call(target);
    return mocks.invoke.mock.calls.map(args => [...args]);
  };
  const fromPrototype = await calls(own);
  const fromMain = await calls(await mainPreload());
  expect(fromPrototype).toEqual(fromMain);
  expect(fromPrototype.length).toBe(SHARED_CALLS.length);
  // Nothing the panel calls goes to a channel main closes to this window.
  for (const [channel] of fromPrototype) expect(["attachments:capture", "agent-auth:read", "preferences:read", "work:get"]).not.toContain(channel);
});

// Main answers this window's list only for the canvas the request names, so a view that trails main's play is told so
// instead of getting another canvas's rows.
test("the list goes to the main window's channel and names the canvas it is for", async () => {
  mocks.invoke.mockClear();
  mocks.invoke.mockResolvedValue([]);
  await api.listConversations({ root: "/r", canvas });
  expect(mocks.invoke.mock.calls).toEqual([["conversation:list", { root: "/r", canvas }]]);
});

test("the shared conversation events arrive on the main window's channels until unsubscribed", () => {
  for (const [name, channel] of SHARED_EVENTS) {
    const seen = vi.fn();
    const stop = (api[name] as (listener: (value: unknown) => void) => () => void)(seen);
    emitter.emit(channel, {}, { conversationId: "c" });
    stop();
    emitter.emit(channel, {}, { conversationId: "d" });
    expect(seen.mock.calls, name).toEqual([[{ conversationId: "c" }]]);
  }
});

test("a dropped item's path, null for a file the page made", () => {
  mocks.pathForFile.mockReturnValueOnce("/Users/me/a.png").mockReturnValueOnce("");
  expect(api.droppedPath({} as File)).toBe("/Users/me/a.png");
  expect(api.droppedPath({} as File)).toBeNull();
});

test("the panel never reaches the main window's capture, full account or settings reads", () => {
  for (const name of ["captureCanvas", "readAgentAuth", "readPreferences", "writePreferences", "selectCanvas"]) expect(api, name).not.toHaveProperty(name);
});

// The narrow reads: provider readiness without the account's email, the terminal work of the canvas's session, and
// the composer's settings. Each delivers main's first answer unless a push came first, then the pushes.
test("provider readiness carries no account identity and delivers only newer revisions", async () => {
  let answer!: (value: unknown) => void;
  mocks.invoke.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  const seen = vi.fn();
  const stop = api.onAgentAuth(seen);
  emitter.emit(PROTOTYPE_CHANNELS.authChanged, {}, { revision: 2, providers: [] });
  answer({ revision: 1, providers: [] });
  await Promise.resolve(); await Promise.resolve();
  emitter.emit(PROTOTYPE_CHANNELS.authChanged, {}, { revision: 3, providers: [] });
  stop();
  emitter.emit(PROTOTYPE_CHANNELS.authChanged, {}, { revision: 4, providers: [] });
  expect(seen.mock.calls.map(call => (call[0] as { revision: number }).revision)).toEqual([2, 3]);
});

test("terminal work, composer settings and the target root's entry arrive from their pushes until unsubscribed", () => {
  const work = vi.fn();
  const settings = vi.fn();
  const entry = vi.fn();
  const stopWork = api.onWorkChanged(work);
  const stopSettings = api.onComposerSettings(settings);
  const stopEntry = api.onTargetEntry(entry);
  emitter.emit(PROTOTYPE_CHANNELS.workChanged, {}, []);
  emitter.emit(PROTOTYPE_CHANNELS.composerChanged, {}, { home: null, newConversation: null, buddy: "doany" });
  emitter.emit(PROTOTYPE_CHANNELS.entryChanged, {}, { path: "/r", kind: "loading" });
  stopWork(); stopSettings(); stopEntry();
  emitter.emit(PROTOTYPE_CHANNELS.workChanged, {}, [{}]);
  emitter.emit(PROTOTYPE_CHANNELS.composerChanged, {}, null);
  emitter.emit(PROTOTYPE_CHANNELS.entryChanged, {}, null);
  expect(work.mock.calls).toEqual([[[]]]);
  expect(settings.mock.calls).toEqual([[{ home: null, newConversation: null, buddy: "doany" }]]);
  expect(entry.mock.calls).toEqual([[{ path: "/r", kind: "loading" }]]);
});

// The drawing and promotion relays are gone: the window's API offers neither.
test("offers no drawing or promoted conversation", () => {
  for (const name of ["readDrawing", "onDrawing", "readPromoted", "onPromoted"]) expect(api, name).not.toHaveProperty(name);
});
