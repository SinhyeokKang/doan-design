import type { OnboardingChange } from "../formats/types";
import type { StorageMode, StorageReason } from "../main/storage";

// Where the Doan files are kept, as every setup screen and Project Settings show it (local-doan-files design §3.1–3.2,
// draft canvas local-doan-files). The words are the draft's; the descriptions carry code chips, so the components
// spell them, and this module holds what the choice and the section decide.

export type StorageChoice = "repo" | "local";
export const STORAGE_LABELS: Record<StorageChoice, string> = { repo: "Include in Git", local: "Keep out of Git (this Mac only)" };
// The fact a setup screen shows in place of the options when another worktree of the project keeps its files out of
// Git: setup follows it and never turns the other worktrees back into Git.
export const KEPT_LOCAL_FACT = "This project already keeps its Doan files out of Git in every worktree. Change it in Project Settings.";
export const EXCLUDE_CHANGE: OnboardingChange = ".git/info/exclude";

// An onboarding plan shown as local that adds no exclude entry is a project already kept out of Git (app-socket v2
// `inspection`: once the exclude entry exists, no .git/info/exclude).
export function keptLocal(candidate: { changes: readonly OnboardingChange[]; storage?: "local" }): boolean {
  return candidate.storage === "local" && candidate.changes.length > 0 && !candidate.changes.includes(EXCLUDE_CHANGE);
}

export interface StorageSectionView {
  // The radio shown chosen: the mode on disk, the one being written while Saving, or none when the mode is unknown.
  checked: StorageChoice | null;
  disabled: Record<StorageChoice, boolean>;
  // Why an option cannot be chosen; warning ink when the mode itself is unknown.
  reason: { text: StorageReason; tone: "subtle" | "warning" } | null;
  // The conditional `git rm -r --cached` guidance: always with Keep out of Git on disk (spec decision 3).
  guidance: boolean;
}

// null: the CLI reported no mode (an older doan), so the section is not drawn. `writing`: the mode being written; both
// options are disabled meanwhile and the pressed one stays chosen.
export function storageSectionView(facts: { storage?: StorageMode; storageReason?: StorageReason }, writing: StorageChoice | null): StorageSectionView | null {
  const { storage, storageReason } = facts;
  if (storage === undefined) return null;
  const known = storage === "unknown" ? null : storage;
  const unknown = storage === "unknown" || storageReason === "git_unreadable";
  const reason: StorageSectionView["reason"] = unknown ? { text: "git_unreadable", tone: "warning" }
    : storageReason ? { text: storageReason, tone: "subtle" } : null;
  // Outside Git only Keep out of Git is closed: Include in Git is the mode and stays a valid choice.
  const disabled = writing !== null || unknown || storageReason === "exclude_unwritable" ? { repo: true, local: true }
    : storageReason === "not_git" ? { repo: false, local: true } : { repo: false, local: false };
  // The guidance follows the mode on disk, so it changes once the write is done (draft 'Saving').
  return { checked: writing ?? known, disabled, reason, guidance: known === "local" };
}

// The header's path line after "Stored in .doan/config.json in this worktree": the shipped commit sentence for Include
// in Git (and an older doan that reports no mode), "on this Mac only" out of Git, and nothing more when unknown.
export type StoredNote = "commit" | "thisMac" | "plain";
export function storedNote(storage: StorageMode | undefined): StoredNote {
  return storage === "local" ? "thisMac" : storage === "unknown" ? "plain" : "commit";
}

// The line beside Saved after a switch: what changed outside Doan. null when the mode did not change.
export type SwitchNote = "attributesStay" | "nowTracked";
export function switchNote(from: StorageMode | undefined, to: StorageMode | undefined): SwitchNote | null {
  if (from === to) return null;
  return to === "local" ? "attributesStay" : to === "repo" && from === "local" ? "nowTracked" : null;
}
