import { foldConversation } from "./state";
import type { ConversationMetadata } from "./store";
import type { Provider } from "../agentAuth/types";
import type { Canvas, ConversationEvent } from "./types";
// One row of a project's conversation list (conversation:list). The renderer imports this type only.
export interface ConversationSummary {
  conversationId: string; canvas?: Canvas; title: string; state: "current" | "archived";
  owner: "doan" | "legacy-external"; provider: Provider; model?: string; effort?: string; fromHome: boolean;
  // waiting: an unanswered permission request. ended also covers a turn a restart folded as crashed.
  phase: "running" | "waiting" | "ended"; unseen: boolean; queued: number; lastActivityAt: string; preview: string;
  // main is still working on it, whatever the history says: preparing, running or waiting for an answer, a project turn
  // waiting for its judgement, a queue about to go out, or a send waiting for the previous process. A project
  // conversation that works holds its root (project_busy).
  working: boolean;
  // The history could not be read (corrupt, over the size limit, or a line from a newer build); only this row fails.
  readError?: true;
  // Queued messages came back as a draft (conversation:takeDraft) after a failed or stopped turn, a refused queued
  // send or a restart.
  returnedDraft?: true;
}
// Long enough for one line of a canvas row or conversation menu; the renderer still truncates to its width.
export const PREVIEW_CHARS = 140;
const COMMAND = "Running a command";
// live: this run holds the conversation, so an unfinished turn is still running rather than folded as crashed.
export function conversationSummary(m: ConversationMetadata, read: { ok: true; events: readonly ConversationEvent[] } | { ok: false }, live: { live: boolean; queued: number; working: boolean }): ConversationSummary {
  const base = {
    conversationId: m.conversationId, ...(m.canvas ? { canvas: m.canvas } : {}), title: m.title, state: m.state,
    owner: m.owner.kind, provider: m.session.runtime, ...(m.model ? { model: m.model } : {}), ...(m.effort ? { effort: m.effort } : {}),
    fromHome: m.fromHome === true, queued: live.queued, working: live.working,
  };
  if (!read.ok) return { ...base, phase: "ended", unseen: false, lastActivityAt: "", preview: "", readError: true };
  const events = read.events, folded = foldConversation(events, m.conversationId, !live.live);
  const phase = folded.turn === "waitingPermission" ? "waiting" : folded.turn === "starting" || folded.turn === "streaming" ? "running" : "ended";
  // Markers of binding, archiving and restoring are not something to see: they would mark a seen end unseen again.
  const lastTurnSeq = [...events].reverse().find(e => !e.type.startsWith("conversation."))?.seq ?? 0;
  const unseen = phase === "ended" && m.state === "current" && m.seenSeq !== undefined && lastTurnSeq > m.seenSeq;
  return { ...base, phase, unseen, lastActivityAt: events.at(-1)?.at ?? "", preview: preview(events, phase, folded.permissions, folded.turnId, folded.messages) };
}
function preview(events: readonly ConversationEvent[], phase: ConversationSummary["phase"], permissions: Record<string, string>, turnId: string | null, messages: { text: string }[]): string {
  if (phase === "waiting") {
    const pending = [...events].reverse().find(e => e.type === "permission.request" && permissions[e.requestId] === "pending");
    if (pending?.type === "permission.request") return cap(`Needs your answer: ${pending.summary}`);
  }
  if (phase === "running") {
    const activity = [...events].reverse().find(e => e.turnId === turnId && e.type === "activity");
    if (activity?.type === "activity") return cap(activity.kind === "command" ? COMMAND : activity.summary);
  }
  const last = messages.at(-1);
  // Agent output is untrusted and can be megabytes; only the start can reach the preview, and plain's patterns are not linear.
  return last ? cap(plain(last.text.slice(0, PREVIEW_CHARS * 8))) : "";
}
// A one-line approximation of the rendered message: Markdown markers go, their text stays, raw HTML stays as text.
function plain(text: string): string {
  return text
    .replace(/^[ \t]*(```|~~~).*$/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]*\|?(?:[ \t]*:?-{3,}:?[ \t]*\|?)+[ \t]*$/gm, "")
    .replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, "")
    .replace(/^[ \t]*(?:>[ \t]?)*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)?/gm, "")
    .replace(/\|/g, " ")
    .replace(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/\*(?=\S)([^*\n]*?\S)\*/g, "$1")
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?![\w])/g, "$1$2")
    .replace(/`+/g, "");
}
function cap(text: string): string {
  const chars = [...text.replace(/\s+/g, " ").trim()];
  return chars.length > PREVIEW_CHARS ? `${chars.slice(0, PREVIEW_CHARS - 1).join("").trimEnd()}…` : chars.join("");
}
// The seen marker moves only forward and never past the conversation's last seq.
export function clampSeen(seq: number, lastSeq: number, current: number | undefined): number {
  return Math.max(current ?? 0, Math.min(seq, lastSeq));
}
