import type { ReplyAnchor } from "../main/conversation/replyAnchor";
import type { CanvasRow, FolderEntry } from "../main/view";

// What pressing a reply chip does (agent-reply-chips design 'Pressing'). The link's canvas id is untrusted agent
// output, so it is only ever compared with the ids of the rows of the conversation's own root.
export type ReplyChipTarget = "locate" | "missing" | "duplicate" | "unavailable" | { open: CanvasRow };

// openCanvasId: the canvas that is on screen right now, or null while the Overview covers it. The Overview keeps the
// last canvas laid out but inert, so using the stored open canvas would move something nobody can see.
// entry: the folder entry of the conversation's root. An entry of another root is not looked at: two worktrees can
// share a canvas id (POSTMORTEM 2026-11-01), so it reads as no usable list.
export function replyChipTarget(
  link: Pick<ReplyAnchor, "canvas">,
  { root, openCanvasId, entry }: { root: string; openCanvasId: string | null; entry: FolderEntry | undefined },
): ReplyChipTarget {
  if (openCanvasId === link.canvas) return "locate";
  if (entry?.path !== root || entry.kind !== "list") return "unavailable";
  const rows = entry.canvases.filter(row => row.id !== undefined && row.id === link.canvas);
  if (rows.length === 0) return "missing";
  return rows.length === 1 ? { open: rows[0]! } : "duplicate";
}
