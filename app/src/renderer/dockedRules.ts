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

// Rules of the docked composer: the composer under a conversation in Overview and in
// the canvas panel. Its host owns the conversation, the lists and every call to main; these functions only decide.

// existing: the conversation's provider is fixed, so only its model and effort are chosen. new: the person picks the provider, and Send starts a conversation in `root`, on `canvas` from a
// canvas panel. resume: Send continues the canvas's terminal session, whose provider, model and effort are its own.
export type DockedMode =
  | { kind: "existing"; conversationId: string; provider: Provider }
  | { kind: "new"; root: string; canvas?: Canvas }
  | { kind: "resume"; root: string; canvas: Canvas; provider: Provider };

export interface DockedDraft {
  // The field's text and chips; converted to {text, anchors} only when sent.
  segments: readonly FieldSegment[]; preset: PresetSummary | null; attachments: readonly AttachmentDraft[];
  // Kept with the draft: a box whose text fits one line again stays a box (composerShape), also after a switch back.
  shape: ComposerShape;
}
export const EMPTY_DRAFT: DockedDraft = { segments: [], preset: null, attachments: [], shape: "capsule" };

// Drafts are kept per conversation; a new conversation's draft per root, or per canvas of a root in a canvas panel.
// The terminal session shares its canvas's new-conversation draft, so switching between the two keeps the text.
// A canvas is keyed by its id when it has one, so a moved canvas keeps its draft.
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
  // The provider the send would use: the conversation's, or the new conversation's pick (null: none ready).
  provider: Provider | null;
  draft: DockedDraft;
  skills: readonly string[];
  // This conversation's turn, as the host reads it (composerTurn).
  turn: ComposerTurn;
  sending: boolean;
  // The host's project turned into a problem while it was open: Send waits with
  // Home's reason, whatever the draft holds.
  unavailable?: string | null;
  // The conversation runs on a terminal's own sign-in (a legacy external one), so Doan's accounts do not decide.
  external?: boolean;
}

// Main's turn as the composer reads it, the same in both hosts: the merged events first (the list lags them), then the
// list. An ended turn while the list still says working holds, whatever the list's phase, as steerPhaseOf orders that
// case. Only the terminal case follows steerPhaseOf: otherwise the list decides, and a working list reads running here.
export function composerTurn(events: readonly ConversationEvent[] | null, summary: ConversationSummary | undefined, live: boolean): ComposerTurn {
  const kind = events && events.length ? stripState(events).kind : null;
  if (kind !== null && asksPerson(kind)) return "waiting";
  if ((kind === "starting" || kind === "working") && live) return "running";
  if (kind === "done" || kind === "failed" || kind === "interrupted") return summary?.working ? "holding" : "idle";
  if (summary?.phase === "waiting") return "waiting";
  return summary?.working ? "running" : "idle";
}

// Send's state and the reason line under the card. Home's reasons (agent, length, {{ }}, checking, a moved file) are
// shared; the docked ones are a fixed provider that cannot run and the permission wait, which explains the line
// without disabling Queue.
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

// The conversation's provider is fixed, so a provider that cannot run offers its own fix in Settings rather than
// another agent (Home's "Choose another agent").
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

// What main receives: the preset line and the person's text as Home composes it, each chip a {{n}} marker.
export function dockedMessage(draft: DockedDraft, skills: readonly string[] = []): { text: string; anchors: Anchor[] } {
  const message = toMessage(draft.segments) ?? { text: typedText(draft.segments), anchors: [] };
  return { text: composeRequest(message.text, draft.preset, skills, draft.attachments.length), anchors: message.anchors };
}

// A send or start main refused. A canvas that is gone replaces the composer; the rest is a notice under the card. A
// conversation another sign-in owns offers "Start a new conversation".
// A canvas panel's refusals add two: blocked keeps the draft in a field that takes no input, with
// the reason line; a notice may offer Retry or, for a terminal session, "Start a new conversation".
export type DockedRefusal = { kind: "gone" } | { kind: "notice"; text: string; retry?: boolean; startNew?: boolean }
  | { kind: "blocked"; text: string; action?: SettingsAction };
// A draft with anything in it: text, a preset or an attachment.
export function hasDraft(draft: DockedDraft | undefined): draft is DockedDraft {
  return draft !== undefined && (draft.segments.length > 0 || draft.preset !== null || draft.attachments.length > 0);
}
export const sameDraft = (a: DockedDraft, b: DockedDraft) => sameSegments(a.segments, b.segments) && (a.preset?.id ?? null) === (b.preset?.id ?? null)
  && a.attachments.map(item => item.key).join("\n") === b.attachments.map(item => item.key).join("\n");
// An accepted send settles the draft it left from, only while the person has not changed it meanwhile: `left` is what
// stays (empty, or a command's preset and attachments). A start moved the composer to the conversation it started
// (`to`): what stays goes there, unless that draft already holds something, which stays as the person left it.
export function settleSent(drafts: ReadonlyMap<string, DockedDraft>, at: string, sent: DockedDraft, left: DockedDraft, to?: string): ReadonlyMap<string, DockedDraft> {
  if (!sameDraft(drafts.get(at) ?? EMPTY_DRAFT, sent)) return drafts;
  if (to !== undefined && to !== at && hasDraft(left) && !hasDraft(drafts.get(to))) return new Map(drafts).set(to, left).set(at, EMPTY_DRAFT);
  return new Map(drafts).set(at, left);
}
// "Start a new conversation" from a refused conversation carries the refused draft into the new conversation's field,
// as a refused terminal session's does (the two share that field); a draft already waiting there stays.
export function carryDraft(drafts: ReadonlyMap<string, DockedDraft>, from: string, to: string): ReadonlyMap<string, DockedDraft> {
  const draft = drafts.get(from), waiting = drafts.get(to);
  if (!draft || (waiting && (waiting.segments.length || waiting.preset || waiting.attachments.length))) return drafts;
  return new Map(drafts).set(to, draft).set(from, EMPTY_DRAFT);
}
// resets: a usage-limit refusal's reset time as limitReset.ts words it; only a start names it.
export function dockedRefusal(code: string, mode: DockedMode, provider: Provider, project: string, resets: string | null = null): DockedRefusal {
  if (code === "canvas_not_found") return { kind: "gone" };
  if (mode.kind === "new") {
    const view = startErrorView(code, provider, project, resets);
    return { kind: "notice", text: view.text, ...(view.retry ? { retry: true } : {}) };
  }
  if (mode.kind === "resume") return { kind: "notice", text: resumeRefusalText(code, provider) };
  const p = PROVIDER_NAMES[provider];
  // Another sign-in owns the conversation: Retry never runs it, so the notice offers a new conversation instead.
  if (Object.hasOwn(OTHER_SIGN_IN, code)) return { kind: "notice", text: OTHER_SIGN_IN[code]!(p), startNew: true };
  // Main refuses a Cursor send as rate_limited only when the session is missing and usage reads 100% (ARCHITECTURE §7
  // 'Agent usage'): Cursor keeps no session for a first turn its plan limit stopped, so sending again after the reset
  // would not help either; a new conversation does. Composer notices carry no action, so the line says where to go.
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

// Every refusal of a terminal session reads the same way and never says "Choose another agent": its provider is the
// terminal's, and the notice's own button starts a new conversation instead.
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

// The field's placeholder, and the next-input suggestion it shows. One rule for
// both hosts, so the → key (takesSuggestion) reads the same answer the field draws. `text` is the host's own line;
// `empty`: the field holds no text and no chip (attachments may be there). A suggestion stands in only for an existing
// conversation's empty, editable field without a preset, whose line already asks for the target.
export interface PlaceholderInput {
  readOnly: boolean; preset: PresetSummary | null; empty: boolean; mode: DockedMode["kind"]; text: string;
  suggestion: string | null | undefined;
}
export function composerPlaceholder(input: PlaceholderInput): { text: string; suggestion: string | null } {
  if (input.preset && input.empty) return { text: presetPlaceholder(input.preset), suggestion: null };
  if (input.readOnly || !input.empty || input.mode !== "existing" || !input.suggestion) return { text: input.text, suggestion: null };
  return { text: input.suggestion, suggestion: input.suggestion };
}

// Shown instead of the composer when the conversation's canvas left the project.
export function canvasGoneText(project: string): string {
  return `This conversation’s canvas is no longer in ${project}, so it can’t continue.`;
}

// An existing conversation keeps its provider: the picker lists only that provider's models and names
// the model with the provider in brackets ("Model: Opus 5.5 (Claude Code)").
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
