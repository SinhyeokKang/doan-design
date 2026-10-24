import { createHash } from "node:crypto";

export interface ThumbnailMeta {
  mtimeMs: number;
  size: number;
  appVersion: string;
}

// Cache files are `<key>.png` and `<key>.json` under `<userData>/thumbnails/`.
// The newline keeps root "/a" + path "b/c" apart from root "/a/b" + path "c".
export function thumbnailKey(root: string, path: string): string {
  return createHash("sha256").update(`${root}\n${path}`).digest("hex");
}

// Any mtime difference counts, not only a newer one: a restored older file is
// a different canvas. `folderChanged` is a served file other than a canvas
// (token CSS) having changed in the folder, which restyles every canvas while
// the canvas files' own mtime and size stay put.
export function thumbnailStale(meta: ThumbnailMeta | null, stat: { mtimeMs: number; size: number }, appVersion: string, folderChanged: boolean): boolean {
  if (meta === null || folderChanged) return true;
  return meta.mtimeMs !== stat.mtimeMs || meta.size !== stat.size || meta.appVersion !== appVersion;
}

const CACHE_FILE = /^([0-9a-f]{64})\.(png|json)$/;

// Names of cache files whose key is not live. Anything that is not a cache
// entry is left alone: the directory listing is not ours to clean beyond that.
export function thumbnailGarbage(cacheNames: readonly string[], liveKeys: readonly string[]): string[] {
  const live = new Set(liveKeys);
  return cacheNames.filter((name) => {
    const key = CACHE_FILE.exec(name)?.[1];
    return key !== undefined && !live.has(key);
  });
}
