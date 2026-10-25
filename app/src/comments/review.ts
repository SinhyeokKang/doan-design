import type { Author, Comment } from "../formats/types";
import { compareText } from "./resolution";

export type ReviewComment = Comment;

// `since` is when this device started keeping review times; a canvas never
// reviewed here counts from it, so turning the feature on does not list
// every past resolve. Timestamps share one fixed pattern, so string order is time order.
export interface ReviewMarker { since: string; lastReviewedAt?: string }

// Oldest resolve first, the order Review steps through; ties by comment id.
function byResolveTime(a: ReviewComment, b: ReviewComment): number {
  return compareText(a.resolvedAt ?? "", b.resolvedAt ?? "") || compareText(a.comment, b.comment);
}

export function toReview(comments: readonly ReviewComment[], marker: ReviewMarker, self: string | null): ReviewComment[] {
  const from = marker.lastReviewedAt ?? marker.since;
  return comments
    .filter((comment) => comment.status === "resolved" && comment.resolvedAt !== undefined && comment.resolvedAt > from &&
      !(self !== null && comment.resolvedBy?.kind === "human" && comment.resolvedBy.name === self))
    .sort(byResolveTime);
}

// `reopened`: the person reopened it in this Review. `reopenedElsewhere` and
// `deleted` come from a reread and leave only Next on the step.
export interface ReviewStep {
  comment: string;
  // Fixed when the step joins, so Done's range does not move with later resolves.
  resolvedAt: string;
  mark: "resolved" | "reopened" | "reopenedElsewhere" | "deleted";
  reopenedBy?: Author;
}

// `steps[0..fixed)` is the set fixed at start; arrivals follow it.
// `reviewedTo` is the highest last-review time to ask main for; main only raises it.
export interface ReviewState {
  steps: ReviewStep[];
  fixed: number;
  cursor: number;
  phase: "reviewing" | "done" | "closed";
  reviewedTo?: string;
}

export type ReviewAction =
  | { type: "next" | "previous" | "reopen" | "done" | "close" }
  | { type: "arrived"; comments: readonly ReviewComment[] }
  | { type: "changed"; comments: readonly ReviewComment[] };

function stepOf(comment: ReviewComment): ReviewStep {
  return { comment: comment.comment, resolvedAt: comment.resolvedAt ?? "", mark: "resolved" };
}

// `comments` comes from toReview, so it is already in resolve order.
export function startReview(comments: readonly ReviewComment[]): ReviewState | null {
  if (comments.length === 0) return null;
  return { steps: comments.map(stepOf), fixed: comments.length, cursor: 0, phase: "reviewing" };
}

function raise(state: ReviewState, to: string): ReviewState {
  return state.reviewedTo !== undefined && state.reviewedTo >= to ? state : { ...state, reviewedTo: to };
}

// The person's own Reopen stays only while the comment is still open, so the
// summary and Hand off count just those. A read that still shows the resolve
// they reopened predates their write and keeps the mark.
function reread(step: ReviewStep, current: ReviewComment | undefined): ReviewStep {
  const base = { comment: step.comment, resolvedAt: step.resolvedAt };
  if (current === undefined) return { ...base, mark: "deleted" };
  if (step.mark === "reopened" && (current.status !== "resolved" || current.resolvedAt === step.resolvedAt)) return step;
  if (current.status === "resolved") return { ...base, mark: "resolved" };
  return { ...base, mark: "reopenedElsewhere", ...(current.lastResolution ? { reopenedBy: current.lastResolution.reopenedBy } : {}) };
}

export function reviewState(state: ReviewState, action: ReviewAction): ReviewState {
  if (state.phase !== "reviewing") return state;
  const last = state.steps.length - 1;
  const step = state.steps[state.cursor];
  switch (action.type) {
    case "next":
      if (state.cursor >= last || step === undefined) return state;
      return { ...raise(state, step.resolvedAt), cursor: state.cursor + 1 };
    case "previous":
      return state.cursor === 0 ? state : { ...state, cursor: state.cursor - 1 };
    case "reopen":
      if (step?.mark !== "resolved") return state;
      return { ...state, steps: state.steps.map((item, index) => index === state.cursor ? { ...item, mark: "reopened" } : item) };
    case "done": {
      if (state.cursor !== last) return state;
      const end = state.steps.slice(0, state.fixed).reduce((max, item) => item.resolvedAt > max ? item.resolvedAt : max, "");
      return { ...raise(state, end), phase: "done" };
    }
    case "close":
      return { ...state, phase: "closed" };
    case "arrived": {
      const known = new Set(state.steps.map((item) => item.comment));
      const added = action.comments.filter((comment) => !known.has(comment.comment) && comment.status === "resolved")
        .sort(byResolveTime);
      return added.length === 0 ? state : { ...state, steps: [...state.steps, ...added.map(stepOf)] };
    }
    case "changed": {
      const byId = new Map(action.comments.map((comment) => [comment.comment, comment]));
      return { ...state, steps: state.steps.map((item) => reread(item, byId.get(item.comment))) };
    }
  }
}

// Reviewed counts the steps the last-review time now covers, so an arrival
// left outside Done's range is not counted and shows in the notice again.
export function reviewSummary(state: ReviewState): { text: string; reopened: string[] } {
  const to = state.reviewedTo;
  const reviewed = to === undefined ? 0 : state.steps.filter((item) => item.resolvedAt <= to).length;
  const reopened = state.steps.filter((item) => item.mark === "reopened").map((item) => item.comment);
  const count = (n: number) => n.toLocaleString("en-US");
  return { text: reopened.length > 0 ? `Reviewed ${count(reviewed)} · Reopened ${count(reopened.length)}` : `Reviewed ${count(reviewed)}`, reopened };
}
