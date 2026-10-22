import type { FolderView } from "./cli";
import type { FolderState } from "./folderState";

// What the renderer gets over IPC. Main narrows the CLI's `canvases` here so the
// renderer never handles `unknown` and never sees fields it does not show.
export interface CanvasRow {
  path: string;
  title?: string;
  // From `doan ls` as is; the app never re-reads the canvas meta.
  width?: number;
  open: number;
  url: string;
}

export type FolderEntry = { path: string } & (
  | { kind: "loading" }
  | { kind: "list"; canvases: CanvasRow[] }
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
    const { path, title, width, comments } = canvas as Record<string, unknown>;
    if (typeof path !== "string" || path === "") continue;
    const row: CanvasRow = { path, open: openCount(comments), url: servingUrl(baseUrl, path) };
    if (typeof title === "string") row.title = title;
    if (typeof width === "number" && Number.isSafeInteger(width) && width > 0) row.width = width;
    rows.push(row);
  }
  return rows;
}

function openCount(comments: unknown): number {
  if (typeof comments !== "object" || comments === null) return 0;
  const { open } = comments as Record<string, unknown>;
  return typeof open === "number" && Number.isSafeInteger(open) && open >= 0 ? open : 0;
}

// Segment-wise encoding is the inverse of `parseServePath`, which decodes each
// segment once; a name with `#`, `?` or `%` would otherwise be cut or misread.
export function servingUrl(baseUrl: string, rel: string): string {
  return baseUrl + rel.split("/").map(encodeURIComponent).join("/");
}

export function folderEntry(path: string, view: FolderView, baseUrl: string): FolderEntry {
  switch (view.kind) {
    case "list":
      return { path, kind: "list", canvases: canvasRows(view.canvases, baseUrl) };
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
      return { refuse: state.reason ? `doan CLI 오류: ${state.reason}` : "doan CLI 오류" };
    }
  }
}
