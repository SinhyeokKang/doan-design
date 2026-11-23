import type { Provider } from "../main/agentAuth/types";
import type { Canvas } from "../main/conversation/types";
import { startErrorView } from "./homeComposer";
import type { ThreadItem } from "./threadItems";

// A canvas card's copy (draft .doan/canvases/canvas-drawing-cards.html): the head names the file and the status never
// repeats it. Its Open opens the new conversation of a started handoff and the canvas itself otherwise, as Quick Open does.

type CanvasCard = Extract<ThreadItem, { kind: "canvasCard" }>;
export interface CanvasCardView {
  icon: "spinner" | "check" | "forward" | "ban";
  name: string;
  status: string;
  // The card group's accessible name: "<file>, <status>".
  label: string;
  open: { canvas: Canvas; conversationId?: string; label: string } | null;
}

const fileName = (path: string) => path.split("/").at(-1) ?? path;
// A refused start's reason as its own sentence after "Didn’t hand off.".
const REASONS: Record<string, (project: string) => string> = {
  not_listed: project => `It isn’t a single canvas in ${project}.`,
  // A start refused because the canvas was gone or its ID listed twice: the same fact as a judged not_listed.
  canvas_not_found: project => `It isn’t a single canvas in ${project}.`,
  not_new: () => "It existed before this turn started.",
  // Only in an earlier build's histories, which refused a handoff to a new canvas that already had a conversation.
  has_conversation: () => "It already has a conversation.",
  same_canvas: () => "It’s this conversation’s own canvas.",
};
// These reasons already say the canvas is no single canvas of the project, so a gone canvas adds no tail to them.
const SAYS_GONE = new Set(["not_listed", "canvas_not_found"]);

export function canvasCardText(card: CanvasCard, ctx: { project: string; provider: Provider; listed(canvas: Canvas): boolean }): CanvasCardView {
  const name = fileName(card.canvas.path), handoff = card.handoff;
  const view = (icon: CanvasCardView["icon"], status: string, open: CanvasCardView["open"]): CanvasCardView => ({ icon, name, status, label: `${name}, ${status}`, open });
  const own = { canvas: card.canvas, label: `Open ${name}` };
  // A request names a path the agent gave, which may not be listed yet while it is pending: Open waits for it silently.
  // Only a canvas this turn drew spins: a request alone names an existing or shell-made canvas the agent is not drawing.
  if (handoff?.outcome === "pending") return view(card.drawing && card.drawn ? "spinner" : "forward", "Hands off when this turn ends", ctx.listed(card.canvas) ? own : null);
  const gone = (icon: CanvasCardView["icon"], status: string, open: CanvasCardView["open"], canvas = card.canvas) =>
    ctx.listed(canvas) ? view(icon, status, open) : view(icon, `${status} · No longer in ${ctx.project}`, null);
  // Main writes canvas.drawn once main lists the canvas, but the renderer's list can lag a read: while the turn runs, an
  // unlisted card is not yet listed rather than gone, so it shows no tail and Open waits.
  if (!handoff && card.drawing) return view("spinner", "Drawing", ctx.listed(card.canvas) ? own : null);
  if (!handoff) return gone("check", "Drawn", own);
  switch (handoff.outcome) {
    case "started": {
      const target = handoff.target;
      return gone("forward", "Handed off", { canvas: target.canvas, conversationId: target.conversationId, label: `Open the new conversation on ${name}` }, target.canvas);
    }
    case "cancelled": return gone("ban", "Didn’t hand off. The turn didn’t finish.", own);
    case "missed": return gone("ban", "Didn’t hand off. The agent didn’t ask to.", own);
    case "refused": {
      const reason = handoff.reason;
      // Any other refused start reads as Home's refusal for that code, so no second wording exists for it.
      const status = `Didn’t hand off. ${Object.hasOwn(REASONS, reason) ? REASONS[reason]!(ctx.project) : startErrorView(reason, ctx.provider, ctx.project).text}`;
      if (SAYS_GONE.has(reason)) return view("ban", status, null);
      return gone("ban", status, reason === "same_canvas" ? null : own);
    }
  }
}

// A name cut in the middle to `keep` characters around an ellipsis: its start, and its end with the extension, which is
// never cut; at least one leading character stays. The tail takes about two fifths, as the draft cuts a long name.
export function middleCut(name: string, keep: number): string {
  if (name.length <= keep) return name;
  const extension = /\.[^.]*$/.exec(name)?.[0] ?? "";
  const tail = Math.max(extension.length, Math.round(keep * 0.4)), head = Math.max(1, keep - tail);
  return `${name.slice(0, head)}…${name.slice(name.length - tail)}`;
}

// Where the thread's trailing cards start and end. An earlier build's "moved to" marker is no part of a turn, so
// one written after the cards does not hide them; without cards the run is empty at the thread's end.
export function trailingCards(items: readonly ThreadItem[]): { start: number; end: number } {
  let end = items.length;
  while (end > 0 && items[end - 1]!.kind === "marker") end--;
  let start = end;
  while (start > 0 && items[start - 1]!.kind === "canvasCard") start--;
  return start === end ? { start: items.length, end: items.length } : { start, end };
}

// What the thread's status line adds once the last turn ended: its trailing cards that are new canvases. A card for a
// started or missed handoff was a new canvas too (main hands off and misses only new ones); a refused, cancelled or
// pending one says nothing either way. Nothing while a card still draws: its turn has not ended.
export function newCanvasesText(items: readonly ThreadItem[]): string {
  const { start, end } = trailingCards(items);
  let n = 0;
  for (const item of items.slice(start, end)) {
    if (item.kind !== "canvasCard") continue;
    if (item.drawing) return "";
    if (item.drawn || item.handoff?.outcome === "started" || item.handoff?.outcome === "missed") n++;
  }
  return n === 0 ? "" : n === 1 ? "1 new canvas" : `${n} new canvases`;
}
