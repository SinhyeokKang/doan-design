import { readRegularFileNoFollowSync } from "../regularFile";

// A replacement never renames onto the target: it moves it aside, verifies what it moved, then creates exclusively.
// Rules and accepted residuals: ARCHITECTURE §7 'Agent setup'.

// `parent` is the folder's "dev:ino" when Doan read the target; null skips the folder check.
export interface SwapArgs { path: string; want: string; old: string; aside: string; parent: string | null }
export type SwapResult = { kind: "ok" | "changed" } | { kind: "displaced"; at: string } | { kind: "failed"; code: string };
// The node:fs calls a swap makes; the runner passes its imports so tests can wrap them.
export type SwapFs = Pick<typeof import("node:fs"), "lstatSync" | "readlinkSync" | "renameSync" | "symlinkSync" | "linkSync" | "unlinkSync">;
// `staged` is the merged file, `id` the "dev:ino" and `bytes` the bytes of the file Doan read and merged into.
// `aside` may be in another folder on the same volume, one that no other writer can reach.
export interface FileSwapArgs { path: string; staged: string; id: string; bytes: Uint8Array; aside: string; parent: string | null }

function code(error: unknown): string { return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN"; }
function parentOf(path: string): string { return path.slice(0, path.lastIndexOf("/")) || "/"; }
function parentId(fs: SwapFs, path: string): string | null {
  try { const s = fs.lstatSync(parentOf(path)); return s.isDirectory() ? `${s.dev}:${s.ino}` : null; } catch { return null; }
}

function restore(fs: SwapFs, path: string, aside: string): SwapResult {
  try {
    const s = fs.lstatSync(aside);
    if (s.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(aside), path);
    else if (s.isFile()) fs.linkSync(aside, path);
    // A folder stays aside: renaming it back could replace an empty folder that arrived meanwhile.
    else return { kind: "displaced", at: aside };
    fs.unlinkSync(aside);
    return { kind: "changed" };
  } catch { return { kind: "displaced", at: aside }; }
}

// Undefended same-user windows: replacing the aside entry before Doan unlinks it, or swapping the folder between checks.
export function swapLink(fs: SwapFs, a: SwapArgs): SwapResult {
  if (a.parent !== null && parentId(fs, a.path) !== a.parent) return { kind: "changed" };
  try { fs.renameSync(a.path, a.aside); } catch (error) { return code(error) === "ENOENT" ? { kind: "changed" } : { kind: "failed", code: code(error) }; }
  let ours = false;
  try { ours = fs.lstatSync(a.aside).isSymbolicLink() && fs.readlinkSync(a.aside) === a.old; } catch { ours = false; }
  if (!ours || (a.parent !== null && parentId(fs, a.path) !== a.parent)) return restore(fs, a.path, a.aside);
  try { fs.symlinkSync(a.want, a.path); } catch (error) {
    if (code(error) !== "EEXIST") { const back = restore(fs, a.path, a.aside); return back.kind === "displaced" ? back : { kind: "failed", code: code(error) }; }
    // Something arrived at the empty name: it stays, and Doan's old link goes.
    try { fs.unlinkSync(a.aside); } catch { return { kind: "displaced", at: a.aside }; }
    return { kind: "changed" };
  }
  try { fs.unlinkSync(a.aside); } catch { return { kind: "displaced", at: a.aside }; }
  return { kind: "ok" };
}

// The same rule for a regular file another program also writes (Claude Code's settings), compared by dev:ino and bytes;
// a newer save is kept and the result is `changed` (ARCHITECTURE §7 'Agent setup', including the accepted residual).
export function swapFile(fs: SwapFs, a: FileSwapArgs): SwapResult {
  if (a.parent !== null && parentId(fs, a.path) !== a.parent) return { kind: "changed" };
  try { fs.renameSync(a.path, a.aside); } catch (error) { return code(error) === "ENOENT" ? { kind: "changed" } : { kind: "failed", code: code(error) }; }
  let read = false;
  // Another writer in the folder can put a FIFO or a bigger file at the aside name after the lstat: the read must not
  // block or grow main, and either is not the file Doan read.
  try { const s = fs.lstatSync(a.aside); read = s.isFile() && `${s.dev}:${s.ino}` === a.id && readRegularFileNoFollowSync(a.aside, a.bytes.length).equals(a.bytes); } catch { read = false; }
  if (!read || (a.parent !== null && parentId(fs, a.path) !== a.parent)) return restore(fs, a.path, a.aside);
  try { fs.linkSync(a.staged, a.path); } catch (error) {
    if (code(error) !== "EEXIST") { const back = restore(fs, a.path, a.aside); return back.kind === "displaced" ? back : { kind: "failed", code: code(error) }; }
    // A newer file arrived at the empty name: it stays, and the copy Doan read goes.
    try { fs.unlinkSync(a.aside); } catch { return { kind: "displaced", at: a.aside }; }
    return { kind: "changed" };
  }
  try { fs.unlinkSync(a.aside); } catch { return { kind: "displaced", at: a.aside }; }
  return { kind: "ok" };
}
