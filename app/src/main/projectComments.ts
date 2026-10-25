import { toReview, type ReviewMarker } from "../comments/review";
import type { Author } from "../formats/types";
import type { FolderView } from "./cli";
import { readList } from "./comments/service";

// `comments:project`: Home and Overview counts for one project. The canvas
// ids come from one fresh `doan ls`, and only their comment files are read;
// the app never enumerates `.doan/comments/` itself (ARCHITECTURE §13).

export interface ProjectCommentsRequest { root: string; revision: number }
export type ProjectCanvasComments = { id: string; open: number; resolved: number; toReview: number } | { id: string; error: string };
// `revision` is the renderer's own, echoed so it can drop a reply that an
// invalidation has already overtaken.
export type ProjectComments = { root: string; revision: number } & ({ kind: "list"; canvases: ProjectCanvasComments[] } | { kind: "unavailable" });

export interface ProjectCommentsDependencies {
  list(root: string): Promise<FolderView>;
  read(root: string, canvas: string): Promise<Buffer>;
  author(root: string): Promise<Author>;
  marker(root: string, canvas: string): ReviewMarker;
}

export function parseProjectCommentsRequest(value: unknown): ProjectCommentsRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).length !== 2 || !("root" in value) || !("revision" in value)) return null;
  const { root, revision } = value;
  if (typeof root !== "string" || !root.startsWith("/") || root.includes("\0") || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) return null;
  return { root, revision };
}

export async function readProjectComments(deps: ProjectCommentsDependencies, request: ProjectCommentsRequest): Promise<ProjectComments> {
  const { root, revision } = request;
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
      };
    } catch (error) {
      return { id, error: error instanceof Error ? error.message : "The comments could not be read." };
    }
  }));
  return { root, revision, kind: "list", canvases };
}
