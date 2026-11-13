import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { CanvasRow } from "../main/view";
import { canvasLabel, rowProblem } from "./canvasTree";
import { deleteAvailability, type DeleteAvailability } from "./conversationDelete";
import { conversationLine, type ConversationLine } from "./overviewConversation";

// The Overview's right panel: canvases with a current conversation.

export type CanvasRowProblem = { kind: "gone" } | { kind: "duplicate"; count: number } | { kind: "unreadable"; sentence: string };

export interface CanvasConversationRow extends ConversationLine {
  key: string; name: string; canvas: Canvas;
  // The listed row to open and capture; null when the canvas is gone or its id is shared.
  row: CanvasRow | null;
  problem: CanvasRowProblem | null; openable: boolean;
  // The row's Delete: the conversation's title names it, as in the title menu.
  title: string; deletable: DeleteAvailability;
}

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

// Ordered by the current conversation's latest activity, then canvas path. A gone canvas stays only while its
// conversation has work left (running, waiting, an unseen ending), the same rule as its status.
export function canvasConversationRows(list: readonly ConversationSummary[], canvasRows: readonly CanvasRow[], now: number, seen: ReadonlySet<string> = new Set()): CanvasConversationRow[] {
  const rows: CanvasConversationRow[] = [];
  for (const c of list) {
    if (!c.canvas || c.state !== "current") continue;
    const line = conversationLine(c, now, seen);
    const match = conversationCanvasMatch(c.canvas, canvasRows);
    const base = { ...line, key: c.conversationId, canvas: c.canvas, title: c.title, deletable: deleteAvailability(c) };
    if (match.kind === "one") {
      const row = match.row;
      // Only the canvas file's own read error makes the row unreadable.
      const problem = row.error ? { kind: "unreadable" as const, sentence: rowProblem(row)!.sentence } : null;
      rows.push({ ...base, name: canvasLabel(row), row, problem, openable: true });
    } else if (match.kind === "many") {
      const own = match.rows.find(row => row.path === c.canvas!.path) ?? match.rows[0]!;
      rows.push({ ...base, name: canvasLabel(own), row: null, problem: { kind: "duplicate", count: match.rows.length }, openable: false });
    } else if (line.status) {
      rows.push({ ...base, name: label(c.canvas.path), row: null, problem: { kind: "gone" }, openable: false });
    }
  }
  const at = new Map(list.map(c => [c.conversationId, c.lastActivityAt]));
  const path = (r: CanvasConversationRow) => r.row?.path ?? r.canvas.path;
  return rows.sort((a, b) => {
    const ta = at.get(a.key)!, tb = at.get(b.key)!;
    if (ta !== tb) return ta < tb ? 1 : -1;
    return path(a) < path(b) ? -1 : path(a) > path(b) ? 1 : 0;
  });
}

// "No longer in" matches the thread's promotion marker; an unreadable canvas keeps the sidebar's sentence.
export function canvasRowProblemText(problem: CanvasRowProblem, project: string): string {
  switch (problem.kind) {
    case "gone": return `No longer in ${project}`;
    case "duplicate": return `${problem.count} canvases use this ID — run doan check`;
    case "unreadable": return problem.sentence;
  }
}
