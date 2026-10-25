import type { Author, Comment } from "../formats/types";

// Declared here rather than imported from formats/: fold adds `lastResolution`
// to an open comment that was reopened, and drops it once it is resolved again.
export interface LastResolution { by: Author; at: string; reopenedBy: Author; reopenedAt: string }
export type ResolvedComment = Comment & { lastResolution?: LastResolution };

// Code-unit order, not locale order: timestamps share one fixed pattern, so
// this is time order, and ids compare the same way everywhere.
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Newest resolve first; ties by comment id.
export function sortResolved<T extends Comment>(comments: readonly T[]): T[] {
  return [...comments].sort((a, b) => compareText(b.resolvedAt ?? "", a.resolvedAt ?? "") || compareText(a.comment, b.comment));
}

// `relative` is the panel's relative-time formatter; the caller puts the
// absolute time in `title`.
export function resolutionText(comment: Comment, relative: (at: string) => string): string | null {
  if (comment.status !== "resolved" || !comment.resolvedBy || comment.resolvedAt === undefined) return null;
  return `Resolved by ${comment.resolvedBy.name} · ${relative(comment.resolvedAt)}`;
}

export function reopenText(comment: ResolvedComment, relative: (at: string) => string): { reopened: string; previously: string } | null {
  const last = comment.lastResolution;
  if (comment.status !== "open" || !last) return null;
  return { reopened: `Reopened by ${last.reopenedBy.name} · ${relative(last.reopenedAt)}`, previously: `Previously resolved by ${last.by.name}` };
}

// Where focus goes when a card leaves the list (`cards` in list order, before
// it left). Never to a button: a second Enter must not resolve the next comment.
export function nextFocus(cards: readonly string[], removed: string): { kind: "card"; comment: string } | { kind: "title" } {
  const index = cards.indexOf(removed);
  const next = index === -1 ? undefined : cards[index + 1] ?? cards[index - 1];
  return next === undefined ? { kind: "title" } : { kind: "card", comment: next };
}
