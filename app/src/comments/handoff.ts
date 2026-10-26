import type { Comment } from "../formats/types";
import type { FolderEntry } from "../main/view";
import { timeText } from "../renderer/activity";
import { displayPath } from "../renderer/projectDisplay";
import { projectList, type CanvasContext, type TargetLookup } from "./projection";
import { targetLabel, type TargetLabel } from "./targetLabel";

export interface HandoffRow { comment: Comment; target: TargetLabel; first: string }

// Open comments in the Canvas list's order (fold order); the line cut is CSS, so `first` stays whole.
export function handoffRows(comments: readonly Comment[], frames: ReadonlyArray<{ id: string; title?: string }>): HandoffRow[] {
  return comments.filter(c => c.status === "open").map(comment => ({
    comment,
    target: targetLabel(comment.target, frames),
    first: comment.body.split("\n").map(line => line.trim()).find(line => line !== "") ?? "",
  }));
}

export type QuickKind = "all" | "none" | "selection";
// The selection as it was when the dialog opened; `label` is its targetLabel text.
export interface HandoffSelection { node: string | null; label: string; context: CanvasContext; lookup: TargetLookup }
export type QuickResult = { ids: string[] } | { disabled: string };

export function quickSelect(rows: readonly HandoffRow[], kind: QuickKind, selection: HandoffSelection | null): QuickResult {
  if (kind === "all") return { ids: rows.map(row => row.comment.comment) };
  if (kind === "none") return { ids: [] };
  if (!selection) return { disabled: "Select an element or frame on the canvas first." };
  const ids = projectList(rows.map(row => row.comment), selection.context, selection.lookup, { scope: "selection", node: selection.node, status: "open" }).map(c => c.comment);
  return ids.length ? { ids } : { disabled: `No open comments on ${selection.label}.` };
}

export interface HandoffEntry { ids: readonly string[]; at: Date }

// Partial progress belongs to Review, so only a fully settled hand-off is cleared.
export function handoffAfterRead(entry: HandoffEntry | null, comments: readonly Comment[]): HandoffEntry | null {
  if (!entry) return null;
  const open = new Set(comments.filter(c => c.status === "open").map(c => c.comment));
  return entry.ids.some(id => open.has(id)) ? entry : null;
}

export function staleIds(checked: readonly string[], list: readonly Comment[]): string[] {
  const open = new Set(list.filter(c => c.status === "open").map(c => c.comment));
  return checked.filter(id => !open.has(id));
}

export function handoffSummary(n: number, at: Date): string {
  return `Handed off ${n} · ${timeText(at)}`;
}

export function handoffCopied(n: number): string {
  return `Copied an instruction for ${n} ${n === 1 ? "comment" : "comments"}. Paste it into your Claude Code or Codex session.`;
}

// Comment files are per worktree, so the notice matters only when the repository has another one.
// Git's own list counts worktrees not added to Doan, where an agent may well be running.
// A detached HEAD has no branch to name.
export function worktreeNotice(entry: FolderEntry, home: string | null): string | null {
  if (entry.kind !== "list" || (entry.git?.worktrees.length ?? 0) < 2) return null;
  const branch = entry.git?.branch;
  const path = displayPath(entry.path, home);
  return `Comments are per worktree. Your agent should work in ${branch ? `${branch} (${path})` : path}.`;
}
