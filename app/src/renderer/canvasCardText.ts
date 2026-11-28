import type { Provider } from "../main/agentAuth/types";
import type { Canvas } from "../main/conversation/types";
import { CANVAS_DIRS } from "../formats/canvasPath";
import type { CanvasRow } from "../main/view";
import { startErrorView } from "./homeComposer";
import { shortAgo } from "./overviewConversation";
import { rootRelative, type ThreadItem } from "./threadItems";
import { thumbnailView, type ThumbnailState, type ThumbnailView } from "./thumbnails";

// The status never repeats the file the head names. Open opens a started handoff's or a send's conversation, else the canvas.

type CanvasCard = Extract<ThreadItem, { kind: "canvasCard" }>;
export interface CanvasCardView {
  icon: "spinner" | "check" | "forward" | "ban" | "send";
  name: string;
  status: string;
  // "<file>, <status>".
  label: string;
  open: { canvas: Canvas; conversationId?: string; label: string } | null;
}

export const fileName = (path: string) => path.split("/").at(-1) ?? path;
const REASONS: Record<string, (project: string) => string> = {
  not_listed: project => `It isn’t a single canvas in ${project}.`,
  // The same fact as a judged not_listed.
  canvas_not_found: project => `It isn’t a single canvas in ${project}.`,
  not_new: () => "It existed before this turn started.",
  // Only in an earlier build's histories.
  has_conversation: () => "It already has a conversation.",
  same_canvas: () => "It’s this conversation’s own canvas.",
  chain_return: () => "That conversation is earlier in this chain.",
  chain_one: () => "A turn started by a message can send only once.",
  chain_limit: () => "This chain reached 5 steps.",
};
// A send's own refusals; any other code a send was refused with reads as SEND_REFUSED, since the start wording names the
// sender's agent and advice that does not apply to a send.
const SEND_REASONS: Record<string, string> = { not_found: "That conversation was deleted." };
const SEND_REFUSED = "That conversation couldn’t take the message.";
// These reasons already say the canvas is not a single listed one, so a gone canvas adds no tail to them.
const SAYS_GONE = new Set(["not_listed", "canvas_not_found"]);

// conversationTitle: null while unknown (a list still loading, the prototype window). conversationListed: false once the
// conversation is gone; absent, it counts as there.
export function canvasCardText(card: CanvasCard, ctx: { project: string; provider: Provider; listed(canvas: Canvas): boolean;
  conversationTitle?(conversationId: string): string | null; conversationListed?(conversationId: string): boolean }): CanvasCardView {
  const name = fileName(card.canvas.path), handoff = card.handoff, send = handoff?.via === "send";
  const view = (icon: CanvasCardView["icon"], status: string, open: CanvasCardView["open"]): CanvasCardView => ({ icon, name, status, label: `${name}, ${status}`, open });
  const own = { canvas: card.canvas, label: `Open ${name}` };
  // A pending request's path may not be listed yet, so Open waits for it silently. Only a canvas this turn drew spins.
  if (handoff?.outcome === "pending" && send) return view("send", "Sends when this turn ends", ctx.listed(card.canvas) ? own : null);
  if (handoff?.outcome === "pending") return view(card.drawing && card.drawn ? "spinner" : "forward", "Hands off when this turn ends", ctx.listed(card.canvas) ? own : null);
  const gone = (icon: CanvasCardView["icon"], status: string, open: CanvasCardView["open"], canvas = card.canvas) =>
    ctx.listed(canvas) ? view(icon, status, open) : view(icon, `${status} · No longer in ${ctx.project}`, null);
  // The renderer's list can lag main's canvas.drawn: while the turn runs, an unlisted card is not yet listed rather than
  // gone, so it shows no tail and Open waits.
  if (!handoff && card.drawing) return view("spinner", "Drawing", ctx.listed(card.canvas) ? own : null);
  if (!handoff) return gone("check", "Drawn", own);
  const lead = send ? "Didn’t send." : "Didn’t hand off.", ban = send ? "send" : "ban";
  switch (handoff.outcome) {
    case "started": {
      const target = handoff.target;
      return gone("forward", "Handed off", { canvas: target.canvas, conversationId: target.conversationId, label: `Open the new conversation on ${name}` }, target.canvas);
    }
    case "sent": {
      // The live title wins; the one kept at delivery names a deleted conversation and one the window does not list.
      const target = handoff.target, title = ctx.conversationTitle?.(target.conversationId) ?? target.title ?? null;
      const status = `${handoff.queued ? "Queued in" : "Sent to"} ${title === null ? "a conversation" : `“${title}”`}`;
      if (ctx.conversationListed?.(target.conversationId) === false) return view("send", `${status} · Conversation deleted`, null);
      return gone("send", status, { canvas: target.canvas, conversationId: target.conversationId, label: title === null ? `Open the conversation on ${name}` : `Open “${title}” on ${name}` }, target.canvas);
    }
    case "cancelled": return gone(ban, `${lead} The turn didn’t finish.`, own);
    case "missed": return gone("ban", "Didn’t hand off. The agent didn’t ask to.", own);
    case "refused": {
      const reason = handoff.reason;
      // Home's refusal wording, so no second wording exists for a code.
      const status = `${lead} ${Object.hasOwn(REASONS, reason) ? REASONS[reason]!(ctx.project) : send ? SEND_REASONS[reason] ?? SEND_REFUSED : startErrorView(reason, ctx.provider, ctx.project).text}`;
      if (SAYS_GONE.has(reason)) return view(ban, status, null);
      return gone(ban, status, reason === "same_canvas" ? null : own);
    }
  }
}

// A send card's and a received send's conversation title from the root's list: null while the list is not read, and for
// a conversation it does not name or an untitled one.
export function listedTitle(list: readonly { conversationId: string; title: string }[] | "loading" | "error", conversationId: string): string | null {
  if (!Array.isArray(list)) return null;
  return list.find(c => c.conversationId === conversationId)?.title.replace(/\s+/g, " ").trim() || null;
}

// Whether a send card's or a received send's conversation still exists. main lists a conversation it just made, then
// writes the resolution naming it, so an id first asked about while a list read is under way counts as there until that
// read answers (or the follow-up read queued behind it, whose answer the new conversation's listChanged asked for); an
// id a settled list already lacked stays gone through later reads. An unread list counts as there.
export class ListedGrace {
  private until = new Map<string, number>();
  listed(root: string, list: readonly { conversationId: string }[] | "loading" | "error", conversationId: string, reads: { started: number; applied: number; queued?: boolean }): boolean {
    if (!Array.isArray(list) || list.some(c => c.conversationId === conversationId)) return true;
    const key = `${root}\0${conversationId}`;
    if (!this.until.has(key)) this.until.set(key, reads.applied < reads.started ? reads.started + (reads.queued ? 1 : 0) : -1);
    return reads.applied < this.until.get(key)!;
  }
}

// `title` is the local time for the tooltip.
export interface CardTime { lead: "Edited" | "Handed off"; text: string; dateTime: string; title: string }
export interface CanvasCardMeta {
  // "none": no image may show, a cached one included.
  thumb: ThumbnailView | { kind: "none" };
  frames: string | null;
  edited: CardTime | null;
  // Only for a canvas outside .doan/canvases/.
  folder: string | null;
  handedOff: CardTime | null;
}

const two = (n: number) => String(n).padStart(2, "0");
function cardTime(lead: CardTime["lead"], time: number, now: number): CardTime | null {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return null;
  const dateTime = date.toISOString(), short = shortAgo(dateTime, now);
  if (!short) return null;
  // shortAgo's "now", counts ("2m", "1d") and dates ("Nov 20") each read differently after the lead.
  const text = short.text === "now" ? "just now" : /^\d+[mhd]$/.test(short.text) ? `${short.text} ago` : short.text;
  return { lead, text, dateTime, title: `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}` };
}

function frameCount(row: CanvasRow): string | null {
  // An unreadable canvas arrives with an empty list beside its error.
  if (row.error || !row.frames) return null;
  const n = row.frames.length, count = n.toLocaleString("en-US");
  if (row.framesTruncated) return `${count}+ frames`;
  return n === 0 ? "No frames" : `${count} ${n === 1 ? "frame" : "frames"}`;
}

function folderOf(path: string, root: string): string | null {
  const relative = rootRelative(path, root);
  if (relative.startsWith(`${CANVAS_DIRS.canvases}/`)) return null;
  return relative.slice(0, Math.max(0, relative.lastIndexOf("/"))) || null;
}

// row: undefined once the canvas is gone. drawing: the image and frame count wait.
export function canvasCardMeta(row: CanvasRow | undefined, thumbnail: ThumbnailState | undefined, now: number, root: string,
  { drawing = false, handedOffAt }: { drawing?: boolean; handedOffAt?: string } = {}): CanvasCardMeta {
  const handedOff = handedOffAt === undefined ? null : cardTime("Handed off", Date.parse(handedOffAt), now);
  if (!row) return { thumb: { kind: "none" }, frames: null, edited: null, folder: null, handedOff };
  return {
    thumb: drawing ? { kind: "none" } : thumbnailView(row, thumbnail),
    frames: drawing ? null : frameCount(row),
    edited: handedOffAt !== undefined || row.mtimeMs === undefined ? null : cardTime("Edited", row.mtimeMs, now),
    folder: folderOf(row.path, root),
    handedOff,
  };
}

// The extension is never cut; at least one leading character stays. The tail takes about two fifths.
export function middleCut(name: string, keep: number): string {
  if (name.length <= keep) return name;
  const extension = /\.[^.]*$/.exec(name)?.[0] ?? "";
  const tail = Math.max(extension.length, Math.round(keep * 0.4)), head = Math.max(1, keep - tail);
  return `${name.slice(0, head)}…${name.slice(name.length - tail)}`;
}

// An earlier build's "moved to" marker is no part of a turn, so one written after the cards does not hide them.
export function trailingCards(items: readonly ThreadItem[]): { start: number; end: number } {
  let end = items.length;
  while (end > 0 && items[end - 1]!.kind === "marker") end--;
  let start = end;
  while (start > 0 && items[start - 1]!.kind === "canvasCard") start--;
  return start === end ? { start: items.length, end: items.length } : { start, end };
}

// New canvases are the drawn ones and the missed ones; a started handoff counts too when its record predates handoffs to
// existing canvases (no via), whose canvases were always new. A refused, cancelled, pending or sent card says nothing.
export function newCanvasesText(items: readonly ThreadItem[]): string {
  const { start, end } = trailingCards(items);
  let n = 0;
  for (const item of items.slice(start, end)) {
    if (item.kind !== "canvasCard") continue;
    if (item.drawing) return "";
    if (item.drawn || (item.handoff?.outcome === "started" && item.handoff.via === undefined) || item.handoff?.outcome === "missed") n++;
  }
  return n === 0 ? "" : n === 1 ? "1 new canvas" : `${n} new canvases`;
}
