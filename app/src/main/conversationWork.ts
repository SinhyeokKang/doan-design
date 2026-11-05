import type { WorkRequest } from "../formats/types";

// An app conversation's last `doan work update` (design decision 10), in main's memory only: one per conversation,
// cleared when its turn ends. turnId: the turn it was accepted in, the renderer's follow key with conversationId.
export interface ConversationWork { conversationId: string; root: string; path: string; frame?: string; note?: string; touched: number; turnId: string }
export type ConversationUpdate = Extract<WorkRequest, { conversation: string }>;
// A conversation's current turn as ConversationService sees it now. running: accepted and not ended.
export interface LiveTurn { root: string; turnId: string; running: boolean }

// The request names the conversation but no turn: a previous turn's update that arrives after the next turn was
// accepted counts for the new turn (design §1 rule 5 '한계').
export function applyConversationWork(state: readonly ConversationWork[], request: ConversationUpdate, live: ReadonlyMap<string, LiveTurn>, now: number): readonly ConversationWork[] {
  const turn = live.get(request.conversation);
  if (!turn?.running || turn.root !== request.root) return state;
  const work: ConversationWork = { conversationId: request.conversation, root: request.root, path: request.path,
    ...(request.frame !== undefined ? { frame: request.frame } : {}), ...(request.note !== undefined ? { note: request.note } : {}), touched: now, turnId: turn.turnId };
  const index = state.findIndex(item => item.conversationId === request.conversation);
  return index === -1 ? [...state, work] : state.map((item, i) => i === index ? work : item);
}
export function endConversationWork(state: readonly ConversationWork[], conversationId: string): readonly ConversationWork[] {
  return state.some(item => item.conversationId === conversationId) ? state.filter(item => item.conversationId !== conversationId) : state;
}
