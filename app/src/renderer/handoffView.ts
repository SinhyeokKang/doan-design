import type { ConversationHandoffNotice, HandoffMultiNotice, HandoffNotice } from "../main/conversation/handoff";
import type { Canvas } from "../main/conversation/types";
import { sameCanvas } from "./canvasConversationRows";

// The source thread's canvas cards have their copy in canvasCardText.ts.

// main's BIND_GRACE_MS (main/conversation/project.ts; handoffView.test.ts compares them): how long a move waits for the
// renderer's list to name the target before it turns into the toast.
export const HANDOFF_WAIT_MS = 10_000;

// Extension kept (PRODUCT §5 item 2 'Handoff'); the thread's "Moved to" marker uses the file stem instead.
const fileName = (path: string) => path.split("/").at(-1) ?? path;

// overview: null elsewhere and while a problem or reading overlay covers it. chose: the person moved or chose something
// in the panel or the Overview since the handoff was announced.
export interface HandoffScreen {
  canvas: { root: string; canvas: Canvas } | null;
  overview: { root: string; conversationId: string | null } | null;
  locked: boolean; dialog: boolean; firstRun: boolean; typing: boolean; chose: boolean;
}

// A project conversation's source has no canvas, so its source page is the root's Overview.
function onSourcePage(screen: HandoffScreen, notice: ConversationHandoffNotice): boolean {
  const source = notice.source;
  if (source.canvas) return !!screen.canvas && screen.canvas.root === notice.root && sameCanvas(screen.canvas.canvas, source.canvas);
  return !!screen.overview && screen.overview.root === notice.root && screen.overview.conversationId === source.conversationId;
}
// A person typing on the source page keeps their place too (PRODUCT §5 item 2 'Handoff').
export function handoffMove(screen: HandoffScreen, notice: HandoffNotice): "move" | "toast" {
  if (!onSourcePage(screen, notice)) return "toast";
  return screen.locked || screen.dialog || screen.firstRun || screen.typing || screen.chose ? "toast" : "move";
}
// The source page already shows a card for each, so nothing is shown there; anywhere else one summary toast.
export function handoffMultiStep(screen: HandoffScreen, notice: HandoffMultiNotice): "none" | "toast" {
  return onSourcePage(screen, notice) ? "none" : "toast";
}
export function handoffArrival(screen: HandoffScreen, notice: HandoffNotice, listed: boolean, expired: boolean): "move" | "toast" | "wait" {
  if (handoffMove(screen, notice) === "toast") return "toast";
  if (listed) return "move";
  return expired ? "toast" : "wait";
}

const CARD_STATUS = "Handed off to this conversation";
export interface HandoffCardView {
  kind: "canvas" | "overview";
  name: string;
  // Both cards look alike, so the status says the direction: the bold name is the source.
  status: string;
  // "<name>, <status>".
  label: string;
  open: boolean;
  openLabel: string;
}
// The card sits on the target canvas, whose header already names the project, so the Overview goes unnamed.
export function handoffCardView(source: { canvas?: Canvas }, project: string, listed: boolean): HandoffCardView {
  const name = source.canvas ? fileName(source.canvas.path) : "Overview";
  const status = listed ? CARD_STATUS : `${CARD_STATUS} · ${source.canvas ? `No longer in ${project}` : "Conversation deleted"}`;
  return { kind: source.canvas ? "canvas" : "overview", name, status, label: `${name}, ${status}`, open: listed,
    openLabel: source.canvas ? `Open ${name}` : "Open the source conversation in the Overview" };
}
// The toast shows on any screen, so an Overview source names its project.
export function handoffToastText(notice: ConversationHandoffNotice, project: string): string {
  const source = notice.source.canvas ? fileName(notice.source.canvas.path) : `${project} Overview`;
  return "targets" in notice ? `${source} handed off to ${notice.targets.length} canvases` : `${source} handed off to ${fileName(notice.target.canvas.path)}`;
}
// After the shipped deep-link refusal.
export function handoffGoneText(path: string, project: string): string {
  return `Couldn’t open ${fileName(path)}. The canvas isn’t in ${project}.`;
}
