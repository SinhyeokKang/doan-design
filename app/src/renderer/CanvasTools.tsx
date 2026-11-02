import type { KeyboardEvent } from "react";
import { MessageSquarePlus, MousePointer2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

// ←/→ walk the tools; Tab stops on the toolbar once, so tools added later keep the page's Tab order.
function moveBetweenTools(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const tools = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
  const next = tools[tools.indexOf(document.activeElement as HTMLButtonElement) + (event.key === "ArrowRight" ? 1 : -1)];
  if (next) { event.preventDefault(); next.focus(); }
}

// The bottom tools row (buzz-canvas design §2 '도구모음'). The Select picker is the default tool, shown pressed; it is
// not a mode, so pressing it changes nothing and a canvas click always selects.
// Add to conversation (buzz-canvas-conversation design §2): the selection's chip goes into the panel's composer.
// aria-disabled, not disabled, so its reason shows as a tooltip; `reason` is null when only the selection is missing.
export interface AddTool { enabled: boolean; reason: string | null; onAdd(): void }
export function CanvasTools({ add }: { add: AddTool }) {
  return <div className="doan-floating doan-canvas-tools" role="toolbar" aria-label="Canvas tools" onKeyDown={moveBetweenTools}>
    <Tooltip><TooltipTrigger asChild>
      <button type="button" className="doan-icon-button doan-canvas-tool" data-ui-size="md" aria-pressed={true} aria-label="Select" tabIndex={0}><MousePointer2 aria-hidden="true" /></button>
    </TooltipTrigger><TooltipContent>Select</TooltipContent></Tooltip>
    <Tooltip><TooltipTrigger asChild>
      <button type="button" className="doan-icon-button doan-canvas-tool" data-ui-size="md" aria-label="Add to conversation" aria-disabled={!add.enabled || undefined} tabIndex={-1}
        onClick={() => { if (add.enabled) add.onAdd(); }}><MessageSquarePlus aria-hidden="true" /></button>
    </TooltipTrigger><TooltipContent>{!add.enabled && add.reason ? add.reason : "Add to conversation"}</TooltipContent></Tooltip>
  </div>;
}
