import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ConversationEvent } from "../main/conversation/types";
import { ConversationStore, streamBatch } from "./conversationStore";
import { threadItems } from "./threadItems";

// Streamed text applies at most once per frame: deltas wait for the next frame and apply together, while anything
// else (the message's end, the turn's end) applies at once with the deltas that waited before it, in arrival order.

const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000002";
let seq = 0;
const event = (payload: Record<string, unknown>, conversationId = A): ConversationEvent =>
  ({ v: 1, conversationId, seq: ++seq, turnId: "t1", at: "2026-11-12T00:00:00Z", ...payload } as ConversationEvent);
const delta = (text: string, conversationId = A) => event({ type: "message.delta", messageId: "m1", text }, conversationId);
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

// The accumulated text each apply leaves, from arrivals and frame boundaries in order.
function framesOf(steps: readonly (ConversationEvent | "frame")[]): string[] {
  let held: ConversationEvent[] = [], text = "";
  const applied: string[] = [];
  for (const step of steps) {
    const next = streamBatch(held, step);
    held = next.held;
    if (!next.apply.length) continue;
    for (const e of next.apply) if (e.type === "message.delta") text += e.text; else if (e.type === "message.done") text = e.text;
    applied.push(text);
  }
  return applied;
}

beforeEach(() => { seq = 0; });

test("deltas that arrive between two frames apply together at the next frame, as the text accumulated so far", () => {
  // 40 ms deltas against 16.7 ms frames: some frames carry one delta, some none.
  expect(framesOf([delta("a"), "frame", "frame", delta("b"), delta("c"), "frame", "frame", delta("d"), "frame"])).toEqual(["a", "abc", "abcd"]);
});

test("a frame with nothing waiting applies nothing", () => {
  expect(streamBatch([], "frame")).toEqual({ apply: [], held: [] });
});

test("the message's end applies at once, after the deltas that waited before it", () => {
  const waiting = [delta("a"), delta("b")], done = event({ type: "message.done", messageId: "m1", text: "ab!" });
  expect(streamBatch(waiting, done)).toEqual({ apply: [...waiting, done], held: [] });
  expect(framesOf([delta("a"), delta("b"), done])).toEqual(["ab!"]);
});

test("the turn's end applies at once with the last deltas, without waiting for a frame", () => {
  const ended = event({ type: "turn.done" });
  expect(framesOf([delta("a"), "frame", delta("b"), ended])).toEqual(["a", "ab"]);
});

test("a delta waits even when it is the first; nothing applies until the frame", () => {
  expect(streamBatch([], delta("a")).apply).toEqual([]);
});

// The store in front of the renderer: one change per frame however many deltas came.
function harness() {
  const frames: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { frames.push(run); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames[id - 1] = () => {}; });
  const host = { list: () => [], readsStarted: () => 0, readsApplied: () => 0, notice: vi.fn(), changed: vi.fn() };
  const store = new ConversationStore(host);
  const frame = () => { const run = frames.splice(0); for (const f of run) f(); };
  const text = () => threadItems(store.thread(A)!.events, "/code/doan", true).flatMap(item => item.kind === "agent" ? [item.text] : []).join("|");
  return { store, host, frame, text };
}
let history: ConversationEvent[];
beforeEach(() => {
  history = [event({ type: "user.message", text: "Draw it", anchors: [] }), event({ type: "turn.started" })];
  vi.stubGlobal("window", { doan: { readConversation: vi.fn(async ({ conversationId }: { conversationId: string }) => {
    const events = history.map(e => ({ ...e, conversationId }));
    return { events, lastSeq: events.at(-1)!.seq };
  }) } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test("the store tells the screens once per frame however many deltas came, with all of them applied", async () => {
  const h = harness();
  h.store.track(A); await flush();
  h.host.changed.mockClear();
  h.store.event(delta("a")); h.store.event(delta("b")); h.store.event(delta("c"));
  expect(h.host.changed).not.toHaveBeenCalled();
  expect(h.text()).toBe("");
  h.frame();
  expect(h.host.changed).toHaveBeenCalledTimes(1);
  expect(h.text()).toBe("abc");
  h.frame();
  expect(h.host.changed).toHaveBeenCalledTimes(1);
});

test("the message's end and the turn's end show at once, with the final text", async () => {
  const h = harness();
  h.store.track(A); await flush();
  h.store.event(delta("a")); h.store.event(delta("b"));
  h.host.changed.mockClear();
  h.store.event(event({ type: "message.done", messageId: "m1", text: "ab." }));
  h.store.event(event({ type: "turn.done" }));
  expect(h.text()).toBe("ab.");
  expect(h.host.changed).toHaveBeenCalled();
  h.host.changed.mockClear();
  h.frame();
  expect(h.host.changed).not.toHaveBeenCalled();
});

test("a listener hears each waiting delta when its frame applies them", async () => {
  const h = harness();
  h.store.track(A); await flush();
  const heard = vi.fn();
  h.store.subscribe(heard);
  h.store.event(delta("a")); h.store.event(delta("b"));
  expect(heard).not.toHaveBeenCalled();
  h.frame();
  expect(heard.mock.calls).toEqual([[A, "event"], [A, "event"]]);
});

test("a history read that answers while deltas wait keeps them", async () => {
  const h = harness();
  let answer!: (value: { events: ConversationEvent[]; lastSeq: number }) => void;
  const pending = new Promise<{ events: ConversationEvent[]; lastSeq: number }>(resolve => { answer = resolve; });
  (window as unknown as { doan: { readConversation: () => Promise<unknown> } }).doan.readConversation = () => pending;
  h.store.track(A);
  h.store.event(delta("a"));
  answer({ events: history, lastSeq: history.at(-1)!.seq });
  await flush();
  h.frame();
  expect(h.text()).toBe("a");
});

test("a deleted conversation's waiting deltas never apply, and another conversation's still do", async () => {
  const h = harness();
  h.store.track(A); h.store.track(B); await flush();
  h.store.event(delta("a")); h.store.event(delta("x", B));
  h.store.deleted(A);
  h.frame();
  expect(h.store.thread(A)).toBeNull();
  expect(threadItems(h.store.thread(B)!.events, "/code/doan", true).flatMap(item => item.kind === "agent" ? [item.text] : [])).toEqual(["x"]);
});

test("without frames (a hidden window) the waiting deltas still apply shortly after", async () => {
  vi.useFakeTimers();
  const h = harness();
  h.store.track(A); await vi.runAllTimersAsync();
  h.store.event(delta("a"));
  await vi.advanceTimersByTimeAsync(1000);
  expect(h.text()).toBe("a");
});
