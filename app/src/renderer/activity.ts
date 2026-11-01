import type { CanvasRow } from "../main/view";

export interface ActivityEvent {
  folder: string;
  // The path when the event happened; `id` names the canvas when it has one.
  canvas: string;
  id?: string;
  at: Date;
  kind: "opened" | "changed" | "reloaded" | "moved";
  // The path a `moved` canvas left.
  from?: string;
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

const KIND_TEXT = { opened: "Opened", changed: "Changed", reloaded: "Reloaded", moved: "Moved" } as const;

export function activityText(event: ActivityEvent): string {
  return KIND_TEXT[event.kind];
}

// Changed needs evidence: without both row revisions a reload is only Reloaded.
export function activityKind(prevRev: number | undefined, nextRev: number | undefined): "changed" | "reloaded" {
  return prevRev !== undefined && nextRev !== undefined && prevRev !== nextRev ? "changed" : "reloaded";
}
