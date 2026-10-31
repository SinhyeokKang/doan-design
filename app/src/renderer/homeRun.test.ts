import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
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
    interruptConversation: vi.fn(async () => {}),
    listConversations: vi.fn(async () => []),
    markConversationSeen: vi.fn(async () => {}),
    attachmentsFromPaths: vi.fn(async () => []),
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

test("a canvas that appeared before the start reply arrived is still taken and opens where the person looks", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST);
  // The agent writes the new canvas and the folders arrive before the renderer handles the reply.
  h.view.entries = [list(ROOT, ["a", "pricing"])];
  h.run.entriesChanged();
  start.resolve({ conversationId: "c1" });
  await sending;
  h.arrive();
  await flush();
  expect(h.host.openCanvas).toHaveBeenCalledWith(ROOT, expect.objectContaining({ path: ".doan/canvases/pricing.html" }));
  // Its own open is not the person's: the run does not count it as the person opening a canvas.
  h.run.canvasShown(ROOT, ".doan/canvases/pricing.html");
  expect(h.host.toast).not.toHaveBeenCalledWith("New canvas in doan", "Open", expect.any(Function));
});

// Decision 17: main binds a new canvas only after the turn ends, so the open does not wait for main.
test("a new canvas row during the turn opens without asking main; only the first, and only while the turn runs", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  h.arrive();
  h.view.entries = [list(ROOT, ["a", "pricing"])];
  h.run.entriesChanged();
  expect(h.host.openCanvas).toHaveBeenCalledTimes(1);
  expect(h.host.openCanvas).toHaveBeenCalledWith(ROOT, expect.objectContaining({ path: ".doan/canvases/pricing.html" }));
  h.view.entries = [list(ROOT, ["a", "pricing", "second"])];
  h.run.entriesChanged();
  expect(h.host.openCanvas).toHaveBeenCalledTimes(1);
  // A turn that already ended opens nothing.
  start = deferred();
  const ended = harness();
  const two = ended.run.start({ ...REQUEST, text: "x" }, LAST); start.resolve({ conversationId: "c2" }); await two;
  ended.arrive();
  ended.run.event(event("c2", { type: "turn.started" }, "t2"));
  ended.run.event(event("c2", { type: "turn.done" }, "t2"));
  ended.view.entries = [list(ROOT, ["a", "late"])];
  ended.run.entriesChanged();
  expect(ended.host.openCanvas).not.toHaveBeenCalled();
});

test("after the person opened a canvas in any project, a new canvas is offered in a toast instead of opening", async () => {
  const h = harness([list(ROOT, ["a"]), list(OTHER, ["x"])]);
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  h.arrive();
  h.run.canvasShown(OTHER, ".doan/canvases/x.html");
  h.view.loadedRoot = ROOT;
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
  await h.run.editOnHome("c1");
  expect(h.host.goHome).toHaveBeenCalled();
  expect(h.run.restore).toEqual({ request: { ...LAST, conversationId: "c1" }, seq: 1 });
});

// Review BU3 r2 🟡2, 🟡3.
test("a canvas that appears before the arrival opens once the arrival is accepted, before App's screen commit", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST);
  h.view.entries = [list(ROOT, ["a", "pricing"])];
  start.resolve({ conversationId: "c1" });
  await sending; await flush();
  expect(h.host.openCanvas).not.toHaveBeenCalled();
  expect(h.accept()).toBe(true);
  expect(h.host.openCanvas).toHaveBeenCalledWith(ROOT, expect.objectContaining({ path: ".doan/canvases/pricing.html" }));
  expect(h.host.toast).not.toHaveBeenCalledWith("New canvas in doan", "Open", expect.any(Function));
});

test("a canvas that appears after the arrival was accepted but before the screen commit also opens", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  expect(h.accept()).toBe(true);
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

// buzz-conversation R4: what survives a reload comes from main's list.
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", state: "current", owner: "doan", provider: "claude", fromHome: true,
  phase: "ended", unseen: false, queued: 0, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "", ...patch,
});
function lists(byRoot: Record<string, ConversationSummary[]>) {
  doan.listConversations!.mockImplementation(async ({ root }: { root: string }) => byRoot[root] ?? []);
}

test("list notices coalesce per root: one read in flight, and one more for any notices that came during it", async () => {
  const h = harness();
  const first = deferred<ConversationSummary[]>();
  doan.listConversations!.mockImplementationOnce(() => first.promise);
  h.run.listChanged(ROOT);
  h.run.listChanged(ROOT); h.run.listChanged(ROOT);
  expect(doan.listConversations).toHaveBeenCalledTimes(1);
  first.resolve([]);
  await flush();
  expect(doan.listConversations).toHaveBeenCalledTimes(2);
  await flush();
  expect(doan.listConversations).toHaveBeenCalledTimes(2);
  // A root that is not registered is never read.
  h.run.listChanged("/elsewhere");
  expect(doan.listConversations).toHaveBeenCalledTimes(2);
});

test("after a reload the slots come back from the list: running, waiting for an answer and unseen endings", async () => {
  lists({ [ROOT]: [summary({ conversationId: "w", phase: "running" })], [OTHER]: [summary({ conversationId: "u", unseen: true, canvas: { path: ".doan/canvases/x.html", id: "x" } })] });
  const reads = deferred<unknown>();
  doan.readConversation!.mockImplementation(() => reads.promise);
  const h = harness([list(ROOT, ["a"]), list(OTHER, ["x"])]);
  h.run.entriesChanged();
  await flush();
  // Straight from the list, before the strip's history reads return.
  expect(h.run.slots()).toEqual(new Map([[ROOT, { kind: "working", label: "Claude Code is working" }], [`${OTHER}\n.doan/canvases/x.html`, { kind: "unseen", label: "New changes from Claude Code" }]]));
  lists({ [ROOT]: [summary({ conversationId: "w", phase: "waiting" })], [OTHER]: [] });
  h.run.listChanged(ROOT);
  await flush();
  expect(h.run.slots().get(ROOT)).toEqual({ kind: "permission", label: "Claude Code needs your answer" });
});

test("a bound canvas that left the project puts the slot on its project row", async () => {
  lists({ [ROOT]: [summary({ phase: "running", canvas: { path: ".doan/canvases/gone.html", id: "gone" } })] });
  const h = harness();
  h.run.entriesChanged();
  await flush();
  expect(h.run.slots().get(ROOT)?.kind).toBe("working");
});

test("after main binds the turn's new canvas, the slot moves to that canvas row from the list", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  h.arrive();
  expect(h.run.slots().get(ROOT)?.kind).toBe("working");
  h.view.entries = [list(ROOT, ["a", "pricing"])];
  h.run.entriesChanged();
  lists({ [ROOT]: [summary({ phase: "running", canvas: { path: ".doan/canvases/pricing.html", id: "pricing" } })] });
  h.run.listChanged(ROOT);
  await flush();
  expect(h.run.slots()).toEqual(new Map([[`${ROOT}\n.doan/canvases/pricing.html`, { kind: "working", label: "Claude Code is working" }]]));
  expect(h.run.conversations[0]?.canvas).toBe(".doan/canvases/pricing.html");
});

test("after a reload the strip reads the conversation the list names; a turn the restart folded shows as stopped", async () => {
  lists({ [ROOT]: [summary({ unseen: true })] });
  doan.readConversation!.mockResolvedValue({ events: [event("c1", { type: "user.message", text: "Draw it", anchors: [] }), event("c1", { type: "turn.started" }), event("c1", { type: "activity", kind: "edit", summary: "Editing" })], lastSeq: 3, turn: "interrupted" });
  const h = harness();
  h.view.screen = "workspace"; h.view.loadedRoot = ROOT;
  h.run.entriesChanged();
  // Before the history arrives nothing is drawn, not another conversation's state.
  expect(h.run.strip(ROOT)).toBeNull();
  await flush(); await flush();
  expect(h.run.strip(ROOT)?.state).toEqual({ kind: "interrupted", reason: "crashed" });
  expect(h.run.knows("c1")).toBe(true);
});

test("a switch between projects never draws the previous project's strip (POSTMORTEM 2026-10-25)", async () => {
  lists({ [ROOT]: [summary({ conversationId: "a1", phase: "running" })], [OTHER]: [] });
  doan.readConversation!.mockResolvedValue({ events: [event("a1", { type: "turn.started" })], lastSeq: 1, turn: "starting" });
  const h = harness([list(ROOT, ["a"]), list(OTHER, ["x"])]);
  h.run.entriesChanged();
  await flush(); await flush();
  expect(h.run.strip(ROOT)?.conversation.conversationId).toBe("a1");
  // The render right after the switch reads the new root, before any effect or list read.
  expect(h.run.strip(OTHER)).toBeNull();
  expect(h.run.running().get(OTHER)).toBeUndefined();
});

test("Dismiss marks the conversation seen at its last seq and hides it at once, in either order of reply and list", async () => {
  lists({ [ROOT]: [summary({ unseen: true })] });
  doan.readConversation!.mockResolvedValue({ events: [event("c1", { type: "turn.started" }), event("c1", { type: "turn.done" })], lastSeq: 2, turn: "idle" });
  const h = harness();
  h.run.entriesChanged();
  await flush(); await flush();
  expect(h.run.slots().get(ROOT)?.kind).toBe("unseen");
  const reply = deferred<void>();
  doan.markConversationSeen!.mockImplementationOnce(() => reply.promise);
  h.run.dismiss("c1");
  expect(h.run.strip(ROOT)).toBeNull();
  expect(h.run.slots().size).toBe(0);
  await flush();
  expect(doan.markConversationSeen).toHaveBeenCalledWith({ conversationId: "c1", seq: 2 });
  // The notice's read comes back before main's reply and still has the old marker: the slot stays hidden.
  h.run.listChanged(ROOT);
  await flush();
  expect(h.run.slots().size).toBe(0);
  reply.resolve();
  await flush();
  // A read that starts after the reply is main's word again, including a later ending.
  lists({ [ROOT]: [summary({ unseen: false })] });
  h.run.listChanged(ROOT);
  await flush();
  expect(h.run.slots().size).toBe(0);
  lists({ [ROOT]: [summary({ unseen: true })] });
  h.run.listChanged(ROOT);
  await flush();
  expect(h.run.slots().get(ROOT)?.kind).toBe("unseen");
});

test("a failed seen marker brings the slot back", async () => {
  lists({ [ROOT]: [summary({ unseen: true })] });
  doan.readConversation!.mockResolvedValue({ events: [event("c1", { type: "turn.done" })], lastSeq: 1, turn: "idle" });
  doan.markConversationSeen!.mockResolvedValue({ error: "bad_request" });
  const h = harness();
  h.run.entriesChanged();
  await flush(); await flush();
  h.run.dismiss("c1");
  await flush(); await flush();
  expect(h.run.slots().get(ROOT)?.kind).toBe("unseen");
});

test("visiting the bound canvas marks its unseen ending seen; the project's Overview does not", async () => {
  lists({ [ROOT]: [summary({ conversationId: "u", unseen: true, canvas: { path: ".doan/canvases/a.html", id: "a" } })] });
  seq = 3;
  doan.readConversation!.mockResolvedValue({ events: [event("u", { type: "turn.done" })], lastSeq: 4, turn: "idle" });
  const h = harness();
  h.view.screen = "workspace"; h.view.loadedRoot = ROOT;
  h.run.entriesChanged();
  await flush();
  h.run.visit([ROOT]);
  await flush();
  expect(doan.markConversationSeen).not.toHaveBeenCalled();
  h.run.visit([ROOT, `${ROOT}\n.doan/canvases/a.html`]);
  expect(h.run.slots().size).toBe(0);
  await flush(); await flush();
  expect(doan.markConversationSeen).toHaveBeenCalledWith({ conversationId: "u", seq: 4 });
});

test("an ending that arrives while the person is on its row is marked seen before it is drawn", async () => {
  lists({ [ROOT]: [summary({ conversationId: "u", phase: "running" })] });
  const h = harness();
  h.view.screen = "workspace"; h.view.loadedRoot = ROOT;
  h.run.entriesChanged();
  await flush();
  h.run.visit([ROOT]);
  lists({ [ROOT]: [summary({ conversationId: "u", unseen: true })] });
  h.run.listChanged(ROOT);
  await flush();
  expect(h.run.slots().size).toBe(0);
});

test("the removal guard and Home's reason line read the list after a reload", async () => {
  lists({ [ROOT]: [summary({ conversationId: "p", phase: "waiting", fromHome: false }), summary({ conversationId: "canvas", phase: "running", fromHome: false, canvas: { path: ".doan/canvases/a.html", id: "a" } })] });
  const h = harness();
  h.run.entriesChanged();
  await flush();
  expect(h.run.running()).toEqual(new Map([[ROOT, { conversationId: "p", waiting: true }]]));
  await h.run.remove([ROOT], "doan");
  expect(h.run.removing).toMatchObject({ conversations: ["p"], body: "A conversation in doan needs your answer. Doan stops it, then removes the project from the list. Files stay on disk." });
});

test("a late project_busy keeps Home's reason line until a list read after it shows nothing running", async () => {
  const h = harness();
  h.run.entriesChanged();
  await flush();
  const sending = h.run.start(REQUEST, LAST);
  const read = deferred<ConversationSummary[]>();
  doan.listConversations!.mockImplementationOnce(() => read.promise);
  start.resolve({ error: "project_busy" });
  expect(await sending).toEqual({ error: "project_busy" });
  // The list has not caught up yet: the line names no conversation.
  expect(h.run.running().get(ROOT)).toEqual({ conversationId: "", waiting: false });
  read.resolve([summary({ conversationId: "bound", phase: "running", fromHome: false, canvas: { path: ".doan/canvases/a.html", id: "a" } })]);
  await flush();
  expect(h.run.running().get(ROOT)).toEqual({ conversationId: "bound", waiting: false });
  lists({ [ROOT]: [summary({ conversationId: "bound", fromHome: false, canvas: { path: ".doan/canvases/a.html", id: "a" } })] });
  h.run.listChanged(ROOT);
  await flush();
  expect(h.run.running().get(ROOT)).toBeUndefined();
});

test("Edit on Home after a reload rebuilds the request from the record and the index; a moved file comes back missing", async () => {
  lists({ [ROOT]: [summary({ unseen: true, provider: "codex", model: "gpt-5.5", effort: "high" })] });
  doan.readConversation!.mockResolvedValue({ events: [
    event("c1", { type: "user.message", text: "Use the Doan design preset `polish` (Polish the details).\n\nTighten the header.", anchors: [], attachments: [{ name: "a.md", size: 4, kind: "file", path: "/Users/ada/a.md" }, { name: "gone.png", size: 9, kind: "image", path: "/Users/ada/gone.png" }] }),
    event("c1", { type: "turn.started" }), event("c1", { type: "turn.failed", code: "process_exited" }),
  ], lastSeq: 3, turn: "failed" });
  doan.attachmentsFromPaths!.mockResolvedValue([
    { ok: true, attachment: { id: "new-a", name: "a.md", size: 4, kind: "file", path: "/Users/ada/a.md", pasted: false } },
    { ok: false, name: "gone.png", error: "not_found" },
  ]);
  const h = harness();
  h.run.entriesChanged();
  await flush(); await flush();
  await h.run.editOnHome("c1");
  expect(doan.attachmentsFromPaths).toHaveBeenCalledWith(["/Users/ada/a.md", "/Users/ada/gone.png"]);
  expect(h.host.goHome).toHaveBeenCalled();
  expect(h.run.restore?.request).toMatchObject({
    root: ROOT, text: "Tighten the header.", preset: { id: "polish", title: "Polish the details" }, provider: "codex", model: "gpt-5.5", effort: "high",
    attachments: [{ id: "new-a", name: "a.md", status: "ready" }, { name: "gone.png", status: "missing" }],
  });
  expect(h.run.restore?.request.attachments[1]).not.toHaveProperty("id");
});

test("Edit on Home gives way to a move the person makes while the record is read", async () => {
  lists({ [ROOT]: [summary({ unseen: true })] });
  const h = harness();
  h.run.entriesChanged();
  await flush();
  doan.readConversation!.mockResolvedValue({ events: [event("c1", { type: "user.message", text: "Draw it", anchors: [] })], lastSeq: 1, turn: "idle" });
  const editing = h.run.editOnHome("c1");
  h.run.personNavigated();
  await editing;
  expect(h.host.goHome).not.toHaveBeenCalled();
  expect(h.run.restore).toBeNull();
});
