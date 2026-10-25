export interface ActivityEvent {
  folder: string;
  canvas: string;
  at: Date;
  kind: "opened" | "reloaded" | "moved";
  // The path a `moved` canvas left.
  from?: string;
}

export function activityFor(log: readonly ActivityEvent[], folder: string, canvas: string): ActivityEvent[] {
  return log.filter((event) => event.folder === folder && event.canvas === canvas);
}

// A moved canvas keeps its history under the new path. Events already at that
// path belong to whatever canvas sat there before, so they are dropped.
export function moveActivity(log: readonly ActivityEvent[], folder: string, from: string, to: string): ActivityEvent[] {
  return log.filter((event) => event.folder !== folder || event.canvas !== to)
    .map((event) => event.folder === folder && event.canvas === from ? { ...event, canvas: to } : event);
}

export function movedFrom(event: ActivityEvent): string {
  return event.from?.split("/").at(-1) ?? "";
}

export function pushActivity(log: readonly ActivityEvent[], event: ActivityEvent, max: number): ActivityEvent[] {
  let kept = 0;
  return [event, ...log]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .filter((item) => item.folder !== event.folder || item.canvas !== event.canvas || ++kept <= max);
}

export function timeText(at: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`;
}
