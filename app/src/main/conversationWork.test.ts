import { describe, expect, test } from "vitest";
import { applyConversationWork, endConversationWork, type ConversationUpdate, type ConversationWork, type LiveTurn } from "./conversationWork";
const root = "/repo", path = ".doan/canvases/a.html";
const update = (extra: Partial<{ conversation: string; root: string; path: string; frame: string; note: string }> = {}): ConversationUpdate =>
  ({ v: 3, token: "t", root, action: "update", path, conversation: "c1", ...extra });
const live = (turns: Record<string, LiveTurn>): ReadonlyMap<string, LiveTurn> => new Map(Object.entries(turns));
const running = (turnId = "t1", at = root): LiveTurn => ({ root: at, turnId, running: true });
const none: readonly ConversationWork[] = [];

describe("applyConversationWork", () => {
  test("a running turn's update is kept with that turn, and the next replaces it with omitted parts cleared", () => {
    let state = applyConversationWork(none, update({ frame: "hero", note: "Drawing the hero" }), live({ c1: running() }), 10);
    expect(state).toEqual([{ conversationId: "c1", root, path, frame: "hero", note: "Drawing the hero", touched: 10, turnId: "t1" }]);
    state = applyConversationWork(state, update({ path: ".doan/canvases/b.html", frame: "pricing" }), live({ c1: running() }), 20);
    expect(state).toEqual([{ conversationId: "c1", root, path: ".doan/canvases/b.html", frame: "pricing", touched: 20, turnId: "t1" }]);
    state = applyConversationWork(state, update(), live({ c1: running() }), 30);
    expect(state).toEqual([{ conversationId: "c1", root, path, touched: 30, turnId: "t1" }]);
  });
  test("each conversation keeps its own last update", () => {
    let state = applyConversationWork(none, update({ frame: "a" }), live({ c1: running(), c2: running("u1") }), 1);
    state = applyConversationWork(state, update({ conversation: "c2", frame: "b" }), live({ c1: running(), c2: running("u1") }), 2);
    expect(state).toEqual([
      { conversationId: "c1", root, path, frame: "a", touched: 1, turnId: "t1" },
      { conversationId: "c2", root, path, frame: "b", touched: 2, turnId: "u1" },
    ]);
  });
  // design §1 rule 5: an unknown id, an ended turn or another root is answered ok and dropped, with no change.
  test.each<[string, ReadonlyMap<string, LiveTurn>]>([
    ["an unknown conversation", live({ other: running() })],
    ["a turn that ended", live({ c1: { root, turnId: "t1", running: false } })],
    ["a conversation of another root", live({ c1: running("t1", "/other") })],
  ])("%s changes nothing", (_label, turns) => {
    const state: readonly ConversationWork[] = [{ conversationId: "c1", root: "/other", path, touched: 0, turnId: "t0" }];
    expect(applyConversationWork(state, update({ frame: "a" }), turns, 5)).toBe(state);
  });
  // POSTMORTEM 2026-10-27: a late update after the turn ended, before the next is accepted, is dropped.
  test("a late update between the end of a turn and the acceptance of the next is dropped", () => {
    let state = applyConversationWork(none, update({ frame: "a" }), live({ c1: running("t1") }), 1);
    state = endConversationWork(state, "c1");
    expect(state).toEqual([]);
    const between = applyConversationWork(state, update({ frame: "late" }), live({ c1: { root, turnId: "t1", running: false } }), 2);
    expect(between).toBe(state);
  });
  // design §1 rule 5 '한계', accepted by the person: the request names no turn, so once the next turn is accepted the
  // previous turn's late update cannot be told apart and counts for the new turn.
  test("a previous turn's update arriving after the next turn was accepted counts for the new turn", () => {
    const state = endConversationWork(applyConversationWork(none, update({ frame: "a" }), live({ c1: running("t1") }), 1), "c1");
    expect(applyConversationWork(state, update({ frame: "late" }), live({ c1: running("t2") }), 3))
      .toEqual([{ conversationId: "c1", root, path, frame: "late", touched: 3, turnId: "t2" }]);
  });
});

describe("endConversationWork", () => {
  test("removes only that conversation's content and keeps the state when it has none", () => {
    const state = applyConversationWork(applyConversationWork(none, update(), live({ c1: running() }), 1), update({ conversation: "c2" }), live({ c2: running("u1") }), 2);
    expect(endConversationWork(state, "c1")).toEqual([{ conversationId: "c2", root, path, touched: 2, turnId: "u1" }]);
    expect(endConversationWork(state, "missing")).toBe(state);
  });
});
