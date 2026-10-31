import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasRow } from "../main/view";
import type { ThumbnailReply } from "../main/thumbnails";

// Keyed by canvas path. A path with no entry has not been captured yet.
export type ThumbnailState = { kind: "pending" } | { kind: "ready"; url: string } | { kind: "failed" };
export type ThumbnailView = ThumbnailState | { kind: "noWidth" } | { kind: "unreadable" };

export function thumbnailView(row: CanvasRow, state: ThumbnailState | undefined): ThumbnailView {
  if (row.error) return { kind: "unreadable" };
  if (row.width === undefined) return { kind: "noWidth" };
  return state ?? { kind: "pending" };
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
    const capturable = this.rows.filter(row => row.width !== undefined).map(row => row.path);
    for (const path of capturable) if (next.has(path) && !this.asked.has(path)) this.ask(path, true);
    for (const path of capturable) if (!this.asked.has(path)) this.ask(path, false);
  }

  changed(path: string): void {
    if (this.rows.some(row => row.path === path && row.width !== undefined)) this.ask(path, this.visible.has(path));
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
