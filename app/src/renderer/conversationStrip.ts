import type { Provider } from "../main/agentAuth/types";
import type { ConversationEvent, PermissionOption, PermissionRequest, QuestionRequest } from "../main/conversation/types";
import { foldConversation } from "../main/conversation/state";
import { PROVIDER_NAMES } from "./agentAuthView";

export type StripState =
  | { kind: "starting" }
  | { kind: "working"; activity: string | null }
  | { kind: "permission"; requestId: string; summary: string; options: PermissionOption[] }
  // The first sentence only; answered in the conversation, here only skipped or stopped.
  | { kind: "question"; requestId: string; question: string }
  | { kind: "failed"; code: string; model?: string }
  | { kind: "interrupted"; reason: "user" | "appQuit" | "crashed" }
  | { kind: "done" };

// A permission request and a question share signals, toasts and turn rules.
export function asksPerson(kind: StripState["kind"]): kind is "permission" | "question" {
  return kind === "permission" || kind === "question";
}

// The turn rules are main's fold (latest turn only, nothing after its terminal event); the strip adds what it shows.
export function stripState(events: readonly ConversationEvent[]): StripState {
  const conversationId = events[0]?.conversationId ?? "";
  const fold = foldConversation(events, conversationId, false);
  if (fold.turnId === null) return { kind: "starting" };
  // Callers pass merged events (seq order, once each).
  const turn = events.filter(event => event.turnId === fold.turnId);
  switch (fold.turn) {
    case "idle": return { kind: "done" };
    case "interrupted": return { kind: "interrupted", reason: fold.interruption! };
    case "failed": {
      const failed = turn.find((event): event is Extract<ConversationEvent, { type: "turn.failed" }> => event.type === "turn.failed")!;
      return { kind: "failed", code: failed.code, ...(failed.model !== undefined ? { model: failed.model } : {}) };
    }
    case "starting": return { kind: "starting" };
  }
  // Each request's latest event, oldest open first, as the fold keys them: a reused id shows its open request.
  const requests = new Map<string, ConversationEvent & (PermissionRequest | QuestionRequest)>();
  for (const event of turn) if (event.type === "permission.request" || event.type === "question.request") {
    const key = `${event.type}:${event.requestId}`;
    requests.delete(key); requests.set(key, event);
  }
  const ask = [...requests.values()].find(event => (event.type === "permission.request" ? fold.permissions : fold.questions)[event.requestId] === "pending");
  if (ask) return ask.type === "question.request" ? { kind: "question", requestId: ask.requestId, question: ask.questions[0]?.question ?? "" }
    : { kind: "permission", requestId: ask.requestId, summary: ask.summary, options: ask.options.map(o => ({ id: o.id, label: o.label, kind: o.kind, ...(o.detail ? { detail: o.detail } : {}) })) };
  let activity: string | null = null;
  for (const event of turn) if (event.type === "activity") activity = event.summary;
  return { kind: "working", activity };
}

export type StripAction =
  | { command: "stop" | "skip" | "editOnHome" | "dismiss"; label: string }
  | { command: "answer"; label: string; optionId: string; kind: PermissionOption["kind"]; detail?: string };
export interface StripContext { provider: Provider; project: string; branch: string | null }
// A permission request is an alert announced once per alertKey.
export interface StripView { title: string; body: string | null; live: "status" | "alert"; alertKey: string | null; actions: StripAction[] }

const FAILURES: Record<string, (p: string) => { title: string; body: string }> = {
  not_logged_in: p => ({ title: `${p}’s sign-in expired`, body: "Edit your request on Home and choose another agent." }),
  rate_limited: p => ({ title: `${p} reached a usage limit`, body: "Send again from Home after it resets." }),
  session_unavailable: p => ({ title: `${p} couldn’t continue`, body: "Edit your request on Home and send it again." }),
  session_in_use: p => ({ title: `${p} couldn’t continue`, body: "Edit your request on Home and send it again." }),
  prompt_unread: p => ({ title: `${p} didn’t pick up your message`, body: "Edit your request on Home and send it again." }),
};
// process_exited, unknown and codes without a row of their own.
const STOPPED = (p: string) => ({ title: `${p} stopped unexpectedly`, body: "Edit your request on Home and send it again." });

// A refused Skip or answer's line shows only while that request is shown; the next press clears it (PRODUCT §5 item 1).
export interface StripSendError { requestId: string; how: "skip" | "answer" }
// Shared with the thread's question card, which tells a refused Skip apart the same way.
export const SKIP_FAILED_TEXT = "Couldn’t skip the question. Try again.";
export function stripErrorText(error: StripSendError | null, state: StripState): string | null {
  if (error === null || (state.kind !== "permission" && state.kind !== "question") || state.requestId !== error.requestId) return null;
  return error.how === "skip" ? SKIP_FAILED_TEXT : "Couldn’t send your answer. Choose again.";
}
// The thread's rules: a stale Skip means main settled the question already and it folds by itself.
export function stripSendFailed(how: StripSendError["how"], refusal: string | null): boolean {
  return refusal !== null && !(how === "skip" && refusal === "stale");
}

// The actions stay beside the text while its title and its body each keep their whole line next to them; otherwise they take
// their own row (DESIGN 'Alignment'). Widths in CSS px: the strip's content box, the icon slot, the strip's gap, the title's
// and the body's text (0 for a body that does not count), the action row.
export function stripStacks(m: { content: number; icon: number; gap: number; title: number; body: number; actions: number }): boolean {
  return m.icon + m.gap + Math.max(m.title, m.body) + m.gap + m.actions > m.content;
}

// A turn can end ~300 ms after an answer and take Stop away; focus moves on to Dismiss instead of falling to the page.
export function focusAfterStop(actions: readonly StripAction[]): "stop" | "dismiss" | null {
  return actions.some(a => a.command === "stop") ? "stop" : actions.some(a => a.command === "dismiss") ? "dismiss" : null;
}

export function stripView(state: StripState, ctx: StripContext): StripView {
  const p = PROVIDER_NAMES[ctx.provider];
  const stop: StripAction = { command: "stop", label: "Stop" }, dismiss: StripAction = { command: "dismiss", label: "Dismiss" };
  const recover: StripAction[] = [{ command: "editOnHome", label: "Edit on Home" }, dismiss];
  const view = (title: string, body: string | null, actions: StripAction[]): StripView => ({ title, body, live: "status", alertKey: null, actions });
  switch (state.kind) {
    case "starting": return view(`Starting ${p}`, ctx.branch ? `${ctx.project} · ${ctx.branch}` : ctx.project, [stop]);
    case "working": return view(`${p} is working`, state.activity, [stop]);
    // No option is the default: Allow gets no autofocus or prominence.
    case "permission": return { title: `${p} needs your answer`, body: state.summary, live: "alert", alertKey: state.requestId, actions: [...state.options.map(o => ({ command: "answer" as const, label: o.label, optionId: o.id, kind: o.kind, ...(o.detail ? { detail: o.detail } : {}) })), stop] };
    // No answer control: the strip only skips or stops.
    case "question": return { title: `${p} needs your answer`, body: state.question, live: "alert", alertKey: state.requestId, actions: [{ command: "skip", label: "Skip" }, stop] };
    case "failed": {
      // Edit on Home stays, to send the request with another model.
      if (state.code === "model_unavailable" && state.model) return view(`${state.model} isn’t available for this account.`, null, recover);
      const copy = (Object.hasOwn(FAILURES, state.code) ? FAILURES[state.code]! : STOPPED)(p);
      return view(copy.title, copy.body, recover);
    }
    case "interrupted": return view("Stopped", state.reason === "user" ? "You stopped the agent." : "The agent stopped before it finished.", recover);
    // A handoff's toast says where the work went, so Done names no canvas.
    case "done": return view("Done", null, [dismiss]);
  }
}
