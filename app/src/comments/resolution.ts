import type { Comment } from "../formats/types";

// A line's words around the name, so the card can set the name apart
// (design/revision-recheck.html, resolution-meta). `at` goes in `title`.
export interface NamedLine { lead: string; name: string; tail: string; at?: string }

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
export function resolutionText(comment: Comment, relative: (at: string) => string): NamedLine | null {
  if (comment.status !== "resolved" || !comment.resolvedBy || comment.resolvedAt === undefined) return null;
  return { lead: "Resolved by ", name: comment.resolvedBy.name, tail: ` · ${relative(comment.resolvedAt)}`, at: comment.resolvedAt };
}

// fold keeps `lastResolution` only on an open comment that was reopened.
export function reopenText(comment: Comment, relative: (at: string) => string): { reopened: NamedLine; previously: NamedLine } | null {
  const last = comment.lastResolution;
  if (comment.status !== "open" || !last) return null;
  return {
    reopened: { lead: "Reopened by ", name: last.reopenedBy.name, tail: ` · ${relative(last.reopenedAt)}`, at: last.reopenedAt },
    previously: { lead: "Previously resolved by ", name: last.by.name, tail: "" },
  };
}

// Where focus goes when a card leaves the list (`cards` in list order, before
// it left). Never to a button: a second Enter must not resolve the next comment.
export function nextFocus(cards: readonly string[], removed: string): { kind: "card"; comment: string } | { kind: "title" } {
  const index = cards.indexOf(removed);
  const next = index === -1 ? undefined : cards[index + 1] ?? cards[index - 1];
  return next === undefined ? { kind: "title" } : { kind: "card", comment: next };
}
