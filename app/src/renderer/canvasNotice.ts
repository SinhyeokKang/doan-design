import type { CanvasRow, FolderEntry } from "../main/view";
import { slotKey, type Slot } from "./homeConversations";

// Canvas notices (canvas-viewport-units D9/D10): the sidebar's dot for a canvas the person has not had on the canvas
// page since it appeared or changed. Main decides `unseen` (`main/canvasSeen.ts`); this only places it.

// The sidebar's row slot: a conversation state, or a canvas notice under every conversation state.
export type SidebarSlot = Slot | { kind: "canvas"; label: string };

const stem = (path: string) => path.split("/").at(-1)!.replace(/\.html$/, "");

export function canvasNoticeLabel(path: string, unseen: NonNullable<CanvasRow["unseen"]>): string {
  return unseen === "new" ? `${stem(path)} is new` : `${stem(path)} changed since you last opened it`;
}

// The conversation slots plus a notice on every other unseen canvas row. A conversation state on the same row wins, and
// the canvas the page shows never carries one: it counts as seen, so the dot never blinks before main hears of it.
// Notices go in newest-changed first, so a project row standing for several (`projectSlotEntry`) names the most recent.
export function sidebarSlots(conversations: ReadonlyMap<string, Slot>, entries: readonly FolderEntry[], shown: { root: string; path: string } | null): Map<string, SidebarSlot> {
  const notices: { key: string; mtimeMs: number; slot: SidebarSlot }[] = [];
  for (const entry of entries) {
    if (entry.kind !== "list") continue;
    for (const row of entry.canvases) {
      const key = slotKey(entry.path, row.path);
      if (!row.unseen || conversations.has(key) || (shown?.root === entry.path && shown.path === row.path)) continue;
      notices.push({ key, mtimeMs: row.mtimeMs ?? 0, slot: { kind: "canvas", label: canvasNoticeLabel(row.path, row.unseen) } });
    }
  }
  notices.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return new Map<string, SidebarSlot>([...conversations, ...notices.map(notice => [notice.key, notice.slot] as const)]);
}

export interface CanvasPage { screen: string; overview: boolean; root: string | null; shown: string | null; unlisted: boolean }

// What to tell main when the canvas page shows an unseen canvas, including a change while it stays shown. The
// Overview's thumbnails, Home and the other pages never count.
export function seenMark(entries: readonly FolderEntry[], page: CanvasPage): { root: string; path: string; mtimeMs: number } | null {
  if (page.screen !== "workspace" || page.overview || page.unlisted || page.root === null || page.shown === null) return null;
  const entry = entries.find(item => item.path === page.root);
  const row = entry?.kind === "list" ? entry.canvases.find(item => item.path === page.shown) : undefined;
  return row?.unseen && row.mtimeMs !== undefined ? { root: page.root, path: row.path, mtimeMs: row.mtimeMs } : null;
}
