import { describe, expect, it } from "vitest";
import type { Warning } from "../formats/types";
import { commentsPanelState, emptyListText, identityText, pluralComments, READ_FAILED_EDITOR, warningFileText, warningGroups, WARNINGS_TITLE, warningText } from "./panelText";

const warning = (code: Warning["code"], line: number): Warning => ({ code, line });

describe("warning text", () => {
  it.each([
    ["invalid_event", "A line could not be read and was skipped."],
    ["unknown_version", "This record was written by a newer version of Doan."],
    ["conflicting_duplicate", "Two versions of the same change disagree, so both were ignored."],
    ["agent_not_allowed", "An agent tried to add or edit a comment. Agents can only resolve, so it was ignored."],
    ["duplicate_create", "A comment was created twice; the later copy was ignored."],
    ["orphan_event", "A change refers to a comment that doesn't exist; it was ignored."],
  ] as const)("gives %s a sentence", (code, text) => {
    expect(warningText(code)).toBe(text);
  });

  it("titles the block and names the file once with the next step", () => {
    expect(WARNINGS_TITLE).toBe("Some comment changes were ignored");
    expect(warningFileText("checkout")).toBe("In .doan/comments/checkout.jsonl. Ask your agent to run doan comments and fix the file.");
  });

  it("groups by code in first-seen order with sorted, unique line numbers", () => {
    expect(warningGroups([
      warning("invalid_event", 9), warning("agent_not_allowed", 12), warning("invalid_event", 5),
      warning("unknown_version", 14), warning("invalid_event", 9),
    ])).toEqual([
      { code: "invalid_event", lines: [5, 9], label: "Lines 5, 9" },
      { code: "agent_not_allowed", lines: [12], label: "Line 12" },
      { code: "unknown_version", lines: [14], label: "Line 14" },
    ]);
  });

  it("keeps one group per code across all six codes", () => {
    const codes = ["invalid_event", "unknown_version", "conflicting_duplicate", "agent_not_allowed", "duplicate_create", "orphan_event"] as const;
    const groups = warningGroups([...codes.map((code, i) => warning(code, i + 1)), warning("conflicting_duplicate", 10)]);
    expect(groups.map(group => group.code)).toEqual(codes);
    expect(groups[2]).toEqual({ code: "conflicting_duplicate", lines: [3, 10], label: "Lines 3, 10" });
    expect(warningGroups([])).toEqual([]);
  });
});

describe("emptyListText", () => {
  it.each([
    ["selection", "open", "No open comments on this selection", "Comment on selection to add one."],
    ["canvas", "open", "No open comments", "Choose Comment on canvas, or select an element or frame."],
    ["selection", "resolved", "No resolved comments on this selection", "Resolved comments appear here."],
    ["canvas", "resolved", "No resolved comments", "Comments you or your agent resolve appear here."],
  ] as const)("names %s · %s", (scope, status, title, body) => {
    expect(emptyListText(scope, status, 0)).toEqual({ title, body });
  });

  it("points to open comments elsewhere only for Open on a selection", () => {
    expect(emptyListText("selection", "open", 4)).toEqual({ title: "No open comments on this selection", body: "There are 4 open comments elsewhere on this canvas; Hand off… includes them." });
    expect(emptyListText("selection", "open", 1).body).toBe("There is 1 open comment elsewhere on this canvas; Hand off… includes it.");
    expect(emptyListText("selection", "resolved", 4).body).toBe("Resolved comments appear here.");
    expect(emptyListText("canvas", "open", 4).body).toBe("Choose Comment on canvas, or select an element or frame.");
  });
});

describe("commentsPanelState", () => {
  const ready = { status: "ready" } as const, loading = { status: "loading" } as const, failed = { status: "failed" } as const;

  it.each(["missing", "invalid", "duplicate"] as const)("shows only the %s identity block over every other state", cause => {
    for (const read of [ready, loading, failed])
      for (const author of [ready, loading, { status: "missing" } as const, failed])
        expect(commentsPanelState(cause, read, author)).toEqual({ kind: "identity", cause });
  });

  it("shows the read state and the Git name block independently without an identity cause", () => {
    expect(commentsPanelState(null, ready, ready)).toEqual({ kind: "panel", read: "ready", authorBlock: false });
    expect(commentsPanelState(null, loading, loading)).toEqual({ kind: "panel", read: "loading", authorBlock: true });
    expect(commentsPanelState(null, failed, { status: "missing" })).toEqual({ kind: "panel", read: "failed", authorBlock: true });
    expect(commentsPanelState(null, failed, ready)).toEqual({ kind: "panel", read: "failed", authorBlock: false });
  });

  it("words each identity block, naming the duplicate id", () => {
    expect(identityText("missing", "checkout")).toEqual({ title: "This canvas has no ID", body: "Ask your agent to add a unique doan:canvas ID. Run doan check in a terminal to see details." });
    expect(identityText("invalid", "checkout")).toEqual({ title: "This canvas ID isn't valid", body: "Ask your agent to add a unique doan:canvas ID. Run doan check in a terminal to see details." });
    expect(identityText("duplicate", "checkout")).toEqual({ title: "Another canvas uses the ID checkout", body: "Ask your agent to give one of them a different ID. Run doan check in a terminal to see details." });
  });

  it("tells an open editor how to recover from a read failure", () => {
    expect(READ_FAILED_EDITOR).toBe("Comments couldn’t be read. Choose Retry, then save.");
  });
});

describe("pluralComments", () => {
  it.each([[0, "0 open comments"], [1, "1 open comment"], [2, "2 open comments"]])("counts %i", (n, text) => {
    expect(pluralComments(n)).toBe(text);
  });
});
