import type { Provider } from "../main/agentAuth/types";
import type { HandoffNotice } from "../main/conversation/handoff";
import type { Canvas } from "../main/conversation/types";
import { sameCanvas } from "./canvasConversationRows";
import { startErrorView } from "./homeComposer";
import type { ThreadItem } from "./threadItems";

// The handoff lines' and the card's copy, and whether a started handoff moves the screen.

// main's BIND_GRACE_MS: how long a move waits for the renderer's list to name the target before it turns into the toast.
export const HANDOFF_WAIT_MS = 10_000;

// Canvases are named by file name, as the shipped "Moved to <file>" line does.
const fileName = (path: string) => path.split("/").at(-1) ?? path;

// The screen when a handoff started. canvas: the canvas page on screen, null for Home, the Overview and pages.
// typing: the source conversation's composer has focus with a draft or an IME composition in it. chose: the person moved
// or chose something in the panel since the handoff was announced.
export interface HandoffScreen { canvas: { root: string; canvas: Canvas } | null; locked: boolean; dialog: boolean; firstRun: boolean; typing: boolean; chose: boolean }

// Decision 5: the screen moves only from the source conversation's canvas page with nothing in the way; a person
// typing there keeps their place too.
export function handoffMove(screen: HandoffScreen, notice: HandoffNotice): "move" | "toast" {
  const on = screen.canvas;
  if (!on || on.root !== notice.root || !sameCanvas(on.canvas, notice.source.canvas)) return "toast";
  return screen.locked || screen.dialog || screen.firstRun || screen.typing || screen.chose ? "toast" : "move";
}
// listed: the renderer's list names the target. expired: HANDOFF_WAIT_MS passed since the notice.
export function handoffArrival(screen: HandoffScreen, notice: HandoffNotice, listed: boolean, expired: boolean): "move" | "toast" | "wait" {
  if (handoffMove(screen, notice) === "toast") return "toast";
  if (listed) return "move";
  return expired ? "toast" : "wait";
}

type HandoffItem = Extract<ThreadItem, { kind: "handoff" }>;
export interface HandoffLineView { icon: "forward" | "ban"; text: string; open: { conversationId: string; canvas: Canvas } | null }
const REASONS: Record<string, (project: string) => string> = {
  not_listed: project => `It isn’t a single canvas in ${project}.`,
  // A start refused because the canvas was gone or its ID listed twice: the same fact as a judged not_listed.
  canvas_not_found: project => `It isn’t a single canvas in ${project}.`,
  not_new: () => "It existed before this turn started.",
  has_conversation: () => "It already has a conversation.",
};
export function handoffLineText(item: HandoffItem, ctx: { project: string; provider: Provider; listed(canvas: Canvas): boolean }): HandoffLineView {
  const file = fileName(item.canvas.path);
  switch (item.outcome) {
    case "pending": return { icon: "forward", text: `Hands off to ${file} when this turn ends`, open: null };
    case "started": {
      const target = item.target!, name = fileName(target.canvas.path);
      // A target gone since hides Open rather than disabling it, unlike the promotion line.
      return ctx.listed(target.canvas) ? { icon: "forward", text: `Handed off to ${name}`, open: target } : { icon: "forward", text: `Handed off to ${name} · No longer in ${ctx.project}`, open: null };
    }
    case "cancelled": return { icon: "ban", text: `Didn’t hand off to ${file}. The turn didn’t finish.`, open: null };
    case "refused": {
      const reason = item.reason ?? "";
      if (reason === "same_canvas") return { icon: "ban", text: `Didn’t hand off. ${file} is this conversation’s own canvas.`, open: null };
      // Any other refused start reads as Home's refusal for that code, so no second wording exists for it.
      const why = Object.hasOwn(REASONS, reason) ? REASONS[reason]!(ctx.project) : startErrorView(reason, ctx.provider, ctx.project).text;
      return { icon: "ban", text: `Didn’t hand off to ${file}. ${why}`, open: null };
    }
  }
}
export function handoffCardHead(source: Canvas, project: string, listed: boolean): string {
  return listed ? `Handed off from ${fileName(source.path)}` : `Handed off from ${fileName(source.path)} · No longer in ${project}`;
}
export function handoffToastText(notice: HandoffNotice): string {
  return `${fileName(notice.source.canvas.path)} handed off to ${fileName(notice.target.canvas.path)}`;
}
// The toast's Open once the target is no longer listed, after the shipped deep-link refusal.
export function handoffGoneText(path: string, project: string): string {
  return `Couldn’t open ${fileName(path)}. The canvas isn’t in ${project}.`;
}
