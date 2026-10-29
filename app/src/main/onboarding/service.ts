import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type {
  OnboardingAgentStatus, OnboardingChange, OnboardingInspection, OnboardingOp, OnboardingOperation, OnboardingOperationErrorCode,
  OnboardingProject, OnboardingProjectCloneRequest, OnboardingProjectInspectRequest, OnboardingProjectSelectRequest, OnboardingRequest,
  OnboardingResponse, OnboardingSocketErrorCode, OnboardingState,
} from "../../formats/types";
import { validateOnboardingRequest } from "../../formats/validate";
import { AUTH_CHANNELS, type AuthCheckReply, type AuthReason, type AuthSnapshot } from "../agentAuth/ipc";
import type { CheckOutcome } from "../agentAuth/manager";
import type { AuthStatusDto, Provider } from "../agentAuth/types";
import type { CompletionWrite } from "./completion";
import type { Candidate, CloneTarget, ProjectOutcome } from "./projects";
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
  // A check has no owner; its outcome comes after its result and any write-back.
  check(provider: Provider): Promise<{ reply: AuthCheckReply; outcome?: Promise<CheckOutcome> }>;
}
// Folder work (projects.ts, clone.ts and the completion marker), wired by index.ts.
export interface OnboardingProjects {
  // The canonical existing directory, or null.
  folder(path: string): Promise<string | null>;
  // inside_project: a clone there would be read as part of that project, never as its own.
  destination(path: string): Promise<CloneTarget>;
  present(path: string): Promise<boolean>;
  // repo: the GitHub repository a folder chosen from the URL path must belong to.
  inspectPath(real: string, repo: GitHubUrl | null): Promise<{ ok: true; candidates: Candidate[] } | { ok: false; code: OnboardingOperationErrorCode }>;
  inspectUrl(repo: GitHubUrl): Promise<Candidate[]>;
  select(path: string, initialize: boolean, repo: GitHubUrl | null): Promise<ProjectOutcome>;
  // Resolves only after the clone's processes are gone and its own temporary directory is removed. commit() is asked
  // once the clone sits at its destination; after it says true no cancel applies.
  clone(url: string, destination: string, signal: AbortSignal, commit: () => boolean): Promise<ProjectOutcome | { ok: false; cancelled: true }>;
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
// status lists every kept operation inside the CLI's 64 KiB reply limit; older finished ones still answer their
// requestId and `status --operation` for the whole session.
const KEPT_FINISHED = 20;
// Codex prints its local listener before the auth URL (ARCHITECTURE §7); that line is not where the user signs in.
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
// Folder work that ends this fast answers its final state; anything slower answers running and is read with status.
const QUICK_REPLY_MS = 1000;
// Bounded like agent-auth's quit: a clone's group is stopped within about 2.5 s.
const QUIT_WAIT_MS = 5000;
// The most a clone can need: whether the repository brings its own setup is known only after the clone.
const CLONE_CHANGES: OnboardingChange[] = [".doan/canvases/", ".doan/config.json", ".gitattributes"];
// Selection, clone and completion change or save the one project, so only one of them runs at a time.
const PROJECT_WORK = ["project_select", "project_clone", "complete"] as const;
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
  // Folder work: a clone's cancel, the moment it no longer takes one, and the end of its work for quit.
  abort?: AbortController; committed?: boolean; done?: Promise<void>;
}
type Write = Exclude<OnboardingRequest, { op: "start" | "status" }>;
type FolderKind = keyof typeof THROWN;
type Finished = { state: "succeeded"; inspection?: OnboardingInspection; project?: OnboardingProject } | { state: "failed"; code: OnboardingOperationErrorCode; message?: string } | { state: "cancelled" };
// Only the newest inspection started in this session can be acted on (design '동일 상태·소유권·재시도'). target is the
// planned clone folder in canonical spelling; the inspection shows the destination as it was asked for.
interface Inspection { generation: number; inspection: OnboardingInspection; repo: GitHubUrl | null; target?: string }
const leftoverMessage = (paths: readonly string[]) => paths.length === 1
  ? `Couldn't remove ${paths[0]}. Remove it, then try again.`
  : `Couldn't remove ${paths.slice(0, -1).join(", ")} and ${paths.at(-1)}. Remove them, then try again.`;

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
  // Per destination parent: a clone directory this session could not remove. No other is made there until it is gone.
  private leftovers = new Map<string, string[]>();
  // Every request of the session, refused ones too: a resend gets the original answer, never fresh work.
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
      // The operation and the revision are read after the auth read, from one moment of the session.
      const agents = await this.agents();
      if (request.operationId === undefined) return { v: 2, ok: true, op: "status", result: this.build(agents) };
      const operation = this.find(request.operationId);
      if (!operation) return refuse("operation_not_found");
      return { v: 2, ok: true, op: "status", result: this.build(agents, [operation]) };
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
    if (reply.ok && "operation" in reply.result) record.operationId = reply.result.operation.operationId;
    return reply;
  }

  // Every agent-auth publish: sign-ins and checks of this session follow their attempts.
  authChanged(snapshot: AuthSnapshot): void {
    if (this.sync(snapshot)) this.touch(snapshot);
  }
  // Main's onPrompt tap, after AuthIpc stored the link: the window gets the same prompt and opens only its own attempts.
  prompted(prompt: { provider: Provider; attemptId: string; owner: number; url: string }): void {
    if (LOOPBACK.test(prompt.url)) return;
    const id = this.attempts.get(prompt.attemptId);
    const tracked = id === undefined ? undefined : this.operations.get(id);
    if (!tracked || tracked.prompted || tracked.cancelling || TERMINAL.has(tracked.operation.state)) return;
    tracked.prompted = true;
    if (AUTO_OPEN.has(prompt.provider)) void this.options.auth?.handle(AUTH_CHANNELS.openLink, { provider: prompt.provider, attemptId: prompt.attemptId }, prompt.owner).catch(() => undefined);
    const snapshot = this.options.auth?.latest() ?? null;
    if (snapshot && this.sync(snapshot)) this.touch(snapshot);
  }
  snapshot(): OnboardingState { return this.build(this.options.auth?.latest() ?? null); }

  // Synchronously when quit is accepted, before any teardown is awaited: no completion is saved and no project work
  // starts after it. An abandoned quit reopens.
  closeForQuit(): void { this.closing = true; }
  reopenAfterAbortedQuit(): void { this.closing = false; }
  // Running clones stop and clean up before the app goes (bounded; a timeout is not proof of cleanup).
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
  private busy(kinds: readonly OnboardingOperation["kind"][]): boolean {
    return [...this.operations.values()].some(t => kinds.includes(t.operation.kind) && !TERMINAL.has(t.operation.state));
  }
  private current(inspectionId: string): Inspection | null {
    const latest = this.inspection;
    return latest && latest.generation === this.inspected && latest.inspection.inspectionId === inspectionId ? latest : null;
  }

  private async inspect(request: OnboardingProjectInspectRequest): Promise<OnboardingResponse> {
    if (this.closing || this.busy(["project_clone"])) return refuse("busy");
    // Counted at the start: a newer inspection, from the window or a client, makes this one stale even if it ends last.
    const generation = ++this.inspected;
    const projects = this.options.projects;
    let source: { path: string; repo: GitHubUrl | null } | { repo: GitHubUrl; destination?: string; target?: string };
    if ("path" in request) {
      const repo = request.url === undefined ? null : parseGitHubUrl(request.url);
      if (request.url !== undefined && repo === null) return refuse("invalid_url");
      const real = await projects.folder(request.path);
      if (real === null) return refuse("path_unavailable");
      source = { path: real, repo };
    } else {
      const repo = parseGitHubUrl(request.url);
      if (repo === null) return refuse("invalid_url");
      let target: string | undefined;
      if (request.destination !== undefined) {
        const destination = await projects.destination(request.destination);
        if (destination.state !== "absent") return refuse(destination.state === "exists" ? "destination_exists" : "path_unavailable");
        target = destination.path;
      }
      source = { repo, ...(request.destination !== undefined && target !== undefined ? { destination: request.destination, target } : {}) };
    }
    // Checked again after the awaits, with nothing awaited between this and the launch that records the operation.
    if (this.closing || this.busy(["project_clone"])) return refuse("busy");
    return this.launch("project_inspect", request.requestId, async () => {
      const found = "path" in source ? await projects.inspectPath(source.path, source.repo) : { ok: true as const, candidates: await projects.inspectUrl(source.repo) };
      if (!found.ok) return { state: "failed", code: found.code };
      const inspection: OnboardingInspection = { inspectionId: this.newId(), candidates: found.candidates };
      if ("destination" in source && source.destination !== undefined) inspection.clone = { destination: source.destination, changes: CLONE_CHANGES };
      // The repository stays with the inspection so select checks the folder's remote again before registering it.
      if (generation === this.inspected) this.inspection = { generation, inspection, repo: source.repo, ...("target" in source && source.target ? { target: source.target } : {}) };
      return { state: "succeeded", inspection };
    });
  }

  private async select(request: OnboardingProjectSelectRequest): Promise<OnboardingResponse> {
    if (this.closing || this.busy(PROJECT_WORK)) return refuse("busy");
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
    if (this.closing || this.busy(PROJECT_WORK)) return refuse("busy");
    const current = this.current(request.inspectionId);
    if (!current || !current.repo || !current.target || current.inspection.clone?.destination !== request.destination) return refuse("inspection_stale");
    const destination = await this.options.projects.destination(request.destination);
    if (destination.state !== "absent") return refuse(destination.state === "exists" ? "destination_exists" : "path_unavailable");
    // Read again after the await, with nothing awaited before the launch: a newer inspection, or a parent that now
    // resolves elsewhere, makes this plan stale.
    if (this.current(request.inspectionId) !== current || destination.path !== current.target) return refuse("inspection_stale");
    if (this.closing || this.busy(PROJECT_WORK)) return refuse("busy");
    const repo = current.repo, target = destination.path, abort = new AbortController(), projects = this.options.projects;
    return this.launch("project_clone", request.requestId, async tracked => {
      const parent = dirname(target), recorded = this.leftovers.get(parent);
      if (recorded !== undefined) {
        const present = (await Promise.all(recorded.map(async path => await projects.present(path) ? [path] : []))).flat();
        if (present.length > 0) { this.leftovers.set(parent, present); return { state: "failed", code: "cleanup_failed", message: leftoverMessage(present) }; }
        this.leftovers.delete(parent);
      }
      // D19 (2026-10-29): the rename into the destination publishes the clone. After this commit a cancel returns the
      // running operation unchanged and registration and setup continue: cancelling would delete a folder already in
      // its final place.
      const commit = () => { if (abort.signal.aborted) return false; tracked.committed = true; return true; };
      const result = await projects.clone(repo.url, target, abort.signal, commit);
      if ("cancelled" in result) return { state: "cancelled" };
      if (!result.ok && result.leftovers !== undefined) {
        this.leftovers.set(parent, result.leftovers);
        return { state: "failed", code: "cleanup_failed", message: leftoverMessage(result.leftovers) };
      }
      return this.selected(result);
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
    // The project must not change while it is being saved, nor be saved while a new one is being chosen.
    if (this.busy(PROJECT_WORK)) return refuse("busy");
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

  private async launch(kind: FolderKind, requestId: string, work: (tracked: Tracked) => Promise<Finished>, abort?: AbortController): Promise<OnboardingResponse> {
    const tracked = this.track({ kind, requestId, state: "running" }, null);
    if (abort) tracked.abort = abort;
    const done = work(tracked).catch((error: unknown): Finished => {
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
    const { operationId, requestId, kind, provider } = tracked.operation;
    const operation: OnboardingOperation = { operationId, requestId, kind, state: finished.state };
    if (provider) operation.provider = provider;
    if (finished.state === "failed") operation.error = { code: finished.code, message: finished.message ?? OPERATION_MESSAGES[finished.code] };
    if (finished.state === "succeeded" && finished.inspection) operation.inspection = finished.inspection;
    if (finished.state === "succeeded" && finished.project) operation.project = finished.project;
    tracked.operation = operation;
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
    const tracked = this.operations.get(operationId);
    if (!tracked) return refuse("operation_not_found");
    const auth = this.options.auth, owner = this.options.mainOwner(), provider = tracked.operation.provider;
    if (auth && owner !== null && provider && tracked.operation.kind === "sign_in" && tracked.attemptId !== null &&
      !tracked.cancelling && !TERMINAL.has(tracked.operation.state)) {
      await auth.handle(AUTH_CHANNELS.cancel, { provider, attemptId: tracked.attemptId }, owner);
    }
    // Stays running until the clone's processes and temporary directory are gone (cancelling in the contract).
    if (tracked.abort && !tracked.committed && !tracked.cancelling && !TERMINAL.has(tracked.operation.state)) {
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

  // Maps keep insertion order, so the oldest go first. Retired operations leave the status list, not the session.
  private prune(): void {
    const finished = [...this.operations.values()].filter(t => TERMINAL.has(t.operation.state));
    for (const tracked of finished.slice(0, Math.max(0, finished.length - KEPT_FINISHED))) {
      this.operations.delete(tracked.operation.operationId);
      if (tracked.attemptId !== null) this.attempts.delete(tracked.attemptId);
      this.retired.set(tracked.operation.operationId, tracked.operation);
    }
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
