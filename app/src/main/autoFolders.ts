import type { FolderState } from "./folderState";

// Rules for worktrees the app registers on its own (ARCHITECTURE §4 'Auto-registration'); the I/O is the caller's.

// A registered root in `view.git.worktrees` means "same repository, same relative path, another worktree". The request
// root must equal the listing's root as a string: the app never re-derives a root a token holder sends.
export function autoRegisterRoot(view: FolderState, request: { root: string }, registered: readonly string[]): boolean {
  if (view.kind !== "list" || view.root !== request.root || registered.includes(request.root)) return false;
  return view.git?.worktrees.some((root) => registered.includes(root)) ?? false;
}

// Only these say the folder is gone; EACCES and the like say nothing about whether it is there.
const GONE = new Set(["ENOENT", "ENOTDIR"]);

// `missing` maps a root whose folder could not be read to its errno code (undefined when unknown). A vanished
// auto-registered root leaves the list; a hand-added one stays and shows as missing.
export function pruneAuto(list: readonly string[], auto: readonly string[], missing: ReadonlyMap<string, string | undefined>): string[] {
  return list.filter((root) => {
    const code = missing.get(root);
    return !(auto.includes(root) && code !== undefined && GONE.has(code));
  });
}

// Adding a root by hand (including one already stored: `duplicate`, `existing`) makes it hand-added.
export function autoAfterAdd(auto: readonly string[], root: string): string[] {
  return auto.filter((entry) => entry !== root);
}

// `list` is null when folders.json could not be read: an empty fallback list is no ground for deleting marks.
export function storedAuto(auto: readonly string[], list: readonly string[] | null): string[] {
  return list === null ? [...auto] : auto.filter((root) => list.includes(root));
}
