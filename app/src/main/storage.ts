import type { FolderEntry } from "./view";

// Where a project's .doan/ is kept, as `doan ls` and `doan config` report it (ARCHITECTURE §12 'Storage'): "repo"
// commits it, "local" keeps it out of Git through the repository's shared exclude file, "unknown" means the Git
// metadata could not be read. The reason says why "local" cannot be chosen; absent when it can.
export type StorageMode = "repo" | "local" | "unknown";
export type StorageReason = "not_git" | "git_unreadable" | "exclude_unwritable";
export interface StorageFacts { storage?: StorageMode; storageReason?: StorageReason }

// The fixed label for the exclude file in setup plans and CLI results: in a linked worktree or submodule .git is a
// file, so this is not the real path.
export const EXCLUDE_LABEL = ".git/info/exclude";

const MODES: readonly unknown[] = ["repo", "local", "unknown"];
const REASONS: readonly unknown[] = ["not_git", "git_unreadable", "exclude_unwritable"];

// A value an older or foreign CLI did not send, or sent wrong, is left out rather than failing the result: the app then
// shows no mode at all instead of a wrong one.
export function storageFacts(result: object): StorageFacts {
  const storage: unknown = Reflect.get(result, "storage");
  const reason: unknown = Reflect.get(result, "storageReason");
  if (!MODES.includes(storage)) return {};
  return { storage: storage as StorageMode, ...(REASONS.includes(reason) ? { storageReason: reason as StorageReason } : {}) };
}

// A folder not set up yet has no mode of its own (`doan ls` answers repo_not_found), but the mode belongs to the
// Doan root across every worktree (PRODUCT §5 item 0 'Doan files'). A listed root of the same repository and the same
// root path names this folder in its `git.worktrees` (the same rule as auto-registration, ARCHITECTURE §4), so its
// mode is this folder's too. Nothing in TS reads Git for it (§13).
export function projectKeepsLocal(entries: readonly FolderEntry[], path: string): boolean {
  return entries.some(entry => entry.path !== path && entry.kind === "list" && entry.storage === "local" && !!entry.git?.worktrees.includes(path));
}

// The stored roots of `root`'s project group: the sidebar's card (`git.common`, or the last one seen for a row that is
// not a list) plus any stored worktree a listed root names. A mode written for one root is read again for all of them.
export function groupRoots(entries: readonly FolderEntry[], root: string): string[] {
  const common = (entry: FolderEntry) => entry.kind === "list" ? entry.git?.common : entry.lastCommon;
  const own = entries.find(entry => entry.path === root);
  const key = own && common(own);
  const named = new Set(entries.flatMap(entry => entry.kind === "list" && entry.git?.worktrees.includes(root) ? entry.git.worktrees : []));
  if (own?.kind === "list") for (const path of own.git?.worktrees ?? []) named.add(path);
  return entries.filter(entry => entry.path === root || (key !== undefined && common(entry) === key) || named.has(entry.path)).map(entry => entry.path);
}
