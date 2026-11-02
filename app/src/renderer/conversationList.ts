import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import type { WorkItem } from "../main/workState";
import { PROVIDER_NAMES } from "./agentAuthView";
import { slotKey, type Slot } from "./homeConversations";

export type ConversationList = ReadonlyMap<string, readonly ConversationSummary[]>;

const RANK: Record<Slot["kind"], number> = { permission: 3, working: 2, unseen: 1 };

// What is left for the person in one conversation, or null. `seen` holds conversations the person marked seen whose
// list refresh has not arrived yet (Dismiss, a visit): the reply and the list notice may come in any order
// (POSTMORTEM 2026-10-26). Any conversation, whatever started it: the sidebar's own callers keep their fromHome filter.
export function conversationWork(c: ConversationSummary, seen: ReadonlySet<string>): Slot | null {
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
      const slot = conversationWork(c, seen);
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

// The conversation slots plus terminal sessions' working spinners (terminal-agent-activity design '표시'). A row is
// root + path: worktrees share canvas paths (POSTMORTEM 2026-11-01). Only listed canvas rows show one, so a path not
// listed yet shows once it appears. On its row an app conversation working or waiting wins, and a terminal session
// beats an unseen ending. Terminal rows go in newest-changed first, so a project row standing for several opens the
// most recently changed canvas (`projectSlotEntry`, canvas-viewport-units D10); app slots that win come before them.
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

// The workspace strip for one root: the Home conversation with work left (running, waiting for an answer, or an
// unseen ending), the strongest state first and then the latest activity. null when nothing is left.
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
