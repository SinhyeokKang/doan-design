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
  // operationId is null until main answers; the step is busy from the click on, so nothing races the reply.
  | { kind: "cloning"; url: string; destination: string; operationId: string | null; cancelling: boolean }
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
// url on a path inspection: a folder chosen for that repository, so main checks its remote (D20).
type Inspect = { path: string; url?: string } | { url: string; destination?: string };
type Reply = { ok: true; operation: OnboardingOperation } | { ok: false; code: ProjectError; message?: string };

// The onboarding Project step over the main session (app-socket v2 DTOs): folder or GitHub URL → inspect → select or
// clone → complete. Main owns every check and write; this keeps only what the screen shows.
export class ProjectStepSession {
  state: ProjectStepState = { phase: { kind: "choose" }, url: "", inspectedUrl: null, error: null, listChoice: null };
  private generation = 0;
  private live = false;
  private stops: (() => void)[] = [];
  private latest: OnboardingState | null = null;
  private waiting = new Map<string, (operation: OnboardingOperation) => void>();
  // The user action in flight. A second click while it runs is ignored, so no request can race its reply
  // (POSTMORTEM 2026-10-25 'An older install failure replaced newer feedback'). Edit and Cancel clear it.
  private acting: object | null = null;
  // What Retry repeats: the action whose failure is on screen.
  private again: (() => Promise<void>) | null = null;
  // The native folder sheet is open: the step is busy, but focus belongs to the button that opened it.
  private choosing = false;
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
  busy(): boolean { return this.acting !== null || ["inspecting", "selecting", "cloning", "completing"].includes(this.state.phase.kind); }
  picking(): boolean { return this.choosing; }
  urlValid(): boolean { return parseGitHubUrl(this.state.url) !== null; }

  // A completion refused because no agent was ready no longer applies once one is (POSTMORTEM 2026-10-25).
  agentsReady(ready: boolean): void { if (ready && this.state.error?.code === "no_ready_agent") this.set({ error: null }); }
  setUrl(url: string): void { this.set({ url, error: this.state.error?.code === "invalid_url" ? null : this.state.error }); }
  pickListed(path: string): void { this.set({ listChoice: path }); }
  pickCandidate(path: string): void { const p = this.state.phase; if (p.kind === "candidates") this.set({ phase: { ...p, choice: path } }); }
  // Edit repository URL: back to the first screen, keeping the URL.
  // The old inspection goes with it, so nothing later re-plans a repository the user has left (batch V defect 1).
  restart(): void { this.fence(); this.acting = null; this.again = null; this.source = null; this.consent = null; this.set({ phase: { kind: "choose" }, error: null }); }
  // A cancelled or failed clone is left through its URL: Back returns there rather than to the Agent step, where
  // Continue would bring the same clone screen back.
  backToUrl(): boolean { const p = this.state.phase; return p.kind === "cloneCancelled" || (p.kind === "clone" && this.state.error !== null); }
  // Looking for a repository can be left at once: the inspection is read-only, so its late result is dropped.
  cancelInspect(): void { if (this.state.phase.kind === "inspecting") this.restart(); }

  chooseFolder(): Promise<void> {
    return this.act(async () => {
      const picked = await this.pick("project");
      if (this.live && picked !== null) await this.inspectPath(picked);
    });
  }
  useListed(): Promise<void> { const path = this.state.listChoice; return path ? this.act(() => this.inspectPath(path)) : Promise.resolve(); }
  findRepository(): Promise<void> { return this.act(() => this.inspectUrl()); }
  changeDestination(): Promise<void> {
    return this.act(async () => {
      const p = this.state.phase;
      if (p.kind !== "clone" && p.kind !== "cloneCancelled") return;
      const picked = await this.pick("destination");
      if (this.live && picked !== null) await this.planClone(p.url, `${picked.replace(/\/+$/, "")}/${basename(p.destination)}`, this.fence());
    });
  }
  // A destination that already exists may be this repository's checkout: inspect it as a folder of that repository.
  useExisting(): Promise<void> { const p = this.state.phase; return p.kind === "clone" ? this.act(() => this.inspectPath(p.destination, p.url)) : Promise.resolve(); }
  // Choose existing folder / Choose another folder on the URL screens: the folder must belong to that repository.
  chooseExisting(): Promise<void> {
    const p = this.state.phase;
    const url = p.kind === "clone" || p.kind === "cloneCancelled" ? p.url : p.kind === "candidates" || p.kind === "setup" ? p.url : null;
    if (url === null) return this.chooseFolder();
    return this.act(async () => {
      const picked = await this.pick("project");
      if (this.live && picked !== null) await this.inspectPath(picked, url);
    });
  }
  clone(): Promise<void> { return this.act(() => this.runClone()); }
  // Use this folder (one or several candidates). It never sets a folder up: a candidate with planned changes goes to
  // the setup screen instead.
  select(): Promise<void> { return this.act(() => this.runSelect()); }
  // Set up and continue: the user's consent to write the planned changes, for the inspection that button was shown
  // for (batch V saw a setup once without this click; no path was found, so consent is now an explicit token).
  setUp(inspectionId: string): Promise<void> {
    return this.act(async () => {
      const p = this.state.phase;
      if (p.kind !== "setup" || p.inspectionId !== inspectionId) return;
      this.consent = { inspectionId, path: p.path };
      await this.runSelect();
    });
  }
  // Open doan, and Retry after a failed save: main re-reads and saves only; nothing is selected or cloned again.
  complete(): Promise<void> { return this.act(() => this.runComplete()); }
  retry(): Promise<void> {
    if (this.state.error?.code === "completion_unsupported_version") return Promise.resolve();
    const p = this.state.phase;
    // The access error keeps the URL field editable: an edited URL is looked up as Enter would, and the old
    // inspection and its retry are dropped (batch V re-check). An unchanged URL repeats the failed action.
    if (p.kind === "choose" && this.state.error?.code === "access_failed" && this.state.url.trim() !== this.state.inspectedUrl) { this.again = null; this.source = null; return this.act(() => this.inspectUrl()); }
    const again = this.again ?? (p.kind === "cloneCancelled" || p.kind === "clone" ? () => this.runClone() : () => this.inspectUrl());
    return this.act(again);
  }

  async cancelClone(): Promise<void> {
    const p = this.state.phase;
    if (p.kind !== "cloning" || p.cancelling || p.operationId === null) return;
    this.set({ phase: { ...p, cancelling: true } });
    const reply = await this.call(this.deps.api.cancelOnboardingOperation({ sessionId: this.deps.sessionId, requestId: this.deps.requestId(), operationId: p.operationId }));
    // Main already published the clone (or refused): it runs to its end, so the progress comes back.
    const now = this.state.phase;
    if (now.kind === "cloning" && now.operationId === p.operationId && (!reply.ok || !reply.operation.cancelling) && !TERMINAL.has(reply.ok ? reply.operation.state : "running")) this.set({ phase: { ...now, cancelling: false } });
  }

  private async pick(purpose: "project" | "destination"): Promise<string | null> {
    this.choosing = true;
    try { return await this.deps.api.chooseOnboardingFolder(purpose).catch(() => null); } finally { this.choosing = false; }
  }
  private async act(work: () => Promise<void>): Promise<void> {
    if (this.busy() || !this.live) return;
    const token = {};
    this.acting = token;
    // Retry belongs to the failure on screen; any new action replaces it.
    this.again = null;
    this.deps.changed();
    try { await work(); } finally { if (this.acting === token) { this.acting = null; this.deps.changed(); } }
  }

  private async inspectUrl(): Promise<void> {
    const url = this.state.url.trim();
    if (parseGitHubUrl(url) === null) { this.set({ error: { code: "invalid_url" } }); return; }
    const at = this.fence();
    this.set({ phase: { kind: "inspecting", url }, error: null, inspectedUrl: url });
    const reply = await this.inspect({ url });
    if (!this.current(at)) return;
    if (!reply.ok) { this.failed(reply, { kind: "choose" }, () => this.inspectUrl()); return; }
    const inspection = reply.operation.inspection!;
    if (inspection.candidates.length > 0) { this.offer(inspection.inspectionId, url, inspection.candidates, { url }); return; }
    await this.planClone(url, this.defaultDestination(url), at);
  }
  private async inspectPath(path: string, url?: string): Promise<void> {
    const at = this.fence();
    // From a URL screen a failure (a mismatch above all) stays on that screen, with the URL.
    const back: ProjectPhase = url === undefined ? { kind: "choose" } : this.state.phase;
    this.set({ phase: { kind: "selecting", path }, error: null });
    const source: Inspect = url === undefined ? { path } : { path, url };
    const reply = await this.inspect(source);
    if (!this.current(at)) return;
    if (!reply.ok) { this.failed(reply, back, () => { this.set({ phase: back }); return this.inspectPath(path, url); }); return; }
    const inspection = reply.operation.inspection!;
    if (inspection.candidates.length === 0) { this.failed({ ok: false, code: "project_unavailable" }, back, () => { this.set({ phase: back }); return this.inspectPath(path, url); }); return; }
    this.offer(inspection.inspectionId, url ?? null, inspection.candidates, source);
    // One candidate with nothing to set up goes straight to selection, as Choose folder always did.
    const p = this.state.phase;
    if (p.kind === "candidates" && p.candidates.length === 1 && p.candidates[0]!.changes.length === 0) await this.runSelect();
  }
  // The inspection each candidate list came from, so a stale one is inspected again rather than retried.
  private source: Inspect | null = null;
  private offer(inspectionId: string, url: string | null, candidates: { path: string; changes: OnboardingChange[] }[], source: Inspect): void {
    this.source = source;
    // A new inspection needs its own consent.
    this.consent = null;
    const first = candidates[0]!;
    if (candidates.length === 1 && first.changes.length > 0) this.set({ phase: { kind: "setup", inspectionId, url, path: first.path, changes: first.changes }, error: null });
    else this.set({ phase: { kind: "candidates", inspectionId, url, candidates, choice: first.path }, error: null });
  }
  private async reinspect(keep: { path?: string }): Promise<void> {
    const source = this.source;
    if (!source) return;
    const at = this.fence();
    const reply = await this.inspect(source);
    if (!this.current(at)) return;
    if (!reply.ok) { this.failed(reply, { kind: "choose" }, () => this.reinspect(keep)); return; }
    const inspection = reply.operation.inspection!;
    if (inspection.candidates.length === 0) { this.failed({ ok: false, code: "project_unavailable" }, { kind: "choose" }, () => this.reinspect(keep)); return; }
    this.offer(inspection.inspectionId, "url" in source ? source.url : null, inspection.candidates, source);
    const p = this.state.phase;
    if (p.kind === "candidates" && keep.path && p.candidates.some(c => c.path === keep.path)) this.set({ phase: { ...p, choice: keep.path } });
  }

  // Consent given on Set up and continue: valid only for that inspection and folder.
  private consent: { inspectionId: string; path: string } | null = null;
  private async runSelect(): Promise<void> {
    const p = this.state.phase;
    let inspectionId: string, path: string, changes: OnboardingChange[], url: string | null;
    if (p.kind === "candidates") {
      const candidate = p.candidates.find(c => c.path === p.choice);
      if (!candidate) return;
      ({ inspectionId, url } = p); ({ path, changes } = candidate);
    } else if (p.kind === "setup") ({ inspectionId, url, path, changes } = p);
    else return;
    // Setup writes files in the user's folder, so it needs this explicit step (design '고정 명령·도구').
    const initialize = changes.length > 0 && this.consent?.inspectionId === inspectionId && this.consent.path === path;
    if (changes.length > 0 && !initialize) { this.set({ phase: { kind: "setup", inspectionId, url, path, changes }, error: null }); return; }
    const at = this.fence();
    const back = p;
    this.set({ phase: { kind: "selecting", path }, error: null });
    const reply = await this.call(this.deps.api.selectOnboardingProject({ sessionId: this.deps.sessionId, requestId: this.deps.requestId(), inspectionId, path, ...(initialize ? { initialize: true } : {}) }));
    if (!this.current(at)) return;
    if (!reply.ok && reply.code === "inspection_stale") { this.set({ phase: back }); await this.reinspect({ path }); return; }
    if (!reply.ok) { this.failed(reply, back, () => { this.set({ phase: back }); return this.runSelect(); }); return; }
    const done = await this.settled(reply.operation);
    if (!this.current(at)) return;
    if (done.state === "succeeded" && done.project) { this.consent = null; this.set({ phase: { kind: "ready", root: done.project.root }, error: null }); }
    else this.failed(this.error(done, "project_unavailable"), back, () => { this.set({ phase: back }); return this.runSelect(); });
  }

  private async planClone(url: string, destination: string, at: number): Promise<void> {
    this.set({ phase: { kind: "clone", url, inspectionId: null, destination }, error: null });
    const reply = await this.inspect({ url, destination });
    if (!this.current(at)) return;
    if (!reply.ok) { this.failed(reply, { kind: "clone", url, inspectionId: null, destination }, () => this.planClone(url, destination, this.fence())); return; }
    this.source = { url, destination };
    this.set({ phase: { kind: "clone", url, inspectionId: reply.operation.inspection!.inspectionId, destination }, error: null });
  }
  private async runClone(): Promise<void> {
    let p = this.state.phase;
    // Retry after a cancel or a failure plans the clone again: main keeps one plan per inspection.
    if (p.kind === "cloneCancelled" || (p.kind === "clone" && p.inspectionId === null)) {
      await this.planClone(p.url, p.destination, this.fence());
      p = this.state.phase;
      if (p.kind !== "clone" || p.inspectionId === null || this.state.error) return;
    }
    if (p.kind !== "clone" || p.inspectionId === null) return;
    const { url, destination, inspectionId } = p;
    const at = this.fence();
    this.set({ phase: { kind: "cloning", url, destination, operationId: null, cancelling: false }, error: null });
    const reply = await this.call(this.deps.api.cloneOnboardingProject({ sessionId: this.deps.sessionId, requestId: this.deps.requestId(), inspectionId, destination }));
    if (!this.current(at)) return;
    // The failure may be shown on the first screen (an unreachable repository), so the clone screen is restored first.
    const retryPlan = () => { this.set({ phase: { kind: "clone", url, inspectionId: null, destination }, error: null }); return this.runClone(); };
    if (!reply.ok) { this.failed(reply, { kind: "clone", url, inspectionId: null, destination }, retryPlan); return; }
    this.set({ phase: { kind: "cloning", url, destination, operationId: reply.operation.operationId, cancelling: reply.operation.cancelling === true } });
    const done = await this.settled(reply.operation);
    if (!this.current(at)) return;
    if (done.state === "cancelled") this.set({ phase: { kind: "cloneCancelled", url, destination } });
    else if (done.state === "succeeded" && done.project) this.set({ phase: { kind: "ready", root: done.project.root }, error: null });
    else this.failed(this.error(done, "clone_failed"), { kind: "clone", url, inspectionId: null, destination }, retryPlan);
  }

  private async runComplete(): Promise<void> {
    const p = this.state.phase;
    if (p.kind !== "ready") return;
    const at = this.fence();
    this.set({ phase: { kind: "completing", root: p.root }, error: null });
    const reply = await this.call(this.deps.api.completeOnboarding({ sessionId: this.deps.sessionId, requestId: this.deps.requestId() }));
    if (!this.current(at)) return;
    if (!reply.ok) { this.failed(reply, p, () => this.runComplete()); return; }
    const done = await this.settled(reply.operation);
    if (!this.current(at)) return;
    if (done.state === "succeeded") { this.deps.completed(done.project?.root ?? p.root); return; }
    this.failed(this.error(done, "completion_save_failed"), p, () => this.runComplete());
  }

  private defaultDestination(url: string): string {
    const repo = parseGitHubUrl(url)!.repository;
    const last = this.deps.projects().at(-1);
    const home = this.deps.homeDirectory() ?? "/";
    return `${last ? parent(last) : home.replace(/\/+$/, "")}/${repo}`;
  }
  private async inspect(target: Inspect): Promise<Reply> {
    const reply = await this.call(this.deps.api.inspectOnboardingProject({ sessionId: this.deps.sessionId, requestId: this.deps.requestId(), ...target }));
    if (!reply.ok) return reply;
    const done = await this.settled(reply.operation);
    if (done.state === "succeeded" && done.inspection) return { ok: true, operation: done };
    return this.error(done, "project_unavailable");
  }
  private error(done: OnboardingOperation, fallback: ProjectError): Reply & { ok: false } {
    return { ok: false, code: done.error?.code ?? fallback, ...(done.error?.message ? { message: done.error.message } : {}) };
  }
  private async call(request: Promise<OnboardingResponse>): Promise<Reply> {
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
      if (TERMINAL.has(operation.state)) this.resolve(operation);
    }
    // The published list keeps the latest finished operations only; one retired from it is read by its id, once.
    for (const operationId of this.waiting.keys()) {
      if (state.operations.some(o => o.operationId === operationId) || this.asked.has(operationId)) continue;
      this.asked.add(operationId);
      void this.deps.api.readOnboardingSession({ sessionId: this.deps.sessionId, operationId }).then(reply => {
        if (!reply.ok || !("operations" in reply.result)) return;
        const found = reply.result.operations.find(o => o.operationId === operationId);
        if (found && TERMINAL.has(found.state)) this.resolve(found);
      }, () => {});
    }
  }
  private asked = new Set<string>();
  private resolve(operation: OnboardingOperation): void {
    const resolve = this.waiting.get(operation.operationId);
    if (resolve) { this.waiting.delete(operation.operationId); resolve(operation); }
  }
  private failed(reply: Reply & { ok: false }, phase: ProjectPhase, again: () => Promise<void>): void {
    this.again = again;
    // A repository Git could not reach is shown on the first screen with the URL kept (draft 'repository-error').
    if (reply.code === "repository_unreachable") { this.set({ phase: { kind: "choose" }, error: { code: "access_failed" } }); return; }
    this.set({ phase, error: { code: reply.code, ...(reply.message ? { message: reply.message } : {}) } });
  }
  private fence(): number { return ++this.generation; }
  private current(at: number): boolean { return this.live && at === this.generation; }
  private set(patch: Partial<ProjectStepState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.changed();
  }
}
