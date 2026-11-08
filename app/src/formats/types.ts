export interface SelectionElement {
  doanId?: string;
  selector: string;
  html: string;
  text?: string;
  truncated?: boolean;
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
export type OnboardingProjectInspectRequest = OnboardingWriteBase & { op: "project_inspect"; storage?: OnboardingStorage } & (
  // url with path: the repository the chosen folder must belong to.
  | { path: string; url?: string }
  | { url: string; destination?: string }
);
// Where a project's .doan/ is kept: committed with the repository, or out of Git on this Mac (schema `storage`).
export type OnboardingStorage = "repo" | "local";
export interface OnboardingProjectSelectRequest extends OnboardingWriteBase {
  op: "project_select";
  inspectionId: string;
  path: string;
  initialize?: boolean;
  // Must equal the inspected candidate's mode; omitted means "repo".
  storage?: OnboardingStorage;
}
export interface OnboardingProjectCloneRequest extends OnboardingWriteBase {
  op: "project_clone";
  inspectionId: string;
  destination: string;
  storage?: OnboardingStorage;
}
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
// ".git/info/exclude" is a fixed label, not a path: in a linked worktree or submodule .git is a file.
export type OnboardingChange = ".doan/config.json" | ".doan/canvases/" | ".gitattributes" | ".git/info/exclude";
export interface OnboardingInspection {
  inspectionId: string;
  // storage is only ever "local", and only in a reply to a request that carried storage: present when the changes are
  // planned for local or the project is already set up that way; absent means "repo". A reply to a request without
  // storage never carries it, so older clients (which reject unknown properties) can read it.
  candidates: { path: string; changes: OnboardingChange[]; storage?: "local" }[];
  clone?: { destination: string; changes: OnboardingChange[]; storage?: "local" };
}

export type OnboardingOperationKind = "check" | "sign_in" | "project_inspect" | "project_select" | "project_clone" | "complete";
export type OnboardingOperationState = "pending" | "running" | "awaiting_user" | "succeeded" | "failed" | "cancelled";
export type OnboardingOperationErrorCode =
  | "sign_in_failed" | "network" | "storage_failed" | "check_failed" | "account_mismatch" | "cli_install_failed"
  | "repository_unreachable" | "git_missing" | "remote_mismatch" | "destination_exists" | "clone_failed" | "cleanup_failed"
  | "config_invalid" | "init_failed" | "local_not_git" | "local_exclude_failed" | "project_unavailable" | "project_unreadable" | "no_ready_agent" | "completion_save_failed"
  | "completion_unsupported_version";

export interface OnboardingOperation {
  operationId: string;
  requestId: string;
  kind: OnboardingOperationKind;
  state: OnboardingOperationState;
  cancelling?: true;
  provider?: OnboardingProvider;
  // detail: in the app's own window only (main's onboarding IPC), never in a socket reply, whose schema refuses it.
  error?: { code: OnboardingOperationErrorCode; message: string; detail?: string };
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

type WorkSession = { session?: string; provider?: "claude" | "codex"; conversation?: never };
export type WorkRequest = { v: 3; token: string; root: string } &
  (
    | (WorkSession & ({ action: "start"; path: string } | { action: "done"; path?: never }))
    | ({ action: "update"; path: string; frame?: string; note?: string } & (WorkSession | { conversation: string; session?: never; provider?: never }))
  );
export type WorkResponse = { v: 3; ok: true } | { v: 3; ok: false; error: { code: "bad_request" | "bad_token" | "project_not_open"; message: string } };

export type OpenRequest = { v: 4; token: string; root: string; path: string; frame?: string };
export type OpenFrameResult = "found" | "missing" | "none";
export type OpenErrorCode = "bad_request" | "bad_token" | "project_not_open" | "canvas_not_found" | "busy" | "not_ready";
export type OpenResponse = { v: 4; ok: true; opened: true; frame: OpenFrameResult } | { v: 4; ok: false; error: { code: OpenErrorCode; message: string } };

export type HandoffRequest = { v: 5; token: string; root: string; handoff: string; path: string; text: string };
export type HandoffErrorCode =
  | "bad_request"
  | "bad_token"
  | "project_not_open"
  | "not_app_conversation"
  | "root_mismatch"
  | "not_running"
  | "not_canvas_conversation"
  | "plan_mode"
  | "handoff_turn"
  | "already_requested"
  | "same_canvas";
export type HandoffResponse = { v: 5; ok: true; requested: true } | { v: 5; ok: false; error: { code: HandoffErrorCode; message: string } };
