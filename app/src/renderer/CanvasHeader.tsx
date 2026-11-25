import { Fragment, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactElement } from "react";
import { DropdownMenu, Popover } from "radix-ui";
import { ChevronDown, Minus, MessageSquare, PanelsTopLeft, Plus, RotateCw, SlidersHorizontal } from "lucide-react";
import type { ViewCommand } from "../main/index";
import type { CanvasState, CanvasViewStore } from "./CanvasController";
import type { HomeCard } from "./homeCards";
import { projectHue, projectInitial } from "./shellNavigation";
import { canvasCrumbs } from "./worktreeSwitchModel";
import { WorktreeSwitch } from "./WorktreeSwitch";
import { frameDrawerView, type FrameDrawerRow, type FrameDrawerView } from "./frameDrawer";
import { drawerKey, focusedRowAfter } from "./frameDrawerList";
import { FrameName, FrameRowMarks } from "./FrameListBody";
import { isCut, NameTip } from "./NameTip";
import { useMenuFocus } from "./useMenuFocus";
import { zoomControlView, type ZoomControlView } from "./zoomControl";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipEscape } from "./components/ui/tooltip";
import { CONVERSATION_PANEL_ID } from "./ConversationPanel";
import type { CanvasSignal } from "./rightPanelOpen";
import { headerShowButtons } from "./headerShowButtons";
import { INSPECTOR_PANEL_ID } from "./InspectorPanel";

export interface CanvasHeaderNavigation {
  card: HomeCard; root: string; homeDirectory: string | null;
  worktree(root: string, canvasPath: string): void;
}

// It reuses the Overview header box (.ov-head), so the two headers line up. Each Show button names its panel in
// `data-panel-target`, which App's focus return reads. `view` changes without an App render; `state` may lag it.
export function CanvasHeader({ navigation, state, view, canvasKey = null, command, zoomTo, selectFrame, fallbackFocus = () => {}, panel, inspector }: {
  navigation: CanvasHeaderNavigation | null; state: CanvasState; view: CanvasViewStore; canvasKey?: string | null; command(name: ViewCommand): void; zoomTo(scale: number): void; selectFrame(index: number, id: string): void;
  fallbackFocus?: () => void; panel?: { open: boolean; show(): void; badge?: Pick<CanvasSignal, "kind" | "label"> | null };
  inspector?: { open: boolean; fits: boolean; show(): void; focused?(node: Element): void };
}) {
  const reasonId = useId();
  const shown = useSyncExternalStore(view.subscribe, view.get, view.get);
  const crumbs = navigation ? canvasCrumbs(navigation.card, navigation.root, !state.unlisted && state.open?.folder === navigation.root ? state.open.row : null, navigation.homeDirectory) : [];
  const canvas = crumbs.find(crumb => crumb.kind === "canvas");
  const board = { layout: state.layout, currentFrame: shown.currentFrame, status: state.status, unlisted: !canvas };
  // Without a panel prop that panel has no button here (open, as far as the header knows).
  const shows = headerShowButtons({ inspectorOpen: inspector?.open ?? true, conversationOpen: panel?.open ?? true, inspectorFits: inspector?.fits ?? true });
  return <header className="ov-head doan-canvas-head">
    <nav className="doan-canvas-trail" aria-label="Breadcrumb">
      {navigation && crumbs.map(crumb => {
        if (crumb.kind === "project") return <ProjectCrumb key="project" label={crumb.label} />;
        if (crumb.kind === "worktree") return <WorktreeSwitch key="worktree" canvasKey={canvasKey} fallbackFocus={fallbackFocus} model={crumb.model} reason={crumb.reason}
          onWorktree={root => { if (canvas) navigation.worktree(root, canvas.path); }} />;
        return <Fragment key="canvas"><span className="ov-sep doan-canvas-sep-root" aria-hidden="true">/</span>
          <Tooltip><TooltipTrigger asChild><span className="doan-canvas-name" role="img" aria-label={crumb.label}><PanelsTopLeft aria-hidden="true" /><span>{crumb.label}</span></span></TooltipTrigger>
            <TooltipContent>{crumb.path}</TooltipContent></Tooltip></Fragment>;
      })}
      {crumbs.length > 0 && <span className={canvas ? "ov-sep" : "ov-sep doan-canvas-sep-root"} aria-hidden="true">/</span>}
      <span className="ov-title-wrap"><FrameDrawer view={frameDrawerView(board)} label={canvas ? `Frames in ${canvas.label}` : "Frames"} canvasKey={canvasKey} fallbackFocus={fallbackFocus} select={selectFrame} /></span>
    </nav>
    <div className="doan-canvas-head-tools"><ZoomControl view={zoomControlView({ ...board, scale: shown.scale })} canvasKey={canvasKey} fallbackFocus={fallbackFocus} command={command} zoomTo={zoomTo} />
      {/* Like ⌘R, Reload stays available whenever a canvas is open, including while it loads or after it failed. */}
      <IconTip label="Reload canvas" shortcut="⌘R"><button type="button" className="doan-icon-button" aria-label="Reload canvas" disabled={!state.open} onClick={() => command("reload")}><RotateCw aria-hidden="true" /></button></IconTip>
      {shows.separator && <span className="doan-canvas-head-sep" aria-hidden="true" />}
      {shows.buttons.map(({ target, disabled }) => target === "inspector"
        // Unavailable rather than gone: the saved open flag stays, and the reason is its tooltip and description.
        ? <Fragment key={target}><IconTip label={disabled ?? "Show inspector"}><button type="button" className="doan-icon-button doan-panel-show" data-panel-target="inspector" aria-label="Show inspector" aria-expanded={false} aria-controls={INSPECTOR_PANEL_ID}
            {...(disabled === undefined ? {} : { "aria-disabled": true, "aria-describedby": reasonId })} onFocus={event => inspector?.focused?.(event.currentTarget)} onClick={() => { if (disabled === undefined) inspector?.show(); }}><SlidersHorizontal aria-hidden="true" /></button></IconTip>
          {disabled !== undefined && <span className="sr-only" id={reasonId}>{disabled}</span>}</Fragment>
        // The badged name is the tooltip too, so a pointer reads the dot's meaning as a screen reader does.
        : panel && <IconTip key={target} label={panel.badge?.label ?? "Show conversation"}><button type="button" className="doan-icon-button doan-panel-show" data-panel-target="conversation" aria-label={panel.badge?.label ?? "Show conversation"} aria-expanded={false} aria-controls={CONVERSATION_PANEL_ID}
          data-badge={panel.badge ? (panel.badge.kind === "permission" ? "true" : panel.badge.kind) : undefined} onClick={panel.show}><MessageSquare aria-hidden="true" />
          {/* The prototype window's working spinner, reused. */}
          {panel.badge?.kind === "working" && <span className="badge-working" aria-hidden="true"><span className="doan-spinner" /></span>}</button></IconTip>)}
    </div>
  </header>;
}

function ProjectCrumb({ label }: { label: string }) {
  const text = useRef<HTMLSpanElement>(null);
  const [tip, setTip] = useState(false);
  return <Tooltip open={tip} onOpenChange={open => setTip(open && (text.current?.offsetWidth === 0 || isCut(text.current)))}>
    <TooltipTrigger asChild><span className="doan-canvas-project" role="img" aria-label={label}>
      <span className={`shell-thumbnail hue-${projectHue(label)}`} aria-hidden="true">{projectInitial(label)}</span><span className="doan-canvas-project-name" ref={text}>{label}</span>
    </span></TooltipTrigger><TooltipContent side="bottom">{label}</TooltipContent>
  </Tooltip>;
}

// A shortcut is a key chip after the label, as on the canvas toolbar (DESIGN 'Tooltip').
function IconTip({ label, shortcut, children }: { label: string; shortcut?: string; children: ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger>
    {shortcut === undefined ? <TooltipContent>{label}</TooltipContent>
      : <TooltipContent className="has-key">{label}<span className="doan-kbd" data-ui-variant="on-prominent" data-ui-size="sm">{shortcut}</span></TooltipContent>}</Tooltip>;
}

// A popover list rather than a Radix menu: rows keep focus by frame id across a reload and share the sidebar tree's
// 500 ms typeahead. Radix still closes it on Esc (preventing the default) and returns focus to the trigger.
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
  // The Play drawer's keys (drawerKey): every printable key is the list's, so V and H never switch the tool from here.
  const keydown = (event: KeyboardEvent<HTMLDivElement>) => {
    const result = drawerKey(view.rows, active, event, typed.current, Date.now());
    typed.current = result.typed;
    if (result.prevent) event.preventDefault();
    const picked = result.pick === undefined ? undefined : view.rows.find(row => row.key === result.pick);
    if (picked) pick(picked);
    else if (result.move !== undefined) move(result.move);
  };

  return <Popover.Root open={shown} onOpenChange={next => { setOpen(next); if (next) setFocused(null); }}>
    <NameTip text={view.buttonLabel}><Popover.Trigger asChild><button ref={trigger} type="button" className="ov-title doan-button doan-frame-trigger" data-ui-size="sm" data-ui-variant="trigger"
      aria-haspopup="listbox" aria-label={view.ariaLabel} disabled={!view.enabled}>
      <span>{view.buttonLabel}</span><ChevronDown className="chev" aria-hidden="true" /></button></Popover.Trigger></NameTip>
    <TooltipEscape value={() => setOpen(false)}><Popover.Portal><Popover.Content ref={list} role={undefined} className="doan-floating doan-menu doan-frame-list" align="start" sideOffset={4} collisionPadding={8} onCloseAutoFocus={onCloseAutoFocus}
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
    </Popover.Content></Popover.Portal></TooltipEscape>
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
