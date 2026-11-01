import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import { sameCanvas } from "./canvasConversationRows";
import { conversationWork } from "./conversationList";

// What the board shows while this canvas's current conversation has work in flight (buzz-canvas design §2
// 'Agent working indicator'). The label is the sidebar's own wording.
export interface AgentPresence {
  conversationId: string;
  kind: "working" | "waiting";
  label: string;
  // The conversation's canvas, so a kept presence is never shown on another canvas.
  canvas: Canvas;
}

// `list` is main's conversation list for the root, or null when reading it failed. `canvas` is the open canvas, or
// null on a page with no listed canvas (nothing shows there). `previous` is the last result: a failed read keeps it,
// because main still knows the truth and the next list change corrects it. A first read that fails has no
// `previous`, so nothing shows.
export function agentPresence(list: readonly ConversationSummary[] | null, canvas: Canvas | null, previous: AgentPresence | null): AgentPresence | null {
  if (canvas === null) return null;
  if (list === null) return previous !== null && sameCanvas(previous.canvas, canvas) ? previous : null;
  for (const c of list) {
    if (c.state !== "current" || !c.canvas || !sameCanvas(c.canvas, canvas)) continue;
    // An empty `seen` set: an unseen ending is not work in flight, only running and waiting count.
    const work = conversationWork(c, new Set());
    if (work?.kind === "working") return { conversationId: c.conversationId, kind: "working", label: work.label, canvas: c.canvas };
    if (work?.kind === "permission") return { conversationId: c.conversationId, kind: "waiting", label: work.label, canvas: c.canvas };
  }
  return null;
}
