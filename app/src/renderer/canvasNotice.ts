import type { CanvasRow, FolderEntry, ReadStateProblem } from "../main/view";
import { slotKey, type Slot } from "./homeConversations";

// Canvas notices: the sidebar's dot for a canvas the person has not had on the canvas page since it appeared or its HTML
// changed, or whose read state could not be saved. Main decides `unseen` and `saveFailed` (`main/readState.ts`); this
// only places them and words the Retry toast.

// The sidebar's row slot: a conversation state, or a canvas notice under every conversation state.
export type SidebarSlot = Slot | { kind: "canvas"; label: string };

const stem = (path: string) => path.split("/").at(-1)!.replace(/\.html$/, "");

export function canvasNoticeLabel(path: string, unseen: NonNullable<CanvasRow["unseen"]>): string {
  return unseen === "new" ? `${stem(path)} is new` : `${stem(path)} changed since you last opened it`;
}

export const readStateFailedLabel = (path: string): string => `Read state could not be saved for ${stem(path)}`;

// The dot of an unseen row: a canvas whose read state could not be saved after it was shown says so instead of "changed".
function rowNotice(row: CanvasRow): string | null {
  if (!row.unseen) return null;
  return row.saveFailed === "save" ? readStateFailedLabel(row.path) : canvasNoticeLabel(row.path, row.unseen);
}

// The conversation slots plus a notice on every other unseen canvas row. A conversation state on the same row wins, and
// the canvas the page shows carries one only while its read state could not be saved: otherwise it counts as seen, so
// the dot never blinks before main hears of it, and a failure never hides a dot that is still unread. A notice behind a
// conversation state or the row menu is still there when that goes. Notices go in newest-changed first, so a project row
// standing for several (`projectSlot`) names the most recent.
export function sidebarSlots(conversations: ReadonlyMap<string, Slot>, entries: readonly FolderEntry[], shown: { root: string; path: string } | null): Map<string, SidebarSlot> {
  const notices: { key: string; mtimeMs: number; slot: SidebarSlot }[] = [];
  for (const entry of entries) {
    if (entry.kind !== "list") continue;
    for (const row of entry.canvases) {
      const key = slotKey(entry.path, row.path);
      const label = rowNotice(row);
      if (label === null || conversations.has(key) || (shown?.root === entry.path && shown.path === row.path && !row.saveFailed)) continue;
      notices.push({ key, mtimeMs: row.mtimeMs ?? 0, slot: { kind: "canvas", label } });
    }
  }
  notices.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return new Map<string, SidebarSlot>([...conversations, ...notices.map(notice => [notice.key, notice.slot] as const)]);
}

// `covered`: the problem overlay is over the canvas.
export interface CanvasPage { screen: string; overview: boolean; root: string | null; shown: string | null; unlisted: boolean; covered?: boolean }

// The canvas the canvas page is meant to show, for main to prove shown and record (`showCanvas`). The Overview's
// thumbnails, a canvas under the overlay, Home and the other pages never count.
export function shownIntent(entries: readonly FolderEntry[], page: CanvasPage): { root: string; path: string } | null {
  if (page.screen !== "workspace" || page.overview || page.covered || page.unlisted || page.root === null || page.shown === null) return null;
  const entry = entries.find(item => item.path === page.root);
  const row = entry?.kind === "list" ? entry.canvases.find(item => item.path === page.shown) : undefined;
  return row ? { root: page.root, path: row.path } : null;
}

// The Retry toast's text, and the text while its Retry runs.
export function readStateToast(problem: ReadStateProblem): { message: string; busy: string } {
  const readOnly = "readOnly" in problem && problem.readOnly ? " This folder is read-only." : "";
  switch (problem.kind) {
    case "save": return { message: `Couldn’t save ${stem(problem.path)}’s read state.${readOnly}`, busy: `Saving ${stem(problem.path)}’s read state.` };
    case "id": return { message: "Couldn’t save the read state because the canvas ID is missing or duplicated. Fix the ID, then retry.", busy: `Saving ${stem(problem.path)}’s read state.` };
    case "baseline": return { message: `Couldn’t save the initial read state.${readOnly}`, busy: "Saving the initial read state." };
    case "records": return { message: "Read-state records couldn’t be read. Restore them, then retry.", busy: "Reading the read-state records." };
    case "unsupported": return { message: "These read-state records need a compatible app version. Use that version, then retry.", busy: "Reading the read-state records." };
  }
}
