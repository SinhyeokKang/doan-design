import { useEffect, useReducer, useRef } from "react";
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
  useEffect(() => { if (document.querySelector(".toast")?.matches(":hover")) dispatch({ type: "hover", on: true }); }, [state.toast?.id]);
  const action = () => dispatch({ type: "action" });
  return {
    toast: state.toast,
    show(message: string, label?: string, run?: () => void, expire?: () => void) {
      const id = crypto.randomUUID();
      handlers.current.set(id, { ...(run ? { run } : {}), ...(expire ? { expire } : {}) });
      timerAt.current = performance.now();
      dispatch({ type: "show", toast: { id, message, ...(label ? { action: label } : {}) } });
    },
    action,
    setModal(on: boolean) { timerAt.current = performance.now(); dispatch({ type: "modal", on }); },
    element: state.toast && <div key={state.toast.id} className={`toast doan-floating doan-toast${state.toast.action ? "" : " solo"}`} role="status"
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
      <span className="msg">{state.toast.message}</span>{state.toast.action && <button className="btn doan-button" data-ui-variant="subtle" data-ui-size="sm" onClick={action}>{state.toast.action}</button>}
    </div>,
  };
}
