import type { FolderFocus } from "../main/shell";
import type { FolderEntry } from "../main/view";

// The Project Settings dialog's rules (buzz-settings design 'Project Settings 다이얼로그'). The dialog shows one
// worktree, chosen from the project menu, and follows that worktree while it is open. Named apart from the dialog
// component beyond capitalization (POSTMORTEM 2026-10-25 'A TS helper hid its TSX component on case-insensitive macOS').

// A picker sheet, a confirmation or a config write is waiting on main; closing would drop its result, so Escape and
// Done wait for it.
export function canCloseProjectSettings(work: { picking: boolean; confirming: boolean; writing: boolean }): boolean {
  return !work.picking && !work.confirming && !work.writing;
}

export type ProjectSettingsView = "settings" | "problem";
// null: still loading, which keeps whatever the dialog shows.
export function projectSettingsView(entry: FolderEntry): ProjectSettingsView | null {
  if (entry.kind === "loading") return null;
  return entry.kind === "list" ? "settings" : "problem";
}

export type ProjectSettingsFollow = { kind: "stay" } | { kind: "close" } | { kind: "show"; root: string; view: ProjectSettingsView; reread: boolean };
// After each folder list: a reroot from Locate… moves to the new root (rule 3), a worktree gone from the list closes
// the dialog (rule 1; the existing Undo toast tells what happened), and a change of state switches the view (rule 2).
// reread: the settings must be read again, for a new root or a worktree that became healthy.
export function followProjectSettings(shown: { root: string; view: ProjectSettingsView }, entries: readonly FolderEntry[], focus?: FolderFocus): ProjectSettingsFollow {
  const root = focus?.from === shown.root ? focus.root : shown.root;
  const entry = entries.find(item => item.path === root);
  if (!entry) return { kind: "close" };
  const view = projectSettingsView(entry) ?? shown.view;
  if (root !== shown.root) return { kind: "show", root, view, reread: true };
  if (view === shown.view) return { kind: "stay" };
  return { kind: "show", root, view, reread: view === "settings" };
}

// Where focus goes after rule 1 closes the dialog: the project menu button, else the project's row, else Search.
export function closedFocus(available: { menuButton: boolean; row: boolean }): "menuButton" | "row" | "search" {
  return available.menuButton ? "menuButton" : available.row ? "row" : "search";
}

// The problem view's recovery actions run in place. Set Up… opens its own dialog, so this one closes first and
// modals never stack (rule 4).
export type ProblemAction = "setUp" | "locate" | "remove" | "reveal" | "retry" | "details";
export function problemActionCloses(action: ProblemAction): boolean {
  return action === "setUp";
}
