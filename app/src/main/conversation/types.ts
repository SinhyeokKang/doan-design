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
  cli: boolean; version: string | null; sdkVersion?: string;
  selectedConfigDir: string | null;
  occupancy: "free" | "occupied" | "unknown";
  sessionExists: boolean;
}
export interface Anchor {
  frame?: { id: string; title?: string };
  element?: { doanId?: string; selector: string; text?: string; tag?: string };
  point?: { frameId?: string; dx: number; dy: number };
}
export type FailureCode = "runtime_unsupported" | "cli_missing" | "not_logged_in" | "session_unavailable" | "session_in_use" | "process_exited" | "rate_limited" | "unknown";
export interface PermissionOption { id: string; label: string; kind: "allow" | "allowAlways" | "deny" }
export interface PermissionRequest {
  type: "permission.request"; requestId: string; tool: string; summary: string; options: PermissionOption[];
}
export type EventPayload =
  | { type: "user.message"; text: string; anchors: Anchor[] }
  | { type: "turn.started" }
  | { type: "message.delta"; messageId: string; text: string }
  | { type: "message.done"; messageId: string; text: string }
  | { type: "activity"; kind: "edit" | "read" | "command" | "other"; path?: string; insideDesign?: boolean; summary: string }
  | PermissionRequest
  | { type: "permission.resolved"; requestId: string; optionId: string }
  | { type: "turn.done" }
  | { type: "turn.failed"; code: FailureCode; detail?: string }
  | { type: "interrupted"; reason: "user" | "appQuit" | "crashed" }
  | { type: "conversation.archived" };
export type ConversationEvent = EventPayload & { v: 1; conversationId: string; seq: number; turnId: string; at: string };
export type TurnState = "idle" | "starting" | "streaming" | "waitingPermission" | "failed" | "interrupted";
export interface ConversationBinding {
  conversationId: string; root: string; canvas?: Canvas;
  origin: "resumed" | "new" | "newDesign"; state: "current" | "archived";
}
export interface SessionKey { runtime: Runtime; configDir: string; sessionId: string }
export interface Reservation { owner: string; key: SessionKey | null }
export interface TransportState {
  terminal: boolean;
  stop: "user" | "appQuit" | null;
  messageId: string;
  textBlock: number | null;
  completedMessages: string[];
  activities: string[];
}
export interface TransportResult { state: TransportState; events: EventPayload[] }
export interface PermissionChoice { option: PermissionOption; response: unknown }
export interface PendingPermission { event: PermissionRequest; choices: PermissionChoice[] }
