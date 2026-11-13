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
// two rows share, an unregistered root and a root whose list failed: none is replaced by a guess.
// `source` changes whenever the served document may have changed; `frames` are `doan ls`'s static frames; `label` is
// the canvas's name as the sidebar shows it.
export type Resolution =
  | { kind: "unknown" }
  | { kind: "absent" }
  | { kind: "present"; url: string; source: string; error: boolean; frames: { id: string; title?: string }[]; label: string };

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

function findRow(key: CanvasKey, rows: readonly CanvasRow[]): CanvasRow | null {
  if ("id" in key) {
    const matches = rows.filter(row => row.id === key.id);
    return matches.length === 1 ? matches[0]! : null;
  }
  return rows.find(row => row.path === key.path && row.id === undefined) ?? null;
}

export function resolveTarget(ref: CanvasRef, entries: readonly FolderEntry[]): Resolution {
  const entry = entries.find(candidate => candidate.path === ref.root);
  if (entry === undefined) return { kind: "absent" };
  if (entry.kind === "loading") return { kind: "unknown" };
  if (entry.kind !== "list") return { kind: "absent" };
  const row = findRow(ref.canvas, entry.canvases);
  if (row === null) return { kind: "absent" };
  // The board reloads on the same signals: the row's own rev and the folder's served rev (a stylesheet or asset).
  const source = JSON.stringify([row.url, entry.servedRev, row.rev ?? 0]);
  return { kind: "present", url: row.url, source, error: row.error !== undefined, frames: (row.frames ?? []).map(frame => ({ ...frame })), label: canvasLabel(row) };
}
