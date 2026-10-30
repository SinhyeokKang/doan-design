import { randomUUID } from "node:crypto";
import type {
  OnboardingAgentStatus, OnboardingOp, OnboardingOperation, OnboardingOperationErrorCode, OnboardingRequest, OnboardingResponse,
  OnboardingSocketErrorCode, OnboardingState,
} from "../../formats/types";
import { validateOnboardingRequest } from "../../formats/validate";
import { AUTH_CHANNELS, type AuthCheckReply, type AuthReason, type AuthSnapshot } from "../agentAuth/ipc";
import type { CheckOutcome } from "../agentAuth/manager";
import type { AuthStatusDto, Provider } from "../agentAuth/types";
import type { CompletionWrite } from "./completion";
import { OperationBook, OPERATION_MESSAGES, refuse, TERMINAL, type Finished, type Tracked, type WriteRequest } from "./operations";
import { PROJECT_WORK, ProjectAdder, projectLocks, type AdderProjects, type ProjectLocks } from "./projectAdder";
import type { ProjectOutcome } from "./projects";


// The first-run session the window and a local CLI or MCP client share (buzz-onboarding design 'CLI·MCP 온보딩').
// Electron-free: index.ts supplies the main window, the auth IPC and completion, and carries the socket and IPC.

// The old wizard's onboarding:read|run|answer|close|get-open are different channels and go away with it.
export const ONBOARDING_CHANNELS = {
  start: "onboarding:start", status: "onboarding:status", check: "onboarding:check", cancel: "onboarding:cancel",
  inspect: "onboarding:inspect", select: "onboarding:select", clone: "onboarding:clone", complete: "onboarding:complete",
  changed: "onboarding:changed",
} as const;

// AuthIpc: every sign-in step goes through its owner and attempt checks, never around them.
export interface OnboardingAuth {
  read(): Promise<AuthSnapshot>;
  latest(): AuthSnapshot;
  handle(channel: string, value: unknown, owner: number): Promise<AuthCheckReply | AuthSnapshot>;
  // A check has no owner; its outcome comes after its result and any write-back.
  check(provider: Provider): Promise<{ reply: AuthCheckReply; outcome?: Promise<CheckOutcome> }>;
}
// Folder work (the project adder's, plus the completion marker), wired by index.ts.
export interface OnboardingProjects extends AdderProjects {
  // Reads only: canonical, set up and registered.
  confirm(root: string): Promise<ProjectOutcome>;
  saveCompletion(root: string): CompletionWrite;
}
export interface OnboardingServiceOptions {
  // null: account storage is unreadable.
  auth: OnboardingAuth | null;
  // The main window's webContents id, or null while it is gone: CLI and MCP sign-ins belong to it.
  mainOwner(): number | null;
  completed(): boolean;
  publish(state: OnboardingState): void;
  projects: OnboardingProjects;
  // Shared with the Add Projects page's adder; a service alone gets its own.
  locks?: ProjectLocks;
  newId?: () => string;
  snapshotWaitMs?: number;
  quickReplyMs?: number;
}

// Codex, Cursor and Copilot open the browser themselves; opening again would show a second tab.
const AUTO_OPEN: ReadonlySet<Provider> = new Set(["claude", "antigravity"]);
// Below the socket's 2 s limit, so a slow first tool probe still leaves time to answer.
const SNAPSHOT_WAIT_MS = 1500;
// Codex prints its local listener before the auth URL (ARCHITECTURE §7); that line is not where the user signs in.
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;

const SIGN_IN_FAILURES: ReadonlySet<string> = new Set(["sign_in_failed", "network", "storage_failed", "cli_install_failed"]);
const AUTH_REFUSALS: Partial<Record<AuthReason, OnboardingSocketErrorCode>> = {
  busy: "busy", stop_required: "stop_required", not_owner: "not_owner", not_connected: "not_connected", sign_out_failed: "sign_out_failed",
};

// Field by field, so account, attempt and agent-auth's revision never leave main.
function agentStatus(dto: AuthStatusDto): OnboardingAgentStatus {
  return { provider: dto.provider, phase: dto.phase, readiness: dto.readiness, error: dto.error, actions: dto.actions };
}

// A window request is the socket DTO without its version and token; the window is already authenticated by its frame.
export function rendererRequest(op: OnboardingOp, value: unknown): OnboardingRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || "v" in value || "token" in value || "op" in value) return null;
  const request: unknown = { ...value, v: 2, token: "", op };
  return validateOnboardingRequest(request) ? request : null;
}

export class OnboardingService {
  readonly sessionId: string;
  private revision = 0;
  private attempts = new Map<string, string>();
  private readonly book: OperationBook;
  private readonly adder: ProjectAdder;
  private readonly newId: () => string;
  constructor(private readonly options: OnboardingServiceOptions) {
    this.newId = options.newId ?? randomUUID;
    this.sessionId = this.newId();
    this.book = new OperationBook(this.newId);
    this.adder = new ProjectAdder({
      track: (kind, requestId) => this.track({ kind, requestId, state: "running" }, null),
      finish: (tracked, finished) => this.finish(tracked, finished),
      changed: () => this.touch(this.options.auth?.latest() ?? null),
      values: () => this.book.values(),
      reply: (op, operationId) => this.book.reply(op, operationId),
    }, options.projects, options.locks ?? projectLocks(), { newId: this.newId, ...(options.quickReplyMs === undefined ? {} : { quickReplyMs: options.quickReplyMs }), label: "onboarding" });
  }

  async answer(request: OnboardingRequest): Promise<OnboardingResponse> {
    if (request.op === "start") return { v: 2, ok: true, op: "start", result: this.build(await this.agents()) };
    if (request.sessionId !== this.sessionId) return refuse("session_stale");
    if (request.op === "status") {
      // The operation and the revision are read after the auth read, from one moment of the session.
      const agents = await this.agents();
      if (request.operationId === undefined) return { v: 2, ok: true, op: "status", result: this.build(agents) };
      const operation = this.book.find(request.operationId);
      if (!operation) return refuse("operation_not_found");
      return { v: 2, ok: true, op: "status", result: this.build(agents, [operation]) };
    }
    return this.book.once(request, () => this.write(request));
  }

  // Every agent-auth publish: sign-ins and checks of this session follow their attempts.
  authChanged(snapshot: AuthSnapshot): void {
    if (this.sync(snapshot)) this.touch(snapshot);
  }
  // Main's onPrompt tap, after AuthIpc stored the link: the window gets the same prompt and opens only its own attempts.
  prompted(prompt: { provider: Provider; attemptId: string; owner: number; url: string }): void {
    if (LOOPBACK.test(prompt.url)) return;
    const id = this.attempts.get(prompt.attemptId);
    const tracked = id === undefined ? undefined : this.book.get(id);
    if (!tracked || tracked.prompted || tracked.cancelling || TERMINAL.has(tracked.operation.state)) return;
    tracked.prompted = true;
    if (AUTO_OPEN.has(prompt.provider)) void this.options.auth?.handle(AUTH_CHANNELS.openLink, { provider: prompt.provider, attemptId: prompt.attemptId }, prompt.owner).catch(() => undefined);
    const snapshot = this.options.auth?.latest() ?? null;
    if (snapshot && this.sync(snapshot)) this.touch(snapshot);
  }
  snapshot(): OnboardingState { return this.build(this.options.auth?.latest() ?? null); }

  // Synchronously when quit is accepted, before any teardown is awaited: no completion is saved and no project work
  // starts after it. An abandoned quit reopens.
  closeForQuit(): void { this.adder.closeForQuit(); }
  reopenAfterAbortedQuit(): void { this.adder.reopenAfterAbortedQuit(); }
  // Running clones stop and clean up before the app goes (bounded; a timeout is not proof of cleanup).
  quit(): Promise<void> { return this.adder.quit(); }

  private async write(request: WriteRequest): Promise<OnboardingResponse> {
    switch (request.op) {
      case "check": return this.check(request.requestId, request.provider);
      case "sign_in": return this.signIn(request.requestId, request.provider);
      case "cancel": return this.cancel(request.operationId);
      case "project_inspect": return this.adder.inspect(request);
      case "project_select": return this.adder.select(request);
      case "project_clone": return this.adder.clone(request);
      case "complete": return this.complete(request.requestId);
    }
  }

  // Re-reads readiness and the selected root; never selects, clones or sets up again, so a Retry only saves.
  private async complete(requestId: string): Promise<OnboardingResponse> {
    const agents = await this.agents();
    if (agents === null) return refuse("auth_unavailable");
    if (!agents.providers.some(p => p.readiness.ready)) return refuse("no_ready_agent");
    const project = this.adder.project;
    if (project === null) return refuse("no_project");
    // The project must not change while it is being saved, nor be saved while a new one is being chosen.
    if (this.adder.busy(PROJECT_WORK)) return refuse("busy");
    return this.adder.launch("complete", requestId, async () => {
      const confirmed = await this.options.projects.confirm(project.root);
      if (!confirmed.ok) return { state: "failed", code: confirmed.code };
      // Checked right before the atomic write, which is the moment onboarding completes.
      if (this.adder.closed) return { state: "cancelled" };
      if (!this.options.auth?.latest().providers.some(p => p.readiness.ready)) return { state: "failed", code: "no_ready_agent" };
      const saved = this.options.projects.saveCompletion(confirmed.root);
      if (!saved.ok) return { state: "failed", code: saved.reason === "unknown_version" ? "completion_unsupported_version" : "completion_save_failed" };
      return { state: "succeeded", project: { root: confirmed.root } };
    });
  }

  private finish(tracked: Tracked, finished: Finished): void {
    this.book.settle(tracked, finished);
    this.touch(this.options.auth?.latest() ?? null);
  }

  private async check(requestId: string, provider: Provider): Promise<OnboardingResponse> {
    const auth = this.options.auth;
    if (!auth) return refuse("auth_unavailable");
    const { reply, outcome } = await auth.check(provider);
    if (!reply.ok) return refuse(AUTH_REFUSALS[reply.reason] ?? "bad_request");
    // A version cause only re-reads tool facts, with no attempt to follow.
    const tracked = this.track({ kind: "check", provider, requestId, state: outcome ? "running" : "succeeded" }, null);
    // Not awaited: the reply goes now, and the outcome lands after the check's write-back.
    void outcome?.then(found => this.finish(tracked, found === "ok" ? { state: "succeeded" } : found === "replaced" ? { state: "cancelled" } : { state: "failed", code: found }));
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
    const tracked = this.book.get(operationId);
    if (!tracked) return refuse("operation_not_found");
    const auth = this.options.auth, owner = this.options.mainOwner(), provider = tracked.operation.provider;
    if (auth && owner !== null && provider && tracked.operation.kind === "sign_in" && tracked.attemptId !== null &&
      !tracked.cancelling && !TERMINAL.has(tracked.operation.state)) {
      await auth.handle(AUTH_CHANNELS.cancel, { provider, attemptId: tracked.attemptId }, owner);
    }
    this.adder.cancel(tracked);
    return this.book.reply("cancel", operationId);
  }

  private track(fields: Pick<OnboardingOperation, "kind" | "provider" | "requestId" | "state">, attemptId: string | null): Tracked {
    const tracked = this.book.add(fields, attemptId);
    if (attemptId !== null) this.attempts.set(attemptId, tracked.operation.operationId);
    const snapshot = this.options.auth?.latest() ?? null;
    if (snapshot) this.sync(snapshot);
    this.touch(snapshot);
    return tracked;
  }

  // True when an operation changed.
  private sync(snapshot: AuthSnapshot): boolean {
    let changed = false;
    for (const tracked of this.book.values()) {
      const provider = tracked.operation.provider;
      const dto = provider ? snapshot.providers.find(p => p.provider === provider) : undefined;
      if (!dto || tracked.attemptId === null || TERMINAL.has(tracked.operation.state)) continue;
      const next = this.follow(tracked, dto);
      if (JSON.stringify(next) !== JSON.stringify(tracked.operation)) { tracked.operation = next; changed = true; }
    }
    return changed;
  }

  private follow(tracked: Tracked, dto: AuthStatusDto): OnboardingOperation {
    const { cancelling: _cancelling, error: _error, ...base } = tracked.operation;
    const attempt = dto.attempt;
    if (attempt?.id === tracked.attemptId) {
      if (attempt.cancelling) { tracked.cancelling = true; return { ...base, state: "running", cancelling: true }; }
      return { ...base, state: tracked.prompted ? "awaiting_user" : "pending" };
    }
    if (tracked.cancelling) return { ...base, state: "cancelled" };
    const code = dto.error?.code;
    if (code !== undefined && SIGN_IN_FAILURES.has(code)) {
      const failed = code as OnboardingOperationErrorCode;
      return { ...base, state: "failed", error: { code: failed, message: OPERATION_MESSAGES[failed] } };
    }
    return { ...base, state: "succeeded" };
  }

  private touch(snapshot: AuthSnapshot | null): void {
    this.book.prune(tracked => { if (tracked.attemptId !== null) this.attempts.delete(tracked.attemptId); });
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

  private build(snapshot: AuthSnapshot | null, operations = this.book.list()): OnboardingState {
    return {
      sessionId: this.sessionId, revision: this.revision, completed: this.options.completed(),
      agents: snapshot && { revision: snapshot.revision, providers: snapshot.providers.map(agentStatus) },
      project: this.adder.project, operations,
    };
  }
}
