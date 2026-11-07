import { useEffect, useReducer, useRef } from "react";
import { createPortal } from "react-dom";
import { initialToastState, toastState } from "./toastState";

export function useToast(restoreFocus?: (previous: HTMLElement | null) => void) {
  const previousFocus = useRef<HTMLElement | null>(null);
  const [state, dispatch] = useReducer(toastState, initialToastState);
  const handlers = useRef(new Map<string, { run?: () => void; expire?: () => void }>());
  const timerAt = useRef(0);
  useEffect(() => {
    timerAt.current = performance.now();
    const timer = setInterval(() => { const now = performance.now(); dispatch({ type: "tick", elapsedMs: now - timerAt.current }); timerAt.current = now; }, 100);
    // Pause until the initial invoke or a newer native push establishes visibility.
    let nativeVisible = false;
    const visibility = () => { timerAt.current = performance.now(); dispatch({ type: "hidden", on: document.hidden || !nativeVisible }); };
    visibility(); document.addEventListener("visibilitychange", visibility);
    const stop = window.doan.onWindowVisible(visible => { nativeVisible = visible; visibility(); });
    return () => { stop(); clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    if (!state.ended) return;
    const handler = handlers.current.get(state.ended.id);
    handlers.current.delete(state.ended.id);
    if (state.ended.reason === "action") handler?.run?.(); else handler?.expire?.();
  }, [state.ended]);
  // Re-checked on every render, and the clock's tick renders every 100ms: a dialog that closed or was removed drops the
  // toast back to its usual place, where an App modal holds it again.
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
  const action = () => dispatch({ type: "action" });
  const element = state.toast && <div key={state.toast.id} className="toast doan-floating doan-toast" role="status" {...(dialog ? { "data-placement": "dialog" } : {})}
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
    <span className="msg">{state.toast.message}</span>{state.toast.action && <button className="btn doan-button" data-ui-variant="prominent" data-ui-size="sm" onClick={action}>{state.toast.action}</button>}
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
    // sit inert behind the modal, unseen and unread (defect-sweep C3). Without one it is an ordinary toast.
    showIn(dialog: HTMLDialogElement | null, message: string) {
      timerAt.current = performance.now();
      dispatch({ type: "show", toast: { id: crypto.randomUUID(), message, ...(dialog ? { dialog } : {}) } });
    },
    action,
    setModal(on: boolean) { timerAt.current = performance.now(); dispatch({ type: "modal", on }); },
    element: element && dialog ? createPortal(element, dialog) : element,
  };
}
