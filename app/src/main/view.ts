import { canvasKind } from "../formats/canvasPath";
import type { FolderView } from "./cli";
import type { FolderState } from "./folderState";
import { capFrames, type StaticFrame } from "./frameCap";
import { latestChange } from "./latestChange";
import type { StorageFacts } from "./storage";

// What the renderer gets over IPC. Main narrows the CLI's `canvases` here so the
// renderer never handles `unknown` and never sees fields it does not show.
export interface CanvasRow {
  path: string;
  id?: string;
  // From `doan ls` as is; the app never re-reads the canvas meta.
  width?: number;
  // File mtime from main's stat; absent when the file vanished after `doan ls`.
  mtimeMs?: number;
  // Static frames from `doan ls` in document order, capped by `capFrames`.
  frames?: { id: string; title?: string }[];
  framesTruncated?: boolean;
  // Bumped by the shell when this file changed without a served bump, so the
  // open canvas and its thumbnail reload for their own file only.
  rev?: number;
  // Set by the read state (`readState.ts`) when the canvas appeared or its HTML changed since it was last shown on the
  // canvas page.
  unseen?: "new" | "changed";
  // An unseen canvas the canvas page showed whose read state could not be saved: `save` for a write that failed (the
  // dot says so instead of "changed"), `id` for a canvas with a missing or duplicated ID (nothing can be saved).
  saveFailed?: "save" | "id";
  // `doan ls` could not read the canvas file.
  error?: RowError;
  url: string;
}

// What the read-state toast tells, with Retry: a canvas whose state could not be saved (`save`) or with a missing or
// duplicated ID (`id`); or canvas-seen.json itself, once: `records` (moved aside) or `unsupported` (a later Doan's).
export type ReadStateProblem =
  | { kind: "save"; path: string }
  | { kind: "id"; path: string }
  | { kind: "records" }
  | { kind: "unsupported" };

// The message holds a repo-relative path and the cause, never an absolute path.
export interface RowError { code: string; message: string }

// `git` is the CLI's optional `result.git`, passed through unchanged.
export interface GitInfo {
  common: string;
  main?: string;
  branch?: string;
  detached?: string;
  worktrees: string[];
}

// `lastCommon`: the last `git.common` seen, kept while the row is not a list. `autoRegistered`: a worktree the app
// registered for a terminal agent (ARCHITECTURE §7 `auto-folders.json`); the renderer hides it while not a list.
export type FolderEntry = { path: string; lastCommon?: string; autoRegistered?: true } & (
  | { kind: "loading" }
  // `servedRev` is bumped whenever a served file changed; the renderer reloads an open canvas on a new value. `changedAt`
  // is the newest canvas mtime; `storage`/`storageReason` are absent from an older doan.
  | ({ kind: "list"; canvases: CanvasRow[]; servedRev: number; git?: GitInfo; changedAt?: number } & StorageFacts)
  // `notGit`: no Git repository holds the folder, so the Set Up form shows the .git/ Keep out of Git creates; never
  // for the home folder or above it (shell.ts).
  | { kind: "uninitialized"; notGit?: true }
  // `config`: the file the CLI named (folderState); main's Show in Finder selects it, the renderer does not use it.
  | { kind: "error"; message: string; config: string; newer?: true }
  | { kind: "cliError"; reason: string }
  | { kind: "notFound" }
);

// The order is the CLI's (path byte order); re-sorting here would drift from `doan ls`'s ids.
export function canvasRows(canvases: readonly unknown[], baseUrl: string): CanvasRow[] {
  const rows: CanvasRow[] = [];
  for (const canvas of canvases) {
    if (typeof canvas !== "object" || canvas === null) continue;
    const path: unknown = Reflect.get(canvas, "path");
    const id: unknown = Reflect.get(canvas, "id");
    const width: unknown = Reflect.get(canvas, "width");
    if (typeof path !== "string" || canvasKind(path) === null) continue;
    // `doan ls` also lists a folder it could not read (`unreadable_folder`); the app shows only canvases. Its path can
    // still read as a canvas's (a folder named `x.html`), so the code decides.
    const error: unknown = Reflect.get(canvas, "error");
    if (isRowError(error) && error.code === "unreadable_folder") continue;
    const row: CanvasRow = { path, url: servingUrl(baseUrl, path) };
    if (typeof id === "string") row.id = id;
    if (typeof width === "number" && Number.isSafeInteger(width) && width > 0) row.width = width;
    if (isRowError(error)) row.error = { code: error.code, message: error.message };
    const frames = staticFrames(Reflect.get(canvas, "frames"));
    if (frames !== undefined) {
      const capped = capFrames(frames);
      row.frames = capped.frames;
      if (capped.truncated) row.framesTruncated = true;
    }
    rows.push(row);
  }
  return rows;
}

// An entry without a string id is dropped rather than failing the canvas; the
// CLI always writes one (possibly empty), so this only guards a foreign shape.
function staticFrames(frames: unknown): StaticFrame[] | undefined {
  if (!Array.isArray(frames)) return undefined;
  const kept: StaticFrame[] = [];
  for (const frame of frames) {
    if (typeof frame !== "object" || frame === null) continue;
    const id: unknown = Reflect.get(frame, "id");
    const title: unknown = Reflect.get(frame, "title");
    if (typeof id !== "string") continue;
    kept.push(typeof title === "string" ? { id, title } : { id });
  }
  return kept;
}

function isRowError(value: unknown): value is RowError {
  return typeof value === "object" && value !== null &&
    typeof Reflect.get(value, "code") === "string" && typeof Reflect.get(value, "message") === "string";
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
      return { path, kind: "list", canvases, servedRev, ...(view.git ? { git: view.git } : {}), ...(changedAt === undefined ? {} : { changedAt }),
        ...(view.storage ? { storage: view.storage } : {}), ...(view.storageReason ? { storageReason: view.storageReason } : {}) };
    }
    case "error":
      return { path, kind: "error", message: view.message, config: view.config, ...(view.newer ? { newer: true as const } : {}) };
    case "cliError":
      return { path, kind: "cliError", reason: view.reason };
    case "uninitialized":
      return { path, kind: "uninitialized", ...(view.notGit ? { notGit: true as const } : {}) };
    default:
      return { path, kind: view.kind };
  }
}

// For a Config error, the config file the CLI named (macOS hides it inside `.doan/`, and it may be a parent's) while
// anything is at that path; otherwise the root (PRODUCT §5 item 3 'Problem states'). The app never reads it.
export function revealTarget(entry: FolderEntry, exists: (path: string) => boolean): string {
  return entry.kind === "error" && exists(entry.config) ? entry.config : entry.path;
}

export type OpenDecision = { store: string } | { refuse: string };

// A picked subfolder is stored as the repo root the CLI found. A failing run has no root, so `asRepo` (`doan ls
// --repo <picked>`) stores the pick only when Go reads it as a root; root detection stays in Go. null: no second run.
export function openDecision(state: FolderState, realPicked: string, asRepo: FolderState | null): OpenDecision {
  switch (state.kind) {
    case "list":
      return { store: state.root };
    case "uninitialized":
      return { store: realPicked };
    case "error":
    case "cliError": {
      if (asRepo?.kind === "list" || asRepo?.kind === "error" || (asRepo?.kind === "cliError" && asRepo.code !== undefined)) return { store: realPicked };
      if (state.kind === "error") return { refuse: state.message };
      return { refuse: state.reason ? `doan command error: ${state.reason}` : "doan command error" };
    }
  }
}
