// Size rules for the canvas page's conversation panel (buzz-canvas design §2 'Right panel', §3). Pure: the
// renderer measures the window and the shell column and passes them in.

export interface PanelBounds {
  min: number;
  max: number;
}

const FLOOR = 320;
const WINDOW_SHARE_MIN = 0.28;
const WINDOW_SHARE_MAX = 0.5;
// The canvas must keep this much width beside the panel.
const CANVAS_MIN = 360;
const NUDGE = 16;

// `shellWidth` is the measured column that holds the canvas and the panel (sidebar and margins excluded), so
// the canvas limit follows the real layout. In a window too narrow for both limits the maximum wins.
export function panelBounds(windowWidth: number, shellWidth: number): PanelBounds {
  const max = Math.max(0, Math.floor(Math.min(windowWidth * WINDOW_SHARE_MAX, shellWidth - CANVAS_MIN)));
  const min = Math.min(Math.round(Math.max(FLOOR, windowWidth * WINDOW_SHARE_MIN)), max);
  return { min, max };
}

// The width to show. `saved` is never rewritten here: a window that shrinks shows a clamped width while the
// saved value stays, so widening the window again brings it back. A missing or unusable value is the default,
// which is the minimum.
export function panelWidth(saved: number | undefined, windowWidth: number, shellWidth: number): number {
  const { min, max } = panelBounds(windowWidth, shellWidth);
  if (saved === undefined || !Number.isFinite(saved)) return min;
  return Math.min(max, Math.max(min, saved));
}

// On the panel's start (left) edge ← moves the edge left and widens the panel; on the sidebar's end edge → widens.
// Home and End move the edge to the window's start and end either way. `null` for a key the handle does not use,
// so the caller leaves it alone.
export function nudgePanel(width: number, key: string, bounds: PanelBounds, edge: "start" | "end" = "start"): number | null {
  const widen = edge === "start" ? "ArrowLeft" : "ArrowRight", narrow = edge === "start" ? "ArrowRight" : "ArrowLeft";
  const toStart = edge === "start" ? bounds.max : bounds.min, toEnd = edge === "start" ? bounds.min : bounds.max;
  const next = key === widen ? width + NUDGE : key === narrow ? width - NUDGE : key === "Home" ? toStart : key === "End" ? toEnd : null;
  return next === null ? null : Math.min(bounds.max, Math.max(bounds.min, next));
}
