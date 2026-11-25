import { describe, expect, it } from "vitest";
import { claudeBoundary, copilotCompacted } from "./commandRecords";
import context from "./fixtures/claude-context.json";

// Recorded provider shapes and the session lines Claude Code writes (`type: "system", subtype: "local_command"`).
const clearLine = { type: "system", subtype: "local_command", content: "<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>", level: "info" };

describe("claudeBoundary", () => {
  it("reads a compaction from the stream's and the session file's compact_boundary", () => {
    expect(claudeBoundary(context.compact[0])).toBe("compacted");
    expect(claudeBoundary({ type: "system", subtype: "compact_boundary", compactMetadata: { trigger: "manual", preTokens: 35799 } })).toBe("compacted");
  });
  it("reads a clear from the /clear line that starts the new session file and from the stream's reset", () => {
    expect(claudeBoundary(clearLine)).toBe("cleared");
    expect(claudeBoundary({ type: "conversation_reset", trigger: "clear", new_conversation_id: "c", session_id: "s", uuid: "u" })).toBe("cleared");
    for (const alias of ["reset", "new"]) expect(claudeBoundary({ ...clearLine, content: clearLine.content.replace("/clear", `/${alias}`) }), alias).toBe("cleared");
  });
  it("reads nothing from other records", () => {
    for (const record of [
      { type: "system", subtype: "local_command", content: "<command-name>/context</command-name>" },
      { type: "system", subtype: "local_command", content: "<command-name>/clearer</command-name>" },
      { type: "conversation_reset", trigger: "plan_mode_exit" },
      { type: "system", subtype: "status", status: "compacting" },
      { type: "user", message: { role: "user", content: "/clear" } },
      { type: "assistant", message: { content: [{ type: "text", text: "Context compacted." }] } },
      null, "line", [],
    ]) expect(claudeBoundary(record), JSON.stringify(record)).toBeNull();
  });
});

describe("copilotCompacted", () => {
  it("reads /compact's result text", () => {
    expect(copilotCompacted("Compacted conversation history and removed 1 message and 0 tokens.")).toBe(true);
  });
  it("reads nothing from other text", () => {
    for (const text of ["", "I compacted the conversation history.", "Context compacted.", " Compacted conversation history"]) expect(copilotCompacted(text), text).toBe(false);
  });
});
