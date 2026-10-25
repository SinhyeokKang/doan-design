import { describe, expect, test } from "vitest";
import type { Author, Comment } from "../formats/types";
import { reviewState, reviewSummary, startReview, toReview, type ReviewComment, type ReviewState } from "./review";

const human = (name: string): Author => ({ kind: "human", name, email: `${name.toLowerCase().replace(/ /g, ".")}@example.com` });
const agent = (name: string): Author => ({ kind: "agent", name });
const kim = human("Kim Doe");
const codex = agent("codex");

const at = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;

function comment(id: string, extra: Partial<ReviewComment> = {}): ReviewComment {
  return {
    comment: id, status: "open", body: `Body ${id}`, target: {}, canvasHash: "sha256-x",
    createdBy: kim, createdAt: at(0), updatedAt: at(0), ...extra,
  };
}
const resolved = (id: string, minute: number, by: Author = codex): ReviewComment =>
  comment(id, { status: "resolved", resolvedBy: by, resolvedAt: at(minute) });
const ids = (comments: readonly Comment[]) => comments.map((item) => item.comment);

describe("toReview", () => {
  const list = [resolved("cmt_b", 5), resolved("cmt_a", 3), comment("cmt_open"), resolved("cmt_c", 5, agent("claude-code"))];

  test("uses since when this canvas has no last review time, oldest resolve first and ties by id", () => {
    expect(ids(toReview(list, { since: at(1) }, "Kim Doe"))).toEqual(["cmt_a", "cmt_b", "cmt_c"]);
  });

  test("prefers the canvas's last review time over since", () => {
    expect(ids(toReview(list, { since: at(1), lastReviewedAt: at(4) }, "Kim Doe"))).toEqual(["cmt_b", "cmt_c"]);
  });

  test("leaves out a resolve at exactly the last review time", () => {
    expect(ids(toReview(list, { since: at(0), lastReviewedAt: at(5) }, "Kim Doe"))).toEqual([]);
    expect(ids(toReview(list, { since: at(3) }, "Kim Doe"))).toEqual(["cmt_b", "cmt_c"]);
  });

  test("keeps a resolve dated in the future and drops one dated before the marker", () => {
    const future = resolved("cmt_future", 0, codex);
    future.resolvedAt = "2099-01-01T00:00:00.000Z";
    const past = resolved("cmt_past", 0, codex);
    past.resolvedAt = "2020-01-01T00:00:00.000Z";
    expect(ids(toReview([future, past], { since: at(1) }, "Kim Doe"))).toEqual(["cmt_future"]);
  });

  test("leaves out resolves by a human with the current Git name, but not an agent or another person", () => {
    const mine = resolved("cmt_mine", 6, kim);
    const sameNameAgent = resolved("cmt_agent", 7, agent("Kim Doe"));
    const other = resolved("cmt_other", 8, human("Lee"));
    expect(ids(toReview([mine, sameNameAgent, other], { since: at(1) }, "Kim Doe"))).toEqual(["cmt_agent", "cmt_other"]);
  });

  test("leaves nothing out by name when the Git name is unknown", () => {
    expect(ids(toReview([resolved("cmt_mine", 6, kim)], { since: at(1) }, null))).toEqual(["cmt_mine"]);
  });
});

function review(...minutes: number[]): ReviewState {
  return startReview(minutes.map((minute, index) => resolved(`cmt_${index + 1}`, minute)));
}
const step = (state: ReviewState) => state.steps[state.cursor];

describe("reviewState", () => {
  test("an empty set starts nothing", () => {
    expect(startReview([])).toBeNull();
  });

  test("starts at the first step with no progress", () => {
    const state = review(1, 2, 3);
    expect(state).toMatchObject({ cursor: 0, fixed: 3, phase: "reviewing" });
    expect(state.reviewedTo).toBeUndefined();
    expect(state.steps.map((item) => item.mark)).toEqual(["resolved", "resolved", "resolved"]);
  });

  test("Previous at the first step stays and raises nothing", () => {
    const state = review(1, 2, 3);
    expect(reviewState(state, { type: "previous" })).toEqual(state);
  });

  test("Next raises the last review time to the step just passed, Previous does not lower it", () => {
    let state = reviewState(review(1, 2, 3), { type: "next" });
    expect(state).toMatchObject({ cursor: 1, reviewedTo: at(1) });
    state = reviewState(state, { type: "next" });
    expect(state).toMatchObject({ cursor: 2, reviewedTo: at(2) });
    state = reviewState(state, { type: "previous" });
    expect(state).toMatchObject({ cursor: 1, reviewedTo: at(2) });
    state = reviewState(state, { type: "next" });
    expect(state).toMatchObject({ cursor: 2, reviewedTo: at(2) });
  });

  test("Next at the last step does nothing; that step's button is Done", () => {
    const last = reviewState(reviewState(review(1, 2), { type: "next" }), { type: "next" });
    expect(last).toMatchObject({ cursor: 1, reviewedTo: at(1), phase: "reviewing" });
  });

  test("Reopen in the middle marks only that step and keeps the cursor", () => {
    const state = reviewState(reviewState(review(1, 2, 3), { type: "next" }), { type: "reopen" });
    expect(state.cursor).toBe(1);
    expect(state.steps.map((item) => item.mark)).toEqual(["resolved", "reopened", "resolved"]);
    expect(reviewState(state, { type: "reopen" })).toEqual(state);
  });

  test("Close keeps the progress already passed", () => {
    const passed = reviewState(reviewState(review(1, 2, 3), { type: "next" }), { type: "close" });
    expect(passed).toMatchObject({ phase: "closed", reviewedTo: at(1) });
    expect(reviewState(review(1, 2, 3), { type: "close" }).reviewedTo).toBeUndefined();
    expect(reviewState(passed, { type: "next" })).toEqual(passed);
  });

  test("Done raises to the newest resolve of the set fixed at start, only at the last step", () => {
    let state = review(1, 2, 3);
    expect(reviewState(state, { type: "done" })).toEqual(state);
    state = reviewState(reviewState(state, { type: "next" }), { type: "next" });
    state = reviewState(state, { type: "done" });
    expect(state).toMatchObject({ phase: "done", reviewedTo: at(3) });
  });

  test("arrivals join the end in resolve order but stay outside Done's range", () => {
    let state = reviewState(review(2, 4), { type: "next" });
    state = reviewState(state, { type: "arrived", comments: [resolved("cmt_1", 2), resolved("cmt_late", 9), resolved("cmt_early", 3)] });
    expect(state.steps.map((item) => item.comment)).toEqual(["cmt_1", "cmt_2", "cmt_early", "cmt_late"]);
    expect(state).toMatchObject({ cursor: 1, fixed: 2 });
    state = reviewState(reviewState(state, { type: "next" }), { type: "next" });
    expect(state).toMatchObject({ cursor: 3, reviewedTo: at(4) });
    expect(reviewState(state, { type: "done" })).toMatchObject({ phase: "done", reviewedTo: at(4) });
  });

  test("Done keeps a higher progress already passed through an arrival", () => {
    let state = reviewState(review(2, 4), { type: "arrived", comments: [resolved("cmt_late", 9)] });
    state = reviewState(state, { type: "next" });
    state = reviewState(state, { type: "next" });
    state = reviewState(state, { type: "arrived", comments: [resolved("cmt_later", 11)] });
    state = reviewState(reviewState(state, { type: "next" }), { type: "done" });
    expect(state).toMatchObject({ cursor: 3, phase: "done", reviewedTo: at(9) });
  });

  test("marks a step reopened by someone else or deleted, and Next skips past it", () => {
    let state = review(1, 2, 3);
    const reopened = comment("cmt_2", { lastResolution: { by: codex, at: at(2), reopenedBy: codex, reopenedAt: at(5) } });
    state = reviewState(state, { type: "changed", comments: [resolved("cmt_1", 1), reopened] });
    expect(state.steps.map((item) => item.mark)).toEqual(["resolved", "reopenedElsewhere", "deleted"]);
    expect(state.steps[1]?.reopenedBy).toEqual(codex);
    expect(state.cursor).toBe(0);
    state = reviewState(reviewState(state, { type: "next" }), { type: "next" });
    expect(state).toMatchObject({ cursor: 2, reviewedTo: at(2) });
  });

  test("Reopen does nothing on a step reopened elsewhere or deleted", () => {
    const state = reviewState(review(1), { type: "changed", comments: [] });
    expect(step(state)?.mark).toBe("deleted");
    expect(reviewState(state, { type: "reopen" })).toEqual(state);
  });

  test("a reread keeps the person's own Reopen and the step's order and resolve time", () => {
    let state = reviewState(review(1, 2), { type: "reopen" });
    const mine = comment("cmt_1", { lastResolution: { by: codex, at: at(1), reopenedBy: kim, reopenedAt: at(6) } });
    const resolvedAgain = resolved("cmt_2", 7);
    state = reviewState(state, { type: "changed", comments: [resolvedAgain, mine] });
    expect(state.steps).toEqual([
      { comment: "cmt_1", resolvedAt: at(1), mark: "reopened" },
      { comment: "cmt_2", resolvedAt: at(2), mark: "resolved" },
    ]);
  });

  test("a step reopened elsewhere and resolved again reads as resolved", () => {
    let state = reviewState(review(1), { type: "changed", comments: [comment("cmt_1")] });
    expect(step(state)?.mark).toBe("reopenedElsewhere");
    expect(step(state)?.reopenedBy).toBeUndefined();
    state = reviewState(state, { type: "changed", comments: [resolved("cmt_1", 8)] });
    expect(step(state)).toEqual({ comment: "cmt_1", resolvedAt: at(1), mark: "resolved" });
  });

  test("does not change the original state", () => {
    const state = review(1, 2);
    const copy = structuredClone(state);
    reviewState(state, { type: "next" });
    reviewState(state, { type: "reopen" });
    reviewState(state, { type: "arrived", comments: [resolved("cmt_x", 9)] });
    expect(state).toEqual(copy);
  });
});

describe("reviewSummary", () => {
  test("counts reviewed steps and the person's reopens, with the reopened ids for Hand off", () => {
    let state = review(1, 2, 3);
    state = reviewState(reviewState(state, { type: "next" }), { type: "reopen" });
    state = reviewState(reviewState(state, { type: "next" }), { type: "done" });
    expect(reviewSummary(state)).toEqual({ text: "Reviewed 3 · Reopened 1", reopened: ["cmt_2"] });
  });

  test("shows only the reviewed count when nothing was reopened", () => {
    const state = reviewState(review(1), { type: "done" });
    expect(reviewSummary(state)).toEqual({ text: "Reviewed 1", reopened: [] });
  });

  test("leaves an arrival outside Done's range out of Reviewed", () => {
    let state = reviewState(review(2, 4), { type: "arrived", comments: [resolved("cmt_late", 9)] });
    state = reviewState(reviewState(reviewState(state, { type: "next" }), { type: "next" }), { type: "done" });
    expect(reviewSummary(state).text).toBe("Reviewed 2");
  });

  test("groups thousands", () => {
    const comments = Array.from({ length: 1284 }, (_, index) => resolved(`cmt_${String(index).padStart(4, "0")}`, 1));
    let state = startReview(comments) as ReviewState;
    state = { ...state, cursor: state.steps.length - 1, steps: state.steps.map((item, index) => index < 312 ? { ...item, mark: "reopened" as const } : item) };
    expect(reviewSummary(reviewState(state, { type: "done" })).text).toBe("Reviewed 1,284 · Reopened 312");
  });
});
