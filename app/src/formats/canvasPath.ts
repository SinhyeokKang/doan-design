// A canvas's directory is its type: `.doan/ds/` holds design-system canvases, `.doan/canvases/` the rest.
// Main and renderer both judge repo-relative paths here, so they never disagree.
export type CanvasKind = "ds" | "canvases";

export const CANVAS_DIRS: Readonly<Record<CanvasKind, string>> = { ds: ".doan/ds", canvases: ".doan/canvases" };

const KINDS: readonly CanvasKind[] = ["ds", "canvases"];

// The canvas directory a path is, or is inside, whatever the file.
export function canvasDir(path: string): CanvasKind | null {
  return KINDS.find((kind) => path === CANVAS_DIRS[kind] || path.startsWith(`${CANVAS_DIRS[kind]}/`)) ?? null;
}

// The CLI's listing rule (cli/internal/repo/files.go): a file under a canvas
// directory, a lower-case `.html`, no path segment below `.doan` starting with a dot.
export function canvasKind(path: string): CanvasKind | null {
  const kind = canvasDir(path);
  if (kind === null || !path.endsWith(".html")) return null;
  const below = path.slice(CANVAS_DIRS[kind].length + 1).split("/");
  return below.some((segment) => segment === "" || segment.startsWith(".")) ? null : kind;
}
