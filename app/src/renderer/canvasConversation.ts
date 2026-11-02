import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Canvas, Runtime } from "../main/conversation/types";
import type { WorkItem } from "../main/workState";
import type { SettingsAction } from "./agentAuthView";
import { sameCanvas } from "./canvasConversationRows";
import { dockedRefusal, type DockedBusy, type DockedMode } from "./dockedRules";
import { MAX_ATTACHMENTS, startErrorView } from "./homeComposer";
import { byActivity, menuItem, type MenuItem } from "./overviewConversation";

// Which conversation the canvas panel shows, its dropdown, seen marks, the new conversation's start mode and its
// refusals (buzz-canvas-conversation design §2, §3). The canvas host owns the reads and every call to main; these
// functions only decide.

export const DRAWING_TEXT = "A project conversation is drawing this canvas. Sending here starts a separate conversation.";
export const PROMOTED_TEXT = "A project conversation is now current on this canvas.";
// Shown above the composer with Open on `open`.
export interface CanvasNotice { kind: "drawing" | "promoted"; text: string; open: string }

export type CanvasPick =
  | { kind: "wait" }
  // The requested conversation is not listed yet (a start's reply can overtake its list notice).
  | { kind: "reread"; conversationId: string }
  | { kind: "conversation"; conversationId: string; archived: boolean; notice: CanvasNotice | null }
  // listError: the list could not be read; the header still reads New conversation and the composer can start one.
  | { kind: "new"; listError: boolean; notice: CanvasNotice | null };

export interface CanvasPickContext {
  // What the panel shows now: a conversation, null for the new conversation state, undefined before the first pick.
  shown?: string | null;
  // The list read before this one: a current conversation that was a project conversation there was just promoted.
  previous?: readonly ConversationSummary[] | null;
  // A promotion the panel announces now. It stays while that conversation is still current here, because main reads
  // the list again right after a bind and the read before it no longer shows the change; the host drops it when the
  // person acts.
  promoted?: string | null;
  // A project conversation drawing this canvas before its promotion is judged, as the host knows it.
  drawing?: string | null;
}

const onCanvas = (c: ConversationSummary, canvas: Canvas) => c.canvas !== undefined && sameCanvas(c.canvas, canvas);

// Design §2 'Conversation panel': the requested conversation, else this canvas's current one, else a new conversation.
// An archived conversation shows only when asked for. Once something shows, a list change keeps it: a promotion while
// the panel is open is announced instead of switching.
export function pickCanvasConversation(list: readonly ConversationSummary[] | "loading" | "error", canvas: Canvas, requested: string | null, context: CanvasPickContext = {}): CanvasPick {
  if (list === "loading") return { kind: "wait" };
  if (list === "error") return { kind: "new", listError: true, notice: null };
  const mine = list.filter(c => onCanvas(c, canvas));
  const show = (c: ConversationSummary, notice: CanvasNotice | null): CanvasPick => ({ kind: "conversation", conversationId: c.conversationId, archived: c.state === "archived", notice });
  if (requested !== null) {
    const asked = list.find(c => c.conversationId === requested);
    if (!asked) return { kind: "reread", conversationId: requested };
    // The panel shows only the open canvas's conversations; a request for another canvas falls back to the default.
    if (onCanvas(asked, canvas)) return show(asked, null);
  }
  const current = mine.find(c => c.state === "current");
  const promoted = current && (current.conversationId === context.promoted || context.previous?.some(c => c.conversationId === current.conversationId && c.canvas === undefined))
    ? { kind: "promoted" as const, text: PROMOTED_TEXT, open: current.conversationId } : null;
  const drawing = context.drawing ? { kind: "drawing" as const, text: DRAWING_TEXT, open: context.drawing } : null;
  if (context.shown === null) return { kind: "new", listError: false, notice: promoted ?? drawing };
  if (context.shown !== undefined) {
    const still = mine.find(c => c.conversationId === context.shown);
    if (still) return show(still, promoted && promoted.open !== still.conversationId ? promoted : null);
  }
  return current ? show(current, null) : { kind: "new", listError: false, notice: drawing };
}

export interface CanvasMenuItem extends MenuItem { archived: boolean; selected: boolean }

// This canvas's conversations: the current one first, then by latest activity (design §2 'Conversation panel').
export function canvasConversationMenu(list: readonly ConversationSummary[], canvas: Canvas, shown: string | null, now: number, seen: ReadonlySet<string> = new Set()): CanvasMenuItem[] {
  const mine = list.filter(c => onCanvas(c, canvas));
  const ordered = [...mine.filter(c => c.state === "current").sort(byActivity), ...mine.filter(c => c.state !== "current").sort(byActivity)];
  return ordered.map(c => ({ ...menuItem(c, now, seen), archived: c.state === "archived", selected: c.conversationId === shown }));
}

// Seen only while the panel is open, the window has focus and the conversation shows; an archived one has no unseen
// ending to mark. `end` is the shown thread's last turn seq (null: nothing ended yet), `seen` the last one marked.
export function shouldMarkSeen(panelOpen: boolean, focused: boolean, shown: string | null, summary: ConversationSummary | undefined, seq: { end: number | null; seen: number }): boolean {
  if (!panelOpen || !focused || !summary || summary.conversationId !== shown || summary.state === "archived") return false;
  return seq.end !== null && seq.end > seq.seen;
}

// `session`: the linked terminal session's id, which the terminal work list names too. A session_in_use refusal names
// its session too: a terminal process holds it, so it cannot run now.
export type ResumeTarget = { available: true; runtime: Runtime; session?: string } | { available: false; reason: string; runtime?: Runtime; session?: string } | { error: string };

// The terminal session choice waits while that session (provider:id) still works in a terminal, in any project
// (terminal-agent-activity design '표시'). An anonymous session cannot be matched with the link, so it holds nothing.
export function resumeHeld(target: ResumeTarget | undefined, work: readonly WorkItem[]): boolean {
  if (!target || !("available" in target) || !target.session || !target.runtime || (!target.available && target.reason !== "session_in_use")) return false;
  return work.some(item => item.session === target.session && item.provider === target.runtime);
}
export interface NewConversationView {
  mode: "resume" | "new";
  // The terminal session the person may continue, when there is one.
  offer: Runtime | null;
  // pending: the resume target has not answered, so Send waits rather than sending in a mode a late choice would change.
  pending: boolean;
  // The canvas's current conversation is still working; starting another would end its turn (design §2).
  busy: DockedBusy | null;
}

// `choice` is the person's pick between the terminal session and a new conversation; a refused terminal session's
// "Start a new conversation" sets it to new.
export function newConversationMode(resumeTarget: ResumeTarget | undefined, prefs: { choice?: "resume" | "new"; current?: ConversationSummary }): NewConversationView {
  const c = prefs.current;
  // The restore busy line reads the same: "The current conversation on this canvas is still running."
  const busy: DockedBusy | null = c && c.state === "current" && (c.working || c.phase !== "ended") ? { kind: "restore", open: c.conversationId } : null;
  if (resumeTarget === undefined) return { mode: "new", offer: null, pending: true, busy };
  if ("available" in resumeTarget && resumeTarget.available) return { mode: prefs.choice ?? "resume", offer: resumeTarget.runtime, pending: false, busy };
  return { mode: "new", offer: null, pending: false, busy };
}

export function canvasUnlistedText(project: string): string { return `This canvas isn’t listed in ${project}, so its conversation can’t continue.`; }
export const ATTACHMENT_LIMIT_TEXT = `Only ${MAX_ATTACHMENTS} files can be attached to a message. Remove some, then send again.`;
export const DUPLICATE_CANVAS_TEXT = "Another canvas has the same ID, so this conversation can’t continue. Run doan check in a terminal to find it.";

// busy: the busy line with Open. blocked: the composer keeps the draft but takes no input, with this reason line.
// notice: under the card; retry offers Retry, startNew the terminal session's "Start a new conversation".
// attachments: those chips read as moved, and the draft's own reason line explains it (the shipped composer rule).
// resend: nothing was working to queue behind, so the host sends the same draft instead (the shipped queue rule).
export type CanvasConversationError =
  | { kind: "busy"; busy: DockedBusy }
  | { kind: "attachments"; missing: readonly string[] }
  | { kind: "resend" }
  | { kind: "blocked"; text: string; action?: SettingsAction }
  | { kind: "notice"; text: string; retry: boolean; startNew: boolean };

// A refused start or send in the canvas panel (design §2 'Errors'). Codes the Overview also meets read the same
// (startErrorView, dockedRefusal); canvas_duplicate is the host's own code for a canvas whose id another one shares.
// `missing` is attachment_missing's list of attachment ids.
export function canvasConversationError(code: string, mode: DockedMode, provider: Provider, project: string, missing: readonly string[] = []): CanvasConversationError {
  if (code === "attachment_missing") return { kind: "attachments", missing };
  // A queue main gave back with more files than a message takes; the person removes some before sending again.
  if (code === "attachment_limit") return { kind: "notice", text: ATTACHMENT_LIMIT_TEXT, retry: false, startNew: false };
  if (code === "not_running") return { kind: "resend" };
  if (code === "canvas_not_found") return { kind: "blocked", text: canvasUnlistedText(project) };
  if (code === "canvas_duplicate") return { kind: "blocked", text: DUPLICATE_CANVAS_TEXT };
  if (code === "project_not_open") return { kind: "blocked", text: startErrorView(code, provider, project).text };
  if (code === "no_agent" && mode.kind === "new") return { kind: "blocked", text: startErrorView(code, provider, project).text, action: { label: "Sign in to an agent…", target: { section: "agents" } } };
  const refusal = dockedRefusal(code, mode, provider, project);
  if (refusal.kind === "busy") return refusal;
  // dockedRefusal's gone is canvas_not_found, answered above.
  const text = refusal.kind === "notice" ? refusal.text : canvasUnlistedText(project);
  if (mode.kind === "resume") return { kind: "notice", text, retry: false, startNew: true };
  return { kind: "notice", text, retry: mode.kind === "new" && startErrorView(code, provider, project).retry, startNew: false };
}
