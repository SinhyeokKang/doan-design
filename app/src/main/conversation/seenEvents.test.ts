import { describe, expect, it } from "vitest";
import { toSee } from "./seenEvents";
import type { ConversationEvent, EventPayload } from "./types";

const history = (...payloads: EventPayload[]): ConversationEvent[] =>
  payloads.map((payload, i) => ({ ...payload, v: 1, conversationId: "c", seq: i + 1, turnId: "t1", at: "2026-11-25T00:00:00.000Z" }));
const lastToSee = (events: readonly ConversationEvent[]) => [...events].reverse().find(toSee)?.seq ?? 0;

describe("toSee and activity.result", () => {
  const edit: EventPayload = { type: "activity", kind: "edit", path: "a.ts", summary: "a.ts", callId: "c1" };
  const result: EventPayload = { type: "activity.result", callId: "c1", path: "a.ts", lines: { added: 2, removed: 1 } };

  it("a result is seen like the edit it counts: it comes inside its turn", () => {
    const [, counted] = history(edit, result);
    expect(toSee(counted!)).toBe(toSee(history(edit)[0]!));
  });

  it("a finished turn's seen end is its terminal, with results or without", () => {
    const withResult = history({ type: "user.message", text: "Go", anchors: [] }, { type: "turn.started" }, edit, result, { type: "turn.done" });
    const without = history({ type: "user.message", text: "Go", anchors: [] }, { type: "turn.started" }, edit, { type: "turn.done" });
    expect(lastToSee(withResult)).toBe(withResult.at(-1)!.seq);
    expect(lastToSee(without)).toBe(without.at(-1)!.seq);
  });
});
