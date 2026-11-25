import type {
  OnboardingChange, OnboardingOperation, OnboardingOperationErrorCode, OnboardingResponse, OnboardingSocketErrorCode, OnboardingStorage,
} from "../formats/types";
import type { AddPageResponse, AddPageState, DoanApi } from "../preload";
import type { FolderEntry } from "../main/view";
import type { NewFolderResult } from "../main/index";
import { parseGitHubUrl } from "../main/onboarding/repository";
import { leaveLocked } from "./addProjectsNav";
import { dropFolder } from "./folderDrop";
import { keptLocal } from "./storageRules";

// The Add Projects page passes `addPageApi`, whose replies are the same project DTOs over its own main instance.
type Request<K extends keyof DoanApi> = DoanApi[K] extends (request: infer R) => unknown ? R : never;
interface Api {
  readOnboardingSession(request: { sessionId: string; operationId?: string }): Promise<OnboardingResponse | AddPageResponse>;
  onOnboardingSession(listener: (state: AddPageState) => void): () => void;
  inspectOnboardingProject(request: Request<"inspectOnboardingProject">): Promise<OnboardingResponse | AddPageResponse>;
  selectOnboardingProject(request: Request<"selectOnboardingProject">): Promise<OnboardingResponse | AddPageResponse>;
  cloneOnboardingProject(request: Request<"cloneOnboardingProject">): Promise<OnboardingResponse | AddPageResponse>;
  cancelOnboardingOperation(request: Request<"cancelOnboardingOperation">): Promise<OnboardingResponse | AddPageResponse>;
  completeOnboarding(request: Request<"completeOnboarding">): Promise<OnboardingResponse | AddPageResponse>;
  chooseOnboardingFolder(purpose: "project" | "destination"): Promise<string | null>;
  newOnboardingFolder(parent: string, token: string): Promise<NewFolderResult>;
  cancelOnboardingFolder(token: string): Promise<boolean>;
}
type PageCalls = Pick<DoanApi, "readAddPage" | "onAddPageSession" | "inspectAddPageProject" | "selectAddPageProject" | "cloneAddPageProject" | "cancelAddPageOperation" | "chooseOnboardingFolder" | "newOnboardingFolder" | "cancelOnboardingFolder">;
export function addPageApi(doan: PageCalls): Api {
  return {
    readOnboardingSession: request => doan.readAddPage(request),
    onOnboardingSession: listener => doan.onAddPageSession(listener),
    inspectOnboardingProject: request => doan.inspectAddPageProject(request),
    selectOnboardingProject: request => doan.selectAddPageProject(request),
    cloneOnboardingProject: request => doan.cloneAddPageProject(request),
    cancelOnboardingOperation: request => doan.cancelAddPageOperation(request),
    // The page has no completion record; a registered project is handed over at once (`use`).
    completeOnboarding: () => Promise.reject(new Error("The Add Projects page has no completion")),
    chooseOnboardingFolder: purpose => doan.chooseOnboardingFolder(purpose),
    newOnboardingFolder: (parent, token) => doan.newOnboardingFolder(parent, token),
    cancelOnboardingFolder: token => doan.cancelOnboardingFolder(token),
  };
}
export interface ProjectStepDeps {
  api: Api;
  sessionId: string;
  // First run by default; the page skips the ready step and its completion.
  use?: ProjectUse;
  // In stored order; the last one names the default clone parent.
  projects(): readonly string[];
  homeDirectory(): string | null;
  // From the folder list's git facts; no git runs.
  mainCheckout?(path: string): boolean;
  requestId(): string;
  changed(): void;
  completed(root: string): void;
}

// A worktree's .git is a file pointing to the common directory, so the main checkout is the one whose .git is it.
export function isMainCheckout(entries: readonly FolderEntry[], path: string): boolean {
  const entry = entries.find(candidate => candidate.path === path);
  return entry?.kind === "list" && !!entry.git && (entry.git.main === path || entry.git.common === `${path}/.git`);
}

// main answers these to New folder only, so they are not socket codes (app-socket v2) and no CLI reads them.
export type ProjectError = OnboardingOperationErrorCode | OnboardingSocketErrorCode | "access_failed" | "folder_exists" | "folder_inside_project" | "folder_create_failed";
export type ProjectSource = "folder" | "url";
// storage "local" is set up or planned out of Git (app-socket v2).
export interface ProjectCandidate { path: string; changes: OnboardingChange[]; storage?: "local" }
// Each user action advances `generation`; a result for an older one is dropped.
export type ProjectPhase =
  | { kind: "choose" }
  | { kind: "inspecting"; url: string }
  | { kind: "candidates"; inspectionId: string; url: string | null; candidates: ProjectCandidate[]; choice: string }
  | { kind: "setup"; inspectionId: string; url: string | null; path: string; changes: OnboardingChange[]; storage?: "local" }
  // Nothing is written yet, so it is not 'Setting up'.
  | { kind: "checking"; path: string }
  | { kind: "selecting"; path: string }
  // planned: the storage the clone's inspection was made for, which the clone request restates.
  | { kind: "clone"; url: string; inspectionId: string | null; destination: string; planned?: OnboardingStorage }
  // The step is busy from the click on, so nothing races the reply.
  | { kind: "cloning"; url: string; destination: string; operationId: string | null; cancelling: boolean }
  | { kind: "cloneCancelled"; url: string; destination: string }
  | { kind: "ready"; root: string }
  | { kind: "completing"; root: string };
export interface ProjectStepState {
  phase: ProjectPhase;
  url: string;
  // So an edited URL says it must be checked again.
  inspectedUrl: string | null;
  // detail: main's own account, given to the window only. source decides where the choose screen shows it; the caller
  // sets it, since the same codes come from both.
  error: { code: ProjectError; message?: string; path?: string; detail?: string; source?: ProjectSource; directory?: boolean; project?: string } | null;
  listChoice: string | null;
  // Absent: Include in Git. It outlives a refused or failed setup and a cancelled or failed clone, so the choice stays.
  storage?: OnboardingStorage;
}

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const basename = (path: string) => path.replace(/\/+$/, "").split("/").at(-1) ?? path;
const parent = (path: string) => path.replace(/\/+$/, "").split("/").slice(0, -1).join("/") || "/";
// The last registered project's parent, else HOME, else the root.
export function defaultProjectParent(projects: readonly string[], home: string | null): string {
  const last = projects.at(-1);
  return last ? parent(last) : (home ?? "/").replace(/\/+$/, "") || "/";
}
// url on a path inspection: a folder chosen for that repository, so main checks its remote.
type Inspect = { path: string; url?: string } | { url: string; destination?: string };
type Reply = { ok: true; operation: OnboardingOperation } | { ok: false; code: ProjectError; message?: string; detail?: string };

// Main owns every check and write; this keeps only what the screen shows.
export class ProjectStepSession {
  state: ProjectStepState = { phase: { kind: "choose" }, url: "", inspectedUrl: null, error: null, listChoice: null };
  private generation = 0;
  private live = false;
  private stops: (() => void)[] = [];
  private latest: AddPageState | null = null;
  private waiting = new Map<string, (operation: OnboardingOperation) => void>();
  // A second click while it runs is ignored, so no request can race its reply. Edit and Cancel clear it.
  private acting: object | null = null;
  private again: (() => Promise<void>) | null = null;
  // The step is busy, but focus belongs to the button that opened the sheet.
  private choosing = false;
  // The next drag or Choose folder clears it.
  dropNotice: string | null = null;
  constructor(private readonly deps: ProjectStepDeps) {}

  start(): void {
    this.live = true;
    this.stops.push(this.deps.api.onOnboardingSession(state => this.received(state)));
  }
  dispose(): void {
    this.live = false;
    // The step is going with its save panel open: main makes nothing when Create returns.
    if (this.folderRequest !== null) { void this.deps.api.cancelOnboardingFolder(this.folderRequest).catch(() => false); this.folderRequest = null; }
    for (const stop of this.stops.splice(0)) stop();
    this.waiting.clear();
  }
  // Long work holds Back and the stepper.
  busy(): boolean { return this.acting !== null || ["inspecting", "checking", "selecting", "cloning", "completing"].includes(this.state.phase.kind); }
  picking(): boolean { return this.choosing; }
  urlValid(): boolean { return parseGitHubUrl(this.state.url) !== null; }

  // A completion refused because no agent was ready no longer applies once one is.
  agentsReady(ready: boolean): void { if (ready && this.state.error?.code === "no_ready_agent") this.set({ error: null }); }
  // Set up and Clone plan again for this mode before they write; the setup screen re-plans at once, after the current
  // task, so its git init line follows the radio. true: re-planning holds the radios meanwhile.
  setStorage(storage: OnboardingStorage): boolean {
    if (this.busy()) return false;
    this.set({ storage });
    const p = this.state.phase;
    if (p.kind !== "setup" || keptLocal(p) || (p.storage ?? "repo") === storage) return false;
    void Promise.resolve().then(() => this.act(async () => {
      const now = this.state.phase;
      if (now.kind === "setup" && now.inspectionId === p.inspectionId && (now.storage ?? "repo") !== this.storage()) await this.reinspect({ path: now.path }, now);
    }));
    return true;
  }
  private storage(): OnboardingStorage { return this.state.storage ?? "repo"; }
  setUrl(url: string): void { this.set({ url, error: this.state.error?.code === "invalid_url" ? null : this.state.error }); }
  pickListed(path: string): void { this.set({ listChoice: path }); }
  pickCandidate(path: string): void { const p = this.state.phase; if (p.kind === "candidates") this.set({ phase: { ...p, choice: path } }); }
  // The old inspection goes with it, so nothing later re-plans a repository the user has left.
  restart(): void { this.fence(); this.acting = null; this.again = null; this.source = null; this.consent = null; this.set({ phase: { kind: "choose" }, error: null }); }
  // Back returns to the URL rather than to the Agent step, where Continue would bring the same screen back.
  backToUrl(): boolean { const p = this.state.phase; return p.kind === "cloneCancelled" || (p.kind === "clone" && this.state.error !== null) || (p.kind === "setup" && p.url !== null); }
  // The inspection is read-only, so its late result is dropped.
  cancelInspect(): void { if (this.state.phase.kind === "inspecting") this.restart(); }

  // A drop while something runs, a first drop included, is refused.
  canDrop(): boolean { return this.live && this.state.phase.kind === "choose" && !this.busy(); }
  dragStarted(): void { this.clearDropNotice(); }
  drop(items: readonly { isDirectory: boolean; path: string }[]): Promise<void> {
    if (!this.canDrop()) return Promise.resolve();
    const judged = dropFolder(items);
    // The drop notice and a folder's failure share the slot under the card; the later one replaces the earlier.
    if (judged.kind === "notice") { this.dropNotice = judged.text; this.set(this.state.error?.source === "folder" ? { error: null } : {}); return Promise.resolve(); }
    this.clearDropNotice();
    const path = items[judged.index]!.path;
    return this.act(() => this.inspectPath(path));
  }
  private clearDropNotice(): void { if (this.dropNotice !== null) { this.dropNotice = null; this.deps.changed(); } }

  chooseFolder(): Promise<void> {
    this.clearDropNotice();
    return this.act(async () => {
      const picked = await this.pick("project");
      if (this.live && picked !== null) await this.inspectPath(picked);
    });
  }
  // main makes the folder at the path its save panel returns. Change location opens at the default again, since the
  // location was the problem.
  newFolder(): Promise<void> { this.clearDropNotice(); return this.act(() => this.createFolder(this.defaultParent())); }
  chooseAnotherName(): Promise<void> {
    const clash = this.state.error?.code === "folder_exists" ? this.state.error.path : undefined;
    return this.act(() => this.createFolder(clash ? parent(clash) : this.defaultParent()));
  }
  newFolderElsewhere(): Promise<void> { return this.act(() => this.createFolder(this.defaultParent())); }
  useExistingFolder(): Promise<void> {
    const error = this.state.error;
    const path = error?.code === "folder_exists" && error.directory ? error.path : undefined;
    return path ? this.act(() => this.inspectPath(path)) : Promise.resolve();
  }
  useListed(): Promise<void> { const path = this.state.listChoice; return path ? this.act(() => this.inspectPath(path)) : Promise.resolve(); }
  findRepository(): Promise<void> { this.clearDropNotice(); return this.act(() => this.inspectUrl()); }
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
  // The folder must belong to that repository.
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
  // It never sets a folder up: a candidate with planned changes goes to the setup screen instead.
  select(): Promise<void> { return this.act(() => this.runSelect()); }
  // Consent is an explicit token, valid only for the inspection that button was shown for, so a setup never runs
  // without this click.
  setUp(inspectionId: string): Promise<void> {
    return this.act(async () => {
      const p = this.state.phase;
      if (p.kind !== "setup" || p.inspectionId !== inspectionId) return;
      this.consent = { inspectionId, path: p.path };
      await this.runSelect();
    });
  }
  // main re-reads and saves only; nothing is selected or cloned again.
  complete(): Promise<void> { return this.act(() => this.runComplete()); }
  retry(): Promise<void> {
    if (this.state.error?.code === "completion_unsupported_version") return Promise.resolve();
    const p = this.state.phase;
    // An edited URL is looked up as Enter would, dropping the old inspection and its retry; an unchanged URL repeats the
    // failed action.
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
  // A cancelled panel changes nothing, a notice it opened from included. Its answer is dropped once the step is gone.
  private folderRequest: string | null = null;
  private async createFolder(at: string): Promise<void> {
    let made: NewFolderResult;
    const token = this.deps.requestId();
    this.folderRequest = token;
    this.choosing = true;
    try { made = await this.deps.api.newOnboardingFolder(at, token).catch((): NewFolderResult => ({ kind: "cancelled" })); } finally {
      this.choosing = false;
      if (this.folderRequest === token) this.folderRequest = null;
    }
    if (!this.live || made.kind === "cancelled") return;
    if (made.kind === "created") { await this.inspectPath(made.path); return; }
    // The notice takes over the drop notice's slot under the card.
    this.dropNotice = null;
    const code: ProjectError = made.kind === "exists" ? "folder_exists" : made.kind === "inside_project" ? "folder_inside_project" : "folder_create_failed";
    this.set({ error: { code, path: made.path, source: "folder", ...(made.kind === "exists" ? { directory: made.directory } : {}), ...(made.kind === "inside_project" ? { project: made.project } : {}) } });
  }
  private defaultParent(): string { return defaultProjectParent(this.deps.projects(), this.deps.homeDirectory()); }
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
    if (parseGitHubUrl(url) === null) { this.set({ error: { code: "invalid_url", source: "url" } }); return; }
    const at = this.fence();
    this.set({ phase: { kind: "inspecting", url }, error: null, inspectedUrl: url });
    const reply = await this.inspect({ url });
    if (!this.current(at)) return;
    if (!reply.ok) { this.failed(reply, { kind: "choose" }, () => this.inspectUrl(), undefined, "url"); return; }
    const inspection = reply.operation.inspection!;
    if (inspection.candidates.length > 0) { this.offer(inspection.inspectionId, url, inspection.candidates, { url }); return; }
    await this.planClone(url, this.defaultDestination(url), at);
  }
  private async inspectPath(path: string, url?: string): Promise<void> {
    const at = this.fence();
    // From a URL screen a failure (a mismatch above all) stays on that screen, with the URL.
    const back: ProjectPhase = url === undefined ? { kind: "choose" } : this.state.phase;
    this.set({ phase: { kind: "checking", path }, error: null });
    const source: Inspect = url === undefined ? { path } : { path, url };
    const reply = await this.inspect(source);
    if (!this.current(at)) return;
    if (!reply.ok) { this.failed(reply, back, () => { this.set({ phase: back }); return this.inspectPath(path, url); }, path, "folder"); return; }
    const inspection = reply.operation.inspection!;
    if (inspection.candidates.length === 0) { this.failed({ ok: false, code: "project_unavailable" }, back, () => { this.set({ phase: back }); return this.inspectPath(path, url); }, path, "folder"); return; }
    this.offer(inspection.inspectionId, url ?? null, inspection.candidates, source);
    // The page adds nothing until Add project is pressed.
    const p = this.state.phase;
    if (this.deps.use !== "addPage" && p.kind === "candidates" && p.candidates.length === 1 && p.candidates[0]!.changes.length === 0) await this.runSelect();
  }
  // So a stale candidate list is inspected again rather than retried.
  private source: Inspect | null = null;
  // A URL with several local checkouts is not a choice; worktrees are switched later from the shell.
  private pickCheckout(candidates: ProjectCandidate[]): ProjectCandidate {
    const order = this.deps.projects();
    const rank = (c: ProjectCandidate) => [c.changes.length === 0 ? 0 : 1, this.deps.mainCheckout?.(c.path) ? 0 : 1, -order.lastIndexOf(c.path)];
    return [...candidates].sort((a, b) => { const x = rank(a), y = rank(b); return x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]!; })[0]!;
  }
  private offer(inspectionId: string, url: string | null, found: ProjectCandidate[], source: Inspect): void {
    this.source = source;
    // A new inspection needs its own consent.
    this.consent = null;
    const candidates = url !== null && found.length > 1 ? [this.pickCheckout(found)] : found;
    const first = candidates[0]!;
    if (candidates.length === 1 && first.changes.length > 0) this.set({ phase: { kind: "setup", inspectionId, url, path: first.path, changes: first.changes, ...(first.storage ? { storage: first.storage } : {}) }, error: null });
    else this.set({ phase: { kind: "candidates", inspectionId, url, candidates, choice: first.path }, error: null });
  }
  private async reinspect(keep: { path?: string }, failure: ProjectPhase = { kind: "choose" }): Promise<void> {
    const source = this.source;
    if (!source) return;
    const at = this.fence();
    const reply = await this.inspect(source);
    if (!this.current(at)) return;
    const from: ProjectSource = "path" in source ? "folder" : "url";
    if (!reply.ok) { this.failed(reply, failure, () => this.reinspect(keep, failure), undefined, from); return; }
    const inspection = reply.operation.inspection!;
    if (inspection.candidates.length === 0) { this.failed({ ok: false, code: "project_unavailable" }, failure, () => this.reinspect(keep, failure), undefined, from); return; }
    this.offer(inspection.inspectionId, "url" in source ? source.url : null, inspection.candidates, source);
    const p = this.state.phase;
    if (p.kind === "candidates" && keep.path && p.candidates.some(c => c.path === keep.path)) this.set({ phase: { ...p, choice: keep.path } });
  }

  // Valid only for that inspection and folder.
  private consent: { inspectionId: string; path: string } | null = null;
  private async runSelect(replanned = false): Promise<void> {
    const p = this.state.phase;
    let inspectionId: string, url: string | null, candidate: ProjectCandidate;
    if (p.kind === "candidates") {
      const found = p.candidates.find(c => c.path === p.choice);
      if (!found) return;
      ({ inspectionId, url } = p); candidate = found;
    } else if (p.kind === "setup") {
      ({ inspectionId, url } = p); candidate = { path: p.path, changes: p.changes, ...(p.storage ? { storage: p.storage } : {}) };
    } else return;
    const { path, changes } = candidate;
    // Setup writes files in the user's folder, so it needs this explicit step.
    const initialize = changes.length > 0 && this.consent?.inspectionId === inspectionId && this.consent.path === path;
    if (changes.length > 0 && !initialize) { this.set({ phase: { kind: "setup", inspectionId, url, path, changes, ...(candidate.storage ? { storage: candidate.storage } : {}) }, error: null }); return; }
    // A plan made for the other mode is made again first, and the consent moves to the new inspection of the same
    // folder. A project already kept out of Git has no choice to follow.
    const shown: OnboardingStorage = candidate.storage ?? "repo";
    if (initialize && !replanned && !keptLocal(candidate) && shown !== this.storage()) {
      await this.reinspect({ path });
      const next = this.state.phase;
      const same = next.kind === "setup" ? next.path === path : next.kind === "candidates" && next.choice === path;
      // The consent never covers a repository the screen did not show: the new plan stays on screen for another press.
      const planned = next.kind === "setup" ? next.changes : next.kind === "candidates" ? next.candidates.find(c => c.path === path)?.changes ?? [] : [];
      if (planned.includes(".git/") && !changes.includes(".git/")) return;
      if ((next.kind === "setup" || next.kind === "candidates") && same) { this.consent = { inspectionId: next.inspectionId, path }; await this.runSelect(true); }
      return;
    }
    const at = this.fence();
    const back = p;
    this.set({ phase: { kind: "selecting", path }, error: null });
    const reply = await this.call(this.deps.api.selectOnboardingProject({ sessionId: this.deps.sessionId, requestId: this.deps.requestId(), inspectionId, path, ...(initialize ? { initialize: true } : {}), storage: shown }));
    if (!this.current(at)) return;
    if (!reply.ok && reply.code === "inspection_stale") { this.set({ phase: back }); await this.reinspect({ path }); return; }
    if (!reply.ok) { this.failed(reply, back, () => { this.set({ phase: back }); return this.runSelect(); }); return; }
    const done = await this.settled(reply.operation);
    if (!this.current(at)) return;
    if (done.state === "succeeded" && done.project) { this.consent = null; this.registered(done.project.root); }
    else if (changes.includes(".git/")) await this.rereadAfter(this.error(done, "project_unavailable"), back, path, changes);
    else this.failed(this.error(done, "project_unavailable"), back, () => { this.set({ phase: back }); return this.runSelect(); });
  }
  // A .git the failed setup left behind makes the folder a repository, so it is planned again. The consent carries over
  // only when the new plan adds nothing the screen did not show.
  private async rereadAfter(failure: Reply & { ok: false }, back: ProjectPhase, path: string, shown: readonly OnboardingChange[]): Promise<void> {
    await this.reinspect({ path });
    const next = this.state.phase;
    if (next.kind !== "setup" || next.path !== path) { this.failed(failure, back, () => { this.set({ phase: back }); return this.runSelect(); }); return; }
    if (next.changes.every(change => shown.includes(change))) this.consent = { inspectionId: next.inspectionId, path };
    this.failed(failure, next, () => { this.set({ phase: next }); return this.runSelect(); });
  }

  private async planClone(url: string, destination: string, at: number): Promise<void> {
    this.set({ phase: { kind: "clone", url, inspectionId: null, destination }, error: null });
    const reply = await this.inspect({ url, destination });
    if (!this.current(at)) return;
    if (!reply.ok) { this.failed(reply, { kind: "clone", url, inspectionId: null, destination }, () => this.planClone(url, destination, this.fence())); return; }
    this.source = { url, destination };
    const planned = reply.operation.inspection!.clone?.storage ?? "repo";
    this.set({ phase: { kind: "clone", url, inspectionId: reply.operation.inspection!.inspectionId, destination, planned }, error: null });
  }
  private async runClone(): Promise<void> {
    let p = this.state.phase;
    // main keeps one plan per inspection, so Retry after a cancel or a failure plans the clone again, as does a plan for
    // the other storage mode.
    if (p.kind === "cloneCancelled" || (p.kind === "clone" && (p.inspectionId === null || (p.planned ?? "repo") !== this.storage()))) {
      await this.planClone(p.url, p.destination, this.fence());
      p = this.state.phase;
      if (p.kind !== "clone" || p.inspectionId === null || this.state.error) return;
    }
    if (p.kind !== "clone" || p.inspectionId === null) return;
    const { url, destination, inspectionId } = p;
    const at = this.fence();
    this.set({ phase: { kind: "cloning", url, destination, operationId: null, cancelling: false }, error: null });
    const reply = await this.call(this.deps.api.cloneOnboardingProject({ sessionId: this.deps.sessionId, requestId: this.deps.requestId(), inspectionId, destination, storage: p.planned ?? "repo" }));
    if (!this.current(at)) return;
    // The failure may be shown on the first screen, so the clone screen is restored first.
    const retryPlan = () => { this.set({ phase: { kind: "clone", url, inspectionId: null, destination }, error: null }); return this.runClone(); };
    if (!reply.ok) { this.failed(reply, { kind: "clone", url, inspectionId: null, destination }, retryPlan); return; }
    this.set({ phase: { kind: "cloning", url, destination, operationId: reply.operation.operationId, cancelling: reply.operation.cancelling === true } });
    const done = await this.settled(reply.operation);
    if (!this.current(at)) return;
    if (done.state === "cancelled") this.set({ phase: { kind: "cloneCancelled", url, destination } });
    else if (done.state === "succeeded" && done.project) this.registered(done.project.root);
    else this.failed(this.error(done, "clone_failed"), { kind: "clone", url, inspectionId: null, destination }, retryPlan);
  }

  private registered(root: string): void {
    if (this.deps.use === "addPage") { this.deps.completed(root); return; }
    this.set({ phase: { kind: "ready", root }, error: null });
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
    return `${this.defaultParent().replace(/\/+$/, "")}/${repo}`;
  }
  private async inspect(target: Inspect): Promise<Reply> {
    // Always with storage: this app's own window speaks the field, so the reply shows which candidates are out of Git.
    const reply = await this.call(this.deps.api.inspectOnboardingProject({ sessionId: this.deps.sessionId, requestId: this.deps.requestId(), ...target, storage: this.storage() }));
    if (!reply.ok) return reply;
    const done = await this.settled(reply.operation);
    if (done.state === "succeeded" && done.inspection) return { ok: true, operation: done };
    return this.error(done, "project_unavailable");
  }
  private error(done: OnboardingOperation, fallback: ProjectError): Reply & { ok: false } {
    return { ok: false, code: done.error?.code ?? fallback, ...(done.error?.message ? { message: done.error.message } : {}), ...(done.error?.detail ? { detail: done.error.detail } : {}) };
  }
  private async call(request: Promise<OnboardingResponse | AddPageResponse>): Promise<Reply> {
    let reply: OnboardingResponse | AddPageResponse;
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
  private received(state: AddPageState): void {
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
        // A rejected read is asked again on the next published state; otherwise the step would wait on it forever.
      }, () => { this.asked.delete(operationId); });
    }
  }
  private asked = new Set<string>();
  private resolve(operation: OnboardingOperation): void {
    const resolve = this.waiting.get(operation.operationId);
    if (resolve) { this.waiting.delete(operation.operationId); resolve(operation); }
  }
  // A failure off the choose screen keeps its screen's place.
  private failed(reply: Reply & { ok: false }, phase: ProjectPhase, again: () => Promise<void>, path?: string, source?: ProjectSource): void {
    this.again = again;
    // Shown on the first screen with the URL kept.
    if (reply.code === "repository_unreachable") { this.set({ phase: { kind: "choose" }, error: { code: "access_failed", source: "url" } }); return; }
    if (source === "folder") this.dropNotice = null;
    this.set({ phase, error: { code: reply.code, ...(reply.message ? { message: reply.message } : {}), ...(path ? { path } : {}), ...(reply.detail ? { detail: reply.detail } : {}), ...(source ? { source } : {}) } });
  }
  private fence(): number { return ++this.generation; }
  private current(at: number): boolean { return this.live && at === this.generation; }
  private set(patch: Partial<ProjectStepState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.changed();
  }
}

export type ProjectUse = "onboarding" | "addPage";
export interface ProjectFooter {
  back: { label: "Back" | "Cancel"; disabled: boolean };
  // setUp carries the inspection the screen was rendered with, so a press consents to that plan only
  // (ARCHITECTURE §7 'Settings IPC').
  primary: { label: string; action: "select" | "setUp" | "clone" | "complete" | "retry" | null; inspectionId?: string; disabled: boolean } | null;
}

// The page's Cancel also drops an inspection in flight, so it stays usable; a locked phase has no footer. A cancelled
// clone can still be cloned, so its press clones again.
export function projectFooter(use: ProjectUse, state: ProjectStepState, { busy, agentReady }: { busy: boolean; agentReady: boolean }): ProjectFooter | null {
  const p = state.phase, error = state.error;
  const clone = (label: string) => ({ label, action: "clone" as const, disabled: busy || p.kind !== "clone" || p.inspectionId === null || error !== null });
  const select = { label: "Use this folder", action: "select" as const, disabled: busy };
  if (use === "addPage") {
    if (leaveLocked(p)) return null;
    const off = busy || error !== null;
    const label = "Add project";
    const primary = p.kind === "candidates" ? { label, action: "select" as const, disabled: off }
      : p.kind === "setup" ? { label, action: "setUp" as const, inspectionId: p.inspectionId, disabled: off }
      : p.kind === "clone" ? { label, action: "clone" as const, disabled: off || p.inspectionId === null }
      : p.kind === "cloneCancelled" ? { label, action: "clone" as const, disabled: off }
      : { label, action: null, disabled: true };
    return { back: { label: "Cancel", disabled: false }, primary };
  }
  const primary = p.kind === "candidates" ? select
    : p.kind === "clone" || p.kind === "cloning" || p.kind === "cloneCancelled" ? clone("Clone and continue")
    : (p.kind === "ready" || p.kind === "completing") && error?.code === "completion_save_failed" ? { label: "Retry", action: "retry" as const, disabled: busy }
    : { label: "Open Doan", action: "complete" as const, disabled: busy || !((p.kind === "ready" || p.kind === "completing") && agentReady && error?.code !== "completion_unsupported_version") };
  return { back: { label: "Back", disabled: busy }, primary };
}

// Every other screen keeps its notice in its own place.
export function projectNoticeSlot(state: ProjectStepState): "card" | "url" | "screen" | null {
  if (!state.error) return null;
  if (state.phase.kind !== "choose" && state.phase.kind !== "inspecting") return "screen";
  return state.error.source === "folder" ? "card" : "url";
}

// Adding a project needs no agent, so the page never shows first run's no-agent notice.
export function projectNoticeCode(use: ProjectUse, state: ProjectStepState, agentReady: boolean): ProjectError | null {
  if (use === "addPage") return state.error && state.error.code !== "no_ready_agent" ? state.error.code : null;
  return state.error?.code ?? (!agentReady && state.phase.kind === "ready" ? "no_ready_agent" : null);
}
