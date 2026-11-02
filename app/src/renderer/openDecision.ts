import type { CanvasRow, FolderEntry } from "../main/view";

// What keeps a doan:// link or a `doan open` request from moving: a locked page, first run, or a dialog that refused
// its cancel event (it is busy).
export type OpenBlock = "locked" | "first_run" | "dialog";
export type OpenDecision =
  | { kind: "opened"; row: CanvasRow }
  | { kind: "busy"; reason: OpenBlock }
  | { kind: "canvas_not_found"; entry: FolderEntry | undefined };

export interface OpenPage {
  locked: boolean;
  firstRun: boolean;
  // Dismisses the open dialogs as Escape or Cancel would; true when none is left open.
  dismissDialogs(): boolean;
  entries(): readonly FolderEntry[];
}

// The renderer's half of a move to a canvas main already checked (terminal-agent-activity design 'Deep link', canvas-open-offer).
// Both callers came from a person (a click, or a `doan open` they asked an agent for), so a dialog that agrees to close
// is closed. First run is checked before any dialog, so a move that cannot happen leaves the wizard's own dialogs as
// they are. The list is checked again because the renderer's copy may lag main's, as for any move.
export function decideOpen(target: { root: string; canvas: string }, page: OpenPage): OpenDecision {
  if (page.locked) return { kind: "busy", reason: "locked" };
  if (page.firstRun) return { kind: "busy", reason: "first_run" };
  if (!page.dismissDialogs()) return { kind: "busy", reason: "dialog" };
  const entry = page.entries().find(entry => entry.path === target.root);
  const row = entry?.kind === "list" ? entry.canvases.find(row => row.path === target.canvas) : undefined;
  return row ? { kind: "opened", row } : { kind: "canvas_not_found", entry };
}
