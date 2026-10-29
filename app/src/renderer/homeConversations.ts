import type { Provider } from "../main/agentAuth/types";
import { PROVIDER_NAMES } from "./agentAuthView";
import type { StripState } from "./conversationStrip";
import type { AttachmentDraft, PresetSummary } from "./homeComposer";

// Home conversations as the renderer keeps them for this run only (buzz-home design §7.2, §7.4, §7.5): a reload
// or restart forgets them, so the sidebar slots, the last requests and the one-per-root rule go with them.

export interface HomeConversation {
  conversationId: string; root: string; provider: Provider;
  phase: StripState["kind"];
  // The canvas path main bound the conversation to (design §7.3).
  canvas?: string;
  // The visit clock's tick when the turn ended; a turn that ended after the last visit to its row is unseen.
  finishedAt?: number;
}

const RUNNING: readonly StripState["kind"][] = ["starting", "working", "permission"];
const FINISHED: readonly StripState["kind"][] = ["done", "failed", "interrupted"];

export function conversationPhase(conversation: HomeConversation, phase: StripState["kind"], tick: number): HomeConversation {
  if (conversation.phase === phase) return conversation;
  const { finishedAt: _finishedAt, ...rest } = conversation;
  return FINISHED.includes(phase) ? { ...rest, phase, finishedAt: tick } : { ...rest, phase };
}

// One sidebar row: a canvas row when the conversation is bound, else its project row.
export function slotKey(root: string, canvas?: string): string { return canvas === undefined ? root : `${root}\n${canvas}`; }

export interface Slot { kind: "permission" | "working" | "unseen"; label: string }
const RANK: Record<Slot["kind"], number> = { permission: 3, working: 2, unseen: 1 };

// visits: slotKey → the tick of the last time that row's screen was shown (a workspace visit for a project row).
export function slotState(conversations: readonly HomeConversation[], visits: ReadonlyMap<string, number>): Map<string, Slot> {
  const slots = new Map<string, Slot>();
  for (const c of conversations) {
    const key = slotKey(c.root, c.canvas), p = PROVIDER_NAMES[c.provider];
    let slot: Slot | null = null;
    if (c.phase === "permission") slot = { kind: "permission", label: `${p} needs your answer` };
    else if (c.phase === "starting" || c.phase === "working") slot = { kind: "working", label: `${p} is working` };
    // Failed and stopped turns may have changed files too, so every ending waits to be seen (2026-10-29 user).
    else if (FINISHED.includes(c.phase) && c.finishedAt !== undefined && (visits.get(key) ?? -Infinity) <= c.finishedAt) slot = { kind: "unseen", label: `New changes from ${p}` };
    const held = slots.get(key);
    if (slot && (!held || RANK[slot.kind] > RANK[held.kind])) slots.set(key, slot);
  }
  return slots;
}

// One Home conversation per root while the strip can show only one, so no permission request hides behind another.
export function runningInRoot(conversations: readonly HomeConversation[], root: string): string | null {
  return conversations.find(c => c.root === root && RUNNING.includes(c.phase))?.conversationId ?? null;
}

export function removalConfirm(conversations: readonly HomeConversation[], roots: readonly string[], project: string): { conversations: string[]; title: string; body: string; cancel: string; confirm: string } | null {
  const running = conversations.filter(c => roots.includes(c.root) && RUNNING.includes(c.phase)).map(c => c.conversationId);
  if (running.length === 0) return null;
  return {
    conversations: running,
    title: `Stop the conversation and remove ${project}?`,
    body: `A conversation from Home is still running in ${project}. Doan stops it, then removes the project from the list. Files stay on disk.`,
    cancel: "Cancel", confirm: "Stop and Remove",
  };
}

export interface LastRequest {
  root: string; text: string; preset: PresetSummary | null; attachments: AttachmentDraft[];
  provider: Provider; model: string | null; effort: string | null;
}
export interface ComposerDraft { text: string; preset: PresetSummary | null; attachments: readonly AttachmentDraft[] }

export function rememberRequest(requests: ReadonlyMap<string, LastRequest>, request: LastRequest): Map<string, LastRequest> {
  return new Map(requests).set(request.root, request);
}

// A different draft is never replaced without asking. Attachments keep main's ids: main checks each again when the
// start is accepted and refuses a moved one (attachment_missing), and the renderer has no other way to check a path.
export function restoreRequest(draft: ComposerDraft, last: LastRequest, project: string): { request: LastRequest; confirm: { title: string; body: string; cancel: string; confirm: string } | null } {
  const request = last;
  const empty = !draft.text.trim() && !draft.preset && draft.attachments.length === 0;
  const same = draft.text === last.text && draft.preset?.id === last.preset?.id
    && draft.attachments.length === last.attachments.length && draft.attachments.every((a, i) => a.key === last.attachments[i]!.key);
  return {
    request,
    confirm: empty || same ? null : { title: "Replace your draft?", body: `Your draft will be replaced by the last request you sent to ${project}.`, cancel: "Keep Draft", confirm: "Replace" },
  };
}

// Rows to ask main about (conversation:forCanvas): absent when the request was sent and not asked about yet (§7.3).
export function newCanvasCandidates<T extends { path: string }>(rows: readonly T[], atStart: readonly string[], checked: readonly string[]): T[] {
  return rows.filter(row => !atStart.includes(row.path) && !checked.includes(row.path));
}

// The toast is secondary to the slot (design §7): once per request, and only when that project is not on screen.
export function permissionToastKey(next: StripState, previous: StripState | undefined, viewing: boolean): string | null {
  if (next.kind !== "permission" || viewing) return null;
  return previous?.kind === "permission" && previous.requestId === next.requestId ? null : next.requestId;
}
