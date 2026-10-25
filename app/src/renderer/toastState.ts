export const TOAST_MS = 8000;

export interface Toast {
  id: string;
  message: string;
  // At most one action button (design 'Common toast').
  action?: string;
}

export type ToastEnd = { id: string; reason: "expired" | "action" | "replaced" };

export interface ToastState {
  toast: Toast | null;
  remainingMs: number;
  // The timer stops while the pointer is over the toast, it has focus, or the
  // window is hidden.
  hovered: boolean;
  focused: boolean;
  hidden: boolean;
  modal: boolean;
  // The toast the last event took away, so the caller can tell main a removal's
  // undo window is over without re-deriving it.
  ended?: ToastEnd;
}

export type ToastEvent =
  | { type: "show"; toast: Toast }
  | { type: "tick"; elapsedMs: number }
  | { type: "hover" | "focus" | "hidden" | "modal"; on: boolean }
  | { type: "action" };

export const initialToastState: ToastState = { toast: null, remainingMs: 0, hovered: false, focused: false, hidden: false, modal: false };

export function isToastPaused(state: ToastState): boolean {
  return state.hovered || state.focused || state.hidden || state.modal;
}

// Pure so the timer logic runs on a fake clock: the component feeds `tick` with
// the time that passed while it was not paused.
export function toastState(state: ToastState, event: ToastEvent): ToastState {
  const { ended: _ended, ...base } = state;
  switch (event.type) {
    case "show":
      // The old element unmounts without a mouseleave or blur; the component
      // re-reports hover/focus if the new element is under the pointer. `hidden`
      // belongs to the window, so it stays.
      return { ...base, toast: event.toast, remainingMs: TOAST_MS, hovered: false, focused: false, ...(state.toast ? { ended: { id: state.toast.id, reason: "replaced" as const } } : {}) };
    case "tick": {
      if (!state.toast || isToastPaused(state)) return base;
      const remainingMs = state.remainingMs - Math.max(event.elapsedMs, 0);
      if (remainingMs > 0) return { ...base, remainingMs };
      return gone(base, state.toast, "expired");
    }
    case "hover":
      return { ...base, hovered: event.on };
    case "focus":
      return { ...base, focused: event.on };
    case "hidden":
      return { ...base, hidden: event.on };
    case "modal":
      return { ...base, modal: event.on };
    case "action":
      if (!state.toast?.action) return base;
      return gone(base, state.toast, "action");
  }
}

// The toast's element unmounts, so no mouseleave or blur will come for it.
function gone(state: Omit<ToastState, "ended">, toast: Toast, reason: ToastEnd["reason"]): ToastState {
  return { ...state, toast: null, remainingMs: 0, hovered: false, focused: false, ended: { id: toast.id, reason } };
}
