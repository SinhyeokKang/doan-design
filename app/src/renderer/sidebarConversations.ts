import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas } from "../main/conversation/types";
import type { SidebarSlot } from "./canvasNotice";
import { titleMenuOrder } from "./canvasConversation";
import { deleteAvailability, type DeleteAvailability } from "./conversationDelete";
import { conversationWork, scheduledOf, slotKeyOf } from "./conversationList";
import { slotKey, type Slot } from "./homeConversations";

// ShellSidebar and App only wire these (PRODUCT §5 item 1).

export interface SidebarConversation {
  conversationId: string;
  // For Delete's name and alert; `heading` is the row's one line, "Conversation" when empty.
  title: string;
  heading: string;
  provider: Provider;
  slot: Slot | null;
  deletable: DeleteAvailability;
}

// Empty while fewer than two. Membership is the sidebar slot's own (`slotKeyOf`), so two rows sharing an ID give an
// empty list rather than another canvas's conversations.
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

// While its list shows, the rows carry the conversation signals, so the row keeps only what `bare` gives it. The full
// set itself stays whole for the project row and Show sidebar.
export function canvasRowMark(full: ReadonlyMap<string, SidebarSlot>, bare: ReadonlyMap<string, SidebarSlot>, key: string, listShown: boolean): SidebarSlot | undefined {
  return listShown ? bare.get(key) : full.get(key);
}

export function canvasDisclosure(viewed: boolean, count: number): boolean {
  return viewed && count >= 2;
}

export function canvasArrow(disclosure: boolean, folded: boolean, key: "ArrowLeft" | "ArrowRight"): "unfold" | "fold" | "firstConversation" | "head" | null {
  if (key === "ArrowRight") return !disclosure ? null : folded ? "unfold" : "firstConversation";
  return disclosure && !folded ? "fold" : "head";
}

// A conversation row has nothing to open, so → does nothing.
export function conversationArrow(key: "ArrowLeft" | "ArrowRight"): "canvas" | null {
  return key === "ArrowLeft" ? "canvas" : null;
}

// Conversation ids carry no newline.
export function conversationRowKey(root: string, path: string, conversationId: string): string {
  return `${slotKey(root, path)}\n${conversationId}`;
}

// Computed before the alert takes focus from the sidebar.
export function deleteFocus(rowKeys: readonly string[], lost: string, canvasRow: string): string {
  const index = rowKeys.indexOf(lost);
  return rowKeys[index + 1] ?? rowKeys[index - 1] ?? canvasRow;
}

// A press on a canvas row below an unfolded list would move that row under the pointer, so the list stays where it was
// until the pointer leaves the sidebar; a held row that left `order` gives way.
export function listPlace(shownAt: string | null, next: string | null, order: readonly string[], pressed: string | null): string | null {
  if (shownAt === null || next === null || shownAt === next || pressed !== next) return next;
  const was = order.indexOf(shownAt), now = order.indexOf(next);
  return was >= 0 && now > was ? shownAt : next;
}
