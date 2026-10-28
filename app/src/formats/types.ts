export type Author =
  | { kind: "human"; name: string; email?: string }
  | { kind: "agent"; name: string };

export interface SelectionElement {
  doanId?: string;
  selector: string;
  html: string;
  text?: string;
  truncated?: boolean;
}

export interface Target {
  frame?: string;
  element?: SelectionElement;
}

interface EventBase {
  v: 1;
  id: string;
  at: string;
  comment: string;
  by: Author;
}

export type CommentEvent = EventBase & (
  | { type: "create"; body: string; canvasHash: string; target: Target }
  | { type: "edit"; body: string }
  | { type: "delete" | "resolve" | "reopen" }
);

export interface LocatedEvent {
  line: number;
  event: CommentEvent;
}

export interface Warning {
  code: "invalid_event" | "unknown_version" | "conflicting_duplicate" |
    "agent_not_allowed" | "duplicate_create" | "orphan_event";
  line: number;
  event?: string;
  comment?: string;
}

export interface Comment {
  comment: string;
  status: "open" | "resolved";
  body: string;
  target: Target;
  canvasHash: string;
  createdBy: Author;
  createdAt: string;
  updatedAt: string;
  resolvedBy?: Author;
  resolvedAt?: string;
  lastResolution?: {
    by: Author;
    at: string;
    reopenedBy: Author;
    reopenedAt: string;
  };
}

export interface ParseResult {
  events: LocatedEvent[];
  warnings: Warning[];
}

export interface FoldResult {
  comments: Comment[];
  warnings: Warning[];
}

export interface RuntimeFile {
  v: 1;
  socket: string;
  token: string;
}

export interface Selection {
  root: string;
  canvas: { path: string; id?: string };
  frame?: { id: string; title?: string };
  element?: SelectionElement;
}

export interface SocketRequest {
  v: 1;
  token: string;
  root: string;
}

export type SocketErrorCode = "bad_token" | "bad_request" | "project_not_open";

export type SocketResponse =
  | { v: 1; ok: true; result: { selection?: Selection } }
  | { v: 1; ok: false; error: { code: SocketErrorCode; message: string } };

export type OnboardingProvider = "claude" | "codex" | "cursor" | "antigravity" | "copilot";

interface OnboardingRequestBase { v: 2; token: string }
interface OnboardingWriteBase extends OnboardingRequestBase { sessionId: string; requestId: string }

export interface OnboardingStartRequest extends OnboardingRequestBase { op: "start" }
export interface OnboardingStatusRequest extends OnboardingRequestBase { op: "status"; sessionId: string; operationId?: string }
export type OnboardingCheckRequest = OnboardingWriteBase & { op: "check" } & (
  | { provider: Exclude<OnboardingProvider, "copilot">; spendCopilotRequest?: boolean }
  | { provider: "copilot"; spendCopilotRequest: true }
);
export interface OnboardingSignInRequest extends OnboardingWriteBase { op: "sign_in"; provider: OnboardingProvider }
export interface OnboardingCancelRequest extends OnboardingWriteBase { op: "cancel"; operationId: string }
export type OnboardingProjectInspectRequest = OnboardingWriteBase & { op: "project_inspect" } & (
  | { path: string }
  | { url: string; destination?: string }
);
export interface OnboardingProjectSelectRequest extends OnboardingWriteBase {
  op: "project_select";
  inspectionId: string;
  path: string;
  initialize?: boolean;
}
export interface OnboardingProjectCloneRequest extends OnboardingWriteBase { op: "project_clone"; inspectionId: string; destination: string }
export interface OnboardingCompleteRequest extends OnboardingWriteBase { op: "complete" }

export type OnboardingRequest =
  | OnboardingStartRequest
  | OnboardingStatusRequest
  | OnboardingCheckRequest
  | OnboardingSignInRequest
  | OnboardingCancelRequest
  | OnboardingProjectInspectRequest
  | OnboardingProjectSelectRequest
  | OnboardingProjectCloneRequest
  | OnboardingCompleteRequest;
export type OnboardingOp = OnboardingRequest["op"];

export type OnboardingReadinessCause =
  | "cli_missing" | "version_unsupported" | "version_unknown" | "version_incompatible" | "busy" | "sign_out_failed"
  | "not_connected" | "account_mismatch" | "reauth_required" | "unverified" | "tools_missing" | "tools_failed";
export type OnboardingRecoveryAction = "install" | "update" | "retry" | "wait" | "signOut" | "signIn" | "reauth" | "repair";

export interface OnboardingAgentStatus {
  provider: OnboardingProvider;
  phase: "disconnected" | "checking" | "signingIn" | "connected" | "reauthRequired" | "signingOut" | "error";
  readiness: { ready: true } | { ready: false; cause: OnboardingReadinessCause; action: OnboardingRecoveryAction };
  error: {
    code: "sign_in_failed" | "network" | "storage_failed" | "check_failed" | "account_mismatch" | "sign_out_failed" | "cli_install_failed";
    retryable: boolean;
  } | null;
  actions: ("signIn" | "cancel" | "retry" | "reauth" | "signOut")[];
}

export interface OnboardingProject { root: string }
export type OnboardingChange = ".doan/config.json" | ".doan/canvases/" | ".gitattributes";
export interface OnboardingInspection {
  inspectionId: string;
  candidates: { path: string; changes: OnboardingChange[] }[];
  clone?: { destination: string; changes: OnboardingChange[] };
}

export type OnboardingOperationKind = "check" | "sign_in" | "project_inspect" | "project_select" | "project_clone" | "complete";
export type OnboardingOperationState = "pending" | "running" | "awaiting_user" | "succeeded" | "failed" | "cancelled";
export type OnboardingOperationErrorCode =
  | "sign_in_failed" | "network" | "storage_failed" | "check_failed" | "account_mismatch" | "cli_install_failed"
  | "repository_unreachable" | "git_missing" | "remote_mismatch" | "destination_exists" | "clone_failed" | "cleanup_failed"
  | "config_invalid" | "init_failed" | "project_unavailable" | "no_ready_agent" | "completion_save_failed"
  | "completion_unsupported_version";

export interface OnboardingOperation {
  operationId: string;
  requestId: string;
  kind: OnboardingOperationKind;
  state: OnboardingOperationState;
  cancelling?: true;
  provider?: OnboardingProvider;
  error?: { code: OnboardingOperationErrorCode; message: string };
  inspection?: OnboardingInspection;
  project?: OnboardingProject;
}

export interface OnboardingState {
  sessionId: string;
  revision: number;
  completed: boolean;
  agents: { revision: number; providers: OnboardingAgentStatus[] } | null;
  project: OnboardingProject | null;
  operations: OnboardingOperation[];
}

export type OnboardingSocketErrorCode =
  | "bad_request" | "bad_token" | "session_stale" | "operation_not_found" | "request_conflict" | "inspection_stale"
  | "busy" | "stop_required" | "not_owner" | "not_connected" | "sign_out_failed" | "auth_unavailable" | "no_ready_agent"
  | "no_project" | "invalid_url" | "path_unavailable" | "not_candidate" | "initialize_required" | "destination_exists";

export type OnboardingResponse =
  | { v: 2; ok: true; op: "start" | "status"; result: OnboardingState }
  | { [K in OnboardingOperationKind]: { v: 2; ok: true; op: K; result: { operation: OnboardingOperation & { kind: K } } } }[OnboardingOperationKind]
  | { v: 2; ok: true; op: "cancel"; result: { operation: OnboardingOperation } }
  | { v: 2; ok: false; error: { code: OnboardingSocketErrorCode; message: string } };
