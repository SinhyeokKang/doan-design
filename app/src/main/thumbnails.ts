import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { thumbnailGarbage, thumbnailKey, thumbnailStale, tokenSignature, type ThumbnailMeta, type TokenFile } from "./thumbnailCache";
import { initialThumbnailQueue, thumbnailQueue, type ThumbnailQueueEvent } from "./thumbnailQueue";
import type { Capturer } from "./thumbnailWindow";
import type { CanvasRow, FolderEntry } from "./view";

// `pending` is answered later with `thumbnails:changed`; `unavailable` is a
// canvas that cannot be captured now (no `doan:width`, not listed, or a failed
// capture until the canvas changes).
export type ThumbnailReply = { kind: "ready"; png: Uint8Array } | { kind: "pending" } | { kind: "unavailable" };
export interface ThumbnailTarget { root: string; path: string }

export interface ThumbnailDeps {
  // `<userData>/thumbnails`; created on the first write.
  dir: string;
  appVersion: string;
  entries(): FolderEntry[];
  // Serving scope of a listed root (Shell.scope).
  scope(root: string): readonly string[];
  capturer: Capturer;
  changed(target: ThumbnailTarget): void;
}

export interface Thumbnails {
  get(root: string, path: string, visible: boolean): Promise<ThumbnailReply>;
  visible(root: string, path: string, visible: boolean): void;
  // Every folder update: forgets canvases that left the list, re-checks a
  // folder whose served files changed or only the canvases whose row revision
  // moved, and cleans the cache once at start.
  entriesChanged(entries: readonly FolderEntry[]): void;
  // Removed projects lose their cache files; `before` is the list before removal.
  removed(roots: readonly string[], before: readonly FolderEntry[]): Promise<void>;
  pause(): void;
  resume(): void;
  dispose(): void;
}

const isTemp = (name: string) => name.endsWith(".tmp");

// Entries (directories and files alike) visited for one folder's served
// signature. A folder serving more stops the walk there and counts as changed at every served revision, so its
// thumbnails are taken again rather than shown stale.
export const SERVED_WALK_LIMIT = 2000;

// Canvases are tracked by their own mtime and size; every other served file
// can restyle all of them.
const isCanvas = (path: string) => path.startsWith("doan/") && path.toLowerCase().endsWith(".html");

// Every non-canvas file the folder serves, or null once the walk has visited
// SERVED_WALK_LIMIT entries, canvases and empty directories included.
// Symlinked files count; symlinked directories are not entered, so a link
// cycle cannot run the walk forever.
async function servedFiles(root: string, scope: readonly string[]): Promise<TokenFile[] | null> {
  const files = new Map<string, TokenFile>();
  let visited = 0;
  const visit = async (path: string, enter: boolean): Promise<boolean> => {
    if (++visited > SERVED_WALK_LIMIT) return false;
    let info;
    try {
      info = await stat(join(root, path));
    } catch {
      return true;
    }
    if (info.isFile()) {
      if (isCanvas(path) || files.has(path)) return true;
      files.set(path, { path, mtimeMs: info.mtimeMs, size: info.size });
      return true;
    }
    if (!info.isDirectory() || !enter) return true;
    let names;
    try {
      names = await readdir(join(root, path), { withFileTypes: true });
    } catch {
      return true;
    }
    for (const name of names) {
      if (!await visit(`${path}/${name.name}`, name.isDirectory())) return false;
    }
    return true;
  };
  for (const entry of scope) if (!await visit(entry, true)) return null;
  return [...files.values()];
}

function parseMeta(text: string): ThumbnailMeta | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const mtimeMs: unknown = Reflect.get(value, "mtimeMs");
  const size: unknown = Reflect.get(value, "size");
  const appVersion: unknown = Reflect.get(value, "appVersion");
  const tokens: unknown = Reflect.get(value, "tokens");
  if (typeof mtimeMs !== "number" || typeof size !== "number" || typeof appVersion !== "string" || typeof tokens !== "string") return null;
  return { mtimeMs, size, appVersion, tokens };
}

function listedRow(entries: readonly FolderEntry[], target: ThumbnailTarget): CanvasRow | undefined {
  const entry = entries.find((candidate) => candidate.path === target.root);
  return entry?.kind === "list" ? entry.canvases.find((row) => row.path === target.path) : undefined;
}

export function createThumbnails(deps: ThumbnailDeps): Thumbnails {
  let queue = initialThumbnailQueue;
  // Keys asked for this session, so a change can be told to the renderer.
  const known = new Map<string, ThumbnailTarget>();
  // What the cache file, or the attempt now running or last failed, describes.
  const basis = new Map<string, ThumbnailMeta>();
  // A visibility update can arrive while get is awaiting the cache.
  const visibility = new Map<string, boolean>();
  // Per root, the servedRev and row revisions of the last update.
  const revs = new Map<string, { served: number; rows: Map<string, number | undefined> }>();
  // One served signature per folder and served revision.
  const signatures = new Map<string, { rev: number; value: Promise<string> }>();
  // Cache writes and removals of one key run one after another, so a removal
  // cannot finish while a write it overtook still makes files.
  const locks = new Map<string, Promise<void>>();
  let running = false;
  let cleaned = false;
  let disposed = false;
  // Startup collection may overlap a cache write from an already-loaded root.
  const activeTemps = new Set<string>();

  const writeAtomic = async (path: string, bytes: Uint8Array | string): Promise<void> => {
    const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
    activeTemps.add(temp);
    try {
      await writeFile(temp, bytes, { flag: "wx" });
      await rename(temp, path);
    } catch (error) {
      await unlink(temp).catch(() => {});
      throw error;
    } finally {
      activeTemps.delete(temp);
    }
  };

  const serial = (key: string, task: () => Promise<void>): Promise<void> => {
    const next = (locks.get(key) ?? Promise.resolve()).then(task);
    const settled = next.catch(() => {});
    locks.set(key, settled);
    void settled.then(() => { if (locks.get(key) === settled) locks.delete(key); });
    return next;
  };

  const dispatch = (event: ThumbnailQueueEvent) => {
    queue = thumbnailQueue(queue, event);
    if (queue.active !== null && !running && !disposed) void run(queue.active);
  };

  // Token CSS and every other served file restyle the folder's canvases
  // while the canvas files stay put. The watcher bumps `servedRev` for each
  // served change, so the walk runs once per revision, not per get.
  const tokens = (root: string): Promise<string> => {
    const entry = deps.entries().find((candidate) => candidate.path === root);
    const rev = entry?.kind === "list" ? entry.servedRev : undefined;
    const cached = signatures.get(root);
    if (rev !== undefined && cached?.rev === rev) return cached.value;
    const value = servedFiles(root, deps.scope(root)).then((files) => (files === null ? randomBytes(32).toString("hex") : tokenSignature(files)));
    if (rev !== undefined) signatures.set(root, { rev, value });
    return value;
  };

  const current = async (target: ThumbnailTarget): Promise<ThumbnailMeta | null> => {
    try {
      const info = await stat(join(target.root, target.path));
      return { mtimeMs: info.mtimeMs, size: info.size, appVersion: deps.appVersion, tokens: await tokens(target.root) };
    } catch {
      return null;
    }
  };

  const files = (key: string) => ({ png: join(deps.dir, `${key}.png`), json: join(deps.dir, `${key}.json`) });

  const readCache = async (key: string): Promise<{ meta: ThumbnailMeta; png: Uint8Array } | null> => {
    try {
      const meta = parseMeta(await readFile(files(key).json, "utf8"));
      return meta === null ? null : { meta, png: await readFile(files(key).png) };
    } catch {
      return null;
    }
  };

  // PNG first: a meta without its image is never read as fresh.
  const writeCache = async (key: string, png: Buffer, meta: ThumbnailMeta) => {
    await mkdir(deps.dir, { recursive: true });
    await writeAtomic(files(key).png, png);
    await writeAtomic(files(key).json, `${JSON.stringify(meta)}\n`);
  };

  const run = async (key: string) => {
    running = true;
    const target = known.get(key);
    const row = target === undefined ? undefined : listedRow(deps.entries(), target);
    let png: Buffer | null = null;
    if (target !== undefined && row?.width !== undefined) {
      const meta = await current(target);
      if (meta !== null) {
        basis.set(key, meta);
        const captured = await deps.capturer.capture(row.url, row.width);
        png = captured;
        if (captured !== null) {
          await serial(key, async () => {
            // Forgotten while it ran: the capture shows an older canvas (queue
            // contract). Checked inside the lock, after any removal queued first.
            if (queue.activeStale || disposed) return;
            try {
              await writeCache(key, captured, meta);
            } catch (error) {
              console.error("doan: cannot save a thumbnail", error);
              png = null;
            }
          });
        }
      }
    }
    const stale = queue.activeStale;
    running = false;
    dispatch({ type: png === null ? "fail" : "done", key });
    if (target !== undefined && !stale && !disposed) deps.changed(target);
  };

  const forget = (key: string) => {
    basis.delete(key);
    dispatch({ type: "forget", key });
  };

  // `paths` limits the check to those canvases; without it, every canvas of the root.
  const recheck = async (root: string, paths?: ReadonlySet<string>) => {
    for (const [key, target] of known) {
      const before = basis.get(key);
      if (target.root !== root || before === undefined || (paths !== undefined && !paths.has(target.path))) continue;
      const now = await current(target);
      if (basis.get(key) !== before) continue;
      if (now === null || thumbnailStale(before, now, deps.appVersion, now.tokens)) {
        forget(key);
        deps.changed(target);
      }
    }
  };

  const collect = async (entries: readonly FolderEntry[]) => {
    let names: string[];
    try {
      names = await readdir(deps.dir);
    } catch {
      return;
    }
    const live = entries.flatMap((entry) => (entry.kind === "list" ? entry.canvases.map((row) => thumbnailKey(entry.path, row.path)) : []));
    const garbage = [...thumbnailGarbage(names, live), ...names.filter(name => isTemp(name) && !activeTemps.has(join(deps.dir, name)))];
    await Promise.all(garbage.map((name) => unlink(join(deps.dir, name)).catch(() => {})));
  };

  return {
    async get(root, path, visible) {
      const target = { root, path };
      const row = listedRow(deps.entries(), target);
      if (row?.width === undefined) return { kind: "unavailable" };
      const key = thumbnailKey(root, path);
      known.set(key, target);
      visibility.set(key, visible);
      if (queue.failed.includes(key)) return { kind: "unavailable" };
      if ((queue.active === key && !queue.activeStale) || queue.pending.some((job) => job.key === key)) {
        dispatch({ type: "visible", key, visible });
        return { kind: "pending" };
      }
      const [now, cached] = await Promise.all([current(target), readCache(key)]);
      if (now === null) return { kind: "unavailable" };
      if (cached !== null && !thumbnailStale(cached.meta, now, deps.appVersion, now.tokens)) {
        basis.set(key, cached.meta);
        return { kind: "ready", png: cached.png };
      }
      dispatch({ type: "request", key, visible: visibility.get(key) ?? false });
      return { kind: "pending" };
    },
    visible(root, path, visible) {
      const key = thumbnailKey(root, path);
      if (!known.has(key) || listedRow(deps.entries(), { root, path }) === undefined) return;
      visibility.set(key, visible);
      dispatch({ type: "visible", key, visible });
    },
    entriesChanged(entries) {
      for (const [key, target] of known) {
        const entry = entries.find((candidate) => candidate.path === target.root);
        // A loading or problem row keeps its canvases; a gone root or canvas does not.
        if (entry === undefined || (entry.kind === "list" && !entry.canvases.some((row) => row.path === target.path))) {
          known.delete(key);
          visibility.delete(key);
          forget(key);
        }
      }
      for (const entry of entries) {
        if (entry.kind !== "list") continue;
        const seen = revs.get(entry.path);
        revs.set(entry.path, { served: entry.servedRev, rows: new Map(entry.canvases.map((row) => [row.path, row.rev])) });
        if (seen === undefined) continue;
        if (seen.served !== entry.servedRev) {
          void recheck(entry.path);
          continue;
        }
        // The served signature still stands, so only these canvases can be stale.
        const moved = new Set(entry.canvases.filter((row) => seen.rows.get(row.path) !== row.rev).map((row) => row.path));
        if (moved.size > 0) void recheck(entry.path, moved);
      }
      for (const root of revs.keys()) if (!entries.some((entry) => entry.path === root)) revs.delete(root);
      for (const root of signatures.keys()) if (!entries.some((entry) => entry.path === root)) signatures.delete(root);
      if (!cleaned && entries.every((entry) => entry.kind !== "loading")) {
        cleaned = true;
        void collect(entries);
      }
    },
    async removed(roots, before) {
      const keys = before.flatMap((entry) => (entry.kind === "list" && roots.includes(entry.path) ? entry.canvases.map((row) => thumbnailKey(entry.path, row.path)) : []));
      for (const [key, target] of known) if (roots.includes(target.root)) keys.push(key);
      const unique = [...new Set(keys)];
      // Forget them all first: a write waiting for its lock then sees it is stale.
      for (const key of unique) {
        known.delete(key);
        visibility.delete(key);
        forget(key);
      }
      await Promise.all(unique.map((key) => serial(key, async () => {
        await Promise.all([files(key).png, files(key).json].map((file) => unlink(file).catch(() => {})));
      })));
    },
    pause: () => dispatch({ type: "pause" }),
    resume: () => dispatch({ type: "resume" }),
    dispose() {
      disposed = true;
      deps.capturer.close();
    },
  };
}
