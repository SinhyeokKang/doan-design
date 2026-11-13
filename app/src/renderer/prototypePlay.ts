import type { PlayRequest } from "../main/prototype/ipc";
import { playability, type Playability, type PlaySelection } from "../main/prototype/playability";
import type { CanvasState } from "./CanvasController";
import type { SelectionView } from "./selection";

// The main window's half of Play prototype: one judgement for the toolbar button and the size bubble's button, and the
// request both send. Main still validates the request and judges the frame in the run's own document.

export type PlayState = Pick<CanvasState, "tool" | "picking" | "capturing" | "selection" | "layout">;

// A selection without an element is the frame itself; an element selection never plays, even inside a marked frame.
export function playSelection(selection: SelectionView | null): PlaySelection {
  if (selection === null) return { kind: "none" };
  if (selection.element !== undefined) return { kind: "element" };
  return selection.frame === undefined ? { kind: "none" } : { kind: "frame", id: selection.frame.id };
}

export function canvasPlayability(state: PlayState): Playability {
  return playability({ tool: state.tool, picking: state.picking, capturing: state.capturing, selection: playSelection(state.selection), frames: state.layout?.frames ?? [] });
}

// `mark` is the frame's raw mark from the live layout, main's size hint for fitting the window before the run reports.
export function playRequest(state: PlayState & Pick<CanvasState, "open">): PlayRequest | null {
  const selection = playSelection(state.selection);
  if (state.open === null || selection.kind !== "frame" || !canvasPlayability(state).enabled) return null;
  const mark = state.layout?.frames.find(frame => frame.id === selection.id)?.prototype;
  if (mark === undefined) return null;
  return { root: state.open.folder, path: state.open.row.path, frame: selection.id, mark };
}

// Where focus goes back when the prototype window closes: the size bubble's Play while it is on screen, else the
// toolbar's. A target that is gone or under an inert cover (the Overview, a problem overlay) takes nothing, so closing
// the window never changes what the main window shows.
export function closedFocusTarget<T extends { isConnected: boolean; closest(selector: string): unknown }>(bubble: T | null, toolbar: T | null): T | null {
  for (const target of [bubble, toolbar]) if (target !== null && target.isConnected && target.closest("[inert]") === null) return target;
  return null;
}
