import type { Provider } from "../main/agentAuth/types";
import { hasContent, sameSegments, type FieldSegment } from "./anchorField";
import type { StripState } from "./conversationStrip";
import type { HomeCard } from "./homeCards";
import type { AttachmentDraft, PresetSummary } from "./homeComposer";

// After a reload, also those main's list names for the strip.

export interface HomeConversation {
  conversationId: string; root: string; provider: Provider;
  phase: StripState["kind"];
  canvas?: string;
}

export function slotKey(root: string, canvas?: string): string { return canvas === undefined ? root : `${root}\n${canvas}`; }

// `source`: a terminal session's `doan work`; absent for an app conversation.
export interface Slot { kind: "permission" | "working" | "scheduled" | "unseen"; label: string; source?: "terminal" }

// Project conversations started outside Home count too, so the sentence does not say where the conversation came
// from.
function aConversation(project: string, waiting: boolean): string {
  return waiting ? `A conversation in ${project} needs your answer.` : `A conversation is still running in ${project}.`;
}

// The running-conversation confirmation replaces the plain one, since it already asks before removing. Only the list
// changes, which the body says.
export function removalConfirm(running: readonly { conversationId: string; waiting: boolean }[], label: string, count: number): { conversations: string[]; title: string; body: string; cancel: string; confirm: string } {
  if (running.length === 0) return {
    conversations: [],
    title: `Remove ${label} from Doan?`,
    body: `This removes ${count > 1 ? `its ${count} worktrees` : "it"} from Doan’s project list only. Files and Git worktrees stay on disk.`,
    cancel: "Cancel", confirm: "Remove from Doan",
  };
  if (running.length > 1) return {
    conversations: running.map(c => c.conversationId),
    title: `Stop ${running.length} conversations and remove ${label}?`,
    body: `Doan will stop ${running.length === 2 ? "both" : `all ${running.length}`} conversations, then remove ${label} from your project list. Files and Git worktrees stay on disk.`,
    cancel: "Cancel", confirm: "Stop and remove",
  };
  return {
    conversations: running.map(c => c.conversationId),
    title: `Stop the conversation and remove ${label}?`,
    body: `${aConversation(label, running.every(c => c.waiting))} Doan stops it, then removes the project from the list. Files and Git worktrees stay on disk.`,
    cancel: "Cancel", confirm: "Stop and remove",
  };
}

export function removalQuestionLabel(cards: readonly HomeCard[], paths: readonly string[], names: ReadonlyMap<string, string>): string {
  const card = cards.find(card => card.rows.some(row => paths.includes(row.path)));
  if (!card) return names.get(paths[0] ?? "") ?? "";
  const row = paths.length === 1 && card.rows.length > 1 ? card.rows.find(row => row.path === paths[0]) : undefined;
  const git = row?.kind === "list" ? row.git : undefined;
  const branch = git?.branch ?? (git?.detached === undefined ? undefined : `detached ${git.detached.slice(0, 7)}`);
  return branch === undefined ? card.name : `${card.name} (${branch})`;
}

export interface LastRequest {
  // segments: the draft as sent, its canvas chips of `root`.
  root: string; segments: readonly FieldSegment[]; preset: PresetSummary | null; attachments: AttachmentDraft[];
  provider: Provider; model: string | null; effort: string | null;
  // The composer turns them into object URLs.
  thumbnails?: Readonly<Record<string, Uint8Array>>;
}
export interface ComposerDraft { segments: readonly FieldSegment[]; preset: PresetSummary | null; attachments: readonly AttachmentDraft[] }

export function rememberRequest<T extends LastRequest>(requests: ReadonlyMap<string, T>, request: T): Map<string, T> {
  return new Map(requests).set(request.root, request);
}

// Only the body names where the request went.
export const REPLACE_DRAFT = { title: "Replace your draft?", cancel: "Keep draft", confirm: "Replace" } as const;
export type ReplaceDraftConfirm = { title: string; body: string; cancel: string; confirm: string };

// Attachments keep main's ids: main checks each again when the start is accepted and refuses a moved one, and the
// renderer has no other way to check a path.
export function restoreRequest(draft: ComposerDraft, last: LastRequest, project: string): { request: LastRequest; confirm: ReplaceDraftConfirm | null } {
  const request = last;
  const empty = !hasContent(draft.segments) && !draft.preset && draft.attachments.length === 0;
  const same = sameSegments(draft.segments, last.segments) && draft.preset?.id === last.preset?.id
    && draft.attachments.length === last.attachments.length && draft.attachments.every((a, i) => a.key === last.attachments[i]!.key);
  return {
    request,
    confirm: empty || same ? null : { ...REPLACE_DRAFT, body: `Your draft will be replaced by the last request you sent to ${project}.` },
  };
}

// Once per request, and only when that project is not on screen.
export function permissionToastKey(next: StripState, previous: StripState | undefined, viewing: boolean): string | null {
  if ((next.kind !== "permission" && next.kind !== "question") || viewing) return null;
  return (previous?.kind === "permission" || previous?.kind === "question") && previous.requestId === next.requestId ? null : next.requestId;
}
