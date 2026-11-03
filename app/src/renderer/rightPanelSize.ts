// Size rules for the canvas page's conversation panel and the Overview's canvas conversations panel (buzz-canvas
// design §2 'Right panel', §3). Pure: the renderer measures the window and the shell column and passes them in.

export interface PanelBounds {
  min: number;
  max: number;
}

// The narrowest either right panel goes, whatever the window: its head, composer and cards still fit at 280.
export const PANEL_MIN = 280;
// The Overview's canvas conversations panel starts at its former fixed width.
export const OVERVIEW_PANEL_DEFAULT = 280;
const DEFAULT_FLOOR = 320;
const DEFAULT_WINDOW_SHARE = 0.28;
const WINDOW_SHARE_MAX = 0.5;
// The canvas must keep this much width beside the panel.
const CANVAS_MIN = 360;
const NUDGE = 16;

// `shellWidth` is the measured column that holds the canvas and the panel (sidebar and margins excluded), so
// the canvas limit follows the real layout. In a window too narrow for both limits the maximum wins.
export function panelBounds(windowWidth: number, shellWidth: number): PanelBounds {
  const max = Math.max(0, Math.floor(Math.min(windowWidth * WINDOW_SHARE_MAX, shellWidth - CANVAS_MIN)));
  return { min: Math.min(PANEL_MIN, max), max };
}

// The canvas conversation panel's default: wider than its minimum and growing with the window.
export function canvasPanelDefault(windowWidth: number): number {
  return Math.round(Math.max(DEFAULT_FLOOR, windowWidth * DEFAULT_WINDOW_SHARE));
}

// The width to show. `saved` is never rewritten here: a window that shrinks shows a clamped width while the
// saved value stays, so widening the window again brings it back. A missing or unusable value is the panel's
// `fallback` default, clamped the same way.
export function panelWidth(saved: number | undefined, bounds: PanelBounds, fallback: number): number {
  const wanted = saved === undefined || !Number.isFinite(saved) ? fallback : saved;
  return Math.min(bounds.max, Math.max(bounds.min, wanted));
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
