import { toSee } from "./seenEvents";
import { foldConversation, type FoldedConversation } from "./state";
import type { ConversationMetadata } from "./store";
import type { Provider } from "../agentAuth/types";
import type { ClaudeRunMode, PermissionModeId } from "./permissionMode";
import type { Canvas, ConversationEvent } from "./types";
// One row of a project's conversation list (conversation:list). The renderer imports this type only.
export interface ConversationSummary {
  conversationId: string; canvas?: Canvas; title: string;
  // permissionMode: absent for Default; a Claude plan approval changes it too. claudeRunMode: doan-owned Claude only, the
  // last Ask first turn's settings mode; the trigger names it only while Ask first is (renderer permissionPicker.ts).
  owner: "doan" | "legacy-external"; provider: Provider; model?: string; effort?: string; fast?: true; permissionMode?: PermissionModeId; claudeRunMode?: ClaudeRunMode; fromHome: boolean;
  // waiting: an unanswered permission request or question. ended also covers a turn a restart folded as crashed.
  phase: "running" | "waiting" | "ended"; unseen: boolean; queued: number; lastActivityAt: string; preview: string;
  // ISO: while waiting, when the earliest request still unanswered was made. Output during the wait and an answer to
  // another request move lastActivityAt, not this, so the conversation that waited longest stays first.
  waitingSince?: string;
  // main is still working on it, whatever the history says (service.ts working); Delete reads the same signal.
  working: boolean;
  // A project conversation's turn that works or that a project removal is stopping: the live generation to which that
  // removal's Stop must be addressed.
  projectTurnId?: string;
  // The history could not be read (corrupt, over the size limit, or a line from a newer build); only this row fails.
  readError?: true;
  // What started this canvas conversation when the person did not: a handoff, or an earlier build's promotion. A
  // handoff's start is in the history alone, so an unreadable one reads as the person's.
  startedBy?: "handoff" | "promotion";
  // Queued messages came back as a draft (conversation:takeDraft) after a failed or stopped turn, a refused queued
  // send or a restart.
  returnedDraft?: true;
  // Claude Code's suggestion for the next message, kept in main memory only. Present only while the composer would show
  // it: a conversation whose turn ended, not working, with nothing queued and no returned draft.
  suggestion?: string;
  // Background work the done turn turnId started still runs (memory only); stopping: its Stop was pressed.
  background?: { turnId: string; stopping?: true };
  // A Stop of the running turn was taken; its end may still be on its way.
  stopping?: true;
  // ISO: the reset time of the usage limit main holds, in memory only, for the Doan connection of this current Claude
  // Code or Codex conversation; a send now is scheduled for after it (conversation `send` answers { scheduled }).
  limitResetsAt?: string;
  // ISO: the queued messages wait for the usage limit's reset at this time and go out shortly after; the conversation is
  // then not working. The items come from the conversation `scheduled` method.
  scheduledAt?: string;
  // Messages other conversations' agents sent that wait in this queue, in queue order; queued counts only the person's.
  agentQueue?: AgentQueueRow[];
}
// An agent's queued message. provider: the sender's, for its logo (absent in an earlier record). source: the sending
// conversation and its canvas, named only to assistive technology. line: the message's one-line form, never read for
// {{n}} markers. held: it goes only after a done turn a person's message starts in this conversation; otherwise it goes
// after this conversation's next done turn. Removed with conversation removeQueued. after: the itemId of the person's
// waiting row it comes right after in send order, absent when no person's row waits ahead of it; rows on their way out
// are left out of both.
export interface AgentQueueRow { itemId: string; provider?: Provider; source: { conversationId: string; canvas?: Canvas }; line: string; held: boolean; after?: string }
// Long enough for one line of a canvas row or conversation menu; the renderer still truncates to its width.
export const PREVIEW_CHARS = 140;
const COMMAND = "Running a command";
// live: this run holds the conversation, so an unfinished turn is still running rather than crashed. returned: a draft in
// drafts.ts waits. suggestion, background, stopping, limitResetsAt, scheduledAt: memory-only (service.ts list).
export function conversationSummary(m: ConversationMetadata, read: { ok: true; events: readonly ConversationEvent[] } | { ok: false }, live: { live: boolean; queued: number; working: boolean; projectTurnId?: string; returned?: boolean; suggestion?: string; background?: { turnId: string; stopping?: true }; stopping?: true; limitResetsAt?: string; scheduledAt?: string; agentQueue?: AgentQueueRow[] }): ConversationSummary {
  const base = {
    conversationId: m.conversationId, ...(m.canvas ? { canvas: m.canvas } : {}), title: m.title,
    owner: m.owner.kind, provider: m.session.runtime, ...(m.model ? { model: m.model } : {}), ...(m.effort ? { effort: m.effort } : {}),
    ...(m.fast ? { fast: true as const } : {}), ...(m.permissionMode ? { permissionMode: m.permissionMode } : {}),
    ...(m.claudeRunMode && m.owner.kind === "doan" && m.owner.provider === "claude" ? { claudeRunMode: m.claudeRunMode } : {}), fromHome: m.fromHome === true, queued: live.queued, working: live.working,
    ...(live.projectTurnId ? { projectTurnId: live.projectTurnId } : {}),
    ...(live.returned ? { returnedDraft: true as const } : {}),
    ...(live.background ? { background: live.background } : {}), ...(live.stopping ? { stopping: true as const } : {}),
    ...(live.limitResetsAt ? { limitResetsAt: live.limitResetsAt } : {}), ...(live.scheduledAt ? { scheduledAt: live.scheduledAt } : {}),
    ...(live.agentQueue?.length ? { agentQueue: live.agentQueue } : {}),
  };
  // A canvas conversation whose session began as a project one (newDesign) got its canvas by an earlier build's
  // promotion: a newDesign start has no canvas, and this build never gives it one.
  const promoted = m.canvas !== undefined && m.session.origin === "newDesign" ? { startedBy: "promotion" as const } : {};
  if (!read.ok) return { ...base, ...promoted, phase: "ended", unseen: false, lastActivityAt: "", preview: "", readError: true };
  const first = read.events.find(e => e.type === "user.message");
  const startedBy = first?.type === "user.message" && first.origin?.kind === "handoff" ? { startedBy: "handoff" as const } : promoted;
  const events = read.events, folded = foldConversation(events, m.conversationId, !live.live);
  const phase = folded.turn === "waitingPermission" ? "waiting" : folded.turn === "starting" || folded.turn === "streaming" ? "running" : "ended";
  const lastTurnSeq = [...events].reverse().find(toSee)?.seq ?? 0;
  const unseen = phase === "ended" && m.seenSeq !== undefined && lastTurnSeq > m.seenSeq;
  // A queue or a returned draft is what the composer offers next, so a suggestion never competes with them.
  const since = phase === "waiting" ? events.find(e => pendingRequest(e, folded)) : undefined;
  const suggested = live.suggestion && phase === "ended" && !live.working && live.queued === 0 && !live.returned ? { suggestion: live.suggestion } : {};
  return { ...base, ...startedBy, phase, unseen, ...(since ? { waitingSince: since.at } : {}), lastActivityAt: events.at(-1)?.at ?? "", preview: preview(events, phase, folded, folded.turnId, folded.messages), ...suggested };
}
// Only the folded turn can hold a pending request, and an earlier turn's request may share its id (a new Codex
// app-server numbers its requests from 0 again).
function pendingRequest(e: ConversationEvent, open: Pick<FoldedConversation, "turnId" | "permissions" | "questions">): boolean {
  if (e.turnId !== open.turnId) return false;
  return (e.type === "permission.request" && open.permissions[e.requestId] === "pending") || (e.type === "question.request" && open.questions[e.requestId] === "pending");
}
function preview(events: readonly ConversationEvent[], phase: ConversationSummary["phase"], open: Pick<FoldedConversation, "turnId" | "permissions" | "questions">, turnId: string | null, messages: { text: string }[]): string {
  if (phase === "waiting") {
    // The newest unanswered request, whatever its kind; a question reads as its first question.
    const pending = [...events].reverse().find(e => pendingRequest(e, open));
    if (pending?.type === "permission.request") return cap(`Needs your answer: ${pending.summary}`);
    if (pending?.type === "question.request") return cap(`Needs your answer: ${pending.questions[0]!.question}`);
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
