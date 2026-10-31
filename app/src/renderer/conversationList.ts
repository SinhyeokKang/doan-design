import type { Provider } from "../main/agentAuth/types";
import type { Canvas } from "../main/conversation/types";
import { PROVIDER_NAMES } from "./agentAuthView";
import { slotKey, type Slot } from "./homeConversations";

// One entry of main's conversation list for a root (buzz-conversation design §2.1). The renderer names the shape here
// until main's conversation:list type exists; main adds it in the same feature.
export interface ConversationSummary {
  conversationId: string; canvas?: Canvas; title: string;
  state: "current" | "archived"; owner: "doan" | "external";
  provider: Provider; model?: string; effort?: string;
  fromHome: boolean;
  // running: a turn is starting or working; permission: an unanswered permission request; ended: no live turn.
  phase: "running" | "permission" | "ended";
  // The conversation ended after the person last saw it (a crash-folded turn counts).
  unseen: boolean;
  queued: number; lastActivityAt: string; preview: string;
  // Main could not read this record; the rest of the list is still good.
  readError?: true;
}
export type ConversationList = ReadonlyMap<string, readonly ConversationSummary[]>;

const RANK: Record<Slot["kind"], number> = { permission: 3, working: 2, unseen: 1 };

// What is left for the person in one conversation, or null. `seen` holds conversations the person marked seen whose
// list refresh has not arrived yet (Dismiss, a visit): the reply and the list notice may come in any order
// (POSTMORTEM 2026-10-26).
function work(c: ConversationSummary, seen: ReadonlySet<string>): Slot | null {
  if (c.readError) return null;
  const p = PROVIDER_NAMES[c.provider];
  if (c.phase === "permission") return { kind: "permission", label: `${p} needs your answer` };
  if (c.phase === "running") return { kind: "working", label: `${p} is working` };
  // Failed and stopped turns may have changed files too, so every ending waits to be seen (2026-10-29 user).
  return c.unseen && !seen.has(c.conversationId) ? { kind: "unseen", label: `New changes from ${p}` } : null;
}

// A canvas row by ID first, so a moved canvas keeps its slot; a canvas without an ID matches by path.
function listed(canvas: Canvas, rows: readonly Canvas[]): Canvas | null {
  const byId = canvas.id ? rows.filter(row => row.id === canvas.id) : [];
  if (byId.length === 1) return byId[0]!;
  return canvas.id ? null : rows.find(row => !row.id && row.path === canvas.path) ?? null;
}

// The sidebar slots from main's list: the strongest state on each row, keyed like homeConversations' slotKey. Only Home
// conversations count, as before the list existed. A conversation whose canvas is no longer listed shows on its
// project row. `canvases` gives each root's listed canvas rows.
export function slotsFromList(lists: ConversationList, seen: ReadonlySet<string>, canvases: (root: string) => readonly Canvas[]): Map<string, Slot> {
  const slots = new Map<string, Slot>();
  for (const [root, list] of lists) {
    for (const c of list) {
      if (!c.fromHome) continue;
      const slot = work(c, seen);
      if (!slot) continue;
      const row = c.canvas ? listed(c.canvas, canvases(root)) : null;
      const key = slotKey(root, row?.path);
      const held = slots.get(key);
      if (!held || RANK[slot.kind] > RANK[held.kind]) slots.set(key, slot);
    }
  }
  return slots;
}

// The workspace strip for one root: the Home conversation with work left (running, waiting for an answer, or an
// unseen ending), the strongest state first and then the latest activity. null when nothing is left.
export function stripFromList(list: readonly ConversationSummary[], seen: ReadonlySet<string>): ConversationSummary | null {
  let best: { c: ConversationSummary; rank: number } | null = null;
  for (const c of list) {
    if (!c.fromHome) continue;
    const slot = work(c, seen);
    if (!slot) continue;
    const rank = RANK[slot.kind];
    if (!best || rank > best.rank || (rank === best.rank && c.lastActivityAt > best.c.lastActivityAt)) best = { c, rank };
  }
  return best?.c ?? null;
}
