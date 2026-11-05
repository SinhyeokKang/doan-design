import { describe, expect, test } from "vitest";
import { EMPTY_FOLLOW, FOLLOW_IDLE_MS, followDecision, followedFrames, followStopped, followTurnKey, markFollowed } from "./workFollow";
import { elementView, FIT_INSET, fitFrame, type View } from "./viewport";

// work-update A6 (design §1 rule 9, §2 11–12): when the board follows the working frame, and how the person's moves stop it.
const viewport = { width: 800, height: 600 };
// The safe area is x 32–768, y 80–520 (FIT_INSET).
const view: View = { x: 0, y: 0, scale: 1 };
const base = { frame: "b", followed: new Set<string>(), sourceChanged: false, viewport, view, lastPersonMove: 0, now: 10_000, stopped: false, busy: false };
const offscreen = { x: 0, y: 2000, width: 300, height: 200 };

describe("followDecision", () => {
  test("follows a new frame off screen once the person has rested 5 s, not at 4.9 s", () => {
    expect(FOLLOW_IDLE_MS).toBe(5000);
    expect(followDecision({ ...base, rect: offscreen, lastPersonMove: 10_000 - 4900 })).toEqual({ kind: "stay", followed: false });
    expect(followDecision({ ...base, rect: offscreen, lastPersonMove: 10_000 - 5000 }).kind).toBe("move");
  });

  test("a frame that fits at the present zoom is centred in the safe area at that zoom", () => {
    const zoomed = { ...view, scale: 0.5 };
    expect(followDecision({ ...base, rect: offscreen, view: zoomed })).toEqual({ kind: "move", view: elementView(offscreen, viewport, FIT_INSET, zoomed) });
    const result = followDecision({ ...base, rect: offscreen, view: zoomed });
    expect(result.kind === "move" && result.view.scale).toBe(0.5);
  });

  test("a frame that does not fit at the present zoom moves as the frame drawer does (fitFrame)", () => {
    const big = { x: 0, y: 2000, width: 1200, height: 300 };
    expect(followDecision({ ...base, rect: big })).toEqual({ kind: "move", view: fitFrame(big, viewport, FIT_INSET, view) });
  });

  test("a frame already wholly in the safe area stays, counted as followed; one pixel out moves", () => {
    expect(followDecision({ ...base, rect: { x: 32, y: 80, width: 736, height: 440 } })).toEqual({ kind: "stay", followed: true });
    expect(followDecision({ ...base, rect: { x: 31, y: 80, width: 736, height: 440 } }).kind).toBe("move");
    expect(followDecision({ ...base, rect: { x: 32, y: 81, width: 736, height: 440 } }).kind).toBe("move");
  });

  test("a frame taller than the safe area is seen when its top edge is in it", () => {
    expect(followDecision({ ...base, rect: { x: 100, y: 500, width: 300, height: 2000 } })).toEqual({ kind: "stay", followed: true });
    expect(followDecision({ ...base, rect: { x: 100, y: 521, width: 300, height: 2000 } }).kind).toBe("move");
    expect(followDecision({ ...base, rect: { x: 100, y: 60, width: 300, height: 2000 } }).kind).toBe("move");
  });

  test("a frame already followed this turn stays: the same frame's next update or a reload does not move", () => {
    expect(followDecision({ ...base, rect: offscreen, followed: new Set(["b"]) })).toEqual({ kind: "stay", followed: false });
  });

  test("a frame not in the document yet stays unfollowed, so the reload that adds it can still move", () => {
    expect(followDecision({ ...base, rect: null })).toEqual({ kind: "stay", followed: false });
    expect(followDecision({ ...base, rect: offscreen }).kind).toBe("move");
  });

  test("no frame stays", () => {
    expect(followDecision({ ...base, frame: undefined, rect: null })).toEqual({ kind: "stay", followed: false });
  });

  test("an update from another work source changes only the marker: stay, counted as followed", () => {
    expect(followDecision({ ...base, rect: offscreen, sourceChanged: true })).toEqual({ kind: "stay", followed: true });
  });

  test("a stopped turn never moves", () => {
    expect(followDecision({ ...base, rect: offscreen, stopped: true })).toEqual({ kind: "stay", followed: false });
  });

  test("busy (a pick, a capture, a drag, Space, another page, a menu or dialog) stays without counting the frame", () => {
    expect(followDecision({ ...base, rect: offscreen, busy: true })).toEqual({ kind: "stay", followed: false });
  });
});

describe("follow memory", () => {
  test("the turn key: main's terminal turn, or the conversation and its turn", () => {
    expect(followTurnKey({ turn: "t1" })).toBe("terminal:t1");
    expect(followTurnKey({ conversationId: "c1", turnId: "u2" })).toBe("conversation:c1:u2");
  });

  test("a person's move stops every work turn on the canvas", () => {
    const stopped = followStopped(EMPTY_FOLLOW, ["terminal:t1", "conversation:c1:u1"], true);
    expect([...stopped.stopped]).toEqual(["terminal:t1", "conversation:c1:u1"]);
  });

  test("a stop lasts the turn: the same turn stays stopped, a new turn (an update after done) is not", () => {
    const stopped = followStopped(EMPTY_FOLLOW, ["terminal:t1"], true);
    expect(followStopped(stopped, ["terminal:t1"], false).stopped.has("terminal:t1")).toBe(true);
    const next = followStopped(stopped, ["terminal:t2"], false);
    expect(next.stopped.has("terminal:t1")).toBe(false);
    expect(next.stopped.has("terminal:t2")).toBe(false);
  });

  test("followed frames belong to their turn and go with it", () => {
    const memory = markFollowed(markFollowed(EMPTY_FOLLOW, "terminal:t1", "a"), "terminal:t1", "b");
    expect([...followedFrames(memory, "terminal:t1")]).toEqual(["a", "b"]);
    expect(followedFrames(memory, "terminal:t2").size).toBe(0);
    expect(followedFrames(followStopped(memory, ["terminal:t2"], false), "terminal:t1").size).toBe(0);
  });

  test("leaving the canvas and coming back in the same turn keeps the stop and the followed frames", () => {
    // The memory is kept per canvas; coming back reads it with the same keys.
    const memory = markFollowed(followStopped(EMPTY_FOLLOW, ["terminal:t1"], true), "terminal:t1", "a");
    const back = followStopped(memory, ["terminal:t1"], false);
    expect(back.stopped.has("terminal:t1")).toBe(true);
    expect(followedFrames(back, "terminal:t1").has("a")).toBe(true);
  });

  test("entering the canvas counts the frame on screen as followed: it stays", () => {
    const entered = markFollowed(EMPTY_FOLLOW, "terminal:t1", "b");
    expect(followDecision({ ...base, rect: offscreen, followed: followedFrames(entered, "terminal:t1") })).toEqual({ kind: "stay", followed: false });
  });
});
