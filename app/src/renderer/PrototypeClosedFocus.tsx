import { useEffect, type RefObject } from "react";
import type { CanvasController } from "./CanvasController";
import { prototypeMainCalls } from "./prototype/mainCalls";
import { closedFocusTarget } from "./prototypePlay";

// When the prototype window closes, focus comes back to the Play the person most likely pressed: the size bubble's
// while it is on screen, else the toolbar's. It only moves focus; it never shows a hidden main window or changes
// what it shows. Its own component, so App's harness, which runs no child effects, needs no prototype calls.
export function PrototypeClosedFocus({ controller, toolbar }: { controller: RefObject<CanvasController | null>; toolbar: RefObject<HTMLButtonElement | null> }) {
  useEffect(() => prototypeMainCalls().onPrototypeClosed(() => {
    closedFocusTarget(controller.current?.bubblePlayButton() ?? null, toolbar.current)?.focus({ preventScroll: true });
  }), [controller, toolbar]);
  return null;
}
