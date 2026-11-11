import { useEffect, useRef, type RefObject } from "react";
import { controlFocusLost } from "./canvasFocus";
import type { CanvasViewStore } from "./CanvasController";

// A canvas control that vanished or turned disabled under focus hands it to the canvas region, not the page. Checked a
// task later, after a closing Radix menu has tried its trigger. It runs after every render of the pane and after every
// change of the view store: a publish that moves only the zoom or the current frame redraws the header alone, and that
// is where Zoom in or Zoom out turns disabled at a scale limit.
export function useControlFocusRecovery(panel: RefObject<HTMLElement | null>, viewport: RefObject<HTMLElement | null>, covered: boolean, view: CanvasViewStore): void {
  const lastFocus = useRef<HTMLElement | null>(null);
  const coveredNow = useRef(covered);
  coveredNow.current = covered;
  useEffect(() => {
    const track = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const control = target?.matches('button, [role="option"], [role="menuitem"]') && (panel.current?.contains(target) || target.closest(".doan-frame-list, .doan-zoom-menu"));
      lastFocus.current = control ? target : null;
    };
    document.addEventListener("focusin", track);
    return () => document.removeEventListener("focusin", track);
  }, [panel]);
  useEffect(() => {
    const timer = setTimeout(() => recover(lastFocus, coveredNow.current, viewport), 0);
    return () => clearTimeout(timer);
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = view.subscribe(() => { clearTimeout(timer); timer = setTimeout(() => recover(lastFocus, coveredNow.current, viewport), 0); });
    return () => { stop(); clearTimeout(timer); };
  }, [view, viewport]);
}

function recover(lastFocus: { current: HTMLElement | null }, covered: boolean, viewport: RefObject<HTMLElement | null>): void {
  const last = lastFocus.current, active = document.activeElement;
  if (!controlFocusLost({ last: last && { connected: last.isConnected, disabled: last.matches(":disabled") }, covered,
    activeLost: !active || active === document.body || !active.isConnected, activeIsLast: !!last && active === last })) return;
  lastFocus.current = null;
  viewport.current?.focus();
}
