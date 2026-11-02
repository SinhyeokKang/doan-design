import type { PanelBounds } from "./rightPanelSize";

// The shell sidebar's width: resizable on the conversation panel's handle, remembered on this device. Fixed bounds,
// not window-relative: the narrowest still fits a project row's name and menu, and the widest leaves a 960px window
// room for the canvas and its panel.
export const SIDEBAR_BOUNDS: PanelBounds = { min: 180, max: 360 };
export const SIDEBAR_DEFAULT = 220;

export function sidebarWidth(saved: number | undefined): number {
  if (saved === undefined || !Number.isFinite(saved)) return SIDEBAR_DEFAULT;
  return Math.min(SIDEBAR_BOUNDS.max, Math.max(SIDEBAR_BOUNDS.min, saved));
}
