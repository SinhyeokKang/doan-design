import { describe, expect, test } from "vitest";
import type { PlayingCanvas, ScopedConversation } from "./conversationScope";
import { createPrototypeDrawing, prototypeTargetRef } from "./drawing";

// The drawing project conversation's id, which the main window computes for the canvas the prototype window plays and
// main relays to that window: only for the target it plays now, only a project conversation of its root, and only until
// the playing canvas changes or the window closes.
const PROTO = ".doan/canvases/proto.html";
const LOOSE = ".doan/canvases/loose.html";
const CONVERSATIONS: ScopedConversation[] = [
  { conversationId: "p-project", root: "/r" },
  { conversationId: "p-project-wt", root: "/r-wt" },
  { conversationId: "c-proto", root: "/r", canvas: { id: "proto", path: PROTO } },
];
const A: PlayingCanvas = { root: "/r", canvas: { id: "proto" }, path: PROTO };
const B: PlayingCanvas = { root: "/r", canvas: { path: LOOSE }, path: LOOSE };
const A_WT: PlayingCanvas = { root: "/r-wt", canvas: { id: "proto" }, path: PROTO };
// A report for the first play of A (generation 0).
const forA = { root: "/r", canvas: { id: "proto", path: PROTO }, generation: 0 };

function setup(start: PlayingCanvas | null = A) {
  let playing = start;
  let generation = 0;
  const drawing = createPrototypeDrawing({ playing: () => playing, generation: () => generation, conversations: () => CONVERSATIONS });
  return { drawing, play: (next: PlayingCanvas | null) => { if (next !== playing) generation++; playing = next; }, generation: () => generation };
}

describe("prototypeTargetRef", () => {
  test("the playing canvas as the main window names it: root, path and the ID when it has one", () => {
    expect(prototypeTargetRef(A, 3)).toEqual({ root: "/r", canvas: { id: "proto", path: PROTO }, generation: 3 });
    expect(prototypeTargetRef(B, 0)).toEqual({ root: "/r", canvas: { path: LOOSE }, generation: 0 });
    expect(prototypeTargetRef(null, 4)).toBeNull();
  });
});

describe("the relayed drawing conversation", () => {
  test("a project conversation of the playing root, for the playing canvas, is taken; null clears it", () => {
    const { drawing } = setup();
    expect(drawing.set("main", { ...forA, conversationId: "p-project" })).toBe(true);
    expect(drawing.current()).toBe("p-project");
    expect(drawing.set("main", { ...forA, conversationId: null })).toBe(true);
    expect(drawing.current()).toBeNull();
  });

  test("a report for a canvas that no longer plays is refused", () => {
    const { drawing, play } = setup();
    play(B);
    expect(drawing.set("main", { ...forA, conversationId: "p-project" })).toBe(false);
    expect(drawing.current()).toBeNull();
  });

  test("another root or another canvas is refused, the same canvas in another worktree too", () => {
    const { drawing } = setup();
    expect(drawing.set("main", { root: "/r-wt", canvas: { id: "proto", path: PROTO }, generation: 0, conversationId: "p-project-wt" })).toBe(false);
    expect(drawing.set("main", { root: "/r", canvas: { path: LOOSE }, generation: 0, conversationId: "p-project" })).toBe(false);
    expect(drawing.set("main", { ...forA, conversationId: "p-project-wt" })).toBe(false);
    expect(drawing.current()).toBeNull();
    const wt = setup(A_WT).drawing;
    expect(wt.set("main", { root: "/r-wt", canvas: { id: "proto", path: PROTO }, generation: 0, conversationId: "p-project-wt" })).toBe(true);
  });

  test("a canvas conversation or an unknown one is not a drawing project conversation", () => {
    const { drawing } = setup();
    for (const id of ["c-proto", "missing"]) expect(drawing.set("main", { ...forA, conversationId: id }), id).toBe(false);
    expect(drawing.current()).toBeNull();
  });

  test("an ID-less canvas is named by its path", () => {
    const { drawing } = setup(B);
    expect(drawing.set("main", { root: "/r", canvas: { path: LOOSE }, generation: 0, conversationId: "p-project" })).toBe(true);
    expect(drawing.set("main", { root: "/r", canvas: { path: LOOSE, id: "loose" }, generation: 0, conversationId: "p-project" })).toBe(false);
  });

  test("a change of the playing canvas clears it, also on the way back, until the main window says again for this play", () => {
    const { drawing, play, generation } = setup();
    drawing.set("main", { ...forA, conversationId: "p-project" });
    play(B);
    expect(drawing.current()).toBeNull();
    play(A);
    expect(drawing.current()).toBeNull();
    // The report made for the first play of A is not one for this play.
    expect(drawing.set("main", { ...forA, conversationId: "p-project" })).toBe(false);
    expect(drawing.set("main", { ...forA, generation: generation(), conversationId: "p-project" })).toBe(true);
    expect(drawing.current()).toBe("p-project");
  });

  test("the window's close clears it, and nothing is taken while nothing plays", () => {
    const { drawing, play } = setup();
    drawing.set("main", { ...forA, conversationId: "p-project" });
    drawing.closed();
    expect(drawing.current()).toBeNull();
    play(null);
    expect(drawing.set("main", { ...forA, conversationId: "p-project" })).toBe(false);
  });

  test("only the main window may say it", () => {
    const { drawing } = setup();
    for (const kind of ["prototype", undefined, "settings"]) expect(drawing.set(kind, { ...forA, conversationId: "p-project" }), String(kind)).toBe(false);
    expect(drawing.current()).toBeNull();
  });

  test("a malformed report is refused", () => {
    const { drawing } = setup();
    for (const value of [undefined, null, {}, { ...forA }, { ...forA, conversationId: 3 }, { ...forA, conversationId: "bad id" }, { root: "/r", canvas: "proto", generation: 0, conversationId: null }, { ...forA, generation: "0", conversationId: null }, { root: "/r", canvas: { id: "proto", path: PROTO }, conversationId: null }, { ...forA, conversationId: null, extra: 1 }]) {
      expect(drawing.set("main", value), JSON.stringify(value)).toBe(false);
    }
  });
});
