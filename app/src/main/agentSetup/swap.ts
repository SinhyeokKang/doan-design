// Replacing one of Doan's own links in a folder the person owns.
//
// Node has no exclusive rename, so a replacement never renames onto the target: it moves the target aside to a
// Doan-named entry in the same folder (rename(2) is atomic), checks that what it moved is the link Doan read and that
// the folder is still the one Doan read, and only then creates the new link exclusively. A moved link or file that is
// not Doan's goes back with an exclusive symlink or link; a moved folder is never renamed back, since that rename could
// replace an empty folder that arrived meanwhile, so it stays at the aside name and the result says where. Agents may
// see no link for that moment.
//
// Accepted residuals: the guarantee is that no entry present before Doan's check is changed or removed, and no arrival
// an exclusive call can detect is replaced. A process running as the same user already has the same power over these
// targets, so the windows that need one writing concurrently are not defended: replacing the aside entry before Doan
// unlinks it, and swapping the folder for a link between the last folder check and the following call (Node has no
// *at() calls to pin it).

// `parent` is the folder's "dev:ino" when Doan read the target; null skips the folder check.
export interface SwapArgs { path: string; want: string; old: string; aside: string; parent: string | null }
export type SwapResult = { kind: "ok" | "changed" } | { kind: "displaced"; at: string } | { kind: "failed"; code: string };
// The node:fs calls a swap makes; the runner passes its imports so tests can wrap them.
export type SwapFs = Pick<typeof import("node:fs"), "lstatSync" | "readlinkSync" | "renameSync" | "symlinkSync" | "linkSync" | "unlinkSync">;

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
    else return { kind: "displaced", at: aside };
    fs.unlinkSync(aside);
    return { kind: "changed" };
  } catch { return { kind: "displaced", at: aside }; }
}

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
