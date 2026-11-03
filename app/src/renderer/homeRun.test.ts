import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { ConversationEvent, EventPayload } from "../main/conversation/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import { BIND_GRACE_MS as MAIN_BIND_GRACE_MS } from "../main/conversation/project";
import { BIND_GRACE_MS, HomeRun, type HomeRunHost } from "./homeRun";
import type { StartInput } from "./HomeComposerView";
import type { LastRequest } from "./homeConversations";

// buzz-home tasks U5 and review BU3 🟡2–🟡7: App's Home wiring runs through HomeRun; these drive it end to end with a
// fake window.doan and a fake navigation that behaves like App's (arrival callback, draft guard, person moves).

const ROOT = "/code/doan", OTHER = "/code/acme";
const row = (name: string): CanvasRow => ({ path: `.doan/canvases/${name}.html`, id: name, url: "u" });
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
  const view = { screen: "home" as "home" | "workspace", loadedRoot: null as string | null, entries, canvas: null as string | null };
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

test("a sent request moves to the project's Overview with that conversation and focuses the composer field, even when a permission request came before the reply", async () => {
  const h = harness();
  h.run.event(event("c1", { type: "turn.started" }));
  h.run.event(event("c1", { type: "permission.request", requestId: "r1", tool: "Edit", summary: "Edit x", options: [{ id: "a", label: "Allow", kind: "allow" }] }));
  const sending = h.run.start(REQUEST, LAST);
  start.resolve({ conversationId: "c1" });
  expect(await sending).toEqual({ ok: true, conversationId: "c1" });
  expect(h.host.openOverview).toHaveBeenCalledWith(ROOT, expect.any(Function), expect.any(Function), "c1");
  expect(h.run.strip(ROOT)?.state.kind).toBe("permission");
  h.arrive();
  expect(h.run.takeFocus()).toBe("composer");
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

// buzz-canvas-conversation design §2 'Conversation panel': until main judges the promotion, the canvas the project
// conversation's turn drew names it as drawing there; once main binds it, or after the binding window, it does not.
test("a project conversation drawing a canvas is named for that canvas until main binds it", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  h.arrive();
  h.view.entries = [list(ROOT, ["a", "pricing"])];
  h.run.entriesChanged();
  expect(h.run.drawing(ROOT, { path: ".doan/canvases/pricing.html", id: "pricing" })).toBe("c1");
  expect(h.run.drawing(ROOT, { path: ".doan/canvases/a.html", id: "a" })).toBeNull();
  expect(h.run.drawing("/elsewhere", { path: ".doan/canvases/pricing.html" })).toBeNull();
  lists({ [ROOT]: [summary({ conversationId: "c1", canvas: { path: ".doan/canvases/pricing.html", id: "pricing" } })] });
  h.run.listChanged(ROOT);
  await flush();
  expect(h.run.drawing(ROOT, { path: ".doan/canvases/pricing.html", id: "pricing" })).toBeNull();
});

test("opening a canvas conversation opens its canvas with that conversation, waiting or not", async () => {
  lists({ [ROOT]: [summary({ conversationId: "w", phase: "waiting", canvas: { path: ".doan/canvases/a.html", id: "a" } })] });
  const h = harness();
  h.run.entriesChanged();
  await flush();
  h.run.openConversation("w");
  expect(h.host.openCanvas).toHaveBeenCalledWith(ROOT, expect.objectContaining({ path: ".doan/canvases/a.html" }), { conversationId: "w", waiting: true });
  lists({ [ROOT]: [summary({ conversationId: "w", canvas: { path: ".doan/canvases/a.html", id: "a" } })] });
  h.run.listChanged(ROOT);
  await flush();
  h.run.openConversation("w");
  expect(h.host.openCanvas).toHaveBeenLastCalledWith(ROOT, expect.objectContaining({ path: ".doan/canvases/a.html" }), { conversationId: "w", waiting: false });
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
});

test("a new canvas whose folder update lands after turn.done still opens within main's binding window, not after it", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  const opened = async (after: number) => {
    start = deferred();
    const h = harness();
    const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c2" }); await sending;
    h.arrive();
    h.run.event(event("c2", { type: "turn.started" }, "t2"));
    h.run.event(event("c2", { type: "turn.done" }, "t2"));
    now.mockReturnValue(1_000_000 + after);
    h.view.entries = [list(ROOT, ["a", "late"])];
    h.run.entriesChanged();
    now.mockReturnValue(1_000_000);
    return vi.mocked(h.host.openCanvas).mock.calls.length;
  };
  expect(await opened(BIND_GRACE_MS)).toBe(1);
  expect(await opened(BIND_GRACE_MS + 1)).toBe(0);
  now.mockRestore();
});

test("the renderer's binding window is main's", () => {
  expect(BIND_GRACE_MS).toBe(MAIN_BIND_GRACE_MS);
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

test("removing a project asks; with a running Home conversation Cancel keeps both, Stop and Remove interrupts and then removes", async () => {
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
  // Without a running conversation the removal still asks first, and removes only once confirmed.
  const idle = harness();
  await idle.run.remove([ROOT], "doan");
  expect(idle.run.removing).toMatchObject({ paths: [ROOT], conversations: [], title: "Remove doan from Doan?", confirm: "Remove from Doan" });
  expect(idle.host.removeNow).not.toHaveBeenCalled();
  await idle.run.confirmRemove();
  expect(idle.host.removeNow).toHaveBeenCalledWith([ROOT]);
  expect(doan.interruptConversation).toHaveBeenCalledTimes(1);
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
// working follows the phase unless a test sets it: main also works after a turn ended (judgement, exit wait).
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", state: "current", owner: "doan", provider: "claude", fromHome: true,
  phase: "ended", unseen: false, queued: 0, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "",
  working: patch.phase !== undefined && patch.phase !== "ended", ...patch,
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

// buzz-canvas-conversation design §2 'Seen': a canvas conversation is seen only in its canvas's open panel, which marks
// it through markSeenThrough; visiting its canvas row or its project marks nothing.
test("visiting the bound canvas or its project leaves a canvas conversation's ending unseen", async () => {
  lists({ [ROOT]: [summary({ conversationId: "u", unseen: true, canvas: { path: ".doan/canvases/a.html", id: "a" } })] });
  seq = 3;
  doan.readConversation!.mockResolvedValue({ events: [event("u", { type: "turn.done" })], lastSeq: 4, turn: "idle" });
  const h = harness();
  h.view.screen = "workspace"; h.view.loadedRoot = ROOT;
  h.run.entriesChanged();
  await flush();
  h.run.visit([ROOT]);
  h.run.visit([ROOT, `${ROOT}\n.doan/canvases/a.html`]);
  await flush(); await flush();
  expect(doan.markConversationSeen).not.toHaveBeenCalled();
  expect(h.run.slots().get(`${ROOT}\n.doan/canvases/a.html`)?.kind).toBe("unseen");
});

test("an ending that arrives while the person is on its canvas row stays unseen until the panel marks it", async () => {
  const bound = { path: ".doan/canvases/a.html", id: "a" };
  lists({ [ROOT]: [summary({ conversationId: "u", phase: "running", canvas: bound })] });
  const h = harness();
  h.view.screen = "workspace"; h.view.loadedRoot = ROOT; h.view.canvas = bound.path;
  h.run.entriesChanged();
  await flush();
  h.run.visit([ROOT, `${ROOT}\n${bound.path}`]);
  lists({ [ROOT]: [summary({ conversationId: "u", unseen: true, canvas: bound })] });
  h.run.listChanged(ROOT);
  await flush();
  expect(h.run.slots().get(`${ROOT}\n${bound.path}`)?.kind).toBe("unseen");
  h.run.markSeenThrough("u", 4);
  expect(h.run.slots().size).toBe(0);
  await flush();
  expect(doan.markConversationSeen).toHaveBeenCalledWith({ conversationId: "u", seq: 4 });
});

// buzz-project spec decision 11: a project conversation is seen only while it shows in the Overview's main column with
// the window focused (the Overview marks it); opening the workspace or the Overview alone marks none.
test("visiting the project row leaves project conversations unseen and marks only canvas ones whose canvas left", async () => {
  lists({ [ROOT]: [
    summary({ conversationId: "p", unseen: true }),
    summary({ conversationId: "gone", unseen: true, canvas: { path: ".doan/canvases/gone.html", id: "gone" } }),
  ] });
  doan.readConversation!.mockResolvedValue({ events: [event("x", { type: "turn.done" })], lastSeq: 7, turn: "idle" });
  const h = harness();
  h.view.screen = "workspace"; h.view.loadedRoot = ROOT;
  h.run.entriesChanged();
  await flush(); await flush();
  h.run.visit([ROOT]);
  await flush(); await flush();
  expect(doan.markConversationSeen).toHaveBeenCalledTimes(1);
  expect(doan.markConversationSeen).toHaveBeenCalledWith({ conversationId: "gone", seq: 7 });
  expect(h.run.slots().get(ROOT)?.kind).toBe("unseen");
});

test("the Overview's seen marks go through the run: a later seq waits for one still pending and then follows it", async () => {
  lists({ [ROOT]: [summary({ conversationId: "p", unseen: true })] });
  const h = harness();
  h.run.entriesChanged();
  await flush(); await flush();
  const first = deferred<void>();
  doan.markConversationSeen!.mockImplementationOnce(() => first.promise);
  h.run.markSeenThrough("p", 4);
  expect(h.run.slots().size).toBe(0);
  expect(h.run.seenPending().has("p")).toBe(true);
  h.run.markSeenThrough("p", 6);
  await flush();
  expect(doan.markConversationSeen).toHaveBeenCalledTimes(1);
  first.resolve();
  await flush(); await flush();
  expect(doan.markConversationSeen).toHaveBeenLastCalledWith({ conversationId: "p", seq: 6 });
  expect(doan.markConversationSeen).toHaveBeenCalledTimes(2);
});

test("each root's list reads are counted, and a failed read shows as an error until a retry answers", async () => {
  const h = harness();
  doan.listConversations!.mockResolvedValueOnce({ error: "unknown" });
  h.run.entriesChanged();
  expect(h.run.listState(ROOT)).toBe("loading");
  expect(h.run.readsStarted(ROOT)).toBe(1);
  await flush();
  expect(h.run.listState(ROOT)).toBe("error");
  expect(h.run.readsApplied(ROOT)).toBe(0);
  lists({ [ROOT]: [summary({})] });
  h.run.retryList(ROOT);
  expect(h.run.listState(ROOT)).toBe("error");
  await flush();
  expect(h.run.listState(ROOT)).toEqual([summary({})]);
  expect(h.run.readsApplied(ROOT)).toBe(2);
});

test("a start from the Overview stays there: no move, no started toast, and the run still tracks the conversation", async () => {
  const h = harness();
  h.view.screen = "workspace"; h.view.loadedRoot = ROOT;
  const sending = h.run.start(REQUEST, LAST, { stay: true });
  start.resolve({ conversationId: "c1" });
  expect(await sending).toEqual({ ok: true, conversationId: "c1" });
  expect(h.host.openOverview).not.toHaveBeenCalled();
  expect(h.host.toast).not.toHaveBeenCalled();
  expect(h.run.knows("c1")).toBe(true);
  expect(h.run.takeFocus()).toBeNull();
});

test("opening a project conversation asks for it on its project's Overview", async () => {
  lists({ [ROOT]: [summary({ conversationId: "p" })] });
  const h = harness();
  h.run.entriesChanged();
  await flush();
  h.run.openConversation("p");
  expect(h.host.openOverview).toHaveBeenCalledWith(ROOT, expect.any(Function), expect.any(Function), "p");
});

test("a list that arrives right after a switch to another canvas does not mark the previous canvas's ending seen", async () => {
  lists({ [ROOT]: [summary({ conversationId: "u", phase: "running", canvas: { path: ".doan/canvases/a.html", id: "a" } })] });
  const h = harness([list(ROOT, ["a", "b"])]);
  h.view.screen = "workspace"; h.view.loadedRoot = ROOT; h.view.canvas = ".doan/canvases/a.html";
  h.run.entriesChanged();
  await flush();
  h.run.visit([ROOT, `${ROOT}\n.doan/canvases/a.html`]);
  // The person opened b; App's visit effect has not run yet when the list arrives.
  h.view.canvas = ".doan/canvases/b.html";
  lists({ [ROOT]: [summary({ conversationId: "u", unseen: true, canvas: { path: ".doan/canvases/a.html", id: "a" } })] });
  h.run.listChanged(ROOT);
  await flush();
  expect(doan.markConversationSeen).not.toHaveBeenCalled();
  expect(h.run.slots().get(`${ROOT}\n.doan/canvases/a.html`)?.kind).toBe("unseen");
});

test("the removal guard and Home's reason line read the list after a reload", async () => {
  lists({ [ROOT]: [summary({ conversationId: "p", phase: "waiting", fromHome: false }), summary({ conversationId: "canvas", phase: "running", fromHome: false, canvas: { path: ".doan/canvases/a.html", id: "a" } })] });
  const h = harness();
  h.run.entriesChanged();
  await flush();
  expect(h.run.running()).toEqual(new Map([[ROOT, { conversationId: "p", waiting: true }]]));
  await h.run.remove([ROOT], "doan");
  expect(h.run.removing).toMatchObject({ conversations: ["p"], body: "A conversation in doan needs your answer. Doan stops it, then removes the project from the list. Files and Git worktrees stay on disk." });
});

test("a project conversation main still counts as working after its turn ended holds Home's reason line and the removal guard", async () => {
  lists({ [ROOT]: [summary({ conversationId: "p", phase: "ended", working: true, fromHome: false }), summary({ conversationId: "idle", phase: "ended", working: false, fromHome: false })] });
  const h = harness();
  h.run.entriesChanged();
  await flush();
  expect(h.run.running()).toEqual(new Map([[ROOT, { conversationId: "p", waiting: false }]]));
  await h.run.remove([ROOT], "doan");
  expect(h.run.removing).toMatchObject({ conversations: ["p"], body: expect.stringContaining("A conversation is still running in doan.") });
});

test("a late project_busy shows Home's reason line without Open until a list read after it names the holder or none", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(5_000_000);
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
  // A canvas conversation running in the root is not the holder, and the list read after the refusal names none
  // working: whatever held the root let it go meanwhile.
  read.resolve([summary({ conversationId: "canvas", phase: "running", fromHome: false, canvas: { path: ".doan/canvases/a.html", id: "a" } })]);
  await flush();
  expect(h.run.running().get(ROOT)).toBeUndefined();
  // A listed project conversation that holds the root is named, with Open.
  lists({ [ROOT]: [summary({ conversationId: "p", phase: "waiting", fromHome: false })] });
  h.run.listChanged(ROOT);
  await flush();
  expect(h.run.running().get(ROOT)).toEqual({ conversationId: "p", waiting: true });
  now.mockRestore();
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

// Review RB2 🟡3, ⚪1, ⚪2.
test("after a reload the strip picks the latest activity, whatever order the history reads finish in", async () => {
  for (const order of [["new", "old"], ["old", "new"]] as const) {
    lists({ [ROOT]: [summary({ conversationId: "old", unseen: true }), summary({ conversationId: "new", unseen: true, lastActivityAt: "2026-11-01T01:00:00.000Z" })] });
    const reads = new Map<string, (value: unknown) => void>();
    doan.readConversation!.mockImplementation(({ conversationId }: { conversationId: string }) => new Promise(resolve => { reads.set(conversationId, resolve); }));
    const h = harness();
    h.run.entriesChanged();
    await flush();
    for (const id of order) { reads.get(id)!({ events: [event(id, { type: "turn.done" })], lastSeq: 1, turn: "idle" }); await flush(); }
    expect(h.run.strip(ROOT)?.conversation.conversationId).toBe("new");
  }
});

test("a list that names the conversation before the start reply registers it once and reads its history once", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST);
  lists({ [ROOT]: [summary({ phase: "running" })] });
  doan.readConversation!.mockResolvedValue({ events: [event("c1", { type: "turn.started" })], lastSeq: 1, turn: "starting" });
  h.run.listChanged(ROOT);
  await flush(); await flush();
  start.resolve({ conversationId: "c1" });
  await sending;
  await flush();
  expect(h.run.conversations.filter(c => c.conversationId === "c1")).toHaveLength(1);
  expect(doan.readConversation).toHaveBeenCalledTimes(1);
  // The run's own conversation keeps its extras: the move after the send and the new-canvas open still apply.
  expect(h.host.openOverview).toHaveBeenCalled();
});

test("Edit on Home after a reload carries the re-issued images' thumbnails", async () => {
  lists({ [ROOT]: [summary({ unseen: true })] });
  doan.readConversation!.mockResolvedValue({ events: [event("c1", { type: "user.message", text: "Look", anchors: [], attachments: [{ name: "shot.png", size: 9, kind: "image", path: "/Users/ada/shot.png" }] })], lastSeq: 1, turn: "idle" });
  const bytes = new Uint8Array([7, 8]);
  doan.attachmentsFromPaths!.mockResolvedValue([{ ok: true, attachment: { id: "n", name: "shot.png", size: 9, kind: "image", path: "/Users/ada/shot.png", pasted: false, thumbnail: bytes } }]);
  const h = harness();
  h.run.entriesChanged();
  await flush(); await flush();
  await h.run.editOnHome("c1");
  const request = h.run.restore!.request;
  expect(request.thumbnails).toEqual({ [request.attachments[0]!.key]: bytes });
});

test("a project row's slot names the project conversation the Overview should open, never a canvas one", async () => {
  lists({ [ROOT]: [
    summary({ conversationId: "done", unseen: true, lastActivityAt: "2026-11-01T00:05:00.000Z" }),
    summary({ conversationId: "asks", phase: "waiting" }),
    summary({ conversationId: "canvas", phase: "waiting", canvas: { path: ".doan/canvases/a.html", id: "a" } }),
  ], [OTHER]: [summary({ conversationId: "quiet" })] });
  // After a reload the run reads each one's history for the strip; the waiting one's has its request.
  doan.readConversation!.mockImplementation(async ({ conversationId }: { conversationId: string }) => ({ events: conversationId === "asks"
    ? [event("asks", { type: "turn.started" }), event("asks", { type: "permission.request", requestId: "r1", tool: "Edit", summary: "Edit x", options: [{ id: "a", label: "Allow", kind: "allow" }] })]
    : [event(conversationId, { type: "turn.started" }), event(conversationId, { type: "turn.done" })], lastSeq: 2, turn: "idle" }));
  const h = harness([list(ROOT, ["a"]), list(OTHER, [])]);
  h.run.entriesChanged();
  await flush(); await flush();
  expect(h.run.slotConversation(ROOT)).toEqual({ conversationId: "asks", waiting: true });
  expect(h.run.slotConversation(OTHER)).toBeNull();
});

// Review RM r1 🟡5, spec decision 6 last bullet: a turn sent in an existing project conversation that makes a new
// canvas opens it during the turn, from a baseline taken before the send and only while the person opened none.
test("a send in an existing project conversation opens the new canvas its turn makes, after one existing at the send", async () => {
  lists({ [ROOT]: [summary({ conversationId: "p" })] });
  doan.readConversation!.mockResolvedValue({ events: [event("p", { type: "turn.started" }, "t0"), event("p", { type: "turn.done" }, "t0")], lastSeq: 2, turn: "idle" });
  const send = deferred<void>();
  doan.sendConversation = vi.fn(() => send.promise);
  const h = harness();
  h.view.screen = "workspace"; h.view.loadedRoot = ROOT;
  h.run.entriesChanged();
  await flush(); await flush();
  const sending = h.run.send(ROOT, "claude", { conversationId: "p", text: "Draw a pricing page.", anchors: [] });
  // The canvas appears before main's reply: still new to this turn.
  h.view.entries = [list(ROOT, ["a", "pricing"])];
  send.resolve();
  expect(await sending).toBeUndefined();
  h.run.event(event("p", { type: "turn.started" }, "t1"));
  h.run.entriesChanged();
  expect(h.host.openCanvas).toHaveBeenCalledWith(ROOT, expect.objectContaining({ path: ".doan/canvases/pricing.html" }));
  // An edit of a canvas that already existed opens nothing (promotion by edit resets the Overview instead).
  vi.mocked(h.host.openCanvas).mockClear();
  const second = h.run.send(ROOT, "claude", { conversationId: "p", text: "Edit pricing.", anchors: [] });
  send.resolve(); await second;
  h.run.event(event("p", { type: "turn.started" }, "t2"));
  h.run.entriesChanged();
  expect(h.host.openCanvas).not.toHaveBeenCalled();
});

test("a send whose canvas appears after the person opened another canvas is offered in a toast", async () => {
  lists({ [ROOT]: [summary({ conversationId: "p" })] });
  doan.sendConversation = vi.fn(async () => {});
  const h = harness([list(ROOT, ["a"])]);
  h.view.screen = "workspace"; h.view.loadedRoot = ROOT;
  h.run.entriesChanged();
  await flush(); await flush();
  await h.run.send(ROOT, "claude", { conversationId: "p", text: "Draw.", anchors: [] });
  h.run.event(event("p", { type: "turn.started" }, "t1"));
  h.run.canvasShown(ROOT, ".doan/canvases/a.html");
  h.view.entries = [list(ROOT, ["a", "pricing"])];
  h.run.entriesChanged();
  expect(h.host.openCanvas).not.toHaveBeenCalled();
  expect(h.host.toast).toHaveBeenCalledWith("New canvas in doan", "Open", expect.any(Function));
});

test("a refused send registers no turn", async () => {
  doan.sendConversation = vi.fn(async () => ({ error: "busy" }));
  const h = harness();
  expect(await h.run.send(ROOT, "claude", { conversationId: "p", text: "x", anchors: [] })).toEqual({ error: "busy" });
  expect(h.run.knows("p")).toBe(false);
});

// Review RM r2 🟡2: a send's turn that starts and ends before main's reply keeps main's binding window for its canvas.
test("a send's new canvas opens within the binding window whether the reply, the events or an immediate end came first", async () => {
  for (const order of ["reply first", "events first", "untracked immediate end"] as const) {
    lists({ [ROOT]: [summary({ conversationId: "p" })] });
    doan.readConversation!.mockResolvedValue({ events: [], lastSeq: 0, turn: "idle" });
    const h = harness();
    h.view.screen = "workspace"; h.view.loadedRoot = ROOT; h.view.entries = [list(ROOT, ["a"])];
    h.run.entriesChanged();
    await flush(); await flush();
    if (order !== "untracked immediate end") {
      // The run knows the conversation from an earlier send whose turn ended.
      doan.sendConversation = vi.fn(async () => {});
      await h.run.send(ROOT, "claude", { conversationId: "p", text: "first", anchors: [] });
      h.run.event(event("p", { type: "turn.started" }, "t1"));
      h.run.event(event("p", { type: "turn.done" }, "t1"));
      await flush();
    }
    const reply = deferred<void>();
    doan.sendConversation = vi.fn(() => reply.promise);
    const sending = h.run.send(ROOT, "claude", { conversationId: "p", text: "Draw pricing.", anchors: [] });
    if (order === "reply first") { reply.resolve(); await sending; }
    h.run.event(event("p", { type: "turn.started" }, "t2"));
    h.run.event(event("p", { type: "turn.done" }, "t2"));
    if (order !== "reply first") { reply.resolve(); await sending; }
    h.view.entries = [list(ROOT, ["a", "pricing"])];
    h.run.entriesChanged();
    expect(h.host.openCanvas, order).toHaveBeenCalledWith(ROOT, expect.objectContaining({ path: ".doan/canvases/pricing.html" }));
  }
});

// Review RM r3 🟡1: a permission request the send's turn raised before main's reply still gets the away toast once;
// on its own project's screen none.
test("a send's permission request toasts once away from its project, whether it came before or after the reply", async () => {
  for (const tracked of [false, true]) for (const before of [true, false]) for (const away of [true, false]) {
    const label = `tracked ${tracked}, before ${before}, away ${away}`;
    seq = 0;
    lists({ [ROOT]: [] });
    doan.readConversation!.mockResolvedValue({ events: [], lastSeq: 0, turn: "idle" });
    const h = harness([list(ROOT, ["a"]), list(OTHER, [])]);
    h.view.screen = "workspace"; h.view.loadedRoot = away ? OTHER : ROOT;
    h.run.entriesChanged();
    await flush();
    if (tracked) {
      start = deferred();
      const sending = h.run.start(REQUEST, LAST, { stay: true }); start.resolve({ conversationId: "c1" }); await sending;
      await flush();
      h.run.event(event("c1", { type: "turn.started" }, "t1"));
      h.run.event(event("c1", { type: "turn.done" }, "t1"));
    }
    const ask = () => {
      h.run.event(event("c1", { type: "turn.started" }, "t2"));
      h.run.event(event("c1", { type: "permission.request", requestId: "r2", tool: "Edit", summary: "Edit x", options: [{ id: "a", label: "Allow", kind: "allow" }] }, "t2"));
    };
    const reply = deferred<void>();
    doan.sendConversation = vi.fn(() => reply.promise);
    const sending = h.run.send(ROOT, "claude", { conversationId: "c1", text: "Draw.", anchors: [] });
    if (before) ask();
    reply.resolve(); await sending;
    if (!before) ask();
    await flush();
    expect(h.run.strip(ROOT)?.state.kind, label).toBe("permission");
    const toasts = vi.mocked(h.host.toast).mock.calls.filter(call => call[0] === "Claude Code needs your answer in doan.");
    expect(toasts, label).toHaveLength(away ? 1 : 0);
  }
});

// permission-mode design '저장 규칙' 'Plan 승인 뒤 전환': main moves a conversation out of Plan after a Claude plan is
// approved; the provider's last mode follows it, wherever the conversation is shown, by the same rule as a pick.
test("a conversation that leaves Plan in main's list tells App the mode it moved to", async () => {
  const h = harness();
  h.host.followedMode = vi.fn();
  lists({ [ROOT]: [summary({ permissionMode: "plan" })] });
  h.run.listChanged(ROOT); await flush();
  expect(h.host.followedMode).not.toHaveBeenCalled();
  lists({ [ROOT]: [summary({ permissionMode: "acceptEdits" })] });
  h.run.listChanged(ROOT); await flush();
  expect(h.host.followedMode).toHaveBeenLastCalledWith("claude", "acceptEdits");
  // Any other change is a pick the composer already remembered, and a first read reports nothing.
  lists({ [ROOT]: [summary({ permissionMode: "bypass" })] });
  h.run.listChanged(ROOT); await flush();
  lists({ [ROOT]: [summary({ permissionMode: "plan" }), summary({ conversationId: "c2", permissionMode: "plan" })] });
  h.run.listChanged(ROOT); await flush();
  lists({ [ROOT]: [summary({}), summary({ conversationId: "c2", permissionMode: "plan" })] });
  h.run.listChanged(ROOT); await flush();
  expect(h.host.followedMode).toHaveBeenCalledTimes(2);
  expect(h.host.followedMode).toHaveBeenLastCalledWith("claude", "default");
});

// conversation-delete tasks T3, design §3.2: a deleted conversation leaves the strip, Edit on Home and the run's
// records, and late events or a list read started before the delete do not bring it back.
test("a deleted conversation leaves the strip and Edit on Home", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  h.arrive();
  h.run.event(event("c1", { type: "turn.started" }));
  h.run.event(event("c1", { type: "turn.done" }));
  expect(h.run.strip(ROOT)?.conversation.conversationId).toBe("c1");
  expect(h.run.lastRequests.get(ROOT)?.conversationId).toBe("c1");
  h.run.deleted("c1");
  expect(h.run.strip(ROOT)).toBeNull();
  expect(h.run.conversations).toEqual([]);
  expect(h.run.lastRequests.has(ROOT)).toBe(false);
  expect(h.run.knows("c1")).toBe(false);
  expect(h.run.slots().size).toBe(0);
  await h.run.editOnHome("c1");
  expect(h.host.goHome).not.toHaveBeenCalled();
  expect(h.host.changed).toHaveBeenCalled();
});

test("late events and a list read from before the delete do not bring a deleted conversation back", async () => {
  // The list read was answered before main deleted it; its history still read then.
  lists({ [ROOT]: [summary({ conversationId: "c1", unseen: true })] });
  doan.readConversation!.mockResolvedValue({ events: [event("c1", { type: "user.message", text: "Draw it", anchors: [] }), event("c1", { type: "turn.done" })], lastSeq: 2, turn: "idle" });
  const h = harness();
  h.run.event(event("c2", { type: "turn.started" }));
  h.run.deleted("c1");
  h.run.event(event("c1", { type: "turn.started" }));
  h.run.entriesChanged();
  await flush(); await flush();
  expect(h.run.strip(ROOT)).toBeNull();
  expect(h.run.conversations).toEqual([]);
  expect(doan.readConversation).not.toHaveBeenCalledWith({ conversationId: "c1" });
});

test("deleting one conversation leaves another's strip", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  h.arrive();
  h.run.deleted("c9");
  expect(h.run.strip(ROOT)?.conversation.conversationId).toBe("c1");
  expect(h.run.lastRequests.get(ROOT)?.conversationId).toBe("c1");
});

// Review RB 🟡1: a claim whose history read is in flight when the conversation is deleted must not put it back.
test("a claim whose history read lands after the delete registers nothing", async () => {
  lists({ [ROOT]: [summary({ conversationId: "c1", unseen: true })] });
  const read = deferred<unknown>();
  doan.readConversation!.mockImplementation(() => read.promise);
  const h = harness();
  h.run.entriesChanged();
  await flush(); await flush();
  expect(doan.readConversation).toHaveBeenCalledWith({ conversationId: "c1" });
  h.run.deleted("c1");
  h.run.event(event("c1", { type: "turn.started" }));
  read.resolve({ events: [event("c1", { type: "user.message", text: "Draw it", anchors: [] }), event("c1", { type: "turn.done" })], lastSeq: 2, turn: "idle" });
  await flush(); await flush();
  expect(h.run.conversations).toEqual([]);
  expect(h.run.strip(ROOT)).toBeNull();
});

// Review RB ⚪3: late events of a deleted conversation are not buffered, so a burst of them cannot push another
// conversation's early events (those that came before its start reply) out of the bounded buffer.
test("late events of a deleted conversation do not crowd out another conversation's buffered events", async () => {
  const h = harness();
  h.run.event(event("c2", { type: "turn.started" }));
  h.run.event(event("c2", { type: "permission.request", requestId: "r1", tool: "Edit", summary: "Edit x", options: [{ id: "a", label: "Allow", kind: "allow" }] }));
  h.run.deleted("c1");
  for (let i = 0; i < 500; i++) h.run.event(event("c1", { type: "activity", kind: "edit", summary: "Editing" }));
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c2" }); await sending;
  expect(h.run.strip(ROOT)?.state.kind).toBe("permission");
});
