import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { Popover } from "radix-ui";
import { Eye, Play } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipEscape } from "./components/ui/tooltip";
import { drawerKey, drawerOrder, focusedRowAfter, type DrawerGroup, type DrawerRow, type Typed } from "./frameDrawerList";

// The prototype drawers' list body: the prototype window's frame menu and the canvas toolbar's Play drawer. Each caller
// keeps its own Popover.Root and trigger; this is the content, its link groups, its keys and where focus goes in it.

// A row's marks: the current frame's Eye with its word (Viewing, Playing), then the Play of a frame marked for
// prototyping, always last so it lines up in every row. The words stay for assistive technology.
export function FrameRowMarks({ current, prototype }: { current: string | null; prototype: boolean }) {
  return <>
    {current !== null && <Mark tip={current}><span className="doan-frame-current"><Eye aria-hidden="true" /><span className="sr-only">{current}</span></span></Mark>}
    {prototype && <Mark tip="Prototype supported"><span className="doan-frame-current prototype-meta-icon"><Play aria-hidden="true" /><span className="sr-only">Prototype</span></span></Mark>}
  </>;
}
function Mark({ tip, children }: { tip: string; children: ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{tip}</TooltipContent></Tooltip>;
}

// A frame row's name in the shared tooltip on every hover (DESIGN 'Tooltip'). The name, not the whole row, is the
// trigger: the row's marks are triggers of their own, and nested triggers would show two capsules at once.
export function FrameName({ name }: { name: string }) {
  return <Tooltip><TooltipTrigger asChild><span className="doan-frame-name">{name}</span></TooltipTrigger><TooltipContent>{name}</TooltipContent></Tooltip>;
}

// The listbox: one named group per link group, with an aria-hidden separator only between groups. `active` holds the
// one tab stop.
export function DrawerListbox({ label, groups, active, currentWord, onKeyDown, onPick, onFocusRow, nodes }: {
  label: string; groups: readonly DrawerGroup[]; active: string | null; currentWord: string; onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
  onPick(row: DrawerRow): void; onFocusRow(key: string): void; nodes: Map<string, HTMLElement>;
}) {
  return <div role="listbox" aria-label={label} onKeyDown={onKeyDown}>
    {groups.map((group, index) => <Fragment key={group.rows[0]?.key ?? index}>
      {index > 0 && <div className="doan-menu-sep" aria-hidden="true" />}
      <div role="group" aria-label={group.label}>
        {group.rows.map(row => <div key={row.key} role="option" aria-current={row.current ? "location" : undefined}
          tabIndex={row.key === active ? 0 : -1} className="doan-menu-item doan-frame-row"
          ref={node => { if (node) nodes.set(row.key, node); else nodes.delete(row.key); }}
          onFocus={() => onFocusRow(row.key)}
          onPointerMove={event => { if (document.activeElement !== event.currentTarget) event.currentTarget.focus({ preventScroll: true }); }}
          onClick={() => onPick(row)}>
          <span className="doan-frame-num">{row.number}</span><FrameName name={row.name} /><FrameRowMarks current={row.current ? currentWord : null} prototype={false} />
        </div>)}
      </div>
    </Fragment>)}
  </div>;
}

// Opening focuses the current row, else the first; with no row and an `empty` line, the content is a labelled dialog holding
// that line. `onClose`: the drawer's own close, which an Esc on a row's tooltip also takes (TooltipEscape).
export function FrameListBody({ label, groups, open, empty, onPick, onClose, className, side, align }: {
  label: string; groups: readonly DrawerGroup[]; open: boolean; empty?: string; onPick(row: DrawerRow): void; onClose(): void;
  className: string; side?: "top" | "bottom"; align: "start" | "center" | "end";
}) {
  const [focused, setFocused] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const typed = useRef<Typed>({ text: "", at: 0 });
  const rows = drawerOrder(groups);
  const active = focusedRowAfter(rows, focused);

  // Scrolls the list only: the popover is still being positioned when it opens, so scrollIntoView could move other
  // ancestors.
  const move = (key: string | null, center = false) => {
    const node = key === null ? undefined : nodes.current.get(key);
    const box = list.current;
    if (!node || !box) return;
    setFocused(key);
    node.focus({ preventScroll: true });
    const row = node.getBoundingClientRect(), area = box.getBoundingClientRect();
    if (center) box.scrollTop += row.top + row.height / 2 - (area.top + area.height / 2);
    else if (row.top < area.top) box.scrollTop += row.top - area.top;
    else if (row.bottom > area.bottom) box.scrollTop += row.bottom - area.bottom;
  };

  useEffect(() => { if (!open) setFocused(null); }, [open]);
  // Rows that change while the list is open keep the focused frame, else the current one.
  useEffect(() => {
    if (!open) return;
    const next = focusedRowAfter(rows, focused);
    if (next !== focused) move(next);
  });

  const keydown = (event: KeyboardEvent<HTMLDivElement>) => {
    const result = drawerKey(rows, active, event, typed.current, Date.now());
    typed.current = result.typed;
    if (result.prevent) event.preventDefault();
    const picked = result.pick === undefined ? undefined : rows.find(row => row.key === result.pick);
    if (picked) onPick(picked);
    else if (result.move !== undefined) move(result.move);
  };

  const dialog = rows.length === 0 && empty !== undefined;
  return <TooltipEscape value={onClose}><Popover.Portal><Popover.Content ref={list} role={dialog ? "dialog" : undefined} aria-label={dialog ? label : undefined} className={className}
    side={side} align={align} sideOffset={4} collisionPadding={8}
    onOpenAutoFocus={event => {
      event.preventDefault();
      const start = focusedRowAfter(rows, null);
      move(start, true);
      // The list's height follows the room Radix reports a frame later.
      requestAnimationFrame(() => { const node = start === null ? undefined : nodes.current.get(start); if (node && document.activeElement === node) move(start, true); });
    }}>
    {dialog ? <p className="doan-menu-head pw-drawer-empty">{empty}</p>
      : <DrawerListbox label={label} groups={groups} active={active} currentWord="Playing" onKeyDown={keydown} onPick={onPick} onFocusRow={setFocused} nodes={nodes.current} />}
  </Popover.Content></Popover.Portal></TooltipEscape>;
}
