import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import { sameCanvas } from "./canvasConversationRows";
import { byActivity } from "./overviewConversation";

// Gives way to a conversation newly started on the canvas, from either window or a handoff; a handoff only while the
// draft is empty (PRODUCT §5 item 2 'Handoff'). An unreadable history is not followed: who started it is only there.
export function followNewConversation(known: ReadonlySet<string> | null, list: readonly ConversationSummary[], canvas: Canvas, options: { deleting?: (id: string) => boolean; draft?: boolean } = {}): string | null {
  if (known === null) return null;
  const deleting = options.deleting ?? (() => false);
  const fresh = list.filter(c => c.canvas !== undefined && sameCanvas(c.canvas, canvas) && !c.readError && !deleting(c.conversationId) && !known.has(c.conversationId)
    && (c.startedBy === undefined || (c.startedBy === "handoff" && options.draft !== true)));
  return fresh.sort(byActivity)[0]?.conversationId ?? null;
}
