import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { CanvasRow } from "../main/view";
import type { WorkItem } from "../main/workState";
import { sameCanvas } from "./canvasConversationRows";

// The canvas row a menu or the Move to Trash dialog acts on. `root` is part of the identity: worktrees of one
// repository share canvas ids and paths (POSTMORTEM 2026-11-01, the agent indicator and another worktree's Stop).
export interface TrashSubject { root: string; path: string; id?: string }

// What keeps Move to Trash disabled, for display only: main judges again on `canvas:trash` (canvasTrash.ts trashBusy).
// `list` is main's conversation list for `root`, null while it is loading or failed (main still re-checks). `starting`:
// a start from this window's canvas panel main has not answered, whose conversation no list names before main accepts
// it (CanvasRun.startingOn); the prototype window's own starts are left to main's refusal.
export type TrashBlock = "conversation" | "terminal";

export function trashBlock(
  target: TrashSubject,
  list: readonly ConversationSummary[] | null,
  work: readonly WorkItem[],
  starting: (root: string, canvas: Canvas) => boolean = () => false,
): TrashBlock | null {
  // An empty id names nothing (`doan ls` may list one).
  const canvas: Canvas = target.id ? { path: target.path, id: target.id } : { path: target.path };
  if (starting(target.root, canvas)) return "conversation";
  // Any conversation of the canvas running, waiting for an answer or `working` (preparing its turn, about to send its
  // queue): main's trashBusy counts the same set, so the item is never enabled only to be refused as busy.
  if (list?.some(c => c.canvas !== undefined && sameCanvas(c.canvas, canvas) && (c.working || c.phase !== "ended"))) return "conversation";
  if (work.some(item => item.root === target.root && item.path === target.path)) return "terminal";
  return null;
}

// Why Export is unavailable, for the row menu's Export… and the canvas toolbar's Export alike;
// null: it is available. `row` null: the toolbar has no open canvas (a project problem). `exporting`: that
// canvas's own export runs; another canvas's does not count. `unlisted`: the page shown is not the listed canvas.
export function canvasExportReason(row: CanvasRow | null, exporting: boolean, unlisted: boolean): string | null {
  if (unlisted) return "This page is not a listed canvas.";
  if (row === null) return "Export isn’t available while the canvas can’t be shown.";
  if (row.error) return "Can’t read this canvas.";
  return exporting ? "Exporting" : null;
}
