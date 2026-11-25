import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import { deleteAvailability, type DeleteAvailability } from "./conversationDelete";
import { conversationWork, scheduledOf } from "./conversationList";
import { draftKey } from "./dockedRules";
import type { Slot } from "./homeConversations";

// The Overview host owns the list reads and every call to main; these functions only decide.

export interface ShortTime { text: string; label: string }

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

// A time ahead of the clock reads now.
export function shortAgo(at: string, now: number): ShortTime | null {
  const time = Date.parse(at);
  if (at === "" || Number.isNaN(time)) return null;
  const elapsed = Math.max(0, now - time);
  if (elapsed < MINUTE) return { text: "now", label: "Just now" };
  if (elapsed < HOUR) { const n = Math.floor(elapsed / MINUTE); return { text: `${n}m`, label: plural(n, "minute") }; }
  if (elapsed < DAY) { const n = Math.floor(elapsed / HOUR); return { text: `${n}h`, label: plural(n, "hour") }; }
  // The first day only; older times read as their date.
  if (elapsed < 2 * DAY) return { text: "1d", label: plural(1, "day") };
  const date = new Date(time);
  const year = date.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric";
  const text = date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year } : {}) });
  return { text, label: text };
}

export interface ConversationStatus { kind: Slot["kind"]; label: string }
const STATUS_LABELS: Record<Exclude<Slot["kind"], "scheduled">, string> = { permission: "Needs your answer", working: "Working", unseen: "Conversation finished — unread" };

// From the sidebar slot's rule (conversationWork), so a row and its slot never disagree. Unlike the sidebar, every
// conversation counts here, not only those started from Home.
export function conversationStatus(c: ConversationSummary, seen: ReadonlySet<string>, scheduled: Slot | null = null): ConversationStatus | null {
  const slot = conversationWork(c, seen, scheduled);
  if (!slot) return null;
  return { kind: slot.kind, label: slot.kind === "scheduled" ? slot.label : STATUS_LABELS[slot.kind] };
}

// The same component draws both.
export interface ConversationLine {
  conversationId: string; provider: Provider; status: ConversationStatus | null; time: ShortTime | null; preview: string;
}
export const UNREADABLE_CONVERSATION = "Can’t read this conversation";

export function conversationLine(c: ConversationSummary, now: number, seen: ReadonlySet<string>): ConversationLine {
  return {
    conversationId: c.conversationId, provider: c.provider, status: conversationStatus(c, seen, scheduledOf(c, now)),
    time: shortAgo(c.lastActivityAt, now), preview: c.readError ? UNREADABLE_CONVERSATION : c.preview,
  };
}

// A project conversation an earlier build promoted carries its canvas from then on.
const isProject = (c: ConversationSummary) => c.canvas === undefined;

// An unreadable history's empty time sorts last; the id breaks ties so the default pick and the dropdown agree
// whatever order main lists them in.
export function byActivity(a: ConversationSummary, b: ConversationSummary): number {
  if (a.lastActivityAt !== b.lastActivityAt) return a.lastActivityAt < b.lastActivityAt ? 1 : -1;
  return a.conversationId < b.conversationId ? -1 : a.conversationId > b.conversationId ? 1 : 0;
}

export interface MenuItem extends ConversationLine { title: string; readError: boolean; deletable: DeleteAvailability }
export function menuItem(c: ConversationSummary, now: number, seen: ReadonlySet<string>): MenuItem {
  return { ...conversationLine(c, now, seen), title: c.title, readError: c.readError === true, deletable: deleteAvailability(c) };
}

export function projectConversationMenu(list: readonly ConversationSummary[], now: number, seen: ReadonlySet<string> = new Set()): MenuItem[] {
  return list.filter(isProject).sort(byActivity).map(c => menuItem(c, now, seen));
}

// wait: nothing rather than a new conversation that then changes. forget: the remembered conversation is on a canvas
// now, so ui-state drops it.
export type OverviewPick =
  | { kind: "wait" }
  | { kind: "reread"; conversationId: string }
  | { kind: "conversation"; conversationId: string }
  | { kind: "canvas"; conversationId: string; canvas: Canvas }
  | { kind: "new"; forget: boolean; fresh?: true };

// An unreadable history says nothing about having been seen, so it never counts.
function endedAndSeen(c: ConversationSummary, seen: ReadonlySet<string>): boolean {
  return !c.readError && c.phase === "ended" && !c.working && c.queued === 0 && c.scheduledAt === undefined && !c.returnedDraft && (!c.unseen || seen.has(c.conversationId));
}

// A requested or remembered unreadable one still opens so its thread can say so. `fresh`: a person coming back to the
// app starts with a new conversation rather than one already finished and read.
export function pickOverviewConversation(list: readonly ConversationSummary[] | null, remembered: string | undefined, request: string | null, fresh: ReadonlySet<string> | null = null): OverviewPick {
  if (list === null) return { kind: "wait" };
  if (request !== null) {
    const asked = list.find(c => c.conversationId === request);
    if (!asked) return { kind: "reread", conversationId: request };
    return asked.canvas ? { kind: "canvas", conversationId: asked.conversationId, canvas: asked.canvas } : { kind: "conversation", conversationId: asked.conversationId };
  }
  const last = remembered === undefined ? undefined : list.find(c => c.conversationId === remembered);
  if (last?.canvas) return { kind: "new", forget: true };
  const candidate = last ?? list.filter(c => isProject(c) && !c.readError).sort(byActivity)[0];
  if (!candidate) return { kind: "new", forget: false };
  if (fresh && endedAndSeen(candidate, fresh)) return { kind: "new", forget: false, fresh: true };
  return { kind: "conversation", conversationId: candidate.conversationId };
}

// listed: its absence later means it is gone rather than not listed yet.
export interface OverviewCurrent { root: string; conversationId: string | null; listed: boolean }
export interface DraftMove { from: string; to: string }
export type OverviewChange = { kind: "keep" } | { kind: "gone"; draft: DraftMove };

// A gone conversation's draft moves to the root's new conversation key, so the typed text, composition included,
// stays in the same field.
export function overviewAfterListChange(current: OverviewCurrent, change: { root: string; list: readonly ConversationSummary[] }): OverviewChange {
  const id = current.conversationId;
  if (change.root !== current.root || id === null) return { kind: "keep" };
  // The provider does not take part in the key; it is here only to build an existing mode.
  const draft = { from: draftKey({ kind: "existing", conversationId: id, provider: "claude" }), to: draftKey({ kind: "new", root: current.root }) };
  if (change.list.some(item => item.conversationId === id)) return { kind: "keep" };
  return current.listed ? { kind: "gone", draft } : { kind: "keep" };
}
