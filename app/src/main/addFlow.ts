import { openDecision } from "./view";
import type { FolderState } from "./folderState";

export type PickDecision =
  | { kind: "drop" }
  | { kind: "store"; path: string }
  | { kind: "duplicate"; path: string }
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

// A parent of several repos must not become a project of its own (P4).
export function classifyPick({ path, isDir, ls, asRepo, hasGit, children, saved }: PickFacts): PickDecision {
  if (!isDir) return { kind: "drop" };
  const stored = (target: string): PickDecision => (saved.includes(target) ? { kind: "duplicate", path: target } : { kind: "store", path: target });
  switch (ls.kind) {
    case "list":
      return stored(ls.root);
    case "uninitialized":
      if (hasGit || saved.includes(path)) return stored(path);
      return children.length > 0 ? { kind: "refuse", message: "Choose one of the repositories inside this folder." } : { kind: "confirm" };
    case "error":
    case "cliError": {
      const decision = openDecision(ls, path, asRepo);
      return "store" in decision ? stored(decision.store) : { kind: "refuse", message: decision.refuse };
    }
  }
}
