import { createHash } from "node:crypto";

export interface ThumbnailMeta {
  mtimeMs: number;
  size: number;
  appVersion: string;
  // `tokenSignature` of the folder's token CSS files when the thumbnail was taken.
  tokens: string;
}

export interface TokenFile {
  path: string;
  mtimeMs: number;
  size: number;
}

// Token CSS restyles every canvas of the folder while the canvas files' own
// mtime and size stay put, so the thumbnail records what the token files
// looked like. Order-independent; `path` only has to be consistent per folder.
export function tokenSignature(files: readonly TokenFile[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(sorted.map((file) => [file.path, file.mtimeMs, file.size]))).digest("hex");
}

// Cache files are `<key>.png` and `<key>.json` under `<userData>/thumbnails/`.
// The newline keeps root "/a" + path "b/c" apart from root "/a/b" + path "c".
export function thumbnailKey(root: string, path: string): string {
  return createHash("sha256").update(`${root}\n${path}`).digest("hex");
}

// Any mtime difference counts, not only a newer one: a restored older file is
// a different canvas. `tokens` is the current `tokenSignature`, so a token edit
// is caught whether it happened while the app ran or while it was closed.
export function thumbnailStale(meta: ThumbnailMeta | null, stat: { mtimeMs: number; size: number }, appVersion: string, tokens: string): boolean {
  if (meta === null) return true;
  return meta.mtimeMs !== stat.mtimeMs || meta.size !== stat.size || meta.appVersion !== appVersion || meta.tokens !== tokens;
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
