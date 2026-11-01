import type { ViewCommand } from "../main/index";
import { renderedBoard, type BoardState } from "./frameDrawer";
import { MAX_SCALE, MIN_SCALE, type View } from "./viewport";

export type ZoomMenuItem =
  // Fit and 100% are the View menu's own commands.
  | { id: string; label: string; shortcut: string; command: Extract<ViewCommand, "fit" | "actualSize"> }
  | { id: string; label: string; scale: number };

export interface ZoomControlView {
  enabled: boolean;
  value: string;
  triggerLabel: string;
  zoomOut: { disabled: boolean; tooltip: string };
  zoomIn: { disabled: boolean; tooltip: string };
  items: ZoomMenuItem[];
}

const ITEMS: ZoomMenuItem[] = [
  { id: "fit", label: "Fit", shortcut: "⌘1", command: "fit" },
  { id: "actualSize", label: "100%", shortcut: "⌘0", command: "actualSize" },
  { id: "50", label: "50%", scale: 0.5 },
  { id: "200", label: "200%", scale: 2 },
];

// The factor for `zoomAt(view, factor, center, ZOOM_LIMITS)` that lands on `target` while keeping the view center
// fixed, like `actualSize`.
export function scaleFactor(target: number, view: View): number {
  return target / view.scale;
}

// `zoom` is CanvasState.zoom, the view scale as an integer percent, so the step limits are compared in percent.
export function zoomControlView(state: BoardState & { zoom: number }): ZoomControlView {
  const on = renderedBoard(state);
  return {
    enabled: on,
    value: on ? `${state.zoom}%` : "—",
    triggerLabel: on ? `Zoom ${state.zoom}%, zoom options` : "Zoom options",
    zoomOut: { disabled: !on || state.zoom <= MIN_SCALE * 100, tooltip: "Zoom out ⌘−" },
    zoomIn: { disabled: !on || state.zoom >= MAX_SCALE * 100, tooltip: "Zoom in ⌘=" },
    items: ITEMS,
  };
}
