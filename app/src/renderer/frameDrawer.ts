import type { LayoutMessage } from "./canvasMessage";
import type { CanvasState } from "./CanvasController";
import { frameLabel } from "./canvasView";

export const TRUNCATED_NOTE = "Showing the first 1,000 frames. Search all with Quick Open (⌘K).";

// The part of CanvasState the canvas header reads.
export interface BoardState {
  layout: Pick<LayoutMessage, "frames" | "truncated"> | null;
  currentFrame: CanvasState["currentFrame"];
  status: CanvasState["status"];
  unlisted: CanvasState["unlisted"];
}

// A reload keeps the previous layout with `status` null, so it still counts as rendered; every other state that
// has no board to show (loading, failed, no width, missing, empty, unlisted) has a status, no layout or `unlisted`
// (POSTMORTEM 2026-10-26: do not read `status === "loading"` alone).
export function renderedBoard(state: BoardState): boolean {
  return state.status === null && !state.unlisted && state.layout !== null;
}

export interface FrameDrawerRow {
  // Unique among rows, and equal to the frame id unless ids repeat, so a focused row can follow its frame id
  // across a reload.
  key: string;
  index: number;
  id: string;
  number: number;
  name: string;
  current: boolean;
}

export interface FrameDrawerView {
  enabled: boolean;
  buttonLabel: string;
  ariaLabel: string;
  rows: FrameDrawerRow[];
  truncatedNote: string | null;
}

const off = (label: string): FrameDrawerView => ({ enabled: false, buttonLabel: label, ariaLabel: label, rows: [], truncatedNote: null });

function rowKeys(ids: readonly string[]): string[] {
  const seen = new Map<string, number>();
  const used = new Set<string>();
  return ids.map(id => {
    const count = (seen.get(id) ?? 0) + 1;
    seen.set(id, count);
    let key = count === 1 ? id : `${id}#${count}`;
    // A real id such as "a#2" can collide with a generated key.
    while (used.has(key)) key += "_";
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
  const rows = layout.frames.map((frame, index): FrameDrawerRow => {
    const label = frameLabel(frame);
    return { key: keys[index]!, index, id: frame.id, number: index + 1, name: label.title ?? label.id, current: index === current };
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
