import { chipLabel } from "../main/conversation/messageText";
import type { Anchor, Canvas } from "../main/conversation/types";
import type { PrototypeReveal } from "../main/prototype/ipc";
import type { CanvasRow, FolderEntry } from "../main/view";
import { sameCanvas } from "./canvasConversationRows";
import { canvasLabel } from "./canvasTree";
import { blockedReason, type LockedPage } from "./openDecision";

// What the main window does with a chip, Sign in or Open pressed in the prototype window, after main checked it and
// brought this window forward: what this window's own chip or button would do. Unlike a link, nothing is cancelled: the
// person pressed something in another window, so a dialog, a locked page or first run here keeps what it holds, and a
// toast says why.

export interface RevealState {
  locked: LockedPage | null;
  firstRun: boolean;
  dialog: boolean;
  // The canvas on screen now, or null while the Overview or another screen covers it.
  onScreen: { root: string; canvas: Canvas } | null;
  entries: readonly FolderEntry[];
}

export type RevealStep =
  | { kind: "blocked"; text: string }
  | { kind: "locate"; anchor: Anchor }
  | { kind: "open"; root: string; row: CanvasRow; anchor: Anchor }
  | { kind: "canvas_not_found"; root: string; path: string; entry: FolderEntry | undefined }
  | { kind: "reply"; root: string; link: Extract<PrototypeReveal, { kind: "reply" }>["link"] }
  | Extract<PrototypeReveal, { kind: "settings" }>
  | Extract<PrototypeReveal, { kind: "conversation" }>
  | Extract<PrototypeReveal, { kind: "handoff" }>;

// The deep link's dialog reason says the dialog did not close; here none was asked to.
export const REVEAL_DIALOG = "A dialog is open. Finish or cancel it, then try again.";
// A chip into the canvas on screen while it cannot be located (still drawing, or a problem shows): the main window's
// own chips are unavailable then, but this one was pressed elsewhere, so it says why.
export const REVEAL_UNSHOWN = "The canvas can’t be shown right now.";

export function revealDecision(request: PrototypeReveal, state: RevealState): RevealStep {
  const reason = state.locked ? blockedReason(state.locked) : state.firstRun ? blockedReason("first_run") : state.dialog ? REVEAL_DIALOG : null;
  if (reason !== null) return { kind: "blocked", text: `Couldn’t show ${revealName(request, state.entries)}. ${reason}` };
  if (request.kind === "reply") return { kind: "reply", root: request.root, link: request.link };
  if (request.kind !== "chip") return request;
  // Worktrees share canvas ids and paths (POSTMORTEM 2026-11-01): the root decides before the canvas.
  const { root, canvas, anchor } = request;
  if (state.onScreen?.root === root && sameCanvas(canvas, state.onScreen.canvas)) return { kind: "locate", anchor };
  const entry = state.entries.find(candidate => candidate.path === root);
  const rows = entry?.kind === "list" ? entry.canvases.filter(row => sameCanvas(canvas, row)) : [];
  return rows.length === 1 ? { kind: "open", root, row: rows[0]!, anchor } : { kind: "canvas_not_found", root, path: canvas.path, entry };
}

// The name in a held request's toast: a chip as the thread names it; an answer's frame chip by its frame's title when
// the root's list has it (main sends ids only).
export function revealName(request: PrototypeReveal, entries: readonly FolderEntry[]): string {
  switch (request.kind) {
    case "chip": return chipLabel(request.anchor).label;
    case "reply": {
      const entry = entries.find(candidate => candidate.path === request.root);
      const row = entry?.kind === "list" ? entry.canvases.find(candidate => candidate.id === request.link.canvas) : undefined;
      const title = request.link.kind === "frame" ? row?.frames?.find(frame => frame.id === request.link.id)?.title : undefined;
      return title || request.link.id;
    }
    case "settings": return "Settings";
    case "conversation": return "the conversation";
    // The row's name now, as the sidebar shows it (a moved canvas keeps its id); the notice's path without one.
    case "handoff": {
      const entry = entries.find(candidate => candidate.path === request.root);
      const row = entry?.kind === "list" ? entry.canvases.find(candidate => sameCanvas(request.canvas, candidate)) : undefined;
      return row ? canvasLabel(row) : request.canvas.path.split("/").at(-1)!.replace(/\.html$/, "");
    }
  }
}
