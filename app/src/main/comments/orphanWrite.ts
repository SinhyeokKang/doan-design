import type { FolderView } from "../cli";

const CANVAS_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ORPHAN_EVENTS = new Set(["resolve", "reopen", "delete"]);

// project-feedback design §4: the app may resolve, reopen or delete a comment
// whose file no canvas uses, judged on a fresh `doan ls`. Canvas rows are not
// looked at: ls leaves invalid and duplicate ids off them, so only Go's
// `orphans` knows a file is unmatched. An uncertain or unreadable orphan may
// still belong to a canvas ls could not read, so it stays read-only.
export function orphanWriteAllowed(listing: FolderView, request: { root: string; canvas: string; intent: unknown }): boolean {
  if (listing.kind !== "list" || listing.root !== request.root || !CANVAS_ID.test(request.canvas)) return false;
  const type: unknown = typeof request.intent === "object" && request.intent !== null ? Reflect.get(request.intent, "type") : undefined;
  if (typeof type !== "string" || !ORPHAN_EVENTS.has(type)) return false;
  const orphan = listing.orphans?.find((entry) => entry.id === request.canvas);
  return orphan !== undefined && !orphan.uncertain && orphan.error === undefined;
}
