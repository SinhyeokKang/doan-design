import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import type { WorkItem } from "../main/workState";
import { PROVIDER_NAMES } from "./agentAuthView";
import { slotKey, type Slot } from "./homeConversations";
import { localClock, scheduledSlot, type Clock } from "./limitReset";

export type ConversationList = ReadonlyMap<string, readonly ConversationSummary[]>;

// A scheduled conversation asks nothing of the person: after working and a terminal agent, before an unseen ending.
const RANK: Record<Slot["kind"], number> = { permission: 4, working: 3, scheduled: 2, unseen: 1 };

// `seen`: marked seen before the list refresh arrived; the reply and the list notice may come in any order. Any
// conversation counts: the sidebar's own callers keep their fromHome filter.
export function conversationWork(c: ConversationSummary, seen: ReadonlySet<string>, scheduled: Slot | null = null): Slot | null {
  if (c.readError) return null;
  const p = PROVIDER_NAMES[c.provider];
  if (c.phase === "waiting") return { kind: "permission", label: `${p} needs your answer` };
  // main's working also covers handoffs still to settle and a queue about to go out, as Delete reads it, so a row never
  // reads finished while its Delete says the agent is working.
  if (c.phase === "running" || c.working) return { kind: "working", label: `${p} is working` };
  if (scheduled) return scheduled;
  // Failed and stopped turns may have changed files too, so every ending waits to be seen.
  return c.unseen && !seen.has(c.conversationId) ? { kind: "unseen", label: "Conversation finished — unread" } : null;
}

export function scheduledOf(c: ConversationSummary, now = Date.now(), clock: Clock = localClock()): Slot | null {
  return c.scheduledAt ? scheduledSlot(c.scheduledAt, now, clock) : null;
}

// By ID first, so a moved canvas keeps its slot.
function listed(canvas: Canvas, rows: readonly Canvas[]): Canvas | null {
  const byId = canvas.id ? rows.filter(row => row.id === canvas.id) : [];
  if (byId.length === 1) return byId[0]!;
  return canvas.id ? null : rows.find(row => !row.id && row.path === canvas.path) ?? null;
}

// Its canvas row while listed, else its project row.
export function slotKeyOf(root: string, c: ConversationSummary, rows: readonly Canvas[]): string {
  const row = c.canvas ? listed(c.canvas, rows) : null;
  return slotKey(root, row?.path);
}

// Every conversation bound to a canvas counts (PRODUCT §5 item 1); of the project conversations only Home ones do. One
// whose canvas is no longer listed shows on its project row.
export function slotsFromList(lists: ConversationList, seen: ReadonlySet<string>, canvases: (root: string) => readonly Canvas[]): Map<string, Slot> {
  const slots = new Map<string, Slot>();
  for (const [root, list] of lists) {
    for (const c of list) {
      if (!c.fromHome && !c.canvas) continue;
      const slot = conversationWork(c, seen, scheduledOf(c));
      if (!slot) continue;
      const key = slotKeyOf(root, c, canvases(root));
      const held = slots.get(key);
      if (!held || RANK[slot.kind] > RANK[held.kind]) slots.set(key, slot);
    }
  }
  return slots;
}

export function terminalSlotLabel(provider: WorkItem["provider"]): string {
  return provider ? `${PROVIDER_NAMES[provider]} is working in a terminal` : "An agent is working in a terminal";
}

// A row is root + path: worktrees share canvas paths. Terminal rows go in newest-changed first, so a project row
// standing for several names the most recently changed canvas.
export function withTerminalSlots(conversations: ReadonlyMap<string, Slot>, work: readonly WorkItem[], entries: readonly FolderEntry[]): Map<string, Slot> {
  const terminal = new Map<string, { slot: Slot; mtimeMs: number }>();
  for (const item of work) {
    const entry = entries.find(entry => entry.path === item.root);
    const row = entry?.kind === "list" ? entry.canvases.find(row => row.path === item.path) : undefined;
    const key = slotKey(item.root, item.path);
    if (!row || terminal.has(key)) continue;
    terminal.set(key, { slot: { kind: "working", label: terminalSlotLabel(item.provider), source: "terminal" }, mtimeMs: row.mtimeMs ?? 0 });
  }
  if (terminal.size === 0) return new Map(conversations);
  const slots = new Map<string, Slot>();
  for (const [key, slot] of conversations) if (RANK[slot.kind] >= RANK.working) slots.set(key, slot);
  for (const [key, { slot }] of [...terminal].sort((a, b) => b[1].mtimeMs - a[1].mtimeMs)) if (!slots.has(key)) slots.set(key, slot);
  for (const [key, slot] of conversations) if (!slots.has(key)) slots.set(key, slot);
  return slots;
}

// A scheduled conversation is not work left here: the strip does not show the usage limit's queue.
export function stripFromList(list: readonly ConversationSummary[], seen: ReadonlySet<string>): ConversationSummary | null {
  let best: { c: ConversationSummary; rank: number } | null = null;
  for (const c of list) {
    if (!c.fromHome) continue;
    const slot = conversationWork(c, seen);
    if (!slot) continue;
    const rank = RANK[slot.kind];
    if (!best || rank > best.rank || (rank === best.rank && c.lastActivityAt > best.c.lastActivityAt)) best = { c, rank };
  }
  return best?.c ?? null;
}
