import { openDecision, type GitInfo } from "./view";
import type { FolderState } from "./folderState";

export type PickDecision =
  | { kind: "drop" }
  | { kind: "store"; path: string }
  | { kind: "duplicate"; path: string }
  | { kind: "scan" }
  | { kind: "confirm" }
  | { kind: "refuse"; message: string };

export interface PickFacts {
  // The picked folder's realpath.
  path: string;
  isDir: boolean;
  // `doan ls --json` run in the picked folder, which does not search ancestors
  // for a repo it was not asked about (R1): only Go decides what is a doan repo.
  ls: FolderState;
  // `ls --repo <picked>`, run only when `ls` failed (see `openDecision`).
  asRepo: FolderState | null;
  // The picked folder itself has a `.git` entry (`lstat`).
  hasGit: boolean;
  // Immediate child directories that have a `.git` entry.
  children: readonly string[];
  saved: readonly string[];
}

// Design 'Add flow: 판정' steps 1-3. Never walks up from the picked folder:
// a parent of several repos must not become a project of its own (P4).
export function classifyPick({ path, isDir, ls, asRepo, hasGit, children, saved }: PickFacts): PickDecision {
  if (!isDir) return { kind: "drop" };
  const stored = (target: string): PickDecision => (saved.includes(target) ? { kind: "duplicate", path: target } : { kind: "store", path: target });
  switch (ls.kind) {
    case "list":
      return stored(ls.root);
    case "uninitialized":
      if (hasGit || saved.includes(path)) return stored(path);
      return children.length > 0 ? { kind: "scan" } : { kind: "confirm" };
    case "error":
    case "cliError": {
      const decision = openDecision(ls, path, asRepo);
      return "store" in decision ? stored(decision.store) : { kind: "refuse", message: decision.refuse };
    }
  }
}

export type CandidateStatus = "ready" | "notSetUp" | "added" | "unreadable";

export interface Candidate {
  path: string;
  name: string;
  status: CandidateStatus;
  checked: boolean;
  disabled: boolean;
  // Worktrees of a ready repo that are not stored yet; never checked by default (R6).
  worktrees: { path: string; name: string }[];
}

// The CLI's `git` rides along with a `list` result; `FolderState` itself gains
// the field when main starts passing it through.
export type ScanResult = FolderState & { git?: GitInfo };

// CLI failures and timeouts (and a config the CLI rejects) say nothing about
// the folder, so it is shown as unreadable rather than guessed at. `lsResults`
// is keyed by child path; a child missing from it counts as unreadable.
export function scanCandidates(children: readonly string[], lsResults: ReadonlyMap<string, ScanResult>, saved: readonly string[]): Candidate[] {
  const own = new Set<string>(children);
  for (const result of lsResults.values()) if (result.kind === "list") own.add(result.root);
  return children.map((child) => {
    const ls = lsResults.get(child);
    const root = ls?.kind === "list" ? ls.root : child;
    const base = { path: root, name: basename(root), worktrees: [] as Candidate["worktrees"] };
    if (saved.includes(root) || saved.includes(child)) return { ...base, status: "added", checked: false, disabled: true };
    if (ls?.kind === "uninitialized") return { ...base, status: "notSetUp", checked: false, disabled: false };
    if (ls?.kind !== "list") return { ...base, status: "unreadable", checked: false, disabled: true };
    // A worktree that is itself a child is listed as its own candidate.
    const worktrees = (ls.git?.worktrees ?? []).filter((tree) => tree !== root && !saved.includes(tree) && !own.has(tree));
    return { ...base, status: "ready", checked: true, disabled: false, worktrees: worktrees.map((tree) => ({ path: tree, name: basename(tree) })) };
  });
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}
