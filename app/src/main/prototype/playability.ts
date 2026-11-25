import { parsePrototypeMark } from "./mark";

// Pure, so the canvas toolbar, the size bubble and the frame drawer can share one judgement.

export const PLAY_REASONS = {
  unavailable: "Play isn’t available while the canvas can’t be shown.",
  picking: "Finish picking from the canvas first.",
  capturing: "Finish the capture first.",
  none: "No frames in this canvas are marked for prototyping.",
} as const;

// A frame of the board's live `layout` message with the raw mark it carries.
export interface LayoutFrameMark {
  id: string;
  prototype?: string;
}

// `cut` and `parent` as the board's layout reports them (CanvasFrameRect).
export interface PlayFrame extends LayoutFrameMark {
  cut?: true;
  parent?: number;
}

// The selection's nearest frame: the frame itself for a frame selection, the frame around an element otherwise. `index`
// is its place in the layout's frames (SelectTarget.frameIndex), absent past the 1,000 listed.
export type PlaySelection = { kind: "none" } | { kind: "frame" | "element"; id: string; index?: number };

export interface PlayInput {
  // The board shows the open canvas and has laid it out; before that its frames are unknown, not absent.
  shown: boolean;
  picking: boolean;
  capturing: boolean;
  selection: PlaySelection;
  frames: readonly PlayFrame[];
}

// `frame` and `broken` are indexes into the input's frames. `broken` is a selected frame whose mark cannot play.
export type Playability = { kind: "play"; frame: number } | { kind: "drawer"; broken?: number } | { kind: "disabled"; reason: string };

// Per frame, whether the prototype window can play it as far as the board can tell. The window refuses a shared id, so
// the board must not offer it; a cut id neither plays nor shares another frame's genuine 200-unit id.
export function playableFrames(frames: readonly PlayFrame[]): boolean[] {
  const counts = new Map<string, number>();
  for (const frame of frames) if (frame.cut === undefined) counts.set(frame.id, (counts.get(frame.id) ?? 0) + 1);
  return frames.map(frame => frame.cut === undefined && frame.id !== "" && counts.get(frame.id) === 1 && parsePrototypeMark(frame.prototype) !== null);
}

export function playability(input: PlayInput): Playability {
  if (!input.shown) return { kind: "disabled", reason: PLAY_REASONS.unavailable };
  if (input.picking) return { kind: "disabled", reason: PLAY_REASONS.picking };
  if (input.capturing) return { kind: "disabled", reason: PLAY_REASONS.capturing };
  const playable = playableFrames(input.frames);
  if (!playable.includes(true)) return { kind: "disabled", reason: PLAY_REASONS.none };
  const { selection } = input;
  if (selection.kind === "none" || selection.index === undefined) return { kind: "drawer" };
  const own = input.frames[selection.index];
  // An index from before the layout changed may name another frame now.
  if (own === undefined || own.id !== selection.id) return { kind: "drawer" };
  // Only an unmarked frame plays the frame around it; a marked one that cannot play (its mark is invalid, its id shared
  // or over 200 units) is named in the drawer's tooltip. A frame without an id has no name to give.
  if (selection.kind === "frame" && !playable[selection.index] && own.prototype !== undefined && own.id !== "") return { kind: "drawer", broken: selection.index };
  // A parent always comes earlier; one that does not is malformed and ends the walk instead of looping.
  let index: number | undefined = selection.index;
  let below = Infinity;
  while (index !== undefined && index < below) {
    if (playable[index]) return { kind: "play", frame: index };
    below = index;
    index = input.frames[index]?.parent;
  }
  return { kind: "drawer" };
}
