export const TOAST_MS = 8000;
// A floating surface's exit motion: --time-fast.
export const FLOATING_EXIT_MS = 120;

export interface Toast {
  id: string;
  message: string;
  action?: string;
  // The toast stays until the action settles it.
  busy?: true;
  // A toast drawn inside a modal dialog is visible and read there, so the modal does not hold its clock.
  dialog?: HTMLDialogElement;
}

export type ToastEnd = { id: string; reason: "expired" | "action" | "replaced" };

export interface ToastState {
  toast: Toast | null;
  remainingMs: number;
  // The timer stops while hovered, focused, hidden, or an App modal owns input.
  hovered: boolean;
  focused: boolean;
  hidden: boolean;
  modal: boolean;
  // The toast the last event ended, so the caller can act on it without re-deriving it.
  ended?: ToastEnd;
  // A replacement keeps the key, so it changes only the content and does not enter again.
  slot: number;
  // Still drawn for its exit motion until `left`.
  leaving: Toast | null;
}

export type ToastEvent =
  | { type: "show"; toast: Toast }
  | { type: "tick"; elapsedMs: number }
  | { type: "hover" | "focus" | "hidden" | "modal"; on: boolean }
  | { type: "action" }
  // Same element, so focus on its button stays.
  | { type: "update"; id: string; message: string; action: string; busy: boolean }
  | { type: "dismiss"; id: string }
  // The old element unmounted without a mouseleave or blur, so the hover and focus pauses go; Toast re-reads them.
  | { type: "leftDialog" }
  | { type: "left" };

export const initialToastState: ToastState = { toast: null, remainingMs: 0, hovered: false, focused: false, hidden: false, modal: false, slot: 0, leaving: null };

export function isToastPaused(state: ToastState): boolean {
  return state.hovered || state.focused || state.hidden || state.toast?.busy === true || (state.modal && !state.toast?.dialog);
}

// Pure so the timer logic runs on a fake clock.
export function toastState(state: ToastState, event: ToastEvent): ToastState {
  const { ended: _ended, ...base } = state;
  switch (event.type) {
    case "show":
      // The old element unmounts without a mouseleave or blur; `hidden` and `modal` belong to the app, so they stay.
      return { ...base, toast: event.toast, remainingMs: TOAST_MS, hovered: false, focused: false, slot: state.toast ? state.slot : state.slot + 1, leaving: null, ...(state.toast ? { ended: { id: state.toast.id, reason: "replaced" as const } } : {}) };
    case "tick": {
      // The same object when nothing changes: useToast ticks every 100 ms for the life of App, and a new state re-renders
      // all of App.
      if (!state.toast && !state.ended) return state;
      if (!state.toast) return base;
      // A toast left up while the window is hidden never expires; a new object per tick would re-render all of App. One in a
      // dialog still re-renders, so Toast sees that dialog go.
      if (state.hidden && !state.ended && !state.toast.dialog) return state;
      if (isToastPaused(state)) return base;
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
      if (!state.toast?.action || state.toast.busy) return base;
      return gone(base, state.toast, "action");
    case "update": {
      if (state.toast?.id !== event.id) return base;
      const { busy: _busy, ...rest } = state.toast;
      // A settled action starts a fresh full time, as a new toast would.
      return { ...base, toast: { ...rest, message: event.message, action: event.action, ...(event.busy ? { busy: true as const } : {}) }, remainingMs: event.busy ? state.remainingMs : TOAST_MS };
    }
    case "dismiss":
      if (state.toast?.id !== event.id) return base;
      return gone(base, state.toast, "action");
    case "leftDialog": {
      if (!state.toast?.dialog) return base;
      const { dialog: _dialog, ...toast } = state.toast;
      return { ...base, toast, hovered: false, focused: false };
    }
    case "left":
      return state.leaving ? { ...base, leaving: null } : base;
  }
}

// The toast's element unmounts, so no mouseleave or blur will come for it.
function gone(state: Omit<ToastState, "ended">, toast: Toast, reason: ToastEnd["reason"]): ToastState {
  return { ...state, toast: null, remainingMs: 0, hovered: false, focused: false, leaving: toast, ended: { id: toast.id, reason } };
}
