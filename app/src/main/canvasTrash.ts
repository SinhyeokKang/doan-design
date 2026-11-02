import { lstat, readdir, realpath } from "node:fs/promises";
import { join, posix, relative, isAbsolute } from "node:path";
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
// `comments: true` only when a comment file will go with the canvas; the dialog then names it.
export type TrashPlanReply = { kind: "ready"; comments: boolean } | TrashRefused;
// `none`: no comment file to move. `kept`: the comment file stays, because the canvas id may not be the only owner (a
// shared id, an unreadable row) or the file or its directory is not a plain one. `failed`: the canvas is in the Trash but
// its comment file could not be moved; `file` is where it stays, repo-relative.
export type TrashReply =
  | { kind: "trashed"; comments: "trashed" | "none" | "kept" }
  | { kind: "trashed"; comments: "failed"; file: string }
  | TrashRefused;

const refused = (reason: TrashRefusal): TrashRefused => ({ kind: "refused", reason });
export const TRASH_REFUSED: TrashRefused = refused("notListed");

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

export type CommentsFile = { kind: "none" } | { kind: "kept" } | { kind: "found"; path: string } | { kind: "failed" };

// The comment file of `id`, never built from the id: on case-insensitive macOS `FOO.jsonl` would open for `foo`
// (ARCHITECTURE §13 'Listing'). The directory entry must equal `<id>.jsonl` byte for byte, and neither it nor
// `.doan/comments` may be a link; `.doan` itself was checked with the canvas.
export async function findComments(root: string, id: string): Promise<CommentsFile> {
  const dir = join(root, ".doan", "comments");
  try {
    const info = await lstat(dir);
    if (!info.isDirectory()) return { kind: "kept" };
    const want = Buffer.from(`${id}.jsonl`);
    const name = (await readdir(dir, { encoding: "buffer" })).find(entry => entry.equals(want));
    if (name === undefined) return { kind: "none" };
    const path = join(dir, name.toString());
    return (await lstat(path)).isFile() ? { kind: "found", path } : { kind: "kept" };
  } catch (error) {
    return code(error) === "ENOENT" ? { kind: "none" } : { kind: "failed" };
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
      if ("kind" in target) return target;
      const comments = target.commentsId === undefined ? null : await findComments(target.root, target.commentsId);
      return { kind: "ready", comments: comments?.kind === "found" };
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
        // The canvas first: when it cannot move, its comments stay untouched.
        try {
          await deps.trashItem(join(target.root, target.path));
        } catch {
          return refused("failed");
        }
        // Comment files are keyed by canvas id: a canvas without one has none.
        if (target.commentsId === undefined) return { kind: "trashed", comments: target.id === undefined ? "none" : "kept" };
        const comments = await findComments(target.root, target.commentsId);
        if (comments.kind === "none" || comments.kind === "kept") return { kind: "trashed", comments: comments.kind };
        const file = `.doan/comments/${target.commentsId}.jsonl`;
        if (comments.kind === "failed") return { kind: "trashed", comments: "failed", file };
        try {
          await deps.trashItem(comments.path);
          return { kind: "trashed", comments: "trashed" };
        } catch {
          // The canvas is already in the Trash; `doan check` reports the file as orphan_comment_file.
          return { kind: "trashed", comments: "failed", file };
        }
      } finally {
        moving.delete(key);
      }
    },
  };
}
