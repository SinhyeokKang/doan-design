import type { PlayRequest } from "../main/prototype/ipc";
import { playability, type Playability, type PlaySelection } from "../main/prototype/playability";
import type { CanvasState } from "./CanvasController";
import { frameLabel } from "./canvasView";
import type { SelectionView } from "./selection";

// The main window's half of Play prototype: one judgement for the toolbar button and the size bubble's button, and the
// request both send. Main still validates the request and judges the frame in the run's own document. Hand judges as
// Select does, so the tool is not an input.

export type PlayState = Pick<CanvasState, "open" | "status" | "picking" | "capturing" | "selection" | "layout">;

const CHOOSE = "Choose a prototype to play";

// The selection's nearest frame; an element outside every frame has none to play from.
export function playSelection(selection: SelectionView | null): PlaySelection {
  if (selection === null || selection.frame === undefined) return { kind: "none" };
  const kind = selection.element === undefined ? "frame" : "element";
  return selection.frameIndex === undefined ? { kind, id: selection.frame.id } : { kind, id: selection.frame.id, index: selection.frameIndex };
}

export function canvasPlayability(state: PlayState): Playability {
  const shown = state.open !== null && state.status === null && state.layout !== null;
  return playability({ shown, picking: state.picking, capturing: state.capturing, selection: playSelection(state.selection), frames: state.layout?.frames ?? [] });
}

function frameName(state: PlayState, index: number): string {
  const frame = state.layout?.frames[index];
  if (frame === undefined) return "";
  const label = frameLabel(frame);
  return label.title ?? label.id;
}

// The toolbar button's tooltip and accessible description; its accessible name stays "Play prototype".
export function playTooltip(state: PlayState): string {
  const play = canvasPlayability(state);
  if (play.kind === "disabled") return play.reason;
  if (play.kind === "play") return `Play “${frameName(state, play.frame)}”`;
  return play.broken === undefined ? CHOOSE : `“${frameName(state, play.broken)}” can’t play. ${CHOOSE}.`;
}

// The size bubble offers Play only for the playable frame itself, never for an element or a frame around the selection.
export function sizeBubblePlay(state: PlayState): boolean {
  const play = canvasPlayability(state);
  const selection = playSelection(state.selection);
  return play.kind === "play" && selection.kind === "frame" && selection.index === play.frame;
}

// `mark` is the frame's raw mark from the live layout, main's size hint for fitting the window before the run reports.
export function playRequest(state: PlayState): PlayRequest | null {
  const play = canvasPlayability(state);
  if (state.open === null || play.kind !== "play") return null;
  const frame = state.layout?.frames[play.frame];
  if (frame?.prototype === undefined) return null;
  return { root: state.open.folder, path: state.open.row.path, frame: frame.id, mark: frame.prototype };
}

// Where focus goes back when the prototype window closes: the size bubble's Play while it is on screen, else the
// toolbar's. A target that is gone or under an inert cover (the Overview, a problem overlay) takes nothing, so closing
// the window never changes what the main window shows.
export function closedFocusTarget<T extends { isConnected: boolean; closest(selector: string): unknown }>(bubble: T | null, toolbar: T | null): T | null {
  for (const target of [bubble, toolbar]) if (target !== null && target.isConnected && target.closest("[inert]") === null) return target;
  return null;
}
