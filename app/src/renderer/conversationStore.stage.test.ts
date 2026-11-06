import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationEvent, StageSignal, TurnStage } from "../main/conversation/types";
import { ConversationStore } from "./conversationStore";

// turn-activity U1: the store keeps each conversation's latest stage signal (design §2), whether it came pushed
// (conversation:stage) or on a read's reply, by the rev rule; a deleted conversation's goes and later ones are dropped.

const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000002";
let seq = 0;
const event = (conversationId: string, turnId: string, payload: Record<string, unknown>): ConversationEvent =>
  ({ v: 1, conversationId, seq: ++seq, turnId, at: "2026-11-06T10:00:00Z", ...payload } as ConversationEvent);
const signal = (conversationId: string, turnId: string, rev: number, stage: TurnStage = { kind: "thinking" }): StageSignal => ({ conversationId, turnId, seq, rev, stage });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

let history: ConversationEvent[];
beforeEach(() => {
  seq = 0;
  history = [event(A, "t1", { type: "user.message", text: "Draw it", anchors: [] }), event(A, "t1", { type: "turn.started" })];
  vi.stubGlobal("window", { doan: { readConversation: vi.fn(async () => ({ events: history, lastSeq: history.at(-1)!.seq })) } });
});
afterEach(() => vi.unstubAllGlobals());

function harness() {
  const host = { list: () => [], readsStarted: () => 0, readsApplied: () => 0, notice: vi.fn(), changed: vi.fn() };
  return { store: new ConversationStore(host), host };
}

test("keeps the higher rev within a turn, so a read reply that comes after a newer push never overwrites it", async () => {
  const { store, host } = harness();
  store.track(A);
  await flush();
  const pushed = signal(A, "t1", 7), read = signal(A, "t1", 6, { kind: "general" });
  store.stage(pushed);
  expect(store.stageOf(A)).toBe(pushed);
  expect(host.changed).toHaveBeenCalled();
  host.changed.mockClear();
  store.stage(read);
  expect(store.stageOf(A)).toBe(pushed);
  expect(host.changed).not.toHaveBeenCalled();
  const later = signal(A, "t1", 8, { kind: "general" });
  store.stage(later);
  expect(store.stageOf(A)).toBe(later);
});

test("drops a stage of a turn the history moved past, and takes the new turn's", async () => {
  const { store } = harness();
  store.track(A);
  await flush();
  store.event(event(A, "t1", { type: "turn.done" }));
  store.event(event(A, "t2", { type: "user.message", text: "Next", anchors: [] }));
  store.event(event(A, "t2", { type: "turn.started" }));
  const next = signal(A, "t2", 1, { kind: "general" });
  store.stage(next);
  store.stage(signal(A, "t1", 9));
  expect(store.stageOf(A)).toBe(next);
});

test("keeps a stage for a conversation not read yet, as its events are, and keeps conversations apart", () => {
  const { store } = harness();
  const early = signal(B, "t9", 1);
  store.stage(early);
  expect(store.stageOf(B)).toBe(early);
  expect(store.stageOf(A)).toBeNull();
});

test("a deleted conversation's stage goes, and one arriving late is dropped", async () => {
  const { store, host } = harness();
  store.track(A);
  await flush();
  store.stage(signal(A, "t1", 1));
  store.deleted(A);
  expect(store.stageOf(A)).toBeNull();
  host.changed.mockClear();
  store.stage(signal(A, "t1", 2));
  expect(store.stageOf(A)).toBeNull();
  expect(host.changed).not.toHaveBeenCalled();
});

// Follow-up 1: readThread applies the reply's stage once the merged history is set (MC's `stage?` on the reply).
test("a read reply's stage shows after a re-read, and a later lower-rev reply never overwrites a newer push", async () => {
  const { store } = harness();
  const read = window.doan.readConversation as ReturnType<typeof vi.fn>;
  read.mockResolvedValueOnce({ error: "unknown" });
  store.track(A);
  await flush();
  expect(store.thread(A)?.read).toBe("error");
  const replied = signal(A, "t1", 3);
  read.mockResolvedValueOnce({ events: history, lastSeq: history.at(-1)!.seq, stage: replied });
  store.retryThread(A);
  await flush();
  expect(store.stageOf(A)).toEqual(replied);
  // A reply sent before a push may arrive after it: the push's higher rev stays.
  let answer!: (reply: unknown) => void;
  read.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  const { store: reloaded } = harness();
  reloaded.track(A);
  const pushed = signal(A, "t1", 5, { kind: "general" });
  reloaded.stage(pushed);
  answer({ events: history, lastSeq: history.at(-1)!.seq, stage: signal(A, "t1", 4) });
  await flush();
  expect(reloaded.thread(A)?.read).toBe("ready");
  expect(reloaded.stageOf(A)).toBe(pushed);
});

test("a reply without a stage leaves the held one", async () => {
  const { store } = harness();
  const pushed = signal(A, "t1", 2);
  store.track(A);
  store.stage(pushed);
  await flush();
  expect(store.stageOf(A)).toBe(pushed);
});
