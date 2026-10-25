import { describe, expect, test } from "vitest";
import type { Author, Comment } from "../formats/types";
import { nextFocus, reopenText, resolutionText, sortResolved, type NamedLine } from "./resolution";

const kim: Author = { kind: "human", name: "Kim Doe", email: "kim@example.com" };
const codex: Author = { kind: "agent", name: "codex" };

function comment(id: string, resolvedAt?: string): Comment {
  return {
    comment: id, status: resolvedAt ? "resolved" : "open", body: "Body", target: {}, canvasHash: "sha256-x",
    createdBy: kim, createdAt: "2026-10-25T09:00:00.000Z", updatedAt: "2026-10-25T09:00:00.000Z",
    ...(resolvedAt ? { resolvedBy: codex, resolvedAt } : {}),
  };
}

describe("sortResolved", () => {
  test("puts the newest resolve first and breaks ties by comment id", () => {
    const list = [
      comment("cmt_c", "2026-10-25T10:00:00.000Z"),
      comment("cmt_b", "2026-10-25T10:05:00.000Z"),
      comment("cmt_a", "2026-10-25T10:00:00.000Z"),
      comment("cmt_d", "2026-10-25T10:05:00.000Z"),
    ];
    expect(sortResolved(list).map((item) => item.comment)).toEqual(["cmt_b", "cmt_d", "cmt_a", "cmt_c"]);
    expect(list.map((item) => item.comment)).toEqual(["cmt_c", "cmt_b", "cmt_a", "cmt_d"]);
  });
});

// The relative part is the caller's shipped formatter; these tests pin the words around it.
const relative = (at: string) => `rel(${at})`;
const lineText = (line: NamedLine) => line.lead + line.name + line.tail;

describe("resolutionText", () => {
  test("names the resolver, with an agent's runtime name, apart from the words around it", () => {
    const line = resolutionText(comment("cmt_a", "2026-10-25T10:00:00.000Z"), relative)!;
    expect(line).toEqual({ lead: "Resolved by ", name: "codex", tail: " · rel(2026-10-25T10:00:00.000Z)", at: "2026-10-25T10:00:00.000Z" });
    expect(lineText(line)).toBe("Resolved by codex · rel(2026-10-25T10:00:00.000Z)");
    expect(lineText(resolutionText({ ...comment("cmt_a", "2026-10-25T10:00:00.000Z"), resolvedBy: kim }, relative)!)).toBe("Resolved by Kim Doe · rel(2026-10-25T10:00:00.000Z)");
  });

  test("has nothing to say for an open comment", () => {
    expect(resolutionText(comment("cmt_a"), relative)).toBeNull();
  });
});

describe("reopenText", () => {
  test("names who reopened it and who had resolved it", () => {
    const lastResolution = { by: codex, at: "2026-10-25T10:00:00.000Z", reopenedBy: kim, reopenedAt: "2026-10-25T10:09:00.000Z" };
    const lines = reopenText({ ...comment("cmt_a"), lastResolution }, relative)!;
    expect(lines.reopened).toEqual({ lead: "Reopened by ", name: "Kim Doe", tail: " · rel(2026-10-25T10:09:00.000Z)", at: "2026-10-25T10:09:00.000Z" });
    expect(lineText(lines.reopened)).toBe("Reopened by Kim Doe · rel(2026-10-25T10:09:00.000Z)");
    expect(lines.previously).toEqual({ lead: "Previously resolved by ", name: "codex", tail: "" });
    expect(lineText(lines.previously)).toBe("Previously resolved by codex");
  });

  test("has nothing to say without a last resolution or once resolved again", () => {
    expect(reopenText(comment("cmt_a"), relative)).toBeNull();
    const lastResolution = { by: codex, at: "2026-10-25T10:00:00.000Z", reopenedBy: kim, reopenedAt: "2026-10-25T10:09:00.000Z" };
    expect(reopenText({ ...comment("cmt_a", "2026-10-25T10:10:00.000Z"), lastResolution }, relative)).toBeNull();
  });
});

describe("nextFocus", () => {
  test("moves to the next card after the removed one", () => {
    expect(nextFocus(["cmt_a", "cmt_b", "cmt_c"], "cmt_a")).toEqual({ kind: "card", comment: "cmt_b" });
    expect(nextFocus(["cmt_a", "cmt_b", "cmt_c"], "cmt_b")).toEqual({ kind: "card", comment: "cmt_c" });
  });

  test("moves to the previous card when the last one leaves", () => {
    expect(nextFocus(["cmt_a", "cmt_b", "cmt_c"], "cmt_c")).toEqual({ kind: "card", comment: "cmt_b" });
  });

  test("moves to the Comments title when the only card leaves or the card is not listed", () => {
    expect(nextFocus(["cmt_a"], "cmt_a")).toEqual({ kind: "title" });
    expect(nextFocus(["cmt_a", "cmt_b"], "cmt_x")).toEqual({ kind: "title" });
    expect(nextFocus([], "cmt_a")).toEqual({ kind: "title" });
  });
});
