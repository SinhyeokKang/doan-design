// A canvas named by its root, its repo-relative path and its id.
export interface CommentIdentity { root: string; path: string; canvas: string }

export type CanvasIdentityCause = "missing" | "invalid" | "duplicate";

export class CanvasIdentityError extends Error {
  constructor(readonly cause: CanvasIdentityCause) {
    super("Canvas identity is missing, changed or duplicated.");
  }
}

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function authorizeCanvas(identity: CommentIdentity, listing: unknown): { width: number | null } {
  if (!object(listing) || listing.kind !== "list" || listing.root !== identity.root || !Array.isArray(listing.canvases)) throw new Error("Project is not available.");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(identity.canvas)) throw new CanvasIdentityError("invalid");
  const canvases: unknown[] = listing.canvases;
  const matches = canvases.filter(canvas => object(canvas) && canvas.id === identity.canvas);
  if (matches.length > 1) throw new CanvasIdentityError("duplicate");
  const canvas = matches[0];
  if (!object(canvas) || canvas.path !== identity.path) throw new CanvasIdentityError("missing");
  return { width: typeof canvas.width === "number" && Number.isSafeInteger(canvas.width) && canvas.width > 0 ? canvas.width : null };
}
