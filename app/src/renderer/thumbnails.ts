import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasRow } from "../main/view";
import type { ThumbnailReply } from "../main/thumbnails";
import type { DoanApi } from "../preload";

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

// One root's thumbnails for all its viewers. Nothing is asked before the first visibility report; an image stays while
// any viewer lists its canvas, and main hears a canvas leave the screen only when no viewer shows it.
export class ThumbnailRequests {
  private items = new Map<string, ThumbnailState>();
  private rowsBy = new Map<string, readonly CanvasRow[]>();
  private visibleBy = new Map<string, ReadonlySet<string>>();
  // Every viewer's rows and visible paths together.
  private rows: readonly CanvasRow[] = [];
  private visible = new Set<string>();
  private asked = new Set<string>();
  // Only the newest request for a listed path may land: an older reply, or one
  // for a path removed since (or removed and made again), is dropped.
  private requests = new Map<string, number>();
  private seq = 0;
  private disposed = false;

  constructor(private readonly root: string, private readonly get: (root: string, path: string, onScreen: boolean) => Promise<ThumbnailReply>, private readonly publish: (items: ReadonlyMap<string, ThumbnailState>) => void, private readonly visibility: (root: string, path: string, visible: boolean) => void) {}

  setRows(rows: readonly CanvasRow[], viewer = ""): void {
    this.rowsBy.set(viewer, rows);
    this.listRows();
  }

  onVisible(paths: readonly string[], viewer = ""): void {
    this.visibleBy.set(viewer, new Set(paths));
    this.showVisible();
  }

  release(viewer: string): void {
    this.rowsBy.delete(viewer);
    this.visibleBy.delete(viewer);
    this.listRows();
    this.showVisible();
  }

  changed(path: string): void {
    if (this.rows.some(row => row.path === path && row.width !== undefined)) this.ask(path, this.visible.has(path));
  }

  dispose(): void {
    this.visibleBy.clear();
    this.showVisible();
    this.disposed = true;
    for (const item of this.items.values()) if (item.kind === "ready") URL.revokeObjectURL(item.url);
    this.items.clear();
  }

  private listRows(): void {
    const byPath = new Map<string, CanvasRow>();
    for (const rows of this.rowsBy.values()) for (const row of rows) if (!byPath.has(row.path)) byPath.set(row.path, row);
    this.rows = [...byPath.values()];
    let changed = false;
    for (const path of new Set([...this.items.keys(), ...this.asked, ...this.visible])) {
      if (byPath.has(path)) continue;
      const item = this.items.get(path);
      if (item?.kind === "ready") URL.revokeObjectURL(item.url);
      changed = this.items.delete(path) || changed;
      this.asked.delete(path); this.visible.delete(path); this.requests.delete(path);
      for (const [viewer, visible] of this.visibleBy) if (visible.has(path)) this.visibleBy.set(viewer, new Set([...visible].filter(other => other !== path)));
    }
    if (changed) this.publish(new Map(this.items));
  }

  private showVisible(): void {
    const next = new Set<string>();
    for (const paths of this.visibleBy.values()) for (const path of paths) next.add(path);
    for (const path of this.asked) {
      if (this.visible.has(path) !== next.has(path)) this.visibility(this.root, path, next.has(path));
    }
    this.visible = next;
    if (next.size === 0) return;
    const capturable = this.rows.filter(row => row.width !== undefined).map(row => row.path);
    for (const path of capturable) if (next.has(path) && !this.asked.has(path)) this.ask(path, true);
    for (const path of capturable) if (!this.asked.has(path)) this.ask(path, false);
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
    }, (error: unknown) => {
      console.error("thumbnails:get failed", error);
      // A rejected request is a failure like a failed reply, so the row reads "Preview unavailable", not "Preview loading".
      if (this.disposed || this.requests.get(path) !== id) return;
      const old = this.items.get(path);
      if (old?.kind === "ready") URL.revokeObjectURL(old.url);
      this.items.set(path, { kind: "failed" });
      this.publish(new Map(this.items));
    });
  }
}

// `window.doan`, or the same members of `window.doanPrototype`, whose main answers its playing root only.
export type ThumbnailCalls = Pick<DoanApi, "getThumbnail" | "setThumbnailVisibility" | "onThumbnailChanged">;

// One viewer's hold on a root's shared requests; calls after release do nothing.
export interface ThumbnailLease {
  setRows(rows: readonly CanvasRow[]): void;
  onVisible(paths: readonly string[]): void;
  release(): void;
}

interface SharedRoot {
  requests: ThumbnailRequests;
  items: ReadonlyMap<string, ThumbnailState>;
  listeners: Map<string, (items: ReadonlyMap<string, ThumbnailState>) => void>;
  stop(): void;
}

// A window's thumbnails: one ThumbnailRequests per root for every viewer of that root, made on the first acquire and
// disposed (its Blob URLs revoked) when the last viewer releases it.
export class ThumbnailHub {
  private roots = new Map<string, SharedRoot>();
  private viewers = 0;

  constructor(private readonly calls: ThumbnailCalls) {}

  acquire(root: string, listener: (items: ReadonlyMap<string, ThumbnailState>) => void): ThumbnailLease {
    const viewer = String(++this.viewers);
    const existing = this.roots.get(root);
    const shared = existing ?? this.share(root);
    shared.listeners.set(viewer, listener);
    if (existing) listener(shared.items);
    let live = true;
    return {
      setRows: rows => { if (live) shared.requests.setRows(rows, viewer); },
      onVisible: paths => { if (live) shared.requests.onVisible(paths, viewer); },
      release: () => {
        if (!live) return;
        live = false;
        shared.listeners.delete(viewer);
        if (shared.listeners.size > 0) { shared.requests.release(viewer); return; }
        this.roots.delete(root);
        shared.stop();
        shared.requests.dispose();
      },
    };
  }

  private share(root: string): SharedRoot {
    const listeners = new Map<string, (items: ReadonlyMap<string, ThumbnailState>) => void>();
    const requests = new ThumbnailRequests(root, (at, path, onScreen) => this.calls.getThumbnail(at, path, onScreen), items => {
      shared.items = items;
      for (const listener of listeners.values()) listener(items);
    }, (at, path, visible) => {
      void this.calls.setThumbnailVisibility(at, path, visible).catch((error: unknown) => console.error("thumbnails:visible failed", error));
    });
    const shared: SharedRoot = { requests, items: new Map(), listeners, stop: this.calls.onThumbnailChanged(target => { if (target.root === root) requests.changed(target.path); }) };
    this.roots.set(root, shared);
    return shared;
  }
}

// One hub per window, for every viewer in it.
export function useThumbnailHub(calls: ThumbnailCalls): ThumbnailHub {
  const [hub] = useState(() => new ThumbnailHub(calls));
  return hub;
}

// One viewer's thumbnails of a root: the root's shared images and this viewer's own visibility reports.
export function useThumbnails(hub: ThumbnailHub, root: string | null, rows: readonly CanvasRow[]): { thumbnails: ReadonlyMap<string, ThumbnailState>; onVisible: (paths: readonly string[]) => void } {
  const [thumbnails, setThumbnails] = useState<ReadonlyMap<string, ThumbnailState>>(new Map());
  const lease = useRef<ThumbnailLease | null>(null);
  useEffect(() => {
    if (root === null) return;
    const current = hub.acquire(root, setThumbnails);
    lease.current = current;
    return () => { current.release(); lease.current = null; setThumbnails(new Map()); };
  }, [hub, root]);
  // After the effect above, so a new root's lease gets its rows.
  useEffect(() => { lease.current?.setRows(rows); }, [hub, root, rows]);
  const onVisible = useCallback((paths: readonly string[]) => lease.current?.onVisible(paths), []);
  return { thumbnails, onVisible };
}
