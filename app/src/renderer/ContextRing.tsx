import { contextText, type ContextUsage } from "./contextWindow";
import { ProgressRing, ringDanger } from "./ProgressRing";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

// The docked composer's context ring (context-window-ring design §3, draft frames ring-states and ring-tooltip): no
// text in it, a name and description for assistive tech, and the same two lines in the shared tooltip. Nothing opens
// on a press and it takes no focus, so its trigger is a span (CanvasAgent's sibling notice is the precedent).
export function ContextRing({ usage }: { usage: ContextUsage }) {
  const { label, tokens } = contextText(usage);
  return <Tooltip><TooltipTrigger asChild>
    <ProgressRing className="context-ring" role="img" aria-label={label} aria-description={tokens} value={usage.value} danger={ringDanger(usage.percent)} r={10.5} stroke={3} />
  </TooltipTrigger><TooltipContent><span className="tip-line">{label}</span><span className="tip-line">{tokens}</span></TooltipContent></Tooltip>;
}
