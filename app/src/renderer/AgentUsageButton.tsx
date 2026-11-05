import { useEffect, useId, useRef, useState, type FocusEvent, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { Popover } from "radix-ui";
import { RotateCw, Settings } from "lucide-react";
import type { UsageEntry } from "../main/agentAuth/usageTypes";
import { AlertIcon } from "./AlertIcon";
import { usageDescription } from "./agentUsage";
import { foldedRing, ringViews, rowView, shownUsage, usageBusy, usageFolds, type RingView, type RowView } from "./agentUsageView";
import type { CanvasPress } from "./ComposerParts";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

export interface UsageViewProps {
  rings: RingView[]; folded: boolean; description: string; descriptionId: string; titleId: string; open: boolean; rows: RowView[]; busy: boolean;
  buttonRef(node: HTMLButtonElement | null): void; listRef(node: HTMLUListElement | null): void;
  onOpenChange(open: boolean): void; onRefresh(): void; onSettings(): void; onOpenAutoFocus(event: Event): void; onCloseAutoFocus(event: Event): void;
  onPointerDownOutside(): void; onButtonFocus(event: FocusEvent<HTMLButtonElement>): void;
}

function Ring({ ring }: { ring: RingView }) {
  return <span className="usage-ring" data-provider={ring.provider} data-band={ring.full ? "full" : undefined}>
    {/* The arc starts at 12 o'clock and runs clockwise; pathLength 100 lets the dash be the percentage. */}
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true"><circle className="track" cx="12" cy="12" r="11" />
      {ring.value !== null && <circle className="value" cx="12" cy="12" r="11" pathLength="100" strokeDasharray={`${ring.value} 100`} />}</svg>
    {ring.logo && <img className="usage-logo" src={ring.logo} alt="" />}
  </span>;
}

// Below the button: the shared tooltip's default side (above) put the popover's tooltips over the header button.
// onEscape: a focused title-row button's tooltip is the top dismissable layer, so without it the first Escape closed
// only the tooltip and the popover needed a second one.
function IconTip({ label, onEscape, children }: { label: string; onEscape?(): void; children: ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side="bottom" onEscapeKeyDown={onEscape}>{label}</TooltipContent></Tooltip>;
}

function Row({ row }: { row: RowView }) {
  return <li className="usage-row" data-provider={row.provider}>
    <div className="usage-row-head"><img className="logo" src={row.logo} alt="" /><span className="usage-name">{row.name}</span>{row.read && <span className="usage-read">{row.read}</span>}</div>
    <div className="usage-row-body">
      {row.windows.map(window => <div key={window.id} className="usage-window" data-limited={window.limited ? "" : undefined}>
        <div className="usage-window-line"><span className="usage-window-label">{window.label}</span><span className="usage-window-text">{window.text}</span></div>
        <span className="usage-bar" data-band={window.full ? "full" : undefined} aria-hidden="true">{window.bar !== null && <i style={{ width: `${window.bar}%` }} />}</span>
      </div>)}
      {row.note && <p className="usage-note" data-kind={row.note.kind}>{row.note.kind && <AlertIcon />}<span>{row.note.text}</span></p>}
    </div>
  </li>;
}

// The popover body (draft frame 03). Agent settings and Refresh usage come after the list so Tab goes body →
// Agent settings → Refresh usage; the grid draws them back in the title row.
export function UsagePanel({ titleId, rows, busy, listRef, onRefresh, onSettings, onOpenChange }: Pick<UsageViewProps, "titleId" | "rows" | "busy" | "listRef" | "onRefresh" | "onSettings" | "onOpenChange">) {
  const close = () => onOpenChange(false);
  return <>
    <h2 className="usage-pop-title" id={titleId}>Agent usage</h2>
    <ul className="usage-list" tabIndex={-1} ref={listRef}>{rows.map(row => <Row key={row.provider} row={row} />)}</ul>
    <IconTip label="Agent settings" onEscape={close}><button type="button" className="doan-icon-button usage-settings" aria-label="Agent settings" onClick={onSettings}><Settings aria-hidden="true" /></button></IconTip>
    {/* It stays enabled while reading: a provider already reading joins that read in main. */}
    <IconTip label="Refresh usage" onEscape={close}><button type="button" className="doan-icon-button usage-refresh" aria-label="Refresh usage" aria-busy={busy || undefined} onClick={onRefresh}>
      {busy ? <span className="doan-spinner" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}</button></IconTip>
  </>;
}

// The header button and its non-modal popover, drawn from state (design §4, draft frames place-header and ring-states).
export function UsageView(props: UsageViewProps) {
  const { rings, folded, description, descriptionId, open } = props;
  const fold = folded ? foldedRing(rings) : null;
  return <Popover.Root open={open} onOpenChange={props.onOpenChange}>
    <IconTip label="Agent usage"><Popover.Trigger asChild><button ref={props.buttonRef} type="button" className="usage" aria-label="Agent usage" aria-haspopup="dialog" aria-expanded={open} aria-describedby={descriptionId} onFocus={props.onButtonFocus}>
      {fold ? <><Ring ring={fold.ring} /><span className="usage-more" aria-hidden="true">+{fold.more}</span></> : rings.map(ring => <Ring key={ring.provider} ring={ring} />)}
    </button></Popover.Trigger></IconTip>
    <span className="sr-only" id={descriptionId}>{description}</span>
    <Popover.Portal><Popover.Content className="doan-floating doan-popover doan-scroll usage-pop" aria-labelledby={props.titleId} side="bottom" align="end" sideOffset={4} collisionPadding={8}
      onOpenAutoFocus={props.onOpenAutoFocus} onCloseAutoFocus={props.onCloseAutoFocus} onPointerDownOutside={props.onPointerDownOutside}>
      <UsagePanel {...props} />
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

// The free width between the centred tabs and the header's right padding, where the button sits.
function freeEnd(header: HTMLElement): number {
  const modes = header.querySelector(".shell-modes");
  if (!modes) return Infinity;
  return header.getBoundingClientRect().right - parseFloat(getComputedStyle(header).paddingRight) - modes.getBoundingClientRect().right;
}

// Agent usage at the header's right end on every screen. Each header holds its own button; main is the source of
// the entries, and opening or Refresh usage only asks it to read.
// openSettings answers whether it went to Settings: a locked page stays, and focus then returns to the button.
export function AgentUsageButton({ openSettings, canvasPress }: { openSettings(): boolean; canvasPress?: CanvasPress | undefined }) {
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const [free, setFree] = useState(Infinity);
  const header = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLUListElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  // Set when the popover closed for a reason that put focus elsewhere: Radix must not move it back to the button.
  const keepFocus = useRef(false);
  // pressedOutside marks a close by a pointer press; quietFocus then keeps the focus handed back from opening the
  // button's tooltip, which a pointer user did not ask for (it stayed under the button). Escape's return keeps it.
  const pressedOutside = useRef(false), quietFocus = useRef(false);
  const buttonRef = useRef((node: HTMLButtonElement | null) => {
    observer.current?.disconnect(); observer.current = null;
    button.current = node;
    if (!node) return;
    const bar = node.closest("header");
    if (!bar) return;
    // Kept after the button goes, so the last provider leaving can hand focus to the header's current tab.
    header.current = bar;
    const measure = () => setFree(freeEnd(bar));
    measure();
    observer.current = new ResizeObserver(measure);
    observer.current.observe(bar);
  }).current;
  const listRef = useRef((node: HTMLUListElement | null) => { list.current = node; }).current;
  const descriptionId = useId(), titleId = useId();
  useEffect(() => window.doan.onAgentUsage(setEntries), []);
  const shown = shownUsage(entries), gone = shown.length === 0;
  // Relative times move on while it is open.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setTick(tick => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, [open]);
  // A window whose reset time passes leaves the ring even while closed. setTimeout overflows past 2^31 − 1 ms (a
  // 30-day window) and would fire at once, so a far reset only redraws early and waits again.
  const nextReset = Math.min(...shown.flatMap(entry => entry.reading?.status === "ok" ? entry.reading.windows.flatMap(w => w.resetsAt !== undefined && w.resetsAt > Date.now() ? [w.resetsAt] : []) : []));
  useEffect(() => {
    if (!Number.isFinite(nextReset)) return;
    const timer = setTimeout(() => setTick(tick => tick + 1), Math.min(nextReset - Date.now(), 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [nextReset]);
  // The last provider signed out under the open popover: the button goes, so focus goes to the current tab.
  useEffect(() => {
    if (!gone || !open) return;
    keepFocus.current = true;
    setOpen(false);
    header.current?.querySelector<HTMLElement>('.shell-modes [aria-current="page"]')?.focus();
  }, [gone, open]);
  // A press in the canvas iframe never reaches the app's document, so Radix cannot see it as an outside press.
  useEffect(() => {
    if (!open || !canvasPress) return;
    return canvasPress(() => { keepFocus.current = true; flushSync(() => setOpen(false)); });
  }, [open, canvasPress]);
  if (gone) return null;
  const now = Date.now();
  // The entries arrive through onAgentUsage; a refused request has nothing to show beyond them.
  const read = (trigger: "open" | "refresh") => { void window.doan.readAgentUsage(trigger).catch(() => {}); };
  return <UsageView rings={ringViews(shown, now)} folded={usageFolds(free, shown.length)} description={usageDescription(shown, now)} descriptionId={descriptionId} titleId={titleId}
    open={open} rows={shown.map(entry => rowView(entry, now))} busy={usageBusy(shown)} buttonRef={buttonRef} listRef={listRef}
    onOpenChange={next => { setOpen(next); if (next) { keepFocus.current = false; pressedOutside.current = false; read("open"); } }}
    onRefresh={() => read("refresh")}
    onSettings={() => { keepFocus.current = openSettings(); setOpen(false); }}
    onOpenAutoFocus={event => { event.preventDefault(); list.current?.focus(); }}
    onCloseAutoFocus={event => {
      event.preventDefault();
      const pressed = pressedOutside.current; pressedOutside.current = false;
      if (keepFocus.current) { keepFocus.current = false; return; }
      // Radix hands focus back only when nothing was pressed outside, so a press on a blank part of the window left
      // it on <body>. This runs a tick after the press: a control the press focused keeps it.
      const active = document.activeElement;
      if (active !== null && active !== document.body) return;
      quietFocus.current = pressed;
      button.current?.focus();
      quietFocus.current = false;
    }}
    onPointerDownOutside={() => { pressedOutside.current = true; }}
    // The tooltip trigger's focus handler runs after this one and skips a prevented event.
    onButtonFocus={event => { if (quietFocus.current) { quietFocus.current = false; event.preventDefault(); } }} />;
}
