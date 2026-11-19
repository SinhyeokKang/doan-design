import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { BubbleItem } from "./bubbleItems";
import { INSPECTOR_PANEL_ID } from "./InspectorPanel";
import { Crosshair, SlidersHorizontal } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

// Add to message in the size bubble (PRODUCT §5 item 6). The bubble is the controller's DOM; it hands App a
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
      <button ref={button} type="button" className="doan-icon-button bubble-button" data-ui-size="xs" data-bubble-action="add" aria-label="Add to message"
        {...(enabled ? {} : { "aria-disabled": true, "aria-describedby": REASON_ID })}><Crosshair aria-hidden="true" /></button>
    </TooltipTrigger><TooltipContent onEscapeKeyDown={onEscape}>{enabled ? "Add to message" : reason ?? "Add to message"}</TooltipContent></Tooltip>
    {!enabled && <span className="sr-only" id={REASON_ID}>{reason ?? "Add to message"}</span>}
  </>;
}

interface BubbleInspectProps {
  button: RefObject<HTMLButtonElement | null>;
  focused(node: Element): void;
  disabled: string | undefined;
  onEscape(event: KeyboardEvent): void;
}

export function BubbleInspectButton({ button, focused, disabled, onEscape }: BubbleInspectProps) {
  const reasonId = "canvas-bubble-inspect-reason";
  return <>
    <Tooltip><TooltipTrigger asChild>
      <button ref={button} type="button" className="doan-icon-button bubble-button" data-ui-size="xs" data-bubble-action="inspect"
        aria-label="Show inspector" aria-expanded={false} aria-controls={INSPECTOR_PANEL_ID} onFocus={event => focused(event.currentTarget)}
        {...(disabled === undefined ? {} : { "aria-disabled": true, "aria-describedby": reasonId })}><SlidersHorizontal aria-hidden="true" /></button>
    </TooltipTrigger><TooltipContent onEscapeKeyDown={onEscape}>{disabled ?? "Show inspector"}</TooltipContent></Tooltip>
    {disabled !== undefined && <span className="sr-only" id={reasonId}>{disabled}</span>}
  </>;
}

export function BubbleAdd({ host, items, inspectButton, focused, ...props }: BubbleAddProps & {
  host: HTMLElement; items: BubbleItem[]; inspectButton: RefObject<HTMLButtonElement | null>; focused(node: Element): void;
}) {
  return createPortal(items.map(item => {
    if (item.kind === "add") return <BubbleAddButton key="add" {...props} />;
    if (item.kind === "inspect") return <BubbleInspectButton key="inspect" button={inspectButton} focused={focused} disabled={item.disabled} onEscape={props.onEscape} />;
    return null;
  }), host);
}
