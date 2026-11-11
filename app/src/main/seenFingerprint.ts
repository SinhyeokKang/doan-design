import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { join } from "node:path";

// A canvas's content fingerprint: `sha256:<hex>` of its raw HTML bytes, the same string the local server records for
// the bytes it sent (`ResponseRecord.hash`), so a shown document and a file on disk compare as strings. Nothing is
// normalised: a line-ending or BOM change is a change.
export const fingerprintOf = (bytes: Uint8Array): string => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export interface Fingerprints {
  // null when the file cannot be read, or changed while it was read (the listing that follows reads it again).
  of(root: string, path: string): Promise<string | null>;
}

// Cached by the file's identity and times, so a listing re-hashes only files that changed. The cache only saves work:
// a miss reads the file again, it never decides a verdict.
export function createFingerprints(): Fingerprints {
  const cache = new Map<string, { key: string; hash: string }>();
  return {
    async of(root, path) {
      const file = join(root, path);
      let handle;
      try { handle = await open(file, "r"); } catch { return null; }
      try {
        const keyOf = (stat: { ino: bigint; size: bigint; mtimeNs: bigint; ctimeNs: bigint }) => `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
        const before = await handle.stat({ bigint: true });
        if (!before.isFile()) return null;
        const key = keyOf(before);
        const cached = cache.get(file);
        if (cached?.key === key) return cached.hash;
        const bytes = await handle.readFile();
        if (keyOf(await handle.stat({ bigint: true })) !== key) return null;
        const hash = fingerprintOf(bytes);
        cache.set(file, { key, hash });
        return hash;
      } catch {
        return null;
      } finally {
        await handle.close();
      }
    },
  };
}
