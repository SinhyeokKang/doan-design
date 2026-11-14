import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../view";
import type { PlayingCanvas, ScopedConversation } from "./conversationScope";
import { createPrototypeShowing } from "./showing";

// What main hands the notification check for `prototype:showing`: only a conversation of the canvas playing now.
const PROTO = ".doan/canvases/proto.html";
const row = (path: string, id?: string): CanvasRow => ({ path, url: `http://127.0.0.1:5123/t/tok/k1/${path}`, ...(id ? { id } : {}) });
const ENTRIES: FolderEntry[] = [
  { path: "/r", kind: "list", canvases: [row(PROTO, "proto"), row(".doan/canvases/other.html", "other")], servedRev: 0 },
  { path: "/r-wt", kind: "list", canvases: [row(PROTO, "proto")], servedRev: 0 },
];
const CONVERSATIONS: ScopedConversation[] = [
  { conversationId: "c-proto", root: "/r", canvas: { id: "proto", path: PROTO } },
  { conversationId: "c-proto-wt", root: "/r-wt", canvas: { id: "proto", path: PROTO } },
  { conversationId: "c-other", root: "/r", canvas: { id: "other", path: ".doan/canvases/other.html" } },
];
const PLAYING: PlayingCanvas = { root: "/r", canvas: { id: "proto" }, path: PROTO };
const OTHER: PlayingCanvas = { root: "/r", canvas: { id: "other" }, path: ".doan/canvases/other.html" };
const PLAYING_WT: PlayingCanvas = { root: "/r-wt", canvas: { id: "proto" }, path: PROTO };

function setup() {
  let playing: PlayingCanvas | null = PLAYING;
  // The controller's count of playing-canvas changes.
  let generation = 0;
  const showing = createPrototypeShowing({ playing: () => playing, generation: () => generation, conversations: () => CONVERSATIONS, entries: () => ENTRIES });
  return { showing, play: (next: PlayingCanvas | null) => { if (next !== playing) generation++; playing = next; } };
}

describe("prototype:showing", () => {
  test("a conversation of the playing canvas is shown; null clears it", () => {
    const { showing } = setup();
    showing.set("prototype", { conversationId: "c-proto" });
    expect(showing.shown()).toBe("c-proto");
    showing.set("prototype", { conversationId: null });
    expect(showing.shown()).toBeNull();
  });

  test("a conversation outside the playing canvas is never taken, the same canvas in another worktree neither", () => {
    const { showing } = setup();
    for (const id of ["c-other", "c-proto-wt", "missing"]) {
      showing.set("prototype", { conversationId: id });
      expect(showing.shown(), id).toBeNull();
    }
  });

  test("a play of another canvas drops what the window showed until it says again", () => {
    const { showing, play } = setup();
    showing.set("prototype", { conversationId: "c-proto" });
    play(OTHER);
    expect(showing.shown()).toBeNull();
    // A late report for the earlier canvas is not the playing canvas's either.
    showing.set("prototype", { conversationId: "c-proto" });
    expect(showing.shown()).toBeNull();
    play(PLAYING_WT);
    showing.set("prototype", { conversationId: "c-proto-wt" });
    expect(showing.shown()).toBe("c-proto-wt");
  });

  test("playing another canvas and coming back does not bring the earlier report back", () => {
    const { showing, play } = setup();
    showing.set("prototype", { conversationId: "c-proto" });
    play(OTHER);
    play(PLAYING);
    expect(showing.shown()).toBeNull();
    showing.set("prototype", { conversationId: "c-proto" });
    expect(showing.shown()).toBe("c-proto");
  });

  test("the window's close drops it, and another role's report is ignored", () => {
    const { showing } = setup();
    showing.set("prototype", { conversationId: "c-proto" });
    showing.closed();
    expect(showing.shown()).toBeNull();
    showing.set("main", { conversationId: "c-proto" });
    expect(showing.shown()).toBeNull();
  });
});
