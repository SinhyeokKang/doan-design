import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Anchor, ConversationEvent } from "../main/conversation/types";
import { combineQueued } from "../main/conversation/queue";
import { ConversationStore, type ListView } from "./conversationStore";
import { threadItems } from "./threadItems";
import { entering } from "./threadMotion";

// Local send marks drive the thread's entry motion; they outlive their queue rows until a thread spends them.

const ROOT = "/code/doan", A = "aaaaaaaa-0000-4000-8000-000000000001";
const CTA: Anchor = { element: { doanId: "hero-cta", selector: "[data-doan-id=\"hero-cta\"]" } };
const summary = (extra: Partial<ConversationSummary> = {}): ConversationSummary => ({
  conversationId: A, title: "T", owner: "doan", provider: "claude", fromHome: true,
  phase: "running", unseen: false, queued: 0, working: true, lastActivityAt: "2026-11-05T00:00:00.000Z", preview: "p", ...extra,
});
let seq = 0;
const event = (payload: Record<string, unknown>): ConversationEvent => ({ v: 1, conversationId: A, seq: ++seq, turnId: "t1", at: "2026-11-05T00:00:00Z", ...payload } as ConversationEvent);

let doan: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  seq = 0;
  const history = [event({ type: "user.message", text: "Draw it", anchors: [] }), event({ type: "turn.started" })];
  doan = {
    readConversation: vi.fn(async () => ({ events: history, lastSeq: history.at(-1)!.seq, turn: "running" })),
    takeConversationDraft: vi.fn(async () => null),
    sendQueuedNow: vi.fn(async () => {}),
  };
  vi.stubGlobal("window", { doan });
});
afterEach(() => vi.unstubAllGlobals());

function harness() {
  const list: ListView = [summary()];
  const host = { list: () => list, readsStarted: () => 1, readsApplied: () => 1, notice: vi.fn(), changed: vi.fn() };
  return { store: new ConversationStore(host, window.doan), host };
}
const opened = async (store: ConversationStore) => { store.track(A); await new Promise(resolve => setTimeout(resolve, 0)); };

test("a direct send's mark holds its text and the thread's last seq, draws nothing, and its cancel drops it", async () => {
  const { store, host } = harness();
  await opened(store);
  host.changed.mockClear();
  const cancel = store.markSent(A, "Make the action say Add a card");
  expect(store.localSends(A)).toEqual([{ text: "Make the action say Add a card", after: 2 }]);
  expect(host.changed).not.toHaveBeenCalled();
  cancel();
  expect(store.localSends(A)).toEqual([]);
});

test("a new conversation's mark counts from its first event", () => {
  const { store } = harness();
  store.markSent("new-id", "Start the checkout", 0);
  expect(store.localSends("new-id")).toEqual([{ text: "Start the checkout", after: 0 }]);
});

test("the queue's mark is the combined message main sends after the turn; removing every row drops it", async () => {
  const { store } = harness();
  await opened(store);
  store.queued(ROOT, A, { id: "q1", text: "Use the spacing from button hero-cta", message: { text: "Use the spacing from {{1}}", anchors: [CTA], attachments: [] } });
  store.queued(ROOT, A, { id: "q2", text: "Also {{1}}", message: { text: "Also {{1}}", anchors: [CTA], attachments: [] } });
  const combined = combineQueued([{ text: "Use the spacing from {{1}}", anchors: [CTA], attachments: [] }, { text: "Also {{1}}", anchors: [CTA], attachments: [] }]);
  expect(combined.ok && combined.text).toBe("Use the spacing from {{1}}\n\nAlso {{2}}");
  expect(store.localSends(A)).toEqual([{ text: "Use the spacing from {{1}}\n\nAlso {{2}}", after: 2 }]);
  // The person removed the rows: nothing goes out.
  store.unqueued(A, "q1"); store.unqueued(A, "q2");
  expect(store.localSends(A)).toEqual([]);
});

test("a queue that starts with a command goes out as that command alone, as main's nextQueued sends it", async () => {
  const { store } = harness();
  await opened(store);
  store.queued(ROOT, A, { id: "q1", text: "/compact", message: { text: "/compact", anchors: [], attachments: [] } });
  store.queued(ROOT, A, { id: "q2", text: "Then this", message: { text: "Then this", anchors: [], attachments: [] } });
  expect(store.localSends(A).map(mark => mark.text)).toEqual(["/compact"]);
});

test("only the messages before the next command go out together, as main's nextQueued slices them", async () => {
  const { store } = harness();
  await opened(store);
  for (const [id, text] of [["q1", "First"], ["q2", "Second"], ["q3", "/compact"], ["q4", "After"]] as const)
    store.queued(ROOT, A, { id, text, message: { text, anchors: [], attachments: [] } });
  expect(store.localSends(A).map(mark => mark.text)).toEqual(["First\n\nSecond"]);
});

// main's asIs also splits on the ACP conversation's unconfirmed commands, which the composer marks when it queues them.
test("a queued passthrough command splits the mark as main's asIs does", async () => {
  const { store } = harness();
  await opened(store);
  store.queued(ROOT, A, { id: "q1", text: "First", message: { text: "First", anchors: [], attachments: [] } });
  store.queued(ROOT, A, { id: "q2", text: "/share the plan", message: { text: "/share the plan", anchors: [], attachments: [] }, command: true });
  store.queued(ROOT, A, { id: "q3", text: "After", message: { text: "After", anchors: [], attachments: [] } });
  expect(store.localSends(A).map(mark => mark.text)).toEqual(["First"]);
  store.unqueued(A, "q1");
  expect(store.localSends(A).map(mark => mark.text)).toEqual(["/share the plan"]);
});

test("the queue's mark survives the list read that drops the rows main sent", async () => {
  const list: ListView[] = [[summary({ queued: 1 })]];
  let started = 1, applied = 1;
  const host = { list: () => list[0]!, readsStarted: () => started, readsApplied: () => applied, notice: vi.fn(), changed: vi.fn() };
  const store = new ConversationStore(host, window.doan);
  await opened(store);
  store.queued(ROOT, A, { id: "q1", text: "Next", message: { text: "Next", anchors: [], attachments: [] } });
  started++; applied = started; list[0] = [summary({ queued: 0, phase: "ended", working: false })];
  store.syncQueues();
  expect(store.queue(A)).toEqual([]);
  expect(store.localSends(A)).toEqual([{ text: "Next", after: 2 }]);
});

test("Send now marks its message, and a refusal drops the mark with the message back in the queue", async () => {
  const { store } = harness();
  await opened(store);
  store.queued(ROOT, A, { id: "q1", text: "Now", message: { text: "Now", anchors: [], attachments: [] } });
  store.queued(ROOT, A, { id: "q2", text: "Later", message: { text: "Later", anchors: [], attachments: [] } });
  let answer!: (reply: { error: string }) => void;
  doan.sendQueuedNow = vi.fn(() => new Promise(resolve => { answer = resolve; }));
  const pressed = store.sendQueuedNow(A, "q1");
  expect(store.localSends(A)).toContainEqual({ text: "Now", after: 2 });
  // The queue's mark now holds only what is still queued.
  expect(store.localSends(A)).toContainEqual({ text: "Later", after: 2 });
  answer({ error: "not_running" });
  await pressed;
  expect(store.localSends(A).map(mark => mark.text)).toEqual(["Now\n\nLater"]);
});

test("a spent mark goes; the others stay; a deleted conversation drops its marks", async () => {
  const { store } = harness();
  await opened(store);
  store.markSent(A, "one"); store.markSent(A, "two");
  const [one] = store.localSends(A);
  store.spendSends(A, [one!]);
  expect(store.localSends(A)).toEqual([{ text: "two", after: 2 }]);
  store.deleted(A);
  expect(store.localSends(A)).toEqual([]);
});

test("the queue's mark makes the flushed message enter once, and a spent mark enters nothing again", async () => {
  const { store } = harness();
  await opened(store);
  store.queued(ROOT, A, { id: "q1", text: "A", message: { text: "First", anchors: [], attachments: [] } });
  store.queued(ROOT, A, { id: "q2", text: "B", message: { text: "Second", anchors: [], attachments: [] } });
  const events = [event({ type: "user.message", text: "Draw it", anchors: [] }), event({ type: "turn.started" }), event({ type: "turn.done" }),
    event({ type: "turn.started", turnId: "t2" }), event({ type: "user.message", turnId: "t2", text: "First\n\nSecond", anchors: [] })];
  const before = threadItems(events.slice(0, 3), ROOT, true), after = threadItems(events, ROOT, true);
  const keys = entering(before, after, store.localSends(A));
  expect(keys.size).toBe(1);
  store.spendSends(A, store.localSends(A));
  expect(entering([], after, store.localSends(A)).size).toBe(0);
});
