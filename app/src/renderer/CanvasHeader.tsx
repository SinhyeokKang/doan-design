import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactElement } from "react";
import { DropdownMenu, Popover } from "radix-ui";
import { ChevronDown, Minus, MessageCircle, PanelRightOpen, PanelsTopLeft, Plus, RotateCw } from "lucide-react";
import type { ViewCommand } from "../main/index";
import type { CanvasState, CanvasViewStore } from "./CanvasController";
import { canvasLabel } from "./canvasTree";
import { frameDrawerView, type FrameDrawerRow, type FrameDrawerView } from "./frameDrawer";
import { drawerKeyTarget, drawerTypeahead, focusedRowAfter } from "./frameDrawerList";
import { FrameName, FrameRowMarks } from "./FrameListBody";
import { NameTip } from "./NameTip";
import { menuCloseFocus, menuCloseNow } from "./canvasFocus";
import { zoomControlView, type ZoomControlView } from "./zoomControl";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { CONVERSATION_PANEL_ID } from "./ConversationPanel";
import type { CanvasSignal } from "./rightPanelOpen";

// The canvas page's header above the board: canvas / frame drawer on the left,
// the zoom controller and Reload on the right. It reuses the Overview header box (.ov-head), so the two headers line up.
// `canvasKey` names the open canvas: an open menu closes when it changes. `fallbackFocus` takes focus a closing menu
// cannot hand back to its trigger (the canvas region). `panel`: the conversation panel, whose open button sits last in
// the header only while it is folded, with a dot and a longer name while this canvas's
// conversation needs an answer or has an unseen ending.
// `view`: the zoom and current frame, which change without an App render; `state` may hold older ones.
export function CanvasHeader({ state, view, canvasKey = null, command, zoomTo, selectFrame, fallbackFocus = () => {}, panel }: {
  state: CanvasState; view: CanvasViewStore; canvasKey?: string | null; command(name: ViewCommand): void; zoomTo(scale: number): void; selectFrame(index: number, id: string): void;
  fallbackFocus?: () => void; panel?: { open: boolean; show(): void; badge?: Pick<CanvasSignal, "kind" | "label"> | null };
}) {
  const shown = useSyncExternalStore(view.subscribe, view.get, view.get);
  const board = { layout: state.layout, currentFrame: shown.currentFrame, status: state.status, unlisted: state.unlisted };
  // An unlisted page or a canvas that left the list names no canvas; only the disabled drawer stays.
  const canvas = state.open && !state.unlisted ? state.open.row : null;
  const name = canvas ? canvasLabel(canvas) : null;
  return <header className="ov-head doan-canvas-head">
    {/* The path is information only the tooltip carries, so it shows whether or not the name is cut. */}
    {canvas && <><Tooltip><TooltipTrigger asChild><span className="doan-canvas-name"><PanelsTopLeft aria-hidden="true" /><span>{name}</span></span></TooltipTrigger>
      <TooltipContent>{canvas.path}</TooltipContent></Tooltip><span className="ov-sep" aria-hidden="true">/</span></>}
    <span className="ov-title-wrap"><FrameDrawer view={frameDrawerView(board)} label={name ? `Frames in ${name}` : "Frames"} canvasKey={canvasKey} fallbackFocus={fallbackFocus} select={selectFrame} /></span>
    <div className="doan-canvas-head-tools"><ZoomControl view={zoomControlView({ ...board, scale: shown.scale })} canvasKey={canvasKey} fallbackFocus={fallbackFocus} command={command} zoomTo={zoomTo} />
      {/* Like ⌘R, Reload stays available whenever a canvas is open, including while it loads or after it failed. */}
      <IconTip label="Reload canvas" shortcut="⌘R"><button type="button" className="doan-icon-button" aria-label="Reload canvas" disabled={!state.open} onClick={() => command("reload")}><RotateCw aria-hidden="true" /></button></IconTip>
      {panel && !panel.open && <><span className="doan-canvas-head-sep" aria-hidden="true" />
        <IconTip label="Show conversation"><button type="button" className="doan-icon-button doan-panel-show" aria-label={panel.badge?.label ?? "Show conversation"} aria-expanded={false} aria-controls={CONVERSATION_PANEL_ID}
          data-badge={panel.badge ? (panel.badge.kind === "permission" ? "true" : panel.badge.kind) : undefined} onClick={panel.show}><PanelRightOpen aria-hidden="true" />{panel.badge?.kind === "unseen" && <span className="badge-bubble" aria-hidden="true"><MessageCircle /></span>}
          {/* The prototype window's working spinner, reused (draft canvas-concurrent-conversations frame badge). */}
          {panel.badge?.kind === "working" && <span className="badge-working" aria-hidden="true"><span className="doan-spinner" /></span>}</button></IconTip></>}
    </div>
  </header>;
}

// A header menu's closing and focus rules (canvasFocus.ts), applied to its trigger and Radix's close.
function useMenuFocus(canvasKey: string | null, open: boolean, enabled: boolean, close: () => void, fallbackFocus: () => void) {
  const trigger = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  const shown = useRef(canvasKey);
  useEffect(() => {
    const canvasChanged = shown.current !== canvasKey;
    shown.current = canvasKey;
    const now = menuCloseNow({ open, enabled, canvasChanged });
    if (now.moved) moved.current = true;
    if (now.close) close();
  });
  const onCloseAutoFocus = (event: Event) => {
    const active = document.activeElement;
    const to = menuCloseFocus({ moved: moved.current, triggerUsable: !!trigger.current?.isConnected && !trigger.current.disabled,
      focusLost: !active || active === document.body || !active.isConnected });
    moved.current = false;
    if (to === "trigger") return;
    event.preventDefault();
    if (to === "fallback") fallbackFocus();
  };
  return { trigger, onCloseAutoFocus };
}

// A shortcut is a key chip after the label, as on the canvas toolbar (DESIGN 'Tooltip').
function IconTip({ label, shortcut, children }: { label: string; shortcut?: string; children: ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger>
    {shortcut === undefined ? <TooltipContent>{label}</TooltipContent>
      : <TooltipContent className="has-key">{label}<span className="doan-kbd" data-ui-variant="on-prominent" data-ui-size="sm">{shortcut}</span></TooltipContent>}</Tooltip>;
}

// A popover list rather than a Radix menu: the rows keep focus by frame id across a reload, mark the viewed frame with
// its Eye, without a fill and share the sidebar tree's 500 ms typeahead. Radix still closes it on Esc
// (preventing the default, so the canvas selection stays) and returns focus to the trigger.
function FrameDrawer({ view, label, canvasKey, fallbackFocus, select }: { view: FrameDrawerView; label: string; canvasKey: string | null; fallbackFocus(): void; select(index: number, id: string): void }) {
  const [open, setOpen] = useState(false);
  const { trigger, onCloseAutoFocus } = useMenuFocus(canvasKey, open, view.enabled, () => setOpen(false), fallbackFocus);
  const [focused, setFocused] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const typed = useRef({ text: "", at: 0 });
  // A disabled drawer (load failed, no frames left) closes its list.
  const shown = open && view.enabled;
  const active = focusedRowAfter(view.rows, focused);

  const move = (key: string | null, center = false) => {
    const node = key === null ? undefined : nodes.current.get(key);
    const box = list.current;
    if (!node || !box) return;
    setFocused(key);
    node.focus({ preventScroll: true });
    // Scrolls the list only: the popover is still being positioned when it opens, so scrollIntoView could move
    // other ancestors.
    const row = node.getBoundingClientRect(), area = box.getBoundingClientRect();
    if (center) box.scrollTop += row.top + row.height / 2 - (area.top + area.height / 2);
    else if (row.top < area.top) box.scrollTop += row.top - area.top;
    else if (row.bottom > area.bottom) box.scrollTop += row.bottom - area.bottom;
  };

  // A reload while the list is open: the focused frame keeps focus; if it left, the viewed row takes it.
  useEffect(() => {
    if (!shown) return;
    // A row that is still listed keeps its node (keyed by frame id), and with it the focus.
    const next = focusedRowAfter(view.rows, focused);
    if (next !== focused) move(next);
  });

  const pick = (row: FrameDrawerRow) => { setOpen(false); select(row.index, row.id); };
  const keydown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Like a menu, Tab does not walk out of the open list into the page.
    if (event.key === "Tab") { event.preventDefault(); return; }
    if (event.key === "Enter" || event.key === " ") {
      const row = view.rows.find(row => row.key === active);
      if (row) { event.preventDefault(); pick(row); }
      return;
    }
    const target = drawerKeyTarget(view.rows, active, event.key);
    if (target !== null) { event.preventDefault(); move(target); return; }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 500 ? typed.current.text : "") + event.key.toLowerCase(), at: now };
      const match = drawerTypeahead(view.rows, active, typed.current.text);
      if (match !== null) { event.preventDefault(); move(match); }
    }
  };

  return <Popover.Root open={shown} onOpenChange={next => { setOpen(next); if (next) setFocused(null); }}>
    <NameTip text={view.buttonLabel}><Popover.Trigger asChild><button ref={trigger} type="button" className="ov-title doan-button doan-frame-trigger" data-ui-size="sm" data-ui-variant="trigger"
      aria-haspopup="listbox" aria-label={view.ariaLabel} disabled={!view.enabled}>
      <span>{view.buttonLabel}</span><ChevronDown className="chev" aria-hidden="true" /></button></Popover.Trigger></NameTip>
    <Popover.Portal><Popover.Content ref={list} role={undefined} className="doan-floating doan-menu doan-frame-list" align="start" sideOffset={4} collisionPadding={8} onCloseAutoFocus={onCloseAutoFocus}
      onOpenAutoFocus={event => {
        event.preventDefault();
        const start = focusedRowAfter(view.rows, null);
        move(start, true);
        // The list's height follows the room Radix reports a frame later.
        requestAnimationFrame(() => { const node = start === null ? undefined : nodes.current.get(start); if (node && document.activeElement === node) move(start, true); });
      }}>
      <div role="listbox" aria-label={label} onKeyDown={keydown}>
        {view.rows.map(row => <div key={row.key} role="option" aria-current={row.current ? "location" : undefined}
          tabIndex={row.key === active ? 0 : -1} className="doan-menu-item doan-frame-row"
          ref={node => { if (node) nodes.current.set(row.key, node); else nodes.current.delete(row.key); }}
          onFocus={() => setFocused(row.key)}
          onPointerMove={event => { if (document.activeElement !== event.currentTarget) event.currentTarget.focus({ preventScroll: true }); }}
          onClick={() => pick(row)}>
          <span className="doan-frame-num">{row.number}</span><FrameName name={row.name} /><FrameRowMarks current={row.current ? "Viewing" : null} prototype={row.prototype} />
        </div>)}
      </div>
      {view.truncatedNote && <p className="doan-menu-head doan-frame-note">{view.truncatedNote}</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

// A zoom button its own press brings to a limit stays focusable (aria-disabled, its press ignored), so a keyboard press
// to the limit keeps focus; native disabled only while the whole controller is off (no canvas drawn).
function limit(enabled: boolean, atLimit: boolean): { disabled?: true; "aria-disabled"?: true } {
  return !enabled ? { disabled: true } : atLimit ? { "aria-disabled": true } : {};
}

function ZoomControl({ view, canvasKey, fallbackFocus, command, zoomTo }: { view: ZoomControlView; canvasKey: string | null; fallbackFocus(): void; command(name: ViewCommand): void; zoomTo(scale: number): void }) {
  const [open, setOpen] = useState(false);
  const { trigger, onCloseAutoFocus } = useMenuFocus(canvasKey, open, view.enabled, () => setOpen(false), fallbackFocus);
  return <span className="doan-canvas-zoom">
    <IconTip label={view.zoomOut.tooltip.label} shortcut={view.zoomOut.tooltip.key}><button type="button" className="doan-icon-button" aria-label="Zoom out" {...limit(view.enabled, view.zoomOut.disabled)} onClick={() => { if (!view.zoomOut.disabled) command("zoomOut"); }}><Minus aria-hidden="true" /></button></IconTip>
    <DropdownMenu.Root open={open && view.enabled} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild><button ref={trigger} type="button" className="doan-button doan-zoom-value" data-ui-variant="trigger" data-ui-size="sm" aria-label={view.triggerLabel} disabled={!view.enabled}>
        {view.value}<ChevronDown className="chev" aria-hidden="true" /></button></DropdownMenu.Trigger>
      <DropdownMenu.Portal><DropdownMenu.Content className="doan-floating doan-menu doan-zoom-menu" data-ui-size="compact" aria-label="Zoom options" align="end" sideOffset={4} collisionPadding={8} onCloseAutoFocus={onCloseAutoFocus}>
        {view.items.map((item, index) => {
          const previous = view.items[index - 1];
          // The View menu's commands, then the fixed percentages.
          const split = previous !== undefined && "command" in previous && "scale" in item;
          return <Fragment key={item.id}>
            {split && <DropdownMenu.Separator className="doan-menu-sep" />}
            <DropdownMenu.Item className="doan-menu-item" onSelect={() => "command" in item ? command(item.command) : zoomTo(item.scale)}>
              {item.label}{"shortcut" in item && <span className="sub doan-zoom-key">{item.shortcut}</span>}
            </DropdownMenu.Item>
          </Fragment>;
        })}
      </DropdownMenu.Content></DropdownMenu.Portal>
    </DropdownMenu.Root>
    <IconTip label={view.zoomIn.tooltip.label} shortcut={view.zoomIn.tooltip.key}><button type="button" className="doan-icon-button" aria-label="Zoom in" {...limit(view.enabled, view.zoomIn.disabled)} onClick={() => { if (!view.zoomIn.disabled) command("zoomIn"); }}><Plus aria-hidden="true" /></button></IconTip>
  </span>;
}
