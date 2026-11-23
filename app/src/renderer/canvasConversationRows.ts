import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { CanvasRow } from "../main/view";
import { canvasLabel, rowProblem } from "./canvasTree";
import { deleteAvailability, type DeleteAvailability } from "./conversationDelete";
import { conversationLine, type ConversationLine } from "./overviewConversation";

// The Overview's right panel (Conversations): one row per conversation of the root, project and canvas conversations in
// one list.

export type CanvasRowProblem = { kind: "gone" } | { kind: "duplicate"; count: number } | { kind: "unreadable"; sentence: string };

interface ConversationRowBase extends ConversationLine {
  key: string;
  // The row's Delete: the conversation's title names it, as in the title menu.
  title: string; deletable: DeleteAvailability;
  // The row's head: the title on one line, "Conversation" when it has none.
  heading: string;
}
// A canvas conversation: opens its canvas, with the canvas's thumbnail.
export interface CanvasConversationItem extends ConversationRowBase {
  kind: "canvas"; name: string; canvas: Canvas;
  // The listed row to open and capture; null when the canvas is gone or its id is shared.
  row: CanvasRow | null;
  problem: CanvasRowProblem | null; openable: boolean;
}
// A project conversation (bound to no canvas): opens in the Overview's main column; no thumbnail.
export interface ProjectConversationItem extends ConversationRowBase { kind: "project" }
export type CanvasConversationRow = CanvasConversationItem | ProjectConversationItem;

// main's rule (`main/conversation/sessions.ts`), restated because the renderer must not import main's modules
// (POSTMORTEM 2026-10-30): an id on either side matches by id only, else the path matches.
export function sameCanvas(a: Canvas, b: Canvas): boolean {
  return a.id !== undefined || b.id !== undefined ? a.id !== undefined && a.id === b.id : a.path === b.path;
}

const label = (path: string) => canvasLabel({ path, url: "" });

export type CanvasMatch = { kind: "one"; row: CanvasRow } | { kind: "many"; rows: CanvasRow[] } | { kind: "none" };

// The listed row a canvas conversation's canvas is. ls cannot read an unreadable file's id, so that row falls back to the
// path; an id match elsewhere (the canvas moved and something unreadable sits at its old path) still wins.
export function conversationCanvasMatch(canvas: Canvas, canvasRows: readonly CanvasRow[]): CanvasMatch {
  const byId = canvasRows.filter(row => sameCanvas(canvas, row));
  const matches = byId.length > 0 ? byId : canvasRows.filter(row => row.error !== undefined && row.id === undefined && row.path === canvas.path);
  return matches.length === 1 ? { kind: "one", row: matches[0]! } : matches.length > 1 ? { kind: "many", rows: matches } : { kind: "none" };
}

// Ordered by the conversation's latest activity; an unreadable history's empty time sorts last. Ties: project
// conversations by id (the Conversation menu's byActivity), before canvas conversations, which go by canvas path. A
// gone canvas stays only while its conversation has work left (running, waiting, an unseen ending), the same rule as
// its status.
export function canvasConversationRows(list: readonly ConversationSummary[], canvasRows: readonly CanvasRow[], now: number, seen: ReadonlySet<string> = new Set()): CanvasConversationRow[] {
  const rows: CanvasConversationRow[] = [];
  for (const c of list) {
    const line = conversationLine(c, now, seen);
    const base = { ...line, key: c.conversationId, title: c.title, deletable: deleteAvailability(c), heading: c.title.replace(/\s+/g, " ").trim() || "Conversation" };
    if (!c.canvas) { rows.push({ kind: "project", ...base }); continue; }
    const match = conversationCanvasMatch(c.canvas, canvasRows);
    if (match.kind === "one") {
      const row = match.row;
      // Only the canvas file's own read error makes the row unreadable.
      const problem = row.error ? { kind: "unreadable" as const, sentence: rowProblem(row)!.sentence } : null;
      rows.push({ kind: "canvas", ...base, canvas: c.canvas, name: canvasLabel(row), row, problem, openable: true });
    } else if (match.kind === "many") {
      const own = match.rows.find(row => row.path === c.canvas!.path) ?? match.rows[0]!;
      rows.push({ kind: "canvas", ...base, canvas: c.canvas, name: canvasLabel(own), row: null, problem: { kind: "duplicate", count: match.rows.length }, openable: false });
    } else if (line.status) {
      rows.push({ kind: "canvas", ...base, canvas: c.canvas, name: label(c.canvas.path), row: null, problem: { kind: "gone" }, openable: false });
    }
  }
  const at = new Map(list.map(c => [c.conversationId, c.lastActivityAt]));
  const path = (r: CanvasConversationItem) => r.row?.path ?? r.canvas.path;
  const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return rows.sort((a, b) => {
    const ta = at.get(a.key)!, tb = at.get(b.key)!;
    if (ta !== tb) return ta < tb ? 1 : -1;
    if (a.kind === "project") return b.kind === "project" ? order(a.key, b.key) : -1;
    return b.kind === "project" ? 1 : order(path(a), path(b));
  });
}

// "No longer in" matches the thread's promotion marker; an unreadable canvas keeps the sidebar's sentence.
export function canvasRowProblemText(problem: CanvasRowProblem, project: string): string {
  switch (problem.kind) {
    case "gone": return `No longer in ${project}`;
    case "duplicate": return `${problem.count} canvases use this ID. Run doan check in a terminal.`;
    case "unreadable": return problem.sentence;
  }
}
