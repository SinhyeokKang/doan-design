import { useEffect, useReducer, useRef } from "react";
import { initialToastState, toastState } from "./toastState";

export function useToast() {
  const [state, dispatch] = useReducer(toastState, initialToastState);
  const handlers = useRef(new Map<string, { run?: () => void; expire?: () => void }>());
  const timerAt = useRef(0);
  useEffect(() => {
    timerAt.current = performance.now();
    const timer = setInterval(() => { const now = performance.now(); dispatch({ type: "tick", elapsedMs: now - timerAt.current }); timerAt.current = now; }, 100);
    const visibility = () => { timerAt.current = performance.now(); dispatch({ type: "hidden", on: document.hidden }); };
    visibility(); document.addEventListener("visibilitychange", visibility);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
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
    element: state.toast && <div key={state.toast.id} className={`toast${state.toast.action ? "" : " solo"}`} role="status"
      onMouseEnter={() => dispatch({ type: "hover", on: true })} onMouseLeave={() => { timerAt.current = performance.now(); dispatch({ type: "hover", on: false }); }}
      onFocus={() => dispatch({ type: "focus", on: true })} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { timerAt.current = performance.now(); dispatch({ type: "focus", on: false }); } }}>
      <span className="msg">{state.toast.message}</span>{state.toast.action && <button className="btn" onClick={action}>{state.toast.action}</button>}
    </div>,
  };
}
