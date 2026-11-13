import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Anchor, ConversationEvent } from "../main/conversation/types";
import { ConversationStore, type ListView } from "./conversationStore";
import { threadItems, withSending } from "./threadItems";

// Send now takes the row out of the queue at once and shows the message at the thread's end
// until main answers. Read, it goes (the history's own message stays); refused or ended, it is back in its own place.

const ROOT = "/code/doan", A = "aaaaaaaa-0000-4000-8000-000000000001";
const CTA: Anchor = { element: { doanId: "hero-cta", selector: "[data-doan-id=\"hero-cta\"]" } };
const summary = (extra: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId: A, title: "T", state: "current", owner: "doan", provider: "claude", fromHome: true,
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
  const store = new ConversationStore(host);
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

// The answer being chosen is kept by request in the store the canvas panel and the Overview
// share, so it outlives the thread's redraw for another conversation; it goes once the question is settled.
test("a question's chosen answer is kept by conversation and request until that question is resolved", async () => {
  const h = harness();
  const B = "bbbbbbbb-0000-4000-8000-000000000002";
  const question = { id: "0", header: "Layout", question: "Which layout?", options: [{ label: "Compact" }, { label: "Two rows" }], multiSelect: false, other: true };
  history.push(event({ type: "question.request", requestId: "q1", questions: [question] }));
  h.store.track(A);
  await flush();
  expect(h.store.questionDraft(A, "q1")).toEqual({ choices: {}, sending: null, failed: false });
  h.host.changed.mockClear();
  h.store.editQuestion(A, "q1", { type: "choose", question, option: 1 });
  expect(h.host.changed).toHaveBeenCalled();
  // Another conversation's request with the same id is apart.
  expect(h.store.questionDraft(B, "q1").choices).toEqual({});
  expect(h.store.questionDraft(A, "q1").choices).toEqual({ "0": { selected: [1], other: false, text: "" } });
  // Another request's resolution leaves it.
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
  expect(h.store.questionDraft(A, "q1")).toEqual({ choices: {}, sending: null, failed: false });
  expect(h.host.changed).not.toHaveBeenCalled();
  h.store.deleted(A);
  h.store.editQuestion(A, "q2", { type: "failed" });
  expect(h.store.questionDraft(A, "q2")).toEqual({ choices: {}, sending: null, failed: false });
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

// Claude Code may read a Send now message only as its turn stops; main then finds it in the session transcript once the
// process is gone and writes it into that turn before the end (POSTMORTEM 2026-11-05: the rows main counts again). The
// message stays in the thread as the history's own, and neither its sending entry nor its row comes back.
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
