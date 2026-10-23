import type { CommentIdentity } from "./service";

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function authorizeCanvas(identity: CommentIdentity, listing: unknown): { width: number | null } {
  if (!object(listing) || listing.kind !== "list" || listing.root !== identity.root || !Array.isArray(listing.canvases)) throw new Error("Project is not available.");
  const canvases: unknown[] = listing.canvases;
  const matches = canvases.filter(canvas => object(canvas) && canvas.id === identity.canvas);
  const canvas = matches[0];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(identity.canvas) || matches.length !== 1 || !object(canvas) || canvas.path !== identity.path) throw new Error("Canvas identity is missing, changed or duplicated.");
  return { width: typeof canvas.width === "number" && Number.isSafeInteger(canvas.width) && canvas.width > 0 ? canvas.width : null };
}
