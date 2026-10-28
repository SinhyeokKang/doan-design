import type {
  OnboardingChange, OnboardingOperation, OnboardingOperationErrorCode, OnboardingResponse, OnboardingSocketErrorCode, OnboardingState,
} from "../formats/types";
import type { DoanApi } from "../preload";
import { parseGitHubUrl } from "../main/onboarding/repository";

type Api = Pick<DoanApi, "readOnboardingSession" | "onOnboardingSession" | "inspectOnboardingProject" | "selectOnboardingProject" |
  "cloneOnboardingProject" | "cancelOnboardingOperation" | "completeOnboarding" | "chooseOnboardingFolder">;
export interface ProjectStepDeps {
  api: Api;
  sessionId: string;
  // Registered projects in stored order; the last one names the default clone parent (2026-10-29 user).
  projects(): readonly string[];
  homeDirectory(): string | null;
  requestId(): string;
  changed(): void;
  // Completion saved: Home takes over with this canonical root.
  completed(root: string): void;
}

export type ProjectError = OnboardingOperationErrorCode | OnboardingSocketErrorCode | "access_failed";
// What the Project step shows. Each user action advances `generation`; a result for an older one is dropped.
export type ProjectPhase =
  | { kind: "choose" }
  | { kind: "inspecting"; url: string }
  | { kind: "candidates"; inspectionId: string; url: string | null; candidates: { path: string; changes: OnboardingChange[] }[]; choice: string }
  | { kind: "setup"; inspectionId: string; url: string | null; path: string; changes: OnboardingChange[] }
  | { kind: "selecting"; path: string }
  | { kind: "clone"; url: string; inspectionId: string | null; destination: string }
  | { kind: "cloning"; url: string; destination: string; operationId: string; cancelling: boolean }
  | { kind: "cloneCancelled"; url: string; destination: string }
  | { kind: "ready"; root: string }
  | { kind: "completing"; root: string };
export interface ProjectStepState {
  phase: ProjectPhase;
  url: string;
  // The URL of the last inspection, so an edited URL says it must be checked again.
  inspectedUrl: string | null;
  error: { code: ProjectError; message?: string } | null;
  // The registered project picked in 'Your projects', before it is inspected.
  listChoice: string | null;
}

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const basename = (path: string) => path.replace(/\/+$/, "").split("/").at(-1) ?? path;
const parent = (path: string) => path.replace(/\/+$/, "").split("/").slice(0, -1).join("/") || "/";

// The onboarding Project step over the main session (app-socket v2 DTOs): folder or GitHub URL → inspect → select or
// clone → complete. Main owns every check and write; this keeps only what the screen shows.
export class ProjectStepSession {
  state: ProjectStepState = { phase: { kind: "choose" }, url: "", inspectedUrl: null, error: null, listChoice: null };
  private generation = 0;
  private live = false;
  private stops: (() => void)[] = [];
  private latest: OnboardingState | null = null;
  private waiting = new Map<string, (operation: OnboardingOperation) => void>();
  constructor(private readonly deps: ProjectStepDeps) {}

  start(): void {
    this.live = true;
    this.stops.push(this.deps.api.onOnboardingSession(state => this.received(state)));
  }
  dispose(): void {
    this.live = false;
    for (const stop of this.stops.splice(0)) stop();
    this.waiting.clear();
  }
  // Long work (clone, setup, saving) holds Back and the stepper (design '이동·취소·포커스 계약').
  busy(): boolean { return ["inspecting", "selecting", "cloning", "completing"].includes(this.state.phase.kind); }
  urlValid(): boolean { return parseGitHubUrl(this.state.url) !== null; }

  setUrl(url: string): void { this.set({ url, error: this.state.error?.code === "invalid_url" ? null : this.state.error }); }
  pickListed(path: string): void { this.set({ listChoice: path }); }
  pickCandidate(path: string): void { const p = this.state.phase; if (p.kind === "candidates") this.set({ phase: { ...p, choice: path } }); }
  // Edit repository URL, Choose another folder: back to the first screen, keeping the URL.
  restart(): void { this.fence(); this.set({ phase: { kind: "choose" }, error: null }); }

  async chooseFolder(): Promise<void> {
    if (this.busy()) return;
    const picked = await this.deps.api.chooseOnboardingFolder("project").catch(() => null);
    if (!this.live || picked === null) return;
    await this.inspectPath(picked);
  }
  async useListed(): Promise<void> { if (this.state.listChoice && !this.busy()) await this.inspectPath(this.state.listChoice); }

  async findRepository(): Promise<void> {
    const url = this.state.url.trim();
    if (this.busy()) return;
    if (parseGitHubUrl(url) === null) { this.set({ error: { code: "invalid_url" } }); return; }
    const at = this.fence();
    this.set({ phase: { kind: "inspecting", url }, error: null, inspectedUrl: url });
    const reply = await this.inspect({ url });
    if (!this.current(at)) return;
    if (!reply.ok) { this.failed(reply.code, reply.message, { kind: "choose" }); return; }
    const inspection = reply.operation.inspection!;
    if (inspection.candidates.length > 0) { this.offer(inspection.inspectionId, url, inspection.candidates); return; }
    await this.planClone(url, this.defaultDestination(url), at);
  }
  // Looking for a repository can be left at once: the inspection is read-only, so its late result is dropped.
  cancelInspect(): void { if (this.state.phase.kind === "inspecting") this.restart(); }

  async changeDestination(): Promise<void> {
    const p = this.state.phase;
    if (p.kind !== "clone" && p.kind !== "cloneCancelled") return;
    const picked = await this.deps.api.chooseOnboardingFolder("destination").catch(() => null);
    if (!this.live || picked === null) return;
    await this.planClone(p.url, `${picked.replace(/\/+$/, "")}/${basename(p.destination)}`, this.fence());
  }
  // A destination that already exists may be this repository's checkout: inspect it as a folder.
  async useExisting(): Promise<void> {
    const p = this.state.phase;
    if (p.kind === "clone") await this.inspectPath(p.destination);
  }

  async clone(): Promise<void> {
    const p = this.state.phase;
    if (p.kind === "cloneCancelled") { await this.planClone(p.url, p.destination, this.fence()); return this.clone(); }
    if (p.kind !== "clone" || p.inspectionId === null) return;
    const at = this.fence();
    const reply = await this.call(this.deps.api.cloneOnboardingProject({ sessionId: this.deps.sessionId, requestId: this.deps.requestId(), inspectionId: p.inspectionId, destination: p.destination }));
    if (!this.current(at)) return;
    if (!reply.ok) { this.failed(reply.code, reply.message, p); return; }
    const cloning: ProjectPhase = { kind: "cloning", url: p.url, destination: p.destination, operationId: reply.operation.operationId, cancelling: reply.operation.cancelling === true };
    this.set({ phase: cloning, error: null });
    const done = await this.settled(reply.operation);
    if (!this.current(at)) return;
    if (done.state === "cancelled") this.set({ phase: { kind: "cloneCancelled", url: p.url, destination: p.destination } });
    else if (done.state === "succeeded" && done.project) this.set({ phase: { kind: "ready", root: done.project.root }, error: null });
    else this.failed(done.error?.code ?? "clone_failed", done.error?.message, { kind: "clone", url: p.url, inspectionId: null, destination: p.destination });
  }
  async cancelClone(): Promise<void> {
    const p = this.state.phase;
    if (p.kind !== "cloning" || p.cancelling) return;
    this.set({ phase: { ...p, cancelling: true } });
    await this.deps.api.cancelOnboardingOperation({ sessionId: this.deps.sessionId, requestId: this.deps.requestId(), operationId: p.operationId }).catch(() => null);
  }

  // Use this folder (one or several candidates) and Set up and continue.
  async select(initialize = false): Promise<void> {
    const p = this.state.phase;
    let inspectionId: string, path: string, changes: OnboardingChange[], url: string | null;
    if (p.kind === "candidates") {
      const candidate = p.candidates.find(c => c.path === p.choice);
      if (!candidate) return;
      ({ inspectionId, url } = p); ({ path, changes } = candidate);
    } else if (p.kind === "setup") ({ inspectionId, url, path, changes } = p);
    else return;
    // Setup writes files in the user's folder, so it needs this explicit step (design '고정 명령·도구').
    if (changes.length > 0 && !initialize) { this.set({ phase: { kind: "setup", inspectionId, url, path, changes }, error: null }); return; }
    const at = this.fence();
    const back = this.state.phase;
    this.set({ phase: { kind: "selecting", path }, error: null });
    const reply = await this.call(this.deps.api.selectOnboardingProject({ sessionId: this.deps.sessionId, requestId: this.deps.requestId(), inspectionId, path, ...(initialize ? { initialize: true } : {}) }));
    if (!this.current(at)) return;
    if (!reply.ok) { this.failed(reply.code, reply.message, back); return; }
    const done = await this.settled(reply.operation);
    if (!this.current(at)) return;
    if (done.state === "succeeded" && done.project) this.set({ phase: { kind: "ready", root: done.project.root }, error: null });
    else this.failed(done.error?.code ?? "project_unavailable", done.error?.message, back);
  }

  // Open doan, and Retry after a failed save: main re-reads and saves only; nothing is selected or cloned again.
  async complete(): Promise<void> {
    const p = this.state.phase;
    if (p.kind !== "ready") return;
    const at = this.fence();
    this.set({ phase: { kind: "completing", root: p.root }, error: null });
    const reply = await this.call(this.deps.api.completeOnboarding({ sessionId: this.deps.sessionId, requestId: this.deps.requestId() }));
    if (!this.current(at)) return;
    if (!reply.ok) { this.failed(reply.code, reply.message, p); return; }
    const done = await this.settled(reply.operation);
    if (!this.current(at)) return;
    if (done.state === "succeeded") { this.deps.completed(done.project?.root ?? p.root); return; }
    this.failed(done.error?.code ?? "completion_save_failed", done.error?.message, p);
  }

  // Retry repeats the action the error belongs to.
  async retry(): Promise<void> {
    const code = this.state.error?.code, p = this.state.phase;
    if (p.kind === "ready" && code !== "completion_unsupported_version") return this.complete();
    if (p.kind === "clone" && p.inspectionId === null) { await this.planClone(p.url, p.destination, this.fence()); if (this.state.phase.kind === "clone" && !this.state.error) return this.clone(); return; }
    if (p.kind === "clone" || p.kind === "cloneCancelled") return this.clone();
    if (p.kind === "setup") return this.select(true);
    if (p.kind === "candidates") return this.select();
    return this.findRepository();
  }

  private async inspectPath(path: string): Promise<void> {
    const at = this.fence();
    this.set({ phase: { kind: "selecting", path }, error: null });
    const reply = await this.inspect({ path });
    if (!this.current(at)) return;
    if (!reply.ok) { this.failed(reply.code, reply.message, { kind: "choose" }); return; }
    const inspection = reply.operation.inspection!;
    if (inspection.candidates.length === 0) { this.failed("project_unavailable", undefined, { kind: "choose" }); return; }
    this.offer(inspection.inspectionId, null, inspection.candidates);
    // One candidate with nothing to set up goes straight to selection, as Choose folder always did.
    const p = this.state.phase;
    if (p.kind === "candidates" && p.candidates.length === 1 && p.candidates[0]!.changes.length === 0) await this.select();
  }
  private offer(inspectionId: string, url: string | null, candidates: { path: string; changes: OnboardingChange[] }[]): void {
    const first = candidates[0]!;
    if (candidates.length === 1 && first.changes.length > 0) this.set({ phase: { kind: "setup", inspectionId, url, path: first.path, changes: first.changes }, error: null });
    else this.set({ phase: { kind: "candidates", inspectionId, url, candidates, choice: first.path }, error: null });
  }
  private async planClone(url: string, destination: string, at: number): Promise<void> {
    this.set({ phase: { kind: "clone", url, inspectionId: null, destination }, error: null });
    const reply = await this.inspect({ url, destination });
    if (!this.current(at)) return;
    if (!reply.ok) { this.failed(reply.code, reply.message, { kind: "clone", url, inspectionId: null, destination }); return; }
    this.set({ phase: { kind: "clone", url, inspectionId: reply.operation.inspection!.inspectionId, destination }, error: null });
  }
  private defaultDestination(url: string): string {
    const repo = parseGitHubUrl(url)!.repository;
    const last = this.deps.projects().at(-1);
    const home = this.deps.homeDirectory() ?? "/";
    return `${last ? parent(last) : home.replace(/\/+$/, "")}/${repo}`;
  }

  private async inspect(target: { path: string } | { url: string; destination?: string }) {
    const reply = await this.call(this.deps.api.inspectOnboardingProject({ sessionId: this.deps.sessionId, requestId: this.deps.requestId(), ...target }));
    if (!reply.ok) return reply;
    const done = await this.settled(reply.operation);
    if (done.state === "succeeded" && done.inspection) return { ok: true as const, operation: done };
    return { ok: false as const, code: (done.error?.code ?? "project_unavailable") as ProjectError, message: done.error?.message };
  }
  private async call(request: Promise<OnboardingResponse>): Promise<{ ok: true; operation: OnboardingOperation } | { ok: false; code: ProjectError; message?: string }> {
    let reply: OnboardingResponse;
    try { reply = await request; } catch { return { ok: false, code: "bad_request" }; }
    if (!reply.ok) return { ok: false, code: reply.error.code, message: reply.error.message };
    return "operation" in reply.result ? { ok: true, operation: reply.result.operation } : { ok: false, code: "bad_request" };
  }
  // Work that outlives the 1 s reply finishes in a session event; one that already finished may be in the last one.
  private settled(operation: OnboardingOperation): Promise<OnboardingOperation> {
    if (TERMINAL.has(operation.state)) return Promise.resolve(operation);
    const seen = this.latest?.operations.find(o => o.operationId === operation.operationId);
    if (seen && TERMINAL.has(seen.state)) return Promise.resolve(seen);
    return new Promise(resolve => this.waiting.set(operation.operationId, resolve));
  }
  private received(state: OnboardingState): void {
    if (!this.live || state.sessionId !== this.deps.sessionId || (this.latest && state.revision < this.latest.revision)) return;
    this.latest = state;
    for (const operation of state.operations) {
      const p = this.state.phase;
      if (p.kind === "cloning" && p.operationId === operation.operationId && operation.cancelling && !p.cancelling) this.set({ phase: { ...p, cancelling: true } });
      if (!TERMINAL.has(operation.state)) continue;
      const resolve = this.waiting.get(operation.operationId);
      if (resolve) { this.waiting.delete(operation.operationId); resolve(operation); }
    }
  }
  private failed(code: ProjectError, message: string | undefined, phase: ProjectPhase): void {
    // A repository Git could not reach is shown on the first screen with the URL kept (draft 'repository-error').
    if (code === "repository_unreachable") { this.set({ phase: { kind: "choose" }, error: { code: "access_failed" } }); return; }
    this.set({ phase, error: { code, ...(message ? { message } : {}) } });
  }
  private fence(): number { return ++this.generation; }
  private current(at: number): boolean { return this.live && at === this.generation; }
  private set(patch: Partial<ProjectStepState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.changed();
  }
}
