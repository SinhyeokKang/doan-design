import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Trash2 } from "lucide-react";
import { AlertIcon } from "./AlertIcon";
import { canvasRowProblemText, type CanvasConversationRow } from "./canvasConversationRows";
import { LOADING_DELAY_MS } from "./ConversationThread";
import { ConversationHead } from "./ConversationLine";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { DELETE_TOOLTIP, deleteItemLabel } from "./conversationDelete";
import type { ListFocus } from "./ConversationDeleteDialog";
import { focusAfterLeave, listKeyTarget } from "./listKeyboard";
import { announcedAgain, LIST_RETRY_IDLE, type ListRetry } from "./listRetry";
import { LIST_FAILED_TEXT, listRetryButton } from "./ListRetryButton";
import { applyVisibility, thumbnailView, type ThumbnailState, type ThumbnailView } from "./thumbnails";
import { NameTip } from "./NameTip";
import { useActivationFocus } from "./activationFocus";

// The Overview's right panel body (Conversations): one row per project or canvas conversation of the root.

export type CanvasList = readonly CanvasConversationRow[] | "loading" | "error";

// A blur to nowhere (window blur, the row's removal) keeps the row; focus elsewhere or pointer input outside ends it,
// so a row removed after the person moved on never pulls focus back.
export class RowFocusMemory {
  private key: string | null = null;
  focus(key: string): void { this.key = key; }
  blur(key: string, to: unknown): void { if (to !== null && this.key === key) this.key = null; }
  pointer(onRow: boolean): void { if (!onRow) this.key = null; }
  current(): string | null { return this.key; }
  // After a list change: where focus goes when the remembered row left; null when it stays listed, nothing was
  // remembered, or focus is already on another element.
  left(before: readonly string[], now: readonly string[], focusElsewhere: boolean): { kind: "row"; key: string } | { kind: "title" } | null {
    const at = this.key;
    if (at === null || now.includes(at)) return null;
    this.key = null;
    return focusElsewhere ? null : focusAfterLeave(before, now, at);
  }
}

// `frozen` is the order last drawn: rows keep their places and a new row joins at the end, so a row never moves under the
// pointer. The sidebar's viewed-canvas list holds its order by the same rule (titleMenuOrder).
export function heldOrder(keys: readonly string[], frozen: readonly string[] | null): string[] {
  if (frozen === null) return [...keys];
  const listed = new Set(keys), kept = frozen.filter(key => listed.has(key)), known = new Set(kept);
  return [...kept, ...keys.filter(key => !known.has(key))];
}

// What the visibility observer watches: each row's key with its canvas path. Another conversation's row on the same
// canvas keeps the path, but React draws a new button for its key, which must be observed again.
export function observedRows(rows: readonly CanvasConversationRow[]): string {
  return rows.flatMap(item => item.kind === "canvas" && item.row ? [`${item.key}\0${item.row.path}`] : []).join("\n");
}

export interface CanvasConversationListProps {
  list: CanvasList; project: string; thumbnails: ReadonlyMap<string, ThumbnailState>;
  // The project conversation the Overview's main column shows, or null; its row, when listed, is the current row.
  current: string | null;
  open(item: CanvasConversationRow): void; retry(): void; onVisible(paths: readonly string[]): void;
  // A failed list's Retry while it reads again (HomeRun listRetry).
  listRetry?: ListRetry;
  // A row's Delete: its button, where Cancel returns focus, and where focus goes after the delete.
  onDelete(item: CanvasConversationRow, button: HTMLElement, after: ListFocus): void;
  // The panel's scroller observes thumbnail visibility; its title takes focus when the list empties under it.
  scroller: RefObject<HTMLElement | null>; title: RefObject<HTMLElement | null>;
}

export function CanvasConversationList({ list, current, project, thumbnails, open, retry, listRetry = LIST_RETRY_IDLE, onVisible, onDelete, scroller, title }: CanvasConversationListProps) {
  const errorBox = useRef<HTMLDivElement>(null);
  // Removal drops focus to the body during commit, so check who holds it before the list replaces Retry.
  const retryFocused = errorBox.current?.contains(document.activeElement) === true;

  const listed = Array.isArray(list) ? list : [];
  const [pointerIn, setPointerIn] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const drawn = useRef<string[] | null>(null);
  // A list that left (emptied, read again, failed) takes no pointerleave or blur with it.
  if (listed.length === 0 && (pointerIn || focusIn)) { setPointerIn(false); setFocusIn(false); }
  const keys = heldOrder(listed.map(item => item.key), pointerIn || focusIn ? drawn.current : null);
  drawn.current = keys;
  const byKey = new Map(listed.map(item => [item.key, item]));
  const rows = keys.flatMap(key => { const item = byKey.get(key); return item ? [item] : []; });
  // Only a project row is the Overview's current one, never a canvas row under that key.
  const currentKey = rows.find(item => item.kind === "project" && item.key === current)?.key ?? null;
  const [active, setActive] = useState<string | null>(null);
  const tabKey = active !== null && keys.includes(active) ? active : currentKey ?? keys[0] ?? null;
  const listRef = useRef<HTMLUListElement>(null);
  const memory = useRef(new RowFocusMemory()).current;
  const focusKey = (key: string) => listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();

  const previous = useRef(keys);
  const keysKey = keys.join("\n");
  // A row can leave while the window is in the background (a terminal, the prototype window), so the hand-off is made
  // again on activation (POSTMORTEM 2026-11-17).
  const handFocus = useActivationFocus();
  useLayoutEffect(() => {
    if (!retryFocused || !Array.isArray(list) || (document.activeElement && document.activeElement !== document.body)) return;
    handFocus(() => { if (tabKey !== null) focusKey(tabKey); else title.current?.focus(); });
  }, [retryFocused, list, tabKey, handFocus, title]);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = keys;
    const now = document.activeElement;
    const target = memory.left(before, keys, !!now && now !== document.body && now.isConnected);
    if (target === null) return;
    if (target.kind === "row") { setActive(target.key); handFocus(() => focusKey(target.key)); } else handFocus(() => title.current?.focus());
  }, [keysKey]);

  useEffect(() => {
    const down = (event: PointerEvent) => memory.pointer(event.target instanceof Element && !!listRef.current?.contains(event.target.closest(".cv-row")));
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, []);

  const report = useRef(onVisible);
  report.current = onVisible;
  const observed = observedRows(rows);
  useEffect(() => {
    const root = scroller.current;
    if (!root || observed === "") return;
    let visible = new Set<string>();
    const observer = new IntersectionObserver(changes => {
      const next = applyVisibility(visible, changes.map(change => ({ path: (change.target as HTMLElement).dataset.path ?? "", visible: change.isIntersecting })));
      if (next) { visible = next; report.current([...next]); }
    }, { root });
    for (const row of root.querySelectorAll<HTMLElement>(".cv-row[data-path]")) observer.observe(row);
    return () => { observer.disconnect(); report.current([]); };
  }, [observed]);

  if (list === "loading") return <ListLoading />;
  // The panel is white, where a panel button has no fill of its own; subtle keeps one.
  if (list === "error") return <div ref={errorBox} className="rp-error" role="status"><AlertIcon /><span>{announcedAgain(LIST_FAILED_TEXT, listRetry.failures)}</span>
    {listRetryButton(listRetry, "subtle", retry)}</div>;
  if (rows.length === 0) return <div className="rp-empty"><p>No conversations yet.</p><p>Conversations you start in the Overview or on a canvas show here.</p></div>;
  return <ul className="rp-list" role="list" ref={listRef} onPointerEnter={() => setPointerIn(true)} onPointerLeave={() => setPointerIn(false)}
    onFocus={() => setFocusIn(true)} onBlur={event => { if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) setFocusIn(false); }} onKeyDown={event => {
    const next = listKeyTarget(keys, memory.current() ?? tabKey, event.key);
    if (next === null) return;
    event.preventDefault();
    setActive(next); focusKey(next);
  }}>
    {rows.map(item => <Row key={item.key} item={item} project={project} thumbnail={item.kind === "canvas" && item.row ? thumbnailView(item.row, thumbnails.get(item.row.path)) : null}
      current={item.key === currentKey} tabbable={item.key === tabKey} open={open}
      focus={() => { memory.focus(item.key); setActive(item.key); }}
      blur={to => memory.blur(item.key, to)}>
      <RowDelete item={item} keys={keys} tabbable={item.key === tabKey} onDelete={onDelete} onFocus={() => setActive(item.key)} />
    </Row>)}
  </ul>;
}

function ListLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSlow(true), LOADING_DELAY_MS); return () => clearTimeout(timer); }, []);
  return <p className="rp-loading" role="status">{slow && <><span className="doan-spinner" aria-hidden="true" />Loading conversations</>}</p>;
}

// No glyph without a ready preview: the inset fill only, named for screen readers. A ready image stays while a new
// capture is pending (ThumbnailRequests).
function Thumb({ view }: { view: ThumbnailView | null }) {
  if (view?.kind === "ready") return <span className="cv-thumb" aria-hidden="true"><img src={view.url} alt="" /></span>;
  return <span className="cv-thumb empty"><span className="sr-only">{view?.kind === "pending" ? "Preview loading" : "Preview unavailable"}</span></span>;
}

function Row({ item, project, thumbnail, current, tabbable, open, focus, blur, children }: { item: CanvasConversationRow; project: string; thumbnail: ThumbnailView | null; current: boolean; tabbable: boolean; open(item: CanvasConversationRow): void; focus(): void; blur(to: EventTarget | null): void; children: ReactNode }) {
  const id = useId();
  const canvas = item.kind === "canvas" ? item : null;
  const problem = canvas?.problem ? canvasRowProblemText(canvas.problem, project) : null;
  // A project row draws no caption, its kind told by the missing thumbnail. A problem row is named by its title and
  // described by its canvas and reason, so the reason is read once.
  const named = problem === null ? {} : { "aria-labelledby": `${id}-name`, "aria-describedby": `${id}-why` };
  const openable = canvas?.openable ?? true;
  return <li className="cv-item">
    <button type="button" className="cv-row" data-key={item.key} data-path={canvas?.row?.path} tabIndex={tabbable ? 0 : -1} aria-current={current || undefined} aria-disabled={openable ? undefined : true} {...named}
      onClick={() => { if (openable) open(item); }} onFocus={focus} onBlur={event => blur(event.relatedTarget)}>
      <span className="cv-text">
        {canvas === null ? <><ConversationHead line={item} name={item.heading} /><small className="sr-only">Overview</small><span className="cv-preview">{item.preview}</span></>
          : problem === null ? <><ConversationHead line={item} name={item.heading} /><small className="cv-canvas">{canvas.name}</small><span className="cv-preview">{item.preview}</span></>
          : <><NameTip text={item.heading}><b id={`${id}-name`}>{item.heading}</b></NameTip><small id={`${id}-why`} className={canvas.openable ? "cv-canvas note" : "cv-canvas err"}>{`${canvas.name} · ${problem}`}</small></>}
      </span>
      {/* At the row's end, so every row's text starts at the same x. */}
      {canvas && <Thumb view={thumbnail} />}
    </button>
    {children}
  </li>;
}

// A sibling of the row button, which cannot hold a button; it shares the row's Tab stop while ↑/↓, Home and End move
// between rows. The focus target after the delete is computed now: the alert takes focus, so the list forgets the row.
export function RowDelete({ item, keys, tabbable, onDelete, onFocus }: { item: CanvasConversationRow; keys: readonly string[]; tabbable: boolean; onDelete: CanvasConversationListProps["onDelete"]; onFocus(): void }) {
  const reason = item.deletable.available ? null : item.deletable.reason;
  // Conversation ids are opaque ids (letters, digits, hyphens), safe in an id.
  const reasonId = `cv-delete-reason-${item.key}`;
  return <>
    <Tooltip><TooltipTrigger asChild>
      <button type="button" className="doan-icon-button cv-delete" aria-label={deleteItemLabel(item.title)} tabIndex={tabbable ? 0 : -1}
        {...(reason ? { "aria-disabled": true, "aria-describedby": reasonId } : {})} onFocus={onFocus}
        onClick={event => { if (!reason) onDelete(item, event.currentTarget, focusAfterLeave(keys, keys.filter(key => key !== item.key), item.key)); }}>
        <Trash2 aria-hidden="true" />
      </button>
    </TooltipTrigger><TooltipContent>{reason ?? DELETE_TOOLTIP}</TooltipContent></Tooltip>
    {reason && <span className="sr-only" id={reasonId}>{reason}</span>}
  </>;
}
