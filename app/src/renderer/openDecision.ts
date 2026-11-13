import type { OpenBlock } from "../main/deepLinks";
import type { CanvasRow, FolderEntry } from "../main/view";

// What keeps a doan:// link or a `doan open` request from moving: a locked page (named, so `doan open` can say which),
// first run, or a dialog that refused its cancel event (it is busy).
export type LockedPage = Extract<OpenBlock, "add_projects" | "settings" | "project_settings">;
export type OpenDecision =
  | { kind: "opened"; row: CanvasRow }
  | { kind: "busy"; reason: OpenBlock }
  | { kind: "canvas_not_found"; entry: FolderEntry | undefined };

export interface OpenPage {
  locked: LockedPage | null;
  firstRun: boolean;
  // Dismisses the open dialogs as Escape or Cancel would; true when none is left open.
  dismissDialogs(): boolean;
  entries(): readonly FolderEntry[];
}

// The renderer's half of a move to a canvas main already checked (ARCHITECTURE §7 'Deep links').
// Both callers came from a person (a click, or a `doan open` they asked an agent for), so a dialog that agrees to close
// is closed. First run is checked before any dialog, so a move that cannot happen leaves the wizard's own dialogs as
// they are. The list is checked again because the renderer's copy may lag main's, as for any move.
export function decideOpen(target: { root: string; canvas: string }, page: OpenPage): OpenDecision {
  if (page.locked) return { kind: "busy", reason: page.locked };
  if (page.firstRun) return { kind: "busy", reason: "first_run" };
  if (!page.dismissDialogs()) return { kind: "busy", reason: "dialog" };
  const entry = page.entries().find(entry => entry.path === target.root);
  const row = entry?.kind === "list" ? entry.canvases.find(row => row.path === target.canvas) : undefined;
  return row ? { kind: "opened", row } : { kind: "canvas_not_found", entry };
}

// A link a lock or a busy dialog refused (PRODUCT §5 item 3 'Deep links'): `doan open`'s busy reason (deepLinks.ts
// BLOCKED) without "in Doan", since the person reading it is in Doan. The link is still dropped (POSTMORTEM
// 2026-10-25 'A forwarded Settings target discarded a pending setup confirmation'); the toast only says so.
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

// The same reason without the link's sentence, for a move that opened no link (a prototype window's chip or button).
export function blockedReason(reason: Exclude<OpenBlock, "dialog">): string {
  return BLOCKED_LINK[reason];
}
