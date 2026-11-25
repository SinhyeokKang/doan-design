import { boardRectToScreen, elementView, FIT_INSET, fitFrame, safeArea, type Rect, type Size, type View } from "./viewport";

// Only while the person rests, once per frame and work turn, and never again in a turn after the person moved the
// view.

export const FOLLOW_IDLE_MS = 5000;

export interface FollowInput {
  frame: string | undefined;
  // Counted as followed too: already on screen, on entering the canvas, or named by another work source's update, which
  // must not swing the board back and forth.
  followed: ReadonlySet<string>;
  // null while it has none (it may appear with the next reload).
  rect: Rect | null;
  viewport: Size;
  view: View;
  lastPersonMove: number;
  now: number;
  stopped: boolean;
  busy: boolean;
}

// Not followed while missing, busy or before the rest, so a later layout can still follow it. `retryAt`: the caller
// judges again then rather than waiting for the next update or layout.
export type FollowDecision = { kind: "move"; view: View } | { kind: "stay"; followed: boolean; retryAt?: number };

export function followDecision(input: FollowInput): FollowDecision {
  const { frame, rect, viewport, view } = input;
  // A zero-size rect is a layout taken before the document was measured, not a place to judge from.
  if (frame === undefined || rect === null || rect.width <= 0 || rect.height <= 0 || input.followed.has(frame) || input.stopped) return { kind: "stay", followed: false };
  if (input.busy) return { kind: "stay", followed: false };
  if (input.now - input.lastPersonMove < FOLLOW_IDLE_MS) return { kind: "stay", followed: false, retryAt: input.lastPersonMove + FOLLOW_IDLE_MS };
  if (frameShown(rect, viewport, view)) return { kind: "stay", followed: true };
  const safe = safeArea(viewport, FIT_INSET);
  const fits = rect.width * view.scale <= safe.width && rect.height * view.scale <= safe.height;
  // Same scale and centred when it fits; otherwise the frame drawer's jump.
  return { kind: "move", view: fits ? elementView(rect, viewport, FIT_INSET, view) : fitFrame(rect, viewport, FIT_INSET, view) };
}

// Along an axis where the frame is larger than the area, it is seen when its top edge is in it (vertically) or it
// spans the area (horizontally).
function frameShown(rect: Rect, viewport: Size, view: View): boolean {
  const safe = safeArea(viewport, FIT_INSET), screen = boardRectToScreen(view, rect);
  const right = screen.x + screen.width, bottom = screen.y + screen.height;
  const across = screen.width <= safe.width
    ? screen.x >= safe.x && right <= safe.x + safe.width
    : screen.x <= safe.x && right >= safe.x + safe.width;
  const down = screen.height <= safe.height
    ? screen.y >= safe.y && bottom <= safe.y + safe.height
    : screen.y >= safe.y && screen.y <= safe.y + safe.height;
  return across && down;
}

// Never the time the renderer first saw it, which would differ with when the canvas was opened or subscribed.
export function followTurnKey(item: { turn: string } | { conversationId: string; turnId: string }): string {
  return "turn" in item ? `terminal:${item.turn}` : `conversation:${item.conversationId}:${item.turnId}`;
}

// Renderer memory only.
export interface FollowMemory { stopped: ReadonlySet<string>; followed: ReadonlyMap<string, ReadonlySet<string>> }
export const EMPTY_FOLLOW: FollowMemory = { stopped: new Set(), followed: new Map() };

// A turn that left `keys` has ended, so its stop and followed frames go; a person's move stops every turn on the
// canvas.
export function followStopped(memory: FollowMemory, keys: readonly string[], personMoved: boolean): FollowMemory {
  const stopped = new Set([...memory.stopped].filter(key => keys.includes(key)));
  if (personMoved) for (const key of keys) stopped.add(key);
  const followed = new Map([...memory.followed].filter(([key]) => keys.includes(key)));
  return { stopped, followed };
}

export function markFollowed(memory: FollowMemory, key: string, frame: string): FollowMemory {
  const followed = new Map(memory.followed);
  followed.set(key, new Set([...memory.followed.get(key) ?? [], frame]));
  return { stopped: memory.stopped, followed };
}

export function followedFrames(memory: FollowMemory, key: string): ReadonlySet<string> {
  return memory.followed.get(key) ?? new Set();
}
