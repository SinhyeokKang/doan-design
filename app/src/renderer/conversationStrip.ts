import type { Provider } from "../main/agentAuth/types";
import type { ConversationEvent, PermissionOption, PermissionRequest, QuestionRequest } from "../main/conversation/types";
import { PROVIDER_NAMES } from "./agentAuthView";

// Until the conversation panel replaces it.

export type StripState =
  | { kind: "starting" }
  | { kind: "working"; activity: string | null }
  | { kind: "permission"; requestId: string; summary: string; options: PermissionOption[] }
  // Answered in the conversation; here only skipped or stopped.
  | { kind: "question"; requestId: string; question: string }
  | { kind: "failed"; code: string; model?: string }
  | { kind: "interrupted"; reason: "user" | "appQuit" | "crashed" }
  | { kind: "done" };

// The same signals, toasts and turn rules.
export function asksPerson(kind: StripState["kind"]): kind is "permission" | "question" {
  return kind === "permission" || kind === "question";
}

// foldConversation's turn rules: only the latest turn counts and nothing after its terminal event. main's state.ts is
// not imported because it pulls node:path.
export function stripState(events: readonly ConversationEvent[]): StripState {
  let state: StripState = { kind: "starting" }, turnId: string | null = null, terminal = false, activity: string | null = null;
  const pending: (PermissionRequest | QuestionRequest)[] = [];
  for (const event of events) {
    if (event.type === "turn.started") { turnId = event.turnId; terminal = false; activity = null; pending.length = 0; state = { kind: "starting" }; continue; }
    if (event.turnId !== turnId || terminal) continue;
    switch (event.type) {
      case "activity": activity = event.summary; state = { kind: "working", activity }; break;
      case "message.delta": case "message.done": if (state.kind === "starting") state = { kind: "working", activity }; break;
      case "permission.request": case "question.request": pending.push(event); break;
      case "permission.resolved": case "question.resolved": {
        // Only a request of the resolution's own kind, as main's fold keys them.
        const kind = event.type === "permission.resolved" ? "permission.request" : "question.request";
        const at = pending.findIndex(p => p.type === kind && p.requestId === event.requestId);
        if (at !== -1) pending.splice(at, 1);
        state = { kind: "working", activity };
        break;
      }
      case "turn.done": terminal = true; state = { kind: "done" }; break;
      case "turn.failed": terminal = true; state = { kind: "failed", code: event.code, ...(event.model !== undefined ? { model: event.model } : {}) }; break;
      case "interrupted": terminal = true; state = { kind: "interrupted", reason: event.reason }; break;
    }
  }
  const ask = pending[0];
  if (!terminal && ask) return ask.type === "question.request" ? { kind: "question", requestId: ask.requestId, question: ask.questions[0]?.question ?? "" }
    : { kind: "permission", requestId: ask.requestId, summary: ask.summary, options: ask.options.map(o => ({ id: o.id, label: o.label, kind: o.kind, ...(o.detail ? { detail: o.detail } : {}) })) };
  return state;
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

// Its line shows only while that same request is shown; the next press clears it (PRODUCT §5 item 1).
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
