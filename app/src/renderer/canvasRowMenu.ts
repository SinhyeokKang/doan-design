import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { CanvasRow } from "../main/view";
import type { WorkItem } from "../main/workState";
import { sameCanvas } from "./canvasConversationRows";

// `root` is part of the identity: worktrees of one repository share canvas ids and paths.
export interface TrashSubject { root: string; path: string; id?: string }

// For display only: main judges again on `canvas:trash` (canvasTrash.ts trashBusy). `starting` covers a start main has
// not answered, which no list names yet (CanvasRun.startingOn).
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
  // main's trashBusy counts the same set, so the item is never enabled only to be refused as busy.
  if (list?.some(c => c.canvas !== undefined && sameCanvas(c.canvas, canvas) && (c.working || c.phase !== "ended"))) return "conversation";
  if (work.some(item => item.root === target.root && item.path === target.path)) return "terminal";
  return null;
}

// `row` null: the toolbar has no open canvas. `exporting`: that canvas's own export; another canvas's does not count.
export function canvasExportReason(row: CanvasRow | null, exporting: boolean, unlisted: boolean): string | null {
  if (unlisted) return "This page is not a listed canvas.";
  if (row === null) return "Export isn’t available while the canvas can’t be shown.";
  if (row.error) return "Can’t read this canvas.";
  return exporting ? "Exporting" : null;
}
