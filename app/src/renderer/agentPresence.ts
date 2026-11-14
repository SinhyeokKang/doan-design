import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import { PROVIDER_NAMES } from "./agentAuthView";
import { sameCanvas } from "./canvasConversationRows";
import { conversationWork } from "./conversationList";

// What the board shows while this canvas's current conversation has work in flight. The label is the sidebar's own wording.
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

// The board's followed conversation. `root` is part of its identity: worktrees of one repository share canvas ids and
// paths (POSTMORTEM 2026-11-01).
export interface BoardPresence extends AgentPresence { root: string }
export interface BoardInput {
  // main's list for `root`, or null when reading it failed.
  list: readonly ConversationSummary[] | null;
  root: string;
  canvas: Canvas | null;
  // The conversation the panel shows, or would show once unfolded; null for the new conversation state.
  shown: string | null;
  previous: BoardPresence | null;
}

// Waiting for an answer, else working: running, or main's `working` (preparing, or between a turn's end and the
// queue's next turn), so the notice does not blink off between two queued turns. An unreadable history is not followed.
function boardKind(c: ConversationSummary): AgentPresence["kind"] | null {
  if (c.readError) return null;
  if (c.phase === "waiting") return "waiting";
  return c.phase === "running" || c.working ? "working" : null;
}

// The shown conversation while it works or waits; else another one waiting for an answer, else another working. Within
// a rank the one followed before keeps being followed, else the one started first (main lists conversations in start
// order). A failed read keeps the previous result for the same root and canvas.
export function boardPresence(input: BoardInput): BoardPresence | null {
  const { list, root, canvas, previous } = input;
  if (canvas === null) return null;
  const kept = previous !== null && previous.root === root && sameCanvas(previous.canvas, canvas) ? previous : null;
  if (list === null) return kept;
  const ranked = list.flatMap(c => {
    const kind = c.canvas && sameCanvas(c.canvas, canvas) ? boardKind(c) : null;
    return kind && c.canvas ? [{ c, kind, canvas: c.canvas }] : [];
  });
  const present = (item: (typeof ranked)[number]): BoardPresence => ({
    root, conversationId: item.c.conversationId, kind: item.kind, canvas: item.canvas,
    label: `${PROVIDER_NAMES[item.c.provider]} ${item.kind === "waiting" ? "needs your answer" : "is working"}`,
  });
  const own = ranked.find(item => item.c.conversationId === input.shown);
  if (own) return present(own);
  const rank = ranked.some(item => item.kind === "waiting") ? "waiting" : "working";
  const candidates = ranked.filter(item => item.kind === rank);
  const held = kept && candidates.find(item => item.c.conversationId === kept.conversationId);
  const pick = held ?? candidates[0];
  return pick ? present(pick) : null;
}
