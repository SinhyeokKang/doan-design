import { boardRectToScreen, elementView, FIT_INSET, fitFrame, safeArea, type Rect, type Size, type View } from "./viewport";

// Following the working frame (work-update design §1 rule 9): the board moves to the frame an agent starts on only while
// the person rests, once per frame and work turn, and never again in a turn after the person moved the view.

// Tunable (tasks E2): the rest before the board follows.
export const FOLLOW_IDLE_MS = 5000;

export interface FollowInput {
  frame: string | undefined;
  // Frames this work turn has followed, or counted as followed (already on screen, on entering the canvas, or named by
  // an update from another work source, which must not swing the board back and forth).
  followed: ReadonlySet<string>;
  // The frame's board rect in the current document, null while it has none (it may appear with the next reload).
  rect: Rect | null;
  viewport: Size;
  view: View;
  lastPersonMove: number;
  now: number;
  stopped: boolean;
  busy: boolean;
}

// `followed`: count the frame as followed for this turn. Not for a frame that is missing, busy or before the rest is
// over, so a later layout can still follow it. `retryAt`: the frame waits only for the rest, which ends then; the
// caller judges again at that time rather than waiting for the next update or layout.
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
  // Same scale and centred when it fits (elementView's fitting case); otherwise the frame drawer's jump.
  return { kind: "move", view: fits ? elementView(rect, viewport, FIT_INSET, view) : fitFrame(rect, viewport, FIT_INSET, view) };
}

// Wholly in the safe area; along an axis where the frame is larger than that area, a frame is seen when its top edge is
// in it (vertically) or when it spans the area (horizontally).
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

// A work turn's identity, made by main (terminal) or the conversation's turn: never the time the renderer first saw it,
// which would differ with when the canvas was opened or subscribed.
export function followTurnKey(item: { turn: string } | { conversationId: string; turnId: string }): string {
  return "turn" in item ? `terminal:${item.turn}` : `conversation:${item.conversationId}:${item.turnId}`;
}

// One canvas's follow state, by work turn key; renderer memory only.
export interface FollowMemory { stopped: ReadonlySet<string>; followed: ReadonlyMap<string, ReadonlySet<string>> }
export const EMPTY_FOLLOW: FollowMemory = { stopped: new Set(), followed: new Map() };

// `keys` are the work turns on the canvas now. A turn that left them has ended (a key change is a new turn), so its stop
// and followed frames go; a person's move stops every turn on the canvas, whichever source wins later.
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
