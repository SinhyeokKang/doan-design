import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement, type ReactNode } from "react";
import { PanelRightClose } from "lucide-react";
import { nudgePanel, type PanelBounds } from "./rightPanelSize";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

// The id the open and close buttons point at with aria-controls.
export const CONVERSATION_PANEL_ID = "doan-conversation-panel";

// The handle sits on the panel's start (left) edge: moving it left widens the panel. On the sidebar's end edge moving
// it right widens. A drag stops at the bounds; it never folds the panel (only the close button does).
export function dragPanel(start: number, startX: number, x: number, bounds: PanelBounds, edge: "start" | "end" = "start"): number {
  return Math.min(bounds.max, Math.max(bounds.min, start + (edge === "start" ? startX - x : x - startX)));
}

// The canvas page's right column (buzz-canvas design §2 '오른쪽 패널'): the canvas conversation panel shell, its title row
// reused from the Overview's right panel, and the resize handle on its left edge. The canvas conversation fills it:
// `title` is its conversation menu, `children` its thread and composer (buzz-canvas-conversation design §2); with no
// canvas shown the shell keeps its own title and empty line. While folded the column stays in the DOM, out of the Tab
// order, so the open button's aria-controls resolves.
// `width` is the width shown; `onResize` commits a width (undefined: the window-relative default) and `preview` shows
// one while a drag is still going, without a commit.
export function ConversationPanel({ open, width, bounds, onHide, onResize, preview, title, children }: {
  open: boolean; width: number; bounds: PanelBounds; onHide(): void; onResize(width: number | undefined): void; preview(width: number): void;
  title?: ReactNode; children?: ReactNode;
}) {
  return <div className="doan-conv-column" data-collapsed={open ? undefined : ""} inert={!open}>
    <ResizeHandle width={width} bounds={bounds} onResize={onResize} preview={preview} />
    <aside className="right ov-right doan-conv-panel" id={CONVERSATION_PANEL_ID} role="region" aria-label="Conversation">
      <div className="doan-conv-head">
        {title ?? <h2 className="phead rp-head" tabIndex={-1}>Conversation</h2>}
        <IconTip label="Hide conversation"><button type="button" className="doan-icon-button doan-panel-hide" aria-label="Hide conversation" aria-expanded={open} aria-controls={CONVERSATION_PANEL_ID} onClick={onHide}><PanelRightClose aria-hidden="true" /></button></IconTip>
      </div>
      <div className="doan-conv-body">{children ?? <p className="doan-conv-empty">Conversations about this canvas will show here.</p>}</div>
    </aside>
  </div>;
}

function IconTip({ label, children }: { label: string; children: ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

// Written by hand, not react-resizable-panels (design §1): its state attribute, keyboard step, Home/End direction and
// percentage units differ from the design, and it needs the shell grid rebuilt as its Group. The look follows malmoi
// components/ui/resizable.tsx (malmoi 6dcdd575): a 4px bar shown only on hover, drag and keyboard focus. The sidebar
// uses the same handle on its end edge.
export function ResizeHandle({ width, bounds, onResize, preview, edge = "start", label = "Resize conversation panel", className }: {
  width: number; bounds: PanelBounds; onResize(width: number | undefined): void; preview(width: number): void;
  edge?: "start" | "end"; label?: string; className?: string;
}) {
  const [hover, setHover] = useState(false);
  // The drag's start and the width it shows now; the width is committed once, when the drag ends.
  const [drag, setDrag] = useState<{ pointer: number; startX: number; start: number; now: number } | null>(null);
  const dragRef = useRef(drag); dragRef.current = drag;
  const handle = useRef<HTMLDivElement>(null);

  const end = (commit: boolean) => {
    const current = dragRef.current;
    if (!current) return;
    dragRef.current = null; setDrag(null);
    if (handle.current?.hasPointerCapture(current.pointer)) handle.current.releasePointerCapture(current.pointer);
    if (commit && current.now !== current.start) onResize(current.now);
    else preview(current.start);
  };
  // Esc during a drag puts the start width back; taken in the capture phase so the canvas keeps its selection.
  useEffect(() => {
    if (!drag) return;
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      end(false);
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, [drag !== null]);

  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { pointer: event.pointerId, startX: event.clientX, start: width, now: width };
    dragRef.current = next; setDrag(next);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointer) return;
    const now = dragPanel(current.start, current.startX, event.clientX, bounds, edge);
    if (now === current.now) return;
    const next = { ...current, now };
    dragRef.current = next; setDrag(next);
    preview(now);
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (dragRef.current) return;
    const next = nudgePanel(width, event.key, bounds, edge);
    if (next === null) return;
    event.preventDefault();
    if (next !== width) onResize(next);
  };

  const shown = drag?.now ?? width;
  return <>
    <div ref={handle} className={className ? `doan-panel-handle ${className}` : "doan-panel-handle"} role="separator" aria-orientation="vertical" aria-label={label}
      aria-valuenow={shown} aria-valuemin={bounds.min} aria-valuemax={bounds.max} tabIndex={0}
      data-ui-state={drag ? "drag" : hover ? "hover" : undefined}
      onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      onPointerDown={down} onPointerMove={move} onPointerUp={() => end(true)} onPointerCancel={() => end(true)} onLostPointerCapture={() => end(true)}
      onDoubleClick={() => onResize(undefined)} onKeyDown={key} />
    {/* Over the whole window while dragging: the canvas iframe cannot take the pointer, and the cursor stays. */}
    {drag && <div className="doan-resize-cover" aria-hidden="true" />}
  </>;
}
