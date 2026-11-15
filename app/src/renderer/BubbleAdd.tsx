import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { Crosshair } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

// Add to message, the size bubble's last control (PRODUCT §5 item 6). The bubble is the controller's DOM; it hands App a
// fixed host at its end and App renders this button there, so availability, the reason and the tooltip are React's.
// The press is not: the host's native click listener stops it before the viewport's listeners see it and calls App
// (CanvasController.bubbleAdd), so the button has no onClick. aria-disabled, not disabled: it keeps focus and its
// tooltip, and its unavailable reason is also an sr-only description, read while the tooltip is closed. The tooltip's
// Escape goes to the controller's tooltip Escape, as the toolbar's do (ARCHITECTURE §3 'Actions and focus').
const REASON_ID = "canvas-bubble-add-reason";

interface BubbleAddProps { enabled: boolean; reason: string | null; button: RefObject<HTMLButtonElement | null>; onEscape(event: KeyboardEvent): void }

export function BubbleAddButton({ enabled, reason, button, onEscape }: BubbleAddProps) {
  return <>
    <Tooltip><TooltipTrigger asChild>
      <button ref={button} type="button" className="doan-icon-button bubble-button" data-ui-size="xs" aria-label="Add to message"
        {...(enabled ? {} : { "aria-disabled": true, "aria-describedby": REASON_ID })}><Crosshair aria-hidden="true" /></button>
    </TooltipTrigger><TooltipContent onEscapeKeyDown={onEscape}>{enabled ? "Add to message" : reason ?? "Add to message"}</TooltipContent></Tooltip>
    {!enabled && <span className="sr-only" id={REASON_ID}>{reason ?? "Add to message"}</span>}
  </>;
}

export function BubbleAdd({ host, ...props }: BubbleAddProps & { host: HTMLElement }) {
  return createPortal(<BubbleAddButton {...props} />, host);
}
