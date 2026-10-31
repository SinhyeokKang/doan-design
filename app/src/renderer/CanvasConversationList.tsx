import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { canvasRowProblemText, type CanvasConversationRow } from "./canvasConversationRows";
import { ConversationHead } from "./ConversationLine";
import { focusAfterLeave, listKeyTarget } from "./listKeyboard";
import { applyVisibility, thumbnailView, type ThumbnailState, type ThumbnailView } from "./thumbnails";

// The Overview's right panel body (buzz-project design §2.3, §2.5): canvases with a current conversation.

export type CanvasList = readonly CanvasConversationRow[] | "loading" | "error";

const LOADING_DELAY_MS = 300;

export interface CanvasConversationListProps {
  list: CanvasList; project: string; thumbnails: ReadonlyMap<string, ThumbnailState>;
  open(item: CanvasConversationRow): void; retry(): void; onVisible(paths: readonly string[]): void;
  // The panel's scroller observes thumbnail visibility; its title takes focus when the list empties under it.
  scroller: RefObject<HTMLElement | null>; title: RefObject<HTMLElement | null>;
}

export function CanvasConversationList({ list, project, thumbnails, open, retry, onVisible, scroller, title }: CanvasConversationListProps) {
  const loading = list === "loading";
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!loading) return;
    const timer = setTimeout(() => setSlow(true), LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  const rows = Array.isArray(list) ? list : [];
  const keys = rows.map(item => item.key);
  const [active, setActive] = useState<string | null>(null);
  const tabKey = active !== null && keys.includes(active) ? active : keys[0] ?? null;
  const listRef = useRef<HTMLUListElement>(null);
  // The row holding focus. A blur to nowhere (window blur, the row's removal) keeps it, so a removal can move focus on.
  const focused = useRef<string | null>(null);
  const focusKey = (key: string) => listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();

  const previous = useRef(keys);
  const keysKey = keys.join("\n");
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = keys;
    const at = focused.current;
    if (at === null || keys.includes(at)) return;
    focused.current = null;
    // Focus the person already moved elsewhere stays there.
    const now = document.activeElement;
    if (now && now !== document.body && now.isConnected) return;
    const target = focusAfterLeave(before, keys, at);
    if (target.kind === "row") { setActive(target.key); focusKey(target.key); } else title.current?.focus();
  }, [keysKey]);

  const report = useRef(onVisible);
  report.current = onVisible;
  const paths = rows.flatMap(item => item.row ? [item.row.path] : []).join("\n");
  useEffect(() => {
    const root = scroller.current;
    if (!root || paths === "") return;
    let visible = new Set<string>();
    const observer = new IntersectionObserver(changes => {
      const next = applyVisibility(visible, changes.map(change => ({ path: (change.target as HTMLElement).dataset.path ?? "", visible: change.isIntersecting })));
      if (next) { visible = next; report.current([...next]); }
    }, { root });
    for (const row of root.querySelectorAll<HTMLElement>(".cv-row[data-path]")) observer.observe(row);
    return () => { observer.disconnect(); report.current([]); };
  }, [paths]);

  if (list === "loading") return slow ? <ListLoading /> : null;
  if (list === "error") return <div className="rp-error" role="status"><span>Couldn’t read conversations</span>
    <button type="button" className="doan-button" data-ui-size="sm" data-ui-variant="panel" onClick={retry}>Retry</button></div>;
  if (rows.length === 0) return <div className="rp-empty"><p>No canvas conversations yet.</p><p>When a conversation draws or edits a canvas, the canvas shows here.</p></div>;
  return <ul className="rp-list" role="list" ref={listRef} onKeyDown={event => {
    const next = listKeyTarget(keys, focused.current ?? tabKey, event.key);
    if (next === null) return;
    event.preventDefault();
    setActive(next); focusKey(next);
  }}>
    {rows.map(item => <Row key={item.key} item={item} project={project} thumbnail={item.row ? thumbnailView(item.row, thumbnails.get(item.row.path)) : null} tabbable={item.key === tabKey} open={open}
      focus={() => { focused.current = item.key; setActive(item.key); }}
      blur={to => { if (to !== null && focused.current === item.key) focused.current = null; }} />)}
  </ul>;
}

export function ListLoading() {
  return <p className="rp-loading" role="status">Loading canvas conversations…</p>;
}

// No glyph without a ready preview: the inset fill only, named for screen readers. A failed capture never hides a
// ready image, since ThumbnailRequests keeps the image until a new one replaces it (POSTMORTEM 2026-10-25).
function Thumb({ view }: { view: ThumbnailView | null }) {
  if (view?.kind === "ready") return <span className="cv-thumb" aria-hidden="true"><img src={view.url} alt="" /></span>;
  return <span className="cv-thumb empty"><span className="sr-only">{view?.kind === "pending" ? "Preview loading" : "Preview unavailable"}</span></span>;
}

function Row({ item, project, thumbnail, tabbable, open, focus, blur }: { item: CanvasConversationRow; project: string; thumbnail: ThumbnailView | null; tabbable: boolean; open(item: CanvasConversationRow): void; focus(): void; blur(to: EventTarget | null): void }) {
  const id = useId();
  const problem = item.problem ? canvasRowProblemText(item.problem, project) : null;
  // A problem row is named by its canvas and described by its reason, so the reason is read once.
  const named = problem === null ? {} : { "aria-labelledby": `${id}-name`, "aria-describedby": `${id}-why` };
  return <li className="cv-item">
    <button type="button" className="cv-row" data-key={item.key} data-path={item.row?.path} tabIndex={tabbable ? 0 : -1} aria-disabled={item.openable ? undefined : true} {...named}
      onClick={() => { if (item.openable) open(item); }} onFocus={focus} onBlur={event => blur(event.relatedTarget)}>
      <Thumb view={thumbnail} />
      <span className="cv-text">
        {problem === null ? <><ConversationHead line={item} name={item.name} /><span className="cv-preview">{item.preview}</span></>
          : <><b id={`${id}-name`}>{item.name}</b><small id={`${id}-why`} className={item.openable ? "note" : "err"}>{problem}</small></>}
      </span>
    </button>
  </li>;
}
