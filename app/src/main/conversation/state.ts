import { sameCanvas } from "./sessions";
import type { QuestionOutcome } from "./question";
import type { Canvas, ConversationBinding, ConversationEvent, TurnState } from "./types";
export type TurnAction = "send" | "output" | "permission" | "resolved" | "done" | "exit" | "interrupt";
export function turnState(state: TurnState, action: TurnAction): { state: TurnState; error?: "busy" } {
  const running = state === "starting" || state === "streaming" || state === "waitingPermission";
  if (action === "send") return running ? { state, error: "busy" } : { state: "starting" };
  if (!running) return { state };
  switch (action) {
    case "output": return { state: state === "waitingPermission" ? state : "streaming" };
    case "permission": return { state: "waitingPermission" };
    case "resolved": return { state: "streaming" };
    case "done": return { state: "idle" };
    case "exit": return { state: "failed" };
    case "interrupt": return { state: "interrupted" };
  }
}
export function mergeEvents(snapshot: readonly ConversationEvent[], buffered: readonly ConversationEvent[], conversationId: string): ConversationEvent[] {
  const bySeq = new Map<number, ConversationEvent>();
  for (const event of [...snapshot, ...buffered]) {
    if (event.conversationId === conversationId && Number.isSafeInteger(event.seq) && event.seq > 0 && !bySeq.has(event.seq)) bySeq.set(event.seq, event);
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}
export interface FoldedConversation {
  turn: TurnState; turnId: string | null; archived: boolean; lastSeq: number;
  interruption: "user" | "appQuit" | "crashed" | null;
  permissions: Record<string, string>;
  questions: Record<string, "pending" | QuestionOutcome>;
  messages: { id: string; text: string; done: boolean }[];
}
export function foldConversation(input: readonly ConversationEvent[], conversationId: string, restarting = true): FoldedConversation {
  const state: FoldedConversation = { turn: "idle", turnId: null, archived: false, lastSeq: 0, interruption: null, permissions: {}, questions: {}, messages: [] };
  // Keyed by kind and id: a resolution settles only a request of its own kind, so a permission.resolved never answers a
  // question that shares its id.
  const pending = new Map<string, { kind: "permission" | "question"; id: string }>();
  const key = (kind: "permission" | "question", id: string) => `${kind}:${id}`;
  let terminal = false;
  const expire = () => {
    for (const { kind, id } of pending.values()) (kind === "permission" ? state.permissions : state.questions)[id] = "expired";
    pending.clear();
  };
  for (const event of mergeEvents(input, [], conversationId)) {
    state.lastSeq = event.seq;
    if (event.type === "conversation.archived") { state.archived = true; expire(); continue; }
    if (event.type === "conversation.restored") { state.archived = false; continue; }
    if (state.archived || event.type === "conversation.bound") continue;
    if (event.type === "turn.started") {
      expire(); state.turnId = event.turnId; state.turn = "starting"; state.interruption = null; terminal = false;
      continue;
    }
    if (event.turnId !== state.turnId || terminal) continue;
    switch (event.type) {
      case "message.delta": case "message.done": {
        let message = state.messages.find(m => m.id === event.messageId);
        if (!message) { message = { id: event.messageId, text: "", done: false }; state.messages.push(message); }
        if (event.type === "message.done") { message.text = event.text; message.done = true; }
        else if (!message.done) message.text += event.text;
        state.turn = turnState(state.turn, "output").state;
        break;
      }
      case "activity": state.turn = turnState(state.turn, "output").state; break;
      case "permission.request":
        pending.set(key("permission", event.requestId), { kind: "permission", id: event.requestId }); state.permissions[event.requestId] = "pending"; state.turn = "waitingPermission";
        break;
      case "question.request":
        pending.set(key("question", event.requestId), { kind: "question", id: event.requestId }); state.questions[event.requestId] = "pending"; state.turn = "waitingPermission";
        break;
      case "permission.resolved":
        if (pending.delete(key("permission", event.requestId))) state.permissions[event.requestId] = event.optionId;
        if (!pending.size) state.turn = turnState(state.turn, "resolved").state;
        break;
      case "question.resolved":
        if (pending.delete(key("question", event.requestId))) state.questions[event.requestId] = event.outcome;
        if (!pending.size) state.turn = turnState(state.turn, "resolved").state;
        break;
      case "turn.done": state.turn = "idle"; terminal = true; expire(); break;
      case "turn.failed": state.turn = "failed"; terminal = true; expire(); break;
      case "interrupted": state.turn = "interrupted"; state.interruption = event.reason; terminal = true; expire(); break;
    }
  }
  if (restarting) {
    expire();
    if (state.turn === "starting" || state.turn === "streaming" || state.turn === "waitingPermission") {
      state.turn = "interrupted"; state.interruption = "crashed";
    }
  }
  return state;
}
export function bindFirstCanvas(binding: ConversationBinding, root: string, canvas: Canvas): ConversationBinding {
  return binding.origin === "newDesign" && binding.state === "current" && !binding.canvas && binding.root === root ? { ...binding, canvas } : binding;
}
export function archiveForStart(existing: readonly ConversationBinding[], replacement: ConversationBinding, accepted: boolean): ConversationBinding[] {
  if (!accepted) return [...existing];
  return existing.map(binding => binding.conversationId !== replacement.conversationId && binding.root === replacement.root &&
    binding.canvas && replacement.canvas && sameCanvas(binding.canvas, replacement.canvas) ? { ...binding, state: "archived" } : binding);
}
