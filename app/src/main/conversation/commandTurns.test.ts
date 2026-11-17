import { describe, expect, it } from "vitest";
import { commandTurns } from "./commandTurns";
import type { ConversationEvent, EventPayload } from "./types";

function history(...turns: [turnId: string, ...EventPayload[]][]): ConversationEvent[] {
  let seq = 0;
  return turns.flatMap(([turnId, ...events]) => events.map(event => ({ ...event, v: 1 as const, conversationId: "c", seq: ++seq, turnId, at: "2026-11-17T00:00:00.000Z" })));
}
const say = (text: string): EventPayload => ({ type: "user.message", text, anchors: [] });
const started: EventPayload = { type: "turn.started" }, done: EventPayload = { type: "turn.done" };

// Boundaries are rebuilt from Doan's own record after a restart (no provider record is read): a command turn whose
// message is that provider's /compact or /clear and that ended done.
describe("commandTurns from the record", () => {
  it("names command turns and draws a boundary after each that ended done", () => {
    const events = history(["t1", say("hello"), started, done], ["t2", say("/compact keep notes"), started, done], ["t3", say("/context"), started, done], ["t4", say("/reset"), started, done]);
    expect(commandTurns("claude", events)).toEqual({ turns: { t2: "compact", t3: "context", t4: "clear" }, boundaries: [{ turnId: "t2", kind: "compacted" }, { turnId: "t4", kind: "cleared" }], usageStale: true });
  });
  it("draws no boundary for a command turn that failed, was stopped or is still running", () => {
    const events = history(["t1", say("/compact"), started, { type: "turn.failed", code: "unknown" }], ["t2", say("/compact"), started, { type: "interrupted", reason: "user" }], ["t3", say("/compact"), started]);
    expect(commandTurns("codex", events)).toEqual({ turns: { t1: "compact", t2: "compact", t3: "compact" }, boundaries: [], usageStale: false });
  });
  it("reads only a turn's own first message, never a message steered into it", () => {
    const events = history(["t1", say("hello"), started, say("/compact"), done]);
    expect(commandTurns("claude", events)).toEqual({ turns: {}, boundaries: [], usageStale: false });
  });
  it("reads each provider's own table: Copilot's /compact draws one, Codex's /clear is text", () => {
    expect(commandTurns("copilot", history(["t1", say("/compact"), started, done]))).toEqual({ turns: { t1: "compact" }, boundaries: [{ turnId: "t1", kind: "compacted" }], usageStale: false });
    expect(commandTurns("codex", history(["t1", say("/clear"), started, done]))).toEqual({ turns: {}, boundaries: [], usageStale: false });
  });
  it("answers an empty record with nothing", () => {
    expect(commandTurns("claude", [])).toEqual({ turns: {}, boundaries: [], usageStale: false });
  });
});

// In this run a boundary shows only once the provider's own event said so; a turn this run sent is read from that, not
// from its end.
describe("commandTurns with this run's provider evidence", () => {
  it("lets this run's evidence decide a turn it sent, and the record decide the rest", () => {
    const events = history(["t1", say("/compact"), started, done], ["t2", say("/compact"), started, done], ["t3", say("/clear"), started]);
    const live = new Map<string, "compacted" | "cleared" | null>([["t2", null], ["t3", "cleared"]]);
    expect(commandTurns("claude", events, live)).toEqual({ turns: { t1: "compact", t2: "compact", t3: "clear" }, boundaries: [{ turnId: "t1", kind: "compacted" }, { turnId: "t3", kind: "cleared" }], usageStale: true });
  });
  it("never draws a boundary for a turn that is not a command, whatever the evidence says", () => {
    const events = history(["t1", say("hello"), started, done]);
    expect(commandTurns("claude", events, new Map([["t1", "compacted" as const]]))).toEqual({ turns: {}, boundaries: [], usageStale: false });
  });
});

// After a clear the context value the record holds is the previous session's: it is stale until a later turn measured
// the new one. Nothing is made up meanwhile (no 0).
describe("usageStale", () => {
  const usage: EventPayload = { type: "context.usage", used: 900, size: 200_000 };
  it("is stale after the last clear until a later turn reports usage", () => {
    expect(commandTurns("claude", history(["t1", say("hello"), started, usage, done], ["t2", say("/clear"), started, done])).usageStale).toBe(true);
    expect(commandTurns("claude", history(["t1", say("/clear"), started, done], ["t2", say("hi"), started, usage, done])).usageStale).toBe(false);
    expect(commandTurns("claude", history(["t1", say("/clear"), started, done], ["t2", say("hi"), started, usage, done], ["t3", say("/clear"), started, done])).usageStale).toBe(true);
  });
  it("is not stale for a compaction, which reports its own value, nor for a clear that did not take", () => {
    expect(commandTurns("claude", history(["t1", say("/compact"), started, usage, done])).usageStale).toBe(false);
    expect(commandTurns("claude", history(["t1", say("/clear"), started, { type: "turn.failed", code: "session_unavailable" }])).usageStale).toBe(false);
  });
});
