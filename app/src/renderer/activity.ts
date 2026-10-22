export interface ActivityEvent {
  folder: string;
  canvas: string;
  at: Date;
  kind: "opened" | "reloaded";
}

export function activityFor(log: readonly ActivityEvent[], folder: string, canvas: string): ActivityEvent[] {
  return log.filter((event) => event.folder === folder && event.canvas === canvas);
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
