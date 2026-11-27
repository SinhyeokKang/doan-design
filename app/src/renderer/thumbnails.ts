import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasRow } from "../main/view";
import type { ThumbnailReply } from "../main/thumbnails";
import type { DoanApi } from "../preload";

// A path with no entry has not been captured yet.
export type ThumbnailState = { kind: "pending" } | { kind: "ready"; url: string } | { kind: "failed" };
export type ThumbnailView = ThumbnailState | { kind: "noWidth" } | { kind: "unreadable" };

export function thumbnailView(row: CanvasRow, state: ThumbnailState | undefined): ThumbnailView {
  if (row.error) return { kind: "unreadable" };
  if (row.width === undefined) return { kind: "noWidth" };
  return state ?? { kind: "pending" };
}

export function applyVisibility(visibleRows: Map<string, string>, changes: readonly { key: string; path: string; visible: boolean }[]): Set<string> | null {
  const current = new Set(visibleRows.values());
  for (const change of changes) {
    if (change.visible) visibleRows.set(change.key, change.path);
    else visibleRows.delete(change.key);
  }
  const next = new Set(visibleRows.values());
  return next.size === current.size && [...next].every(path => current.has(path)) ? null : next;
}

// Nothing is asked before the first visibility report; main hears a canvas leave the screen only when no viewer
// shows it.
export class ThumbnailRequests {
  private items = new Map<string, ThumbnailState>();
  private rowsBy = new Map<string, readonly CanvasRow[]>();
  private visibleBy = new Map<string, ReadonlySet<string>>();
  private rows: readonly CanvasRow[] = [];
  private visible = new Set<string>();
  private asked = new Set<string>();
  // An older reply, or one for a path removed since, is dropped.
  private requests = new Map<string, number>();
  private seq = 0;
  private disposed = false;

  constructor(private readonly root: string, private readonly get: (root: string, path: string, onScreen: boolean) => Promise<ThumbnailReply>, private readonly publish: (items: ReadonlyMap<string, ThumbnailState>) => void, private readonly visibility: (root: string, path: string, visible: boolean) => void) {}

  setRows(rows: readonly CanvasRow[], viewer = ""): void {
    this.rowsBy.set(viewer, rows);
    this.listRows();
    // A shown row that gains a width is reported visible by no one again, and main notifies only paths it knows.
    this.showVisible();
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
      // Main keeps a mark until told otherwise, and a canvas it thinks visible is captured first.
      if (this.asked.has(path) && this.visible.has(path)) this.visibility(this.root, path, false);
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
      // A rejected request reads "Preview unavailable", not "Preview loading".
      if (this.disposed || this.requests.get(path) !== id) return;
      const old = this.items.get(path);
      if (old?.kind === "ready") URL.revokeObjectURL(old.url);
      this.items.set(path, { kind: "failed" });
      this.publish(new Map(this.items));
    });
  }
}

// The prototype window's main answers its playing root only.
export type ThumbnailCalls = Pick<DoanApi, "getThumbnail" | "setThumbnailVisibility" | "onThumbnailChanged">;

// Calls after release do nothing.
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
  // The next viewer takes the leaving viewer's place.
  leaving: { viewer: string; timer: ReturnType<typeof setTimeout> } | null;
}

// A thread remounts for each conversation and takes the root again only once its history is read, so the images and
// main's marks carry over the switch.
export const LEAVE_MS = 2_000;

// Disposed (its Blob URLs revoked) LEAVE_MS after the last viewer released it, unless a viewer took it meanwhile.
export class ThumbnailHub {
  private roots = new Map<string, SharedRoot>();
  private viewers = 0;

  constructor(private readonly calls: ThumbnailCalls) {}

  acquire(root: string, listener: (items: ReadonlyMap<string, ThumbnailState>) => void): ThumbnailLease {
    const existing = this.roots.get(root);
    const shared = existing ?? this.share(root);
    // The leaving viewer's rows and paths stay until this one reports its own, so nothing is dropped and asked again.
    const viewer = shared.leaving?.viewer ?? String(++this.viewers);
    if (shared.leaving) clearTimeout(shared.leaving.timer);
    shared.leaving = null;
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
        shared.leaving = { viewer, timer: setTimeout(() => {
          shared.leaving = null;
          this.roots.delete(root);
          shared.stop();
          shared.requests.dispose();
        }, LEAVE_MS) };
      },
    };
  }

  // Empty for a root no viewer holds.
  items(root: string): ReadonlyMap<string, ThumbnailState> {
    return this.roots.get(root)?.items ?? NO_ITEMS;
  }

  private share(root: string): SharedRoot {
    const listeners = new Map<string, (items: ReadonlyMap<string, ThumbnailState>) => void>();
    const requests = new ThumbnailRequests(root, (at, path, onScreen) => this.calls.getThumbnail(at, path, onScreen), items => {
      shared.items = items;
      for (const listener of listeners.values()) listener(items);
    }, (at, path, visible) => {
      void this.calls.setThumbnailVisibility(at, path, visible).catch((error: unknown) => console.error("thumbnails:visible failed", error));
    });
    const shared: SharedRoot = { requests, items: new Map(), listeners, leaving: null, stop: this.calls.onThumbnailChanged(target => { if (target.root === root) requests.changed(target.path); }) };
    this.roots.set(root, shared);
    return shared;
  }
}

const NO_ITEMS: ReadonlyMap<string, ThumbnailState> = new Map();

export function useThumbnailHub(calls: ThumbnailCalls): ThumbnailHub {
  const [hub] = useState(() => new ThumbnailHub(calls));
  return hub;
}

export function useThumbnails(hub: ThumbnailHub, root: string | null, rows: readonly CanvasRow[]): { thumbnails: ReadonlyMap<string, ThumbnailState>; onVisible: (paths: readonly string[]) => void } {
  const [thumbnails, setThumbnails] = useState<ReadonlyMap<string, ThumbnailState>>(() => root === null ? new Map() : hub.items(root));
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
