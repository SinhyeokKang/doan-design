import type { ConfigKind } from "../main/configBridge";
import type { FolderFocus } from "../main/shell";
import type { FolderEntry } from "../main/view";
import type { AddPageOrigin } from "./addProjectsNav";

// The Project Settings page's rules (project-settings design '순수 함수로 뺄 부분'). The page shows one worktree, chosen
// from a project menu, and follows that worktree while it is open. Named apart from the page component beyond
// capitalization (POSTMORTEM 2026-10-25 'A TS helper hid its TSX component on case-insensitive macOS').

export type ProjectSettingsView = "settings" | "problem";
// null: still loading, which keeps whatever the page shows.
export function projectSettingsView(entry: FolderEntry): ProjectSettingsView | null {
  if (entry.kind === "loading") return null;
  return entry.kind === "list" ? "settings" : "problem";
}

export type ProjectSettingsFollow =
  // The worktree left the list: the page is left through the `gone` event, which passes the lock.
  | { kind: "leave" }
  | { kind: "stay" }
  // cancelConfirm: a confirmation or picker opened for the old root or for a healthy worktree is dropped. origin: the
  // origin to keep, moved to the new root when the reroot took the workspace it points at (POSTMORTEM 2026-10-25
  // 'Locating a project kept the old root's selection').
  | { kind: "show"; root: string; view: ProjectSettingsView; reread: boolean; cancelConfirm: boolean; origin: AddPageOrigin };

// After each folder list: a worktree gone from the list leaves the page, a reroot from Locate or Set Up moves to the new
// root (the page keeps its place, so the origin follows too), and a change of state switches the view.
export function followProjectSettings(shown: { root: string; view: ProjectSettingsView }, entries: readonly FolderEntry[], origin: AddPageOrigin, focus?: FolderFocus): ProjectSettingsFollow {
  const root = focus?.from === shown.root ? focus.root : shown.root;
  const entry = entries.find(item => item.path === root);
  if (!entry) return { kind: "leave" };
  const view = projectSettingsView(entry) ?? shown.view;
  if (root !== shown.root) {
    const moved: AddPageOrigin = origin.screen === "workspace" && origin.root === shown.root ? { screen: "workspace", root } : origin;
    return { kind: "show", root, view, reread: view === "settings", cancelConfirm: true, origin: moved };
  }
  if (view === shown.view) return { kind: "stay" };
  // Only a problem drops a confirmation; a worktree that turns healthy has none open.
  return { kind: "show", root, view, reread: view === "settings", cancelConfirm: view === "problem", origin };
}

// A picker sheet, a confirmation or a config write is waiting on main, so every way off the page is ignored meanwhile.
export function projectSettingsLocked(work: { picking: boolean; confirming: boolean; writing: boolean }): boolean {
  return work.picking || work.confirming || work.writing;
}

export type PageAction = "setUp" | "locate" | "retry" | "details";
// reading: the config of a healthy worktree is being read ("Reading settings"). failed: main's message.
export type ReadState = { kind: "reading" } | { kind: "failed"; message: string } | { kind: "ready" };
export interface PageNotice {
  tone: "warning" | "error";
  text: string;
  // Shown under the sentence (a failed read), or only after Details (detail).
  reason?: string;
  detail?: string;
  actions: PageAction[];
}
// body: "sections" are Token CSS and Shared with canvases; "reading" the spinner line; "notice" one notice in their place.
export interface ProjectSettingsPageView {
  // The "Stored in .doan/config.json" note after the path: only once the settings are read and shown.
  storedNote: boolean;
  // Hidden when the folder is known to be missing and while it is still being read.
  showInFinder: boolean;
  body: "sections" | "reading" | "notice";
  notice: PageNotice | null;
  // Reading and Still reading have no Remove from Doan section.
  removeSection: boolean;
}

const PROBLEMS = {
  notFound: "Doan can’t find this folder, so its settings can’t be read or changed.",
  uninitialized: "This folder isn’t set up for Doan yet, so it has no settings to change.",
  error: "Doan couldn’t read this folder’s configuration, so its settings can’t be changed.",
  cliError: "Doan couldn’t read this folder, so its settings can’t be read or changed.",
} as const;

// What the page draws for each state of the draft ('alt-2-page', 'alt-2-states', 'alt-2-page-problem',
// 'alt-2-states-problem'). `read` only matters for a healthy worktree: a problem one never reads its settings.
export function projectSettingsPageView(entry: FolderEntry, read: ReadState): ProjectSettingsPageView {
  const notice = (view: PageNotice, showInFinder: boolean): ProjectSettingsPageView => ({ storedNote: false, showInFinder, body: "notice", notice: view, removeSection: true });
  switch (entry.kind) {
    case "loading": return { storedNote: false, showInFinder: false, body: "reading", notice: null, removeSection: false };
    case "notFound": return notice({ tone: "warning", text: PROBLEMS.notFound, actions: ["locate"] }, false);
    case "uninitialized": return notice({ tone: "warning", text: PROBLEMS.uninitialized, actions: ["setUp"] }, true);
    case "error": return notice({ tone: "error", text: PROBLEMS.error, detail: entry.message, actions: ["retry", "details"] }, true);
    case "cliError": return notice({ tone: "error", text: PROBLEMS.cliError, actions: ["retry"] }, true);
    case "list":
      if (read.kind === "reading") return { storedNote: false, showInFinder: true, body: "reading", notice: null, removeSection: false };
      if (read.kind === "failed") return notice({ tone: "error", text: "Couldn’t read this worktree’s settings.", reason: read.message, actions: ["retry"] }, true);
      return { storedNote: true, showInFinder: true, body: "sections", notice: null, removeSection: true };
  }
}

// The text under a failed write or pick, per section. A path outside the worktree is told where to choose; an
// unavailable reply (the config session or the worktree's epoch changed) is not a failure of the path, so it asks to
// choose again. `name` is the project's name.
export function writeErrorMessage(section: ConfigKind, reply: { kind: "error"; message: string } | { kind: "unavailable" }, name: string): string {
  if (reply.kind === "unavailable") return "This worktree changed. Choose again.";
  if (!/outside|CSS|not found|does not exist/i.test(reply.message)) return reply.message;
  const guidance = section === "tokenCss" ? `Choose a CSS file inside ${name}.` : `Choose a file or folder inside ${name}.`;
  return `${reply.message.replace(/\.?$/, ".")} ${guidance}`;
}

// The path a Share confirmation names. main's picker answers an absolute path, while the config stores one inside the
// worktree repo-relative, so the confirmation shows it that way; a path outside stays as picked (the config refuses it,
// and the failure says where to choose instead).
export function sharedPathLabel(root: string, path: string): string {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

export type FocusAfterWrite = { kind: "pressed" } | { kind: "tokenPrimary" } | { kind: "sharedAdd" } | { kind: "sharedRemove"; path: string };
// Where focus goes once the page's controls re-enable (design '포커스'): the button that was pressed while it is still
// there; else its section's main button: Change or Choose for Token CSS (Clear removes itself), Add File or Folder for
// Shared, or the Remove of the path after a removed one.
export function projectSettingsFocusAfter(done: { section: ConfigKind; pressedAlive: boolean; removed?: { path: string; before: readonly string[]; after: readonly string[] } }): FocusAfterWrite {
  if (done.pressedAlive) return { kind: "pressed" };
  if (done.section === "tokenCss") return { kind: "tokenPrimary" };
  if (done.removed) {
    const { path, before, after } = done.removed;
    const next = before.slice(before.indexOf(path) + 1).find(item => after.includes(item));
    if (next !== undefined) return { kind: "sharedRemove", path: next };
  }
  return { kind: "sharedAdd" };
}
