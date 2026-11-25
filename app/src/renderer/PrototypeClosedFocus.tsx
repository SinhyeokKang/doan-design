import { useEffect, type RefObject } from "react";
import { useActivationFocus } from "./activationFocus";
import type { CanvasController } from "./CanvasController";
import { prototypeMainCalls } from "./prototype/mainCalls";
import { closedFocusTarget } from "./prototypePlay";

// When the prototype window closes, focus returns to the bubble's Play while shown, else the toolbar's; nothing is shown.
// Its own component, so App's harness, which runs no child effects, needs no prototype calls.
export function PrototypeClosedFocus({ controller, toolbar }: { controller: RefObject<CanvasController | null>; toolbar: RefObject<HTMLButtonElement | null> }) {
  // The push can arrive before the main window is active, so the return is made again on activation, to the Play on
  // screen then.
  const handFocus = useActivationFocus();
  useEffect(() => prototypeMainCalls().onPrototypeClosed(() => {
    handFocus(() => closedFocusTarget(controller.current?.bubblePlayButton() ?? null, toolbar.current)?.focus({ preventScroll: true }));
  }), [controller, toolbar, handFocus]);
  return null;
}
