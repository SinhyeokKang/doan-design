import { dirname } from "node:path";
import type {
  OnboardingChange, OnboardingInspection, OnboardingOperation, OnboardingOperationErrorCode, OnboardingProject, OnboardingProjectCloneRequest,
  OnboardingProjectInspectRequest, OnboardingProjectSelectRequest, OnboardingResponse,
} from "../../formats/types";
import { refuse, TERMINAL, type Finished, type Tracked, type WriteRequest } from "./operations";
import type { Candidate, CloneTarget, ProjectOutcome } from "./projects";
import { parseGitHubUrl, type GitHubUrl } from "./repository";

// Adding one project: inspect a folder or GitHub URL, then select or clone (buzz-add-projects design 'main의 project
// 처리'). First run's session and the Add Projects page each own one; the page's has no session record, completion,
// socket, CLI or MCP.

// Folder work (projects.ts and clone.ts), wired by index.ts.
export interface AdderProjects {
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
}
// Shared by every adder: a CLI or MCP client can still clone through first run's session while the page clones.
export interface ProjectLocks {
  // Per destination parent: a clone directory an adder could not remove. No other is made there until it is gone.
  leftovers: Map<string, string[]>;
  // Canonical destinations of running clones.
  targets: Set<string>;
}
export function projectLocks(): ProjectLocks { return { leftovers: new Map(), targets: new Set() }; }

// The session that records and publishes the adder's operations.
export interface ProjectSession {
  track(kind: FolderKind, requestId: string): Tracked;
  finish(tracked: Tracked, finished: Finished): void;
  changed(): void;
  values(): Iterable<Tracked>;
  reply(op: WriteRequest["op"], operationId: string): OnboardingResponse;
}

// Folder work that ends this fast answers its final state; anything slower answers running and is read with status.
const QUICK_REPLY_MS = 1000;
// Bounded like agent-auth's quit: a clone's group is stopped within about 2.5 s.
const QUIT_WAIT_MS = 5000;
// The most a clone can need: whether the repository brings its own setup is known only after the clone.
const CLONE_CHANGES: OnboardingChange[] = [".doan/canvases/", ".doan/config.json", ".gitattributes"];
// Selection, clone and completion change or save the one project, so only one of them runs at a time.
export const PROJECT_WORK = ["project_select", "project_clone", "complete"] as const;
// What an operation reports when its work threw instead of answering.
const THROWN: Record<"project_inspect" | "project_select" | "project_clone" | "complete", OnboardingOperationErrorCode> = {
  project_inspect: "project_unavailable", project_select: "project_unavailable", project_clone: "clone_failed", complete: "completion_save_failed",
};
export type FolderKind = keyof typeof THROWN;
// Only the newest inspection started in this session can be acted on (design '동일 상태·소유권·재시도'). target is the
// planned clone folder in canonical spelling; the inspection shows the destination as it was asked for.
interface Inspection { generation: number; inspection: OnboardingInspection; repo: GitHubUrl | null; target?: string }
const leftoverMessage = (paths: readonly string[]) => paths.length === 1
  ? `Couldn't remove ${paths[0]}. Remove it, then try again.`
  : `Couldn't remove ${paths.slice(0, -1).join(", ")} and ${paths.at(-1)}. Remove them, then try again.`;

export interface ProjectAdderOptions {
  newId: () => string;
  quickReplyMs?: number;
  // Names the owner in the log when folder work throws.
  label: string;
}

export class ProjectAdder {
  project: OnboardingProject | null = null;
  private inspected = 0;
  private inspection: Inspection | null = null;
  private closing = false;
  private clonesCancelled = 0;
  constructor(private readonly session: ProjectSession, private readonly projects: AdderProjects, private readonly locks: ProjectLocks, private readonly options: ProjectAdderOptions) {}

  get closed(): boolean { return this.closing; }
  // Synchronously when quit is accepted, before any teardown is awaited: no project work starts after it. An abandoned
  // quit reopens.
  closeForQuit(): void { this.closing = true; }
  reopenAfterAbortedQuit(): void { this.closing = false; }
  // Running clones stop and clean up before the app goes (bounded; a timeout is not proof of cleanup).
  async quit(): Promise<void> {
    this.closing = true;
    const work: Promise<void>[] = [];
    for (const tracked of this.session.values()) {
      if (tracked.operation.kind !== "project_clone" || TERMINAL.has(tracked.operation.state)) continue;
      tracked.abort?.abort();
      if (tracked.done) work.push(tracked.done);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.allSettled(work), new Promise(resolve => { timer = setTimeout(resolve, QUIT_WAIT_MS); timer.unref?.(); })]);
    clearTimeout(timer);
  }

  // A running or cleaning clone holds every location change until its processes and directory are gone.
  busy(kinds: readonly OnboardingOperation["kind"][]): boolean {
    return [...this.session.values()].some(t => kinds.includes(t.operation.kind) && !TERMINAL.has(t.operation.state));
  }
  private current(inspectionId: string): Inspection | null {
    const latest = this.inspection;
    return latest && latest.generation === this.inspected && latest.inspection.inspectionId === inspectionId ? latest : null;
  }

  async inspect(request: OnboardingProjectInspectRequest): Promise<OnboardingResponse> {
    if (this.closing || this.busy(["project_clone"])) return refuse("busy");
    // Counted at the start: a newer inspection, from the window or a client, makes this one stale even if it ends last.
    const generation = ++this.inspected;
    const projects = this.projects;
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
      const inspection: OnboardingInspection = { inspectionId: this.options.newId(), candidates: found.candidates };
      if ("destination" in source && source.destination !== undefined) inspection.clone = { destination: source.destination, changes: CLONE_CHANGES };
      // The repository stays with the inspection so select checks the folder's remote again before registering it.
      if (generation === this.inspected) this.inspection = { generation, inspection, repo: source.repo, ...("target" in source && source.target ? { target: source.target } : {}) };
      return { state: "succeeded", inspection };
    });
  }

  async select(request: OnboardingProjectSelectRequest): Promise<OnboardingResponse> {
    if (this.closing || this.busy(PROJECT_WORK)) return refuse("busy");
    const current = this.current(request.inspectionId);
    if (!current) return refuse("inspection_stale");
    const candidate = current.inspection.candidates.find(c => c.path === request.path);
    if (!candidate) return refuse("not_candidate");
    // Setup writes files in the user's folder, so it happens only when asked for (design '고정 명령·도구').
    const initialize = request.initialize === true;
    if (candidate.changes.length > 0 && !initialize) return refuse("initialize_required");
    return this.launch("project_select", request.requestId, async () => this.selected(await this.projects.select(candidate.path, initialize, current.repo)));
  }

  async clone(request: OnboardingProjectCloneRequest): Promise<OnboardingResponse> {
    if (this.closing || this.busy(PROJECT_WORK)) return refuse("busy");
    const current = this.current(request.inspectionId);
    if (!current || !current.repo || !current.target || current.inspection.clone?.destination !== request.destination) return refuse("inspection_stale");
    const cancelled = this.clonesCancelled;
    const destination = await this.projects.destination(request.destination);
    if (destination.state !== "absent") return refuse(destination.state === "exists" ? "destination_exists" : "path_unavailable");
    // Read again after the await, with nothing awaited before the launch: a newer inspection, a parent that now
    // resolves elsewhere, or a cancelClones() meanwhile makes this plan stale.
    if (this.current(request.inspectionId) !== current || destination.path !== current.target || this.clonesCancelled !== cancelled) return refuse("inspection_stale");
    // The other adder may be cloning into the same folder; the destination check cannot see a clone not yet renamed there.
    if (this.closing || this.busy(PROJECT_WORK) || this.locks.targets.has(destination.path)) return refuse("busy");
    const repo = current.repo, target = destination.path, abort = new AbortController(), projects = this.projects, leftovers = this.locks.leftovers;
    this.locks.targets.add(target);
    return this.launch("project_clone", request.requestId, async tracked => {
      try {
        const parent = dirname(target), recorded = leftovers.get(parent);
        if (recorded !== undefined) {
          const gone = new Set((await Promise.all(recorded.map(async path => await projects.present(path) ? [] : [path]))).flat());
          // Read again after the checks: the other adder may have recorded its own leftover here meanwhile.
          const remaining = (leftovers.get(parent) ?? []).filter(path => !gone.has(path));
          if (remaining.length > 0) { leftovers.set(parent, remaining); return { state: "failed", code: "cleanup_failed", message: leftoverMessage(remaining) }; }
          leftovers.delete(parent);
        }
        // D19 (2026-10-29): the rename into the destination publishes the clone. After this commit a cancel returns the
        // running operation unchanged and registration and setup continue: cancelling would delete a folder already in
        // its final place.
        const commit = () => { if (abort.signal.aborted) return false; tracked.committed = true; return true; };
        const result = await projects.clone(repo.url, target, abort.signal, commit);
        if ("cancelled" in result) return { state: "cancelled" };
        if (!result.ok && result.leftovers !== undefined) {
          // Merged, not replaced: the other adder's clone may have failed under the same parent.
          leftovers.set(parent, [...new Set([...leftovers.get(parent) ?? [], ...result.leftovers])]);
          return { state: "failed", code: "cleanup_failed", message: leftoverMessage(result.leftovers) };
        }
        return this.selected(result);
      } finally { this.locks.targets.delete(target); }
    }, abort);
  }

  // Stays running until the clone's processes and temporary directory are gone (cancelling in the contract).
  cancel(tracked: Tracked): void {
    if (!tracked.abort || tracked.committed || tracked.cancelling || TERMINAL.has(tracked.operation.state)) return;
    tracked.cancelling = true;
    tracked.operation = { ...tracked.operation, state: "running", cancelling: true };
    tracked.abort.abort();
    this.session.changed();
  }
  // Also refuses a clone still checking its destination: it has no operation to cancel yet.
  cancelClones(): void {
    this.clonesCancelled += 1;
    for (const tracked of [...this.session.values()]) if (tracked.operation.kind === "project_clone") this.cancel(tracked);
  }

  private selected(outcome: ProjectOutcome): Finished {
    if (!outcome.ok) return { state: "failed", code: outcome.code };
    this.project = { root: outcome.root };
    return { state: "succeeded", project: { root: outcome.root } };
  }

  async launch(kind: FolderKind, requestId: string, work: (tracked: Tracked) => Promise<Finished>, abort?: AbortController): Promise<OnboardingResponse> {
    const tracked = this.session.track(kind, requestId);
    if (abort) tracked.abort = abort;
    const done = work(tracked).catch((error: unknown): Finished => {
      // The work's own error may name paths or tool output; the operation gets a code and a fixed message only.
      console.error(`doan: ${this.options.label} ${kind} failed`, error);
      return { state: "failed", code: THROWN[kind] };
    }).then(finished => this.session.finish(tracked, finished));
    tracked.done = done;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([done, new Promise(resolve => { timer = setTimeout(resolve, this.options.quickReplyMs ?? QUICK_REPLY_MS); })]);
    clearTimeout(timer);
    return this.session.reply(kind, tracked.operation.operationId);
  }
}
