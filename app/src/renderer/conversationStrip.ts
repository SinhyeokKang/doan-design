import type { Provider } from "../main/agentAuth/types";
import type { ConversationEvent, PermissionRequest } from "../main/conversation/types";
import { PROVIDER_NAMES } from "./agentAuthView";

// The temporary workspace strip for a Home conversation (buzz-home design §7), until buzz-conversation's panel
// replaces it. Copy follows the draft's 'States · Conversation strip' board.

export type StripState =
  | { kind: "starting" }
  | { kind: "working"; activity: string | null }
  | { kind: "permission"; requestId: string; summary: string; options: { id: string; label: string }[] }
  | { kind: "failed"; code: string }
  | { kind: "interrupted"; reason: "user" | "appQuit" | "crashed" }
  | { kind: "done" };

// Reads events already merged by seq (state.ts mergeEvents), with foldConversation's turn rules: only the latest
// turn counts and nothing after its terminal event. main's state.ts is not imported because it pulls node:path.
export function stripState(events: readonly ConversationEvent[]): StripState {
  let state: StripState = { kind: "starting" }, turnId: string | null = null, terminal = false, activity: string | null = null;
  const pending: PermissionRequest[] = [];
  for (const event of events) {
    if (event.type === "turn.started") { turnId = event.turnId; terminal = false; activity = null; pending.length = 0; state = { kind: "starting" }; continue; }
    if (event.turnId !== turnId || terminal) continue;
    switch (event.type) {
      case "activity": activity = event.summary; state = { kind: "working", activity }; break;
      case "message.delta": case "message.done": if (state.kind === "starting") state = { kind: "working", activity }; break;
      case "permission.request": pending.push(event); break;
      case "permission.resolved": {
        const at = pending.findIndex(p => p.requestId === event.requestId);
        if (at !== -1) pending.splice(at, 1);
        state = { kind: "working", activity };
        break;
      }
      case "turn.done": terminal = true; state = { kind: "done" }; break;
      case "turn.failed": terminal = true; state = { kind: "failed", code: event.code }; break;
      case "interrupted": terminal = true; state = { kind: "interrupted", reason: event.reason }; break;
    }
  }
  const ask = pending[0];
  if (!terminal && ask) return { kind: "permission", requestId: ask.requestId, summary: ask.summary, options: ask.options.map(o => ({ id: o.id, label: o.label })) };
  return state;
}

export type StripAction =
  | { command: "stop" | "editOnHome" | "dismiss" | "open"; label: string }
  | { command: "answer"; label: string; optionId: string };
export interface StripContext { provider: Provider; project: string; branch: string | null; canvas: string | null }
// live: the strip's own region; a permission request is an alert announced once per alertKey.
export interface StripView { title: string; body: string | null; live: "status" | "alert"; alertKey: string | null; actions: StripAction[] }

const FAILURES: Record<string, (p: string) => { title: string; body: string }> = {
  not_logged_in: p => ({ title: `${p}’s sign-in expired`, body: "Edit your request on Home and choose another agent." }),
  rate_limited: p => ({ title: `${p} is rate limited`, body: "Try again later from Home." }),
  session_unavailable: p => ({ title: `${p} couldn’t continue`, body: "Edit your request on Home and send it again." }),
  session_in_use: p => ({ title: `${p} couldn’t continue`, body: "Edit your request on Home and send it again." }),
  credential_override: p => ({ title: `${p} refused to run`, body: "This project’s Claude settings supply their own API key." }),
};
// process_exited, unknown and codes without a row of their own.
const STOPPED = (p: string) => ({ title: `${p} stopped unexpectedly`, body: "Edit your request on Home and send it again." });

export function stripView(state: StripState, ctx: StripContext): StripView {
  const p = PROVIDER_NAMES[ctx.provider];
  const stop: StripAction = { command: "stop", label: "Stop" }, dismiss: StripAction = { command: "dismiss", label: "Dismiss" };
  const recover: StripAction[] = [{ command: "editOnHome", label: "Edit on Home" }, dismiss];
  const view = (title: string, body: string | null, actions: StripAction[]): StripView => ({ title, body, live: "status", alertKey: null, actions });
  switch (state.kind) {
    case "starting": return view(`Starting ${p}`, ctx.branch ? `${ctx.project} · ${ctx.branch}` : ctx.project, [stop]);
    case "working": return view(`${p} is working`, state.activity, [stop]);
    // No option is the default: Allow gets no autofocus or prominence (design §7).
    case "permission": return { title: `${p} needs your answer`, body: state.summary, live: "alert", alertKey: state.requestId, actions: [...state.options.map(o => ({ command: "answer" as const, label: o.label, optionId: o.id })), stop] };
    case "failed": {
      const copy = (Object.hasOwn(FAILURES, state.code) ? FAILURES[state.code]! : STOPPED)(p);
      return view(copy.title, copy.body, recover);
    }
    case "interrupted": return view("Stopped", state.reason === "user" ? "You stopped this conversation." : "This conversation stopped before it finished.", recover);
    case "done": return view("Done", ctx.canvas ? `${ctx.canvas} is ready.` : null, ctx.canvas ? [{ command: "open", label: "Open" }, dismiss] : [dismiss]);
  }
}
