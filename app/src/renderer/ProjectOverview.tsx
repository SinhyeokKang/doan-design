import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CanvasRow } from "../main/view";
import { buildCanvasTree, type CanvasNode, type TreeNode } from "./canvasTree";
import { ChangedTime, PathTip } from "./Home";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { copyLabel, COPY_FAILED, type CopyState } from "./onboardingView";

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
export function useThumbnails(root: string | null, rows: readonly CanvasRow[]): { thumbnails: ReadonlyMap<string, ThumbnailState>; onVisible: (paths: readonly string[]) => void } {
  const [thumbnails, setThumbnails] = useState<ReadonlyMap<string, ThumbnailState>>(new Map());
  const asked = useRef(new Set<string>());
  const visible = useRef(new Set<string>());
  const live = useRef({ root, rows, thumbnails });
  live.current = { root, rows, thumbnails };
  const ask = useCallback((path: string, onScreen: boolean) => {
    const at = live.current.root;
    if (at === null) return;
    asked.current.add(path);
    void window.doan.getThumbnail(at, path, onScreen).then(reply => {
      if (live.current.root !== at) return;
      setThumbnails(previous => {
        const old = previous.get(path);
        // Keep showing the old image while a new one is made.
        if (reply.kind === "pending" && old?.kind === "ready") return previous;
        const next = new Map(previous);
        if (old?.kind === "ready") URL.revokeObjectURL(old.url);
        next.set(path, reply.kind === "ready" ? { kind: "ready", url: URL.createObjectURL(new Blob([reply.png as Uint8Array<ArrayBuffer>], { type: "image/png" })) } : reply.kind === "pending" ? { kind: "pending" } : { kind: "failed" });
        return next;
      });
    }, (error: unknown) => console.error("thumbnails:get failed", error));
  }, []);
  useEffect(() => {
    asked.current = new Set();
    visible.current = new Set();
    setThumbnails(new Map());
    if (root === null) return;
    const stop = window.doan.onThumbnailChanged(target => {
      if (target.root === live.current.root && live.current.rows.some(row => row.path === target.path)) ask(target.path, visible.current.has(target.path));
    });
    return () => { stop(); setThumbnails(previous => { for (const item of previous.values()) if (item.kind === "ready") URL.revokeObjectURL(item.url); return new Map(); }); };
  }, [root, ask]);
  const onVisible = useCallback((paths: readonly string[]) => {
    const newly = paths.filter(path => !visible.current.has(path));
    visible.current = new Set(paths);
    const capturable = live.current.rows.filter(row => row.id !== undefined && row.width !== undefined).map(row => row.path);
    // Seen again: a queued one moves ahead of the rest.
    for (const path of capturable) if (newly.includes(path) && (!asked.current.has(path) || live.current.thumbnails.get(path)?.kind === "pending")) ask(path, true);
    for (const path of capturable) if (!asked.current.has(path)) ask(path, false);
  }, [ask]);
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
    return () => observer.disconnect();
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
  return <button className="ocard" data-path={canvas.key} onClick={() => open(canvas.row)} onFocus={() => focus(canvas.key)} onBlur={event => blur(canvas.key, event.relatedTarget)}>
    <div className={`thumb${thumbnail.kind === "pending" ? " pending" : ""}`}>
      {thumbnail.kind === "ready" ? <img src={thumbnail.url} alt="" />
        : thumbnail.kind === "failed" ? <p className="thumb-msg">Preview unavailable</p>
        : thumbnail.kind === "noWidth" ? <p className="thumb-msg">Add <code>doan:width</code> to preview</p>
        : thumbnail.kind === "broken" ? <p className="thumb-msg warn">Can't read this canvas — run doan check</p>
        : null}
    </div>
    <div className="ocard-body">
      <span className="ocard-title">{canvas.name}</span>
      <PathTip text={canvas.key.replace(/^design\//, "")}><span className="ocard-file">{canvas.fileName}</span></PathTip>
      <span className="ocard-meta">{facts.frames && <>{facts.frames} · </>}{facts.open && <><span className="hot">{facts.open}</span> · </>}<ChangedTime at={canvas.row.mtimeMs} /></span>
    </div>
  </button>;
}

// The shipped first-prompt copy, moved from the sidebar to the center.
function OverviewEmpty({ root }: { root: string }) {
  const [sentence, setSentence] = useState<string | null>(null);
  const [copy, setCopy] = useState<CopyState>("idle");
  useEffect(() => {
    let live = true;
    void window.doan.firstPrompt(root).then(text => { if (live) setSentence(text); }, () => undefined);
    return () => { live = false; };
  }, [root]);
  async function copyPrompt() {
    setCopy("copying");
    let ok = false;
    try { ok = (await window.doan.copyFirstPrompt(root)).kind === "success"; } catch { /* Shown as Retry copy. */ }
    setCopy(ok ? "copied" : "failed");
  }
  const button = <button type="button" className="btn" disabled={copy === "copying"} onClick={() => void copyPrompt()}>{copy === "idle" ? "Copy first prompt" : copyLabel(copy)}</button>;
  return <div className="empty">
    <b>No canvases in design/ yet</b>
    {/* Always inside the Tooltip, so the sentence arriving does not remount a focused button. */}
    <Tooltip><TooltipTrigger asChild>{button}</TooltipTrigger>{sentence !== null && <TooltipContent className="prompt-tooltip" collisionPadding={8}>{sentence}</TooltipContent>}</Tooltip>
    {copy === "failed" ? <p role="alert">{COPY_FAILED}</p> : <p>Replace &lt;what you want to design&gt; before sending.</p>}
  </div>;
}
