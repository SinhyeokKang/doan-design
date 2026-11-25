import { useRef, useState, type ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

// A name cut short by an ellipsis: the trigger itself or a box inside it is wider than it shows. Read when the
// tooltip would open, so a resize between hovers counts. SVG icons have no widths and never count.
export function isCut(node: Element | null): boolean {
  if (!node) return false;
  const over = (box: Element) => box.scrollWidth > box.clientWidth;
  return over(node) || [...node.querySelectorAll("*")].some(over);
}

// The open state is hover or focus checked against the cut at that moment, never `hover && cut`, which would reopen it with
// nobody pointing (POSTMORTEM 2026-11-01). In a modal dialog the capsule is portalled into it, above the top layer.
export function NameTip({ text, side, onEscape, children }: { text: string; side?: "top" | "bottom"; onEscape?: (event: KeyboardEvent) => void; children: ReactElement }) {
  const [tip, setTip] = useState<{ container: Element | undefined } | null>(null);
  // Radix types the trigger as a button; asChild hands the ref to whatever element the name is.
  const node = useRef<HTMLButtonElement | null>(null);
  return <Tooltip open={tip !== null} onOpenChange={open => setTip(open && isCut(node.current) ? { container: node.current?.closest("dialog") ?? undefined } : null)}>
    <TooltipTrigger asChild ref={node}>{children}</TooltipTrigger>
    <TooltipContent side={side} container={tip?.container} {...(onEscape ? { onEscapeKeyDown: onEscape } : {})}>{text}</TooltipContent>
  </Tooltip>;
}
