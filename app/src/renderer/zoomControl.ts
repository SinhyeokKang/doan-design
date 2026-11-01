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

// `scale` is the exact view scale: the step limits are the zoom limits themselves, and only the shown value is a
// rounded percent (a scale of 0.052 shows 5% but can still zoom out).
export function zoomControlView(state: BoardState & { scale: number }): ZoomControlView {
  const on = renderedBoard(state);
  const percent = Math.round(state.scale * 100);
  return {
    enabled: on,
    value: on ? `${percent}%` : "—",
    triggerLabel: on ? `Zoom ${percent}%, zoom options` : "Zoom options",
    zoomOut: { disabled: !on || state.scale <= MIN_SCALE, tooltip: "Zoom out ⌘−" },
    zoomIn: { disabled: !on || state.scale >= MAX_SCALE, tooltip: "Zoom in ⌘=" },
    items: ITEMS,
  };
}
