import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { ConversationEvent, EventPayload } from "../main/conversation/types";
import type { CanvasRow, FolderEntry } from "../main/view";
import { HomeRun, type HomeRunHost } from "./homeRun";
import type { StartInput } from "./HomeComposerView";
import type { LastRequest } from "./homeConversations";

// App's Home wiring runs through HomeRun; these drive it end to end with a
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
    interruptProjectTurn: vi.fn(async () => {}),
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
  doan.interruptProjectTurn!.mockImplementation(async () => { order.push("interrupt"); });
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

test("removing a project asks; with a running Home conversation Cancel keeps both, Stop and remove interrupts and then removes", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  await h.run.remove([ROOT], "doan");
  expect(h.run.removing).toMatchObject({ paths: [ROOT], conversations: ["c1"], title: "Stop the conversation and remove doan?" });
  h.run.cancelRemove();
  expect(h.run.removing).toBeNull();
  expect(h.host.removeNow).not.toHaveBeenCalled();
  expect(doan.interruptProjectTurn).not.toHaveBeenCalled();
  await h.run.remove([ROOT], "doan");
  lists({ [ROOT]: [summary({ phase: "running" })] });
  await h.run.confirmRemove();
  expect(h.order).toEqual(["interrupt", "remove"]);
  expect(doan.interruptProjectTurn).toHaveBeenCalledWith({ conversationId: "c1", turnId: "turn-1" });
  // Without a running conversation the removal still asks first, and removes only once confirmed.
  lists({});
  const idle = harness();
  await idle.run.remove([ROOT], "doan");
  expect(idle.run.removing).toMatchObject({ paths: [ROOT], conversations: [], title: "Remove doan from Doan?", confirm: "Remove from Doan" });
  expect(idle.host.removeNow).not.toHaveBeenCalled();
  await idle.run.confirmRemove();
  expect(idle.host.removeNow).toHaveBeenCalledWith([ROOT]);
  expect(doan.interruptProjectTurn).toHaveBeenCalledTimes(1);
});

test.each(["error reply", "rejected request"])("partial removal retains the group and retries only outstanding stops after a %s", async failure => {
  const h = harness([list(ROOT, []), list(OTHER, [])]);
  const running = (id: string) => summary({ conversationId: id, phase: "running" });
  lists({ [ROOT]: [running("old")], [OTHER]: [running("other")] });
  h.run.entriesChanged();
  await flush();
  await h.run.remove([ROOT, OTHER], "Checkout");
  // Main knows about a different conversation before the renderer gets a list-changed notice.
  lists({ [ROOT]: [running("current")], [OTHER]: [running("other")] });
  const stop = deferred<void>();
  doan.interruptProjectTurn!.mockImplementationOnce(() => stop.promise);
  if (failure === "error reply") doan.interruptProjectTurn!.mockResolvedValueOnce({ error: "busy" });
  else doan.interruptProjectTurn!.mockRejectedValueOnce(new Error("disconnected"));
  const first = h.run.confirmRemove();
  await flush();
  expect(doan.interruptProjectTurn!.mock.calls).toEqual([[{ conversationId: "current", turnId: "turn-1" }], [{ conversationId: "other", turnId: "turn-1" }]]);
  expect(h.host.removeNow).not.toHaveBeenCalled();
  expect(h.run.removing?.title).toBe("Stopping conversations…");
  await h.run.confirmRemove();
  h.run.cancelRemove();
  stop.resolve();
  await first;
  expect(h.host.removeNow).not.toHaveBeenCalled();
  expect(h.run.removing).toMatchObject({ title: "Checkout is still in Doan", cancel: "Keep project", confirm: "Retry",
    body: "The conversation in doan stopped. Retry to stop the remaining conversation and remove Checkout.",
    error: "Couldn’t stop the conversation in acme." });
  if (failure === "error reply") {
    await h.run.confirmRemove();
    expect(doan.interruptProjectTurn!.mock.calls.map(([input]) => input.conversationId)).toEqual(["current", "other", "other"]);
    expect(h.host.removeNow).toHaveBeenCalledExactlyOnceWith([ROOT, OTHER]);
  } else {
    h.run.cancelRemove();
    expect(h.run.removing).toBeNull();
    expect(doan.interruptProjectTurn).toHaveBeenCalledTimes(2);
    expect(h.host.removeNow).not.toHaveBeenCalled();
  }
});

test.each(["same title in one worktree", "same worktree label"])("partial removal distinguishes targets with the %s, including after Retry", async scenario => {
  const together = scenario === "same title in one worktree";
  const other = "/elsewhere/doan";
  const paths = together ? [ROOT] : [ROOT, other];
  const h = harness(paths.map(root => list(root, [])));
  const first = summary({ conversationId: "first-id", phase: "waiting", title: "Draw checkout" });
  const second = summary({ conversationId: "second-id", phase: "running", title: "Draw checkout" });
  lists(together ? { [ROOT]: [first, second] } : { [ROOT]: [first], [other]: [second] });
  h.run.entriesChanged(); await flush();
  await h.run.remove(paths, "Checkout");
  doan.interruptProjectTurn!.mockResolvedValueOnce(undefined).mockResolvedValue({ error: "busy" });
  await h.run.confirmRemove();
  const stopped = together ? "first-id" : ROOT, failed = together ? "second-id" : other;
  expect(h.run.removing?.body).toContain(stopped);
  expect(h.run.removing?.error).toContain(failed);
  lists(together ? { [ROOT]: [second] } : { [other]: [second] });
  await h.run.confirmRemove();
  expect(h.run.removing?.body).toContain(stopped);
  expect(h.run.removing?.error).toContain(failed);
  expect(doan.interruptProjectTurn!.mock.calls.map(([target]) => target.conversationId)).toEqual(["first-id", "second-id", "second-id"]);
});

test.each(["new turn in the stopped conversation", "different conversation replacing the failure"])("Retry reconfirms a %s and binds its next Stop to the turn", async scenario => {
  const h = harness([list(ROOT, []), list(OTHER, [])]);
  const running = (id: string, turn: string) => ({ ...summary({ conversationId: id, phase: "running" }), projectTurnId: turn });
  const main = running("main", "m1"), payment = running("payment", "p1");
  lists({ [ROOT]: [main], [OTHER]: [payment] });
  h.run.entriesChanged(); await flush();
  await h.run.remove([ROOT, OTHER], "Checkout");
  doan.interruptProjectTurn!.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ error: "busy" });
  await h.run.confirmRemove();
  const replacement = scenario.startsWith("new") ? running("main", "m2") : running("shipping", "s1");
  lists(scenario.startsWith("new") ? { [ROOT]: [replacement], [OTHER]: [payment] } : { [OTHER]: [replacement] });
  await h.run.confirmRemove();
  expect(h.run.removing?.confirm).toBe("Stop and remove");
  expect(doan.interruptProjectTurn).toHaveBeenCalledTimes(2);
  expect(h.host.removeNow).not.toHaveBeenCalled();
  await h.run.confirmRemove();
  expect(doan.interruptProjectTurn).toHaveBeenCalledWith({ conversationId: replacement.conversationId, turnId: replacement.projectTurnId });
  expect(h.host.removeNow).toHaveBeenCalledOnce();
});

test("a group still loading in main stays registered until its full membership is confirmed", async () => {
  const h = harness();
  let roots: string[] | null = null;
  lists({ [ROOT]: [summary({ phase: "running" })] });
  h.run.entriesChanged(); await flush();
  await h.run.remove([ROOT], "Checkout", () => roots);
  await h.run.confirmRemove();
  expect(doan.interruptProjectTurn).not.toHaveBeenCalled();
  expect(h.host.removeNow).not.toHaveBeenCalled();
  expect(h.run.removing?.error).toBe("Doan is still loading a project.");
  roots = [ROOT];
  lists({});
  vi.mocked(h.host.removeNow).mockResolvedValueOnce({ kind: "loading" });
  await h.run.confirmRemove();
  expect(h.run.removing).toMatchObject({ error: "Doan is still loading a project.", cancel: "Keep project", confirm: "Retry" });
  vi.mocked(h.host.removeNow).mockResolvedValueOnce({ kind: "groupChanged", paths: [ROOT, OTHER] });
  await h.run.confirmRemove();
  expect(h.run.removing?.paths).toEqual([ROOT, OTHER]);
  expect(h.run.removing?.body).toContain("2 registered worktrees");
  expect(h.host.removeNow).toHaveBeenCalledTimes(2);
});

test("a plain removal that finds new work asks for Stop and remove before interrupting it", async () => {
  const h = harness();
  await h.run.remove([ROOT], "Checkout");
  lists({ [ROOT]: [summary({ phase: "running" })] });
  await h.run.confirmRemove();
  expect(h.host.removeNow).not.toHaveBeenCalled();
  expect(doan.interruptProjectTurn).not.toHaveBeenCalled();
  expect(h.run.removing?.confirm).toBe("Stop and remove");
  // The work ended before the second press.
  lists({});
  await h.run.confirmRemove();
  expect(doan.interruptProjectTurn).not.toHaveBeenCalled();
  expect(h.host.removeNow).toHaveBeenCalledExactlyOnceWith([ROOT]);
});

test("an unreadable stop target list keeps every worktree registered until a successful retry", async () => {
  const h = harness([list(ROOT, []), list(OTHER, [])]);
  await h.run.remove([ROOT, OTHER], "Checkout");
  doan.listConversations!.mockRejectedValueOnce(new Error("disconnected"));
  await h.run.confirmRemove();
  expect(h.host.removeNow).not.toHaveBeenCalled();
  expect(h.run.removing).toMatchObject({ cancel: "Keep project", confirm: "Retry" });
  await h.run.confirmRemove();
  expect(h.host.removeNow).toHaveBeenCalledExactlyOnceWith([ROOT, OTHER]);
});

test("Edit on Home sends the last request back to Home", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  h.arrive();
  await h.run.editOnHome("c1");
  expect(h.host.goHome).toHaveBeenCalled();
  expect(h.run.restore).toEqual({ request: { ...LAST, conversationId: "c1" }, seq: 1 });
});

// A Home conversation's new canvas is a handoff target like any other: the handoff's own move or toast says where the
// work went (PRODUCT §5 item 2 'Handoff'), so the run opens nothing and offers nothing itself.
test("a new canvas a Home conversation's turn makes opens nothing and toasts nothing", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST);
  h.view.entries = [list(ROOT, ["a", "early"])];
  start.resolve({ conversationId: "c1" });
  await sending;
  h.arrive();
  h.run.event(event("c1", { type: "turn.started" }));
  h.view.entries = [list(ROOT, ["a", "early", "pricing"])];
  h.run.entriesChanged();
  h.run.event(event("c1", { type: "turn.done" }));
  await flush();
  expect(h.host.openCanvas).not.toHaveBeenCalled();
  expect(h.host.toast).not.toHaveBeenCalledWith("New canvas in doan", "Open", expect.any(Function));
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

// A question waits like a permission request: the slot, rank and toast read it as waiting.
test("a project conversation waiting for a question's answer reads as waiting", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST);
  start.resolve({ conversationId: "c1" });
  await sending;
  h.run.event(event("c1", { type: "turn.started" }));
  h.run.event(event("c1", { type: "question.request", requestId: "q1", questions: [{ id: "0", header: "Layout", question: "Which layout?", options: [], multiSelect: false, other: true }] }));
  expect(h.run.strips.c1).toEqual({ kind: "question", requestId: "q1", question: "Which layout?" });
});

// What survives a reload comes from main's list.
// working follows the phase unless a test sets it: main also works after a turn ended (judgement, exit wait).
const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", owner: "doan", provider: "claude", fromHome: true,
  phase: "ended", unseen: false, queued: 0, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "",
  working: patch.phase !== undefined && patch.phase !== "ended", ...(!patch.canvas ? { projectTurnId: "turn-1" } : {}), ...patch,
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
  expect(h.run.slots()).toEqual(new Map([[ROOT, { kind: "working", label: "Claude Code is working" }], [`${OTHER}\n.doan/canvases/x.html`, { kind: "unseen", label: "Conversation finished — unread" }]]));
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

// A canvas conversation is seen only in its canvas's open panel, which marks
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

// A project conversation is seen only while it shows in the Overview's main column with
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

// A canvas-panel conversation's slot moves to the project row too once its canvas leaves, so the project row's visit
// must clear it as it clears a Home one's.
test("visiting the project row marks a canvas-panel conversation's ending seen once its canvas left", async () => {
  lists({ [ROOT]: [summary({ conversationId: "panel", unseen: true, fromHome: false, canvas: { path: ".doan/canvases/gone.html", id: "gone" } })] });
  doan.readConversation!.mockResolvedValue({ events: [event("x", { type: "turn.done" })], lastSeq: 5, turn: "idle" });
  const h = harness();
  h.view.screen = "workspace"; h.view.loadedRoot = ROOT;
  h.run.entriesChanged();
  await flush(); await flush();
  h.run.visit([ROOT]);
  await flush(); await flush();
  expect(doan.markConversationSeen).toHaveBeenCalledWith({ conversationId: "panel", seq: 5 });
  expect(h.run.slots().size).toBe(0);
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

test("a failed list's Retry runs until its read settles, and counts the Retries that fail in a row until a read answers", async () => {
  const h = harness();
  doan.listConversations!.mockResolvedValueOnce({ error: "unknown" });
  h.run.entriesChanged();
  // The first read is the loading state, not a retry.
  expect(h.run.listRetry(ROOT)).toEqual({ running: false, failures: 0 });
  await flush();
  expect(h.run.listRetry(ROOT)).toEqual({ running: false, failures: 0 });
  doan.listConversations!.mockResolvedValueOnce({ error: "unknown" });
  vi.mocked(h.host.changed).mockClear();
  h.run.retryList(ROOT);
  // The press shows at once: the host draws again with Retry running.
  expect(h.run.listRetry(ROOT)).toEqual({ running: true, failures: 0 });
  expect(h.host.changed).toHaveBeenCalled();
  await flush();
  expect(h.run.listRetry(ROOT)).toEqual({ running: false, failures: 1 });
  // A read made for another reason (an entries change) that fails again is not a Retry: no busy, no new count.
  doan.listConversations!.mockResolvedValueOnce({ error: "unknown" });
  h.run.entriesChanged();
  expect(h.run.listRetry(ROOT)).toEqual({ running: false, failures: 1 });
  await flush();
  expect(h.run.listRetry(ROOT)).toEqual({ running: false, failures: 1 });
  lists({ [ROOT]: [summary({})] });
  h.run.retryList(ROOT);
  await flush();
  expect(h.run.listRetry(ROOT)).toEqual({ running: false, failures: 0 });
});

// POSTMORTEM 2026-11-17 'Removing a project or trashing a canvas left state keyed by it behind': a project added
// again in the same run reads its list as new, not as the failure it had before the removal.
test("a removed root forgets its failed list and Retries: added again, its list loads instead of showing the old failure", async () => {
  const h = harness();
  doan.listConversations!.mockResolvedValueOnce({ error: "unknown" });
  h.run.entriesChanged();
  await flush();
  doan.listConversations!.mockResolvedValueOnce({ error: "unknown" });
  h.run.retryList(ROOT);
  await flush();
  expect(h.run.listRetry(ROOT)).toEqual({ running: false, failures: 1 });
  h.view.entries = [];
  h.run.entriesChanged();
  h.run.forgetRoots([ROOT]);
  const read = deferred<unknown>();
  doan.listConversations!.mockReturnValueOnce(read.promise);
  h.view.entries = [list(ROOT, ["a"])];
  h.run.entriesChanged();
  expect(h.run.listState(ROOT)).toBe("loading");
  expect(h.run.listRetry(ROOT)).toEqual({ running: false, failures: 0 });
  read.resolve([summary({})]);
  await flush();
  expect(h.run.listState(ROOT)).toEqual([summary({})]);
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

test("the removal guard reads the list after a reload", async () => {
  lists({ [ROOT]: [summary({ conversationId: "p", phase: "waiting", fromHome: false }), summary({ conversationId: "canvas", phase: "running", fromHome: false, canvas: { path: ".doan/canvases/a.html", id: "a" } })] });
  const h = harness();
  h.run.entriesChanged();
  await flush();
  // Waiting for an answer: the removal still stops it first and says why.
  await h.run.remove([ROOT], "doan");
  expect(h.run.removing).toMatchObject({ conversations: ["p"], body: "A conversation in doan needs your answer. Doan stops it, then removes the project from the list. Files and Git worktrees stay on disk." });
});

// Only project conversations are stopped: nothing is promoted any more, so a working conversation with a canvas is a
// canvas one, even one an earlier build's list still gives a project turn id.
test("the removal guard leaves out a working canvas conversation, whatever project turn id it carries", async () => {
  lists({ [ROOT]: [summary({ conversationId: "canvas", phase: "running", fromHome: false, canvas: { path: ".doan/canvases/a.html", id: "a" }, projectTurnId: "turn-9" })] });
  const h = harness();
  h.run.entriesChanged();
  await flush();
  await h.run.remove([ROOT], "doan");
  expect(h.run.removing).toMatchObject({ conversations: [] });
});

test("a project conversation main still counts as working after its turn ended holds the removal guard", async () => {
  lists({ [ROOT]: [summary({ conversationId: "p", phase: "ended", working: true, fromHome: false }), summary({ conversationId: "idle", phase: "ended", working: false, fromHome: false })] });
  const h = harness();
  h.run.entriesChanged();
  await flush();
  await h.run.remove([ROOT], "doan");
  expect(h.run.removing).toMatchObject({ conversations: ["p"], body: expect.stringContaining("A conversation is still running in doan.") });
});

test("Edit on Home after a restart refuses a recorded folder whose path now names a file, releasing the new id", async () => {
  lists({ [ROOT]: [summary({ unseen: true, provider: "codex", model: "gpt-5.5", effort: "high" })] });
  doan.readConversation!.mockResolvedValue({ events: [
    event("c1", { type: "user.message", text: "Look.", anchors: [], attachments: [{ name: "refs", kind: "directory", path: "/Users/ada/refs" }, { name: "a.md", size: 4, kind: "file", path: "/Users/ada/a.md" }] }),
    event("c1", { type: "turn.started" }), event("c1", { type: "turn.failed", code: "process_exited" }),
  ], lastSeq: 3, turn: "failed" });
  doan.removeAttachment = vi.fn(async () => true);
  doan.attachmentsFromPaths!.mockResolvedValue([
    { ok: true, attachment: { id: "new-refs", name: "refs", size: 3, kind: "file", path: "/Users/ada/refs", pasted: false } },
    { ok: true, attachment: { id: "new-a", name: "a.md", size: 4, kind: "file", path: "/Users/ada/a.md", pasted: false } },
  ]);
  const h = harness();
  h.run.entriesChanged();
  await flush(); await flush();
  await h.run.editOnHome("c1");
  expect(h.run.restore?.request.attachments).toMatchObject([{ name: "refs", kind: "directory", status: "missing" }, { id: "new-a", name: "a.md", status: "ready" }]);
  expect(h.run.restore?.request.attachments[0]!.id).toBeUndefined();
  expect(doan.removeAttachment).toHaveBeenCalledWith("new-refs");
  expect(doan.removeAttachment).not.toHaveBeenCalledWith("new-a");
});
test("Edit on Home after a reload rebuilds the request from the record and the index; a moved file comes back missing", async () => {
  lists({ [ROOT]: [summary({ unseen: true, provider: "codex", model: "gpt-5.5", effort: "high" })] });
  doan.readConversation!.mockResolvedValue({ events: [
    event("c1", { type: "user.message", text: "Use the Doan design preset `polish` (Polish the details).\n\nTighten the header.", anchors: [], attachments: [{ name: "a.md", size: 4, kind: "file", path: "/Users/ada/a.md", lines: 2, excerpt: "first" }, { name: "gone.png", size: 9, kind: "image", path: "/Users/ada/gone.png" }] }),
    event("c1", { type: "turn.started" }), event("c1", { type: "turn.failed", code: "process_exited" }),
  ], lastSeq: 3, turn: "failed" });
  doan.attachmentsFromPaths!.mockResolvedValue([
    { ok: true, attachment: { id: "new-a", name: "a.md", size: 4, kind: "file", path: "/Users/ada/a.md", lines: 2, excerpt: "first", pasted: false } },
    { ok: false, name: "gone.png", error: "not_found" },
  ]);
  const h = harness();
  h.run.entriesChanged();
  await flush(); await flush();
  await h.run.editOnHome("c1");
  expect(doan.attachmentsFromPaths).toHaveBeenCalledWith(["/Users/ada/a.md", "/Users/ada/gone.png"], [{ lines: 2, excerpt: "first" }, {}]);
  expect(h.host.goHome).toHaveBeenCalled();
  expect(h.run.restore?.request).toMatchObject({
    root: ROOT, text: "Tighten the header.", preset: { id: "polish", title: "Polish the details" }, provider: "codex", model: "gpt-5.5", effort: "high",
    attachments: [{ id: "new-a", name: "a.md", status: "ready", lines: 2, excerpt: "first" }, { name: "gone.png", status: "missing" }],
  });
  expect(h.run.restore?.request.attachments[1]).not.toHaveProperty("id");
});

test.each(["navigation", "provider gone"])("Edit on Home discards only the newly issued files when its rebuild loses its destination (%s)", async cause => {
  lists({ [ROOT]: [summary({ fromHome: false })] });
  const file = { name: "brief.md", size: 4, kind: "file" as const, path: "/files/brief.md" };
  doan.readConversation!.mockResolvedValue({ events: [event("c1", { type: "user.message", text: "Look", anchors: [], attachments: [file] })] });
  doan.removeAttachment = vi.fn(async () => true);
  const issued = deferred<unknown>();
  const files = (id: string) => [{ ok: true, attachment: { ...file, id, pasted: false } }];
  doan.attachmentsFromPaths!.mockResolvedValueOnce(files("owned")).mockReturnValueOnce(issued.promise);
  const h = harness();
  h.run.entriesChanged();
  await flush();
  await h.run.editOnHome("c1");
  const prior = h.run.restore;
  expect(prior?.request.attachments.map(chip => chip.id)).toEqual(["owned"]);
  const editing = h.run.editOnHome("c1");
  await flush();
  expect(doan.attachmentsFromPaths).toHaveBeenCalledTimes(2);
  if (cause === "navigation") h.run.personNavigated();
  else {
    lists({ [ROOT]: [] });
    h.run.listChanged(ROOT);
    await flush();
  }
  issued.resolve(files("fresh"));
  await editing;
  expect(doan.removeAttachment.mock.calls).toEqual([["fresh"]]);
  expect(h.host.goHome).toHaveBeenCalledOnce();
  expect(h.run.restore).toBe(prior);
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

test("a refused send registers no turn", async () => {
  doan.sendConversation = vi.fn(async () => ({ error: "busy" }));
  const h = harness();
  expect(await h.run.send(ROOT, "claude", { conversationId: "p", text: "x", anchors: [] })).toEqual({ error: "busy" });
  expect(h.run.knows("p")).toBe(false);
});

// A permission request the send's turn raised before main's reply still gets the away toast once;
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

// Main moves a conversation out of Plan after a Claude plan is
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

// A deleted conversation leaves the strip, Edit on Home and the run's
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

// A claim whose history read is in flight when the conversation is deleted must not put it back.
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

// Late events of a deleted conversation are not buffered, so a burst of them cannot push another
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

// Settings > MCP Connectors asks which agents have a Doan turn running anywhere.
test("running providers are the agents with a Doan conversation running or waiting in any project; terminal ones and ended ones don't count", async () => {
  lists({
    [ROOT]: [summary({ conversationId: "a", provider: "codex", phase: "waiting" }), summary({ conversationId: "b", provider: "cursor", phase: "ended" })],
    [OTHER]: [summary({ conversationId: "c", provider: "claude", phase: "running", owner: "legacy-external" }), summary({ conversationId: "d", provider: "copilot", phase: "running", canvas: { path: ".doan/canvases/x.html", id: "x" } })],
  });
  const h = harness([list(ROOT, ["a"]), list(OTHER, ["x"])]);
  h.run.entriesChanged();
  await flush();
  expect([...h.run.runningProviders()].sort()).toEqual(["codex", "copilot"]);
});

// POSTMORTEM 2026-11-05 'Send now': main drops a conversation's suggestion when
// its next turn is accepted. A list read that started before that may still carry it and lands after the composer
// emptied, so only reads started after the accepted message say whether a suggestion stands.
test("a stale list read does not bring back a cleared suggestion", async () => {
  const h = harness();
  const shown = () => { const listed = h.run.listState(ROOT); return Array.isArray(listed) ? listed.find(c => c.conversationId === "c1")?.suggestion : "unread"; };
  lists({ [ROOT]: [summary({ suggestion: "Make the header lighter" })] });
  h.run.listChanged(ROOT);
  await flush();
  expect(shown()).toBe("Make the header lighter");

  // A read in flight from before the send, answering with the old suggestion.
  const stale = deferred<ConversationSummary[]>();
  doan.listConversations!.mockImplementationOnce(() => stale.promise);
  h.run.listChanged(ROOT);
  h.run.event(event("c1", { type: "user.message", text: "Make the header lighter", anchors: [] }, "t2"));
  // main accepted the turn: the suggestion is gone at once, before any read.
  expect(shown()).toBeUndefined();
  // The notice main sent with the accepted turn asks for one more read after the stale one.
  h.run.listChanged(ROOT);
  const fresh = deferred<ConversationSummary[]>();
  doan.listConversations!.mockImplementationOnce(() => fresh.promise);
  stale.resolve([summary({ suggestion: "Make the header lighter" })]);
  await flush();
  // The stale read is applied (its other rows count) without the suggestion.
  expect(h.run.readsApplied(ROOT)).toBe(2);
  expect(shown()).toBeUndefined();
  expect(doan.listConversations).toHaveBeenCalledTimes(3);
  fresh.resolve([summary({ phase: "running" })]);
  await flush();
  expect(shown()).toBeUndefined();

  // A read started after the turn is trusted again: its next suggestion shows.
  lists({ [ROOT]: [summary({ suggestion: "Now tighten the footer" })] });
  h.run.listChanged(ROOT);
  await flush();
  expect(shown()).toBe("Now tighten the footer");
});

// Quick Open's pick carries the root and the canvas rows it searched, not the view at the time of the click.
test("a Quick Open pick opens a canvas conversation's matched row from the rows it searched, waiting or not", async () => {
  lists({ [ROOT]: [summary({ conversationId: "w", phase: "waiting", canvas: { path: ".doan/canvases/a.html", id: "a" } }), summary({ conversationId: "e", canvas: { path: ".doan/canvases/b.html", id: "b" } })] });
  const h = harness([list(ROOT, [])]);
  h.run.entriesChanged();
  await flush();
  const rows = [row("a"), row("b")];
  expect(h.run.openFound(ROOT, "w", rows)).toBe("opened");
  expect(h.host.openCanvas).toHaveBeenLastCalledWith(ROOT, rows[0], { conversationId: "w", waiting: true });
  expect(h.run.openFound(ROOT, "e", rows)).toBe("opened");
  expect(h.host.openCanvas).toHaveBeenLastCalledWith(ROOT, rows[1], { conversationId: "e", waiting: false });
  expect(h.host.openOverview).not.toHaveBeenCalled();
});

test("a Quick Open pick of a project conversation asks for it on its Overview and says once it arrived whether it waits", async () => {
  lists({ [ROOT]: [summary({ conversationId: "p" }), summary({ conversationId: "q", phase: "waiting" })] });
  const h = harness();
  h.run.entriesChanged();
  await flush();
  const arrived = vi.fn();
  expect(h.run.openFound(ROOT, "p", [], arrived)).toBe("opened");
  expect(h.host.openOverview).toHaveBeenLastCalledWith(ROOT, expect.any(Function), expect.any(Function), "p");
  expect(arrived).not.toHaveBeenCalled();
  expect(h.accept()).toBe(true);
  expect(arrived).toHaveBeenLastCalledWith(false);
  expect(h.run.openFound(ROOT, "q", [], arrived)).toBe("opened");
  h.accept();
  expect(arrived).toHaveBeenLastCalledWith(true);
});

test("a Quick Open pick that can no longer be opened goes nowhere and says why", async () => {
  lists({ [ROOT]: [summary({ conversationId: "gone", canvas: { path: ".doan/canvases/gone.html", id: "gone" } }), summary({ conversationId: "dup", canvas: { path: ".doan/canvases/a.html", id: "a" } })] });
  const h = harness();
  h.run.entriesChanged();
  await flush();
  const twin: CanvasRow = { path: ".doan/canvases/copy.html", id: "a", url: "u" };
  expect(h.run.openFound(ROOT, "deleted", [row("a")])).toBe("deleted");
  expect(h.run.openFound(OTHER, "dup", [row("a")])).toBe("deleted");
  expect(h.run.openFound(ROOT, "gone", [row("a")])).toBe("missing");
  expect(h.run.openFound(ROOT, "dup", [row("a"), twin])).toBe("duplicate");
  expect(h.host.openCanvas).not.toHaveBeenCalled();
  expect(h.host.openOverview).not.toHaveBeenCalled();
});

// The notification and strip Open keep the shipped lookup: a shared id opens the first matching row, and a conversation
// bound without an id matches by path (Quick Open alone refuses those through conversationCanvasMatch).
test("a notification Open of a canvas conversation whose id is shared opens the first matching row, and an id-less one opens by path", async () => {
  const twin: CanvasRow = { path: ".doan/canvases/copy.html", id: "a", url: "u" };
  lists({ [ROOT]: [summary({ conversationId: "dup", canvas: { path: ".doan/canvases/a.html", id: "a" } }), summary({ conversationId: "legacy", canvas: { path: ".doan/canvases/b.html" } })] });
  const h = harness([{ kind: "list", path: ROOT, servedRev: 0, canvases: [row("a"), twin, row("b")] }]);
  h.run.entriesChanged();
  await flush();
  h.run.openConversation("dup");
  expect(h.host.openCanvas).toHaveBeenLastCalledWith(ROOT, row("a"), { conversationId: "dup", waiting: false });
  h.run.openConversation("legacy");
  expect(h.host.openCanvas).toHaveBeenLastCalledWith(ROOT, row("b"), { conversationId: "legacy", waiting: false });
  expect(h.host.openOverview).not.toHaveBeenCalled();
});

// App's askConversation scrolls the Overview to the request only when the listed phase waits; arrived must follow the
// same rule, or a strip that already asks while the list lags would get neither the card nor the composer.
test("a Quick Open pick of a project conversation says it waits by the listed phase, the rule the Overview's scroll uses", async () => {
  const h = harness();
  const sending = h.run.start(REQUEST, LAST); start.resolve({ conversationId: "c1" }); await sending;
  h.arrive();
  h.run.event(event("c1", { type: "turn.started" }));
  h.run.event(event("c1", { type: "permission.request", requestId: "r1", tool: "Edit", summary: "Edit x", options: [{ id: "a", label: "Allow", kind: "allow" }] }));
  expect(h.run.strip(ROOT)?.state.kind).toBe("permission");
  lists({ [ROOT]: [summary({ conversationId: "c1", phase: "ended" })] });
  h.run.listChanged(ROOT);
  await flush();
  const arrived = vi.fn();
  expect(h.run.openFound(ROOT, "c1", [], arrived)).toBe("opened");
  h.accept();
  expect(arrived).toHaveBeenLastCalledWith(false);
});
