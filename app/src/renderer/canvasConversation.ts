import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas, Runtime } from "../main/conversation/types";
import type { WorkItem } from "../main/workState";
import { PROVIDER_NAMES, type SettingsAction } from "./agentAuthView";
import { sameCanvas } from "./canvasConversationRows";
import { conversationWork } from "./conversationList";
import { dockedRefusal, type DockedMode } from "./dockedRules";
import type { Slot } from "./homeConversations";
import { MAX_ATTACHMENTS, startErrorView } from "./homeComposer";
import { byActivity, menuItem, type MenuItem } from "./overviewConversation";

// The canvas host owns the reads and every call to main; these functions only decide.

const onCanvas = (c: ConversationSummary, canvas: Canvas) => c.canvas !== undefined && sameCanvas(c.canvas, canvas);

// main lists conversations in start order, which breaks ties. One without waitingSince comes after those with it.
export function earliestWaiting(mine: readonly ConversationSummary[]): ConversationSummary | undefined {
  let first: ConversationSummary | undefined;
  for (const c of mine) {
    if (c.phase !== "waiting") continue;
    if (first === undefined || (c.waitingSince !== undefined && (first.waitingSince === undefined || c.waitingSince < first.waitingSince))) first = c;
  }
  return first;
}

export interface ShownInput {
  list: readonly ConversationSummary[] | "loading" | "error";
  canvas: Canvas;
  requested: string | null;
  // undefined before the first pick and after the shown conversation is deleted.
  shown: string | null | undefined;
  // undefined until ui-state has been read.
  remembered: string | null | undefined;
  blocked?: "gone" | "duplicate" | null;
}
export type ShownPick =
  | { kind: "wait" }
  // A start's reply can overtake its list notice.
  | { kind: "reread"; conversationId: string }
  | { kind: "conversation"; conversationId: string }
  // The composer can still start a conversation.
  | { kind: "new"; listError: boolean }
  | { kind: "blocked"; reason: "gone" | "duplicate" };

// Whatever shows stays across list reads: re-picking on every read would let each newly waiting conversation pull the
// panel away.
export function pickShownConversation(input: ShownInput): ShownPick {
  const { list, canvas, shown } = input;
  if (input.blocked) return { kind: "blocked", reason: input.blocked };
  if (list === "loading" || list === "error") {
    if (typeof shown === "string") return { kind: "conversation", conversationId: shown };
    if (shown === null) return { kind: "new", listError: list === "error" };
    return list === "loading" ? { kind: "wait" } : { kind: "new", listError: true };
  }
  const mine = list.filter(c => onCanvas(c, canvas));
  const show = (c: ConversationSummary): ShownPick => ({ kind: "conversation", conversationId: c.conversationId });
  if (input.requested !== null) {
    const asked = list.find(c => c.conversationId === input.requested);
    if (!asked) return { kind: "reread", conversationId: input.requested };
    // The panel shows only this canvas's conversations; a request for another falls back to the default.
    if (onCanvas(asked, canvas)) return show(asked);
  }
  if (shown === null) return { kind: "new", listError: false };
  const still = typeof shown === "string" ? mine.find(c => c.conversationId === shown) : undefined;
  if (still) return show(still);
  if (input.remembered === undefined) return { kind: "wait" };
  const pick = earliestWaiting(mine) ?? mine.find(c => c.conversationId === input.remembered) ?? [...mine].sort(byActivity)[0];
  return pick ? show(pick) : { kind: "new", listError: false };
}

// By the slot's own rule (conversationList's slotsFromList). Otherwise null, and the panel picks by
// pickShownConversation.
export function sidebarRowRequest(list: readonly ConversationSummary[], canvas: Canvas, slot: Slot["kind"] | null, seen: ReadonlySet<string>): string | null {
  if (slot !== "permission" && slot !== "unseen") return null;
  return list.find(c => onCanvas(c, canvas) && conversationWork(c, seen)?.kind === slot)?.conversationId ?? null;
}

// While the menu is open rows keep their places and a new conversation goes at the end, so a row never moves under
// the pointer.
export function titleMenuOrder(list: readonly ConversationSummary[], canvas: Canvas, frozen: readonly string[] | null): string[] {
  const ids = list.filter(c => onCanvas(c, canvas)).sort(byActivity).map(c => c.conversationId);
  if (frozen === null) return ids;
  const listed = new Set(ids), kept = frozen.filter(id => listed.has(id)), known = new Set(kept);
  return [...kept, ...ids.filter(id => !known.has(id))];
}

export interface CanvasMenuItem extends MenuItem { selected: boolean }

export function canvasConversationMenu(list: readonly ConversationSummary[], canvas: Canvas, shown: string | null, now: number, seen: ReadonlySet<string> = new Set(), frozen: readonly string[] | null = null): CanvasMenuItem[] {
  const byId = new Map(list.map(c => [c.conversationId, c]));
  return titleMenuOrder(list, canvas, frozen).map(id => ({ ...menuItem(byId.get(id)!, now, seen), selected: id === shown }));
}

// `end` is the shown thread's last turn seq (null: nothing ended yet), `seen` the last one marked.
export function shouldMarkSeen(panelOpen: boolean, focused: boolean, shown: string | null, summary: ConversationSummary | undefined, seq: { end: number | null; seen: number }): boolean {
  if (!panelOpen || !focused || !summary || summary.conversationId !== shown) return false;
  return seq.end !== null && seq.end > seq.seen;
}

// A session_in_use refusal names its session too: a terminal process holds it, so it cannot run now.
export type ResumeTarget = { available: true; runtime: Runtime; session?: string } | { available: false; reason: string; runtime?: Runtime; session?: string } | { error: string };

// In any project. An anonymous session cannot be matched with the link, so it holds nothing.
export function resumeHeld(target: ResumeTarget | undefined, work: readonly WorkItem[]): boolean {
  if (!target || !("available" in target) || !target.session || !target.runtime || (!target.available && target.reason !== "session_in_use")) return false;
  return work.some(item => item.session === target.session && item.provider === target.runtime);
}
export interface NewConversationView {
  mode: "resume" | "new";
  offer: Runtime | null;
  // Send waits rather than sending in a mode a late choice would change.
  pending: boolean;
  // Said only when Doan could not check whether the session is still in use.
  reason?: string;
}

// Another conversation working on the canvas never holds a new one: they run side by side.
export function newConversationMode(resumeTarget: ResumeTarget | undefined, prefs: { choice?: "resume" | "new" }): NewConversationView {
  if (resumeTarget === undefined) return { mode: "new", offer: null, pending: true };
  if ("available" in resumeTarget && resumeTarget.available) return { mode: prefs.choice ?? "resume", offer: resumeTarget.runtime, pending: false };
  if ("available" in resumeTarget && resumeTarget.reason === "session_unverified" && resumeTarget.runtime) return { mode: "new", offer: null, pending: false, reason: unverifiedResumeText(resumeTarget.runtime) };
  return { mode: "new", offer: null, pending: false };
}

export function unverifiedResumeText(runtime: Runtime): string {
  return `Can’t continue the ${PROVIDER_NAMES[runtime]} session from your terminal: Doan couldn’t check whether it’s still in use. Sending starts a new conversation.`;
}
export function canvasUnlistedText(project: string): string { return `This canvas isn’t listed in ${project}, so its conversation can’t continue.`; }
export const ATTACHMENT_LIMIT_TEXT = `Only ${MAX_ATTACHMENTS} attachments can be added to a message. Remove some, then send again.`;
export const DUPLICATE_CANVAS_TEXT = "Another canvas has the same ID, so this conversation can’t continue. Run doan check in a terminal to find it.";

// resend: nothing was working to queue behind, so the host sends the same draft instead.
export type CanvasConversationError =
  | { kind: "attachments"; missing: readonly string[] }
  | { kind: "resend" }
  | { kind: "blocked"; text: string; action?: SettingsAction }
  | { kind: "notice"; text: string; retry: boolean; startNew: boolean };

// canvas_duplicate is the host's own code for a canvas whose id another one shares.
export function canvasConversationError(code: string, mode: DockedMode, provider: Provider, project: string, missing: readonly string[] = [], resets: string | null = null): CanvasConversationError {
  if (code === "attachment_missing") return { kind: "attachments", missing };
  // The person removes some files before sending again.
  if (code === "attachment_limit") return { kind: "notice", text: ATTACHMENT_LIMIT_TEXT, retry: false, startNew: false };
  if (code === "not_running") return { kind: "resend" };
  if (code === "canvas_not_found") return { kind: "blocked", text: canvasUnlistedText(project) };
  if (code === "canvas_duplicate") return { kind: "blocked", text: DUPLICATE_CANVAS_TEXT };
  if (code === "project_not_open") return { kind: "blocked", text: startErrorView(code, provider, project).text };
  if (code === "no_agent" && mode.kind === "new") return { kind: "blocked", text: startErrorView(code, provider, project).text, action: { label: "Sign in to an agent", target: { section: "agents" } } };
  const refusal = dockedRefusal(code, mode, provider, project, resets);
  // dockedRefusal's gone is canvas_not_found, answered above.
  const text = refusal.kind === "notice" ? refusal.text : canvasUnlistedText(project);
  if (mode.kind === "resume") return { kind: "notice", text, retry: false, startNew: true };
  return { kind: "notice", text, retry: mode.kind === "new" && startErrorView(code, provider, project).retry, startNew: refusal.kind === "notice" && refusal.startNew === true };
}
