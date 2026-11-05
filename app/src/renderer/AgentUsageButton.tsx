import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { Popover } from "radix-ui";
import { CircleAlert, RotateCw, Settings } from "lucide-react";
import type { UsageEntry } from "../main/agentAuth/usageTypes";
import { usageDescription } from "./agentUsage";
import { foldedRing, ringViews, rowView, shownUsage, usageBusy, usageFolds, type RingView, type RowView } from "./agentUsageView";
import type { CanvasPress } from "./ComposerParts";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

export interface UsageViewProps {
  rings: RingView[]; folded: boolean; description: string; descriptionId: string; titleId: string; open: boolean; rows: RowView[]; busy: boolean;
  buttonRef(node: HTMLButtonElement | null): void; listRef(node: HTMLUListElement | null): void;
  onOpenChange(open: boolean): void; onRefresh(): void; onSettings(): void; onOpenAutoFocus(event: Event): void; onCloseAutoFocus(event: Event): void;
}

function Ring({ ring }: { ring: RingView }) {
  return <span className="usage-ring" data-provider={ring.provider} data-band={ring.full ? "full" : undefined}>
    {/* The arc starts at 12 o'clock and runs clockwise; pathLength 100 lets the dash be the percentage. */}
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true"><circle className="track" cx="12" cy="12" r="11" />
      {ring.value !== null && <circle className="value" cx="12" cy="12" r="11" pathLength="100" strokeDasharray={`${ring.value} 100`} />}</svg>
    {ring.logo && <img className="usage-logo" src={ring.logo} alt="" />}
  </span>;
}

function IconTip({ label, children }: { label: string; children: ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

function Row({ row }: { row: RowView }) {
  return <li className="usage-row" data-provider={row.provider}>
    <div className="usage-row-head"><img className="logo" src={row.logo} alt="" /><span className="usage-name">{row.name}</span>{row.read && <span className="usage-read">{row.read}</span>}</div>
    <div className="usage-row-body">
      {row.windows.map(window => <div key={window.id} className="usage-window" data-limited={window.limited ? "" : undefined}>
        <div className="usage-window-line"><span className="usage-window-label">{window.label}</span><span className="usage-window-text">{window.text}</span></div>
        <span className="usage-bar" data-band={window.full ? "full" : undefined} aria-hidden="true">{window.bar !== null && <i style={{ width: `${window.bar}%` }} />}</span>
      </div>)}
      {row.note && <p className="usage-note" data-kind={row.note.kind}>{row.note.kind && <CircleAlert aria-hidden="true" />}<span>{row.note.text}</span></p>}
    </div>
  </li>;
}

// The popover body (draft frame 03). Agent settings and Refresh usage come after the list so Tab goes body →
// Agent settings → Refresh usage; the grid draws them back in the title row.
export function UsagePanel({ titleId, rows, busy, listRef, onRefresh, onSettings }: Pick<UsageViewProps, "titleId" | "rows" | "busy" | "listRef" | "onRefresh" | "onSettings">) {
  return <>
    <h2 className="usage-pop-title" id={titleId}>Agent usage</h2>
    <ul className="usage-list" tabIndex={-1} ref={listRef}>{rows.map(row => <Row key={row.provider} row={row} />)}</ul>
    <IconTip label="Agent settings"><button type="button" className="doan-icon-button usage-settings" aria-label="Agent settings" onClick={onSettings}><Settings aria-hidden="true" /></button></IconTip>
    {/* It stays enabled while reading: a provider already reading joins that read in main. */}
    <IconTip label="Refresh usage"><button type="button" className="doan-icon-button usage-refresh" aria-label="Refresh usage" aria-busy={busy || undefined} onClick={onRefresh}>
      {busy ? <span className="doan-spinner" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}</button></IconTip>
  </>;
}

// The header button and its non-modal popover, drawn from state (design §4, draft frames place-header and ring-states).
export function UsageView(props: UsageViewProps) {
  const { rings, folded, description, descriptionId, open } = props;
  const fold = folded ? foldedRing(rings) : null;
  return <Popover.Root open={open} onOpenChange={props.onOpenChange}>
    <IconTip label="Agent usage"><Popover.Trigger asChild><button ref={props.buttonRef} type="button" className="usage" aria-label="Agent usage" aria-haspopup="dialog" aria-expanded={open} aria-describedby={descriptionId}>
      {fold ? <><Ring ring={fold.ring} /><span className="usage-more" aria-hidden="true">+{fold.more}</span></> : rings.map(ring => <Ring key={ring.provider} ring={ring} />)}
    </button></Popover.Trigger></IconTip>
    <span className="sr-only" id={descriptionId}>{description}</span>
    <Popover.Portal><Popover.Content className="doan-floating doan-popover doan-scroll usage-pop" aria-labelledby={props.titleId} side="bottom" align="end" sideOffset={4} collisionPadding={8}
      onOpenAutoFocus={props.onOpenAutoFocus} onCloseAutoFocus={props.onCloseAutoFocus}>
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
export function AgentUsageButton({ openSettings, canvasPress }: { openSettings(): void; canvasPress?: CanvasPress | undefined }) {
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const [free, setFree] = useState(Infinity);
  const header = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLUListElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  // Set when the popover closed for a reason that put focus elsewhere: Radix must not move it back to the button.
  const keepFocus = useRef(false);
  const buttonRef = useRef((node: HTMLButtonElement | null) => {
    observer.current?.disconnect(); observer.current = null;
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
  const read = (trigger: "open" | "refresh") => { void window.doan.readAgentUsage(trigger).catch(() => {}); };
  return <UsageView rings={ringViews(shown, now)} folded={usageFolds(free, shown.length)} description={usageDescription(shown, now)} descriptionId={descriptionId} titleId={titleId}
    open={open} rows={shown.map(entry => rowView(entry, now))} busy={usageBusy(shown)} buttonRef={buttonRef} listRef={listRef}
    onOpenChange={next => { setOpen(next); if (next) { keepFocus.current = false; read("open"); } }}
    onRefresh={() => read("refresh")}
    onSettings={() => { keepFocus.current = true; setOpen(false); openSettings(); }}
    onOpenAutoFocus={event => { event.preventDefault(); list.current?.focus(); }}
    onCloseAutoFocus={event => { if (keepFocus.current) { keepFocus.current = false; event.preventDefault(); } }} />;
}
