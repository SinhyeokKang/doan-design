import type { Provider } from "../main/agentAuth/types";
import type { StripState } from "./conversationStrip";
import type { AttachmentDraft, PresetSummary } from "./homeComposer";

// Home conversations the renderer follows in this run: those it started and, after a reload, those main's list names
// for the strip (buzz-home design §7; buzz-conversation design §3.4).

export interface HomeConversation {
  conversationId: string; root: string; provider: Provider;
  phase: StripState["kind"];
  // The canvas path main bound the conversation to, from its list.
  canvas?: string;
}

const RUNNING: readonly StripState["kind"][] = ["starting", "working", "permission"];

// One sidebar row: a canvas row when the conversation is bound, else its project row.
export function slotKey(root: string, canvas?: string): string { return canvas === undefined ? root : `${root}\n${canvas}`; }

export interface Slot { kind: "permission" | "working" | "unseen"; label: string }

// One Home conversation per root while the strip can show only one, so no permission request hides behind another.
export function runningInRoot(conversations: readonly HomeConversation[], root: string): string | null {
  return conversations.find(c => c.root === root && RUNNING.includes(c.phase))?.conversationId ?? null;
}

// Home's reason line and the removal confirmation (spec decision 18): project conversations started outside Home count
// too, so the sentence no longer says where the conversation came from. The removal dialog has no conversation of its
// own to compare with, so it says "A" where the reason line says "Another".
export function anotherConversation(project: string, waiting: boolean): string {
  return waiting ? `Another conversation in ${project} needs your answer.` : `Another conversation is still running in ${project}.`;
}
function aConversation(project: string, waiting: boolean): string {
  return waiting ? `A conversation in ${project} needs your answer.` : `A conversation is still running in ${project}.`;
}

// `running`: the conversations that hold the project's roots (HomeRun reads them from main's list).
export function removalConfirm(running: readonly { conversationId: string; waiting: boolean }[], project: string): { conversations: string[]; title: string; body: string; cancel: string; confirm: string } | null {
  if (running.length === 0) return null;
  return {
    conversations: running.map(c => c.conversationId),
    title: `Stop the conversation and remove ${project}?`,
    body: `${aConversation(project, running.every(c => c.waiting))} Doan stops it, then removes the project from the list. Files stay on disk.`,
    cancel: "Cancel", confirm: "Stop and Remove",
  };
}

export interface LastRequest {
  root: string; text: string; preset: PresetSummary | null; attachments: AttachmentDraft[];
  provider: Provider; model: string | null; effort: string | null;
}
export interface ComposerDraft { text: string; preset: PresetSummary | null; attachments: readonly AttachmentDraft[] }

export function rememberRequest<T extends LastRequest>(requests: ReadonlyMap<string, T>, request: T): Map<string, T> {
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
