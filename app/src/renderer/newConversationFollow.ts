import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import { sameCanvas } from "./canvasConversationRows";
import { byActivity } from "./overviewConversation";

// A panel showing the new conversation state only because nothing existed (`known`, the ids listed when it fell back to
// it; null when the person chose that state or a conversation shows) gives way to a conversation the person newly
// started on its canvas, in this window or another (POSTMORTEM 2026-11-14, the main window never showed the prototype
// window's first message), or to one promoted to it. A promoted conversation was usually listed already, as a project
// conversation, so `known` cannot tell it apart; it counts whenever it is on this canvas, since one there when the panel
// fell back would have shown instead. A handoff moves no screen, and neither does a conversation whose history could
// not be read: a handoff's origin is only in that history. Keep a preview that bound in this read, otherwise take the most recent. `deleting`: a conversation this
// window is deleting.
export function followNewConversation(known: ReadonlySet<string> | null, list: readonly ConversationSummary[], canvas: Canvas, deleting: (id: string) => boolean = () => false, preview?: string): string | null {
  if (known === null) return null;
  const fresh = list.filter(c => c.canvas !== undefined && sameCanvas(c.canvas, canvas) && !c.readError && !deleting(c.conversationId)
    && (c.startedBy === "promotion" || (c.startedBy === undefined && !known.has(c.conversationId))));
  return (fresh.find(c => c.conversationId === preview) ?? fresh.sort(byActivity)[0])?.conversationId ?? null;
}
