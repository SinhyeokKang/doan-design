import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import { sameCanvas } from "./canvasConversationRows";
import { byActivity } from "./overviewConversation";

// A panel showing the new conversation state only because nothing existed (`known`, the ids listed when it fell back to
// it; null when the person chose that state or a conversation shows) gives way to a conversation the person newly
// started on its canvas, in this window or another (POSTMORTEM 2026-11-14, the main window never showed the prototype
// window's first message). A handoff or a promotion moves no screen, so only conversations without `startedBy` count;
// of several, the most recent. `deleting`: a conversation this window is deleting.
export function followNewConversation(known: ReadonlySet<string> | null, list: readonly ConversationSummary[], canvas: Canvas, deleting: (id: string) => boolean = () => false): string | null {
  if (known === null) return null;
  const fresh = list.filter(c => c.canvas !== undefined && sameCanvas(c.canvas, canvas) && c.startedBy === undefined && !known.has(c.conversationId) && !deleting(c.conversationId));
  return fresh.sort(byActivity)[0]?.conversationId ?? null;
}
