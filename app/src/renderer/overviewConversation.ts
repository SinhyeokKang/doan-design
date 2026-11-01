import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import { conversationWork } from "./conversationList";
import { draftKey } from "./dockedRules";
import type { Slot } from "./homeConversations";

// Which conversation the project Overview shows and how its dropdown and canvas rows read (buzz-project design §2.4,
// §3). The Overview host owns the list reads and every call to main; these functions only decide.

export interface ShortTime { text: string; label: string }

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

// now, 3m, 1h, 1d, then a date; the label spells it out for screen readers. A time ahead of the clock reads now.
export function shortAgo(at: string, now: number): ShortTime | null {
  const time = Date.parse(at);
  if (at === "" || Number.isNaN(time)) return null;
  const elapsed = Math.max(0, now - time);
  if (elapsed < MINUTE) return { text: "now", label: "Just now" };
  if (elapsed < HOUR) { const n = Math.floor(elapsed / MINUTE); return { text: `${n}m`, label: plural(n, "minute") }; }
  if (elapsed < DAY) { const n = Math.floor(elapsed / HOUR); return { text: `${n}h`, label: plural(n, "hour") }; }
  // The first day only (design §0); older times read as their date.
  if (elapsed < 2 * DAY) return { text: "1d", label: plural(1, "day") };
  const date = new Date(time);
  const year = date.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric";
  const text = date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year } : {}) });
  return { text, label: text };
}

export interface ConversationStatus { kind: Slot["kind"]; label: string }
const STATUS_LABELS: Record<Slot["kind"], string> = { permission: "Needs your answer", working: "Working", unseen: "Finished, not seen" };

// From the sidebar slot's own per-conversation rule (conversationWork), so a row and its slot never disagree between
// renders. Unlike the sidebar, every conversation counts here, not only those started from Home.
export function conversationStatus(c: ConversationSummary, seen: ReadonlySet<string>): ConversationStatus | null {
  const slot = conversationWork(c, seen);
  return slot ? { kind: slot.kind, label: STATUS_LABELS[slot.kind] } : null;
}

// One dropdown item or canvas row line: the same component draws both (design §2.1).
export interface ConversationLine {
  conversationId: string; provider: Provider; status: ConversationStatus | null; time: ShortTime | null; preview: string;
}
export const UNREADABLE_CONVERSATION = "Can’t read this conversation";

export function conversationLine(c: ConversationSummary, now: number, seen: ReadonlySet<string>): ConversationLine {
  return {
    conversationId: c.conversationId, provider: c.provider, status: conversationStatus(c, seen),
    time: shortAgo(c.lastActivityAt, now), preview: c.readError ? UNREADABLE_CONVERSATION : c.preview,
  };
}

// A conversation bound to no canvas; a promoted one carries its canvas from then on.
const isProject = (c: ConversationSummary) => c.canvas === undefined;

// The most recent activity first. ISO times compare as strings, and an unreadable history's empty time sorts last; the
// id breaks ties so the default pick and the dropdown agree whatever order main lists them in. Shared with the canvas
// panel's dropdown.
export function byActivity(a: ConversationSummary, b: ConversationSummary): number {
  if (a.lastActivityAt !== b.lastActivityAt) return a.lastActivityAt < b.lastActivityAt ? 1 : -1;
  return a.conversationId < b.conversationId ? -1 : a.conversationId > b.conversationId ? 1 : 0;
}

export interface MenuItem extends ConversationLine { title: string; readError: boolean }
// One dropdown row, the same in the Overview and the canvas panel.
export function menuItem(c: ConversationSummary, now: number, seen: ReadonlySet<string>): MenuItem {
  return { ...conversationLine(c, now, seen), title: c.title, readError: c.readError === true };
}

export function projectConversationMenu(list: readonly ConversationSummary[], now: number, seen: ReadonlySet<string> = new Set()): MenuItem[] {
  return list.filter(isProject).sort(byActivity).map(c => menuItem(c, now, seen));
}

// wait: the list was not read yet, so nothing is shown rather than a new conversation that then changes. reread: the
// requested conversation is not listed yet (a start's reply can overtake its list notice); read again with it held.
// forget: the remembered conversation was promoted, so ui-state drops it.
export type OverviewPick =
  | { kind: "wait" }
  | { kind: "reread"; conversationId: string }
  | { kind: "conversation"; conversationId: string }
  | { kind: "canvas"; conversationId: string; canvas: Canvas }
  | { kind: "new"; forget: boolean };

// Spec decision 5: the requested conversation, the one last shown on this device, the latest project conversation,
// else a new one. A remembered conversation that is gone is skipped; an unreadable one is not the latest, but a
// requested or remembered one still opens so its thread can say it cannot be read.
export function pickOverviewConversation(list: readonly ConversationSummary[] | null, remembered: string | undefined, request: string | null): OverviewPick {
  if (list === null) return { kind: "wait" };
  if (request !== null) {
    const asked = list.find(c => c.conversationId === request);
    if (!asked) return { kind: "reread", conversationId: request };
    return asked.canvas ? { kind: "canvas", conversationId: asked.conversationId, canvas: asked.canvas } : { kind: "conversation", conversationId: asked.conversationId };
  }
  const last = remembered === undefined ? undefined : list.find(c => c.conversationId === remembered);
  if (last?.canvas) return { kind: "new", forget: true };
  if (last) return { kind: "conversation", conversationId: last.conversationId };
  const latest = list.filter(c => isProject(c) && !c.readError).sort(byActivity)[0];
  return latest ? { kind: "conversation", conversationId: latest.conversationId } : { kind: "new", forget: false };
}

// The Overview's main conversation: null is the new conversation state. listed: it has appeared in a list read, so its
// absence later means it is gone rather than not listed yet.
export interface OverviewCurrent { root: string; conversationId: string | null; listed: boolean }
export interface DraftMove { from: string; to: string }
// No seen seq here: only the host holds the thread events and knows whether the person saw the turn end, so it marks
// seen through the promotion marker event itself.
export type OverviewChange =
  | { kind: "keep" }
  | { kind: "promoted"; conversationId: string; title: string; canvas: Canvas; draft: DraftMove }
  | { kind: "gone"; draft: DraftMove };

// After a list read for `root` (spec decision 6). The draft moves to the root's new conversation key so the typed text,
// composition included, stays in the same field.
export function overviewAfterListChange(current: OverviewCurrent, change: { root: string; list: readonly ConversationSummary[] }): OverviewChange {
  const id = current.conversationId;
  if (change.root !== current.root || id === null) return { kind: "keep" };
  // The provider does not take part in the key; it is here only to build an existing mode.
  const draft = { from: draftKey({ kind: "existing", conversationId: id, provider: "claude" }), to: draftKey({ kind: "new", root: current.root }) };
  const c = change.list.find(item => item.conversationId === id);
  if (!c) return current.listed ? { kind: "gone", draft } : { kind: "keep" };
  if (c.canvas) return { kind: "promoted", conversationId: id, title: c.title, canvas: c.canvas, draft };
  return c.state === "archived" ? { kind: "gone", draft } : { kind: "keep" };
}
