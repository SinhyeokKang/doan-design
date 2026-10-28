import { randomUUID } from "node:crypto";
import type {
  OnboardingAgentStatus, OnboardingChange, OnboardingInspection, OnboardingOp, OnboardingOperation, OnboardingOperationErrorCode,
  OnboardingProject, OnboardingProjectCloneRequest, OnboardingProjectInspectRequest, OnboardingProjectSelectRequest, OnboardingRequest,
  OnboardingResponse, OnboardingSocketErrorCode, OnboardingState,
} from "../../formats/types";
import { validateOnboardingRequest } from "../../formats/validate";
import { AUTH_CHANNELS, type AuthCheckReply, type AuthReason, type AuthSnapshot } from "../agentAuth/ipc";
import type { AuthStatusDto, Provider } from "../agentAuth/types";
import type { CompletionWrite } from "./completion";
import type { Candidate, ProjectOutcome } from "./projects";
import { parseGitHubUrl, type GitHubUrl } from "./repository";

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
}
// Folder work (projects.ts, clone.ts and the completion marker), wired by index.ts.
export interface OnboardingProjects {
  // The canonical existing directory, or null.
  folder(path: string): Promise<string | null>;
  destination(path: string): Promise<"absent" | "exists" | "no_parent">;
  inspectPath(real: string): Promise<{ ok: true; candidates: Candidate[] } | { ok: false; code: OnboardingOperationErrorCode }>;
  inspectUrl(repo: GitHubUrl): Promise<Candidate[]>;
  select(path: string, initialize: boolean, repo: GitHubUrl | null): Promise<ProjectOutcome>;
  // Resolves only after the clone's processes are gone and its own temporary directory is removed.
  clone(url: string, destination: string, signal: AbortSignal): Promise<ProjectOutcome | { ok: false; cancelled: true }>;
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
  newId?: () => string;
  snapshotWaitMs?: number;
  quickReplyMs?: number;
}

// Cursor and Copilot open the browser themselves; opening again would show a second tab.
const AUTO_OPEN: ReadonlySet<Provider> = new Set(["claude", "codex", "antigravity"]);
// Below the socket's 2 s limit, so a slow first tool probe still leaves time to answer.
const SNAPSHOT_WAIT_MS = 1500;
// status lists every kept operation inside the CLI's 64 KiB reply limit.
const KEPT_FINISHED = 20;
// Finished operations dropped from the list still answer a resend of their requestId, up to this many.
const KEPT_RETIRED = 1000;
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
// Folder work that ends this fast answers its final state; anything slower answers running and is read with status.
const QUICK_REPLY_MS = 1000;
// Bounded like agent-auth's quit: a clone's group is stopped within about 2.5 s.
const QUIT_WAIT_MS = 5000;
// The most a clone can need: whether the repository brings its own setup is known only after the clone.
const CLONE_CHANGES: OnboardingChange[] = [".doan/canvases/", ".doan/config.json", ".gitattributes"];
// What an operation reports when its work threw instead of answering.
const THROWN: Record<"project_inspect" | "project_select" | "project_clone" | "complete", OnboardingOperationErrorCode> = {
  project_inspect: "project_unavailable", project_select: "project_unavailable", project_clone: "clone_failed", complete: "completion_save_failed",
};

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

interface Tracked {
  operation: OnboardingOperation; attemptId: string | null; cancelling: boolean; prompted: boolean;
  // Folder work: a clone's cancel, and the end of its work for quit.
  abort?: AbortController; done?: Promise<void>;
}
type Write = Exclude<OnboardingRequest, { op: "start" | "status" }>;
type FolderKind = keyof typeof THROWN;
type Finished = { state: "succeeded"; inspection?: OnboardingInspection; project?: OnboardingProject } | { state: "failed"; code: OnboardingOperationErrorCode } | { state: "cancelled" };
// Only the newest inspection started in this session can be acted on (design '동일 상태·소유권·재시도').
interface Inspection { generation: number; inspection: OnboardingInspection; repo: GitHubUrl | null }

export class OnboardingService {
  readonly sessionId: string;
  private revision = 0;
  private operations = new Map<string, Tracked>();
  private attempts = new Map<string, string>();
  private retired = new Map<string, OnboardingOperation>();
  private project: OnboardingProject | null = null;
  private inspected = 0;
  private inspection: Inspection | null = null;
  private closing = false;
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
      const operation = this.find(request.operationId);
      if (!operation) return refuse("operation_not_found");
      return { v: 2, ok: true, op: "status", result: this.build(await this.agents(), [operation]) };
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

  // Quit: no completion is saved after this, and running clones stop and clean up before the app goes.
  async quit(): Promise<void> {
    this.closing = true;
    const work: Promise<void>[] = [];
    for (const tracked of this.operations.values()) {
      if (tracked.operation.kind !== "project_clone" || TERMINAL.has(tracked.operation.state)) continue;
      tracked.abort?.abort();
      if (tracked.done) work.push(tracked.done);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.allSettled(work), new Promise(resolve => { timer = setTimeout(resolve, QUIT_WAIT_MS); timer.unref?.(); })]);
    clearTimeout(timer);
  }

  private async write(request: Write): Promise<OnboardingResponse> {
    switch (request.op) {
      case "check": return this.check(request.requestId, request.provider);
      case "sign_in": return this.signIn(request.requestId, request.provider);
      case "cancel": return this.cancel(request.operationId);
      case "project_inspect": return this.inspect(request);
      case "project_select": return this.select(request);
      case "project_clone": return this.clone(request);
      case "complete": return this.complete(request.requestId);
    }
  }

  // A running or cleaning clone holds every location change until its processes and directory are gone.
  private busy(kinds: readonly string[]): boolean {
    return [...this.operations.values()].some(t => kinds.includes(t.operation.kind) && !TERMINAL.has(t.operation.state));
  }
  private current(inspectionId: string): Inspection | null {
    const latest = this.inspection;
    return latest && latest.generation === this.inspected && latest.inspection.inspectionId === inspectionId ? latest : null;
  }

  private async inspect(request: OnboardingProjectInspectRequest): Promise<OnboardingResponse> {
    if (this.busy(["project_clone"])) return refuse("busy");
    const projects = this.options.projects;
    let source: { path: string } | { repo: GitHubUrl; destination?: string };
    if ("path" in request) {
      const real = await projects.folder(request.path);
      if (real === null) return refuse("path_unavailable");
      source = { path: real };
    } else {
      const repo = parseGitHubUrl(request.url);
      if (repo === null) return refuse("invalid_url");
      if (request.destination !== undefined) {
        const destination = await projects.destination(request.destination);
        if (destination !== "absent") return refuse(destination === "exists" ? "destination_exists" : "path_unavailable");
      }
      source = { repo, ...(request.destination !== undefined ? { destination: request.destination } : {}) };
    }
    // Counted at the start: a newer inspection, from the window or a client, makes this one stale even if it ends last.
    const generation = ++this.inspected;
    return this.launch("project_inspect", request.requestId, async () => {
      const found = "path" in source ? await projects.inspectPath(source.path) : { ok: true as const, candidates: await projects.inspectUrl(source.repo) };
      if (!found.ok) return { state: "failed", code: found.code };
      const inspection: OnboardingInspection = { inspectionId: this.newId(), candidates: found.candidates };
      if ("repo" in source && source.destination !== undefined) inspection.clone = { destination: source.destination, changes: CLONE_CHANGES };
      if (generation === this.inspected) this.inspection = { generation, inspection, repo: "repo" in source ? source.repo : null };
      return { state: "succeeded", inspection };
    });
  }

  private async select(request: OnboardingProjectSelectRequest): Promise<OnboardingResponse> {
    if (this.busy(["project_select", "project_clone"])) return refuse("busy");
    const current = this.current(request.inspectionId);
    if (!current) return refuse("inspection_stale");
    const candidate = current.inspection.candidates.find(c => c.path === request.path);
    if (!candidate) return refuse("not_candidate");
    // Setup writes files in the user's folder, so it happens only when asked for (design '고정 명령·도구').
    const initialize = request.initialize === true;
    if (candidate.changes.length > 0 && !initialize) return refuse("initialize_required");
    return this.launch("project_select", request.requestId, async () => this.selected(await this.options.projects.select(candidate.path, initialize, current.repo)));
  }

  private async clone(request: OnboardingProjectCloneRequest): Promise<OnboardingResponse> {
    if (this.busy(["project_select", "project_clone"])) return refuse("busy");
    const current = this.current(request.inspectionId);
    if (!current || !current.repo || current.inspection.clone?.destination !== request.destination) return refuse("inspection_stale");
    const destination = await this.options.projects.destination(request.destination);
    if (destination !== "absent") return refuse(destination === "exists" ? "destination_exists" : "path_unavailable");
    const repo = current.repo, abort = new AbortController();
    return this.launch("project_clone", request.requestId, async () => {
      const result = await this.options.projects.clone(repo.url, request.destination, abort.signal);
      return "cancelled" in result ? { state: "cancelled" } : this.selected(result);
    }, abort);
  }

  private selected(outcome: ProjectOutcome): Finished {
    if (!outcome.ok) return { state: "failed", code: outcome.code };
    this.project = { root: outcome.root };
    return { state: "succeeded", project: { root: outcome.root } };
  }

  // Re-reads readiness and the selected root; never selects, clones or sets up again, so a Retry only saves.
  private async complete(requestId: string): Promise<OnboardingResponse> {
    const agents = await this.agents();
    if (agents === null) return refuse("auth_unavailable");
    if (!agents.providers.some(p => p.readiness.ready)) return refuse("no_ready_agent");
    const project = this.project;
    if (project === null) return refuse("no_project");
    if (this.busy(["complete"])) return refuse("busy");
    return this.launch("complete", requestId, async () => {
      const confirmed = await this.options.projects.confirm(project.root);
      if (!confirmed.ok) return { state: "failed", code: confirmed.code };
      // Checked right before the atomic write, which is the moment onboarding completes.
      if (this.closing) return { state: "cancelled" };
      if (!this.options.auth?.latest().providers.some(p => p.readiness.ready)) return { state: "failed", code: "no_ready_agent" };
      const saved = this.options.projects.saveCompletion(confirmed.root);
      if (!saved.ok) return { state: "failed", code: saved.reason === "unknown_version" ? "completion_unsupported_version" : "completion_save_failed" };
      return { state: "succeeded", project: { root: confirmed.root } };
    });
  }

  private async launch(kind: FolderKind, requestId: string, work: () => Promise<Finished>, abort?: AbortController): Promise<OnboardingResponse> {
    const tracked = this.track({ kind, requestId, state: "running" }, null);
    if (abort) tracked.abort = abort;
    const done = work().catch((error: unknown): Finished => {
      // The work's own error may name paths or tool output; the operation gets a code and a fixed message only.
      console.error(`doan: onboarding ${kind} failed`, error);
      return { state: "failed", code: THROWN[kind] };
    }).then(finished => this.finish(tracked, finished));
    tracked.done = done;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([done, new Promise(resolve => { timer = setTimeout(resolve, this.options.quickReplyMs ?? QUICK_REPLY_MS); })]);
    clearTimeout(timer);
    return this.operationReply(kind, tracked.operation.operationId);
  }

  private finish(tracked: Tracked, finished: Finished): void {
    const { operationId, requestId, kind } = tracked.operation;
    const operation: OnboardingOperation = { operationId, requestId, kind, state: finished.state };
    if (finished.state === "failed") operation.error = { code: finished.code, message: OPERATION_MESSAGES[finished.code] };
    if (finished.state === "succeeded" && finished.inspection) operation.inspection = finished.inspection;
    if (finished.state === "succeeded" && finished.project) operation.project = finished.project;
    tracked.operation = operation;
    this.touch(this.options.auth?.latest() ?? null);
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
    // Stays running until the clone's processes and temporary directory are gone (cancelling in the contract).
    if (tracked.abort && !tracked.cancelling && !TERMINAL.has(tracked.operation.state)) {
      tracked.cancelling = true;
      tracked.operation = { ...tracked.operation, state: "running", cancelling: true };
      tracked.abort.abort();
      this.touch(this.options.auth?.latest() ?? null);
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

  private find(operationId: string): OnboardingOperation | undefined {
    return this.operations.get(operationId)?.operation ?? this.retired.get(operationId);
  }
  private operationReply(op: Write["op"], operationId: string): OnboardingResponse {
    const operation = this.find(operationId);
    if (!operation) return refuse("operation_not_found");
    return { v: 2, ok: true, op, result: { operation } } as OnboardingResponse;
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

  // Maps keep insertion order, so the oldest go first. A requestId whose operation is gone for good is forgotten
  // with it and judged as a new request.
  private prune(): void {
    const finished = [...this.operations.values()].filter(t => TERMINAL.has(t.operation.state));
    for (const tracked of finished.slice(0, Math.max(0, finished.length - KEPT_FINISHED))) {
      this.operations.delete(tracked.operation.operationId);
      if (tracked.attemptId !== null) this.attempts.delete(tracked.attemptId);
      this.retired.set(tracked.operation.operationId, tracked.operation);
    }
    const gone = new Set([...this.retired.keys()].slice(0, Math.max(0, this.retired.size - KEPT_RETIRED)));
    for (const id of gone) this.retired.delete(id);
    if (gone.size > 0) for (const [requestId, record] of this.requests) if (record.operationId !== null && gone.has(record.operationId)) this.requests.delete(requestId);
  }

  private touch(snapshot: AuthSnapshot | null): void {
    this.prune();
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
      project: this.project, operations,
    };
  }
}
