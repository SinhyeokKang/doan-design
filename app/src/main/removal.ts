import type { FolderEntry } from "./view";

// The removal toast's "<label> removed." A row is "<repo> (<branch>)"; a card
// is "<repo> and N worktrees". The repo name follows the home card's rule: the
// main worktree's folder, else the first row's folder.
export function removalLabel(entries: readonly FolderEntry[]): string {
  const first = entries[0];
  if (!first) return "";
  const main = entries.map(gitOf).find((git) => git?.main !== undefined)?.main;
  const name = basename(main ?? first.path);
  if (entries.length > 1) {
    const others = entries.length - 1;
    return `${name} and ${others} ${others === 1 ? "worktree" : "worktrees"}`;
  }
  const git = gitOf(first);
  const head = git?.branch ?? (git?.detached ? `detached ${git.detached.slice(0, 7)}` : undefined);
  return head === undefined ? name : `${name} (${head})`;
}

function gitOf(entry: FolderEntry) {
  return entry.kind === "list" ? entry.git : undefined;
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}
