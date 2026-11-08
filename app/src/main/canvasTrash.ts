import { lstat, realpath } from "node:fs/promises";
import { join, posix, relative, isAbsolute } from "node:path";
import { canvasKind } from "../formats/canvasPath";
import type { ConversationSummary } from "./conversation/summary";
import { sameCanvas } from "./conversation/sessions";
import type { Canvas } from "./conversation/types";
import type { FolderEntry } from "./view";
import type { WorkItem } from "./workState";

// Move to Trash: `canvas:trashPlan` and `canvas:trash`. The renderer's root and path are only keys
// into main's own folder list, as for thumbnails (ARCHITECTURE §7 'Main boundary'); every file touched is the listed
// row's path under the registered root.

export interface TrashRequest { root: string; path: string }
export interface TrashTarget { root: string; path: string; id?: string }
export type TrashRefusal = "busy" | "notListed" | "notFile" | "failed";
export interface TrashRefused { kind: "refused"; reason: TrashRefusal }
export type TrashPlanReply = { kind: "ready" } | TrashRefused;
export type TrashReply = { kind: "trashed" } | TrashRefused;

const refused = (reason: TrashRefusal): TrashRefused => ({ kind: "refused", reason });
export const TRASH_REFUSED: TrashRefused = refused("notListed");

export function trashRequest(value: unknown): TrashRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const root: unknown = Reflect.get(value, "root"), path: unknown = Reflect.get(value, "path");
  return typeof root === "string" && typeof path === "string" ? { root, path } : null;
}

// Checks 1 and 2: a registered root whose list holds this exact path as a canvas. Only the canvas file moves; no other
// file under `.doan/` goes with it, even one named after the canvas id.
export function trashTarget(entries: readonly FolderEntry[], request: TrashRequest): TrashTarget | TrashRefused {
  const entry = entries.find(candidate => candidate.path === request.root);
  if (entry?.kind !== "list") return refused("notListed");
  const row = entry.canvases.find(candidate => candidate.path === request.path);
  if (row === undefined || canvasKind(row.path) === null) return refused("notListed");
  const id = row.id || undefined;
  return { root: entry.path, path: row.path, ...(id ? { id } : {}) };
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
  // Running, waiting for an answer or `working` (preparing, a queue about to go out): the renderer's trashBlock reads the
  // same set, so an enabled item is not refused as busy for a conversation state alone.
  if (conversations.some(c => c.state === "current" && c.canvas !== undefined && sameCanvas(c.canvas, canvas) && (c.working || c.phase !== "ended"))) return true;
  if (evidence.some(e => e.changed.includes(target.path) || e.edits.some(edit => insideRoot(target.root, edit) === target.path))) return true;
  return work.some(item => item.root === target.root && item.path === target.path);
}

const code = (error: unknown): unknown => typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined;

// Checks 3 and 4, against the disk now: the list may be older than a link someone put in since. No segment from
// `.doan` down is a symbolic link, the canvas is a regular file, and its real path is inside the real root by path
// segment (ARCHITECTURE §13 'Paths inside the repo').
// A segment can still turn into a link between this check and `shell.trashItem`, which takes only a path (unlike the
// server's O_NOFOLLOW_ANY open, serve/server.ts openNoFollow; POSTMORTEM 2026-10-27 "Session history and append
// followed replaceable filesystem paths"). Accepted: one person-confirmed action on a row the person chose.
export async function checkCanvasFile(root: string, path: string): Promise<"ok" | TrashRefusal> {
  const segments = path.split("/");
  try {
    for (let i = 1; i <= segments.length; i++) {
      const info = await lstat(join(root, ...segments.slice(0, i)));
      if (info.isSymbolicLink()) return "notFile";
      if (i < segments.length ? !info.isDirectory() : !info.isFile()) return "notFile";
    }
    const [realRoot, realCanvas] = await Promise.all([realpath(root), realpath(join(root, path))]);
    const inside = relative(realRoot, realCanvas);
    return inside !== "" && !isAbsolute(inside) && inside.split("/")[0] !== ".." ? "ok" : "notFile";
  } catch (error) {
    return code(error) === "ENOENT" || code(error) === "ENOTDIR" ? "notListed" : "failed";
  }
}

export interface CanvasTrashDeps {
  entries(): readonly FolderEntry[];
  // Check 5 for the listed row; it may throw (an unreadable conversation index), which refuses as failed.
  busy(target: TrashTarget): boolean;
  // Electron's shell.trashItem.
  trashItem(path: string): Promise<void>;
}

export interface CanvasTrash {
  plan(value: unknown): Promise<TrashPlanReply>;
  trash(value: unknown): Promise<TrashReply>;
}

export function createCanvasTrash(deps: CanvasTrashDeps): CanvasTrash {
  // A second request for a row still being moved is refused; the dialog closes on confirm, so only a race reaches it.
  const moving = new Set<string>();

  // Checks 1 to 5 in order, every time: the plan and the move each read the list and the disk again.
  async function checked(value: unknown): Promise<TrashTarget | TrashRefused> {
    const request = trashRequest(value);
    if (request === null) return refused("notListed");
    const target = trashTarget(deps.entries(), request);
    if ("kind" in target) return target;
    const file = await checkCanvasFile(target.root, target.path);
    if (file !== "ok") return refused(file);
    try {
      if (deps.busy(target)) return refused("busy");
    } catch {
      return refused("failed");
    }
    return target;
  }

  return {
    async plan(value) {
      const target = await checked(value);
      return "kind" in target ? target : { kind: "ready" };
    },
    async trash(value) {
      const request = trashRequest(value);
      if (request === null) return refused("notListed");
      const key = `${request.root}\n${request.path}`;
      if (moving.has(key)) return refused("failed");
      moving.add(key);
      try {
        const target = await checked(request);
        if ("kind" in target) return target;
        try {
          await deps.trashItem(join(target.root, target.path));
        } catch {
          return refused("failed");
        }
        return { kind: "trashed" };
      } finally {
        moving.delete(key);
      }
    },
  };
}
