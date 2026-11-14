import { describe, expect, test } from "vitest";
import type { ConversationEvent } from "../conversation/types";
import type { PlayingCanvas, ScopedConversation } from "./conversationScope";
import { createPrototypePromoted } from "./promoted";

// A project conversation that became the playing canvas's conversation (its conversation.bound event), which the
// prototype window cannot tell from its list (it holds the playing canvas's conversations only). Main relays the id
// alone, for the canvas playing now and until that canvas changes or the window closes.
const PROTO = ".doan/canvases/proto.html";
const LOOSE = ".doan/canvases/loose.html";
const A: PlayingCanvas = { root: "/r", canvas: { id: "proto" }, path: PROTO };
const B: PlayingCanvas = { root: "/r", canvas: { path: LOOSE }, path: LOOSE };
const A_WT: PlayingCanvas = { root: "/r-wt", canvas: { id: "proto" }, path: PROTO };
// The index as main reads it after the binding.
const CONVERSATIONS: ScopedConversation[] = [
  { conversationId: "p1", root: "/r", canvas: { id: "proto", path: PROTO } },
  { conversationId: "p-wt", root: "/r-wt", canvas: { id: "proto", path: PROTO } },
  { conversationId: "p-loose", root: "/r", canvas: { path: LOOSE } },
];
const bound = (conversationId: string, canvas: { path: string; id?: string }): ConversationEvent =>
  ({ v: 1, conversationId, seq: 3, turnId: "t", at: "2026-11-14T00:00:00.000Z", type: "conversation.bound", canvas });
const other = (conversationId: string): ConversationEvent => ({ v: 1, conversationId, seq: 3, turnId: "t", at: "2026-11-14T00:00:00.000Z", type: "turn.done" });

function setup(start: PlayingCanvas | null = A) {
  let playing = start;
  let generation = 0;
  const promoted = createPrototypePromoted({ playing: () => playing, generation: () => generation });
  return { promoted, play: (next: PlayingCanvas | null) => { if (next !== playing) generation++; playing = next; } };
}

describe("the relayed promoted conversation", () => {
  test("a project conversation bound to the playing canvas is promoted there", () => {
    const { promoted } = setup();
    expect(promoted.event(bound("p1", { id: "proto", path: PROTO }), CONVERSATIONS)).toBe(true);
    expect(promoted.current()).toBe("p1");
  });

  test("another event, or a binding to another canvas, changes nothing", () => {
    const { promoted } = setup();
    expect(promoted.event(other("p1"), CONVERSATIONS)).toBe(false);
    expect(promoted.event(bound("p-loose", { path: LOOSE }), CONVERSATIONS)).toBe(false);
    expect(promoted.current()).toBeNull();
  });

  // POSTMORTEM 2026-11-01: worktrees of one repository share canvas ids and paths.
  test("the same canvas id and path in another worktree is not the playing canvas", () => {
    const { promoted } = setup();
    expect(promoted.event(bound("p-wt", { id: "proto", path: PROTO }), CONVERSATIONS)).toBe(false);
    expect(promoted.current()).toBeNull();
    const wt = setup(A_WT).promoted;
    expect(wt.event(bound("p-wt", { id: "proto", path: PROTO }), CONVERSATIONS)).toBe(true);
    expect(wt.event(bound("p1", { id: "proto", path: PROTO }), CONVERSATIONS)).toBe(false);
  });

  test("an ID-less canvas is matched by its path, never by an ID", () => {
    const { promoted } = setup(B);
    expect(promoted.event(bound("p-loose", { path: LOOSE }), CONVERSATIONS)).toBe(true);
    expect(promoted.current()).toBe("p-loose");
    const byId = setup(B).promoted;
    expect(byId.event(bound("p-loose", { path: LOOSE, id: "loose" }), CONVERSATIONS)).toBe(false);
  });

  test("a binding of a conversation main does not know is not taken", () => {
    const { promoted } = setup();
    expect(promoted.event(bound("unknown", { id: "proto", path: PROTO }), CONVERSATIONS)).toBe(false);
  });

  test("a change of the playing canvas clears it, also on the way back", () => {
    const { promoted, play } = setup();
    promoted.event(bound("p1", { id: "proto", path: PROTO }), CONVERSATIONS);
    play(B);
    expect(promoted.current()).toBeNull();
    play(A);
    expect(promoted.current()).toBeNull();
  });

  test("the window's close clears it, and nothing is taken while nothing plays", () => {
    const { promoted, play } = setup();
    promoted.event(bound("p1", { id: "proto", path: PROTO }), CONVERSATIONS);
    promoted.closed();
    expect(promoted.current()).toBeNull();
    play(null);
    expect(promoted.event(bound("p1", { id: "proto", path: PROTO }), CONVERSATIONS)).toBe(false);
  });
});
