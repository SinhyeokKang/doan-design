import type { OrphanFile } from "../main/view";

export interface IdChangeNotice { id: string; count: number; text: string }

// `previousId` is the id the controller saw the
// open path lose (`idChanged`); the notice lasts while that file is an orphan
// with comments, so restoring the id clears it. Every visible comment
// counts, open or resolved: none of them shows on the canvas any more.
export function idChangeNotice(previousId: string | null, orphans: readonly OrphanFile[] | undefined): IdChangeNotice | null {
  if (previousId === null) return null;
  const comments = orphans?.find((orphan) => orphan.id === previousId)?.comments;
  const count = comments ? comments.open + comments.resolved : 0;
  if (count === 0) return null;
  const text = count === 1
    ? `1 comment still uses the old ID ${previousId} and no longer shows here. Run doan check in a terminal.`
    : `${count} comments still use the old ID ${previousId} and no longer show here. Run doan check in a terminal.`;
  return { id: previousId, count, text };
}
