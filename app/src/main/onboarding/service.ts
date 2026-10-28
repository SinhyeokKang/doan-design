import { randomUUID } from "node:crypto";
import type {
  OnboardingAgentStatus, OnboardingOp, OnboardingOperation, OnboardingOperationErrorCode, OnboardingRequest, OnboardingResponse,
  OnboardingSocketErrorCode, OnboardingState,
} from "../../formats/types";
import { validateOnboardingRequest } from "../../formats/validate";
import { AUTH_CHANNELS, type AuthCheckReply, type AuthReason, type AuthSnapshot } from "../agentAuth/ipc";
import type { AuthStatusDto, Provider } from "../agentAuth/types";

// The first-run session the window and a local CLI or MCP client share (buzz-onboarding design 'CLI·MCP 온보딩').
// Electron-free: index.ts supplies the main window, the auth IPC and completion, and carries the socket and IPC.

// The old wizard's onboarding:read|run|answer|close|get-open are different channels and go away with it.
export const ONBOARDING_CHANNELS = {
  start: "onboarding:start", status: "onboarding:status", check: "onboarding:check", cancel: "onboarding:cancel",
  inspect: "onboarding:inspect", clone: "onboarding:clone", complete: "onboarding:complete", changed: "onboarding:changed",
} as const;

// AuthIpc: every sign-in step goes through its owner and attempt checks, never around them.
export interface OnboardingAuth {
  read(): Promise<AuthSnapshot>;
  latest(): AuthSnapshot;
  handle(channel: string, value: unknown, owner: number): Promise<AuthCheckReply | AuthSnapshot>;
}
export interface OnboardingServiceOptions {
  // null: account storage is unreadable.
  auth: OnboardingAuth | null;
  // The main window's webContents id, or null while it is gone: CLI and MCP sign-ins belong to it.
  mainOwner(): number | null;
  completed(): boolean;
  publish(state: OnboardingState): void;
  newId?: () => string;
  snapshotWaitMs?: number;
}

// Cursor and Copilot open the browser themselves; opening again would show a second tab.
const AUTO_OPEN: ReadonlySet<Provider> = new Set(["claude", "codex", "antigravity"]);
// Below the socket's 2 s limit, so a slow first tool probe still leaves time to answer.
const SNAPSHOT_WAIT_MS = 1500;
// status lists every kept operation inside the CLI's 64 KiB reply limit.
const KEPT_FINISHED = 20;
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

// Fixed text only: provider output, OAuth text, paths and accounts never reach a message (review G ⚪1).
const MESSAGES: Record<OnboardingSocketErrorCode, string> = {
  bad_request: "Doan could not handle this request.",
  bad_token: "The token does not match this app.",
  session_stale: "This onboarding session has ended. Run onboarding start again.",
  operation_not_found: "This session has no such operation.",
  request_conflict: "This requestId was already used with other arguments.",
  inspection_stale: "That inspection is no longer current. Inspect the project again.",
  busy: "Another sign-in or sign-out is in progress. Wait for it or cancel it first.",
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
const OPERATION_MESSAGES: Record<OnboardingOperationErrorCode, string> = {
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
const SIGN_IN_FAILURES: ReadonlySet<string> = new Set(["sign_in_failed", "network", "storage_failed", "cli_install_failed"]);
const CHECK_FAILURES: ReadonlySet<string> = new Set(["network", "check_failed", "cli_install_failed"]);
const AUTH_REFUSALS: Partial<Record<AuthReason, OnboardingSocketErrorCode>> = {
  busy: "busy", stop_required: "stop_required", not_owner: "not_owner", not_connected: "not_connected", sign_out_failed: "sign_out_failed",
};

function refuse(code: OnboardingSocketErrorCode): OnboardingResponse { return { v: 2, ok: false, error: { code, message: MESSAGES[code] } }; }
// Field by field, so account, attempt and agent-auth's revision never leave main.
function agentStatus(dto: AuthStatusDto): OnboardingAgentStatus {
  return { provider: dto.provider, phase: dto.phase, readiness: dto.readiness, error: dto.error, actions: dto.actions };
}
// requestId identity: the same request without its token.
function argumentsKey(request: OnboardingRequest): string {
  return JSON.stringify(Object.entries(request).filter(([key]) => key !== "token").sort(([a], [b]) => a < b ? -1 : 1));
}

// A window request is the socket DTO without its version and token; the window is already authenticated by its frame.
export function rendererRequest(op: OnboardingOp, value: unknown): OnboardingRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || "v" in value || "token" in value || "op" in value) return null;
  const request: unknown = { ...value, v: 2, token: "", op };
  return validateOnboardingRequest(request) ? request : null;
}

interface Tracked { operation: OnboardingOperation; attemptId: string | null; cancelling: boolean; prompted: boolean }
type Write = Exclude<OnboardingRequest, { op: "start" | "status" }>;

export class OnboardingService {
  readonly sessionId: string;
  private revision = 0;
  private operations = new Map<string, Tracked>();
  private attempts = new Map<string, string>();
  // A refused request leaves no record, so its id is judged again on a resend.
  private requests = new Map<string, { key: string; reply: Promise<OnboardingResponse>; operationId: string | null }>();
  private readonly newId: () => string;
  constructor(private readonly options: OnboardingServiceOptions) {
    this.newId = options.newId ?? randomUUID;
    this.sessionId = this.newId();
  }

  async answer(request: OnboardingRequest): Promise<OnboardingResponse> {
    if (request.op === "start") return { v: 2, ok: true, op: "start", result: this.build(await this.agents()) };
    if (request.sessionId !== this.sessionId) return refuse("session_stale");
    if (request.op === "status") {
      if (request.operationId === undefined) return { v: 2, ok: true, op: "status", result: this.build(await this.agents()) };
      const tracked = this.operations.get(request.operationId);
      if (!tracked) return refuse("operation_not_found");
      return { v: 2, ok: true, op: "status", result: this.build(await this.agents(), [tracked.operation]) };
    }
    const key = argumentsKey(request);
    const seen = this.requests.get(request.requestId);
    if (seen) {
      if (seen.key !== key) return refuse("request_conflict");
      const original = await seen.reply;
      if (!original.ok || seen.operationId === null) return original;
      return this.operationReply(request.op, seen.operationId);
    }
    const record = { key, reply: this.write(request), operationId: null as string | null };
    this.requests.set(request.requestId, record);
    const reply = await record.reply;
    if (!reply.ok) this.requests.delete(request.requestId);
    else if ("operation" in reply.result) record.operationId = reply.result.operation.operationId;
    return reply;
  }

  // Every agent-auth publish: sign-ins and checks of this session follow their attempts.
  authChanged(snapshot: AuthSnapshot): void {
    if (this.sync(snapshot)) this.touch(snapshot);
  }
  // Main's onPrompt tap, after AuthIpc stored the link: the window gets the same prompt and opens only its own attempts.
  prompted(prompt: { provider: Provider; attemptId: string; owner: number }): void {
    const id = this.attempts.get(prompt.attemptId);
    const tracked = id === undefined ? undefined : this.operations.get(id);
    if (!tracked || tracked.prompted || tracked.cancelling || TERMINAL.has(tracked.operation.state)) return;
    tracked.prompted = true;
    if (AUTO_OPEN.has(prompt.provider)) void this.options.auth?.handle(AUTH_CHANNELS.openLink, { provider: prompt.provider, attemptId: prompt.attemptId }, prompt.owner).catch(() => undefined);
    const snapshot = this.options.auth?.latest() ?? null;
    if (snapshot && this.sync(snapshot)) this.touch(snapshot);
  }
  snapshot(): OnboardingState { return this.build(this.options.auth?.latest() ?? null); }

  private async write(request: Write): Promise<OnboardingResponse> {
    switch (request.op) {
      case "check": return this.check(request.requestId, request.provider);
      case "sign_in": return this.signIn(request.requestId, request.provider);
      case "cancel": return this.cancel(request.operationId);
      // Batch B1 builds inspection; until then it refuses rather than pretending (conductor, 2026-10-29).
      case "project_inspect": return refuse("bad_request");
      // Nothing was inspected in this session, so no inspection is current.
      case "project_select": case "project_clone": return refuse("inspection_stale");
      case "complete": {
        const agents = await this.agents();
        if (agents === null) return refuse("auth_unavailable");
        if (!agents.providers.some(p => p.readiness.ready)) return refuse("no_ready_agent");
        return refuse("no_project");
      }
    }
  }

  private async check(requestId: string, provider: Provider): Promise<OnboardingResponse> {
    const auth = this.options.auth;
    if (!auth) return refuse("auth_unavailable");
    // A check has no owner; AuthIpc takes one for every channel.
    const reply = await auth.handle(AUTH_CHANNELS.check, { provider }, this.options.mainOwner() ?? -1);
    if (!("ok" in reply)) return refuse("bad_request");
    if (!reply.ok) return refuse(AUTH_REFUSALS[reply.reason] ?? "bad_request");
    // A version cause only re-reads tool facts, with no attempt to follow.
    const attemptId = "attemptId" in reply ? reply.attemptId : null;
    const tracked = this.track({ kind: "check", provider, requestId, state: attemptId === null ? "succeeded" : "running" }, attemptId);
    return { v: 2, ok: true, op: "check", result: { operation: { ...tracked.operation, kind: "check" } } };
  }

  private async signIn(requestId: string, provider: Provider): Promise<OnboardingResponse> {
    const auth = this.options.auth;
    if (!auth) return refuse("auth_unavailable");
    const owner = this.options.mainOwner();
    if (owner === null) return refuse("busy");
    // No stop: stopping running conversations is confirmed in the app only (design '고정 명령·도구').
    const reply = await auth.handle(AUTH_CHANNELS.signIn, { provider }, owner);
    if (!("ok" in reply)) return refuse("bad_request");
    if (!reply.ok) return refuse(AUTH_REFUSALS[reply.reason] ?? "bad_request");
    if (!("attemptId" in reply)) return refuse("bad_request");
    const tracked = this.track({ kind: "sign_in", provider, requestId, state: "pending" }, reply.attemptId);
    return { v: 2, ok: true, op: "sign_in", result: { operation: { ...tracked.operation, kind: "sign_in" } } };
  }

  // Only the attempt this operation started: the window's own sign-ins share the owner but have no operation here.
  private async cancel(operationId: string): Promise<OnboardingResponse> {
    const tracked = this.operations.get(operationId);
    if (!tracked) return refuse("operation_not_found");
    const auth = this.options.auth, owner = this.options.mainOwner(), provider = tracked.operation.provider;
    if (auth && owner !== null && provider && tracked.operation.kind === "sign_in" && tracked.attemptId !== null &&
      !tracked.cancelling && !TERMINAL.has(tracked.operation.state)) {
      await auth.handle(AUTH_CHANNELS.cancel, { provider, attemptId: tracked.attemptId }, owner);
    }
    return this.operationReply("cancel", operationId);
  }

  private track(fields: Pick<OnboardingOperation, "kind" | "provider" | "requestId" | "state">, attemptId: string | null): Tracked {
    const operation: OnboardingOperation = { operationId: this.newId(), requestId: fields.requestId, kind: fields.kind, state: fields.state };
    if (fields.provider) operation.provider = fields.provider;
    const tracked: Tracked = { operation, attemptId, cancelling: false, prompted: false };
    this.operations.set(operation.operationId, tracked);
    if (attemptId !== null) this.attempts.set(attemptId, operation.operationId);
    const snapshot = this.options.auth?.latest() ?? null;
    if (snapshot) this.sync(snapshot);
    this.touch(snapshot);
    return tracked;
  }

  private operationReply(op: Write["op"], operationId: string): OnboardingResponse {
    const tracked = this.operations.get(operationId);
    if (!tracked) return refuse("operation_not_found");
    return { v: 2, ok: true, op, result: { operation: tracked.operation } } as OnboardingResponse;
  }

  // True when an operation changed.
  private sync(snapshot: AuthSnapshot): boolean {
    let changed = false;
    for (const tracked of this.operations.values()) {
      const provider = tracked.operation.provider;
      const dto = provider ? snapshot.providers.find(p => p.provider === provider) : undefined;
      if (!dto || tracked.attemptId === null || TERMINAL.has(tracked.operation.state)) continue;
      const next = this.follow(tracked, dto);
      if (JSON.stringify(next) !== JSON.stringify(tracked.operation)) { tracked.operation = next; changed = true; }
    }
    if (changed) this.prune();
    return changed;
  }

  private follow(tracked: Tracked, dto: AuthStatusDto): OnboardingOperation {
    const { cancelling: _cancelling, error: _error, ...base } = tracked.operation;
    const attempt = dto.attempt;
    if (attempt?.id === tracked.attemptId) {
      if (attempt.cancelling) { tracked.cancelling = true; return { ...base, state: "running", cancelling: true }; }
      if (base.kind === "check") return { ...base, state: "running" };
      return { ...base, state: tracked.prompted ? "awaiting_user" : "pending" };
    }
    // A sign-in replaced the check before its result: the check did not finish.
    if (tracked.cancelling || (base.kind === "check" && attempt !== null)) return { ...base, state: "cancelled" };
    const code = dto.error?.code;
    const failures = base.kind === "check" ? CHECK_FAILURES : SIGN_IN_FAILURES;
    if (code !== undefined && failures.has(code)) {
      const failed = code as OnboardingOperationErrorCode;
      return { ...base, state: "failed", error: { code: failed, message: OPERATION_MESSAGES[failed] } };
    }
    return { ...base, state: "succeeded" };
  }

  private prune(): void {
    const finished = [...this.operations.values()].filter(t => TERMINAL.has(t.operation.state));
    for (const tracked of finished.slice(0, Math.max(0, finished.length - KEPT_FINISHED))) {
      this.operations.delete(tracked.operation.operationId);
      if (tracked.attemptId !== null) this.attempts.delete(tracked.attemptId);
    }
  }

  private touch(snapshot: AuthSnapshot | null): void {
    this.revision += 1;
    this.options.publish(this.build(snapshot));
  }

  private async agents(): Promise<AuthSnapshot | null> {
    const auth = this.options.auth;
    if (!auth) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<AuthSnapshot>(resolve => { timer = setTimeout(() => resolve(auth.latest()), this.options.snapshotWaitMs ?? SNAPSHOT_WAIT_MS); });
    try { return await Promise.race([auth.read(), late]); } finally { clearTimeout(timer); }
  }

  private build(snapshot: AuthSnapshot | null, operations = [...this.operations.values()].map(t => t.operation)): OnboardingState {
    return {
      sessionId: this.sessionId, revision: this.revision, completed: this.options.completed(),
      agents: snapshot && { revision: snapshot.revision, providers: snapshot.providers.map(agentStatus) },
      project: null, operations,
    };
  }
}
