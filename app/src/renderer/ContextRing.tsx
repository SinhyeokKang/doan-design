import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { Popover } from "radix-ui";
import { RotateCw } from "lucide-react";
import type { DoanApi } from "../preload";
import type { Provider } from "../main/agentAuth/types";
import type { UsageEntry } from "../main/agentAuth/usageTypes";
import { PROVIDER_NAMES } from "./agentAuthView";
import { UsageRowBody, UsageWindowLine } from "./AgentUsageButton";
import type { CanvasPress } from "./ComposerParts";
import { holdHeaderNoDrag } from "./headerNoDrag";
import { contextDrawerView, drawerCloseFocus, refreshGoneFocus, RING_TIP, ringButton, ringTip, ringTipOpen, type ContextDrawerView } from "./contextDrawer";
import type { ContextUsage } from "./contextWindow";
import { providerLogo } from "./homeComposer";
import { ProgressRing, ringDanger } from "./ProgressRing";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

// hidden: the conversation runs on the person's CLI profile (a legacy external conversation or a resumed terminal
// session), so a Doan connection's usage is not its usage.
export interface RingUsage { entries: readonly UsageEntry[]; hidden: boolean; read(trigger: "open" | "refresh"): void }
const NO_USAGE: RingUsage = { entries: [], hidden: true, read: () => {} };

// The host's subscription: `window.doan` in the main window, the prototype window's preload in its panel. Entries
// arrive through onAgentUsage; a refused read has nothing to show beyond them.
export function useRingUsage(calls: Pick<DoanApi, "onAgentUsage" | "readAgentUsage">, hidden: boolean): RingUsage {
  const [entries, setEntries] = useState<readonly UsageEntry[]>([]);
  // Each host passes one calls object for its life (`window.doan`, or the prototype run's body calls).
  useEffect(() => calls.onAgentUsage(setEntries), [calls]);
  return { entries, hidden, read: trigger => { void calls.readAgentUsage(trigger).catch(() => {}); } };
}

export interface ContextRingViewProps {
  context: ContextUsage; provider: Provider | null; view: ContextDrawerView; open: boolean; tip: boolean; titleId: string;
  buttonRef(node: HTMLButtonElement | null): void; bodyRef(node: HTMLDivElement | null): void; contentRef(node: HTMLDivElement | null): void;
  onOpenChange(open: boolean): void; onTipChange(open: boolean): void; onButtonFocus(event: FocusEvent<HTMLButtonElement>): void;
  onRefresh(): void; onRefreshFocus(focused: boolean): void;
  onOpenAutoFocus(event: Event): void; onCloseAutoFocus(event: Event): void; onEscapeKeyDown(): void; onPointerDownOutside(): void; onFocusOutside(): void;
}

// Refresh's tooltip is the top dismissable layer while Refresh has focus, so its Escape closes the drawer too, or the
// first Escape would close only the tooltip (the header popover's IconTip does the same).
function RefreshTip({ onEscape, children }: { onEscape(): void; children: ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent onEscapeKeyDown={onEscape}>Refresh usage</TooltipContent></Tooltip>;
}

// Refresh comes after the body so Tab goes body → Refresh; the grid draws it at the head's end.
export function ContextDrawerPanel({ provider, view, titleId, bodyRef, onRefresh, onRefreshFocus, onOpenChange }: Pick<ContextRingViewProps, "provider" | "view" | "titleId" | "bodyRef" | "onRefresh" | "onRefreshFocus" | "onOpenChange">) {
  const { usage, busy } = view;
  return <>
    <div className="usage-row-head context-drawer-head">
      {provider && <img className="logo" src={providerLogo(provider)} alt="" />}<span className="usage-name" id={titleId}>{provider ? PROVIDER_NAMES[provider] : "Context window"}</span>
      {usage?.read && <span className="usage-read">{usage.read}</span>}
    </div>
    <div className="usage-row-body context-drawer-body" tabIndex={-1} ref={bodyRef}>
      <UsageWindowLine window={{ ...view.context, limited: false }} />
      {usage && <UsageRowBody row={usage} />}
    </div>
    {/* It stays enabled while reading: a provider already reading joins that read in main. */}
    {usage && <RefreshTip onEscape={() => onOpenChange(false)}><button type="button" className="doan-icon-button context-drawer-refresh" aria-label="Refresh usage" aria-busy={busy || undefined}
      onClick={onRefresh} onFocus={() => onRefreshFocus(true)} onBlur={() => onRefreshFocus(false)}>
      {busy ? <span className="doan-spinner" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}</button></RefreshTip>}
  </>;
}

// The ring is decoration inside the button; the button carries its name and description.
export function ContextRingView(props: ContextRingViewProps) {
  const { context, open } = props;
  // The host draws no tray on a status line, so only a missing value could leave the ring out here.
  const aria = ringButton(context, { statusLine: false, open });
  if (!aria) return null;
  return <Popover.Root open={open} onOpenChange={props.onOpenChange}>
    <Tooltip open={props.tip} onOpenChange={props.onTipChange}><TooltipTrigger asChild><Popover.Trigger asChild>
      <button ref={props.buttonRef} type="button" className="context-ring" {...aria} data-band={ringDanger(context.percent) ? "full" : undefined} onFocus={props.onButtonFocus}>
        <ProgressRing className="context-ring-dial" aria-hidden="true" value={context.value} danger={false} r={10.5} stroke={3} />
      </button>
    </Popover.Trigger></TooltipTrigger><TooltipContent><span className="tip-line">{aria["aria-label"]}</span><span className="tip-line">{aria["aria-description"]}</span></TooltipContent></Tooltip>
    <Popover.Portal><Popover.Content ref={props.contentRef} className="doan-floating doan-popover doan-scroll context-drawer" aria-labelledby={props.titleId} side="top" align="end" sideOffset={4} collisionPadding={8}
      onOpenAutoFocus={props.onOpenAutoFocus} onCloseAutoFocus={props.onCloseAutoFocus} onEscapeKeyDown={props.onEscapeKeyDown} onPointerDownOutside={props.onPointerDownOutside} onFocusOutside={props.onFocusOutside}>
      <ContextDrawerPanel {...props} />
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

// The host keys it by conversation, so another conversation (or the ring going) unmounts it and closes its drawer; a
// drawer that held focus then hands it to the composer input (onLost) rather than the page body.
export function ContextRing({ context, provider, usage = NO_USAGE, canvasPress, onLost }: {
  context: ContextUsage; provider: Provider | null; usage?: RingUsage | undefined; canvasPress?: CanvasPress | undefined; onLost?(): void;
}) {
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState(RING_TIP);
  const [, setTick] = useState(0);
  const button = useRef<HTMLButtonElement | null>(null), body = useRef<HTMLDivElement | null>(null), content = useRef<HTMLDivElement | null>(null);
  // Why the drawer is closing, read when Radix asks where focus goes; refreshFocused survives Refresh unmounting.
  const closing = useRef<"escape" | "outside" | "canvas" | null>(null), refreshFocused = useRef(false);
  const openNow = useRef(false), gone = useRef(false), lost = useRef(onLost);
  openNow.current = open; lost.current = onLost;
  const refs = useRef({
    button: (node: HTMLButtonElement | null) => { button.current = node; },
    body: (node: HTMLDivElement | null) => { body.current = node; },
    content: (node: HTMLDivElement | null) => { content.current = node; },
  }).current;
  const titleId = useId();
  const now = Date.now();
  const view = contextDrawerView({ context, provider, usageHidden: usage.hidden, entries: usage.entries, now });
  // Relative times move on while it is open, and a window whose reset passes is redrawn then. setTimeout overflows past
  // 2^31 − 1 ms (a 30-day window), so a far reset only redraws early and waits again.
  const reading = view.usage ? usage.entries.find(entry => entry.provider === provider)?.reading : undefined;
  const nextReset = open && reading?.status === "ok" ? Math.min(...reading.windows.flatMap(w => w.resetsAt !== undefined && w.resetsAt > now ? [w.resetsAt] : [])) : Infinity;
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setTick(tick => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, [open]);
  useEffect(() => {
    if (!Number.isFinite(nextReset)) return;
    const timer = setTimeout(() => setTick(tick => tick + 1), Math.min(nextReset - Date.now(), 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [nextReset]);
  // A sign-out, account change or the last connection going drops the row and its Refresh but keeps the drawer.
  const rowGone = view.usage === null;
  useLayoutEffect(() => {
    if (!open || refreshGoneFocus({ row: !rowGone, refreshFocused: refreshFocused.current }) !== "body") return;
    refreshFocused.current = false;
    body.current?.focus();
  }, [open, rowGone]);
  // The header is a drag region whose presses never reach the page, so while the drawer is open it takes presses; the ring
  // is not in the header, so useHeaderNoDrag's closest("header") cannot find it.
  const noDragOwner = useRef({}).current;
  useEffect(() => {
    const bar = open ? document.querySelector<HTMLElement>("header.top") : null;
    if (!bar) return;
    return holdHeaderNoDrag(bar, noDragOwner);
  }, [open, noDragOwner]);
  // A press in the canvas iframe never reaches the app's document, so Radix cannot see it as an outside press.
  useEffect(() => {
    if (!open || !canvasPress) return;
    return canvasPress(() => { closing.current = "canvas"; flushSync(() => setOpen(false)); });
  }, [open, canvasPress]);
  // StrictMode mounts twice: the second mount clears what the first cleanup set.
  useLayoutEffect(() => { gone.current = false; return () => {
    gone.current = true;
    const active = document.activeElement;
    const inside = openNow.current && active !== null && content.current?.contains(active) === true;
    if (drawerCloseFocus({ kind: "lost", focusInside: inside }) === "composer") lost.current?.();
  }; }, []);
  return <ContextRingView context={context} provider={provider} view={view} open={open} tip={ringTipOpen(tip)} titleId={titleId}
    buttonRef={refs.button} bodyRef={refs.body} contentRef={refs.content}
    onOpenChange={next => {
      setOpen(next);
      if (!next) return;
      // Escape on a focused Refresh unmounts it with no blur, so its focus is cleared here, not on close.
      closing.current = null; refreshFocused.current = false;
      setTip(state => ringTip(state, { type: "drawer", open: true }));
      if (view.usage) usage.read("open");
    }}
    onTipChange={next => setTip(state => ringTip(state, next ? { type: "hover" } : { type: "dismiss" }))}
    // The tooltip trigger's own focus handler runs after this one and skips a prevented event: focus is decided here,
    // so the focus the drawer's close hands back does not open the tooltip.
    onButtonFocus={event => { event.preventDefault(); const keyboard = event.currentTarget.matches(":focus-visible"); setTip(state => ringTip(state, { type: "focus", keyboard })); }}
    onRefresh={() => usage.read("refresh")}
    onRefreshFocus={focused => { refreshFocused.current = focused; }}
    onOpenAutoFocus={event => { event.preventDefault(); body.current?.focus(); }}
    onCloseAutoFocus={event => {
      // Radix would focus the trigger, or the page body after an outside press; this runs a tick after the press.
      event.preventDefault();
      if (gone.current) return;
      const cause = closing.current; closing.current = null;
      const active = document.activeElement;
      const where = cause === "canvas" ? "stay"
        : cause === "outside" ? drawerCloseFocus({ kind: "outside", focusedControl: active !== null && active !== document.body })
        : drawerCloseFocus({ kind: "escape" });
      setTip(state => ringTip(state, { type: "drawer", open: false, focusReturns: where === "ring" }));
      if (where === "ring") button.current?.focus();
    }}
    onEscapeKeyDown={() => { closing.current = "escape"; }}
    onPointerDownOutside={() => { closing.current = "outside"; }}
    onFocusOutside={() => { closing.current = "outside"; }} />;
}
