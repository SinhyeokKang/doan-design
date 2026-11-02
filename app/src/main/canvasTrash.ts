import { posix } from "node:path";
import { canvasKind } from "../formats/canvasPath";
import type { ConversationSummary } from "./conversation/summary";
import { sameCanvas } from "./conversation/sessions";
import type { Canvas } from "./conversation/types";
import type { FolderEntry } from "./view";
import type { WorkItem } from "./workState";

// Move to Trash (canvas-row-menu): `canvas:trashPlan` and `canvas:trash`. The renderer's root and path are only keys
// into main's own folder list, as for thumbnails (ARCHITECTURE §7 'Main boundary'); every file touched is the listed
// row's path under the registered root.

export interface TrashRequest { root: string; path: string }
// `commentsId`: the id whose `.doan/comments/<id>.jsonl` goes with the canvas, when the list proves no other canvas
// can own that file.
export interface TrashTarget { root: string; path: string; id?: string; commentsId?: string }
export type TrashRefusal = "busy" | "notListed" | "notFile" | "failed";
export interface TrashRefused { kind: "refused"; reason: TrashRefusal }
const refused = (reason: TrashRefusal): TrashRefused => ({ kind: "refused", reason });

// ARCHITECTURE §1 convention 2.
const CANVAS_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function trashRequest(value: unknown): TrashRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const root: unknown = Reflect.get(value, "root"), path: unknown = Reflect.get(value, "path");
  return typeof root === "string" && typeof path === "string" ? { root, path } : null;
}

// Checks 1 and 2: a registered root whose list holds this exact path as a canvas. The comment file goes only when the
// row has a valid id that no other row of the list uses and no row failed to read: an unreadable row may use that id
// (the reason `doan ls` marks orphans `uncertain`, ARCHITECTURE §12).
export function trashTarget(entries: readonly FolderEntry[], request: TrashRequest): TrashTarget | TrashRefused {
  const entry = entries.find(candidate => candidate.path === request.root);
  if (entry?.kind !== "list") return refused("notListed");
  const row = entry.canvases.find(candidate => candidate.path === request.path);
  if (row === undefined || canvasKind(row.path) === null) return refused("notListed");
  const id = row.id || undefined;
  const target: TrashTarget = { root: entry.path, path: row.path, ...(id ? { id } : {}) };
  const owned = id !== undefined && CANVAS_ID.test(id)
    && !entry.canvases.some(other => other !== row && other.id === id)
    && !entry.canvases.some(other => other.error !== undefined);
  return owned ? { ...target, commentsId: id } : target;
}

// An agent-reported edit path as a path of `root`, or null outside it: the rule of `conversation/project.ts` `inside`,
// which reads the same edits for promotion. On macOS /tmp and /var are links into /private, so either spelling counts.
function insideRoot(root: string, path: string): string | null {
  const candidates = [path];
  if (root.startsWith("/private/") && path.startsWith("/") && !path.startsWith("/private/")) candidates.push(`/private${path}`);
  for (const candidate of candidates) {
    const relative = posix.relative(root, posix.resolve(root, candidate));
    if (relative && !relative.startsWith("../") && relative !== ".." && !posix.isAbsolute(relative)) return relative;
  }
  return null;
}

// Check 5, main's own grounds (the renderer's trashBlock is display only). `conversations` and `evidence` are this
// root's: the conversation list and the unjudged project turns (ConversationService.projectEvidence), which may still
// bind to a canvas they edited. Worktrees share ids and paths, so nothing of another root counts (POSTMORTEM
// 2026-11-01).
export function trashBusy(
  target: Pick<TrashTarget, "root" | "path" | "id">,
  conversations: readonly ConversationSummary[],
  evidence: readonly { edits: readonly string[]; changed: readonly string[] }[],
  work: readonly WorkItem[],
): boolean {
  const canvas: Canvas = target.id ? { path: target.path, id: target.id } : { path: target.path };
  if (conversations.some(c => c.state === "current" && c.canvas !== undefined && sameCanvas(c.canvas, canvas) && (c.working || c.phase !== "ended"))) return true;
  if (evidence.some(e => e.changed.includes(target.path) || e.edits.some(edit => insideRoot(target.root, edit) === target.path))) return true;
  return work.some(item => item.root === target.root && item.path === target.path);
}
