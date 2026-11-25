// Radix still moves focus back to a usable trigger itself.

// A disabled trigger closes its menu so it cannot reopen by itself once the canvas reads again; a canvas change closes
// it as a move.
export function menuCloseNow(input: { open: boolean; enabled: boolean; canvasChanged: boolean }): { close: boolean; moved: boolean } {
  if (!input.open) return { close: false, moved: false };
  if (input.canvasChanged) return { close: true, moved: true };
  return { close: !input.enabled, moved: false };
}

// After a canvas move focus never goes back to the old trigger; focus left on the page falls to the canvas region,
// while focus the move placed elsewhere stays.
export function menuCloseFocus(input: { moved: boolean; triggerUsable: boolean; focusLost: boolean }): "trigger" | "fallback" | "leave" {
  if (!input.moved && input.triggerUsable) return "trigger";
  return input.focusLost ? "fallback" : "leave";
}

// `activeLost`: focus is on the page (body, nothing, or a removed node).
export function controlFocusLost(input: { last: { connected: boolean; disabled: boolean } | null; activeLost: boolean; activeIsLast: boolean; covered: boolean }): boolean {
  const { last } = input;
  if (!last || input.covered) return false;
  const lost = input.activeLost || (input.activeIsLast && last.disabled);
  return lost && (!last.connected || last.disabled);
}
