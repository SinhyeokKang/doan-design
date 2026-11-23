import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import { sameCanvas } from "./canvasConversationRows";
import { byActivity } from "./overviewConversation";

// A panel showing the new conversation state only because nothing existed (`known`, the ids listed when it fell back to
// it; null when the person chose that state or a conversation shows) gives way to a conversation newly started on its
// canvas: one the person started, in this window or another (POSTMORTEM 2026-11-14, the main window never showed the
// prototype window's first message), or one a handoff started, from a canvas conversation or the Overview, while the
// new state's draft is empty (`draft`: it holds something), since the person's typing outranks a handoff (PRODUCT §5
// item 2 'Handoff'). A conversation whose history could not be read is not followed: who started it is only in that
// history. Of several the most recent. `deleting`: a conversation this window is deleting.
export function followNewConversation(known: ReadonlySet<string> | null, list: readonly ConversationSummary[], canvas: Canvas, options: { deleting?: (id: string) => boolean; draft?: boolean } = {}): string | null {
  if (known === null) return null;
  const deleting = options.deleting ?? (() => false);
  const fresh = list.filter(c => c.canvas !== undefined && sameCanvas(c.canvas, canvas) && !c.readError && !deleting(c.conversationId) && !known.has(c.conversationId)
    && (c.startedBy === undefined || (c.startedBy === "handoff" && options.draft !== true)));
  return fresh.sort(byActivity)[0]?.conversationId ?? null;
}
