import type { FolderView } from "./cli";
import type { FolderState } from "./folderState";
import { latestChange } from "./latestChange";

// What the renderer gets over IPC. Main narrows the CLI's `canvases` here so the
// renderer never handles `unknown` and never sees fields it does not show.
export interface CanvasRow {
  path: string;
  id?: string;
  title?: string;
  // From `doan ls` as is; the app never re-reads the canvas meta.
  width?: number;
  // File mtime from main's stat; absent when the file vanished after `doan ls`.
  mtimeMs?: number;
  open: number;
  resolved: number;
  url: string;
}

// `git` is the CLI's optional `result.git`, passed through unchanged.
export interface GitInfo {
  common: string;
  main?: string;
  branch?: string;
  detached?: string;
  worktrees: string[];
}

// `lastCommon` is the last `git.common` main saw for the path, kept while the
// row is not a list so it stays on its card until the app quits.
export type FolderEntry = { path: string; lastCommon?: string } & (
  | { kind: "loading" }
  // Bumped by the shell whenever a served file of the folder changed; the
  // renderer reloads an open canvas on a new value. Only a list is served.
  // `changedAt` is the newest canvas mtime; absent with no canvases.
  | { kind: "list"; canvases: CanvasRow[]; servedRev: number; git?: GitInfo; changedAt?: number }
  | { kind: "uninitialized" }
  | { kind: "error"; message: string }
  | { kind: "cliError"; reason: string }
  | { kind: "notFound" }
);

// The order is the CLI's (path byte order); re-sorting here would drift from
// `doan ls` (POSTMORTEM "Sorting file names does not sort the ids").
export function canvasRows(canvases: readonly unknown[], baseUrl: string): CanvasRow[] {
  const rows: CanvasRow[] = [];
  for (const canvas of canvases) {
    if (typeof canvas !== "object" || canvas === null) continue;
    const path: unknown = Reflect.get(canvas, "path");
    const id: unknown = Reflect.get(canvas, "id");
    const title: unknown = Reflect.get(canvas, "title");
    const width: unknown = Reflect.get(canvas, "width");
    const comments: unknown = Reflect.get(canvas, "comments");
    if (typeof path !== "string" || path === "") continue;
    const row: CanvasRow = { path, open: commentCount(comments, "open"), resolved: commentCount(comments, "resolved"), url: servingUrl(baseUrl, path) };
    if (typeof id === "string") row.id = id;
    if (typeof title === "string") row.title = title;
    if (typeof width === "number" && Number.isSafeInteger(width) && width > 0) row.width = width;
    rows.push(row);
  }
  return rows;
}

function commentCount(comments: unknown, key: "open" | "resolved"): number {
  if (typeof comments !== "object" || comments === null) return 0;
  const count: unknown = Reflect.get(comments, key);
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

// Segment-wise encoding is the inverse of `parseServePath`, which decodes each
// segment once; a name with `#`, `?` or `%` would otherwise be cut or misread.
export function servingUrl(baseUrl: string, rel: string): string {
  return baseUrl + rel.split("/").map(encodeURIComponent).join("/");
}

// `mtimes` is keyed by canvas path; a canvas without one has no `mtimeMs`.
export function folderEntry(path: string, view: FolderView, baseUrl: string, servedRev: number, mtimes?: ReadonlyMap<string, number>): FolderEntry {
  switch (view.kind) {
    case "list": {
      const canvases = canvasRows(view.canvases, baseUrl);
      for (const row of canvases) {
        const mtime = mtimes?.get(row.path);
        if (mtime !== undefined) row.mtimeMs = mtime;
      }
      const changedAt = latestChange(canvases.map((row) => row.mtimeMs));
      return { path, kind: "list", canvases, servedRev, ...(view.git ? { git: view.git } : {}), ...(changedAt === undefined ? {} : { changedAt }) };
    }
    case "error":
      return { path, kind: "error", message: view.message };
    case "cliError":
      return { path, kind: "cliError", reason: view.reason };
    default:
      return { path, kind: view.kind };
  }
}

export type OpenDecision = { store: string } | { refuse: string };

// A picked subfolder of a repo is stored as the repo root the CLI found, so the
// same repo opens once. A failing run (broken config, no CLI) has no root, so
// `asRepo` is a second run, `doan ls --repo <picked>`: the pick is stored only
// when Go reads it as a repo root (listed, or failing on its own config). A
// subfolder stored instead would later read as "not initialized" and invite a
// nested `doan init`. Root detection stays in Go (POSTMORTEM "TS and Go ...
// diverged"); `null` means no second run was made.
export function openDecision(state: FolderState, realPicked: string, asRepo: FolderState | null): OpenDecision {
  switch (state.kind) {
    case "list":
      return { store: state.root };
    case "uninitialized":
      return { store: realPicked };
    case "error":
    case "cliError": {
      if (asRepo?.kind === "list" || asRepo?.kind === "error") return { store: realPicked };
      if (state.kind === "error") return { refuse: state.message };
      return { refuse: state.reason ? `doan CLI error: ${state.reason}` : "doan CLI error" };
    }
  }
}
