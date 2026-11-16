import { useRef, useState, type ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

// A name cut short by an ellipsis: the trigger itself or a box inside it is wider than it shows. Read when the
// tooltip would open, so a resize between hovers counts. SVG icons have no widths and never count.
export function isCut(node: Element | null): boolean {
  if (!node) return false;
  const over = (box: Element) => box.scrollWidth > box.clientWidth;
  return over(node) || [...node.querySelectorAll("*")].some(over);
}

// DESIGN 'Tooltip': a name shows in full in the shared tooltip only while it is cut. The open state is the person's
// hover or focus checked against the cut at that moment, never `hover && cut` (a hover kept from before would reopen
// it with nobody pointing: POSTMORTEM 2026-11-01 'A frame drawer list closed by a disabled trigger reopened by itself').
// Inside a modal dialog the capsule is portalled into it, or it would be drawn under the dialog's top layer.
export function NameTip({ text, side, children }: { text: string; side?: "top" | "bottom"; children: ReactElement }) {
  const [tip, setTip] = useState<{ container: Element | undefined } | null>(null);
  // Radix types the trigger as a button; asChild hands the ref to whatever element the name is.
  const node = useRef<HTMLButtonElement | null>(null);
  return <Tooltip open={tip !== null} onOpenChange={open => setTip(open && isCut(node.current) ? { container: node.current?.closest("dialog") ?? undefined } : null)}>
    <TooltipTrigger asChild ref={node}>{children}</TooltipTrigger>
    <TooltipContent side={side} container={tip?.container}>{text}</TooltipContent>
  </Tooltip>;
}
