import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { DropdownMenu, Popover } from "radix-ui";
import { ChevronDown, Minus, PanelRightOpen, PanelsTopLeft, Plus, RotateCw } from "lucide-react";
import type { ViewCommand } from "../main/index";
import type { CanvasState } from "./CanvasController";
import { canvasLabel } from "./canvasTree";
import { frameDrawerView, type FrameDrawerRow, type FrameDrawerView } from "./frameDrawer";
import { drawerKeyTarget, drawerTypeahead, focusedRowAfter } from "./frameDrawerList";
import { menuCloseFocus, menuCloseNow } from "./canvasFocus";
import { zoomControlView, type ZoomControlView } from "./zoomControl";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { CONVERSATION_PANEL_ID } from "./ConversationPanel";
import type { OpenBadge } from "./rightPanelOpen";

// The canvas page's header above the board (buzz-canvas design §0 'default', §2): canvas / frame drawer on the left,
// the zoom controller and Reload on the right. It reuses the Overview header box (.ov-head), so the two headers line up.
// `canvasKey` names the open canvas: an open menu closes when it changes. `fallbackFocus` takes focus a closing menu
// cannot hand back to its trigger (the canvas region). `panel`: the conversation panel, whose open button sits last in
// the header only while it is folded (design §2 '오른쪽 패널'), with a dot and a longer name while this canvas's
// conversation needs an answer or has an unseen ending (buzz-canvas-conversation design §2 'News dot').
export function CanvasHeader({ state, canvasKey = null, command, zoomTo, selectFrame, fallbackFocus = () => {}, panel }: {
  state: CanvasState; canvasKey?: string | null; command(name: ViewCommand): void; zoomTo(scale: number): void; selectFrame(index: number, id: string): void;
  fallbackFocus?: () => void; panel?: { open: boolean; show(): void; badge?: OpenBadge | null };
}) {
  const board = { layout: state.layout, currentFrame: state.currentFrame, status: state.status, unlisted: state.unlisted };
  // An unlisted page or a canvas that left the list names no canvas; only the disabled drawer stays.
  const canvas = state.open && !state.unlisted ? state.open.row : null;
  const name = canvas ? canvasLabel(canvas) : null;
  return <header className="ov-head doan-canvas-head">
    {canvas && <><span className="doan-canvas-name" title={canvas.path}><PanelsTopLeft aria-hidden="true" /><span>{name}</span></span><span className="ov-sep" aria-hidden="true">/</span></>}
    <span className="ov-title-wrap"><FrameDrawer view={frameDrawerView(board)} label={name ? `Frames in ${name}` : "Frames"} canvasKey={canvasKey} fallbackFocus={fallbackFocus} select={selectFrame} /></span>
    <div className="doan-canvas-head-tools"><ZoomControl view={zoomControlView({ ...board, scale: state.scale })} canvasKey={canvasKey} fallbackFocus={fallbackFocus} command={command} zoomTo={zoomTo} />
      {/* Like ⌘R, Reload stays available whenever a canvas is open, including while it loads or after it failed. */}
      <IconTip label="Reload canvas ⌘R"><button type="button" className="doan-icon-button" aria-label="Reload canvas" disabled={!state.open} onClick={() => command("reload")}><RotateCw aria-hidden="true" /></button></IconTip>
      {panel && !panel.open && <><span className="doan-canvas-head-sep" aria-hidden="true" />
        <IconTip label="Show conversation"><button type="button" className="doan-icon-button doan-panel-show" aria-label={panel.badge?.label ?? "Show conversation"} aria-expanded={false} aria-controls={CONVERSATION_PANEL_ID}
          data-badge={panel.badge ? "true" : undefined} onClick={panel.show}><PanelRightOpen aria-hidden="true" /></button></IconTip></>}
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

function IconTip({ label, children }: { label: string; children: ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

// A popover list rather than a Radix menu: the rows keep focus by frame id across a reload, mark the viewed frame
// without a fill and share the sidebar tree's 500 ms typeahead (design §2 '프레임 서랍'). Radix still closes it on Esc
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
    <Popover.Trigger asChild><button ref={trigger} type="button" className="ov-title doan-button doan-frame-trigger" data-ui-size="sm" data-ui-variant="trigger"
      aria-haspopup="listbox" aria-label={view.ariaLabel} title={view.buttonLabel} disabled={!view.enabled}>
      <span>{view.buttonLabel}</span><ChevronDown className="chev" aria-hidden="true" /></button></Popover.Trigger>
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
          tabIndex={row.key === active ? 0 : -1} title={row.name} className="doan-menu-item doan-frame-row"
          ref={node => { if (node) nodes.current.set(row.key, node); else nodes.current.delete(row.key); }}
          onFocus={() => setFocused(row.key)}
          onPointerMove={event => { if (document.activeElement !== event.currentTarget) event.currentTarget.focus({ preventScroll: true }); }}
          onClick={() => pick(row)}>
          <span className="doan-frame-num">{row.number}</span><span className="doan-frame-name">{row.name}</span>{row.current && <span className="doan-frame-viewing">Viewing</span>}
        </div>)}
      </div>
      {view.truncatedNote && <p className="doan-menu-head doan-frame-note">{view.truncatedNote}</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

function ZoomControl({ view, canvasKey, fallbackFocus, command, zoomTo }: { view: ZoomControlView; canvasKey: string | null; fallbackFocus(): void; command(name: ViewCommand): void; zoomTo(scale: number): void }) {
  const [open, setOpen] = useState(false);
  const { trigger, onCloseAutoFocus } = useMenuFocus(canvasKey, open, view.enabled, () => setOpen(false), fallbackFocus);
  return <span className="doan-canvas-zoom">
    <IconTip label={view.zoomOut.tooltip}><button type="button" className="doan-icon-button" aria-label="Zoom out" disabled={view.zoomOut.disabled} onClick={() => command("zoomOut")}><Minus aria-hidden="true" /></button></IconTip>
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
    <IconTip label={view.zoomIn.tooltip}><button type="button" className="doan-icon-button" aria-label="Zoom in" disabled={view.zoomIn.disabled} onClick={() => command("zoomIn")}><Plus aria-hidden="true" /></button></IconTip>
  </span>;
}
