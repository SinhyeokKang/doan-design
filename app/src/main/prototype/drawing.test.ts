import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../view";
import type { PlayingCanvas, ScopedConversation } from "./conversationScope";
import { createPrototypeDrawing, prototypeTargetRef } from "./drawing";

// The drawing project conversation's id, which the main window computes for the canvas the prototype window plays and
// main relays to that window: only for the target it plays now, only a project conversation of its root, and only until
// the playing canvas changes or the window closes.
const PROTO = ".doan/canvases/proto.html";
const LOOSE = ".doan/canvases/loose.html";
const row = (path: string, id?: string): CanvasRow => ({ path, url: `http://127.0.0.1:5123/t/tok/k1/${path}`, ...(id ? { id } : {}) });
const ENTRIES: FolderEntry[] = [
  { path: "/r", kind: "list", canvases: [row(PROTO, "proto"), row(LOOSE)], servedRev: 0 },
  { path: "/r-wt", kind: "list", canvases: [row(PROTO, "proto")], servedRev: 0 },
];
const CONVERSATIONS: ScopedConversation[] = [
  { conversationId: "p-project", root: "/r" },
  { conversationId: "p-project-wt", root: "/r-wt" },
  { conversationId: "c-proto", root: "/r", canvas: { id: "proto", path: PROTO } },
];
const A: PlayingCanvas = { root: "/r", canvas: { id: "proto" }, path: PROTO };
const B: PlayingCanvas = { root: "/r", canvas: { path: LOOSE }, path: LOOSE };
const A_WT: PlayingCanvas = { root: "/r-wt", canvas: { id: "proto" }, path: PROTO };
const forA = { root: "/r", canvas: { id: "proto", path: PROTO } };

function setup(start: PlayingCanvas | null = A) {
  let playing = start;
  let generation = 0;
  const drawing = createPrototypeDrawing({ playing: () => playing, generation: () => generation, conversations: () => CONVERSATIONS, entries: () => ENTRIES });
  return { drawing, play: (next: PlayingCanvas | null) => { if (next !== playing) generation++; playing = next; } };
}

describe("prototypeTargetRef", () => {
  test("the playing canvas as the main window names it: root, path and the ID when it has one", () => {
    expect(prototypeTargetRef(A)).toEqual({ root: "/r", canvas: { id: "proto", path: PROTO } });
    expect(prototypeTargetRef(B)).toEqual({ root: "/r", canvas: { path: LOOSE } });
    expect(prototypeTargetRef(null)).toBeNull();
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
    expect(drawing.set("main", { root: "/r-wt", canvas: { id: "proto", path: PROTO }, conversationId: "p-project-wt" })).toBe(false);
    expect(drawing.set("main", { root: "/r", canvas: { path: LOOSE }, conversationId: "p-project" })).toBe(false);
    expect(drawing.set("main", { ...forA, conversationId: "p-project-wt" })).toBe(false);
    expect(drawing.current()).toBeNull();
    const wt = setup(A_WT).drawing;
    expect(wt.set("main", { root: "/r-wt", canvas: { id: "proto", path: PROTO }, conversationId: "p-project-wt" })).toBe(true);
  });

  test("a canvas conversation or an unknown one is not a drawing project conversation", () => {
    const { drawing } = setup();
    for (const id of ["c-proto", "missing"]) expect(drawing.set("main", { ...forA, conversationId: id }), id).toBe(false);
    expect(drawing.current()).toBeNull();
  });

  test("an ID-less canvas is named by its path", () => {
    const { drawing } = setup(B);
    expect(drawing.set("main", { root: "/r", canvas: { path: LOOSE }, conversationId: "p-project" })).toBe(true);
    expect(drawing.set("main", { root: "/r", canvas: { path: LOOSE, id: "loose" }, conversationId: "p-project" })).toBe(false);
  });

  test("a change of the playing canvas clears it, also on the way back, until the main window says again", () => {
    const { drawing, play } = setup();
    drawing.set("main", { ...forA, conversationId: "p-project" });
    play(B);
    expect(drawing.current()).toBeNull();
    play(A);
    expect(drawing.current()).toBeNull();
    drawing.set("main", { ...forA, conversationId: "p-project" });
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
    for (const value of [undefined, null, {}, { ...forA }, { ...forA, conversationId: 3 }, { ...forA, conversationId: "bad id" }, { root: "/r", canvas: "proto", conversationId: null }, { ...forA, conversationId: null, extra: 1 }]) {
      expect(drawing.set("main", value), JSON.stringify(value)).toBe(false);
    }
  });
});
