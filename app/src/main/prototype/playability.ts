import { parsePrototypeMark } from "./mark";

// Pure, so the canvas toolbar, the size bubble and the frame drawer can share one judgement.

export const PLAY_REASONS = {
  element: "Select the frame itself to play its prototype.",
  unmarked: "This frame is not marked for prototyping.",
  none: "Select a supported frame to play its prototype.",
  tool: "Switch to Select and choose a supported frame.",
} as const;

// A frame of the board's live `layout` message with the raw mark it carries.
export interface LayoutFrameMark {
  id: string;
  prototype?: string;
}

export type PlaySelection = { kind: "none" } | { kind: "element" } | { kind: "frame"; id: string };

export interface PlayInput {
  tool: "select" | "hand";
  picking: boolean;
  capturing: boolean;
  selection: PlaySelection;
  frames: readonly LayoutFrameMark[];
}

export type Playability = { enabled: true } | { enabled: false; reason: string };

function only(id: string, frames: readonly LayoutFrameMark[]): LayoutFrameMark | null {
  if (id === "") return null;
  let found: LayoutFrameMark | null = null;
  for (const frame of frames) {
    if (frame.id !== id) continue;
    // The prototype window refuses a duplicated id rather than pick one, so the board must not offer it either.
    if (found !== null) return null;
    found = frame;
  }
  return found;
}

// The frame drawer's `Prototype` meta.
export function markedForPrototype(id: string, frames: readonly LayoutFrameMark[]): boolean {
  const frame = only(id, frames);
  return frame !== null && parsePrototypeMark(frame.prototype) !== null;
}

export function playability(input: PlayInput): Playability {
  if (input.tool !== "select" || input.picking || input.capturing) return { enabled: false, reason: PLAY_REASONS.tool };
  const { selection } = input;
  if (selection.kind === "element") return { enabled: false, reason: PLAY_REASONS.element };
  if (selection.kind === "none") return { enabled: false, reason: PLAY_REASONS.none };
  const frame = only(selection.id, input.frames);
  if (frame === null) return { enabled: false, reason: PLAY_REASONS.none };
  return parsePrototypeMark(frame.prototype) === null ? { enabled: false, reason: PLAY_REASONS.unmarked } : { enabled: true };
}
