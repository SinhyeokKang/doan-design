import { useEffect, useReducer, useRef } from "react";
import { createPortal } from "react-dom";
import { FLOATING_EXIT_MS, initialToastState, toastState, type ToastEvent } from "./toastState";

export function useToast(restoreFocus?: (previous: HTMLElement | null) => void) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const restore = useRef(restoreFocus);
  restore.current = restoreFocus;
  const actionRef = useRef((node: HTMLButtonElement | null) => {
    if (!node) return;
    return () => {
      if (node !== document.activeElement) return;
      const previous = previousFocus.current;
      queueMicrotask(() => restore.current?.(previous));
    };
  });
  const [state, react] = useReducer(toastState, initialToastState);
  // Every event goes through here so `latest` follows the state without a render: the clock reads it to skip its tick
  // while nothing is shown, because useReducer runs App again for every dispatch, even one that changes nothing.
  const latest = useRef(initialToastState);
  const dispatch = (event: ToastEvent) => { latest.current = toastState(latest.current, event); react(event); };
  const handlers = useRef(new Map<string, { run?: () => void; expire?: () => void; press?: () => void }>());
  const timerAt = useRef(0);
  useEffect(() => {
    timerAt.current = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), elapsedMs = now - timerAt.current;
      timerAt.current = now;
      if (latest.current.toast || latest.current.ended) dispatch({ type: "tick", elapsedMs });
    }, 100);
    // Pause until the initial invoke or a newer native push establishes visibility.
    let nativeVisible = false;
    const visibility = () => { timerAt.current = performance.now(); dispatch({ type: "hidden", on: document.hidden || !nativeVisible }); };
    visibility(); document.addEventListener("visibilitychange", visibility);
    const stop = window.doan.onWindowVisible(visible => { nativeVisible = visible; visibility(); });
    return () => { stop(); clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  // The exit motion (styles.css `[data-closing]`) runs on the element still drawn as leaving.
  useEffect(() => {
    if (!state.leaving) return;
    const timer = setTimeout(() => dispatch({ type: "left" }), FLOATING_EXIT_MS);
    return () => clearTimeout(timer);
  }, [state.leaving]);
  useEffect(() => {
    if (!state.ended) return;
    const handler = handlers.current.get(state.ended.id);
    handlers.current.delete(state.ended.id);
    if (state.ended.reason === "action") handler?.run?.(); else handler?.expire?.();
  }, [state.ended]);
  // Re-checked on every render, and while a toast is shown the clock's tick renders every 100ms: a dialog that closed or
  // was removed drops the toast back to its usual place, where an App modal holds it again.
  const host = state.toast?.dialog;
  const dialog = host?.isConnected && host.open ? host : null;
  const leftDialog = host !== undefined && dialog === null;
  useEffect(() => { if (leftDialog) dispatch({ type: "leftDialog" }); }, [leftDialog]);
  // A new toast, or the same one drawn again outside its dialog, is a new element under a pointer or focus that may
  // already be there: no mouseenter or focus event comes for that, so both are read from it.
  const placed = state.toast !== null && !leftDialog && dialog === null;
  useEffect(() => {
    const node = document.querySelector(".toast");
    if (node?.matches(":hover")) dispatch({ type: "hover", on: true });
    if (node?.contains(document.activeElement)) dispatch({ type: "focus", on: true });
  }, [state.toast?.id, placed]);
  // A Retry-style action runs in place: it keeps the toast (and focus on its button) until it settles.
  const action = () => {
    const current = state.toast;
    const press = current ? handlers.current.get(current.id)?.press : undefined;
    if (current && press) { if (!current.busy) press(); return; }
    dispatch({ type: "action" });
  };
  // A leaving toast whose dialog has gone is not drawn again in the usual place: that would be a new element entering.
  const leavingHost = state.leaving?.dialog;
  const leaving = state.toast === null && state.leaving !== null && (leavingHost === undefined || (leavingHost.isConnected && leavingHost.open)) ? state.leaving : null;
  const shown = state.toast ?? leaving;
  const portal = shown === leaving ? leavingHost : dialog ?? undefined;
  // Keyed by the slot, so a replacement keeps the element and does not enter again. The action is keyed by its toast
  // (and differs while leaving): a focused action that goes takes focus back out through `actionRef`, as the element
  // that unmounted used to, and a new toast's action is never the old one's focus.
  const element = shown && <div key={state.slot} className="toast doan-floating doan-toast" role="status" {...(portal ? { "data-placement": "dialog" } : {})}
    {...(leaving ? { "data-closing": "", inert: true } : {})}
    ref={node => {
      if (!node) return;
      return () => {
        if (node.contains(document.activeElement)) {
          const previous = previousFocus.current;
          queueMicrotask(() => restoreFocus?.(previous));
        }
      };
    }}
    onMouseEnter={() => dispatch({ type: "hover", on: true })} onMouseLeave={() => { timerAt.current = performance.now(); dispatch({ type: "hover", on: false }); }}
    onFocus={event => { if (!event.currentTarget.contains(event.relatedTarget)) previousFocus.current = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null; dispatch({ type: "focus", on: true }); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { timerAt.current = performance.now(); dispatch({ type: "focus", on: false }); } }}>
    <span className="msg selectable">{shown.message}</span>{shown.action && <button key={leaving ? `${shown.id}:leaving` : shown.id} ref={actionRef.current} className="btn doan-button" data-ui-variant="prominent" data-ui-size="sm" onClick={action}
      // Not `disabled`: that would drop focus from the button while it runs, and the button's focus decides where focus
      // goes when the toast leaves.
      {...(shown.busy ? { "aria-disabled": true, "data-disabled": "" } : {})}>{shown.busy ? <><span className="doan-spinner" aria-hidden="true" />{shown.action}</> : shown.action}</button>}
  </div>;
  return {
    toast: state.toast,
    show(message: string, label?: string, run?: () => void, expire?: () => void) {
      const id = crypto.randomUUID();
      handlers.current.set(id, { ...(run ? { run } : {}), ...(expire ? { expire } : {}) });
      timerAt.current = performance.now();
      dispatch({ type: "show", toast: { id, message, ...(label ? { action: label } : {}) } });
    },
    // An actionless toast drawn inside `dialog`, the open modal dialog, when there is one: outside it the toast would
    // sit inert behind the modal, unseen and unread (ARCHITECTURE §7 'Toasts'). Without one it is an ordinary toast.
    showIn(dialog: HTMLDialogElement | null, message: string) {
      timerAt.current = performance.now();
      dispatch({ type: "show", toast: { id: crypto.randomUUID(), message, ...(dialog ? { dialog } : {}) } });
    },
    // A toast whose `label` action (Retry) runs `attempt` in place: while it runs the toast shows `busy` and a
    // `running` button that does nothing; it goes when `attempt` resolves null and otherwise shows the resolved text with
    // the action again. A toast that replaced it meanwhile is left alone.
    retry(message: string, label: string, busy: string, running: string, attempt: () => Promise<string | null>) {
      const id = crypto.randomUUID();
      handlers.current.set(id, {
        press: () => {
          dispatch({ type: "update", id, message: busy, action: running, busy: true });
          attempt().then(next => {
            if (next === null) dispatch({ type: "dismiss", id });
            else dispatch({ type: "update", id, message: next, action: label, busy: false });
          }, () => dispatch({ type: "update", id, message, action: label, busy: false }));
        },
      });
      timerAt.current = performance.now();
      dispatch({ type: "show", toast: { id, message, action: label } });
    },
    action,
    setModal(on: boolean) { timerAt.current = performance.now(); dispatch({ type: "modal", on }); },
    element: element && portal ? createPortal(element, portal) : element,
  };
}
