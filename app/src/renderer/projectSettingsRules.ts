import type { ConfigKind } from "../main/configBridge";
import type { FolderFocus } from "../main/shell";
import type { FolderEntry } from "../main/view";
import type { AddPageOrigin } from "./addProjectsNav";

// Named apart from the page component beyond capitalization: macOS is case-insensitive, and a TS helper once hid its
// TSX component.

export type ProjectSettingsView = "settings" | "problem";
// null: still loading, which keeps whatever the page shows.
export function projectSettingsView(entry: FolderEntry): ProjectSettingsView | null {
  if (entry.kind === "loading") return null;
  return entry.kind === "list" ? "settings" : "problem";
}

export type ProjectSettingsFollow =
  // The page is left through the `gone` event, which passes the lock.
  | { kind: "leave" }
  | { kind: "stay" }
  // cancelConfirm: a confirmation or picker opened for the old root is dropped. origin moves to the new root when the
  // reroot took the workspace it points at.
  | { kind: "show"; root: string; view: ProjectSettingsView; reread: boolean; cancelConfirm: boolean; origin: AddPageOrigin };

// A reroot from Locate or Set Up moves to the new root; the page keeps its place, so the origin follows too.
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

// Every way off the page is ignored meanwhile.
export function projectSettingsLocked(work: { picking: boolean; confirming: boolean; writing: boolean }): boolean {
  return work.picking || work.confirming || work.writing;
}

export type PageAction = "setUp" | "locate" | "retry" | "details";
// failed: main's message.
export type ReadState = { kind: "reading" } | { kind: "failed"; message: string } | { kind: "ready" };
export interface PageNotice {
  tone: "warning" | "error";
  text: string;
  reason?: string;
  detail?: string;
  actions: PageAction[];
}
export interface ProjectSettingsPageView {
  // Only once the settings are read and shown.
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
  uninitializedLocal: "This project keeps its Doan files out of Git, so this worktree doesn’t have them yet. Set it up to use Doan here.",
  error: "Doan couldn’t read this folder’s configuration, so its settings can’t be changed.",
  cliError: "Doan couldn’t read this folder, so its settings can’t be read or changed.",
} as const;

// `read` only matters for a healthy worktree: a problem one never reads its settings. keptLocal: another worktree
// keeps its Doan files out of Git (storage.ts projectKeepsLocal).
export function projectSettingsPageView(entry: FolderEntry, read: ReadState, keptLocal = false): ProjectSettingsPageView {
  const notice = (view: PageNotice, showInFinder: boolean): ProjectSettingsPageView => ({ storedNote: false, showInFinder, body: "notice", notice: view, removeSection: true });
  switch (entry.kind) {
    case "loading": return { storedNote: false, showInFinder: false, body: "reading", notice: null, removeSection: false };
    case "notFound": return notice({ tone: "warning", text: PROBLEMS.notFound, actions: ["locate"] }, false);
    case "uninitialized": return notice({ tone: "warning", text: keptLocal ? PROBLEMS.uninitializedLocal : PROBLEMS.uninitialized, actions: ["setUp"] }, true);
    case "error": return notice({ tone: "error", text: PROBLEMS.error, detail: entry.message, actions: ["retry", "details"] }, true);
    case "cliError": return notice({ tone: "error", text: PROBLEMS.cliError, detail: entry.reason, actions: ["retry", "details"] }, true);
    case "list":
      if (read.kind === "reading") return { storedNote: false, showInFinder: true, body: "reading", notice: null, removeSection: false };
      if (read.kind === "failed") return notice({ tone: "error", text: "Couldn’t read this worktree’s settings.", reason: read.message, actions: ["retry"] }, true);
      return { storedNote: true, showInFinder: true, body: "sections", notice: null, removeSection: true };
  }
}

// An unavailable reply (the config session or the worktree's epoch changed) is not a failure of the path, so it asks
// to choose again. A failed mode write shows the CLI's message as it is.
export function writeErrorMessage(section: ConfigKind | "storage", reply: { kind: "error"; message: string } | { kind: "unavailable" }, name: string): string {
  if (reply.kind === "unavailable") return "This worktree changed. Choose again.";
  if (section === "storage") return reply.message;
  if (!/outside|CSS|not found|does not exist/i.test(reply.message)) return reply.message;
  const guidance = section === "tokenCss" ? `Choose a CSS file inside ${name}.` : `Choose a file or folder inside ${name}.`;
  return `${reply.message.replace(/\.?$/, ".")} ${guidance}`;
}

// main's picker answers an absolute path, while the config stores one inside the worktree repo-relative; a path outside
// stays as picked (the config refuses it).
export function sharedPathLabel(root: string, path: string): string {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

// storageChosen: its options are disabled while Saving, so focus would otherwise fall to <body> (ARCHITECTURE §7
// 'Settings IPC').
export type FocusAfterWrite = { kind: "pressed" } | { kind: "tokenPrimary" } | { kind: "sharedAdd" } | { kind: "sharedRemove"; path: string } | { kind: "storageChosen" };
// The pressed button while it is still there, else its section's main button (Clear removes itself).
export function projectSettingsFocusAfter(done: { section: ConfigKind | "storage"; pressedAlive: boolean; removed?: { path: string; before: readonly string[]; after: readonly string[] } }): FocusAfterWrite {
  if (done.section === "storage") return { kind: "storageChosen" };
  if (done.pressedAlive) return { kind: "pressed" };
  if (done.section === "tokenCss") return { kind: "tokenPrimary" };
  if (done.removed) {
    const { path, before, after } = done.removed;
    const next = before.slice(before.indexOf(path) + 1).find(item => after.includes(item));
    if (next !== undefined) return { kind: "sharedRemove", path: next };
  }
  return { kind: "sharedAdd" };
}
