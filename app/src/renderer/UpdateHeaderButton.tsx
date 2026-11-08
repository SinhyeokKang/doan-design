import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Popover } from "radix-ui";
import { CircleFadingArrowUp } from "lucide-react";
import type { UpdateSnapshot } from "../main/update/types";
import { UPDATE_BLOCKED, updateView, type UpdateHeaderView, type UpdateNotice } from "../main/update/view";
import type { CanvasPress } from "./ComposerParts";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { useHeaderNoDrag } from "./headerNoDrag";

export interface UpdateHeaderButtonViewProps {
  header: UpdateHeaderView | null; disabled: boolean; open: boolean; shown: UpdateNotice | null; descriptionId: string; titleId: string;
  buttonRef(node: HTMLButtonElement | null): void; contentRef(node: HTMLDivElement | null): void;
  onPress(): void; onOpenChange(open: boolean): void; onOpenAutoFocus(event: Event): void; onCloseAutoFocus(event: Event): void;
  onFocusOutside(event: FocusOutsideEvent): void;
}
type FocusOutsideEvent = Parameters<NonNullable<Popover.PopoverContentProps["onFocusOutside"]>>[0];

// The anchor stays in the header while there is no update, empty and not displayed, so Agent usage's fold can watch
// its size and re-measure when the button appears or goes.
export function UpdateHeaderButtonView(props: UpdateHeaderButtonViewProps) {
  const { header, disabled, open, shown, descriptionId, titleId } = props;
  if (header === null) return <span className="update-anchor" />;
  // Only a press that can answer with a popover (a blocked gate) says it has one; a stopped restart's press restarts.
  const popup = header.popover === UPDATE_BLOCKED || shown !== null ? { "aria-haspopup": "dialog" as const, "aria-expanded": open } : {};
  return <span className="update-anchor"><Popover.Root open={open && shown !== null} onOpenChange={props.onOpenChange}>
    <Tooltip><TooltipTrigger asChild><Popover.Anchor asChild><button ref={props.buttonRef} type="button" className="doan-button update-indicator" data-ui-variant="subtle" data-ui-size="sm"
        disabled={disabled || header.busy} {...popup} aria-describedby={descriptionId} onClick={props.onPress}>
        {header.busy ? <span className="doan-spinner" aria-hidden="true" /> : <CircleFadingArrowUp aria-hidden="true" />}{header.label}</button></Popover.Anchor></TooltipTrigger>
      <TooltipContent side="bottom">{header.tooltip}</TooltipContent></Tooltip>
    <span className="sr-only" id={descriptionId}>{header.tooltip}</span>
    {shown !== null && <Popover.Portal><Popover.Content ref={props.contentRef} className="doan-floating doan-popover update-pop" role="dialog" aria-labelledby={titleId} side="bottom" align="end" sideOffset={4} collisionPadding={8}
      onOpenAutoFocus={props.onOpenAutoFocus} onCloseAutoFocus={props.onCloseAutoFocus} onFocusOutside={props.onFocusOutside}>
      {/* The words follow each push while open; one polite region reads a change once without moving focus. */}
      <div className="update-pop-live" aria-live="polite">
        <p className="update-pop-title" id={titleId}>{shown.title}</p>
        <p className="update-pop-text">{shown.text}</p>
      </div>
    </Popover.Content></Popover.Portal>}
  </Popover.Root></span>;
}

// The header's Restart to Update (PRODUCT §5 item 0), at its right end while a downloaded update waits. A press asks
// main to restart, which reads the gate at that moment; a blocked answer, the Doan menu's blocked Restart to Update and
// a restart that stopped open the popover under it. `disabled`: a locked page, a modal or first run.
export function UpdateHeaderButton({ disabled, canvasPress }: { disabled: boolean; canvasPress?: CanvasPress | undefined }) {
  const [snapshot, setSnapshot] = useState<UpdateSnapshot | null>(null);
  const [shown, setShown] = useState<UpdateNotice | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  // A popover the person did not open by pressing leaves focus where it is.
  const quiet = useRef(false);
  // The running restart was started by a press on this button (answered allowed): its stop or hold is the answer to
  // that press, so the popover takes focus. One started from the menu or About opens quietly.
  const pressedRestart = useRef(false);
  const descriptionId = useId(), titleId = useId();
  // The menu's popover can come right after a push, before the render that push asked for.
  const latest = useRef<UpdateSnapshot | null>(null);
  const header = snapshot === null ? null : updateView(snapshot, Date.now()).header;
  // Every screen draws its own header and the hidden ones stay mounted under [inert]. Only the shown one opens a
  // popover nobody pressed for: two open at once each close the other (the first one's focus is outside the second).
  const shownHeader = () => button.current !== null && button.current.closest("[inert]") === null;
  const open = (notice: UpdateNotice, focus: boolean) => { quiet.current = !focus; setShown(notice); };
  useEffect(() => {
    let previous: UpdateSnapshot["state"]["kind"] | null = null;
    return window.doan.onUpdate(next => {
      // An open popover says what the gate says now. Only a push moves it: a press answered blocked can arrive before
      // the push that carries the gate, and its words hold until then.
      const view = updateView(next, Date.now()).header;
      setShown(current => current === null ? null : view?.opened ?? null);
      // Only a restart seen stopping, or held back by a conversation that started while main waited to install,
      // opens on its own; a renderer that loads into either state does not.
      if (previous === "restarting" && (next.state.kind === "restartAborted" || next.state.kind === "ready" && next.gate.kind === "blocked")) {
        if (view?.popover && shownHeader()) open(view.popover, pressedRestart.current);
      }
      if (next.state.kind !== "restarting") pressedRestart.current = false;
      previous = next.state.kind;
      latest.current = next;
      setSnapshot(next);
    });
  }, []);
  // Main has already shown the window.
  useEffect(() => window.doan.onUpdatePopover(() => {
    const now = latest.current === null ? null : updateView(latest.current, Date.now()).header;
    if (now !== null && !now.busy && shownHeader()) open(UPDATE_BLOCKED, true);
  }), []);
  // Restarting or no update: nothing to explain.
  const closed = header === null || header.busy;
  useEffect(() => { if (closed) setShown(null); }, [closed]);
  const isOpen = shown !== null && !closed;
  // While open the header takes presses, so a press in its empty part closes the popover.
  useHeaderNoDrag(isOpen, button);
  // A press in the canvas iframe never reaches the app's document, so Radix cannot see it as an outside press.
  useEffect(() => {
    if (!isOpen || !canvasPress) return;
    return canvasPress(() => flushSync(() => setShown(null)));
  }, [isOpen, canvasPress]);
  const press = () => {
    if (disabled || header === null || header.busy) return;
    void window.doan.installUpdate().catch(() => null).then(reply => {
      if (reply?.kind === "blocked") open(UPDATE_BLOCKED, true);
      else if (reply?.kind === "allowed") pressedRestart.current = true;
    });
  };
  return <UpdateHeaderButtonView header={header} disabled={disabled} open={isOpen} shown={isOpen ? shown : null} descriptionId={descriptionId} titleId={titleId}
    buttonRef={node => { button.current = node; }}
    contentRef={node => { content.current = node; }}
    onPress={press}
    onOpenChange={next => { if (!next) setShown(null); }}
    onOpenAutoFocus={event => { if (quiet.current) event.preventDefault(); }}
    // Radix closes on any focus outside, also one that moved between two places outside a popover opened quietly.
    // Agent usage's popover, open beside it, moves focus to the page tab when its last provider leaves (PRODUCT §5 item 0
    // 'Agent usage'); this one stays (§5 item 0 'Updates': closing one keeps the other usable). Focus leaving it closes it.
    onFocusOutside={event => {
      // focusin's relatedTarget: the element that lost focus, null from nowhere (a removed element, the body).
      const from = event.detail.originalEvent.relatedTarget as Node | null;
      if (from === null || content.current?.contains(from) !== true) event.preventDefault();
    }}
    onCloseAutoFocus={event => {
      // A popover anchored rather than triggered has no trigger to return focus to, so a press on a blank part of
      // the window would leave it on <body>.
      event.preventDefault();
      const active = document.activeElement;
      if (active === null || active === document.body) button.current?.focus();
    }} />;
}
