import { describe, expect, it } from "vitest";
import type { ConversationEvent } from "../main/conversation/types";
import { contextRing, contextText, tokenText } from "./contextWindow";
import { DANGER, ringDanger } from "./ProgressRing";

// context-window-ring design §3 'UI' and pure functions 5–7; the confirmed draft .doan/canvases/context-window-ring.html.
let seq = 0;
const ev = (payload: Record<string, unknown>): ConversationEvent => ({ v: 1, conversationId: "c1", seq: ++seq, turnId: "t1", at: "2026-11-06T00:00:00Z", ...payload } as ConversationEvent);
const usage = (used: number, size: number) => ev({ type: "context.usage", used, size });

describe("contextRing", () => {
  it("reads the last context.usage of the thread", () => {
    const events = [ev({ type: "turn.started" }), usage(10_000, 200_000), ev({ type: "turn.done" }), ev({ type: "turn.started" }), usage(84_000, 200_000), ev({ type: "turn.done" })];
    expect(contextRing(events)).toEqual({ value: 42, percent: 42, used: 84_000, size: 200_000 });
  });

  it("is null without a recorded value", () => {
    expect(contextRing([])).toBeNull();
    expect(contextRing([ev({ type: "turn.started" }), ev({ type: "turn.done" })])).toBeNull();
  });

  it("fills the ring at 100 past the window while the percent stays the real ratio", () => {
    expect(contextRing([usage(208_000, 200_000)])).toEqual({ value: 100, percent: 104, used: 208_000, size: 200_000 });
  });
});

describe("contextText", () => {
  it("gives the name and the tooltip's first line as one text, with when the value is from", () => {
    expect(contextText({ value: 42, percent: 42, used: 84_000, size: 200_000 })).toEqual({ label: "Context window 42% used · last turn", tokens: "84K of 200K tokens" });
  });

  it("floors the percent (decision 15) and keeps a ratio past 100", () => {
    expect(contextText({ value: 69.9, percent: 69.9, used: 699_000, size: 1_000_000 }).label).toBe("Context window 69% used · last turn");
    expect(contextText(contextRing([usage(208_000, 200_000)])!).label).toBe("Context window 104% used · last turn");
  });

  it("floors exactly where float division would land below the integer", () => {
    // 29 * 100 / 100 is 29 exactly, but 0.29 * 100 is 28.999999999999996.
    expect(contextText(contextRing([usage(29, 100)])!).label).toBe("Context window 29% used · last turn");
  });
});

describe("tokenText", () => {
  it("keeps counts under 1,000, writes K under a million and M with one decimal above", () => {
    expect([0, 999, 1_000, 84_000, 84_999, 258_400, 699_999].map(tokenText)).toEqual(["0", "999", "1K", "84K", "84K", "258K", "699K"]);
    expect([1_000_000, 1_048_576, 1_200_000, 1_299_999].map(tokenText)).toEqual(["1M", "1M", "1.2M", "1.2M"]);
  });
});

describe("ringDanger", () => {
  it("compares the unrounded ratio with the usage ring's DANGER", () => {
    expect(DANGER).toBe(70);
    expect([69.9, 70, 104].map(ringDanger)).toEqual([false, true, true]);
    expect(ringDanger(contextRing([usage(699, 1_000)])!.percent)).toBe(false);
    expect(ringDanger(contextRing([usage(7, 10)])!.percent)).toBe(true);
  });
});
