import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Anchor, ConversationEvent } from "../main/conversation/types";
import { ConversationStore, draftFrom, type ListView } from "./conversationStore";
import { threadItems, withSending } from "./threadItems";

const ROOT = "/code/doan", A = "aaaaaaaa-0000-4000-8000-000000000001";
const CTA: Anchor = { element: { doanId: "hero-cta", selector: "[data-doan-id=\"hero-cta\"]" } };
const summary = (extra: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId: A, title: "T", owner: "doan", provider: "claude", fromHome: true,
  phase: "running", unseen: false, queued: 3, working: true, lastActivityAt: "2026-11-05T00:00:00.000Z", preview: "p", ...extra,
});
let seq = 0;
const event = (payload: Record<string, unknown>): ConversationEvent => ({ v: 1, conversationId: A, seq: ++seq, turnId: "t1", at: "2026-11-05T00:00:00Z", ...payload } as ConversationEvent);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

let doan: Record<string, ReturnType<typeof vi.fn>>;
let history: ConversationEvent[];
beforeEach(() => {
  seq = 0;
  history = [event({ type: "user.message", text: "Draw it", anchors: [] }), event({ type: "turn.started" })];
  doan = {
    readConversation: vi.fn(async () => ({ events: history, lastSeq: history.at(-1)!.seq, turn: "running" })),
    takeConversationDraft: vi.fn(async () => null),
    sendQueuedNow: vi.fn(async () => {}),
  };
  vi.stubGlobal("window", { doan });
});
afterEach(() => vi.unstubAllGlobals());

function harness() {
  let list: ListView = [summary()];
  let started = 1, applied = 1;
  const host = {
    list: () => list, readsStarted: () => started, readsApplied: () => applied, notice: vi.fn(), changed: vi.fn(),
  };
  const store = new ConversationStore(host, window.doan);
  store.queued(ROOT, A, { id: "q1", text: "Use the spacing from button hero-cta", message: { text: "Use the spacing from {{1}}", anchors: [CTA], attachments: [{ name: "spacing-notes.pdf", size: 86016, kind: "file", path: "/Users/ada/spacing-notes.pdf" }] } });
  store.queued(ROOT, A, { id: "q2", text: "Second" });
  store.queued(ROOT, A, { id: "q3", text: "Third" });
  const ids = () => store.queue(A).map(item => item.id);
  const sending = () => store.sending(A).map(item => item.id);
  // A list read main answered after everything so far.
  const read = (next: ConversationSummary[]) => { started++; applied = started; list = next; store.syncQueues(); };
  return { store, host, ids, sending, read };
}

test("pressing Send now takes the row out of the queue at once and holds the message, chips and files, as sending", () => {
  const h = harness();
  doan.sendQueuedNow = vi.fn(() => new Promise(() => {}));
  void h.store.sendQueuedNow(A, "q1");
  expect(doan.sendQueuedNow).toHaveBeenCalledWith({ conversationId: A, itemId: "q1" });
  expect(h.ids()).toEqual(["q2", "q3"]);
  expect(h.store.sending(A)).toEqual([{ id: "q1", text: "Use the spacing from {{1}}", anchors: [CTA], attachments: [{ name: "spacing-notes.pdf", size: 86016, kind: "file", path: "/Users/ada/spacing-notes.pdf" }] }]);
  expect(h.host.changed).toHaveBeenCalled();
});

test("a message queued without its request shows its line alone", () => {
  const h = harness();
  doan.sendQueuedNow = vi.fn(() => new Promise(() => {}));
  void h.store.sendQueuedNow(A, "q2");
  expect(h.store.sending(A)).toEqual([{ id: "q2", text: "Second", anchors: [], attachments: [] }]);
});

test("a second press of the message in flight does not ask main again", async () => {
  const h = harness();
  doan.sendQueuedNow = vi.fn(() => new Promise(() => {}));
  void h.store.sendQueuedNow(A, "q1");
  expect(await h.store.sendQueuedNow(A, "q1")).toEqual({ error: "stale" });
  expect(doan.sendQueuedNow).toHaveBeenCalledTimes(1);
});

test.each(["event first", "answer first"] as const)("read by the agent (%s): the sending message goes and the history's own message stays", async order => {
  const h = harness();
  h.store.track(A);
  await flush();
  const answer = deferred<void>();
  doan.sendQueuedNow = vi.fn(() => answer.promise);
  const sent = h.store.sendQueuedNow(A, "q1");
  const shown = () => withSending(threadItems(h.store.thread(A)!.events, ROOT, true), h.store.sending(A)).map(item => item.kind === "user" ? `${item.key}${item.sending ? " sending" : ""}` : item.kind);
  expect(shown()).toEqual(["u1", "qq1 sending"]);
  const message = event({ type: "user.message", text: "Use the spacing from {{1}}", anchors: [CTA] });
  if (order === "event first") {
    h.store.event(message);
    // Main writes the message before it answers: for one draw both show.
    expect(shown()).toEqual(["u1", `u${message.seq}`, "qq1 sending"]);
    answer.resolve();
    await sent;
  } else {
    answer.resolve();
    await sent;
    expect(shown()).toEqual(["u1"]);
    h.store.event(message);
  }
  expect(shown()).toEqual(["u1", `u${message.seq}`]);
  expect(h.ids()).toEqual(["q2", "q3"]);
  expect(h.store.sending(A)).toEqual([]);
});

test.each(["not_running", "stale", "attachment_missing", "bad_request"])("refused with %s, the message leaves the thread and is back in its own place", async error => {
  const h = harness();
  doan.sendQueuedNow = vi.fn(async () => ({ error }));
  expect(await h.store.sendQueuedNow(A, "q2")).toEqual({ error, turnRuns: true });
  expect(h.ids()).toEqual(["q1", "q2", "q3"]);
  expect(h.store.sending(A)).toEqual([]);
});

test("a call that throws reads as a refusal", async () => {
  const h = harness();
  doan.sendQueuedNow = vi.fn(async () => { throw new Error("gone"); });
  expect(await h.store.sendQueuedNow(A, "q3")).toEqual({ error: "unknown", turnRuns: true });
  expect(h.ids()).toEqual(["q1", "q2", "q3"]);
});

// Main refuses the steers of a turn that ended (dropSteers) before it sends or returns the queue.
test("a turn that ends first puts the message back in the queue, which then follows the queue's rule", async () => {
  const h = harness();
  const answer = deferred<{ error: string }>();
  doan.sendQueuedNow = vi.fn(() => answer.promise);
  const sent = h.store.sendQueuedNow(A, "q1");
  // Main's count leaves out the message in flight: a read with nothing queued keeps it sending, the rest go.
  h.read([summary({ phase: "ended", working: false, queued: 0 })]);
  expect(h.ids()).toEqual([]);
  expect(h.store.sending(A).map(item => item.id)).toEqual(["q1"]);
  answer.resolve({ error: "not_running" });
  await sent;
  expect(h.ids()).toEqual(["q1"]);
  expect(h.store.sending(A)).toEqual([]);
  // Main sent it as the next turn: the next read without it drops it.
  h.read([summary({ queued: 0 })]);
  expect(h.ids()).toEqual([]);
});

// Main's count leaves out the messages it marked as going out, so a queue flushing after its turn's judgement counts 0
// until the next turn opens; its rows stay so the composer keeps Stop over them (they come back as a draft).
test("a queue going out after its ended turn keeps its rows until the next turn opens", async () => {
  const h = harness();
  h.store.track(A);
  await flush();
  h.store.event(event({ type: "turn.done" }));
  h.read([summary({ phase: "ended", working: true, queued: 0 })]);
  expect(h.ids()).toEqual(["q1", "q2", "q3"]);
  h.store.event(event({ type: "user.message", turnId: "t2", text: "Use the spacing…", anchors: [] }));
  h.store.event(event({ type: "turn.started", turnId: "t2" }));
  h.read([summary({ phase: "running", working: true, queued: 0 })]);
  expect(h.ids()).toEqual([]);
});

// The flushed turn's start reaches the store before the list read that drops the rows. Until then a row would read
// the turn as running and offer Send now for the message that turn already carries.
test("a flushing queue's rows go when the next turn's start merges, without waiting for a list read", async () => {
  const h = harness();
  h.store.track(A);
  await flush();
  h.store.event(event({ type: "turn.done" }));
  h.read([summary({ phase: "ended", working: true, queued: 0 })]);
  h.store.event(event({ type: "user.message", turnId: "t2", text: "Use the spacing…", anchors: [] }));
  expect(h.ids()).toEqual(["q1", "q2", "q3"]);
  h.store.event(event({ type: "turn.started", turnId: "t2" }));
  expect(h.ids()).toEqual([]);
});

// POSTMORTEM 2026-11-05: an event does not make a read taken while Send now was in flight final.
test("a row refused back into the queue stays through an event merged after a stale read", async () => {
  const h = harness();
  h.store.track(A);
  await flush();
  h.store.unqueued(A, "q2");
  h.store.unqueued(A, "q3");
  const answer = deferred<{ error: string }>();
  doan.sendQueuedNow = vi.fn(() => answer.promise);
  const sent = h.store.sendQueuedNow(A, "q1");
  h.read([summary({ queued: 0 })]);
  answer.resolve({ error: "not_running" });
  await sent;
  h.store.event(event({ type: "activity", kind: "read", summary: "Reading files" }));
  expect(h.ids()).toEqual(["q1"]);
});

// The turn the queue went out as ended into its own judgement before a list read saw it run.
test("a flushed queue's rows go once a later turn ended, even while that turn is judged", async () => {
  const h = harness();
  h.store.track(A);
  await flush();
  // Queued while the thread shows its turn, as the composer does.
  h.store.queued(ROOT, A, { id: "q4", text: "Fourth" });
  h.store.event(event({ type: "turn.done" }));
  h.read([summary({ phase: "ended", working: true, queued: 0 })]);
  expect(h.ids()).toEqual(["q1", "q2", "q3", "q4"]);
  h.store.event(event({ type: "user.message", turnId: "t2", text: "Use the spacing…", anchors: [] }));
  h.store.event(event({ type: "turn.started", turnId: "t2" }));
  h.store.event(event({ type: "turn.done", turnId: "t2" }));
  h.read([summary({ phase: "ended", working: true, queued: 0 })]);
  expect(h.ids()).toEqual([]);
});

test("without a read thread, the list's ended phase and working keep a flushing queue's rows too", () => {
  const h = harness();
  h.read([summary({ phase: "ended", working: true, queued: 0 })]);
  expect(h.ids()).toEqual(["q1", "q2", "q3"]);
  h.read([summary({ phase: "running", working: true, queued: 0 })]);
  expect(h.ids()).toEqual([]);
});

// Stop while the queue waits for the judgement or goes out, or a flush that failed: the conversation may still work
// on the judgement, but the queue is the draft now, so its rows go.
test("a queue handed back as a draft while the conversation still works drops its rows", async () => {
  const h = harness();
  h.store.track(A);
  await flush();
  h.store.event(event({ type: "turn.done" }));
  h.read([summary({ phase: "ended", working: true, queued: 0, returnedDraft: true })]);
  expect(h.ids()).toEqual([]);
});

test("two presses in a row show in press order; the first refused returns to its own place while the second is read", async () => {
  const h = harness();
  const first = deferred<{ error: string }>(), second = deferred<void>();
  doan.sendQueuedNow = vi.fn(({ itemId }: { itemId: string }) => itemId === "q3" ? first.promise : second.promise);
  const a = h.store.sendQueuedNow(A, "q3");
  const b = h.store.sendQueuedNow(A, "q1");
  expect(h.sending()).toEqual(["q3", "q1"]);
  expect(h.ids()).toEqual(["q2"]);
  first.resolve({ error: "not_running" });
  await a;
  expect(h.ids()).toEqual(["q2", "q3"]);
  expect(h.sending()).toEqual(["q1"]);
  second.resolve();
  await b;
  expect(h.ids()).toEqual(["q2", "q3"]);
  expect(h.sending()).toEqual([]);

  const again = harness();
  const one = deferred<{ error: string }>(), two = deferred<void>();
  doan.sendQueuedNow = vi.fn(({ itemId }: { itemId: string }) => itemId === "q1" ? one.promise : two.promise);
  const c = again.store.sendQueuedNow(A, "q1");
  const d = again.store.sendQueuedNow(A, "q2");
  expect(again.sending()).toEqual(["q1", "q2"]);
  two.resolve();
  await d;
  one.resolve({ error: "not_running" });
  await c;
  expect(again.ids()).toEqual(["q1", "q3"]);
});

test("deleting the conversation drops its sending messages", () => {
  const h = harness();
  doan.sendQueuedNow = vi.fn(() => new Promise(() => {}));
  void h.store.sendQueuedNow(A, "q1");
  h.store.deleted(A);
  expect(h.store.sending(A)).toEqual([]);
});

// Main's count leaves out a message in flight, so a read taken then says none are queued; a refusal that
// puts the row back must not be dropped by that read, only by one started after the refusal.
test("a row refused back into the queue stays until a read started after the refusal says main sent it", async () => {
  const h = harness();
  const answer = deferred<{ error: string }>();
  doan.sendQueuedNow = vi.fn(() => answer.promise);
  const sent = h.store.sendQueuedNow(A, "q1");
  h.read([summary({ queued: 0 })]);
  expect(h.sending()).toEqual(["q1"]);
  answer.resolve({ error: "not_running" });
  await sent;
  h.store.syncQueues();
  expect(h.ids()).toEqual(["q1"]);
  h.read([summary({ queued: 1 })]);
  expect(h.ids()).toEqual(["q1"]);
  h.read([summary({ queued: 0 })]);
  expect(h.ids()).toEqual([]);
});

// The answer says whether the turn still runs as the store reads it then, so a turn.done that reached the
// store before the screen was drawn again decides it.
test("a refusal says whether the turn still runs as the store reads it at the answer", async () => {
  const h = harness();
  doan.sendQueuedNow = vi.fn(async () => ({ error: "not_running" }));
  expect(await h.store.sendQueuedNow(A, "q1")).toEqual({ error: "not_running", turnRuns: true });

  h.store.track(A);
  await flush();
  const answer = deferred<{ error: string }>();
  doan.sendQueuedNow = vi.fn(() => answer.promise);
  const sent = h.store.sendQueuedNow(A, "q2");
  // The list has not caught up: it still says the turn works.
  h.store.event(event({ type: "turn.done" }));
  answer.resolve({ error: "not_running" });
  expect(await sent).toEqual({ error: "not_running", turnRuns: false });
  expect(h.ids()).toEqual(["q1", "q2", "q3"]);
});

// The chosen answer is kept by request in the store the canvas panel and Overview share, so it outlives a
// redraw for another conversation and goes once the question is settled.
test("a question's chosen answer is kept by conversation and request until that question is resolved", async () => {
  const h = harness();
  const B = "bbbbbbbb-0000-4000-8000-000000000002";
  const question = { id: "0", header: "Layout", question: "Which layout?", options: [{ label: "Compact" }, { label: "Two rows" }], multiSelect: false, other: true };
  history.push(event({ type: "question.request", requestId: "q1", questions: [question] }));
  h.store.track(A);
  await flush();
  expect(h.store.questionDraft(A, "q1")).toEqual({ choices: {}, sending: null, failed: null });
  h.host.changed.mockClear();
  h.store.editQuestion(A, "q1", { type: "choose", question, option: 1 });
  expect(h.host.changed).toHaveBeenCalled();
  // Another conversation's request with the same id is apart.
  expect(h.store.questionDraft(B, "q1").choices).toEqual({});
  expect(h.store.questionDraft(A, "q1").choices).toEqual({ "0": { selected: [1], other: false, text: "" } });
  h.store.event(event({ type: "question.resolved", requestId: "q9", outcome: "skipped" }));
  expect(h.store.questionDraft(A, "q1").choices).toEqual({ "0": { selected: [1], other: false, text: "" } });
  h.store.event(event({ type: "question.resolved", requestId: "q1", outcome: "answered", answers: { "0": { selected: ["Two rows"] } } }));
  expect(h.store.questionDraft(A, "q1").choices).toEqual({});
});

// A refusal or an edit that lands after the question was settled must not bring its draft back.
test("a resolved or deleted question's draft is not made again by a late edit", () => {
  const h = harness();
  const question = { id: "0", header: "Layout", question: "Which layout?", options: [{ label: "Compact" }], multiSelect: false, other: true };
  h.store.track(A);
  h.store.editQuestion(A, "q1", { type: "sending", how: "answer" });
  h.store.event(event({ type: "question.resolved", requestId: "q1", outcome: "skipped" }));
  h.host.changed.mockClear();
  h.store.editQuestion(A, "q1", { type: "failed" });
  h.store.editQuestion(A, "q1", { type: "choose", question, option: 0 });
  expect(h.store.questionDraft(A, "q1")).toEqual({ choices: {}, sending: null, failed: null });
  expect(h.host.changed).not.toHaveBeenCalled();
  h.store.deleted(A);
  h.store.editQuestion(A, "q2", { type: "failed" });
  expect(h.store.questionDraft(A, "q2")).toEqual({ choices: {}, sending: null, failed: null });
});

test("a deleted conversation's chosen answers go with it", () => {
  const h = harness();
  const question = { id: "0", header: "Layout", question: "Which layout?", options: [{ label: "Compact" }], multiSelect: false, other: true };
  h.store.editQuestion(A, "q1", { type: "choose", question, option: 0 });
  h.store.deleted(A);
  expect(h.store.questionDraft(A, "q1").choices).toEqual({});
});

// Main answers capture_failed for an empty image or a PNG it could not
// save; the chip goes and the notice names the capture, not the file name that `unreadable` would show.
test("a capture main could not take leaves the draft with the capture notice", () => {
  const { store } = harness();
  const chip = { key: "k1", name: "canvas-capture-checking.png", kind: "image" as const, pasted: true, status: "checking" as const };
  store.setDrafts(() => new Map([["canvas:/code/doan:a", { segments: [], preset: null, attachments: [chip], shape: "capsule" as const }]]));
  const { notices } = store.settleAttachments(["k1"], [{ ok: false, name: "Canvas capture", error: "capture_failed" }]);
  expect(notices).toEqual(["Couldn’t capture the canvas. Try again."]);
  expect(store.drafts.get("canvas:/code/doan:a")?.attachments).toEqual([]);
});

// POSTMORTEM 2026-11-05: Claude Code may read a Send now message only as its turn stops; main then writes it
// from the transcript before the end. It stays once, and neither its sending entry nor its row returns.
test("a Send now message the stopped turn's transcript shows stays in the thread once, with no sending entry or row", async () => {
  const h = harness();
  h.store.track(A);
  await flush();
  const answer = deferred<void>();
  doan.sendQueuedNow = vi.fn(() => answer.promise);
  const sent = h.store.sendQueuedNow(A, "q1");
  const shown = () => withSending(threadItems(h.store.thread(A)!.events, ROOT, true), h.store.sending(A)).map(item => item.kind === "user" ? `${item.key}${item.sending ? " sending" : ""}` : item.kind);
  // Stop: main holds the end while it reads the transcript, then writes the message, answers Send now and ends the turn.
  const message = event({ type: "user.message", text: "Use the spacing from {{1}}", anchors: [CTA] });
  h.store.event(message);
  answer.resolve();
  await sent;
  h.store.event(event({ type: "interrupted", reason: "user" }));
  h.read([summary({ phase: "ended", working: false, queued: 0, returnedDraft: true })]);
  expect(shown()).toEqual(["u1", `u${message.seq}`, "end"]);
  expect(h.store.sending(A)).toEqual([]);
  expect(h.ids()).toEqual([]);
});

// The provider refused the press earlier, so the row came back with its refusal line; the transcript later shows the
// agent read it after all. Main took it out of the queue then, and only a read started after that drops the row.
test("a refused Send now row the transcript later shows as read goes with the next read, and its message stays", async () => {
  const h = harness();
  h.store.track(A);
  await flush();
  doan.sendQueuedNow = vi.fn(async () => ({ error: "not_running" }));
  await h.store.sendQueuedNow(A, "q2");
  expect(h.ids()).toEqual(["q1", "q2", "q3"]);
  const message = event({ type: "user.message", text: "Second", anchors: [] });
  h.store.event(message);
  h.store.event(event({ type: "interrupted", reason: "user" }));
  h.read([summary({ phase: "ended", working: false, queued: 0, returnedDraft: true })]);
  expect(h.ids()).toEqual([]);
  expect(h.store.sending(A)).toEqual([]);
  expect(threadItems(h.store.thread(A)!.events, ROOT, true).filter(item => item.kind === "user").map(item => item.key)).toEqual(["u1", `u${message.seq}`]);
});

// Scheduled rows come from main, which also schedules and reschedules by itself,
// so they are read when the list's schedule appears or changes.
describe("scheduled rows", () => {
  const AT = "2026-11-13T06:00:00.000Z", LATER = "2026-11-14T06:00:00.000Z";
  const item = (itemId: string, text: string, extra: Partial<{ anchors: Anchor[]; attachments: { name: string; size?: number; kind: "file" | "directory"; path: string }[] }> = {}) =>
    ({ itemId, text, anchors: [], attachments: [], ...extra });
  function scheduledHarness(first: ConversationSummary) {
    let list: ListView = [first];
    let started = 1, applied = 1;
    const host = { list: () => list, readsStarted: () => started, readsApplied: () => applied, notice: vi.fn(), changed: vi.fn() };
    const store = new ConversationStore(host, window.doan);
    const ids = () => store.queue(A).map(row => row.id);
    const read = (next: ConversationSummary[]) => { started++; applied = started; list = next; store.syncQueues(); };
    return { store, ids, read, setList: (next: ConversationSummary[]) => { list = next; }, startRead: () => { started++; }, applyRead: (next: ConversationSummary[]) => { applied = started; list = next; store.syncQueues(); } };
  }
  const scheduled = (extra: Partial<ConversationSummary> = {}) => summary({ phase: "ended", working: false, queued: 1, scheduledAt: AT, ...extra });

  test("a schedule in the list reads main's items once as rows: chips by name, files kept for the thread", async () => {
    doan.scheduledMessages = vi.fn(async () => [item("s1", "Use the spacing from {{1}}", { anchors: [CTA], attachments: [{ name: "notes.pdf", size: 10, kind: "file", path: "/Users/ada/notes.pdf" }] })]);
    const h = scheduledHarness(scheduled());
    h.store.readScheduled(ROOT, A);
    await flush();
    expect(doan.scheduledMessages).toHaveBeenCalledWith({ conversationId: A });
    expect(h.store.queue(A)).toEqual([{ id: "s1", text: "Use the spacing from element hero-cta", message: { text: "Use the spacing from {{1}}", anchors: [CTA], attachments: [{ name: "notes.pdf", size: 10, kind: "file", path: "/Users/ada/notes.pdf" }] } }]);
    h.store.readScheduled(ROOT, A);
    expect(doan.scheduledMessages).toHaveBeenCalledTimes(1);
  });

  // The row reads the words; the message it sends, and returns to the draft, keeps the list as typed.
  test("a list's row drops its markers, while its message keeps them", async () => {
    doan.scheduledMessages = vi.fn(async () => [item("s1", "- Fix {{1}}\n  - then the footer", { anchors: [CTA] })]);
    const h = scheduledHarness(scheduled());
    h.store.readScheduled(ROOT, A);
    await flush();
    expect(h.store.queue(A)).toEqual([{ id: "s1", text: "Fix element hero-cta then the footer", message: { text: "- Fix {{1}}\n  - then the footer", anchors: [CTA], attachments: [] } }]);
  });

  test("a new time or count reads again and replaces the rows; no schedule reads nothing", async () => {
    doan.scheduledMessages = vi.fn(async () => [item("s1", "First")]);
    const h = scheduledHarness(summary({ phase: "ended", working: false, queued: 0 }));
    h.store.readScheduled(ROOT, A);
    expect(doan.scheduledMessages).not.toHaveBeenCalled();
    h.setList([scheduled()]);
    h.store.readScheduled(ROOT, A);
    await flush();
    doan.scheduledMessages = vi.fn(async () => [item("s1", "First"), item("s2", "Second")]);
    h.setList([scheduled({ queued: 2 })]);
    h.store.readScheduled(ROOT, A);
    await flush();
    expect(h.ids()).toEqual(["s1", "s2"]);
    doan.scheduledMessages = vi.fn(async () => [item("s3", "Again")]);
    h.setList([scheduled({ scheduledAt: LATER })]);
    h.store.readScheduled(ROOT, A);
    await flush();
    expect(h.ids()).toEqual(["s3"]);
  });

  test("an answer for a schedule that changed meanwhile, or a refusal, leaves the rows alone", async () => {
    const answer = deferred<unknown>();
    doan.scheduledMessages = vi.fn(() => answer.promise);
    const h = scheduledHarness(scheduled());
    h.store.readScheduled(ROOT, A);
    h.setList([scheduled({ scheduledAt: LATER })]);
    answer.resolve([item("old", "Old")]);
    await flush();
    expect(h.ids()).toEqual([]);
    doan.scheduledMessages = vi.fn(async () => ({ error: "not_found" }));
    h.store.readScheduled(ROOT, A);
    await flush();
    expect(h.ids()).toEqual([]);
  });

  // POSTMORTEM 2026-11-05: main's count drops to 0 while a scheduled send goes out and comes back on a reschedule, so
  // only a read started after the rows came back can drop them.
  test("rows read from a schedule stay through a read that started before them", async () => {
    doan.scheduledMessages = vi.fn(async () => [item("s1", "First")]);
    const h = scheduledHarness(scheduled());
    h.startRead();
    h.store.readScheduled(ROOT, A);
    await flush();
    h.applyRead([summary({ phase: "ended", working: false, queued: 0 })]);
    expect(h.ids()).toEqual(["s1"]);
    h.read([summary({ phase: "ended", working: false, queued: 0 })]);
    expect(h.ids()).toEqual([]);
  });
});

// The row that repeats a failed turn's own message (main's turnId) hides that turn's Edit and resend until it is removed.
test("Edit and resend hides while the failed turn's own message waits, and returns once its row is removed", async () => {
  history = [event({ type: "user.message", text: "Draw it", anchors: [] }), event({ type: "turn.started" }), event({ type: "turn.failed", code: "rate_limited" })];
  doan.scheduledMessages = vi.fn(async () => [{ itemId: "s1", text: "Draw it", anchors: [], attachments: [], turnId: "t1" }]);
  const list: ListView = [summary({ phase: "ended", working: false, queued: 1, scheduledAt: "2026-11-13T06:00:00.000Z" })];
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  store.track(A); await flush();
  store.readScheduled(ROOT, A);
  await flush();
  expect(store.resendHidden(A)).toBe(true);
  store.unqueued(A, "s1");
  expect(store.resendHidden(A)).toBe(false);
});

test("a row without the failed turn's id leaves Edit and resend", async () => {
  history = [event({ type: "user.message", text: "Draw it", anchors: [] }), event({ type: "turn.started" }), event({ type: "turn.failed", code: "rate_limited" })];
  doan.scheduledMessages = vi.fn(async () => [{ itemId: "s1", text: "Later", anchors: [], attachments: [] }]);
  const list: ListView = [summary({ phase: "ended", working: false, queued: 1, scheduledAt: "2026-11-13T06:00:00.000Z" })];
  const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
  store.track(A); await flush();
  store.readScheduled(ROOT, A);
  await flush();
  expect(store.resendHidden(A)).toBe(false);
});

describe("scheduled rows: request identity and retries", () => {
  const AT = "2026-11-13T06:00:00.000Z";
  const scheduled = (extra: Partial<ConversationSummary> = {}) => summary({ phase: "ended", working: false, queued: 1, scheduledAt: AT, ...extra });
  const sent = () => summary({ phase: "running", working: true, queued: 0 });
  function setup(first: ConversationSummary) {
    let list: ListView = [first];
    const store = new ConversationStore({ list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() }, window.doan);
    return { store, ids: () => store.queue(A).map(row => row.id), setList: (next: ConversationSummary[]) => { list = next; store.syncQueues(); } };
  }

  test("a schedule that went out and came back at the same time and count is read again", async () => {
    doan.scheduledMessages = vi.fn(async () => [{ itemId: "s1", text: "First", anchors: [], attachments: [] }]);
    const h = setup(scheduled());
    h.store.readScheduled(ROOT, A);
    await flush();
    h.setList([sent()]);
    h.setList([scheduled()]);
    doan.scheduledMessages = vi.fn(async () => [{ itemId: "s2", text: "First again", anchors: [], attachments: [] }]);
    h.store.readScheduled(ROOT, A);
    await flush();
    expect(doan.scheduledMessages).toHaveBeenCalledTimes(1);
    expect(h.ids()).toEqual(["s2"]);
  });

  test("an older read's late answer never replaces a newer read's rows, even at the same time and count", async () => {
    const first = deferred<unknown>();
    doan.scheduledMessages = vi.fn(() => first.promise);
    const h = setup(scheduled());
    h.store.readScheduled(ROOT, A);
    h.setList([sent()]);
    h.setList([scheduled()]);
    doan.scheduledMessages = vi.fn(async () => [{ itemId: "new", text: "New", anchors: [], attachments: [] }]);
    h.store.readScheduled(ROOT, A);
    await flush();
    expect(h.ids()).toEqual(["new"]);
    first.resolve([{ itemId: "old", text: "Old", anchors: [], attachments: [] }]);
    await flush();
    expect(h.ids()).toEqual(["new"]);
  });

  test.each([["a rejected call", () => Promise.reject(new Error("gone"))], ["an error answer", async () => ({ error: "unknown" })]] as const)(
    "after %s the next sync reads the same schedule again", async (_name, failure) => {
      doan.scheduledMessages = vi.fn(failure);
      const h = setup(scheduled());
      h.store.readScheduled(ROOT, A);
      await flush();
      expect(h.ids()).toEqual([]);
      doan.scheduledMessages = vi.fn(async () => [{ itemId: "s1", text: "First", anchors: [], attachments: [] }]);
      h.store.readScheduled(ROOT, A);
      await flush();
      expect(doan.scheduledMessages).toHaveBeenCalledTimes(1);
      expect(h.ids()).toEqual(["s1"]);
    });
});


describe("takeStartDraft", () => {
  const CANVAS = { path: ".doan/canvases/a.html", id: "a" };
  const record = { name: "brief.md", kind: "file", size: 1, path: "/files/brief.md" };
  const old = { text: "Removed", anchors: [], attachments: [record], reason: "restarted" };
  const current = { text: "Current", anchors: [], attachments: [], reason: "restarted" };
  test.each([undefined, CANVAS])("a late start reply cannot land in a re-added project (%j)", async canvas => {
    const { store } = harness();
    const reply = deferred<typeof old>();
    doan.takeStartDraft = vi.fn().mockReturnValueOnce(reply.promise).mockResolvedValue(current);
    doan.attachmentsFromPaths = vi.fn(async () => []);
    store.takeStartDraft(ROOT, canvas);
    store.dropDrafts(() => true);
    store.takeStartDraft(ROOT, canvas);
    reply.resolve(old);
    await flush();
    expect(doan.attachmentsFromPaths).not.toHaveBeenCalled();
    expect([...store.drafts.values()].map(draft => draft.segments)).toEqual([[{ kind: "text", text: "Current" }]]);
    expect(doan.takeStartDraft).toHaveBeenCalledTimes(2);
  });
  test("removal releases an attachment still being issued for the old start without touching the re-added draft", async () => {
    const { store } = harness();
    const issued = deferred<unknown>();
    const fresh = (id: string) => [{ ok: true, attachment: { ...record, id, pasted: false } }];
    doan.takeStartDraft = vi.fn().mockResolvedValueOnce(old).mockResolvedValue({ ...current, attachments: [record] });
    doan.attachmentsFromPaths = vi.fn().mockReturnValueOnce(issued.promise).mockResolvedValue(fresh("owned"));
    doan.removeAttachment = vi.fn(async () => true);
    store.takeStartDraft(ROOT);
    await flush();
    expect(doan.attachmentsFromPaths).toHaveBeenCalledOnce();
    store.dropDrafts(key => key === `root:${ROOT}`);
    store.takeStartDraft(ROOT);
    await flush();
    issued.resolve(fresh("old"));
    await flush();
    expect(doan.removeAttachment.mock.calls).toEqual([["old"]]);
    expect(store.drafts.get(`root:${ROOT}`)?.attachments.map(chip => chip.id)).toEqual(["owned"]);
  });
  test("a stale take error leaves the new registration's successful take marked", async () => {
    const { store } = harness();
    const reply = deferred<unknown>();
    doan.takeStartDraft = vi.fn().mockReturnValueOnce(reply.promise).mockResolvedValue(current);
    store.takeStartDraft(ROOT);
    store.dropDrafts(() => true);
    store.takeStartDraft(ROOT);
    await flush();
    reply.resolve({ error: "unknown" });
    await flush();
    expect(store.drafts.get(`root:${ROOT}`)?.segments).toEqual([{ kind: "text", text: "Current" }]);
    store.takeStartDraft(ROOT);
    expect(doan.takeStartDraft).toHaveBeenCalledTimes(2);
  });
  test("puts a canvas start's message, chips included, after what the canvas's new draft holds, asking main once", async () => {
    const h = harness();
    doan.takeStartDraft = vi.fn(async () => ({ text: "Fix {{1}}", anchors: [CTA], attachments: [], reason: "restarted" }));
    const key = `canvas:${JSON.stringify([ROOT, "id", "a"])}`;
    h.store.setDrafts(drafts => new Map(drafts).set(key, { segments: [{ kind: "text", text: "Typed" }], preset: null, attachments: [], shape: "capsule" }));
    h.store.takeStartDraft(ROOT, CANVAS);
    h.store.takeStartDraft(ROOT, CANVAS);
    await vi.waitFor(() => expect(h.store.drafts.get(key)?.segments.length).toBeGreaterThan(1));
    expect(doan.takeStartDraft).toHaveBeenCalledOnce();
    expect(doan.takeStartDraft).toHaveBeenCalledWith({ root: ROOT, canvas: CANVAS });
    const segments = h.store.drafts.get(key)!.segments;
    expect(segments[0]).toEqual({ kind: "text", text: "Typed\n\nFix " });
    expect(segments.some(segment => segment.kind !== "text")).toBe(true);
  });
  test("puts a root start's message in the root's new draft, and leaves drafts alone when main has none", async () => {
    const h = harness();
    doan.takeStartDraft = vi.fn(async () => null);
    h.store.takeStartDraft(ROOT); await flush();
    expect(h.store.drafts.size).toBe(0);
    doan.takeStartDraft = vi.fn(async () => ({ text: "Draw it", anchors: [], attachments: [], reason: "restarted" }));
    h.store.takeStartDraft("/code/other");
    await vi.waitFor(() => expect(h.store.drafts.get("root:/code/other")?.segments).toEqual([{ kind: "text", text: "Draw it" }]));
  });
  // preload: taking a draft that cannot be saved answers an error and keeps it, so a later list read asks again.
  test("asks again after a take that answered an error or failed, and only once after one that answered", async () => {
    for (const failure of [async () => ({ error: "unknown" }), async () => { throw new Error("gone"); }]) {
      const h = harness();
      doan.takeStartDraft = vi.fn(failure);
      h.store.takeStartDraft(ROOT, CANVAS); await flush();
      expect(h.store.drafts.size).toBe(0);
      doan.takeStartDraft = vi.fn(async () => ({ text: "Draw it", anchors: [], attachments: [], reason: "restarted" }));
      h.store.takeStartDraft(ROOT, CANVAS);
      await vi.waitFor(() => expect(h.store.drafts.size).toBe(1));
      h.store.takeStartDraft(ROOT, CANVAS); await flush();
      expect(doan.takeStartDraft).toHaveBeenCalledOnce();
    }
  });
  test("does nothing in a window without the call (the prototype window)", () => {
    const h = harness();
    expect(() => h.store.takeStartDraft(ROOT)).not.toThrow();
    expect(h.store.drafts.size).toBe(0);
  });
});

// A project-conversation send waits for the ended turn's promotion judgement (at most 10 s) before main starts its turn
// and answers. Meanwhile the message shows at the thread's end as sending, as Send now's does.
test("a send main has not answered shows as sending until its turn's own message arrives or the send settles", async () => {
  const h = harness();
  h.store.track(A);
  await flush();
  const message = { id: "send-1", text: "Make it blue", anchors: [CTA], attachments: [] };
  const settle = h.store.sendPending(A, message);
  expect(h.store.sending(A)).toEqual([message]);
  expect(h.host.changed).toHaveBeenCalled();
  // An earlier turn's event does not stand for it.
  h.store.event(event({ type: "turn.done" }));
  expect(h.store.sending(A)).toEqual([message]);
  // The sent message's own turn message takes the sending entry's place.
  h.store.event(event({ type: "user.message", text: "Make it blue", anchors: [CTA], turnId: "t2" }));
  expect(h.store.sending(A)).toEqual([]);
  settle();
  expect(h.store.sending(A)).toEqual([]);
  // A refused send leaves at its answer.
  const refused = h.store.sendPending(A, { ...message, id: "send-2" });
  expect(h.store.sending(A).map(item => item.id)).toEqual(["send-2"]);
  refused();
  expect(h.store.sending(A)).toEqual([]);
});

// Every way a sent message comes back into a draft brings the text as sent, list markers and depth spaces included
// (the field draws them again); only titles and queue rows drop them.
describe("a sent list comes back as typed", () => {
  const LIST = "- Fix {{1}}\n  - shorter\n1. then\n1. footer";
  const typed = (segments: readonly { kind: string; text?: string }[] | undefined) => segments?.map(segment => (segment.kind === "text" ? segment.text : "◆")).join("");
  test("Edit and resend", async () => {
    history = [event({ type: "user.message", text: LIST, anchors: [CTA] }), event({ type: "turn.started" }), event({ type: "turn.done" })];
    const h = harness();
    h.store.track(A);
    await flush();
    expect(await h.store.editAndResend(A)).toBe(true);
    expect(typed(h.store.drafts.get(`conversation:${A}`)?.segments)).toBe("- Fix ◆\n  - shorter\n1. then\n1. footer");
  });
  test("a returned queue", async () => {
    doan.takeConversationDraft = vi.fn(async () => ({ text: LIST, anchors: [CTA], attachments: [], ids: [], reason: "stopped" }));
    const h = harness();
    h.read([summary({ returnedDraft: true })]);
    h.store.takeDraft(ROOT, A);
    await vi.waitFor(() => expect(typed(h.store.drafts.get(`conversation:${A}`)?.segments)).toBe("- Fix ◆\n  - shorter\n1. then\n1. footer"));
  });
  test("a restored start draft", async () => {
    doan.takeStartDraft = vi.fn(async () => ({ text: `  ${LIST}`, anchors: [CTA], attachments: [], reason: "restarted" }));
    const h = harness();
    h.store.takeStartDraft(ROOT);
    await vi.waitFor(() => expect(typed(h.store.drafts.get(`root:${ROOT}`)?.segments)).toBe("  - Fix ◆\n  - shorter\n1. then\n1. footer"));
  });
});

// A streamed reply sends a delta every few tens of milliseconds. Only the hosts that draw that conversation redraw for
// one: the store's host (App, the prototype window) is left alone, while the runs' own listeners still hear it.
describe("a streamed delta", () => {
  test("merges into the thread and tells the thread's subscribers and the store listeners, without the host's changed", async () => {
    const h = harness();
    h.store.track(A);
    await flush();
    const thread = vi.fn(), listener = vi.fn();
    h.store.subscribeThread(A, thread);
    h.store.subscribe(listener);
    h.host.changed.mockClear();
    const before = h.store.thread(A);
    h.store.event(event({ type: "message.delta", messageId: "m1", text: "Hel" }));
    expect(h.store.thread(A)).not.toBe(before);
    expect(h.store.thread(A)!.events.at(-1)).toMatchObject({ type: "message.delta", text: "Hel" });
    expect(thread).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(A, "event");
    expect(h.host.changed).not.toHaveBeenCalled();
  });

  test("any other live event still calls the host's changed and tells the thread's subscribers", async () => {
    const h = harness();
    h.store.track(A);
    await flush();
    const thread = vi.fn();
    h.store.subscribeThread(A, thread);
    h.host.changed.mockClear();
    h.store.event(event({ type: "message.done", messageId: "m1", text: "Hello" }));
    expect(thread).toHaveBeenCalledOnce();
    expect(h.host.changed).toHaveBeenCalledOnce();
  });

  test("a thread subscription hears only its own conversation, and nothing once it is dropped", async () => {
    const h = harness();
    const B = "bbbbbbbb-0000-4000-8000-000000000002";
    h.store.track(A);
    h.store.track(B);
    await flush();
    const onA = vi.fn(), onB = vi.fn();
    const stopA = h.store.subscribeThread(A, onA);
    h.store.subscribeThread(B, onB);
    h.store.event(event({ type: "message.delta", messageId: "m1", text: "Hel" }));
    expect(onA).toHaveBeenCalledOnce();
    expect(onB).not.toHaveBeenCalled();
    stopA();
    h.store.event(event({ type: "message.delta", messageId: "m1", text: "lo" }));
    expect(onA).toHaveBeenCalledOnce();
  });
});

test("draft restoration passes recorded pasted text metadata through reissue", async () => {
  const record = { name: "pasted-text-x.txt", kind: "file" as const, size: 5, path: "/paste.txt", lines: 2, excerpt: "first" };
  const calls = { ...window.doan, attachmentsFromPaths: vi.fn(async () => [{ ok: true as const, attachment: { ...record, id: "fresh", pasted: true } }]),
    recheckAttachments: vi.fn(async () => []), removeAttachment: vi.fn(async () => true), releaseAttachments: vi.fn(async () => true) };
  const draft = await draftFrom(calls, "notes", [], [record]);
  expect(calls.attachmentsFromPaths).toHaveBeenCalledWith([record.path], [{ lines: 2, excerpt: "first" }]);
  expect(draft.attachments).toMatchObject([{ lines: 2, excerpt: "first" }]);
});
