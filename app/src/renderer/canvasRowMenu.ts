import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { WorkItem } from "../main/workState";
import { agentPresence } from "./agentPresence";
import { sameCanvas } from "./canvasConversationRows";

// The canvas row a menu or the Move to Trash dialog acts on. `root` is part of the identity: worktrees of one
// repository share canvas ids and paths (POSTMORTEM 2026-11-01, the agent indicator and another worktree's Stop).
export interface TrashSubject { root: string; path: string; id?: string }

// What keeps Move to Trash disabled, for display only: main judges again on `canvas:trash` (canvasTrash.ts trashBusy).
// `list` is main's conversation list for `root`, null while it is loading or failed (main still re-checks). `drawing`
// is HomeRun's `drawing`: a project conversation that drew this canvas and has not been bound to it yet.
export type TrashBlock = "conversation" | "drawing" | "terminal";

export function trashBlock(
  target: TrashSubject,
  list: readonly ConversationSummary[] | null,
  work: readonly WorkItem[],
  drawing: (root: string, canvas: Canvas) => string | null,
): TrashBlock | null {
  // An empty id names nothing (`doan ls` may list one).
  const canvas: Canvas = target.id ? { path: target.path, id: target.id } : { path: target.path };
  // The Agent indicator's state set (running or waiting for an answer), plus main's `working`: a conversation preparing
  // its turn or about to send its queue is about to write the canvas. main's trashBusy counts the same set, so the item
  // is never enabled only to be refused as busy.
  if (list !== null && (agentPresence(list, canvas, null) !== null
    || list.some(c => c.state === "current" && c.canvas !== undefined && c.working && sameCanvas(c.canvas, canvas)))) return "conversation";
  if (drawing(target.root, canvas) !== null) return "drawing";
  if (work.some(item => item.root === target.root && item.path === target.path)) return "terminal";
  return null;
}
