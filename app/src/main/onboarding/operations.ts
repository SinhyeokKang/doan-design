import type { OnboardingInspection, OnboardingOperation, OnboardingOperationErrorCode, OnboardingProject, OnboardingRequest, OnboardingResponse, OnboardingSocketErrorCode } from "../../formats/types";

// The operation records, request replay and fixed messages of an app-socket v2 session. The first-run session and
// the Add Projects page's session share them, so both answer with the same DTOs (buzz-add-projects design 'main의
// project 처리').

// Fixed text only: provider output, OAuth text, paths and accounts never reach a message (review G ⚪1).
const MESSAGES: Record<OnboardingSocketErrorCode, string> = {
  bad_request: "Doan could not handle this request.",
  bad_token: "The token does not match this app.",
  session_stale: "This onboarding session has ended. Run onboarding start again.",
  operation_not_found: "This session has no such operation.",
  request_conflict: "This requestId was already used with other arguments.",
  inspection_stale: "That inspection is no longer current. Inspect the project again.",
  busy: "Another agent sign-in, sign-out or check is in progress. Wait for it or cancel it first.",
  stop_required: "A conversation with this agent is running. Stop it in Doan, then sign in again.",
  not_owner: "Another window started this sign-in.",
  not_connected: "This agent is not connected.",
  sign_out_failed: "The last sign-out of this agent failed. Sign out again in Doan first.",
  auth_unavailable: "Doan cannot read its agent sign-in storage.",
  no_ready_agent: "No agent is ready. Sign in to one first.",
  no_project: "No project is selected yet.",
  invalid_url: "Use a GitHub repository URL.",
  path_unavailable: "That folder cannot be opened.",
  not_candidate: "That folder is not one of the inspected candidates.",
  initialize_required: "This folder needs setup. Select it again with initialize.",
  destination_exists: "Something already exists at that destination.",
};
export const OPERATION_MESSAGES: Record<OnboardingOperationErrorCode, string> = {
  sign_in_failed: "The sign-in did not finish. Try again.",
  network: "Doan could not reach the provider. Check the connection and try again.",
  storage_failed: "Doan could not save the sign-in securely. Allow Keychain access and try again.",
  check_failed: "Doan could not check this connection.",
  account_mismatch: "A different account is signed in. Sign in again.",
  cli_install_failed: "Doan could not download what this agent needs. Check the connection and try again.",
  repository_unreachable: "Doan could not reach the repository with your Git sign-in.",
  git_missing: "Git is not installed.",
  remote_mismatch: "That folder belongs to another repository.",
  destination_exists: "Something already exists at that destination.",
  clone_failed: "The clone did not finish.",
  cleanup_failed: "Doan could not remove the unfinished clone. Remove it, then try again.",
  config_invalid: "The project settings cannot be read.",
  init_failed: "Doan could not set up the project.",
  project_unavailable: "The project folder cannot be opened.",
  no_ready_agent: "No agent is ready. Sign in to one first.",
  completion_save_failed: "Doan could not save that setup is complete.",
  completion_unsupported_version: "Setup was saved by a newer version of Doan. Open this project with that version, or update Doan.",
};

export const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
// status lists every kept operation inside the CLI's 64 KiB reply limit; older finished ones still answer their
// requestId and `status --operation` for the whole session.
const KEPT_FINISHED = 20;

export function refuse(code: OnboardingSocketErrorCode): OnboardingResponse { return { v: 2, ok: false, error: { code, message: MESSAGES[code] } }; }
// requestId identity: the same request without its token.
function argumentsKey(request: OnboardingRequest): string {
  return JSON.stringify(Object.entries(request).filter(([key]) => key !== "token").sort(([a], [b]) => a < b ? -1 : 1));
}

export type WriteRequest = Exclude<OnboardingRequest, { op: "start" | "status" }>;
export interface Tracked {
  operation: OnboardingOperation; attemptId: string | null; cancelling: boolean; prompted: boolean;
  // Folder work: a clone's cancel, the moment it no longer takes one, and the end of its work for quit.
  abort?: AbortController; committed?: boolean; done?: Promise<void>;
}
export type Finished = { state: "succeeded"; inspection?: OnboardingInspection; project?: OnboardingProject } | { state: "failed"; code: OnboardingOperationErrorCode; message?: string } | { state: "cancelled" };

export class OperationBook {
  private operations = new Map<string, Tracked>();
  private retired = new Map<string, OnboardingOperation>();
  // Every request of the session, refused ones too: a resend gets the original answer, never fresh work.
  private requests = new Map<string, { key: string; reply: Promise<OnboardingResponse>; operationId: string | null }>();
  constructor(private readonly newId: () => string) {}

  async once(request: WriteRequest, write: () => Promise<OnboardingResponse>): Promise<OnboardingResponse> {
    const key = argumentsKey(request);
    const seen = this.requests.get(request.requestId);
    if (seen) {
      if (seen.key !== key) return refuse("request_conflict");
      const original = await seen.reply;
      if (!original.ok || seen.operationId === null) return original;
      return this.reply(request.op, seen.operationId);
    }
    const record = { key, reply: write(), operationId: null as string | null };
    this.requests.set(request.requestId, record);
    const reply = await record.reply;
    if (reply.ok && "operation" in reply.result) record.operationId = reply.result.operation.operationId;
    return reply;
  }

  // Recorded only; the session publishes.
  add(fields: Pick<OnboardingOperation, "kind" | "provider" | "requestId" | "state">, attemptId: string | null): Tracked {
    const operation: OnboardingOperation = { operationId: this.newId(), requestId: fields.requestId, kind: fields.kind, state: fields.state };
    if (fields.provider) operation.provider = fields.provider;
    const tracked: Tracked = { operation, attemptId, cancelling: false, prompted: false };
    this.operations.set(operation.operationId, tracked);
    return tracked;
  }
  settle(tracked: Tracked, finished: Finished): void {
    const { operationId, requestId, kind, provider } = tracked.operation;
    const operation: OnboardingOperation = { operationId, requestId, kind, state: finished.state };
    if (provider) operation.provider = provider;
    if (finished.state === "failed") operation.error = { code: finished.code, message: finished.message ?? OPERATION_MESSAGES[finished.code] };
    if (finished.state === "succeeded" && finished.inspection) operation.inspection = finished.inspection;
    if (finished.state === "succeeded" && finished.project) operation.project = finished.project;
    tracked.operation = operation;
  }

  // Maps keep insertion order, so the oldest go first. Retired operations leave the status list, not the session.
  prune(retire: (tracked: Tracked) => void = () => {}): void {
    const finished = [...this.operations.values()].filter(t => TERMINAL.has(t.operation.state));
    for (const tracked of finished.slice(0, Math.max(0, finished.length - KEPT_FINISHED))) {
      this.operations.delete(tracked.operation.operationId);
      retire(tracked);
      this.retired.set(tracked.operation.operationId, tracked.operation);
    }
  }

  get(operationId: string): Tracked | undefined { return this.operations.get(operationId); }
  values(): IterableIterator<Tracked> { return this.operations.values(); }
  list(): OnboardingOperation[] { return [...this.operations.values()].map(t => t.operation); }
  find(operationId: string): OnboardingOperation | undefined {
    return this.operations.get(operationId)?.operation ?? this.retired.get(operationId);
  }
  reply(op: WriteRequest["op"], operationId: string): OnboardingResponse {
    const operation = this.find(operationId);
    if (!operation) return refuse("operation_not_found");
    return { v: 2, ok: true, op, result: { operation } } as OnboardingResponse;
  }
}
