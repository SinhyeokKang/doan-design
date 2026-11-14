import type {
  OnboardingChange, OnboardingOperation, OnboardingOperationErrorCode, OnboardingResponse, OnboardingSocketErrorCode, OnboardingState, OnboardingStorage,
} from "../formats/types";
import type { AddPageResponse, AddPageState, DoanApi } from "../preload";
import type { FolderEntry } from "../main/view";
import type { NewFolderResult } from "../main/index";
import { parseGitHubUrl } from "../main/onboarding/repository";
import { leaveLocked } from "./addProjectsNav";
import { dropFolder } from "./folderDrop";
import { keptLocal } from "./storageRules";

// The session's calls, named after first run's; the Add Projects page passes `addPageApi`, whose replies are the same
// project DTOs over its own main instance.
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
  // Registered projects in stored order; the last one names the default clone parent (2026-10-29 user).
  projects(): readonly string[];
  homeDirectory(): string | null;
  // Whether a registered folder is its repository's main checkout (from the folder list's git facts; no git runs).
  mainCheckout?(path: string): boolean;
  requestId(): string;
  changed(): void;
  // Completion saved (first run) or the project registered (the page): Home takes over with this canonical root.
  completed(root: string): void;
}

// The main checkout's .git is the repository's common directory (a worktree's .git is a file pointing there), read from
// the folder list's git facts without running git.
export function isMainCheckout(entries: readonly FolderEntry[], path: string): boolean {
  const entry = entries.find(candidate => candidate.path === path);
  return entry?.kind === "list" && !!entry.git && (entry.git.main === path || entry.git.common === `${path}/.git`);
}

// New folder's failures are the window's own, like access_failed: main answers them to New folder only, so they are
// not socket codes (app-socket v2) and no CLI reads them.
export type ProjectError = OnboardingOperationErrorCode | OnboardingSocketErrorCode | "access_failed" | "folder_exists" | "folder_inside_project" | "folder_create_failed";
export type ProjectSource = "folder" | "url";
// A candidate as the inspection showed it; storage "local" is set up or planned out of Git (app-socket v2).
export interface ProjectCandidate { path: string; changes: OnboardingChange[]; storage?: "local" }
// What the Project step shows. Each user action advances `generation`; a result for an older one is dropped.
export type ProjectPhase =
  | { kind: "choose" }
  | { kind: "inspecting"; url: string }
  | { kind: "candidates"; inspectionId: string; url: string | null; candidates: ProjectCandidate[]; choice: string }
  | { kind: "setup"; inspectionId: string; url: string | null; path: string; changes: OnboardingChange[]; storage?: "local" }
  // A chosen folder being inspected: nothing is written yet, so it is not 'Setting up'.
  | { kind: "checking"; path: string }
  | { kind: "selecting"; path: string }
  // planned: the storage the clone's inspection was made for, which the clone request restates.
  | { kind: "clone"; url: string; inspectionId: string | null; destination: string; planned?: OnboardingStorage }
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
  // path: the folder whose inspection failed, so a mismatch can name it.
  // detail: the failure's own account main gives the window only (the CLI's message for project_unreadable).
  // source: whether a folder or a URL led to it, which decides where the choose screen shows it. Set by the caller,
  // since the same codes come from both.
  // directory: New folder's existing name is a folder (Use existing folder); project: the Doan project its location
  // is inside.
  error: { code: ProjectError; message?: string; path?: string; detail?: string; source?: ProjectSource; directory?: boolean; project?: string } | null;
  // The registered project picked in 'Your projects', before it is inspected.
  listChoice: string | null;
  // Where the Doan files of a setup or clone go (absent: Include in Git, the default). It outlives a refused or failed
  // setup and a cancelled or failed clone, so the choice stays.
  storage?: OnboardingStorage;
}

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const basename = (path: string) => path.replace(/\/+$/, "").split("/").at(-1) ?? path;
const parent = (path: string) => path.replace(/\/+$/, "").split("/").slice(0, -1).join("/") || "/";
// Where a clone and New folder's save panel go by default: the last registered project's parent, else HOME, else the
// root (2026-10-29 user).
export function defaultProjectParent(projects: readonly string[], home: string | null): string {
  const last = projects.at(-1);
  return last ? parent(last) : (home ?? "/").replace(/\/+$/, "") || "/";
}
// url on a path inspection: a folder chosen for that repository, so main checks its remote.
type Inspect = { path: string; url?: string } | { url: string; destination?: string };
type Reply = { ok: true; operation: OnboardingOperation } | { ok: false; code: ProjectError; message?: string; detail?: string };

// The onboarding Project step over the main session (app-socket v2 DTOs): folder or GitHub URL → inspect → select or
// clone → complete. Main owns every check and write; this keeps only what the screen shows.
export class ProjectStepSession {
  state: ProjectStepState = { phase: { kind: "choose" }, url: "", inspectedUrl: null, error: null, listChoice: null };
  private generation = 0;
  private live = false;
  private stops: (() => void)[] = [];
  private latest: AddPageState | null = null;
  private waiting = new Map<string, (operation: OnboardingOperation) => void>();
  // The user action in flight. A second click while it runs is ignored, so no request can race its reply
  // (POSTMORTEM 2026-10-25 'An older install failure replaced newer feedback'). Edit and Cancel clear it.
  private acting: object | null = null;
  // What Retry repeats: the action whose failure is on screen.
  private again: (() => Promise<void>) | null = null;
  // The native folder sheet is open: the step is busy, but focus belongs to the button that opened it.
  private choosing = false;
  // A refused card drop's notice; the next drag or Choose folder clears it.
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
  // Long work (clone, setup, saving) holds Back and the stepper.
  busy(): boolean { return this.acting !== null || ["inspecting", "checking", "selecting", "cloning", "completing"].includes(this.state.phase.kind); }
  picking(): boolean { return this.choosing; }
  urlValid(): boolean { return parseGitHubUrl(this.state.url) !== null; }

  // A completion refused because no agent was ready no longer applies once one is (POSTMORTEM 2026-10-25).
  agentsReady(ready: boolean): void { if (ready && this.state.error?.code === "no_ready_agent") this.set({ error: null }); }
  // The plan on screen may be for the other mode; Set up and Clone plan again for this one before they write. On the
  // setup screen the plan is made again at once, so the git init line a plan outside Git brings follows the radio. It
  // starts after the current task, so a Set up pressed in the same task plans again first; a plan that now adds .git/
  // waits for another press. A plan that cannot be made keeps the setup screen, with the failure and Retry on it.
  // true: the folder is planned again, which holds the radios meanwhile.
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
  // Edit repository URL: back to the first screen, keeping the URL.
  // The old inspection goes with it, so nothing later re-plans a repository the user has left (batch V defect 1).
  restart(): void { this.fence(); this.acting = null; this.again = null; this.source = null; this.consent = null; this.set({ phase: { kind: "choose" }, error: null }); }
  // A cancelled or failed clone is left through its URL: Back returns there rather than to the Agent step, where
  // Continue would bring the same clone screen back.
  // A setup screen reached from a URL (a checkout that needs setup was picked) is left the same way.
  backToUrl(): boolean { const p = this.state.phase; return p.kind === "cloneCancelled" || (p.kind === "clone" && this.state.error !== null) || (p.kind === "setup" && p.url !== null); }
  // Looking for a repository can be left at once: the inspection is read-only, so its late result is dropped.
  cancelInspect(): void { if (this.state.phase.kind === "inspecting") this.restart(); }

  // Only the choose screen shows the card, and a drop while something runs (a first drop included) is refused.
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
  // New folder: main's save panel opens at the default location; main makes the folder at the path it returns, and a
  // made folder is inspected like a chosen one. Choose another name reopens where the clashing name was; Change
  // location opens at the default again, since the location was the problem.
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
    // The notice sits under the card, in the drop notice's slot, which it takes over.
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
    // First run takes one candidate with nothing to set up at once, as Choose folder always did. The page adds
    // nothing until Add project is pressed.
    const p = this.state.phase;
    if (this.deps.use !== "addPage" && p.kind === "candidates" && p.candidates.length === 1 && p.candidates[0]!.changes.length === 0) await this.runSelect();
  }
  // The inspection each candidate list came from, so a stale one is inspected again rather than retried.
  private source: Inspect | null = null;
  // (2026-10-29 user): a URL with several local checkouts is not a choice. One is taken: a checkout that needs
  // no setup, then the main checkout, then the most recently registered; worktrees are switched later from the shell.
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
  // failure: the screen a failed plan is shown on.
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

  // Consent given on Set up and continue: valid only for that inspection and folder.
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
    // The consent covers the mode on screen: a plan made for the other one is made again first, and the consent moves to
    // the new inspection of the same folder. A project already kept out of Git has no choice to follow.
    const shown: OnboardingStorage = candidate.storage ?? "repo";
    if (initialize && !replanned && !keptLocal(candidate) && shown !== this.storage()) {
      await this.reinspect({ path });
      const next = this.state.phase;
      const same = next.kind === "setup" ? next.path === path : next.kind === "candidates" && next.choice === path;
      // The consent never covers a repository the screen did not show: the new plan stays on screen, with its git init
      // line, for another press.
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
  // A setup that was to create a repository failed: a .git it left behind makes the folder a repository, so the folder
  // is planned again and the git init line goes, while the failure stays on screen. Retry sets up the new plan; the
  // consent carries over only when that plan adds nothing the screen did not show.
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
    // Retry after a cancel or a failure plans the clone again: main keeps one plan per inspection. So does a plan made
    // for the other storage mode than the one now chosen.
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
    // The failure may be shown on the first screen (an unreachable repository), so the clone screen is restored first.
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
      }, () => {});
    }
  }
  private asked = new Set<string>();
  private resolve(operation: OnboardingOperation): void {
    const resolve = this.waiting.get(operation.operationId);
    if (resolve) { this.waiting.delete(operation.operationId); resolve(operation); }
  }
  // source: what led to the failure (a folder or a URL); a failure off the choose screen keeps its screen's place.
  private failed(reply: Reply & { ok: false }, phase: ProjectPhase, again: () => Promise<void>, path?: string, source?: ProjectSource): void {
    this.again = again;
    // A repository Git could not reach is shown on the first screen with the URL kept (draft 'repository-error').
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

// The Project step serves first run and the Add Projects page; what the Project step varies between the two (heading, the 'Your projects' list, notices, actions, surface) depends
// on the use.
export type ProjectUse = "onboarding" | "addPage";
export interface ProjectFooter {
  back: { label: "Back" | "Cancel"; disabled: boolean };
  // action null: nothing to add yet (the page's Add project, disabled). setUp carries the inspection the screen was
  // rendered with, so a press consents to that plan only (ARCHITECTURE §7 'Settings IPC').
  primary: { label: string; action: "select" | "setUp" | "clone" | "complete" | "retry" | null; inspectionId?: string; disabled: boolean } | null;
}

// First run keeps Back and its always-shown primary (Open Doan until the step has an action). The page's Cancel
// returns to the origin and also drops an inspection in flight, so it stays usable; a locked phase has no footer.
// The page submits through one Add project in every unlocked phase, enabled only when there is something to add and
// no error shows. A cancelled clone can still be cloned, so its press clones again.
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

// Where the choose screen shows the notice: a folder's failure under the card (the drop notice's slot), a URL's after
// the URL field. Every other screen keeps its notice in its own place.
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
