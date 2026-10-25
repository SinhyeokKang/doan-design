import { timeText } from "./activity";
import type { CanvasRow, FolderEntry } from "../main/view";

// Keyed by folder path, not by URL: the folder key in the URL changes when a
// folder is closed and opened again.
export interface OpenCanvas {
  folder: string;
  canvas: string;
}

// `idChanged`: the same path now holds another canvas id, which is another
// canvas. `moved`: the open path left the list and exactly one row has its id.
export type CanvasViewUpdate =
  | { kind: "reload"; canvas: CanvasRow; idChanged?: boolean }
  | { kind: "moved"; canvas: CanvasRow; from: string }
  | { kind: "resize"; canvas: CanvasRow }
  | { kind: "clear"; reason: "missing" | "closed" | "notFound" | "uninitialized" }
  | { kind: "clear"; reason: "duplicateId"; count: number }
  | { kind: "errorLine"; message: string }
  | { kind: "none" };

// An empty id is no id: `doan ls` may list one, and it names nothing.
const canvasId = (row: Pick<CanvasRow, "id">) => row.id || undefined;

// What the open canvas needs after a folder list update. Only `reload`,
// `moved`, `resize` and `clear` touch the iframe; an error keeps the last view.
// The canvas id is read from `open.row`, the row the open document came from.
export function canvasViewUpdate(prev: readonly FolderEntry[], entries: readonly FolderEntry[], open: OpenCanvas & { row: Pick<CanvasRow, "id"> }): CanvasViewUpdate {
  const entry = entries.find((candidate) => candidate.path === open.folder);
  if (entry === undefined) return { kind: "clear", reason: "closed" };
  switch (entry.kind) {
    case "notFound":
      return { kind: "clear", reason: "notFound" };
    case "uninitialized":
      return { kind: "clear", reason: "uninitialized" };
    case "error":
      return { kind: "errorLine", message: entry.message };
    case "cliError":
      return { kind: "errorLine", message: cliErrorText(entry.reason) };
    case "loading":
      return { kind: "none" };
    case "list": {
      const id = canvasId(open.row);
      const canvas = entry.canvases.find((row) => row.path === open.canvas);
      if (canvas === undefined) {
        const same = id === undefined ? [] : entry.canvases.filter((row) => canvasId(row) === id);
        if (same.length === 1 && same[0]) return { kind: "moved", canvas: same[0], from: open.canvas };
        return same.length > 1 ? { kind: "clear", reason: "duplicateId", count: same.length } : { kind: "clear", reason: "missing" };
      }
      if (canvasId(canvas) !== id) return { kind: "reload", canvas, idChanged: true };
      const before = prev.find((candidate) => candidate.path === open.folder);
      // A failed folder is not served and its revision is not shown, so
      // anything may have changed since the last list.
      if (before?.kind !== "list" || before.servedRev !== entry.servedRev) return { kind: "reload", canvas };
      const old = before.canvases.find((row) => row.path === open.canvas);
      if (old?.rev !== canvas.rev) return { kind: "reload", canvas };
      if (old?.width !== canvas.width) return { kind: "resize", canvas };
      return { kind: "none" };
    }
  }
}

export function cliErrorText(reason: string): string {
  return reason ? `doan CLI error: ${reason}` : "doan CLI error";
}

export const INITIAL_HEIGHT = 150;
export const MAX_HEIGHT = 200_000;

// Origin, path and query; the fragment is left out because a hash link stays
// in the same document. Segments are decoded and encoded again because
// CanvasRow.url encodes every reserved character while a link the browser
// resolves keeps some as typed.
function documentKey(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.origin === "null") return null;
    const path = url.pathname.split("/").map((segment) => encodeURIComponent(decodeURIComponent(segment)));
    return `${url.origin}${path.join("/")}${url.search}`;
  } catch {
    return null;
  }
}

export function sameDocument(a: string, b: string): boolean {
  const key = documentKey(a);
  return key !== null && key === documentKey(b);
}

// `href` comes from the canvas and may be forged; it only picks which listed
// canvas is marked as open, never what the iframe loads.
export function canvasAtHref(canvases: readonly CanvasRow[], href: string): CanvasRow | undefined {
  return canvases.find((row) => sameDocument(row.url, href));
}

// A document reached by a link inherits the iframe height, and a 100vh canvas
// cannot measure below it, so a new document starts again from the initial
// height. When the iframe is already at the initial height no resize follows,
// so that layout is already the measurement.
// A layout measured at a viewport other than the iframe's current height was
// posted before our last resize reached the canvas (seen after a link: the
// new document posts again at the inherited height after the reset), and
// adopting it would undo the resize. The canvas posts again once it sees the
// resize. 1px: the height set here is capped, the viewport is an integer.
export function layoutHeight(lastHref: string | null, current: number, layout: { href: string; height: number; viewport: number }): number {
  if (lastHref !== null && !sameDocument(lastHref, layout.href) && current !== INITIAL_HEIGHT) return INITIAL_HEIGHT;
  if (Math.abs(layout.viewport - current) > 1) return current;
  return Math.min(layout.height, MAX_HEIGHT);
}

export function frameLabel(frame: { id: string; title?: string }): { id: string; title?: string } {
  return { id: frame.id || "(no id)", ...(frame.title ? { title: frame.title } : {}) };
}

export function updatedText(at: Date): string {
  return `Updated ${timeText(at)}`;
}
