import type { Question, QuestionOutcome, StoredAnswer } from "./question";
export type Runtime = "claude" | "codex";
export interface Canvas { path: string; id?: string }
export interface SessionRecord {
  v: 1; at: string; root: string; canvas: Canvas; hash: string;
  runtime: Runtime; sessionId: string; cwd: string; configDir: string;
}
export type UnavailableReason = "cli_missing" | "outside_root" | "session_unavailable" | "session_in_use" | "session_unverified";
export interface DirectoryFacts {
  // Each non-null value is a caller-verified, existing canonical directory.
  root: string | null; cwd: string | null; configDir: string | null;
}
export interface Anchor {
  frame?: { id: string; title?: string };
  // selector is absent only on a reply chip: it names the element by its doan id alone. A person's
  // anchor always has one, and validAnchor rejects one without.
  element?: { doanId?: string; selector?: string; text?: string; tag?: string };
  point?: { frameId?: string; dx: number; dy: number };
}
// model_unavailable: the provider has no such model for this account, so the turn ended before it did any work.
export type FailureCode = "runtime_unsupported" | "cli_missing" | "not_logged_in" | "session_unavailable" | "session_in_use" | "process_exited" | "rate_limited" | "model_unavailable" | "prompt_unread" | "unknown";
// detail: what a choice saves beyond this request (a rule, a setting), shown before the person picks it.
export interface PermissionOption { id: string; label: string; kind: "allow" | "allowAlways" | "deny"; detail?: string }
// summary: what the approval lets run (the command, the files, the permissions); reason: the agent's own words about it.
export interface PermissionRequest {
  type: "permission.request"; requestId: string; tool: string; summary: string; reason?: string; options: PermissionOption[];
}
// An agent's question to the person; it waits in the turn like a permission request.
export interface QuestionRequest { type: "question.request"; requestId: string; questions: Question[] }
// answers: only when answered, per question id; a secret question's answer is never kept.
export interface QuestionResolved { type: "question.resolved"; requestId: string; outcome: QuestionOutcome; answers?: Record<string, StoredAnswer> }
// A file or folder the person attached by local path; doan sends the path, not the bytes. A folder has no size: main
// never walks it to count one.
export type AttachmentRecord = ({ name: string; size: number; kind: "image" | "file"; path: string } | { name: string; kind: "directory"; path: string }) & { lines?: number; excerpt?: string };
// The first message of a conversation a handoff started: the earlier conversation and its canvas, absent when that was
// a project conversation (the root's Overview). Its text is that agent's handoff, kept as written and never read for
// {{n}} markers (anchors stay empty). An earlier build reads only an origin with a canvas.
export interface HandoffOrigin { kind: "handoff"; conversationId: string; canvas?: Canvas }
// reason: a judgement's reason (handoff.ts HandoffReason) or the refused start's code. target sits in its own object
// because the event's envelope already has a conversationId, the history's own.
export type HandoffResolution = { outcome: "started"; target: { conversationId: string; canvas: Canvas } } | { outcome: "refused"; reason: string } | { outcome: "cancelled" };
// A row of the conversation "skills" method: a project skill the conversation's provider loads for a folder, or one of
// the provider's built-in commands Doan runs (providerCommands.ts). Type-only here, since the renderer imports it: the
// parsers live in skills.ts.
export interface SkillSummary { kind: "skill" | "command"; name: string; description: string }
export interface EditLines { added: number; removed: number }
export type FastUnusedReason = "plan" | "extra_usage" | "model" | "policy" | "cooldown";
export type EventPayload =
  | { type: "user.message"; text: string; anchors: Anchor[]; attachments?: AttachmentRecord[]; origin?: HandoffOrigin }
  | { type: "turn.started" }
  | { type: "message.delta"; messageId: string; text: string }
  | { type: "message.done"; messageId: string; text: string }
  // callId: the provider's id for an edit's call, which its activity.result names; absent on other kinds and on an id the
  // store would refuse.
  | { type: "activity"; kind: "edit" | "read" | "command" | "other"; path?: string; insideDesign?: boolean; summary: string; callId?: string }
  // The lines an applied edit added and removed, keyed by its activity's callId (and path, since one Codex call edits
  // several files). An earlier build fails a whole history that holds one.
  | { type: "activity.result"; callId: string; path?: string; lines: EditLines }
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
  // archived and restored: written only by earlier builds, which archived a canvas's previous conversation and made an
  // archived one current again; still read, never written by this build.
  | { type: "conversation.archived" }
  // An earlier build bound a project conversation to this canvas (promotion); still read, never written by this build.
  | { type: "conversation.bound"; canvas: Canvas }
  | { type: "conversation.restored" }
  // The turn asked for a handoff (in that turn); its resolution comes once the turn ended and was judged, with the
  // requesting turn's id. A request a restart finds unresolved reads as cancelled.
  | { type: "handoff.requested"; canvas: { path: string }; text: string }
  // canvas: the path of the request it resolves, since a turn may ask for several. A line written before that has none
  // and resolves the turn's only request.
  | ({ type: "handoff.resolved"; canvas?: { path: string } } & HandoffResolution)
  // A new canvas the guided turn edited and asked no handoff for, with the turn's id; Doan starts nothing on it. The ID
  // tells later whether that canvas is gone or was renamed.
  | { type: "handoff.missed"; canvas: Canvas }
  // A new canvas the turn drew (any turn: project, canvas or legacy external), written once it is listed, with the turn's
  // id; the canvas's card is built from it.
  | { type: "canvas.drawn"; canvas: Canvas };
export type ConversationEvent = EventPayload & { v: 1; conversationId: string; seq: number; turnId: string; at: string };
// waitingPermission: waiting for the person's answer, to a permission request or a question.
export type TurnState = "idle" | "starting" | "streaming" | "waitingPermission" | "failed" | "interrupted";
// runtime is an app provider here: reservations cover doan-account sessions of every provider.
export interface SessionKey { runtime: import("../agentAuth/types").Provider; configDir: string; sessionId: string }
export interface Reservation { owner: string; key: SessionKey | null }
export interface TransportState {
  // Claude only: the uuid of the turn's own prompt until the CLI reads it (runners.ts send).
  prompt?: string;
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
  // Claude only: the failure code an assistant frame's `error` named (claudeFrame); a failed result takes it over its text.
  claudeFailure?: FailureCode;
  // Claude only: the edit calls (Write, Edit, MultiEdit) whose result has not come yet, by tool_use id, each with the path
  // its activity stored ("" for none). activities holds every tool's id, so only these results are counted.
  claudeEdits?: Record<string, string>;
  // Codex only: the fileChange items whose completion has not come yet, by item id, with the path each of the item's
  // activities stored ("" for none). A result names only one of these, which the store already took.
  codexEdits?: Record<string, string[]>;
  // Claude only: the index of the thinking block now streaming, whose stop ends the thinking stage.
  thinkingBlock?: number;
  // Claude only: the turn compacted the context (a top-level compact_boundary), with the tokens it left when the CLI
  // said; its output after the boundary is the CLI's record, not text for the thread.
  compacted?: { post?: number };
  // The turn's tool calls still running, in the order they started; absent when none runs. A tool's end reports general
  // only once this is empty, so a sibling's end never hides a tool still running. Every path that ends the turn clears it.
  running?: string[];
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
// A command turn's boundary as the provider reported it in this run (conversation:boundary), never stored: after a
// restart the thread rebuilds it from the record (service read, commandTurns.ts).
export interface BoundarySignal { conversationId: string; turnId: string; kind: import("./commandRecords").BoundaryKind }
// stage: the turn's stage after this frame, sent after its events; absent when the frame tells nothing new.
export interface TransportResult { state: TransportState; events: EventPayload[]; stage?: TurnStage }
export interface PermissionChoice { option: PermissionOption; response: unknown }
export interface PendingPermission { event: PermissionRequest; choices: PermissionChoice[] }
