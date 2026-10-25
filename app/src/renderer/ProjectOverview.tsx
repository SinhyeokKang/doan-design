import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CanvasRow } from "../main/view";
import type { ThumbnailReply } from "../main/thumbnails";
import { buildCanvasTree, type CanvasNode, type TreeNode } from "./canvasTree";
import { ChangedTime, PathTip } from "./Home";
import { FirstPrompt } from "./FirstPrompt";

// Keyed by canvas path. A path with no entry has not been captured yet.
export type ThumbnailState = { kind: "pending" } | { kind: "ready"; url: string } | { kind: "failed" };
export type ThumbnailView = ThumbnailState | { kind: "broken" } | { kind: "noWidth" };

export interface OverviewSection {
  key: string;
  canvases: CanvasNode[];
}

// Root first, then folders in tree order; a folder's section holds only its
// own canvases, so a folder of folders has none.
export function overviewSections(rows: readonly CanvasRow[]): OverviewSection[] {
  const sections: OverviewSection[] = [];
  const walk = (nodes: readonly TreeNode[], key: string) => {
    const canvases = nodes.filter((node): node is CanvasNode => node.kind === "canvas");
    if (canvases.length) sections.push({ key, canvases });
    for (const node of nodes) if (node.kind === "folder") walk(node.children, node.key);
  };
  walk(buildCanvasTree(rows), "");
  return sections;
}

// A canvas without `id` is one `doan ls` could not parse; its frame list means nothing.
export function cardFacts(row: CanvasRow): { frames?: string; open?: string } {
  const count = row.frames?.length ?? 0;
  const frames = row.id === undefined ? undefined : row.framesTruncated ? "1,000+ frames" : `${count.toLocaleString("en-US")} ${count === 1 ? "frame" : "frames"}`;
  return { ...(frames === undefined ? {} : { frames }), ...(row.open > 0 ? { open: `${row.open} open` } : {}) };
}

export function thumbnailView(row: CanvasRow, state: ThumbnailState | undefined): ThumbnailView {
  if (row.id === undefined) return { kind: "broken" };
  if (row.width === undefined) return { kind: "noWidth" };
  return state ?? { kind: "pending" };
}

// The card after the removed one in the previous order that is still listed,
// else the nearest one before it.
export function focusAfterRemoval(previous: readonly string[], current: readonly string[], focused: string): string | null {
  const at = previous.indexOf(focused);
  if (at === -1 || current.includes(focused)) return null;
  const listed = new Set(current);
  return previous.slice(at + 1).find(key => listed.has(key)) ?? previous.slice(0, at).reverse().find(key => listed.has(key)) ?? null;
}

export function applyVisibility(current: ReadonlySet<string>, changes: readonly { path: string; visible: boolean }[]): Set<string> | null {
  const next = new Set(current);
  for (const change of changes) if (change.visible) next.add(change.path); else next.delete(change.path);
  return next.size === current.size && [...next].every(path => current.has(path)) ? null : next;
}

// Thumbnails for one root's cards. Nothing is asked before the first
// visibility report, so main's queue starts with a card on screen; a pending
// reply is followed by `onThumbnailChanged`, and so is a stale image.
export class ThumbnailRequests {
  private items = new Map<string, ThumbnailState>();
  private rows: readonly CanvasRow[] = [];
  private asked = new Set<string>();
  private visible = new Set<string>();
  // Only the newest request for a listed path may land: an older reply, or one
  // for a path removed since (or removed and made again), is dropped.
  private requests = new Map<string, number>();
  private seq = 0;
  private disposed = false;

  constructor(private readonly root: string, private readonly get: (root: string, path: string, onScreen: boolean) => Promise<ThumbnailReply>, private readonly publish: (items: ReadonlyMap<string, ThumbnailState>) => void, private readonly visibility: (root: string, path: string, visible: boolean) => void) {}

  setRows(rows: readonly CanvasRow[]): void {
    this.rows = rows;
    const listed = new Set(rows.map(row => row.path));
    let changed = false;
    for (const path of new Set([...this.items.keys(), ...this.asked, ...this.visible])) {
      if (listed.has(path)) continue;
      const item = this.items.get(path);
      if (item?.kind === "ready") URL.revokeObjectURL(item.url);
      changed = this.items.delete(path) || changed;
      this.asked.delete(path); this.visible.delete(path); this.requests.delete(path);
    }
    if (changed) this.publish(new Map(this.items));
  }

  onVisible(paths: readonly string[]): void {
    const next = new Set(paths);
    for (const path of this.asked) {
      if (this.visible.has(path) !== next.has(path)) this.visibility(this.root, path, next.has(path));
    }
    this.visible = next;
    if (next.size === 0) return;
    const capturable = this.rows.filter(row => row.id !== undefined && row.width !== undefined).map(row => row.path);
    for (const path of capturable) if (next.has(path) && !this.asked.has(path)) this.ask(path, true);
    for (const path of capturable) if (!this.asked.has(path)) this.ask(path, false);
  }

  changed(path: string): void {
    if (this.rows.some(row => row.path === path)) this.ask(path, this.visible.has(path));
  }

  dispose(): void {
    this.onVisible([]);
    this.disposed = true;
    for (const item of this.items.values()) if (item.kind === "ready") URL.revokeObjectURL(item.url);
    this.items.clear();
  }

  private ask(path: string, onScreen: boolean): void {
    const id = ++this.seq;
    this.asked.add(path);
    this.requests.set(path, id);
    void this.get(this.root, path, onScreen).then(reply => {
      if (this.disposed || this.requests.get(path) !== id) return;
      const old = this.items.get(path);
      // Keep showing the old image while a new one is made.
      if (reply.kind === "pending" && old?.kind === "ready") return;
      if (old?.kind === "ready") URL.revokeObjectURL(old.url);
      this.items.set(path, reply.kind === "ready" ? { kind: "ready", url: URL.createObjectURL(new Blob([reply.png as Uint8Array<ArrayBuffer>], { type: "image/png" })) } : reply.kind === "pending" ? { kind: "pending" } : { kind: "failed" });
      this.publish(new Map(this.items));
    }, (error: unknown) => console.error("thumbnails:get failed", error));
  }
}

export function useThumbnails(root: string | null, rows: readonly CanvasRow[]): { thumbnails: ReadonlyMap<string, ThumbnailState>; onVisible: (paths: readonly string[]) => void } {
  const [thumbnails, setThumbnails] = useState<ReadonlyMap<string, ThumbnailState>>(new Map());
  const requests = useRef<ThumbnailRequests | null>(null);
  useEffect(() => {
    if (root === null) return;
    const current = new ThumbnailRequests(root, (at, path, onScreen) => window.doan.getThumbnail(at, path, onScreen), setThumbnails, (at, path, visible) => {
      void window.doan.setThumbnailVisibility(at, path, visible).catch((error: unknown) => console.error("thumbnails:visible failed", error));
    });
    requests.current = current;
    const stop = window.doan.onThumbnailChanged(target => { if (target.root === root) current.changed(target.path); });
    return () => { stop(); current.dispose(); requests.current = null; setThumbnails(new Map()); };
  }, [root]);
  // After the effect above, so a new root's requests get its rows.
  useEffect(() => { requests.current?.setRows(rows); }, [root, rows]);
  const onVisible = useCallback((paths: readonly string[]) => requests.current?.onVisible(paths), []);
  return { thumbnails, onVisible };
}

interface ProjectOverviewProps {
  root: string;
  rows: readonly CanvasRow[];
  thumbnails: ReadonlyMap<string, ThumbnailState>;
  // Paths of the cards on screen, so their thumbnails are made first.
  onVisible: (paths: readonly string[]) => void;
  open: (row: CanvasRow) => void;
}

export function ProjectOverview({ root, rows, thumbnails, onVisible, open }: ProjectOverviewProps) {
  const region = useRef<HTMLElement>(null);
  const sections = overviewSections(rows);
  const order = sections.flatMap(section => section.canvases.map(canvas => canvas.key));
  const orderKey = order.join("\n");
  const previous = useRef(order);
  // Kept through a blur to nowhere: Chromium blurs a focused card as React
  // removes it, with no related target.
  const focused = useRef<string | null>(null);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = order;
    const lost = focused.current;
    if (lost === null || (document.activeElement !== document.body && document.activeElement !== null)) return;
    const next = focusAfterRemoval(before, order, lost);
    if (next !== null) region.current?.querySelector<HTMLElement>(`.ocard[data-path="${CSS.escape(next)}"]`)?.focus();
  }, [orderKey]);
  const report = useRef(onVisible);
  report.current = onVisible;
  useEffect(() => {
    const scroller = region.current;
    if (!scroller) return;
    let visible = new Set<string>();
    const observer = new IntersectionObserver(changes => {
      const next = applyVisibility(visible, changes.map(change => ({ path: (change.target as HTMLElement).dataset.path ?? "", visible: change.isIntersecting })));
      if (next) { visible = next; report.current([...next]); }
    }, { root: scroller });
    for (const card of scroller.querySelectorAll<HTMLElement>(".ocard[data-path]")) observer.observe(card);
    return () => { observer.disconnect(); report.current([]); };
  }, [orderKey]);
  if (rows.length === 0) return <section className="ov" role="region" aria-label="Overview"><OverviewEmpty root={root} /></section>;
  return <section className="ov native-scroll" role="region" aria-label="Overview" ref={region}>
    {sections.map(section => <section key={section.key} aria-label={section.key}>
      <div className="sec">{section.key} <span className="r">{section.canvases.length}</span></div>
      <div className="ocards">{section.canvases.map(canvas => <CanvasCard key={canvas.key} canvas={canvas} thumbnail={thumbnailView(canvas.row, thumbnails.get(canvas.key))} open={open}
        focus={path => { focused.current = path; }} blur={(path, to) => { if (to !== null && focused.current === path) focused.current = null; }} />)}</div>
    </section>)}
  </section>;
}

function CanvasCard({ canvas, thumbnail, open, focus, blur }: { canvas: CanvasNode; thumbnail: ThumbnailView; open: (row: CanvasRow) => void; focus: (path: string) => void; blur: (path: string, to: EventTarget | null) => void }) {
  const facts = cardFacts(canvas.row);
  const id = useId();
  return <button className="ocard" aria-labelledby={`${id}-title ${id}-file`} aria-describedby={`${id}-thumb ${id}-meta`} data-path={canvas.key} onClick={() => open(canvas.row)} onFocus={() => focus(canvas.key)} onBlur={event => blur(canvas.key, event.relatedTarget)}>
    <div id={`${id}-thumb`} className={`thumb${thumbnail.kind === "pending" ? " pending" : ""}`}>
      {thumbnail.kind === "ready" ? <img src={thumbnail.url} alt="" />
        : thumbnail.kind === "failed" ? <p className="thumb-msg">Preview unavailable</p>
        : thumbnail.kind === "noWidth" ? <p className="thumb-msg">Add <code>doan:width</code> to preview</p>
        : thumbnail.kind === "broken" ? <p className="thumb-msg warn">Can't read this canvas — run doan check</p>
        : null}
    </div>
    <div className="ocard-body">
      <span id={`${id}-title`} className="ocard-title">{canvas.name}</span>
      <PathTip text={canvas.key.replace(/^design\//, "")}><span id={`${id}-file`} className="ocard-file">{canvas.fileName}</span></PathTip>
      <span id={`${id}-meta`} className="ocard-meta">{facts.frames && <>{facts.frames} · </>}{facts.open && <><span className="hot">{facts.open}</span> · </>}<ChangedTime at={canvas.row.mtimeMs} /></span>
    </div>
  </button>;
}

// The heading stays; the composer replaces the shipped Copy first prompt (app-setup).
function OverviewEmpty({ root }: { root: string }) {
  return <div className="empty">
    <b>No canvases in design/ yet</b>
    <div className="fp-card"><FirstPrompt root={root} /></div>
  </div>;
}
