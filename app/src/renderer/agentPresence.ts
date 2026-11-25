import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import { PROVIDER_NAMES } from "./agentAuthView";
import { sameCanvas } from "./canvasConversationRows";

// The label is the sidebar's own wording.
export interface AgentPresence {
  conversationId: string;
  kind: "working" | "waiting";
  label: string;
  // So a kept presence is never shown on another canvas.
  canvas: Canvas;
}

// `root` is part of its identity: worktrees of one repository share canvas ids and paths.
export interface BoardPresence extends AgentPresence { root: string }
export interface BoardInput {
  // null when reading it failed.
  list: readonly ConversationSummary[] | null;
  root: string;
  canvas: Canvas | null;
  // null for the new conversation state.
  shown: string | null;
  previous: BoardPresence | null;
}

// main's `working` covers preparing and the gap before the queue's next turn, so the notice does not blink off between
// queued turns. An unreadable history is not followed.
function boardKind(c: ConversationSummary): AgentPresence["kind"] | null {
  if (c.readError) return null;
  if (c.phase === "waiting") return "waiting";
  return c.phase === "running" || c.working ? "working" : null;
}

// Within a rank the one followed before keeps being followed, else the one started first. A failed read keeps the
// previous result for the same root and canvas.
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
  // Kept only while it holds the rank it was followed with: one answered and working again is picked anew.
  const held = kept?.kind === rank ? candidates.find(item => item.c.conversationId === kept.conversationId) : undefined;
  const pick = held ?? candidates[0];
  return pick ? present(pick) : null;
}
