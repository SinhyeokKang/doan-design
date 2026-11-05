import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Anchor, ConversationEvent } from "../main/conversation/types";
import { ConversationStore, type ListView } from "./conversationStore";
import { threadItems, withSending } from "./threadItems";

// canvas-composer-polish A2: Send now takes the row out of the queue at once and shows the message at the thread's end
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
  store.queued(ROOT, A, { id: "q1", text: "Use the spacing from button hero-cta", message: { text: "Use the spacing from {{1}}", anchors: [CTA], attachments: [{ name: "spacing-notes.pdf", size: 86016, kind: "file" }] } });
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
  expect(h.store.sending(A)).toEqual([{ id: "q1", text: "Use the spacing from {{1}}", anchors: [CTA], attachments: [{ name: "spacing-notes.pdf", size: 86016, kind: "file" }] }]);
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

// Review Y1: main's count leaves out a message in flight, so a read taken then says none are queued; a refusal that
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

// Review Y1: the answer says whether the turn still runs as the store reads it then, so a turn.done that reached the
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

// agent-questions design §7: the answer being chosen is kept by request in the store the canvas panel and the Overview
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

// A refusal or an edit that lands after the question was settled must not bring its draft back (batch R review ⚪4).
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
