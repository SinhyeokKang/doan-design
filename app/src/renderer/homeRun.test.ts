import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationEvent, EventPayload } from "../main/conversation/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import { HomeRun, type HomeRunHost } from "./homeRun";
import type { StartInput } from "./HomeComposerView";
import type { LastRequest } from "./homeConversations";

// buzz-home tasks U5 and review BU3 🟡2–🟡7: App's Home wiring runs through HomeRun; these drive it end to end with a
// fake window.doan and a fake navigation that behaves like App's (arrival callback, draft guard, person moves).

const ROOT = "/code/doan", OTHER = "/code/acme";
const row = (name: string): CanvasRow => ({ path: `.doan/canvases/${name}.html`, id: name, url: "u", open: 0, resolved: 0 });
const list = (path: string, names: string[]): FolderEntry => ({ kind: "list", path, servedRev: 0, canvases: names.map(row) });
const REQUEST: StartInput = { root: ROOT, mode: "newDesign", runtime: "claude", text: "Draw a pricing page." };
const LAST: LastRequest = { root: ROOT, text: "Draw a pricing page.", preset: null, attachments: [], provider: "claude", model: null, effort: null };
let seq = 0;
const event = (conversationId: string, payload: EventPayload, turnId = "t1"): ConversationEvent => ({ v: 1, conversationId, seq: ++seq, turnId, at: "2026-10-29T00:00:00Z", ...payload } as ConversationEvent);

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

let doan: Record<string, ReturnType<typeof vi.fn>>;
let start: ReturnType<typeof deferred<{ conversationId: string } | { error: string }>>;
beforeEach(() => {
  seq = 0; start = deferred();
  doan = {
    startConversation: vi.fn(() => start.promise),
    readConversation: vi.fn(async () => ({ events: [], lastSeq: 0, turn: "starting" })),
    conversationForCanvas: vi.fn(async () => ({ current: null, archived: [] })),
    interruptConversation: vi.fn(async () => {}),
  };
  vi.stubGlobal("window", { doan });
});
afterEach(() => vi.unstubAllGlobals());

// App's navigation, reduced: openOverview waits for the test to call `arrive`, then shows the root's workspace.
function harness(entries: FolderEntry[] = [list(ROOT, ["a"])]) {
  const view = { screen: "home" as "home" | "workspace", loadedRoot: null as string | null, entries };
  const order: string[] = [];
  let accept = () => false, commit = () => {}, unavailable = () => {};
  const history: string[] = [];
  // App's order: the controller accepts or refuses the arrival first; only an accepted one commits the screen, and
  // App's refs (view) change only after that commit.
  const host: HomeRunHost = {
    view: () => view,
    label: root => root.split("/").at(-1)!,
    openOverview: vi.fn((root, arrived, missing) => { accept = arrived; commit = () => { view.screen = "workspace"; view.loadedRoot = root; history.push(root); }; unavailable = missing; }),
    cancelMove: vi.fn(),
    openCanvas: vi.fn(),
    goHome: vi.fn(() => { view.screen = "home"; }),
    removeNow: vi.fn(async () => { order.push("remove"); }),
    toast: vi.fn(),
    sent: vi.fn(),
    changed: vi.fn(),
  };
  doan.interruptConversation!.mockImplementation(async () => { order.push("interrupt"); });
  const run = new HomeRun(host);
  return { run, host, view, order, history, accept: () => accept(), commit: () => commit(), arrive: () => { if (accept()) commit(); }, unavailable: () => unavailable() };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test("a sent request moves to the project's Overview and focuses Stop, even when a permission request came before the reply", async () => {
  const h = harness();
  h.run.event(event("c1", { type: "turn.started" }));
  h.run.event(event("c1", { type: "permission.request", requestId: "r1", tool: "Edit", summary: "Edit x", options: [{ id: "a", label: "Allow", kind: "allow" }] }));
  const sending = h.run.start(REQUEST, LAST);
  start.resolve({ conversationId: "c1" });
  expect(await sending).toEqual({ ok: true });
  expect(h.host.openOverview).toHaveBeenCalledWith(ROOT, expect.any(Function), expect.any(Function));
  expect(h.run.strip(ROOT)?.state.kind).toBe("permission");
  h.arrive();
  expect(h.run.takeFocus()).toBe("stop");
  expect(h.run.takeFocus()).toBeNull();
  expect(h.host.sent).toHaveBeenCalledWith(REQUEST);
  // The request was toasted only because the person was not on that project when it arrived.
  expect(h.host.toast).toHaveBeenCalledWith("Claude Code needs your answer in doan.", "Open", expect.any(Function));
});

test("a refused start keeps Home: nothing is tracked and nothing moves", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST);
  start.resolve({ error: "not_logged_in" });
  expect(await sending).toEqual({ error: "not_logged_in" });
  expect(h.host.openOverview).not.toHaveBeenCalled();
  expect(h.run.conversations).toEqual([]);
  expect(h.view.screen).toBe("home");
});

test("the person's move while the start is pending wins: the window stays and the send is toasted as Started in", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST);
  // Home → another workspace → back to Home, all before the reply.
  h.run.personNavigated(); h.view.screen = "workspace"; h.run.personNavigated(); h.view.screen = "home";
  start.resolve({ conversationId: "c1" });
  await sending;
  expect(h.host.openOverview).not.toHaveBeenCalled();
  expect(h.host.toast).toHaveBeenCalledWith("Started in doan.", "Open", expect.any(Function));
});

test("a move the person makes after the move began also wins over the arrival", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  h.run.personNavigated();
  expect(h.host.toast).toHaveBeenCalledWith("Started in doan.", "Open", expect.any(Function));
  h.arrive();
  expect(h.run.takeFocus()).toBeNull();
});

test("a draft guard the person refuses, or a project that is unavailable, toasts instead of moving", async () => {
  const refused = harness();
  const one = refused.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await one;
  refused.run.modalChanged(true); refused.run.modalChanged(false);
  expect(refused.host.toast).toHaveBeenCalledWith("Started in doan.", "Open", expect.any(Function));
  start = deferred();
  const gone = harness();
  const two = gone.run.start(REQUEST, LAST); start.resolve({ conversationId: "c2" }); await two;
  gone.unavailable();
  expect(gone.host.toast).toHaveBeenCalledWith("Started in doan.", "Open", expect.any(Function));
  // A guard that let the move through arrives first, so its closing dialog toasts nothing.
  start = deferred();
  const allowed = harness();
  const three = allowed.run.start(REQUEST, LAST); start.resolve({ conversationId: "c3" }); await three;
  allowed.run.modalChanged(true); allowed.arrive(); allowed.run.modalChanged(false);
  expect(allowed.host.toast).not.toHaveBeenCalledWith("Started in doan.", "Open", expect.any(Function));
});

test("a canvas main bound before the start reply arrived is still taken and opens where the person looks", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST);
  // Main accepts, binds the new canvas and announces folders before the renderer handles the reply.
  h.view.entries = [list(ROOT, ["a", "pricing"])];
  h.run.entriesChanged();
  doan.conversationForCanvas!.mockImplementation(async ({ canvas }: { canvas: { path: string } }) => ({ current: canvas.path.endsWith("pricing.html") ? { conversationId: "c1" } : null, archived: [] }));
  start.resolve({ conversationId: "c1" });
  await sending;
  h.arrive();
  await flush();
  expect(doan.conversationForCanvas).toHaveBeenCalledWith({ root: ROOT, canvas: { path: ".doan/canvases/pricing.html", id: "pricing" } });
  expect(h.run.conversations[0]?.canvas).toBe(".doan/canvases/pricing.html");
  expect(h.host.openCanvas).toHaveBeenCalledWith(ROOT, expect.objectContaining({ path: ".doan/canvases/pricing.html" }));
  // Its own open is not the person's: a later canvas of the same run is not blocked by it.
  h.run.canvasShown(ROOT, ".doan/canvases/pricing.html");
  expect(doan.conversationForCanvas).not.toHaveBeenCalledWith(expect.objectContaining({ canvas: expect.objectContaining({ path: ".doan/canvases/a.html" }) }));
});

test("after the person opened a canvas in any project, a bound canvas is offered in a toast instead of opening", async () => {
  const h = harness([list(ROOT, ["a"]), list(OTHER, ["x"])]);
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  h.arrive();
  h.run.canvasShown(OTHER, ".doan/canvases/x.html");
  h.view.loadedRoot = ROOT;
  doan.conversationForCanvas!.mockResolvedValue({ current: { conversationId: "c1" }, archived: [] });
  h.view.entries = [list(ROOT, ["a", "pricing"]), list(OTHER, ["x"])];
  h.run.entriesChanged();
  await flush();
  expect(h.host.openCanvas).not.toHaveBeenCalled();
  expect(h.host.toast).toHaveBeenCalledWith("New canvas in doan", "Open", expect.any(Function));
});

test("a permission slot stays until it is answered, whatever happened to its toast", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  h.run.event(event("c1", { type: "turn.started" }));
  h.run.event(event("c1", { type: "permission.request", requestId: "r1", tool: "Edit", summary: "Edit x", options: [] }));
  expect(h.host.toast).toHaveBeenCalledTimes(1);
  expect(h.run.slots().get(ROOT)?.kind).toBe("permission");
  h.run.event(event("c1", { type: "activity", kind: "edit", summary: "Editing" }));
  expect(h.run.slots().get(ROOT)?.kind).toBe("permission");
  h.run.event(event("c1", { type: "permission.resolved", requestId: "r1", optionId: "a" }));
  expect(h.run.slots().get(ROOT)?.kind).toBe("working");
});

test("removing a project with a running Home conversation asks; Cancel keeps both, Stop and Remove interrupts and then removes", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  await h.run.remove([ROOT], "doan");
  expect(h.run.removing).toMatchObject({ paths: [ROOT], conversations: ["c1"], title: "Stop the conversation and remove doan?" });
  h.run.cancelRemove();
  expect(h.run.removing).toBeNull();
  expect(h.host.removeNow).not.toHaveBeenCalled();
  expect(doan.interruptConversation).not.toHaveBeenCalled();
  await h.run.remove([ROOT], "doan");
  await h.run.confirmRemove();
  expect(h.order).toEqual(["interrupt", "remove"]);
  expect(doan.interruptConversation).toHaveBeenCalledWith({ conversationId: "c1" });
  // Without a running conversation the removal goes straight through.
  const idle = harness();
  await idle.run.remove([ROOT], "doan");
  expect(idle.host.removeNow).toHaveBeenCalledWith([ROOT]);
});

test("Edit on Home sends the last request back to Home", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  h.arrive();
  h.run.editOnHome(ROOT);
  expect(h.host.goHome).toHaveBeenCalled();
  expect(h.run.restore).toEqual({ request: LAST, seq: 1 });
});

// Review BU3 r2 🟡2, 🟡3.
test("a canvas bound before the arrival opens once the arrival is accepted, before App's screen commit", async () => {
  const h = harness();
  doan.conversationForCanvas!.mockResolvedValue({ current: { conversationId: "c1" }, archived: [] });
  const sending = h.run.start(REQUEST, LAST);
  h.view.entries = [list(ROOT, ["a", "pricing"])];
  start.resolve({ conversationId: "c1" });
  await sending; await flush();
  expect(h.host.openCanvas).not.toHaveBeenCalled();
  expect(h.accept()).toBe(true);
  expect(h.host.openCanvas).toHaveBeenCalledWith(ROOT, expect.objectContaining({ path: ".doan/canvases/pricing.html" }));
  expect(h.host.toast).not.toHaveBeenCalledWith("New canvas in doan", "Open", expect.any(Function));
});

test("a canvas bound after the arrival was accepted but before the screen commit also opens", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  expect(h.accept()).toBe(true);
  doan.conversationForCanvas!.mockResolvedValue({ current: { conversationId: "c1" }, archived: [] });
  h.view.entries = [list(ROOT, ["a", "pricing"])];
  h.run.entriesChanged();
  await flush();
  expect(h.host.openCanvas).toHaveBeenCalledWith(ROOT, expect.objectContaining({ path: ".doan/canvases/pricing.html" }));
  h.commit();
});

test("a move the person makes while the project is still being read cancels the wait; the late list commits nothing", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  // Quick Open, say: the person's own move.
  h.run.personNavigated();
  expect(h.host.cancelMove).toHaveBeenCalledTimes(1);
  const toasts = vi.mocked(h.host.toast).mock.calls.length;
  // The project's read arrives afterwards.
  h.arrive();
  expect(h.view).toMatchObject({ screen: "home", loadedRoot: null });
  expect(h.history).toEqual([]);
  expect(vi.mocked(h.host.toast).mock.calls.length).toBe(toasts);
  expect(h.run.takeFocus()).toBeNull();
});

test("Home's running map says whether the conversation waits for an answer (spec decision 18's two sentences)", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST);
  start.resolve({ conversationId: "c1" });
  await sending;
  expect(h.run.running()).toEqual(new Map([[ROOT, { conversationId: "c1", waiting: false }]]));
  h.run.event(event("c1", { type: "turn.started" }));
  h.run.event(event("c1", { type: "permission.request", requestId: "r1", tool: "Edit", summary: "Edit x", options: [{ id: "a", label: "Allow", kind: "allow" }] }));
  expect(h.run.running()).toEqual(new Map([[ROOT, { conversationId: "c1", waiting: true }]]));
});
