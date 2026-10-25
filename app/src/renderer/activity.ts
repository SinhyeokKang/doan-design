import { compareText } from "../comments/resolution";
import type { Comment } from "../formats/types";
import type { CanvasRow } from "../main/view";

export interface ActivityEvent {
  folder: string;
  // The path when the event happened; `id` names the canvas when it has one.
  canvas: string;
  id?: string;
  at: Date;
  kind: "opened" | "changed" | "reloaded" | "moved" | "resolved";
  // The path a `moved` canvas left.
  from?: string;
  // `resolved`: how many comments turned resolved and who resolved them.
  count?: number;
  resolvedBy?: string[];
}

// A canvas's events are keyed by (root, canvas id), so a move keeps them and
// another id at the same path starts its own. Without an id, the path is the key.
function sameCanvas(event: ActivityEvent, folder: string, canvas: string, id: string | undefined): boolean {
  return event.folder === folder && event.id === (id || undefined) && (event.id !== undefined || event.canvas === canvas);
}

export function activityKey(folder: string, row: Pick<CanvasRow, "path" | "id">): Pick<ActivityEvent, "folder" | "canvas" | "id"> {
  return { folder, canvas: row.path, ...(row.id ? { id: row.id } : {}) };
}

export function activityFor(log: readonly ActivityEvent[], folder: string, canvas: string, id?: string): ActivityEvent[] {
  return log.filter((event) => sameCanvas(event, folder, canvas, id));
}

export function movedFrom(event: ActivityEvent): string {
  return event.from?.split("/").at(-1) ?? "";
}

export function pushActivity(log: readonly ActivityEvent[], event: ActivityEvent, max: number): ActivityEvent[] {
  let kept = 0;
  return [event, ...log]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .filter((item) => !sameCanvas(item, event.folder, event.canvas, event.id) || ++kept <= max);
}

export function timeText(at: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`;
}

// Changed needs evidence: without both row revisions a reload is only Reloaded.
export function activityKind(prevRev: number | undefined, nextRev: number | undefined): "changed" | "reloaded" {
  return prevRev !== undefined && nextRev !== undefined && prevRev !== nextRev ? "changed" : "reloaded";
}

// Comments that were open in `before` and are resolved in `after`, with each
// resolver named once in resolve order. `before` is null on the first read,
// which is the baseline and records nothing.
export function resolvedActivity(before: readonly Comment[] | null, after: readonly Comment[]): { count: number; resolvedBy: string[] } | null {
  if (before === null) return null;
  const wasOpen = new Set(before.filter((comment) => comment.status === "open").map((comment) => comment.comment));
  const turned = after
    .filter((comment) => comment.status === "resolved" && wasOpen.has(comment.comment))
    .sort((a, b) => compareText(a.resolvedAt ?? "", b.resolvedAt ?? ""));
  if (turned.length === 0) return null;
  return { count: turned.length, resolvedBy: [...new Set(turned.map((comment) => comment.resolvedBy?.name ?? ""))] };
}
