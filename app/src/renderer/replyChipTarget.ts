import type { ReplyAnchor } from "../main/conversation/replyAnchor";
import type { CanvasRow, FolderEntry } from "../main/view";

// The link's canvas id is untrusted agent output, so it is only ever compared with the rows of the conversation's own
// root.
export type ReplyChipTarget = "locate" | "missing" | "duplicate" | "unavailable" | { open: CanvasRow };

// The Overview keeps the last canvas laid out but inert, so the stored open canvas would move something nobody can
// see. Another root's entry is not looked at: worktrees can share a canvas id.
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
