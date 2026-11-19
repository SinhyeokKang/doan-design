import { useEffect, useRef } from "react";
import { menuCloseFocus, menuCloseNow } from "./canvasFocus";

// A header menu's closing and focus rules (canvasFocus.ts), applied to its trigger and Radix's close.
export function useMenuFocus(canvasKey: string | null, open: boolean, enabled: boolean, close: () => void, fallbackFocus?: () => void) {
  const trigger = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  const shown = useRef(canvasKey);
  useEffect(() => {
    const canvasChanged = shown.current !== canvasKey;
    shown.current = canvasKey;
    const now = menuCloseNow({ open, enabled, canvasChanged });
    if (now.moved) moved.current = true;
    if (now.close) close();
  });
  const onCloseAutoFocus = (event: Event) => {
    const active = document.activeElement;
    const to = menuCloseFocus({ moved: moved.current, triggerUsable: !!trigger.current?.isConnected && !trigger.current.disabled,
      focusLost: !active || active === document.body || !active.isConnected });
    moved.current = false;
    if (to === "trigger") return;
    event.preventDefault();
    if (to === "fallback") fallbackFocus?.();
  };
  return { trigger, onCloseAutoFocus };
}
