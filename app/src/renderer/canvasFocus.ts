// Focus decisions for the canvas page's header menus and board controls (buzz-canvas design §2 'Esc와 포커스'). The
// components read the DOM and apply the answer; Radix still moves focus back to a usable trigger itself.

// Whether an open header menu closes itself now. A trigger that turned disabled (the load failed, no width) closes its
// menu so it cannot reopen by itself once the canvas reads again; a canvas change closes it as a move, whose own focus
// rule then applies.
export function menuCloseNow(input: { open: boolean; enabled: boolean; canvasChanged: boolean }): { close: boolean; moved: boolean } {
  if (!input.open) return { close: false, moved: false };
  if (input.canvasChanged) return { close: true, moved: true };
  return { close: !input.enabled, moved: false };
}

// Where focus goes as a header menu closes. `trigger`: Radix's default return. After a canvas move focus never goes back
// to the old trigger, and a disabled trigger cannot take it; focus left on the page then falls to the canvas region,
// while focus the move already placed elsewhere stays.
export function menuCloseFocus(input: { moved: boolean; triggerUsable: boolean; focusLost: boolean }): "trigger" | "fallback" | "leave" {
  if (!input.moved && input.triggerUsable) return "trigger";
  return input.focusLost ? "fallback" : "leave";
}

// Whether a canvas control that held focus vanished or turned disabled under it, so focus should go to the canvas
// region rather than stay lost. `activeLost`: focus is on the page (body, nothing, or a removed node).
export function controlFocusLost(input: { last: { connected: boolean; disabled: boolean } | null; activeLost: boolean; activeIsLast: boolean; covered: boolean }): boolean {
  const { last } = input;
  if (!last || input.covered) return false;
  const lost = input.activeLost || (input.activeIsLast && last.disabled);
  return lost && (!last.connected || last.disabled);
}
