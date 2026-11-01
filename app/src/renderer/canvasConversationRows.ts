import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { CanvasRow } from "../main/view";
import { canvasLabel, rowProblem } from "./canvasTree";
import { conversationLine, type ConversationLine } from "./overviewConversation";

// The Overview's right panel: canvases with a current conversation (buzz-project design §2.3).

export type CanvasRowProblem = { kind: "gone" } | { kind: "duplicate"; count: number } | { kind: "unreadable"; sentence: string };

export interface CanvasConversationRow extends ConversationLine {
  key: string; name: string; canvas: Canvas;
  // The listed row to open and capture; null when the canvas is gone or its id is shared.
  row: CanvasRow | null;
  problem: CanvasRowProblem | null; openable: boolean;
}

// main's rule (`main/conversation/sessions.ts`), restated because the renderer must not import main's modules
// (POSTMORTEM 2026-10-30): an id on either side matches by id only, else the path matches.
function sameCanvas(a: Canvas, b: Canvas): boolean {
  return a.id !== undefined || b.id !== undefined ? a.id !== undefined && a.id === b.id : a.path === b.path;
}

const label = (path: string) => canvasLabel({ path, open: 0, resolved: 0, url: "" });

// Ordered by the current conversation's latest activity, then canvas path. A gone canvas stays only while its
// conversation has work left (running, waiting, an unseen ending), the same rule as its status.
export function canvasConversationRows(list: readonly ConversationSummary[], canvasRows: readonly CanvasRow[], now: number, seen: ReadonlySet<string> = new Set()): CanvasConversationRow[] {
  const rows: CanvasConversationRow[] = [];
  for (const c of list) {
    if (!c.canvas || c.state !== "current") continue;
    const line = conversationLine(c, now, seen);
    // ls cannot read an unreadable file's id, so that row falls back to the path; an id match elsewhere (the canvas
    // moved and something unreadable sits at its old path) still wins.
    const byId = canvasRows.filter(row => sameCanvas(c.canvas!, row));
    const matches = byId.length > 0 ? byId : canvasRows.filter(row => row.error !== undefined && row.id === undefined && row.path === c.canvas!.path);
    const base = { ...line, key: c.conversationId, canvas: c.canvas };
    if (matches.length === 1) {
      const row = matches[0]!;
      // Only the canvas file's error: a comment file error does not stop the canvas from reading.
      const problem = row.error ? { kind: "unreadable" as const, sentence: rowProblem(row)!.sentence } : null;
      rows.push({ ...base, name: canvasLabel(row), row, problem, openable: true });
    } else if (matches.length > 1) {
      const own = matches.find(row => row.path === c.canvas!.path) ?? matches[0]!;
      rows.push({ ...base, name: canvasLabel(own), row: null, problem: { kind: "duplicate", count: matches.length }, openable: false });
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
