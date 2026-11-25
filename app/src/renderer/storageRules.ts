import type { OnboardingChange } from "../formats/types";
import type { StorageMode, StorageReason } from "../main/storage";

// The descriptions carry code chips, so the components spell them; this module holds what the choice and the section
// decide (PRODUCT §5 item 0 'Doan files').

export type StorageChoice = "repo" | "local";
export const STORAGE_LABELS: Record<StorageChoice, string> = { repo: "Include in Git", local: "Keep out of Git (this Mac only)" };
// Setup follows it and never turns the other worktrees back into Git.
export const KEPT_LOCAL_FACT = "This project already keeps its Doan files out of Git in every worktree. Change it in Project Settings.";
export const EXCLUDE_CHANGE: OnboardingChange = ".git/info/exclude";

// Once the exclude entry exists the plan adds none (app-socket v2 `inspection`).
export function keptLocal(candidate: { changes: readonly OnboardingChange[]; storage?: "local" }): boolean {
  return candidate.storage === "local" && candidate.changes.length > 0 && !candidate.changes.includes(EXCLUDE_CHANGE);
}

export interface StorageSectionView {
  // None when the mode is unknown.
  checked: StorageChoice | null;
  disabled: Record<StorageChoice, boolean>;
  // "info": outside Git, what Keep out of Git does instead; "home": why it stays closed in the home folder.
  reason: { text: StorageReason | "home"; tone: "subtle" | "warning" | "info" } | null;
  // Always with Keep out of Git on disk, since Doan cannot know whether .doan/ was ever committed.
  guidance: boolean;
  // Choosing it asks first.
  createsRepository?: true;
}

// null: an older doan reported no mode, so the section is not drawn. `home`: Doan creates no repository at or above the
// home folder, so outside Git Keep out of Git stays closed there.
export function storageSectionView(facts: { storage?: StorageMode; storageReason?: StorageReason }, writing: StorageChoice | null, home = false): StorageSectionView | null {
  const { storage, storageReason } = facts;
  if (storage === undefined) return null;
  const known = storage === "unknown" ? null : storage;
  const unknown = storage === "unknown" || storageReason === "git_unreadable";
  const outside = !unknown && storageReason === "not_git";
  const reason: StorageSectionView["reason"] = unknown ? { text: "git_unreadable", tone: "warning" }
    : outside ? (home ? { text: "home", tone: "subtle" } : { text: "not_git", tone: "info" })
      : storageReason ? { text: storageReason, tone: "subtle" } : null;
  // Keep out of Git outside Git creates the repository, except in the home folder.
  const disabled = writing !== null || unknown || storageReason === "exclude_unwritable" ? { repo: true, local: true }
    : outside && home ? { repo: false, local: true } : { repo: false, local: false };
  // The guidance follows the mode on disk, so it changes once the write is done.
  return { checked: writing ?? known, disabled, reason, guidance: known === "local", ...(outside && !home ? { createsRepository: true as const } : {}) };
}

export type StoredNote = "commit" | "thisMac" | "plain";
export function storedNote(storage: StorageMode | undefined): StoredNote {
  return storage === "local" ? "thisMac" : storage === "unknown" ? "plain" : "commit";
}

// `created`: the write's `written` named .git/.
export type SwitchNote = "attributesStay" | "nowTracked" | "createdRepository";
export function switchNote(from: StorageMode | undefined, to: StorageMode | undefined, created = false): SwitchNote | null {
  if (from === to) return null;
  if (created && to === "local") return "createdRepository";
  return to === "local" ? "attributesStay" : to === "repo" && from === "local" ? "nowTracked" : null;
}
