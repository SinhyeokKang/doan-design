import type { SidebarSlot } from "./canvasNotice";
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

export interface SidebarToggleView {
  label: string;
  icon: "hide" | "show";
  badge: "permission" | "working" | "unseen" | null;
}

const BADGES = [
  ["permission", "Show sidebar, needs your answer"],
  ["working", "Show sidebar, agent working"],
  ["unseen", "Show sidebar, new activity"],
] as const;

// The header's sidebar button. While the sidebar is hidden it carries the most urgent signal its slots would show, so
// a conversation that needs an answer is not lost with it. Canvas notices are not agent signals and stay out.
export function sidebarToggleView(hidden: boolean, slots: ReadonlyMap<string, SidebarSlot>): SidebarToggleView {
  if (!hidden) return { label: "Hide sidebar", icon: "hide", badge: null };
  const kinds = new Set([...slots.values()].map(slot => slot.kind));
  const found = BADGES.find(([kind]) => kinds.has(kind));
  return found ? { label: found[1], icon: "show", badge: found[0] } : { label: "Show sidebar", icon: "show", badge: null };
}
