import { describe, expect, it } from "vitest";
import { initialTransport, normalizeClaude, normalizeCodex } from "./transport";
import type { EventPayload, TransportState } from "./types";

function claude(frames: unknown[]) {
  let state: TransportState = initialTransport();
  const events: EventPayload[] = [];
  for (const frame of frames) { const next = normalizeClaude(state, frame, "/repo"); state = next.state; events.push(...next.events); }
  return events;
}
// num_turns 0: no model turn ran, as /compact's result reports.
const success = (result: string, turns = 0) => ({ type: "result", subtype: "success", is_error: false, result, num_turns: turns, uuid: "r1", session_id: "s" });

// A built-in that answers without the model (/context, /usage) is a text result, shown as the agent's answer
// (SDKLocalCommandOutputMessage: "Displayed as assistant-style text in the transcript").
describe("Claude command output", () => {
  it("shows a local command's output as a message", () => {
    expect(claude([{ type: "system", subtype: "local_command_output", content: "Plan usage: 12%", uuid: "o1", session_id: "s" }, success("Plan usage: 12%")]))
      .toEqual([{ type: "message.done", messageId: "o1", text: "Plan usage: 12%" }, { type: "turn.done" }]);
  });
  it("unwraps output the CLI wrapped in its stdout tag", () => {
    expect(claude([{ type: "system", subtype: "local_command_output", content: "<local-command-stdout>| Model | Tokens |</local-command-stdout>", uuid: "o1", session_id: "s" }, success("")]))
      .toEqual([{ type: "message.done", messageId: "o1", text: "| Model | Tokens |" }, { type: "turn.done" }]);
  });
  it("shows a result's text when no model turn ran and the turn showed no message", () => {
    expect(claude([success("| Model | Tokens |")])).toEqual([{ type: "message.done", messageId: "r1", text: "| Model | Tokens |" }, { type: "turn.done" }]);
  });
  it("never shows a model turn's result text, which its messages already carried", () => {
    expect(claude([success("hello", 1)])).toEqual([{ type: "turn.done" }]);
  });
  it("never repeats a result's text the turn already showed as a message", () => {
    expect(claude([{ type: "assistant", parent_tool_use_id: null, message: { id: "m", role: "assistant", content: [{ type: "text", text: "hello" }] } }, success("hello")]))
      .toEqual([{ type: "message.done", messageId: "m", text: "hello" }, { type: "turn.done" }]);
  });
  // /compact's summary message and its "Compacted" line are the CLI's records, not anyone's text.
  it("hides /compact's summary, its stdout line and any output after the boundary", () => {
    expect(claude([
      { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual", pre_tokens: 100 }, session_id: "s" },
      { type: "user", isCompactSummary: true, message: { role: "user", content: "This session is being continued…" }, session_id: "s" },
      { type: "user", message: { role: "user", content: "<local-command-stdout>Compacted </local-command-stdout>" }, session_id: "s" },
      { type: "system", subtype: "local_command_output", content: "Compacted", uuid: "o1", session_id: "s" },
      success("Compacted"),
    ])).toEqual([{ type: "turn.done" }]);
  });
});

// thread/compact/start opens its own turn whose one item is contextCompaction; its completion is the boundary's evidence.
describe("Codex compaction", () => {
  const context = { root: "/repo", sessionId: "thread", turnId: "turn-1" };
  const item = (turnId: string, method = "item/completed") => ({ method, params: { threadId: "thread", turnId, item: { type: "contextCompaction", id: "c1" } } });
  it("reports the boundary once the turn's compaction item completes", () => {
    expect(normalizeCodex(initialTransport(), item("turn-1", "item/started"), context).boundary).toBeUndefined();
    expect(normalizeCodex(initialTransport(), item("turn-1"), context).boundary).toBe("compacted");
  });
  it("reports nothing for another turn's compaction", () => {
    expect(normalizeCodex(initialTransport(), item("turn-2"), context).boundary).toBeUndefined();
  });
});
