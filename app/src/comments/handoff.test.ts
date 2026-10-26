import { describe, expect, it } from "vitest";
import type { Comment, Target } from "../formats/types";
import type { FolderEntry } from "../main/view";
import { handoffAfterRead, handoffCopied, handoffRows, handoffSummary, quickSelect, staleIds, worktreeNotice, type HandoffSelection } from "./handoff";

const hash = `sha256:${"a".repeat(64)}`;
function comment(id: string, target: Target = {}, status: "open" | "resolved" = "open", body = "Fix the spacing\nsecond line"): Comment {
  return { comment: id, target, status, body, canvasHash: hash, createdBy: { kind: "human", name: "Kim" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}
const button = { element: { doanId: "pay-button", selector: "#pay", html: "<button id=pay>" }, frame: "payment" };
const frames = [{ id: "payment", title: "Payment" }];
const comments = [comment("a", { frame: "payment" }), comment("b", button), comment("c", button, "resolved"), comment("d"), comment("e", button)];
const context = { root: "/repo", canvas: "home", generation: 1 };
const lookup = { ...context, nodes: new Map([["a", "frame-node"], ["b", "button-node"], ["c", "button-node"], ["e", "button-node"]]) };
const selection = (node: string | null, label = "Element · button pay-button · in Payment"): HandoffSelection => ({ node, label, context, lookup });

describe("hand off rows", () => {
  it("lists open comments in Canvas list order with target label and first body line", () => {
    const rows = handoffRows(comments, frames);
    expect(rows.map(row => row.comment.comment)).toEqual(["a", "b", "d", "e"]);
    expect(rows[0]).toMatchObject({ target: { text: "Frame · Payment" }, first: "Fix the spacing" });
    expect(rows[1]?.target.text).toBe("Element · button pay-button · in Payment");
    expect(rows[2]?.target.text).toBe("Canvas");
  });
  it("keeps a long one-line body whole and skips blank leading lines", () => {
    const long = "x".repeat(2000);
    expect(handoffRows([comment("a", {}, "open", long)], frames)[0]?.first).toBe(long);
    expect(handoffRows([comment("a", {}, "open", "\n  \n  Real line  \nmore")], frames)[0]?.first).toBe("Real line");
  });
});

describe("quick select", () => {
  const rows = handoffRows(comments, frames);
  it("All checks every row and None checks nothing", () => {
    expect(quickSelect(rows, "all", null)).toEqual({ ids: ["a", "b", "d", "e"] });
    expect(quickSelect(rows, "none", null)).toEqual({ ids: [] });
  });
  it("Selection uses the Comments Selection filter on the rows", () => {
    expect(quickSelect(rows, "selection", selection("button-node"))).toEqual({ ids: ["b", "e"] });
    expect(quickSelect(rows, "selection", selection("frame-node"))).toEqual({ ids: ["a"] });
  });
  it("Selection is disabled without a selection, with its reason", () => {
    expect(quickSelect(rows, "selection", null)).toEqual({ disabled: "Select an element or frame on the canvas first." });
  });
  it("Selection is disabled when the selected target has no open comments", () => {
    const none = { disabled: "No open comments on Element · button pay-button · in Payment." };
    expect(quickSelect(rows, "selection", selection("other-node"))).toEqual(none);
    expect(quickSelect(rows, "selection", selection(null))).toEqual(none);
    expect(quickSelect(handoffRows([comments[0]!], frames), "selection", selection("button-node"))).toEqual(none);
  });
  it("Selection from another canvas matches nothing", () => {
    expect(quickSelect(rows, "selection", { ...selection("button-node"), lookup: { ...lookup, canvas: "other" } }))
      .toEqual({ disabled: "No open comments on Element · button pay-button · in Payment." });
  });
});

describe("handed off", () => {
  const at = new Date(2026, 9, 26, 14, 2, 10);
  const entry = { ids: ["a", "b"], at };
  it("stays when some are resolved or new comments arrive", () => {
    expect(handoffAfterRead(entry, [comment("a"), comment("b", {}, "resolved")])).toBe(entry);
    expect(handoffAfterRead(entry, [comment("a"), comment("b"), comment("new")])).toBe(entry);
  });
  it("clears when none of the handed-off ids is open any more", () => {
    expect(handoffAfterRead(entry, [comment("a", {}, "resolved"), comment("b", {}, "resolved"), comment("new")])).toBeNull();
    expect(handoffAfterRead(entry, [comment("a", {}, "resolved")])).toBeNull();
    expect(handoffAfterRead(entry, [])).toBeNull();
    expect(handoffAfterRead(null, comments)).toBeNull();
  });
  it("names checked ids that are no longer open, in checked order", () => {
    expect(staleIds(["e", "c", "gone", "a"], comments)).toEqual(["c", "gone"]);
    expect(staleIds(["a", "b"], comments)).toEqual([]);
    expect(staleIds(["a", "b"], [])).toEqual(["a", "b"]);
  });
  it("summarizes with the Activity time format", () => {
    expect(handoffSummary(3, at)).toBe("Handed off 3 · 14:02:10");
    expect(handoffSummary(1, new Date(2026, 0, 1, 9, 5, 7))).toBe("Handed off 1 · 09:05:07");
  });
  it("words the success text in singular and plural", () => {
    expect(handoffCopied(1)).toBe("Copied an instruction for 1 comment. Paste it into your Claude Code or Codex session.");
    expect(handoffCopied(3)).toBe("Copied an instruction for 3 comments. Paste it into your Claude Code or Codex session.");
  });
});

describe("worktree notice", () => {
  const trees = ["/home/me/code/acme-checkout", "/home/me/code/acme-review"];
  const list = (path: string, git?: { branch?: string; detached?: string; worktrees: string[] }): FolderEntry =>
    ({ path, kind: "list", canvases: [], servedRev: 0, ...(git ? { git: { common: "/home/me/code/acme/.git", ...git } } : {}) });
  const checkout = list(trees[0]!, { branch: "feat-checkout", worktrees: trees });
  const review = list(trees[1]!, { detached: "abc1234def", worktrees: trees });
  it("names the branch and path only when the repository has two or more worktrees", () => {
    expect(worktreeNotice(checkout, "/home/me")).toBe("Comments are per worktree. Your agent should work in feat-checkout (~/code/acme-checkout).");
    expect(worktreeNotice(list(trees[0]!, { branch: "main", worktrees: [trees[0]!] }), "/home/me")).toBeNull();
    expect(worktreeNotice({ path: trees[0]!, kind: "notFound" }, "/home/me")).toBeNull();
  });
  it("names only the path when there is no branch (detached)", () => {
    expect(worktreeNotice(review, "/home/me")).toBe("Comments are per worktree. Your agent should work in ~/code/acme-review.");
    expect(worktreeNotice(review, null)).toBe("Comments are per worktree. Your agent should work in /home/me/code/acme-review.");
  });
  it("shows nothing outside git, where there is only one copy", () => {
    expect(worktreeNotice(list("/home/me/code/plain"), "/home/me")).toBeNull();
  });
});
