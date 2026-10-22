import type { CanvasRow, FolderEntry } from "../main/view";

// Keyed by folder path, not by URL: the folder key in the URL changes when a
// folder is closed and opened again.
export interface OpenCanvas {
  folder: string;
  canvas: string;
}

export type CanvasViewUpdate =
  | { kind: "reload"; canvas: CanvasRow }
  | { kind: "resize"; canvas: CanvasRow }
  | { kind: "clear"; reason: "missing" | "closed" | "notFound" }
  | { kind: "errorLine"; message: string }
  | { kind: "none" };

// What the open canvas needs after a folder list update. Only `reload`,
// `resize` and `clear` touch the iframe; an error keeps the last view.
export function canvasViewUpdate(prev: readonly FolderEntry[], entries: readonly FolderEntry[], open: OpenCanvas): CanvasViewUpdate {
  const entry = entries.find((candidate) => candidate.path === open.folder);
  if (entry === undefined) return { kind: "clear", reason: "closed" };
  switch (entry.kind) {
    case "notFound":
      return { kind: "clear", reason: "notFound" };
    case "uninitialized":
      return { kind: "clear", reason: "missing" };
    case "error":
      return { kind: "errorLine", message: entry.message };
    case "cliError":
      return { kind: "errorLine", message: entry.reason ? `doan CLI 오류: ${entry.reason}` : "doan CLI 오류" };
    case "loading":
      return { kind: "none" };
    case "list": {
      const canvas = entry.canvases.find((row) => row.path === open.canvas);
      if (canvas === undefined) return { kind: "clear", reason: "missing" };
      const before = prev.find((candidate) => candidate.path === open.folder);
      // A failed folder is not served and its revision is not shown, so
      // anything may have changed since the last list.
      if (before?.kind !== "list" || before.servedRev !== entry.servedRev) return { kind: "reload", canvas };
      const old = before.canvases.find((row) => row.path === open.canvas);
      if (old?.width !== canvas.width) return { kind: "resize", canvas };
      return { kind: "none" };
    }
  }
}
