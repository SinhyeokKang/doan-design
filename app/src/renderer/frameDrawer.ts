import type { LayoutMessage } from "./canvasMessage";
import type { CanvasState } from "./CanvasController";
import { frameLabel } from "./canvasView";
import { playableFrames } from "../main/prototype/playability";

export const TRUNCATED_NOTE = "Showing the first 1,000 frames. Search all with Quick Open (⌘K).";

export interface BoardState {
  layout: Pick<LayoutMessage, "frames" | "truncated"> | null;
  currentFrame: CanvasState["currentFrame"];
  status: CanvasState["status"];
  unlisted: CanvasState["unlisted"];
}

// A reload keeps the previous layout with `status` null, so it still counts as rendered; do not read
// `status === "loading"` alone.
export function renderedBoard(state: BoardState): boolean {
  return state.status === null && !state.unlisted && state.layout !== null;
}

export interface FrameDrawerRow {
  // Equal to the frame id unless the id repeats, so a focused row can follow its frame id across a reload.
  key: string;
  index: number;
  id: string;
  number: number;
  name: string;
  current: boolean;
  // Metadata only: the row still moves to and selects the frame.
  prototype: boolean;
}

export interface FrameDrawerView {
  enabled: boolean;
  buttonLabel: string;
  ariaLabel: string;
  rows: FrameDrawerRow[];
  truncatedNote: string | null;
}

const off = (label: string): FrameDrawerView => ({ enabled: false, buttonLabel: label, ariaLabel: label, rows: [], truncatedNote: null });

// Generated keys avoid every raw id in the layout, so removing or reordering other frames never hands a unique frame's
// key to a duplicate or the reverse.
function rowKeys(ids: readonly string[]): string[] {
  const raw = new Set(ids);
  const seen = new Map<string, number>();
  const used = new Set<string>();
  return ids.map(id => {
    const count = (seen.get(id) ?? 0) + 1;
    seen.set(id, count);
    let key = id;
    if (count > 1) {
      key = `${id}#${count}`;
      while (raw.has(key) || used.has(key)) key += "_";
    }
    used.add(key);
    return key;
  });
}

export function frameDrawerView(state: BoardState): FrameDrawerView {
  const layout = state.layout;
  if (!renderedBoard(state) || layout === null) return off("Frames");
  if (layout.frames.length === 0) return off("No frames");
  const keys = rowKeys(layout.frames.map(frame => frame.id));
  // A stale index (the layout changed since it was computed) is no current frame.
  const current = state.currentFrame !== null && layout.frames[state.currentFrame] !== undefined ? state.currentFrame : null;
  const playable = playableFrames(layout.frames);
  const rows = layout.frames.map((frame, index): FrameDrawerRow => {
    const label = frameLabel(frame);
    return { key: keys[index]!, index, id: frame.id, number: index + 1, name: label.title ?? label.id, current: index === current,
      prototype: playable[index]! };
  });
  const viewing = current === null ? null : rows[current]!;
  return {
    enabled: true,
    buttonLabel: viewing ? `${viewing.number}. ${viewing.name}` : "Frames",
    ariaLabel: viewing ? `Frame ${viewing.number}: ${viewing.name}` : "Frames",
    rows,
    truncatedNote: layout.truncated ? TRUNCATED_NOTE : null,
  };
}
