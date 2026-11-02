import type { KeyboardEvent } from "react";
import { Hand, MessageSquarePlus, MousePointer2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import type { CanvasTool } from "./canvasTool";

// ←/→ walk the tools; Tab stops on the toolbar once, so tools added later keep the page's Tab order.
function moveBetweenTools(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const tools = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
  const next = tools[tools.indexOf(document.activeElement as HTMLButtonElement) + (event.key === "ArrowRight" ? 1 : -1)];
  if (next) { event.preventDefault(); next.focus(); }
}

const TOOLS: readonly { tool: CanvasTool; label: string; key: string; Icon: typeof Hand }[] = [
  { tool: "select", label: "Select", key: "V", Icon: MousePointer2 },
  { tool: "hand", label: "Hand", key: "H", Icon: Hand },
];

// The bottom tools row (buzz-canvas design §2 '도구모음', canvas-hand-tool design '도구모음'). Select and Hand are
// pressed one at a time; pressing the pressed one keeps it. The pressed tool holds the toolbar's one Tab stop. In
// Hand a canvas click does not select, so the pressed button is what tells the person why.
// Add to conversation (buzz-canvas-conversation design §2): the selection's chip goes into the panel's composer.
// aria-disabled, not disabled, so its reason shows as a tooltip; `reason` is null when only the selection is missing.
export interface AddTool { enabled: boolean; reason: string | null; onAdd(): void }
export function CanvasTools({ tool, onTool, add }: { tool: CanvasTool; onTool(tool: CanvasTool): void; add: AddTool }) {
  return <div className="doan-floating doan-canvas-tools" role="toolbar" aria-label="Canvas tools" onKeyDown={moveBetweenTools}>
    {TOOLS.map(({ tool: own, label, key, Icon }) => <Tooltip key={own}><TooltipTrigger asChild>
      <button type="button" className="doan-icon-button doan-canvas-tool" data-ui-size="md" aria-pressed={tool === own} aria-label={label} aria-keyshortcuts={key}
        tabIndex={tool === own ? 0 : -1} onClick={() => onTool(own)}><Icon aria-hidden="true" /></button>
    </TooltipTrigger><TooltipContent className="has-key">{label}<span className="doan-kbd" data-ui-variant="on-prominent" data-ui-size="sm">{key}</span></TooltipContent></Tooltip>)}
    <Tooltip><TooltipTrigger asChild>
      <button type="button" className="doan-icon-button doan-canvas-tool" data-ui-size="md" aria-label="Add to conversation" aria-disabled={!add.enabled || undefined} tabIndex={-1}
        onClick={() => { if (add.enabled) add.onAdd(); }}><MessageSquarePlus aria-hidden="true" /></button>
    </TooltipTrigger><TooltipContent>{!add.enabled && add.reason ? add.reason : "Add to conversation"}</TooltipContent></Tooltip>
  </div>;
}
