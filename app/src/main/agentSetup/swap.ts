// The last step of writing a link, shared by the app and the administrator shell, which runs this same source under
// the app's executable as Node. It is plain JavaScript in a string so a bundler cannot rewrite what root runs.
//
// Node has no exclusive rename, so a replacement never renames onto the target: it moves the target aside to a name
// Doan owns (rename(2) is atomic), checks that what it moved is Doan's link and that the folder is still the one Doan
// read, and only then creates the new link exclusively. Anything else that was moved aside goes back without
// replacing what arrived meanwhile; if that cannot be done it stays at the aside name and the result says where.
// Agents may see no link for that moment. Limit: without *at() calls, a folder swapped for a link between the last
// folder check and the new link's creation can leave Doan's new link in the swapped-in folder; creation is exclusive,
// so nothing there is replaced.

// `parent` is the folder's "dev:ino" when Doan read the target; null skips the folder check.
export interface SwapArgs { path: string; want: string; old: string; aside: string; parent: string | null }
export interface CreateArgs { path: string; want: string; mkdir: boolean }
export type SwapResult = { kind: "ok" | "changed" } | { kind: "displaced"; at: string } | { kind: "failed"; code: string };
// The node:fs calls the source uses; tests pass the mocked module.
export type SwapFs = Pick<typeof import("node:fs"), "lstatSync" | "readlinkSync" | "renameSync" | "symlinkSync" | "linkSync" | "unlinkSync" | "mkdirSync">;

// No line comments: the administrator shell receives this as one line.
export const SWAP_SOURCE = [
  "function code(e) { return e && e.code ? String(e.code) : 'UNKNOWN'; }",
  "function parentOf(path) { return path.slice(0, path.lastIndexOf('/')) || '/'; }",
  "function parentId(fs, path) { try { const s = fs.lstatSync(parentOf(path)); return s.isDirectory() ? s.dev + ':' + s.ino : null; } catch (e) { return null; } }",
  "function restore(fs, path, aside) {",
  "  try {",
  "    const s = fs.lstatSync(aside);",
  "    if (s.isSymbolicLink()) { fs.symlinkSync(fs.readlinkSync(aside), path); fs.unlinkSync(aside); }",
  "    else if (s.isFile()) { fs.linkSync(aside, path); fs.unlinkSync(aside); }",
  "    else {",
  "      let free = false; try { fs.lstatSync(path); } catch (e) { free = code(e) === 'ENOENT'; }",
  "      if (!free) return { kind: 'displaced', at: aside };",
  "      fs.renameSync(aside, path);",
  "    }",
  "    return { kind: 'changed' };",
  "  } catch (e) { return { kind: 'displaced', at: aside }; }",
  "}",
  "function swap(fs, a) {",
  "  if (a.parent !== null && parentId(fs, a.path) !== a.parent) return { kind: 'changed' };",
  "  try { fs.renameSync(a.path, a.aside); } catch (e) { return code(e) === 'ENOENT' ? { kind: 'changed' } : { kind: 'failed', code: code(e) }; }",
  "  let ours = false;",
  "  try { ours = fs.lstatSync(a.aside).isSymbolicLink() && fs.readlinkSync(a.aside) === a.old; } catch (e) { ours = false; }",
  "  if (!ours || (a.parent !== null && parentId(fs, a.path) !== a.parent)) return restore(fs, a.path, a.aside);",
  "  try { fs.symlinkSync(a.want, a.path); } catch (e) {",
  "    if (code(e) !== 'EEXIST') { const back = restore(fs, a.path, a.aside); return back.kind === 'displaced' ? back : { kind: 'failed', code: code(e) }; }",
  "    try { fs.unlinkSync(a.aside); } catch (e2) { return { kind: 'displaced', at: a.aside }; }",
  "    return { kind: 'changed' };",
  "  }",
  "  try { fs.unlinkSync(a.aside); } catch (e) { return { kind: 'displaced', at: a.aside }; }",
  "  return { kind: 'ok' };",
  "}",
  "function create(fs, a) {",
  "  try { if (a.mkdir) fs.mkdirSync(parentOf(a.path), { recursive: true }); fs.symlinkSync(a.want, a.path); }",
  "  catch (e) { return code(e) === 'EEXIST' ? { kind: 'changed' } : { kind: 'failed', code: code(e) }; }",
  "  return { kind: 'ok' };",
  "}",
].join(" ");

const compiled = new Function(`${SWAP_SOURCE} return { swap, create };`)() as {
  swap: (fs: SwapFs, args: SwapArgs) => SwapResult;
  create: (fs: SwapFs, args: CreateArgs) => SwapResult;
};
export const swapLink = compiled.swap, createLink = compiled.create;

// What the administrator shell runs: `-e <ROOT_SCRIPT> <json>`, exit 0 only when the link is in place.
export const ROOT_SCRIPT = `${SWAP_SOURCE} const fs = require('fs'); const a = JSON.parse(process.argv[1]); const r = 'old' in a ? swap(fs, a) : create(fs, a); process.exit(r.kind === 'ok' ? 0 : 3);`;
