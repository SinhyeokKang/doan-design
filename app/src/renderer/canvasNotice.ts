import type { CanvasRow, FolderEntry, ReadStateProblem } from "../main/view";
import { canvasStem } from "./canvasTree";
import { slotKey, type Slot } from "./homeConversations";

// Main decides `unseen` and `saveFailed` (`main/readState.ts`); this only places them and words the Retry toast.

export type SidebarSlot = Slot | { kind: "canvas"; label: string };

export function canvasNoticeLabel(path: string, unseen: NonNullable<CanvasRow["unseen"]>): string {
  return unseen === "new" ? `${canvasStem(path)} is new` : `${canvasStem(path)} changed since you last opened it`;
}

export const readStateFailedLabel = (path: string): string => `Read state could not be saved for ${canvasStem(path)}`;

// A canvas whose read state could not be saved after it was shown says so instead of "changed".
function rowNotice(row: CanvasRow): string | null {
  if (!row.unseen) return null;
  return row.saveFailed === "save" ? readStateFailedLabel(row.path) : canvasNoticeLabel(row.path, row.unseen);
}

// The shown canvas carries one only while its read state could not be saved, so the dot never blinks before main hears
// of it. Newest-changed first, so a project row standing for several names the most recent.
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

// The Overview's thumbnails, a canvas under the overlay, Home and the other pages never count.
export function shownIntent(entries: readonly FolderEntry[], page: CanvasPage): { root: string; path: string } | null {
  if (page.screen !== "workspace" || page.overview || page.covered || page.unlisted || page.root === null || page.shown === null) return null;
  const entry = entries.find(item => item.path === page.root);
  const row = entry?.kind === "list" ? entry.canvases.find(item => item.path === page.shown) : undefined;
  return row ? { root: page.root, path: row.path } : null;
}

// `busy` is the text while its Retry runs.
export function readStateToast(problem: ReadStateProblem): { message: string; busy: string } {
  switch (problem.kind) {
    case "save": return { message: `Couldn’t save ${canvasStem(problem.path)}’s read state.`, busy: `Saving ${canvasStem(problem.path)}’s read state.` };
    case "id": return { message: "Couldn’t save the read state because the canvas ID is missing or duplicated. Fix the ID, then retry.", busy: `Saving ${canvasStem(problem.path)}’s read state.` };
    case "records": return { message: "Read state couldn’t be read, so it started fresh. Canvases already in the list count as seen.", busy: "Reading the read state." };
    case "unsupported": return { message: "Read state is from a newer Doan version and won’t be saved this session. Update Doan to keep it.", busy: "Reading the read state." };
  }
}
