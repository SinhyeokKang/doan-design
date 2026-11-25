import { canvasLabel, frameTitle } from "./canvasTree";
import type { CanvasRow, FolderEntry } from "../main/view";

// The folder key in the URL changes when a folder is closed and opened again.
export interface OpenCanvas {
  folder: string;
  canvas: string;
}

// `idChanged`: the same path now holds another canvas id, which is another canvas. `moved`: the open path left the
// list and exactly one row has its id. `trashed`: it left under a TrashMarks mark.
export type CanvasViewUpdate =
  | { kind: "reload"; canvas: CanvasRow; idChanged?: boolean }
  | { kind: "moved"; canvas: CanvasRow; from: string }
  | { kind: "resize"; canvas: CanvasRow }
  | { kind: "clear"; reason: "missing" | "closed" | "notFound" | "uninitialized" | "trashed" }
  | { kind: "clear"; reason: "duplicateId"; count: number }
  | { kind: "errorLine"; message: string }
  | { kind: "none" };

// An empty id is no id: `doan ls` may list one, and it names nothing.
const canvasId = (row: Pick<CanvasRow, "id">) => row.id || undefined;

export interface TrashMark { readonly folder: string; readonly path: string }

// A path that leaves the list under a mark was trashed, not moved: another canvas sharing its id must not open in its
// place. Set before `canvas:trash` is sent, since the folder watcher can drop the row before the reply.
export class TrashMarks {
  // A second request for the same row must not lift the first request's mark when its refusal arrives first.
  private marks = new Map<string, Set<TrashMark>>();
  private static key(folder: string, path: string): string { return `${folder}\n${path}`; }

  begin(folder: string, path: string): TrashMark {
    const mark = { folder, path }, key = TrashMarks.key(folder, path);
    const marks = this.marks.get(key) ?? new Set<TrashMark>();
    marks.add(mark);
    this.marks.set(key, marks);
    return mark;
  }

  // A `trashed` reply keeps the mark until the list drops the path; `refused` lifts only this request's own mark.
  settle(mark: TrashMark, reply: "trashed" | "refused"): void {
    if (reply !== "refused") return;
    const key = TrashMarks.key(mark.folder, mark.path), marks = this.marks.get(key);
    if (marks?.delete(mark) && marks.size === 0) this.marks.delete(key);
  }

  has(folder: string, path: string): boolean {
    return this.marks.has(TrashMarks.key(folder, path));
  }

  // After canvasViewUpdate has read the marks. A loading or failed folder keeps them: its list is not known.
  sweep(entries: readonly FolderEntry[]): void {
    for (const [key, marks] of this.marks) {
      const { folder, path } = marks.values().next().value!;
      const entry = entries.find(candidate => candidate.path === folder);
      if (entry === undefined || (entry.kind === "list" && !entry.canvases.some(row => row.path === path))) this.marks.delete(key);
    }
  }
}

// Only `reload`, `moved`, `resize` and `clear` touch the iframe; an error keeps the last view.
export function canvasViewUpdate(prev: readonly FolderEntry[], entries: readonly FolderEntry[], open: OpenCanvas & { row: Pick<CanvasRow, "id"> }, trash?: Pick<TrashMarks, "has">): CanvasViewUpdate {
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
        if (trash?.has(open.folder, open.canvas)) return { kind: "clear", reason: "trashed" };
        const same = id === undefined ? [] : entry.canvases.filter((row) => canvasId(row) === id);
        if (same.length === 1 && same[0]) return { kind: "moved", canvas: same[0], from: open.canvas };
        return same.length > 1 ? { kind: "clear", reason: "duplicateId", count: same.length } : { kind: "clear", reason: "missing" };
      }
      if (canvasId(canvas) !== id) return { kind: "reload", canvas, idChanged: true };
      const before = prev.find((candidate) => candidate.path === open.folder);
      // A failed folder is not served and its revision is not shown, so anything may have changed since the last list.
      if (before?.kind !== "list" || before.servedRev !== entry.servedRev) return { kind: "reload", canvas };
      const old = before.canvases.find((row) => row.path === open.canvas);
      if (old?.rev !== canvas.rev) return { kind: "reload", canvas };
      if (old?.width !== canvas.width) return { kind: "resize", canvas };
      return { kind: "none" };
    }
  }
}

// The page cannot tell which of the canvases sharing the ID to show.
export function duplicateIdText(row: CanvasRow, count: number): string {
  return `${canvasLabel(row)} moved, but ${count} canvases now use the ID ${row.id ?? ""}. Run doan check in a terminal.`;
}

export function cliErrorText(reason: string): string {
  return reason ? `doan command error: ${reason}` : "doan command error";
}

export const INITIAL_HEIGHT = 150;
export const MAX_HEIGHT = 200_000;

// A hash link stays in the same document, so the fragment is left out. Segments are re-encoded because CanvasRow.url
// encodes every reserved character while a browser-resolved link keeps some as typed.
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

// `href` comes from the canvas and may be forged; it only picks which listed canvas is marked as open.
export function canvasAtHref(canvases: readonly CanvasRow[], href: string): CanvasRow | undefined {
  return canvases.find((row) => sameDocument(row.url, href));
}

// A linked document inherits the iframe height, and a 100vh canvas cannot measure below it, so it starts from the
// initial height. A layout at another viewport predates our last resize and is ignored (1px: the height is capped).
export function layoutHeight(lastHref: string | null, current: number, layout: { href: string; height: number; viewport: number }): number {
  if (lastHref !== null && !sameDocument(lastHref, layout.href) && current !== INITIAL_HEIGHT) return INITIAL_HEIGHT;
  if (Math.abs(layout.viewport - current) > 1) return current;
  return Math.min(layout.height, MAX_HEIGHT);
}

export function frameLabel(frame: { id: string; title?: string }): { id: string; title?: string } {
  const title = frameTitle(frame.title);
  return { id: frame.id || "(no id)", ...(title === undefined ? {} : { title }) };
}
