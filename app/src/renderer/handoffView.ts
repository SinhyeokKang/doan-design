import type { ConversationHandoffNotice, HandoffMessageNotice, HandoffMultiNotice, HandoffNotice } from "../main/conversation/handoff";
import type { Canvas, HandoffVia } from "../main/conversation/types";
import { canvasCardMeta } from "./canvasCardText";
import { sameCanvas } from "./canvasConversationRows";
import { shortAgo } from "./overviewConversation";

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
export function handoffMultiStep(screen: HandoffScreen, notice: HandoffMultiNotice | HandoffMessageNotice): "none" | "toast" {
  return onSourcePage(screen, notice) ? "none" : "toast";
}
export function handoffArrival(screen: HandoffScreen, notice: HandoffNotice, listed: boolean, expired: boolean): "move" | "toast" | "wait" {
  if (handoffMove(screen, notice) === "toast") return "toast";
  if (listed) return "move";
  return expired ? "toast" : "wait";
}

// The received handoff bubble's meta line. time: the handoff's, in the Overview's short words with the long ones (words)
// for the group's description and the local time (title) for its tooltip. A gone source has its reason instead of the
// time and Open (open: Open's name).
export interface HandoffMetaView {
  kind: "canvas" | "overview";
  name: string;
  time: { text: string; words: string; dateTime: string; title: string } | null;
  reason: string | null;
  open: string | null;
  label: string;
}
// The bubble sits on the target canvas, whose header already names the project, so the Overview goes unnamed. listed:
// null (the prototype window before main answers) reads as there. sender: a send's sending conversation, whether it is
// still there and its title (null while unknown), which a send's description and Open name.
export function handoffMetaView(source: { canvas?: Canvas; via?: HandoffVia }, project: string, listed: boolean | null, at: string, now: number,
  sender: { listed: boolean | null; title: string | null } = { listed: null, title: null }): HandoffMetaView {
  const kind = source.canvas ? "canvas" : "overview", name = source.canvas ? fileName(source.canvas.path) : "Overview", send = source.via === "send";
  const reason = listed === false ? source.canvas ? `No longer in ${project}` : "Conversation deleted" : send && sender.listed === false ? "Conversation deleted" : null;
  const short = reason === null ? canvasCardMeta(undefined, undefined, now, "", { handedOffAt: at }).handedOff : null, words = shortAgo(at, now);
  const title = send ? sender.title : null, lead = send ? "Message from" : "Handoff from";
  return { kind, name, time: short && words ? { text: short.text, words: title === null ? words.label : `Sent from “${title}” · ${words.label}`, dateTime: short.dateTime, title: short.title } : null, reason,
    open: reason !== null ? null : title !== null ? source.canvas ? `Open “${title}” on ${name}` : `Open “${title}” in the Overview` : source.canvas ? `Open ${name}` : "Open the source conversation in the Overview",
    label: reason === null ? `${lead} ${name}` : `${lead} ${name} · ${reason}` };
}
// The name's tooltip as it opens: while the time is hidden, the name and that time whether cut or not; else a cut name.
export function handoffNameTip(name: string, title: string | null, { cut, timeHidden }: { cut: boolean; timeHidden: boolean }): string | null {
  if (timeHidden && title !== null) return `${name} · ${title}`;
  return cut ? name : null;
}
// The toast shows on any screen, so an Overview source names its project.
export function handoffToastText(notice: ConversationHandoffNotice, project: string): string {
  const source = notice.source.canvas ? fileName(notice.source.canvas.path) : `${project} Overview`;
  if (!("targets" in notice)) return `${source} handed off to ${fileName(notice.target.canvas.path)}`;
  const sends = "kind" in notice ? notice.targets.filter(target => target.via === "send").length : 0, n = notice.targets.length;
  if (n === 1) return sends ? `${source} sent a message to ${fileName(notice.targets[0]!.canvas.path)}` : `${source} handed off to ${fileName(notice.targets[0]!.canvas.path)}`;
  return sends === 0 ? `${source} handed off to ${n} canvases` : sends === n ? `${source} sent messages to ${n} canvases` : `${source} handed off or sent to ${n} canvases`;
}
// The toast's Open once the target is no longer listed.
export function handoffGoneText(path: string, project: string): string {
  return `Couldn’t open ${fileName(path)}. The canvas isn’t in ${project}.`;
}
