import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactElement } from "react";
import { Popover } from "radix-ui";
import { ChevronDown, Columns3, Frame, Grid2x2, PanelRightClose, RectangleHorizontal, Rows3, Square, TextCursorInput, Type, type LucideIcon } from "lucide-react";
import type { CanvasRect, ElementKind, ElementTreeAnchor, ElementTreeMessage, ElementTreeNode } from "./canvasMessage";
import type { SelectionView } from "./selection";
import { treeScrollLeft } from "./treeScrollLeft";
import { rowDisplay, rowTooltip, type RowView, type RowsView } from "./inspectorRows";
import { InspectorReads, type InspectCall, type InspectorReadState, type InspectorSelection } from "./inspectorReads";
import { ResizeHandle } from "./ConversationPanel";
import type { PanelBounds } from "./rightPanelSize";
import { copyText } from "./copyText";
import { retryButton } from "./ListRetryButton";
import { AlertIcon } from "./AlertIcon";
import { isCut, NameTip } from "./NameTip";
import { LOADING_DELAY_MS } from "./ConversationThread";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { useActivationFocus } from "./activationFocus";

// The id the Show and Hide inspector buttons point at with aria-controls.
export const INSPECTOR_PANEL_ID = "doan-inspector-panel";
export const INSPECTOR_EMPTY = "Select a frame or element on the canvas to see its styles.";
export const INSPECTOR_FAILED = "Couldn’t read the styles.";
export const COPY_FAILED = "Couldn’t copy the value. Try again.";

// The canvas page's element-tree channel and the board marks it drives (CanvasController, through App).
export interface ElementTreeSource {
  // False when no listed canvas has laid out yet.
  request(): boolean;
  // The one listener for answers to the latest request; returns its removal.
  subscribe(listener: (message: ElementTreeMessage) => void): () => void;
  preview(rect: CanvasRect | null): void;
  select(anchor: ElementTreeAnchor): void;
}

// The head's name before the canvas's tree has named the selection: a frame's title, an element's data-doan-id, else
// its tag (the tree's own names follow the same order, with a short quote of the element's text).
export function selectionName(view: SelectionView): string {
  if (view.element === undefined) return view.frame?.title?.trim() || view.frame?.id || view.tag;
  return view.element.doanId || view.tag;
}

// While folded or yielding it stays in the DOM out of the Tab order, so the Show button's aria-controls resolves. `onEscape`:
// every panel tooltip hands its Escape to the canvas page (CanvasController.toolbarEscape), since Radix prevents the key first.
export function InspectorColumn({ shown, width, bounds, onHide, onResize, preview, selection, document, inspect, tree, onNotice, onEscape }: {
  shown: boolean; width: number; bounds: PanelBounds; onHide(): void; onResize(width: number | undefined): void; preview(width: number): void;
  selection: InspectorSelection | null; document: string | null; inspect: InspectCall; tree: ElementTreeSource; onNotice(text: string): void; onEscape(event: globalThis.KeyboardEvent): void;
}) {
  return <div className="doan-insp-column" data-collapsed={shown ? undefined : ""} inert={!shown}>
    <ResizeHandle width={width} bounds={bounds} onResize={onResize} preview={preview} label="Resize inspector" />
    <InspectorPanel shown={shown} onHide={onHide} selection={selection} document={document} inspect={inspect} tree={tree} onNotice={onNotice} onEscape={onEscape} />
  </div>;
}

export function InspectorPanel({ shown, onHide, selection, document: shownDocument, inspect, tree, onNotice, onEscape }: {
  shown: boolean; onHide(): void; selection: InspectorSelection | null; document: string | null; inspect: InspectCall; tree: ElementTreeSource; onNotice(text: string): void; onEscape(event: globalThis.KeyboardEvent): void;
}) {
  const [reads] = useState(() => new InspectorReads(inspect));
  const read = useSyncExternalStore(reads.subscribe, reads.get, reads.get);
  useLayoutEffect(() => { reads.update(shown, selection, shownDocument); }, [reads, shown, selection, shownDocument]);
  const panel = useRef<HTMLElement | null>(null);
  // The control in the panel that last took focus, until focus moves on to another control.
  const lastFocus = useRef<Element | null>(null);
  // After every commit a focused control that left the page hands focus on instead of letting it fall to the page; in the
  // background it is handed again on activation.
  const handFocus = useActivationFocus();
  useLayoutEffect(() => {
    const lost = lastFocus.current, aside = panel.current;
    if (lost === null || lost.isConnected || aside === null) return;
    lastFocus.current = null;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    handFocus(() => focusAfterLoss(lost, aside)?.focus({ preventScroll: true }));
  });
  const view = selection?.view ?? null;
  const nodes = useElementTree(shown, view, tree);
  return <aside ref={panel} className="right ov-right doan-insp-panel" id={INSPECTOR_PANEL_ID} role="region" aria-label="Inspector"
    onFocus={event => { lastFocus.current = event.target; }} onBlur={event => { if (event.relatedTarget !== null) lastFocus.current = null; }}>
    <div className="doan-conv-head doan-insp-head">
      {view === null ? <span className="doan-insp-title">Inspector</span> : <ElementMenu view={view} nodes={nodes} tree={tree} shown={shown} onEscape={onEscape} />}
      <IconTip label="Hide inspector" onEscape={onEscape}><button type="button" className="doan-icon-button doan-panel-hide" aria-label="Hide inspector" aria-expanded={shown} aria-controls={INSPECTOR_PANEL_ID} onClick={onHide}><PanelRightClose aria-hidden="true" /></button></IconTip>
    </div>
    <InspectorBody read={shown && selection !== null ? read : EMPTY_READ} onRetry={() => reads.retry()} onNotice={onNotice} onEscape={onEscape} />
  </aside>;
}

const EMPTY_READ: InspectorReadState = { panel: { kind: "empty" }, retrying: false, seq: 0 };

// Where focus goes when the focused control in the panel left the page: a Retry that succeeded to the rows' Tab stop;
// otherwise the head's trigger while a selection stays (its name says what is selected now), else the board area.
function focusAfterLoss(lost: Element, aside: Element): HTMLElement | null {
  const row = lost.closest(".doan-insp-failed") === null ? null : aside.querySelector<HTMLElement>('.doan-insp-row[tabindex="0"]');
  return row ?? aside.querySelector<HTMLElement>(".doan-insp-pick .ov-title") ?? document.querySelector<HTMLElement>(".doan-canvas-panel .area");
}

// Each state of the read: no selection, a new selection's read (nothing until the delay, so a quick read never flashes the
// line), the same selection read again (its rows stay), a failure with Retry, and the rows.
export function InspectorBody({ read, onRetry, onNotice, onEscape }: { read: InspectorReadState; onRetry(): void; onNotice(text: string): void; onEscape(event: globalThis.KeyboardEvent): void }) {
  const failedId = useId();
  const { panel } = read;
  const rows = panel.kind === "rows" || panel.kind === "reading" ? panel.rows : null;
  const shownRows = useMemo(() => rows === null ? null : rowDisplay(rows), [rows]);
  if (panel.kind === "empty") return <div className="doan-conv-body"><p className="doan-conv-empty">{INSPECTOR_EMPTY}</p></div>;
  return <div className="doan-insp-body doan-scroll">
    {panel.kind === "failed" ? <div className="doan-insp-failed" role="alert"><AlertIcon /><span id={failedId}>{INSPECTOR_FAILED}</span>{retryButton({ running: read.retrying, variant: "panel", describedBy: failedId, onRetry })}</div>
      : shownRows !== null ? <RowList view={shownRows} busy={panel.kind === "reading"} onNotice={onNotice} onEscape={onEscape} />
      : <ReadingLine key={read.seq} />}
  </div>;
}

function ReadingLine() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSlow(true), LOADING_DELAY_MS); return () => clearTimeout(timer); }, []);
  return <div className="doan-insp-loading" role="status">{slow && <><span className="doan-spinner" aria-hidden="true" />Reading styles</>}</div>;
}

// Asked while the panel shows for each applied selection (a reload's document is asked once the selection is found in it, so
// the name holds meanwhile); only an answer for the selection still applied counts.
function useElementTree(shown: boolean, view: SelectionView | null, tree: ElementTreeSource): ElementTreeNode[] | null {
  const [answer, setAnswer] = useState<{ view: SelectionView; nodes: ElementTreeNode[] } | null>(null);
  const asked = useRef<SelectionView | null>(null);
  useEffect(() => tree.subscribe(message => { const view = asked.current; if (view !== null) setAnswer({ view, nodes: message.nodes }); }), [tree]);
  useLayoutEffect(() => {
    asked.current = shown ? view : null;
    if (shown && view !== null) tree.request();
  }, [shown, view, tree]);
  return answer !== null && answer.view === view ? answer.nodes : null;
}

const KIND_ICONS: Record<ElementKind, LucideIcon> = {
  frame: Frame, "flex-row": Columns3, "flex-column": Rows3, grid: Grid2x2, input: TextCursorInput, button: RectangleHorizontal, text: Type, box: Square,
};

// A row picked selects that node as a ⌘-click would; the row under the pointer or focus is marked on the board. Radix closes it
// on Esc (preventing the default, so the selection stays) and gives focus back to the trigger.
export function ElementMenu({ view, nodes, tree, shown, onEscape }: { view: SelectionView; nodes: ElementTreeNode[] | null; tree: ElementTreeSource; shown: boolean; onEscape(event: globalThis.KeyboardEvent): void }) {
  const [open, setOpen] = useState(false);
  // The menu spans the panel, less an inset a side, whatever its rows' width and however wide the column is (styles.css);
  // the panel's inner width is read when it opens, since the column can be resized.
  const [width, setWidth] = useState<number | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const rowNodes = useRef(new Map<string, HTMLElement>());
  const menu = useRef<HTMLDivElement | null>(null);
  const fallback = selectionName(view);
  const named = nodes?.find(node => node.selected)?.name ?? fallback;
  // Without an answer yet (or for a selection outside every frame) the selection is the one row.
  const rows: ElementTreeNode[] = nodes !== null && nodes.length > 0 ? nodes : [{ depth: 0, name: named, kind: view.element === undefined ? "frame" : "box", anchor: { selector: "" }, rect: { x: 0, y: 0, width: 0, height: 0 }, selected: true }];
  const key = (node: ElementTreeNode, index: number) => node.anchor.selector || `row-${index}`;
  const keys = rows.map(key);
  const current = active !== null && keys.includes(active) ? active : keys[rows.findIndex(node => node.selected)] ?? keys[0] ?? null;
  const frameName = rows[0]?.name ?? named;

  // Another selection closes the menu: its rows were the old selection's.
  useEffect(() => { setOpen(false); }, [view]);
  // A folded or yielding inspector closes its menu, which would otherwise float over the hidden column.
  useEffect(() => { if (!shown) setOpen(false); }, [shown]);
  // The menu can go with its trigger while a row is marked (a selection cleared by a press the app's document never
  // sees, so Radix did not close it first): the mark goes too, or it would hide the canvas's own hover.
  useEffect(() => () => tree.preview(null), [tree]);
  useEffect(() => { if (!open) tree.preview(null); }, [open, tree]);

  const focusRow = (index: number) => {
    const id = keys[index], node = rows[index];
    if (!id || !node) return;
    setActive(id);
    const row = rowNodes.current.get(id);
    const viewport = menu.current;
    const left = viewport?.scrollLeft ?? 0;
    row?.focus();
    // Native focus reveals the row vertically, but the entire row is as wide as the deepest name.
    if (row && viewport) {
      const name = row.querySelector<HTMLElement>(".name");
      if (name) viewport.scrollLeft = treeScrollLeft(node.depth, { width: viewport.clientWidth, nameWidth: name.offsetWidth }, left);
    }
  };
  useLayoutEffect(() => {
    // The first tree reply can replace the menu's focused placeholder after Radix has already autofocused it.
    if (open && shown && active !== null && active !== current && current !== null && document.activeElement === document.body) {
      focusRow(keys.indexOf(current));
    }
  });
  const mark = (node: ElementTreeNode) => tree.preview(node.selected || node.anchor.selector === "" ? null : node.rect);
  const pick = (node: ElementTreeNode) => {
    setOpen(false);
    if (!node.selected && node.anchor.selector !== "") tree.select(node.anchor);
  };
  const keydown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Like a menu, Tab does not walk out of the open list into the page.
    if (event.key === "Tab") { event.preventDefault(); return; }
    const index = current === null ? -1 : keys.indexOf(current);
    const to = event.key === "ArrowDown" ? Math.min(keys.length - 1, index + 1) : event.key === "ArrowUp" ? Math.max(0, index - 1)
      : event.key === "Home" ? 0 : event.key === "End" ? keys.length - 1 : null;
    if (to !== null) { event.preventDefault(); focusRow(to); return; }
    if (event.key === "Enter" || event.key === " ") {
      const node = rows[index];
      if (node) { event.preventDefault(); pick(node); }
    }
  };

  const kind = view.element === undefined ? "frame" : "element";
  return <span className="ov-title-wrap doan-conv-title doan-insp-pick">
    <Popover.Root open={open && shown} onOpenChange={next => {
      setOpen(next); setActive(null);
      if (!next) return;
      const panel = trigger.current?.closest(".doan-insp-panel");
      setWidth(panel ? panel.clientWidth : null);
      tree.request();
    }}>
      {/* While the menu is open a cut name's tooltip over the trigger can be the top layer; its Escape then closes the
          menu, as the menu's own would, and never steps the selection back. */}
      <NameTip text={named} onEscape={open ? () => setOpen(false) : onEscape}><Popover.Trigger asChild><button ref={trigger} type="button" className="ov-title doan-button" data-ui-size="sm" data-ui-variant="trigger" aria-haspopup="tree"
        aria-label={`${named}, ${kind}. Elements in this frame`}><span>{named}</span><ChevronDown className="chev" aria-hidden="true" /></button></Popover.Trigger></NameTip>
      <Popover.Portal><Popover.Content ref={menu} role={undefined} className="doan-floating doan-menu doan-insp-menu" data-ui-variant="tree" side="bottom" align="start" sideOffset={4} collisionPadding={8}
        style={width === null ? undefined : { "--doan-insp-panel-width": `${width}px` } as CSSProperties}
        onOpenAutoFocus={event => { event.preventDefault(); focusRow(current === null ? -1 : keys.indexOf(current)); }}>
        <div role="tree" aria-label={`Elements in ${frameName}`} onKeyDown={keydown}>
          {rows.map((node, index) => {
            const id = key(node, index), Icon = KIND_ICONS[node.kind];
            return <div key={id} role="treeitem" aria-level={node.depth + 1} aria-selected={node.selected === true} tabIndex={id === current ? 0 : -1}
              className="doan-menu-item" style={{ "--tree-depth": node.depth } as CSSProperties}
              ref={element => { if (element) rowNodes.current.set(id, element); else rowNodes.current.delete(id); }}
              onFocus={() => { setActive(id); mark(node); }}
              onPointerMove={event => { if (document.activeElement !== event.currentTarget) event.currentTarget.focus({ preventScroll: true }); }}
              onClick={() => pick(node)}>
              {/* One guide per ancestor, down to that ancestor's last descendant row. */}
              {Array.from({ length: node.depth }, (_, level) => <i key={level} className="guide" aria-hidden="true" style={{ "--tree-level": level } as CSSProperties} />)}
              <Icon aria-hidden="true" /><span className="name">{node.name}</span>
            </div>;
          })}
        </div>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
  </span>;
}

// The rows: one Tab stop (roving), ↑/↓ and Home/End move, Enter, Space and ⌘C copy what the row shows. Focus and
// scroll follow a row's key across replies, so a read in place keeps them.
export function RowList({ view, busy, onNotice, onEscape }: { view: RowsView; busy: boolean; onNotice(text: string): void; onEscape(event: globalThis.KeyboardEvent): void }) {
  const [active, setActive] = useState<string | null>(null);
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const hint = useId();
  const keys = view.groups.flatMap(group => group.rows.map(row => row.key));
  const current = active !== null && keys.includes(active) ? active : keys[0] ?? null;
  if (view.empty !== undefined) return <p className="doan-insp-none">{view.empty}</p>;
  const copy = (row: RowView) => onNotice(copyText(row.copy) ? `Copied ${row.copy}` : COPY_FAILED);
  const keydown = (event: KeyboardEvent<HTMLButtonElement>, row: RowView) => {
    const index = keys.indexOf(row.key);
    const to = event.key === "ArrowDown" ? Math.min(keys.length - 1, index + 1) : event.key === "ArrowUp" ? Math.max(0, index - 1)
      : event.key === "Home" ? 0 : event.key === "End" ? keys.length - 1 : null;
    if (to !== null) {
      event.preventDefault();
      const key = keys[to] ?? null;
      if (key !== null) { setActive(key); nodes.current.get(key)?.focus(); }
      return;
    }
    const meta = event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "c";
    if (event.key === "Enter" || event.key === " " || meta) { event.preventDefault(); copy(row); }
  };
  return <div className="doan-insp-groups" role="group" aria-label="Styles" aria-busy={busy || undefined}>
    {view.groups.map(group => <section key={group.group} className="doan-insp-group" aria-label={group.title}>
      <h3 className="doan-insp-group-title">{group.title}</h3>
      {group.rows.map(row => <RowTip key={row.key} row={row} onEscape={onEscape}>
        <button type="button" className="doan-insp-row" data-key={row.key} tabIndex={row.key === current ? 0 : -1} aria-label={row.spoken} aria-describedby={hint}
          ref={element => { if (element) nodes.current.set(row.key, element); else nodes.current.delete(row.key); }}
          onFocus={() => setActive(row.key)} onKeyDown={event => keydown(event, row)} onClick={() => copy(row)}>
          <span className="doan-insp-label">{row.label}</span>
          <span className="doan-insp-value">{row.token === undefined ? <>{swatch(row)}<span className="doan-insp-text">{row.text}</span></>
            : <code className="doan-code">{swatch(row)}<span>{row.token}</span></code>}</span>
        </button>
      </RowTip>)}
    </section>)}
    <span className="sr-only" id={hint}>Press to copy</span>
  </div>;
}

function swatch(row: RowView): ReactElement | null {
  if (row.swatch === undefined) return null;
  return row.swatch === "transparent" ? <i className="doan-insp-swatch transparent" aria-hidden="true" />
    : <i className="doan-insp-swatch" style={{ background: row.swatch }} aria-hidden="true" />;
}

// The row's one tooltip, opened by hover or focus when it has something to say: a cut value in full, then the token's
// computed value, its chain, each side, where it is inherited from. Cut is measured when it would open (NameTip's rule).
function RowTip({ row, onEscape, children }: { row: RowView; onEscape(event: globalThis.KeyboardEvent): void; children: ReactElement }) {
  const [lines, setLines] = useState<string[] | null>(null);
  const node = useRef<HTMLButtonElement | null>(null);
  return <Tooltip open={lines !== null} onOpenChange={open => {
    const next = open ? rowTooltip(row, isCut(node.current?.querySelector(".doan-insp-value") ?? null)) : [];
    setLines(next.length > 0 ? next : null);
  }}>
    <TooltipTrigger asChild ref={node}>{children}</TooltipTrigger>
    <TooltipContent side="bottom" align="start" className="doan-insp-tip" onEscapeKeyDown={onEscape}>{lines?.map((line, index) => <span key={index}>{line}</span>)}</TooltipContent>
  </Tooltip>;
}

function IconTip({ label, onEscape, children }: { label: string; onEscape(event: globalThis.KeyboardEvent): void; children: ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent onEscapeKeyDown={onEscape}>{label}</TooltipContent></Tooltip>;
}
