import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { Anchor, Canvas } from "../main/conversation/types";
import { pickerAction, PROVIDER_NAMES, type SettingsAction } from "./agentAuthView";
import type { ComposerShape } from "./composerRules";
import {
  agentProblem, composeRequest, draftProblem, startErrorView, type AttachmentDraft, type ModelPickerView, type PresetSummary,
} from "./homeComposer";
import { anotherConversation } from "./homeConversations";

// Rules of the docked composer (buzz-conversation design §3.1): the composer under a conversation in Overview and in
// the canvas panel. Its host owns the conversation, the lists and every call to main; these functions only decide.

// existing: the conversation's provider is fixed, so only its model and effort are chosen. archived: the same, and a
// send restores it. new: the person picks the provider, and Send starts a conversation in `root`, on `canvas` from a
// canvas panel. resume: Send continues the canvas's terminal session, whose provider, model and effort are its own.
export type DockedMode =
  | { kind: "existing"; conversationId: string; provider: Provider }
  | { kind: "archived"; conversationId: string; provider: Provider }
  | { kind: "new"; root: string; canvas?: Canvas }
  | { kind: "resume"; root: string; canvas: Canvas; provider: Provider };

export interface DockedDraft {
  text: string; anchors: readonly Anchor[]; preset: PresetSummary | null; attachments: readonly AttachmentDraft[];
  // Kept with the draft: a box whose text fits one line again stays a box (composerShape), also after a switch back.
  shape: ComposerShape;
}
export const EMPTY_DRAFT: DockedDraft = { text: "", anchors: [], preset: null, attachments: [], shape: "capsule" };

// Drafts are kept per conversation; a new conversation's draft per root, or per canvas of a root in a canvas panel.
// The terminal session shares its canvas's new-conversation draft, so switching between the two keeps the text.
// A canvas is keyed by its id when it has one, so a moved canvas keeps its draft.
export function draftKey(mode: DockedMode): string {
  if (mode.kind === "existing" || mode.kind === "archived") return `conversation:${mode.conversationId}`;
  const canvas = mode.canvas;
  if (!canvas) return `root:${mode.root}`;
  return `canvas:${JSON.stringify([mode.root, canvas.id === undefined ? "path" : "id", canvas.id ?? canvas.path])}`;
}

// Another project conversation holds the root (project_busy), or the canvas's current conversation still runs while
// this archived one waits to be restored (restore busy). `open` is that conversation when the host knows it.
export type DockedBusy = { kind: "project"; waiting: boolean; open: string | null } | { kind: "restore"; open: string | null };
// alert: a moved or deleted file, shown as an error notice as on Home; the other reasons are a quiet line.
export interface DockedReason { text: string; open?: string; action?: SettingsAction; alert?: true }

export interface DockedInput {
  mode: DockedMode; project: string; auth: AuthSnapshot | null | undefined;
  // The provider the send would use: the conversation's, or the new conversation's pick (null: none ready).
  provider: Provider | null;
  draft: DockedDraft;
  // This conversation's turn, as the host reads it.
  turn: "idle" | "running" | "waiting";
  busy: DockedBusy | null;
  sending: boolean;
  // The host's project turned into a problem while it was open (buzz-project spec decision 12): Send waits with
  // Home's reason, whatever the draft holds.
  unavailable?: string | null;
}

// Send's state and the reason line under the card. Home's reasons (agent, length, {{ }}, checking, a moved file) are
// shared; the docked ones are a fixed provider that cannot run, the project and restore limits, and the permission
// wait, which explains the line without disabling Queue.
export function dockedAvailability(input: DockedInput): { enabled: boolean; reason: DockedReason | null } {
  const { draft, mode } = input;
  const off = (reason: DockedReason | null) => ({ enabled: false, reason });
  if (input.sending) return off(null);
  if (input.unavailable) return off({ text: input.unavailable });
  const agent = mode.kind === "new" ? agentProblem(input.auth, input.provider) : providerProblem(input.auth, mode.provider);
  if (agent) return off({ text: agent.text, ...("action" in agent && agent.action ? { action: agent.action } : {}) });
  const waiting = input.turn === "waiting" ? { text: "Answer or stop the request above." } : null;
  if (!draft.text.trim() && !draft.preset && draft.attachments.length === 0) return off(waiting);
  // A running turn takes the message into its queue, so the limits on starting a turn do not apply yet.
  if (input.busy && input.turn === "idle") return off(busyReason(input.busy, input.project));
  // Typed text only until the chip field passes its segments here (buzz-canvas-conversation R1).
  const problem = draftProblem(draft.text, draft.preset, draft.attachments);
  return problem ? off({ text: problem.text, ...(problem.kind === "attachmentMissing" ? { alert: true as const } : {}) }) : { enabled: true, reason: waiting };
}

function busyReason(busy: DockedBusy, project: string): DockedReason {
  const open = busy.open ? { open: busy.open } : {};
  if (busy.kind === "restore") return { text: "The current conversation on this canvas is still running.", ...open };
  return { text: anotherConversation(project, busy.waiting), ...open };
}

// The conversation's provider is fixed, so a provider that cannot run offers its own fix in Settings rather than
// another agent (Home's "Choose another agent").
function providerProblem(auth: AuthSnapshot | null | undefined, provider: Provider): DockedReason | null {
  if (!auth) return null;
  const status = auth.providers.find(item => item.provider === provider);
  const name = PROVIDER_NAMES[provider];
  if (!status || status.account === null) return { text: `${name} isn’t connected.`, action: { label: "Open Agents settings…", target: { section: "agents", provider } } };
  const action = pickerAction(status);
  if (!action) return null;
  if (action.label === "Sign in again…") return { text: `${name}’s sign-in expired.`, action };
  if (action.label === "Update…") return { text: `${name} needs an update.`, action };
  return { text: `${name} can’t run right now.`, action };
}

// The text main receives: the preset line and the person's text, as Home composes it.
export function dockedComposed(draft: DockedDraft): string {
  return composeRequest(draft.text, draft.preset, draft.attachments.length);
}

// A send or start main refused. The limits become the busy line until the host reports the busy conversation and it
// clears, or the person edits the draft; a canvas that is
// gone replaces the composer; the rest is a notice under the card.
export type DockedRefusal = { kind: "busy"; busy: DockedBusy } | { kind: "gone" } | { kind: "notice"; text: string };
export function dockedRefusal(code: string, mode: DockedMode, provider: Provider, project: string): DockedRefusal {
  if (code === "project_busy") return { kind: "busy", busy: { kind: "project", waiting: false, open: null } };
  if (mode.kind === "archived" && code === "busy") return { kind: "busy", busy: { kind: "restore", open: null } };
  if (code === "canvas_not_found") return { kind: "gone" };
  if (mode.kind === "new") return { kind: "notice", text: startErrorView(code, provider, project).text };
  if (mode.kind === "resume") return { kind: "notice", text: resumeRefusalText(code, provider) };
  const p = PROVIDER_NAMES[provider];
  const text = SEND_ERRORS[code]?.(p) ?? "Couldn’t send your message. Try again.";
  return { kind: "notice", text };
}
const SEND_ERRORS: Record<string, (p: string) => string> = {
  busy: p => `${p} is finishing a previous run. Try again in a moment.`,
  // The code alone does not tell an expired sign-in from none (decision 18).
  not_logged_in: p => `Sign in to ${p} in Settings > Agents, then send again.`,
  rate_limited: p => `${p} is rate limited. Try again later.`,
};

// Every refusal of a terminal session reads the same way and never says "Choose another agent": its provider is the
// terminal's, and the notice's own button starts a new conversation instead (design §2 'Errors').
export function resumeRefusalText(code: string, provider: Provider): string {
  const reason = Object.hasOwn(RESUME_REASONS, code) ? RESUME_REASONS[code]!(PROVIDER_NAMES[provider]) : null;
  return reason ? `Couldn’t continue the terminal session: ${reason}.` : "Couldn’t continue the terminal session.";
}
const RESUME_REASONS: Record<string, (p: string) => string> = {
  no_session: () => "it’s no longer available",
  session_unavailable: () => "it isn’t available right now",
  session_in_use: () => "it’s in use in another terminal",
  // The code alone does not tell an expired sign-in from none (decision 18).
  not_logged_in: p => `sign in to ${p} in Settings > Agents, then send again`,
  cli_missing: p => `${p} isn’t installed on this Mac`,
  runtime_unsupported: p => `Doan doesn’t support this version of ${p}`,
  process_exited: p => `${p} stopped before it could continue`,
  rate_limited: p => `${p} is rate limited`,
  busy: p => `${p} is finishing a previous run`,
};

// Shown instead of the composer when an archived conversation's canvas left the project (design §3.1).
export function canvasGoneText(project: string): string {
  return `This conversation’s canvas is no longer in ${project}, so it can’t continue.`;
}

// An existing or archived conversation keeps its provider: the picker lists only that provider's models and names
// the model with the provider in brackets ("Model: Opus 5.5 (Claude Code)").
export function dockedPicker(view: ModelPickerView, mode: DockedMode): ModelPickerView {
  if (mode.kind === "new") return view;
  const label = view.trigger.provider === mode.provider ? view.trigger.label : "Default";
  return {
    ...view,
    trigger: { provider: mode.provider, label, ariaLabel: `Model: ${label} (${PROVIDER_NAMES[mode.provider]})` },
    groups: view.groups.filter(group => group.provider === mode.provider),
  };
}
