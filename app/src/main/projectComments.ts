import { toReview, type ReviewMarker } from "../comments/review";
import type { Author, Comment } from "../formats/types";
import type { FolderView } from "./cli";
import { readList } from "./comments/service";
import type { OrphanFile } from "./view";

// `comments:project`: Home and Overview counts and the Feedback panel's
// comments for one project. The canvas ids and the orphan files come from one
// fresh `doan ls`, and only their comment files are read; the app never
// enumerates `.doan/comments/` itself (ARCHITECTURE §13).

export interface ProjectCommentsRequest { root: string; revision: number }
// Main always sets `comments` and `orphanComments`; they are optional only so
// count-only callers and their fixtures keep their shape.
export type ProjectCanvasComments = { id: string; open: number; resolved: number; toReview: number; comments?: Comment[] } | { id: string; error: string };
export type ProjectOrphanComments = { id: string; comments: Comment[] } | { id: string; error: string };
// `revision` is the renderer's own, echoed so it can drop a reply that an
// invalidation has already overtaken. `project` is main's folder epoch the
// whole read ran under, the value an orphan write must carry: a project with
// no canvas has no other read that gives it. `orphans` is that same ls's list,
// absent when ls gave none; `orphanComments` holds the files main read from it.
// Main always sets `project`; it is optional for the same fixture reason.
export type ProjectComments = { root: string; revision: number } & (
  | { kind: "list"; project?: number; canvases: ProjectCanvasComments[]; orphans?: OrphanFile[]; orphanComments?: ProjectOrphanComments[] }
  | { kind: "unavailable" }
);

const CANVAS_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface ProjectCommentsDependencies {
  list(root: string): Promise<FolderView>;
  read(root: string, canvas: string): Promise<Buffer>;
  author(root: string): Promise<Author>;
  marker(root: string, canvas: string): ReviewMarker;
  epoch(root: string): number | null;
}

export function parseProjectCommentsRequest(value: unknown): ProjectCommentsRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).length !== 2 || !("root" in value) || !("revision" in value)) return null;
  const { root, revision } = value;
  if (typeof root !== "string" || !root.startsWith("/") || root.includes("\0") || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) return null;
  return { root, revision };
}

export async function readProjectComments(deps: ProjectCommentsDependencies, request: ProjectCommentsRequest): Promise<ProjectComments> {
  const { root, revision } = request;
  // A close or reopen during the read leaves results that belong to neither
  // epoch, so they get no project at all; a later read gets the new epoch.
  // Epochs come from one increasing counter, so equal values mean no reopen.
  const project = deps.epoch(root);
  if (project === null) return { root, revision, kind: "unavailable" };
  const listing = await deps.list(root);
  if (listing.kind !== "list" || listing.root !== root) return { root, revision, kind: "unavailable" };
  // Rows in ls order; a row without an id has no comment file.
  const rows = new Map<string, number>();
  for (const canvas of listing.canvases) {
    if (typeof canvas !== "object" || canvas === null) continue;
    const path: unknown = Reflect.get(canvas, "path");
    const id: unknown = Reflect.get(canvas, "id");
    if (typeof path === "string" && path !== "" && typeof id === "string" && id !== "") rows.set(id, (rows.get(id) ?? 0) + 1);
  }
  // Without a Git name no resolve is the human's own.
  const self = await deps.author(root).then(author => author.name, () => null);
  const canvases = await Promise.all([...rows].map(async ([id, count]): Promise<ProjectCanvasComments> => {
    // The comments panel refuses a duplicated id too, so a Review could never clear its count.
    if (count > 1) return { id, error: "This canvas ID is used by more than one canvas." };
    try {
      const { comments } = readList(await deps.read(root, id));
      return {
        id,
        open: comments.filter(comment => comment.status === "open").length,
        resolved: comments.filter(comment => comment.status === "resolved").length,
        toReview: toReview(comments, deps.marker(root, id), self).length,
        comments,
      };
    } catch (error) {
      return { id, error: readError(error) };
    }
  }));
  // A name that is not a canvas id has no app path (only ls counts show), and
  // an orphan ls could not read keeps ls's error; neither is read here.
  const readable = (listing.orphans ?? []).filter(orphan => CANVAS_ID.test(orphan.id) && orphan.error === undefined);
  const orphanComments = await Promise.all(readable.map(async ({ id }): Promise<ProjectOrphanComments> => {
    try { return { id, comments: readList(await deps.read(root, id)).comments }; } catch (error) { return { id, error: readError(error) }; }
  }));
  if (deps.epoch(root) !== project) return { root, revision, kind: "unavailable" };
  return { root, revision, kind: "list", project, canvases, ...(listing.orphans ? { orphans: listing.orphans } : {}), orphanComments };
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : "The comments could not be read.";
}
