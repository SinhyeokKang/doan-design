import { describe, expect, it } from "vitest";
import { claudeBoundary, claudeHidden, codexBoundary, codexHiddenTurns, copilotCompacted } from "./commandRecords";
import context from "./fixtures/claude-context.json";

// Shapes from the provider-commands PoC (Claude Code 2.1.326, Codex 0.167.1, Copilot 1.0.105) and the session lines
// Claude Code writes (`type: "system", subtype: "local_command"`).
const stdout = (text: string) => `<local-command-stdout>${text}</local-command-stdout>`;
const clearLine = { type: "system", subtype: "local_command", content: "<command-name>/clear</command-name>\n<command-message>clear</command-message>\n<command-args></command-args>", level: "info" };

describe("claudeBoundary", () => {
  it("reads a compaction from the stream's and the session file's compact_boundary", () => {
    expect(claudeBoundary(context.compact[0])).toBe("compacted");
    expect(claudeBoundary({ type: "system", subtype: "compact_boundary", compactMetadata: { trigger: "manual", preTokens: 35799 } })).toBe("compacted");
  });
  it("reads a clear from the /clear line that starts the new session file and from the stream's reset", () => {
    expect(claudeBoundary(clearLine)).toBe("cleared");
    expect(claudeBoundary({ type: "conversation_reset", trigger: "clear", new_conversation_id: "c", session_id: "s", uuid: "u" })).toBe("cleared");
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

describe("claudeHidden", () => {
  it("hides /compact's summary message", () => {
    expect(claudeHidden({ type: "user", isCompactSummary: true, message: { role: "user", content: "This session is being continued from a previous conversation…" } })).toBe(true);
  });
  it("hides command output lines, as a user message or a session line", () => {
    expect(claudeHidden({ type: "user", message: { role: "user", content: stdout("Compacted ") } })).toBe(true);
    expect(claudeHidden({ type: "user", isReplay: true, message: { role: "user", content: [{ type: "text", text: stdout("Compacted ") }] } })).toBe(true);
    expect(claudeHidden({ type: "system", subtype: "local_command", content: stdout("Compacted ") })).toBe(true);
  });
  it("keeps the person's messages, the agent's replies and other records", () => {
    for (const record of [
      { type: "user", message: { role: "user", content: "Explain <local-command-stdout> to me" } },
      { type: "user", isCompactSummary: false, message: { role: "user", content: "hello" } },
      { type: "assistant", message: { content: [{ type: "text", text: stdout("x") }] } },
      { type: "result", subtype: "success", result: "" },
      clearLine, null,
    ]) expect(claudeHidden(record), JSON.stringify(record)).toBe(false);
  });
});

describe("codexBoundary", () => {
  it("reads a compaction from a turn whose only item is contextCompaction", () => {
    expect(codexBoundary({ id: "t2", status: "completed", items: [{ type: "contextCompaction", id: "i1" }] })).toBe("compacted");
  });
  it("reads nothing from other turns", () => {
    for (const turn of [
      { id: "t1", status: "completed", items: [{ type: "userMessage", id: "i0", content: [] }, { type: "contextCompaction", id: "i1" }] },
      { id: "t1", status: "completed", items: [{ type: "agentMessage", id: "i0", text: "Context compacted." }] },
      { id: "t1", status: "completed", items: [] },
      { id: "t1", status: "completed" }, null,
    ]) expect(codexBoundary(turn), JSON.stringify(turn)).toBeNull();
  });
});

describe("codexHiddenTurns", () => {
  const review = { id: "review", status: "completed", rootTurnId: null, items: [{ type: "userMessage", id: "u", content: [{ type: "text", text: "current changes" }] }, { type: "enteredReviewMode", id: "e", review: "current changes" }, { type: "exitedReviewMode", id: "x", review: "Looks fine." }, { type: "agentMessage", id: "a", text: "Looks fine." }] };
  const child = { id: "child", status: "interrupted", rootTurnId: "review", items: [] };
  it("hides /review's interrupted child turn", () => {
    expect(codexHiddenTurns([child, review])).toEqual(new Set(["child"]));
  });
  it("keeps interrupted turns that no review started", () => {
    const stopped = { id: "stopped", status: "interrupted", rootTurnId: "stopped", items: [] };
    const plain = { id: "plain", status: "completed", items: [{ type: "agentMessage", id: "a", text: "hi" }] };
    const underPlain = { id: "under", status: "interrupted", rootTurnId: "plain", items: [] };
    expect(codexHiddenTurns([stopped, plain, underPlain])).toEqual(new Set());
    expect(codexHiddenTurns([{ ...child, status: "completed" }, review])).toEqual(new Set());
    expect(codexHiddenTurns([child])).toEqual(new Set());
    expect(codexHiddenTurns([null, "turn", child, review])).toEqual(new Set(["child"]));
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
