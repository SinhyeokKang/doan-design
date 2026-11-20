import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, relative } from "node:path";
import { readRegularFileNoFollowSync } from "../../app/src/main/regularFile.ts";

// The CLI caps canvases for prototype playback and assembled export pages at 50 MiB.
export const CANVAS_BYTES = 50 << 20;
// Logs and rollouts can hold many successive canvas snapshots or tool results.
export const LOG_BYTES = 256 << 20;
export const ATTRIBUTES_BYTES = 1 << 20;
// JSON escaping can expand each .gitattributes byte to six, plus the init config and keys.
export const MANIFEST_BYTES = 6 * ATTRIBUTES_BYTES + 1024;

export function resolveInside(repo: string, path: string): string {
  if (path === "" || isAbsolute(path)) throw new Error(`not a repo-relative path: ${JSON.stringify(path)}`);
  const full = join(repo, path);
  const rel = relative(repo, full);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`path leaves the repo: ${path}`);
  return normalize(full);
}

// Resolve the deepest existing ancestor so a missing file under an outside link is still refused.
export function resolveOnDisk(repo: string, path: string): string {
  const full = resolveInside(repo, path);
  let probe = full;
  let real: string;
  for (;;) {
    try { real = realpathSync(probe); break; } catch { probe = dirname(probe); }
  }
  const rel = relative(realpathSync(repo), real);
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) throw new Error(`path leaves the repo: ${path}`);
  return join(real, relative(probe, full));
}

// A named result belongs to its run directory. Internal aliases still resolve to the same bytes.
export function readArtifact(path: string, limit: number): Buffer {
  return readRegularFileNoFollowSync(resolveOnDisk(dirname(path), basename(path)), limit);
}
