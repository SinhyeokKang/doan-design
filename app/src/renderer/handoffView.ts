import type { ConversationHandoffNotice, HandoffMultiNotice, HandoffNotice } from "../main/conversation/handoff";
import type { Canvas } from "../main/conversation/types";
import { sameCanvas } from "./canvasConversationRows";

// The handoff card's and toast's copy, and whether a started handoff moves the screen. The source thread's canvas cards
// have theirs in canvasCardText.ts.

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
// Several started handoffs never move the screen: the source canvas page already shows a card for each, so nothing is
// shown there; anywhere else one summary toast.
export function handoffMultiStep(screen: HandoffScreen, notice: HandoffMultiNotice): "none" | "toast" {
  const on = screen.canvas;
  return on && on.root === notice.root && sameCanvas(on.canvas, notice.source.canvas) ? "none" : "toast";
}
// listed: the renderer's list names the target. expired: HANDOFF_WAIT_MS passed since the notice.
export function handoffArrival(screen: HandoffScreen, notice: HandoffNotice, listed: boolean, expired: boolean): "move" | "toast" | "wait" {
  if (handoffMove(screen, notice) === "toast") return "toast";
  if (listed) return "move";
  return expired ? "toast" : "wait";
}

export function handoffCardHead(source: Canvas, project: string, listed: boolean): string {
  return listed ? `Handed off from ${fileName(source.path)}` : `Handed off from ${fileName(source.path)} · No longer in ${project}`;
}
export function handoffToastText(notice: ConversationHandoffNotice): string {
  const source = fileName(notice.source.canvas.path);
  return "targets" in notice ? `${source} handed off to ${notice.targets.length} canvases` : `${source} handed off to ${fileName(notice.target.canvas.path)}`;
}
// The toast's Open once the target is no longer listed, after the shipped deep-link refusal.
export function handoffGoneText(path: string, project: string): string {
  return `Couldn’t open ${fileName(path)}. The canvas isn’t in ${project}.`;
}
