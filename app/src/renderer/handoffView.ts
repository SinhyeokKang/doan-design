import type { ConversationHandoffNotice, HandoffMultiNotice, HandoffNotice } from "../main/conversation/handoff";
import type { Canvas } from "../main/conversation/types";
import { sameCanvas } from "./canvasConversationRows";

// The handoff card's and toast's copy, and whether a started handoff moves the screen. The source thread's canvas cards
// have theirs in canvasCardText.ts.

// main's BIND_GRACE_MS (main/conversation/project.ts; handoffView.test.ts compares them): how long a move waits for the
// renderer's list to name the target before it turns into the toast.
export const HANDOFF_WAIT_MS = 10_000;

// A handoff card names its canvases by file name, extension kept (PRODUCT §5 item 2 'Handoff'); the thread's
// "Moved to" marker uses the file stem instead, as the rest of the app does.
const fileName = (path: string) => path.split("/").at(-1) ?? path;

// The screen when a handoff started. canvas: the canvas page on screen, null for Home, the Overview and pages.
// overview: the Overview on screen with the conversation its main column shows (null: the new conversation state); null
// elsewhere and while a problem or reading overlay covers it. typing: in the source's composer, a draft or an IME
// composition (a canvas source's only while it has focus), or for an Overview source keyboard focus in its Conversations
// list or an open header menu. chose: the person moved or chose something in the panel or the Overview since the
// handoff was announced.
export interface HandoffScreen {
  canvas: { root: string; canvas: Canvas } | null;
  overview: { root: string; conversationId: string | null } | null;
  locked: boolean; dialog: boolean; firstRun: boolean; typing: boolean; chose: boolean;
}

// The source page: the source canvas's page for a canvas conversation, else the root's Overview showing the source
// conversation (a project conversation's source has no canvas).
function onSourcePage(screen: HandoffScreen, notice: ConversationHandoffNotice): boolean {
  const source = notice.source;
  if (source.canvas) return !!screen.canvas && screen.canvas.root === notice.root && sameCanvas(screen.canvas.canvas, source.canvas);
  return !!screen.overview && screen.overview.root === notice.root && screen.overview.conversationId === source.conversationId;
}
// The screen moves only from the source page with nothing in the way; a person typing there keeps their place too
// (PRODUCT §5 item 2 'Handoff').
export function handoffMove(screen: HandoffScreen, notice: HandoffNotice): "move" | "toast" {
  if (!onSourcePage(screen, notice)) return "toast";
  return screen.locked || screen.dialog || screen.firstRun || screen.typing || screen.chose ? "toast" : "move";
}
// Several started handoffs never move the screen: the source page already shows a card for each, so nothing is shown
// there; anywhere else one summary toast.
export function handoffMultiStep(screen: HandoffScreen, notice: HandoffMultiNotice): "none" | "toast" {
  return onSourcePage(screen, notice) ? "none" : "toast";
}
// listed: the renderer's list names the target. expired: HANDOFF_WAIT_MS passed since the notice.
export function handoffArrival(screen: HandoffScreen, notice: HandoffNotice, listed: boolean, expired: boolean): "move" | "toast" | "wait" {
  if (handoffMove(screen, notice) === "toast") return "toast";
  if (listed) return "move";
  return expired ? "toast" : "wait";
}

// listed: the source canvas is still listed, or for an Overview source its conversation still exists. The card sits on
// the target canvas, whose header already names the project, so the Overview goes unnamed.
export function handoffCardHead(source: { canvas?: Canvas }, project: string, listed: boolean): string {
  if (!source.canvas) return listed ? "Handed off from Overview" : "Handed off from Overview · Conversation deleted";
  const name = fileName(source.canvas.path);
  return listed ? `Handed off from ${name}` : `Handed off from ${name} · No longer in ${project}`;
}
// The toast shows on any screen, so an Overview source names its project.
export function handoffToastText(notice: ConversationHandoffNotice, project: string): string {
  const source = notice.source.canvas ? fileName(notice.source.canvas.path) : `${project} Overview`;
  return "targets" in notice ? `${source} handed off to ${notice.targets.length} canvases` : `${source} handed off to ${fileName(notice.target.canvas.path)}`;
}
// The toast's Open once the target is no longer listed, after the shipped deep-link refusal.
export function handoffGoneText(path: string, project: string): string {
  return `Couldn’t open ${fileName(path)}. The canvas isn’t in ${project}.`;
}
