import { canvasLabel } from "../../renderer/canvasTree";
import type { CanvasRow, FolderEntry } from "../view";

// A canvas is keyed by its ID; an ID-less canvas by its path, as the device-local state keys it.
export type CanvasKey = { id: string } | { path: string };

// The root is the worktree, so the same canvas and frame IDs in two worktrees are two targets.
export interface PrototypeTarget {
  root: string;
  canvas: CanvasKey;
  frame: string;
}

export type CanvasRef = Pick<PrototypeTarget, "root" | "canvas">;

// `unknown`: the root's list is being read, so nothing can be concluded yet. `absent` covers a gone row, a canvas ID
// two rows share (`duplicate`, which the conversation panel names apart), an unregistered root and a root whose list
// failed: none is replaced by a guess.
// `source` changes whenever the served document may have changed; `frames` are `doan ls`'s static frames; `label` is
// the canvas's name as the sidebar shows it; `path` is the row's path, which the caller keeps as the last known one.
export type Resolution =
  | { kind: "unknown" }
  | { kind: "absent"; duplicate?: true }
  | { kind: "present"; url: string; source: string; error: boolean; frames: { id: string; title?: string }[]; label: string; path: string };

function sameKey(a: CanvasKey, b: CanvasKey): boolean {
  if ("id" in a) return "id" in b && a.id === b.id;
  return "path" in b && a.path === b.path;
}

export function sameCanvas(a: CanvasRef, b: CanvasRef): boolean {
  return a.root === b.root && sameKey(a.canvas, b.canvas);
}

export function sameTarget(a: PrototypeTarget, b: PrototypeTarget): boolean {
  return sameCanvas(a, b) && a.frame === b.frame;
}

export function canvasKeyString(ref: CanvasRef): string {
  return JSON.stringify("id" in ref.canvas ? [ref.root, "id", ref.canvas.id] : [ref.root, "path", ref.canvas.path]);
}

export function canvasKeyFor(row: CanvasRow, rows: readonly CanvasRow[]): CanvasKey | null {
  if (row.id === undefined) return { path: row.path };
  return rows.filter(other => other.id === row.id).length === 1 ? { id: row.id } : null;
}

// `lastPath`: where the target's row was last listed. `doan ls` lists a file it cannot read as {path, error} without
// the ID inside it, so an ID-keyed canvas whose file became unreadable is found only as the errored, ID-less row at
// that path. Nothing else is taken: a readable row there is another canvas, and a shared ID stays a conflict.
function findRow(key: CanvasKey, rows: readonly CanvasRow[], lastPath: string | undefined): CanvasRow | "duplicate" | null {
  if ("id" in key) {
    const matches = rows.filter(row => row.id === key.id);
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) return "duplicate";
    if (lastPath === undefined) return null;
    return rows.find(row => row.path === lastPath && row.id === undefined && row.error !== undefined) ?? null;
  }
  return rows.find(row => row.path === key.path && row.id === undefined) ?? null;
}

export function resolveTarget(ref: CanvasRef, entries: readonly FolderEntry[], lastPath?: string): Resolution {
  const entry = entries.find(candidate => candidate.path === ref.root);
  if (entry === undefined) return { kind: "absent" };
  if (entry.kind === "loading") return { kind: "unknown" };
  if (entry.kind !== "list") return { kind: "absent" };
  const row = findRow(ref.canvas, entry.canvases, lastPath);
  if (row === null) return { kind: "absent" };
  if (row === "duplicate") return { kind: "absent", duplicate: true };
  // The board reloads on the same signals: the row's own rev and the folder's served rev (a stylesheet or asset).
  const source = JSON.stringify([row.url, entry.servedRev, row.rev ?? 0]);
  return { kind: "present", url: row.url, source, error: row.error !== undefined, frames: (row.frames ?? []).map(frame => ({ ...frame })), label: canvasLabel(row), path: row.path };
}
