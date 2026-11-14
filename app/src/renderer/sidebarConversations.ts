import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { SidebarSlot } from "./canvasNotice";
import { titleMenuOrder } from "./canvasConversation";
import { deleteAvailability, type DeleteAvailability } from "./conversationDelete";
import { conversationWork, scheduledOf, slotKeyOf } from "./conversationList";
import { slotKey, type Slot } from "./homeConversations";

// The sidebar's list of the viewed canvas's conversations (PRODUCT §5 item 1): which rows, in which order, with which
// signal, and where the list sits. ShellSidebar and App only wire these.

export interface SidebarConversation {
  conversationId: string;
  // The raw title, for Delete's name and alert; `heading` is the row's one line, "Conversation" when empty.
  title: string;
  heading: string;
  provider: Provider;
  slot: Slot | null;
  deletable: DeleteAvailability;
}

// The viewed canvas's conversations, or none while fewer than two (nothing to choose between). Membership is the
// sidebar slot's own (`slotKeyOf`): by canvas ID first, so two rows sharing an ID give an empty list rather than
// another canvas's conversations. `frozen`: the order to hold while the pointer or focus is in the list.
export function viewedCanvasConversations(list: readonly ConversationSummary[] | "loading" | "error", root: string, viewedPath: string | null,
  rows: readonly Canvas[], seen: ReadonlySet<string>, now: number, frozen: readonly string[] | null = null): SidebarConversation[] {
  if (!Array.isArray(list) || viewedPath === null) return [];
  const viewed = rows.find(row => row.path === viewedPath);
  if (!viewed) return [];
  const key = slotKey(root, viewedPath);
  const mine = list.filter(c => c.canvas !== undefined && slotKeyOf(root, c, rows) === key);
  if (mine.length < 2) return [];
  const byId = new Map(mine.map(c => [c.conversationId, c]));
  return titleMenuOrder(mine, viewed, frozen).flatMap(id => {
    const c = byId.get(id);
    return c ? [{ conversationId: id, title: c.title, heading: c.title.replace(/\s+/g, " ").trim() || "Conversation", provider: c.provider,
      slot: conversationWork(c, seen, scheduledOf(c, now)), deletable: deleteAvailability(c) }] : [];
  });
}

// The viewed canvas row's mark. While its list shows, the rows carry the conversation signals, so the row keeps only
// what `bare` (the slots without conversation states) gives it: a terminal spinner or a canvas notice. Otherwise the
// full set's value. The full set itself stays whole for the project row and Show sidebar.
export function canvasRowMark(full: ReadonlyMap<string, SidebarSlot>, bare: ReadonlyMap<string, SidebarSlot>, key: string, listShown: boolean): SidebarSlot | undefined {
  return listShown ? bare.get(key) : full.get(key);
}

export function canvasDisclosure(viewed: boolean, count: number): boolean {
  return viewed && count >= 2;
}

// → and ← on the canvas row, as on a group head: fold and unfold, step into the list or out to the head.
export function canvasArrow(disclosure: boolean, folded: boolean, key: "ArrowLeft" | "ArrowRight"): "unfold" | "fold" | "firstConversation" | "head" | null {
  if (key === "ArrowRight") return !disclosure ? null : folded ? "unfold" : "firstConversation";
  return disclosure && !folded ? "fold" : "head";
}

// A conversation row has nothing to open, so → does nothing.
export function conversationArrow(key: "ArrowLeft" | "ArrowRight"): "canvas" | null {
  return key === "ArrowLeft" ? "canvas" : null;
}

// A tree key under the canvas row's (`root\npath`). Conversation ids carry no newline.
export function conversationRowKey(root: string, path: string, conversationId: string): string {
  return `${slotKey(root, path)}\n${conversationId}`;
}

// Where focus goes after a confirmed Delete: the next conversation row, else the previous one, else the canvas row.
// Computed before the alert takes focus from the sidebar.
export function deleteFocus(rowKeys: readonly string[], lost: string, canvasRow: string): string {
  const index = rowKeys.indexOf(lost);
  return rowKeys[index + 1] ?? rowKeys[index - 1] ?? canvasRow;
}

// The canvas row the list sits under. A press on a canvas row below an unfolded list would move that row up by the
// list's height under the pointer (POSTMORTEM 2026-11-06), so the list stays where it was until the pointer leaves the
// sidebar. `shownAt`: where an unfolded list showed (null when folded or with fewer than two conversations, which moves
// nothing); `pressed`: the canvas row the pointer pressed while it is still in the sidebar. A keyboard move, Back or a
// row above moves nothing under the pointer; `order` is the tree's keys, and a held row that left it gives way.
export function listPlace(shownAt: string | null, next: string | null, order: readonly string[], pressed: string | null): string | null {
  if (shownAt === null || next === null || shownAt === next || pressed !== next) return next;
  const was = order.indexOf(shownAt), now = order.indexOf(next);
  return was >= 0 && now > was ? shownAt : next;
}
