import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { Anchor, Canvas, ConversationEvent } from "../main/conversation/types";
import { hasContent, sameSegments, toMessage, typedText, type FieldSegment } from "./anchorField";
import { pickerAction, PROVIDER_NAMES, type SettingsAction } from "./agentAuthView";
import type { ComposerShape, ComposerTurn } from "./composerRules";
import { asksPerson, stripState } from "./conversationStrip";
import {
  agentProblem, composeRequest, draftProblem, presetPlaceholder, startErrorView, type AttachmentDraft, type ModelPickerView, type PresetSummary,
} from "./homeComposer";

// Its host owns the conversation, the lists and every call to main; these functions only decide.

// resume: Send continues the canvas's terminal session, whose provider, model and effort are its own.
export type DockedMode =
  | { kind: "existing"; conversationId: string; provider: Provider }
  | { kind: "new"; root: string; canvas?: Canvas }
  | { kind: "resume"; root: string; canvas: Canvas; provider: Provider };

export interface DockedDraft {
  // Converted to {text, anchors} only when sent.
  segments: readonly FieldSegment[]; preset: PresetSummary | null; attachments: readonly AttachmentDraft[];
  // A box whose text fits one line again stays a box (composerShape), also after a switch back.
  shape: ComposerShape;
}
export const EMPTY_DRAFT: DockedDraft = { segments: [], preset: null, attachments: [], shape: "capsule" };

// The terminal session shares its canvas's new-conversation draft, so switching between the two keeps the text. A
// canvas is keyed by its id when it has one, so a moved canvas keeps its draft.
export function draftKey(mode: DockedMode): string {
  if (mode.kind === "existing") return `conversation:${mode.conversationId}`;
  const canvas = mode.canvas;
  if (!canvas) return `root:${mode.root}`;
  return `canvas:${JSON.stringify([mode.root, canvas.id === undefined ? "path" : "id", canvas.id ?? canvas.path])}`;
}

// alert: a moved or deleted file, shown as an error notice as on Home; the other reasons are a quiet line.
export interface DockedReason { text: string; action?: SettingsAction; alert?: true; noAgent?: true }

export interface DockedInput {
  mode: DockedMode; project: string; auth: AuthSnapshot | null | undefined;
  // null: none ready.
  provider: Provider | null;
  draft: DockedDraft;
  skills: readonly string[];
  turn: ComposerTurn;
  sending: boolean;
  // Send waits with Home's reason, whatever the draft holds.
  unavailable?: string | null;
  // A legacy external terminal's own sign-in, so Doan's accounts do not decide.
  external?: boolean;
}

// The list lags the merged events. An ended turn while the list still says working holds, as steerPhaseOf orders it;
// otherwise the list decides, and a working list reads running here.
export function composerTurn(events: readonly ConversationEvent[] | null, summary: ConversationSummary | undefined, live: boolean): ComposerTurn {
  const kind = events && events.length ? stripState(events).kind : null;
  if (kind !== null && asksPerson(kind)) return "waiting";
  if ((kind === "starting" || kind === "working") && live) return "running";
  if (kind === "done" || kind === "failed" || kind === "interrupted") return summary?.working ? "holding" : "idle";
  if (summary?.phase === "waiting") return "waiting";
  return summary?.working ? "running" : "idle";
}

// The permission wait explains the line without disabling Queue.
export function dockedAvailability(input: DockedInput): { enabled: boolean; reason: DockedReason | null } {
  const { draft, mode } = input;
  const off = (reason: DockedReason | null) => ({ enabled: false, reason });
  if (input.sending) return off(null);
  if (input.unavailable) return off({ text: input.unavailable });
  // A terminal session runs on the terminal's own sign-in, so Doan's accounts do not decide whether it can be sent to.
  const agent = mode.kind === "new" ? agentProblem(input.auth, input.provider) : mode.kind === "resume" || input.external ? null : providerProblem(input.auth, mode.provider);
  if (agent) return off({ text: agent.text, ...("kind" in agent && agent.kind === "noAgent" ? { noAgent: true as const } : {}), ...("action" in agent ? { action: agent.action } : {}) });
  const waiting = input.turn === "waiting" ? { text: "Answer or stop the request above." } : null;
  if (!hasContent(draft.segments) && !draft.preset && draft.attachments.length === 0) return off(waiting);
  const problem = draftProblem(draft.segments, draft.preset, draft.attachments, input.skills);
  return problem ? off({ text: problem.text, ...(problem.kind === "attachmentMissing" ? { alert: true as const } : {}) }) : { enabled: true, reason: waiting };
}

// The provider is fixed, so it offers its own fix in Settings rather than another agent.
function providerProblem(auth: AuthSnapshot | null | undefined, provider: Provider): DockedReason | null {
  if (!auth) return null;
  const status = auth.providers.find(item => item.provider === provider);
  const name = PROVIDER_NAMES[provider];
  if (!status || status.account === null) return { text: `${name} isn’t connected.`, action: { label: "Open Agents settings", target: { section: "agents", provider } } };
  const action = pickerAction(status);
  if (!action) return null;
  if (action.label === "Sign in again") return { text: `${name}’s sign-in expired.`, action };
  const incompatible = !status.readiness.ready && status.readiness.cause === "version_incompatible";
  if (action.label === "Update" || incompatible) return { text: `${name} needs an update.`, action: { ...action, label: "Update" } };
  return { text: `${name} can’t run right now.`, action };
}

export function dockedMessage(draft: DockedDraft, skills: readonly string[] = []): { text: string; anchors: Anchor[] } {
  const message = toMessage(draft.segments) ?? { text: typedText(draft.segments), anchors: [] };
  return { text: composeRequest(message.text, draft.preset, skills, draft.attachments.length), anchors: message.anchors };
}

// A canvas that is gone replaces the composer. blocked keeps the draft in a field that takes no input, with the reason
// line.
export type DockedRefusal = { kind: "gone" } | { kind: "notice"; text: string; retry?: boolean; startNew?: boolean }
  | { kind: "blocked"; text: string; action?: SettingsAction };
export function hasDraft(draft: DockedDraft | undefined): draft is DockedDraft {
  return draft !== undefined && (draft.segments.length > 0 || draft.preset !== null || draft.attachments.length > 0);
}
export const sameDraft = (a: DockedDraft, b: DockedDraft) => sameSegments(a.segments, b.segments) && (a.preset?.id ?? null) === (b.preset?.id ?? null)
  && a.attachments.map(item => item.key).join("\n") === b.attachments.map(item => item.key).join("\n");
// Only while the person has not changed it meanwhile. A start moves what stays to the conversation it started, unless
// that draft already holds something.
export function settleSent(drafts: ReadonlyMap<string, DockedDraft>, at: string, sent: DockedDraft, left: DockedDraft, to?: string): ReadonlyMap<string, DockedDraft> {
  if (!sameDraft(drafts.get(at) ?? EMPTY_DRAFT, sent)) return drafts;
  if (to !== undefined && to !== at && hasDraft(left) && !hasDraft(drafts.get(to))) return new Map(drafts).set(to, left).set(at, EMPTY_DRAFT);
  return new Map(drafts).set(at, left);
}
// The two share that field; a draft already waiting there stays.
export function carryDraft(drafts: ReadonlyMap<string, DockedDraft>, from: string, to: string): ReadonlyMap<string, DockedDraft> {
  const draft = drafts.get(from), waiting = drafts.get(to);
  if (!draft || (waiting && (waiting.segments.length || waiting.preset || waiting.attachments.length))) return drafts;
  return new Map(drafts).set(to, draft).set(from, EMPTY_DRAFT);
}
// Only a start names the reset.
export function dockedRefusal(code: string, mode: DockedMode, provider: Provider, project: string, resets: string | null = null): DockedRefusal {
  if (code === "canvas_not_found") return { kind: "gone" };
  if (mode.kind === "new") {
    const view = startErrorView(code, provider, project, resets);
    return { kind: "notice", text: view.text, ...(view.retry ? { retry: true } : {}) };
  }
  if (mode.kind === "resume") return { kind: "notice", text: resumeRefusalText(code, provider) };
  const p = PROVIDER_NAMES[provider];
  // Retry never runs a conversation another sign-in owns, so the notice offers a new conversation instead.
  if (Object.hasOwn(OTHER_SIGN_IN, code)) return { kind: "notice", text: OTHER_SIGN_IN[code]!(p), startNew: true };
  // Cursor keeps no session for a first turn its plan limit stopped, so sending again after the reset would not help
  // (ARCHITECTURE §7 'Agent usage'). Composer notices carry no action, so the line says where to go.
  if (code === "rate_limited" && provider === "cursor") return { kind: "notice", text: "Cursor reached a usage limit, so this conversation can’t continue. Start a new conversation after the limit resets." };
  const text = SEND_ERRORS[code]?.(p) ?? "Couldn’t send your message. Try again.";
  return { kind: "notice", text };
}
const OTHER_SIGN_IN: Record<string, (p: string) => string> = {
  account_changed: p => `This conversation’s session belongs to another ${p} account, so it can’t continue here. To continue it, sign out, then sign in to that account in Settings > Agents.`,
  // Only the organization differs; signing in to that organization brings the conversation back.
  workspace_changed: p => `This conversation’s session belongs to another organization of your ${p} account, so it can’t continue here. To continue it, sign in to the organization this conversation started in.`,
  // It may be the same account, so never "another account".
  sign_in_changed: p => `This conversation’s session belongs to an earlier ${p} sign-in, so it can’t continue here.`,
};
const SEND_ERRORS: Record<string, (p: string) => string> = {
  busy: p => `${p} is finishing a previous run. Try again in a moment.`,
  // The code alone does not tell an expired sign-in from none.
  not_logged_in: p => `Sign in to ${p} in Settings > Agents, then send again.`,
  rate_limited: p => `${p} reached a usage limit. Send again after it resets.`,
  // The holder may be a terminal or a Doan conversation's background work; the window cannot tell which.
  session_in_use: p => `${p} is still using this session. Try again when it finishes.`,
};

// Never "Choose another agent": the provider is the terminal's, and the notice's own button starts a new conversation.
export function resumeRefusalText(code: string, provider: Provider): string {
  const reason = Object.hasOwn(RESUME_REASONS, code) ? RESUME_REASONS[code]!(PROVIDER_NAMES[provider]) : null;
  return reason ? `Couldn’t continue the terminal session: ${reason}.` : "Couldn’t continue the terminal session.";
}
const RESUME_REASONS: Record<string, (p: string) => string> = {
  no_session: () => "it’s no longer available",
  session_unavailable: () => "it isn’t available right now",
  session_in_use: p => `${p} is still using it`,
  // The code alone does not tell an expired sign-in from none.
  not_logged_in: p => `sign in to ${p} in Settings > Agents, then send again`,
  cli_missing: p => `${p} isn’t installed on this Mac`,
  runtime_unsupported: p => `Doan doesn’t support this version of ${p}`,
  process_exited: p => `${p} stopped before it could continue`,
  rate_limited: p => `${p} reached a usage limit`,
  busy: p => `${p} is finishing a previous run`,
};

// One rule for both hosts, so the → key (takesSuggestion) reads the same answer the field draws. `empty`: no text and
// no chip (attachments may be there).
export interface PlaceholderInput {
  readOnly: boolean; preset: PresetSummary | null; empty: boolean; mode: DockedMode["kind"]; text: string;
  suggestion: string | null | undefined;
}
export function composerPlaceholder(input: PlaceholderInput): { text: string; suggestion: string | null } {
  if (input.preset && input.empty) return { text: presetPlaceholder(input.preset), suggestion: null };
  if (input.readOnly || !input.empty || input.mode !== "existing" || !input.suggestion) return { text: input.text, suggestion: null };
  return { text: input.suggestion, suggestion: input.suggestion };
}

export function canvasGoneText(project: string): string {
  return `This conversation’s canvas is no longer in ${project}, so it can’t continue.`;
}

// The picker lists only that provider's models and names the model with the provider in brackets.
export function dockedPicker(view: ModelPickerView, mode: DockedMode): ModelPickerView {
  if (mode.kind === "new") return view;
  const name = PROVIDER_NAMES[mode.provider];
  const mine = view.trigger.provider === mode.provider && !view.trigger.placeholder;
  const trigger = mine
    ? { ...view.trigger, provider: mode.provider, ariaLabel: `Model: ${view.trigger.label}${view.trigger.isDefault ? ", default" : ""} (${name})` }
    : { provider: mode.provider, label: "Model", ariaLabel: `Model: not chosen (${name})`, placeholder: true, isDefault: false };
  return {
    ...view,
    trigger,
    groups: view.groups.filter(group => group.provider === mode.provider),
  };
}
