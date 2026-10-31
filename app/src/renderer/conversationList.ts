import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import { PROVIDER_NAMES } from "./agentAuthView";
import { slotKey, type Slot } from "./homeConversations";

export type ConversationList = ReadonlyMap<string, readonly ConversationSummary[]>;

const RANK: Record<Slot["kind"], number> = { permission: 3, working: 2, unseen: 1 };

// What is left for the person in one conversation, or null. `seen` holds conversations the person marked seen whose
// list refresh has not arrived yet (Dismiss, a visit): the reply and the list notice may come in any order
// (POSTMORTEM 2026-10-26).
function work(c: ConversationSummary, seen: ReadonlySet<string>): Slot | null {
  if (c.readError) return null;
  const p = PROVIDER_NAMES[c.provider];
  if (c.phase === "waiting") return { kind: "permission", label: `${p} needs your answer` };
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

// The sidebar row a conversation's slot sits on: its canvas row while listed, else its project row.
export function slotKeyOf(root: string, c: ConversationSummary, rows: readonly Canvas[]): string {
  const row = c.canvas ? listed(c.canvas, rows) : null;
  return slotKey(root, row?.path);
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
      const key = slotKeyOf(root, c, canvases(root));
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
