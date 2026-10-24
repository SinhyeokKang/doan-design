// Static frames from `doan ls` have no cap of their own, while the rendered
// list is capped by the injected script. These are the same limits, so a frame
// id read here still equals the id the rendered canvas reports.
export const MAX_STATIC_FRAMES = 1000;
// UTF-16 code units, as `String.length` counts them (canvasMessage MAX_STRING).
export const MAX_STATIC_STRING = 200;

export interface StaticFrame {
  id: string;
  title?: string;
}

function clip(text: string): string {
  if (text.length <= MAX_STATIC_STRING) return text;
  let end = MAX_STATIC_STRING;
  // Do not leave half of a surrogate pair at the cut.
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

export function capFrames(frames: readonly StaticFrame[]): { frames: StaticFrame[]; truncated: boolean } {
  const kept = frames.slice(0, MAX_STATIC_FRAMES).map((frame): StaticFrame => ({
    id: clip(frame.id),
    ...(frame.title === undefined ? {} : { title: clip(frame.title) }),
  }));
  return { frames: kept, truncated: frames.length > MAX_STATIC_FRAMES };
}
