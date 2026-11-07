import type { Question, QuestionOutcome, StoredAnswer } from "./question";
export type Runtime = "claude" | "codex";
export interface Canvas { path: string; id?: string }
export interface SessionRecord {
  v: 1; at: string; root: string; canvas: Canvas; hash: string;
  runtime: Runtime; sessionId: string; cwd: string; configDir: string;
}
export type UnavailableReason = "cli_missing" | "outside_root" | "session_unavailable" | "session_in_use";
export interface DirectoryFacts {
  // Each non-null value is a caller-verified, existing canonical directory.
  root: string | null; cwd: string | null; configDir: string | null;
}
export interface AvailabilityFacts extends DirectoryFacts {
  cli: boolean; version: string | null;
  selectedConfigDir: string | null;
  occupancy: "free" | "occupied" | "unknown";
  sessionExists: boolean;
}
export interface Anchor {
  frame?: { id: string; title?: string };
  // selector is absent only on a reply chip (agent-reply-chips): it names the element by its doan id alone. A person's
  // anchor always has one, and validAnchor rejects one without.
  element?: { doanId?: string; selector?: string; text?: string; tag?: string };
  point?: { frameId?: string; dx: number; dy: number };
}
// model_unavailable: the provider has no such model for this account, so the turn ended before it did any work.
export type FailureCode = "runtime_unsupported" | "cli_missing" | "not_logged_in" | "session_unavailable" | "session_in_use" | "process_exited" | "rate_limited" | "model_unavailable" | "unknown";
export interface PermissionOption { id: string; label: string; kind: "allow" | "allowAlways" | "deny" }
export interface PermissionRequest {
  type: "permission.request"; requestId: string; tool: string; summary: string; options: PermissionOption[];
}
// An agent's question to the person; it waits in the turn like a permission request.
export interface QuestionRequest { type: "question.request"; requestId: string; questions: Question[] }
// answers: only when answered, per question id; a secret question's answer is never kept.
export interface QuestionResolved { type: "question.resolved"; requestId: string; outcome: QuestionOutcome; answers?: Record<string, StoredAnswer> }
// A file the person attached by local path; doan sends the path, not the bytes.
export interface AttachmentRecord { name: string; size: number; kind: "image" | "file"; path: string }
// The first message of a conversation a handoff started: the earlier conversation and its canvas. Its text is that
// agent's handoff, kept as written and never read for {{n}} markers (anchors stay empty).
export interface HandoffOrigin { kind: "handoff"; conversationId: string; canvas: Canvas }
// reason: a judgement's reason (handoff.ts HandoffReason) or the refused start's code. target sits in its own object
// because the event's envelope already has a conversationId, the history's own.
export type HandoffResolution = { outcome: "started"; target: { conversationId: string; canvas: Canvas } } | { outcome: "refused"; reason: string } | { outcome: "cancelled" };
// A project skill the conversation's provider loads for a folder (conversation "skills" method). Type-only here, since
// the renderer imports it: the parsers live in skills.ts.
export interface SkillSummary { name: string; description: string }
export type FastUnusedReason = "plan" | "extra_usage" | "model" | "policy" | "cooldown";
export type EventPayload =
  | { type: "user.message"; text: string; anchors: Anchor[]; attachments?: AttachmentRecord[]; origin?: HandoffOrigin }
  | { type: "turn.started" }
  | { type: "message.delta"; messageId: string; text: string }
  | { type: "message.done"; messageId: string; text: string }
  | { type: "activity"; kind: "edit" | "read" | "command" | "other"; path?: string; insideDesign?: boolean; summary: string }
  | PermissionRequest
  | { type: "permission.resolved"; requestId: string; optionId: string }
  | QuestionRequest
  | QuestionResolved
  | { type: "fast.unused"; reason?: FastUnusedReason; turnedOff?: true }
  | { type: "context.usage"; used: number; size: number }
  | { type: "turn.done" }
  // model: the model ID the provider's error named, kept so the thread reads the same cause once loaded again; only and
  // always with model_unavailable.
  | { type: "turn.failed"; code: FailureCode; detail?: string; model?: string }
  | { type: "interrupted"; reason: "user" | "appQuit" | "crashed" }
  | { type: "conversation.archived" }
  // A project conversation became this canvas's current conversation; restored undoes an earlier archive.
  | { type: "conversation.bound"; canvas: Canvas }
  | { type: "conversation.restored" }
  // The turn asked for a handoff (in that turn); its resolution comes once the turn ended and was judged, with the
  // requesting turn's id, as conversation.bound does. A request a restart finds unresolved reads as cancelled.
  | { type: "handoff.requested"; canvas: { path: string }; text: string }
  | ({ type: "handoff.resolved" } & HandoffResolution);
export type ConversationEvent = EventPayload & { v: 1; conversationId: string; seq: number; turnId: string; at: string };
// waitingPermission: waiting for the person's answer, to a permission request or a question.
export type TurnState = "idle" | "starting" | "streaming" | "waitingPermission" | "failed" | "interrupted";
export interface ConversationBinding {
  conversationId: string; root: string; canvas?: Canvas;
  origin: "resumed" | "new" | "newDesign"; state: "current" | "archived";
}
// runtime is an app provider here: reservations cover doan-account sessions of every provider.
export interface SessionKey { runtime: import("../agentAuth/types").Provider; configDir: string; sessionId: string }
export interface Reservation { owner: string; key: SessionKey | null }
export interface TransportState {
  terminal: boolean;
  stop: "user" | "appQuit" | null;
  messageId: string;
  textBlock: number | null;
  completedMessages: string[];
  activities: string[];
  fileSummaries: Record<string, string>;
  // Message ids steered into this turn and not yet read by the agent; absent where nothing steers.
  steered?: string[];
  // The turn's last context value, emitted right before its done or failed terminal (finish, finishAcp).
  context?: { used: number; size: number };
  // Claude only: the last top-level call's input tokens and model; its window comes with the result.
  claudeCall?: { used: number; model: string };
  // Claude only: the run asked for Fast (Prepared.fast), and the last result's verdict when it did not get it
  // (claudeFastOutcome), emitted right before a done or failed terminal's context value.
  fastRequested?: true;
  fastUnused?: FastUnused;
  // Claude only: the index of the thinking block now streaming, whose stop ends the thinking stage.
  thinkingBlock?: number;
}
export type FastUnused = Extract<EventPayload, { type: "fast.unused" }>;
// What a live turn is doing now, read from provider frames beside the events. It is never
// stored: it only means something while the turn runs. A tool stage follows the activity rules: a path, a summary of at
// most 512 characters, no shell command text and no Doan connector tool input.
export type TurnStage =
  | { kind: "thinking" }
  | { kind: "tool"; activity: "read" | "edit" | "command" | "other"; path?: string; summary: string }
  | { kind: "general" };
// A stage as main sends it to the renderer. seq: the conversation's last written event seq when it was sent, which
// orders it against events; rev: a per-live-turn counter, which orders stages that share a seq.
export interface StageSignal { conversationId: string; turnId: string; seq: number; rev: number; stage: TurnStage }
// stage: the turn's stage after this frame, sent after its events; absent when the frame tells nothing new.
export interface TransportResult { state: TransportState; events: EventPayload[]; stage?: TurnStage }
export interface PermissionChoice { option: PermissionOption; response: unknown }
export interface PendingPermission { event: PermissionRequest; choices: PermissionChoice[] }
