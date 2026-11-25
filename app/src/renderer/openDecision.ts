import type { OpenBlock } from "../main/deepLinks";
import type { CanvasRow, FolderEntry } from "../main/view";

// A dialog that refused its cancel event is busy.
export type LockedPage = Extract<OpenBlock, "add_projects" | "settings" | "project_settings">;
export type OpenDecision =
  | { kind: "opened"; row: CanvasRow }
  | { kind: "busy"; reason: OpenBlock }
  | { kind: "canvas_not_found"; entry: FolderEntry | undefined };

export interface OpenPage {
  locked: LockedPage | null;
  firstRun: boolean;
  // True when none is left open.
  dismissDialogs(): boolean;
  entries(): readonly FolderEntry[];
}

// First run is checked before any dialog, so a move that cannot happen leaves the wizard's dialogs as they are. The
// list is checked again because the renderer's copy may lag main's (ARCHITECTURE §7 'Deep links').
export function decideOpen(target: { root: string; canvas: string }, page: OpenPage): OpenDecision {
  if (page.locked) return { kind: "busy", reason: page.locked };
  if (page.firstRun) return { kind: "busy", reason: "first_run" };
  if (!page.dismissDialogs()) return { kind: "busy", reason: "dialog" };
  const entry = page.entries().find(entry => entry.path === target.root);
  const row = entry?.kind === "list" ? entry.canvases.find(row => row.path === target.canvas) : undefined;
  return row ? { kind: "opened", row } : { kind: "canvas_not_found", entry };
}

// Without "in Doan", since the person reading it is in Doan. The link is still dropped; the toast only says so.
const BLOCKED_LINK: Record<OpenBlock, string> = {
  add_projects: "The Add Projects page is in the middle of a task. Finish or cancel it, then try again.",
  settings: "Settings is in the middle of a change. Finish or cancel it, then try again.",
  project_settings: "Project Settings is in the middle of a change. Finish or cancel it, then try again.",
  first_run: "Finish Doan’s first run, then try again.",
  dialog: "A dialog is busy and did not close. Finish it, then try again.",
};

export function blockedLinkMessage(reason: OpenBlock): string {
  return `Couldn’t open the link. ${BLOCKED_LINK[reason]}`;
}

// For a move that opened no link (a prototype window's chip or button).
export function blockedReason(reason: Exclude<OpenBlock, "dialog">): string {
  return BLOCKED_LINK[reason];
}
