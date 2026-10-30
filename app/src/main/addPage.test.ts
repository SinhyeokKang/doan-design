import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { OnboardingChange, OnboardingOperation, OnboardingResponse } from "../formats/types";
import { validateOnboardingResponse } from "../formats/validate";
import type { LsTarget } from "./cli";
import type { FolderState } from "./folderState";
import type { ProjectInitResult } from "./shell";
import { AddPageSession, ADD_PAGE_CHANNELS, type AddPageResponse, type AddPageState } from "./addPage";
import { addPageRequest, type AddPageOp } from "./addPageRequest";
import { readGitRemotes } from "./onboarding/gitConfig";
import { projectLocks, type AdderProjects, type ProjectLocks } from "./onboarding/projectAdder";
import { canonicalFolder, cloneDestination, cloneProject, inspectPath, inspectUrl, leftoverPresent, selectProject, type ProjectDeps } from "./onboarding/projects";
import { OnboardingService, type OnboardingProjects } from "./onboarding/service";

// Remote checks read .git/config; a git process here would run the repository's fsmonitor, hooks and filters.
vi.mock("node:child_process", () => ({ spawn: () => { throw new Error("git must not run"); }, execFile: () => { throw new Error("git must not run"); } }));

let ids = 0;
const newId = () => `id-${++ids}`;
const URL = "https://github.com/acme/studio";
const OTHER = "https://github.com/acme/other";

// A clone that holds until released, so cancel, quit and the shared locks can be seen while it runs. commit: the
// clone publishes itself (D19) before it waits.
interface Held { url: string; destination: string; signal: AbortSignal; release(): void }
function fakeProjects(options: { commit?: boolean } = {}) {
  const held: Held[] = [];
  const projects = {
    folder: vi.fn(async (path: string) => path),
    destination: vi.fn(async (path: string) => path.startsWith("/taken") ? { state: "exists" as const } : { state: "absent" as const, path }),
    present: vi.fn(async () => true),
    inspectPath: vi.fn(async (path: string) => ({ ok: true as const, candidates: [{ path, changes: [] as OnboardingChange[] }] })),
    inspectUrl: vi.fn(async () => []),
    select: vi.fn(async (path: string) => ({ ok: true as const, root: path })),
    clone: vi.fn(async (url: string, destination: string, signal: AbortSignal, commit: () => boolean) => {
      if (options.commit) commit();
      await new Promise<void>(resolve => { held.push({ url, destination, signal, release: resolve }); signal.addEventListener("abort", () => resolve()); });
      if (signal.aborted && !options.commit) return { ok: false as const, cancelled: true as const };
      if (!options.commit && !commit()) return { ok: false as const, cancelled: true as const };
      return { ok: true as const, root: destination };
    }),
  } satisfies AdderProjects;
  return { projects, held };
}

function page(projects: AdderProjects, locks: ProjectLocks = projectLocks()) {
  const published: AddPageState[] = [];
  const session = new AddPageSession({ projects, locks, publish: state => published.push(state), newId, quickReplyMs: 50 });
  const ask = async (op: AddPageOp, value: Record<string, unknown>): Promise<AddPageResponse> => {
    const request = addPageRequest(op, op === "read" ? value : { sessionId: session.sessionId, requestId: newId(), ...value });
    expect(request, JSON.stringify([op, value])).not.toBeNull();
    const reply = await session.answer(request!);
    // Write replies are the onboarding session's DTOs, so the renderer's Project step reads them unchanged.
    if (op !== "read") expect(validateOnboardingResponse(reply), JSON.stringify(validateOnboardingResponse.errors ?? reply)).toBe(true);
    return reply;
  };
  return { session, published, ask };
}

function onboarding(projects: AdderProjects, locks: ProjectLocks) {
  const full: OnboardingProjects = { ...projects, confirm: async root => ({ ok: true, root }), saveCompletion: () => ({ ok: true }) };
  const service = new OnboardingService({ auth: null, mainOwner: () => null, completed: () => false, publish: () => {}, projects: full, locks, newId, quickReplyMs: 50 });
  const ask = (request: Record<string, unknown>) => service.answer({ v: 2, token: "", sessionId: service.sessionId, requestId: newId(), ...request } as never);
  return { service, ask };
}

function operation(reply: AddPageResponse | OnboardingResponse): OnboardingOperation {
  if (!reply.ok || !("operation" in reply.result)) throw new Error(`no operation: ${JSON.stringify(reply)}`);
  return reply.result.operation;
}
function refusal(reply: AddPageResponse | OnboardingResponse): string {
  if (reply.ok) throw new Error(`not refused: ${JSON.stringify(reply)}`);
  return reply.error.code;
}
function inspectionId(reply: AddPageResponse | OnboardingResponse): string {
  const id = operation(reply).inspection?.inspectionId;
  if (!id) throw new Error(`no inspection: ${JSON.stringify(reply)}`);
  return id;
}
function settled(session: AddPageSession, operationId: string): Promise<OnboardingOperation> {
  return vi.waitFor(() => {
    const found = session.state().operations.find(o => o.operationId === operationId);
    if (!found || !["succeeded", "failed", "cancelled"].includes(found.state)) throw new Error("running");
    return found;
  });
}
function onboardingSettled(service: OnboardingService, operationId: string): Promise<OnboardingOperation> {
  return vi.waitFor(() => {
    const found = service.snapshot().operations.find(o => o.operationId === operationId);
    if (!found || !["succeeded", "failed", "cancelled"].includes(found.state)) throw new Error("running");
    return found;
  });
}

describe("the page's session", () => {
  test("channels are its own, never the onboarding session's", () => {
    expect(Object.values(ADD_PAGE_CHANNELS).every(channel => channel.startsWith("add-projects:"))).toBe(true);
    expect(Object.keys(ADD_PAGE_CHANNELS).sort()).toEqual(["cancel", "changed", "clone", "inspect", "open", "read", "select"]);
  });

  test("reads its state and publishes every change with a newer revision", async () => {
    const { projects } = fakeProjects();
    const p = page(projects);
    const first = await p.ask("read", {});
    expect(first).toEqual({ v: 2, ok: true, op: "status", result: { sessionId: p.session.sessionId, revision: 0, project: null, operations: [] } });
    const inspected = operation(await p.ask("inspect", { path: "/work/studio" }));
    expect(inspected).toMatchObject({ kind: "project_inspect", state: "succeeded", inspection: { candidates: [{ path: "/work/studio", changes: [] }] } });
    expect(p.published.length).toBeGreaterThan(0);
    expect(p.published.every((state, i) => i === 0 || state.revision > p.published[i - 1]!.revision)).toBe(true);
    expect(p.published.at(-1)!.operations.map(o => o.operationId)).toEqual([inspected.operationId]);
    expect(Object.keys(p.published.at(-1)!).sort()).toEqual(["operations", "project", "revision", "sessionId"]);
  });

  test("a read names its session; another session's read is stale", async () => {
    const { projects } = fakeProjects();
    const p = page(projects);
    const inspected = operation(await p.ask("inspect", { path: "/work/studio" }));
    const read = await p.session.answer(addPageRequest("read", { sessionId: p.session.sessionId, operationId: inspected.operationId })!);
    expect(read.ok && "operations" in read.result && read.result.operations).toEqual([inspected]);
    expect(refusal(await p.session.answer(addPageRequest("read", { sessionId: "other" })!))).toBe("session_stale");
    expect(refusal(await p.session.answer(addPageRequest("read", { sessionId: p.session.sessionId, operationId: "missing" })!))).toBe("operation_not_found");
    expect(refusal(await p.session.answer(addPageRequest("inspect", { sessionId: "other", requestId: "r", path: "/a" })!))).toBe("session_stale");
  });

  test("a resent request gets its first answer; the same id with other arguments conflicts", async () => {
    const { projects } = fakeProjects();
    const p = page(projects);
    const request = addPageRequest("inspect", { sessionId: p.session.sessionId, requestId: "same", path: "/work/studio" })!;
    const first = operation(await p.session.answer(request));
    const again = operation(await p.session.answer(request));
    expect(again.operationId).toBe(first.operationId);
    expect(projects.inspectPath).toHaveBeenCalledOnce();
    expect(refusal(await p.session.answer(addPageRequest("inspect", { sessionId: p.session.sessionId, requestId: "same", path: "/work/other" })!))).toBe("request_conflict");
  });

  test("only the newest inspection's candidates can be selected", async () => {
    const { projects } = fakeProjects();
    projects.inspectPath.mockResolvedValue({ ok: true, candidates: [{ path: "/work/studio", changes: [".doan/config.json"] }] });
    const p = page(projects);
    const older = inspectionId(await p.ask("inspect", { path: "/work/studio" }));
    expect(refusal(await p.ask("select", { inspectionId: older, path: "/work/elsewhere" }))).toBe("not_candidate");
    expect(refusal(await p.ask("select", { inspectionId: older, path: "/work/studio" }))).toBe("initialize_required");
    const newer = inspectionId(await p.ask("inspect", { path: "/work/studio" }));
    expect(refusal(await p.ask("select", { inspectionId: older, path: "/work/studio", initialize: true }))).toBe("inspection_stale");
    expect(operation(await p.ask("select", { inspectionId: newer, path: "/work/studio", initialize: true }))).toMatchObject({ state: "succeeded", project: { root: "/work/studio" } });
    expect(projects.select).toHaveBeenCalledExactlyOnceWith("/work/studio", true, null);
    expect(p.session.state().project).toEqual({ root: "/work/studio" });
  });

  test("an invalid destination and a busy clone are refused like onboarding", async () => {
    const { projects, held } = fakeProjects();
    const p = page(projects);
    expect(refusal(await p.ask("inspect", { url: URL, destination: "/taken/studio" }))).toBe("destination_exists");
    const plan = inspectionId(await p.ask("inspect", { url: URL, destination: "/work/studio" }));
    const cloning = operation(await p.ask("clone", { inspectionId: plan, destination: "/work/studio" }));
    expect(cloning).toMatchObject({ kind: "project_clone", state: "running" });
    expect(refusal(await p.ask("inspect", { path: "/work/a" }))).toBe("busy");
    expect(refusal(await p.ask("clone", { inspectionId: plan, destination: "/work/studio" }))).toBe("busy");
    held[0]!.release();
    expect(await settled(p.session, cloning.operationId)).toMatchObject({ state: "succeeded", project: { root: "/work/studio" } });
  });

  test("Cancel stops the clone; it stays running and cancelling until the clone has cleaned up", async () => {
    const { projects, held } = fakeProjects();
    const p = page(projects);
    const plan = inspectionId(await p.ask("inspect", { url: URL, destination: "/work/studio" }));
    const cloning = operation(await p.ask("clone", { inspectionId: plan, destination: "/work/studio" }));
    const cancel = operation(await p.ask("cancel", { operationId: cloning.operationId }));
    expect(held[0]!.signal.aborted).toBe(true);
    expect(cancel.operationId).toBe(cloning.operationId);
    expect(["running", "cancelled"]).toContain(cancel.state);
    expect(await settled(p.session, cloning.operationId)).toMatchObject({ state: "cancelled" });
    expect(refusal(await p.ask("cancel", { operationId: "missing" }))).toBe("operation_not_found");
  });
});

describe("two instances: onboarding and the page", () => {
  test("share per-parent leftovers: neither clones into a parent the other could not clean", async () => {
    const locks = projectLocks();
    const first = fakeProjects();
    first.projects.clone.mockResolvedValueOnce({ ok: false, code: "cleanup_failed", leftovers: ["/work/.studio.doan-clone-1"] } as never);
    const o = onboarding(first.projects, locks);
    const plan = inspectionId(await o.ask({ op: "project_inspect", url: URL, destination: "/work/studio" }));
    const failed = await onboardingSettled(o.service, operation(await o.ask({ op: "project_clone", inspectionId: plan, destination: "/work/studio" })).operationId);
    expect(failed).toMatchObject({ state: "failed", error: { code: "cleanup_failed" } });

    const second = fakeProjects();
    const p = page(second.projects, locks);
    const other = inspectionId(await p.ask("inspect", { url: OTHER, destination: "/work/other" }));
    const refused = await settled(p.session, operation(await p.ask("clone", { inspectionId: other, destination: "/work/other" })).operationId);
    expect(refused).toMatchObject({ state: "failed", error: { code: "cleanup_failed", message: "Couldn't remove /work/.studio.doan-clone-1. Remove it, then try again." } });
    expect(second.projects.present).toHaveBeenCalledWith("/work/.studio.doan-clone-1");
    expect(second.projects.clone).not.toHaveBeenCalled();

    // Gone now: the record clears for both, and the page clones.
    second.projects.present.mockResolvedValue(false);
    const cloning = operation(await p.ask("clone", { inspectionId: other, destination: "/work/other" }));
    await vi.waitFor(() => expect(second.held).toHaveLength(1));
    second.held[0]!.release();
    expect(await settled(p.session, cloning.operationId)).toMatchObject({ state: "succeeded" });
    expect(locks.leftovers.has("/work")).toBe(false);
  });

  test("share the clone target: a second clone to the same folder is busy, another folder is not", async () => {
    const locks = projectLocks();
    const first = fakeProjects(), second = fakeProjects();
    const o = onboarding(first.projects, locks);
    const p = page(second.projects, locks);
    const plan = inspectionId(await o.ask({ op: "project_inspect", url: URL, destination: "/work/studio" }));
    const running = operation(await o.ask({ op: "project_clone", inspectionId: plan, destination: "/work/studio" }));
    await vi.waitFor(() => expect(first.held).toHaveLength(1));

    const same = inspectionId(await p.ask("inspect", { url: URL, destination: "/work/studio" }));
    expect(refusal(await p.ask("clone", { inspectionId: same, destination: "/work/studio" }))).toBe("busy");
    expect(second.projects.clone).not.toHaveBeenCalled();
    const other = inspectionId(await p.ask("inspect", { url: OTHER, destination: "/work/other" }));
    const parallel = operation(await p.ask("clone", { inspectionId: other, destination: "/work/other" }));
    await vi.waitFor(() => expect(second.held).toHaveLength(1));

    // The page holding a target refuses onboarding the same way.
    first.held[0]!.release();
    await onboardingSettled(o.service, running.operationId);
    const back = inspectionId(await o.ask({ op: "project_inspect", url: OTHER, destination: "/work/other" }));
    expect(refusal(await o.ask({ op: "project_clone", inspectionId: back, destination: "/work/other" }))).toBe("busy");

    second.held[0]!.release();
    await settled(p.session, parallel.operationId);
    expect(locks.targets.size).toBe(0);
    // Released once the clone ended: the target can be planned and cloned again.
    const again = inspectionId(await p.ask("inspect", { url: URL, destination: "/work/studio" }));
    expect(operation(await p.ask("clone", { inspectionId: again, destination: "/work/studio" }))).toMatchObject({ kind: "project_clone" });
    await vi.waitFor(() => expect(second.held).toHaveLength(2));
    second.held[1]!.release();
  });

  test("quit stops and cleans up both instances' clones, and no new work starts after it is accepted", async () => {
    const locks = projectLocks();
    const first = fakeProjects(), second = fakeProjects();
    const o = onboarding(first.projects, locks);
    const p = page(second.projects, locks);
    const a = operation(await o.ask({ op: "project_clone", inspectionId: inspectionId(await o.ask({ op: "project_inspect", url: URL, destination: "/work/studio" })), destination: "/work/studio" }));
    const b = operation(await p.ask("clone", { inspectionId: inspectionId(await p.ask("inspect", { url: OTHER, destination: "/work/other" })), destination: "/work/other" }));
    await vi.waitFor(() => { expect(first.held).toHaveLength(1); expect(second.held).toHaveLength(1); });

    o.service.closeForQuit();
    p.session.closeForQuit();
    expect(refusal(await p.ask("inspect", { path: "/work/a" }))).toBe("busy");
    await Promise.all([o.service.quit(), p.session.quit()]);
    expect(first.held[0]!.signal.aborted).toBe(true);
    expect(second.held[0]!.signal.aborted).toBe(true);
    expect(await onboardingSettled(o.service, a.operationId)).toMatchObject({ state: "cancelled" });
    expect(await settled(p.session, b.operationId)).toMatchObject({ state: "cancelled" });
  });

  test("an abandoned quit lets the page work again", async () => {
    const { projects } = fakeProjects();
    const p = page(projects);
    p.session.closeForQuit();
    expect(refusal(await p.ask("inspect", { path: "/work/a" }))).toBe("busy");
    p.session.reopenAfterAbortedQuit();
    expect(operation(await p.ask("inspect", { path: "/work/a" }))).toMatchObject({ state: "succeeded" });
  });

  test("a replaced renderer cancels the page's clone only", async () => {
    const locks = projectLocks();
    const first = fakeProjects(), second = fakeProjects();
    const o = onboarding(first.projects, locks);
    const p = page(second.projects, locks);
    const a = operation(await o.ask({ op: "project_clone", inspectionId: inspectionId(await o.ask({ op: "project_inspect", url: URL, destination: "/work/studio" })), destination: "/work/studio" }));
    const b = operation(await p.ask("clone", { inspectionId: inspectionId(await p.ask("inspect", { url: OTHER, destination: "/work/other" })), destination: "/work/other" }));
    await vi.waitFor(() => { expect(first.held).toHaveLength(1); expect(second.held).toHaveLength(1); });
    p.session.rendererGone();
    expect(second.held[0]!.signal.aborted).toBe(true);
    expect(first.held[0]!.signal.aborted).toBe(false);
    expect(await settled(p.session, b.operationId)).toMatchObject({ state: "cancelled" });
    first.held[0]!.release();
    expect(await onboardingSettled(o.service, a.operationId)).toMatchObject({ state: "succeeded" });
    // Nothing else is reset: the page answers in the same session.
    expect(operation(await p.ask("inspect", { path: "/work/a" }))).toMatchObject({ state: "succeeded" });
  });

  test("a clone already published is not cancelled by a replaced renderer (D19)", async () => {
    const { projects, held } = fakeProjects({ commit: true });
    const p = page(projects);
    const cloning = operation(await p.ask("clone", { inspectionId: inspectionId(await p.ask("inspect", { url: URL, destination: "/work/studio" })), destination: "/work/studio" }));
    await vi.waitFor(() => expect(held).toHaveLength(1));
    p.session.rendererGone();
    expect(held[0]!.signal.aborted).toBe(false);
    held[0]!.release();
    expect(await settled(p.session, cloning.operationId)).toMatchObject({ state: "succeeded", project: { root: "/work/studio" } });
  });
});

// The page instance over the real folder work, the way index.ts wires it.
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) { try { chmodSync(dir, 0o755); } catch { /* gone */ } rmSync(dir, { recursive: true, force: true }); } });
function temp(): string { const dir = realpathSync(mkdtempSync(join(tmpdir(), "doan-add-page-test-"))); dirs.push(dir); return dir; }
const asRoot = process.getuid?.() === 0;
function repo(dir: string, options: { config?: string } = {}): string {
  mkdirSync(join(dir, ".git"), { recursive: true });
  writeFileSync(join(dir, ".git/config"), "[core]\n");
  if (options.config !== undefined) { mkdirSync(join(dir, ".doan"), { recursive: true }); writeFileSync(join(dir, ".doan/config.json"), options.config); }
  return dir;
}
// `doan ls` as it reads the disk: a valid config lists, `{cwd}` walks up to a set-up repo.
function cliLs(target: LsTarget): FolderState {
  const read = (dir: string): FolderState | null => {
    if (!existsSync(join(dir, ".doan/config.json"))) return null;
    try { JSON.parse(readFileSync(join(dir, ".doan/config.json"), "utf8")); return { kind: "list", root: dir, scope: [], canvases: [] }; }
    catch { return { kind: "error", message: "Cannot read config" }; }
  };
  if ("repo" in target) return existsSync(target.repo) ? read(target.repo) ?? { kind: "uninitialized" } : { kind: "cliError", reason: "missing" };
  for (let dir = target.cwd; ; dir = dirname(dir)) { const found = read(dir); if (found) return found; if (dir === "/") return { kind: "uninitialized" }; }
}
function real(registered: string[] = [], init: (root: string) => ProjectInitResult = r => { mkdirSync(join(r, ".doan/canvases"), { recursive: true }); writeFileSync(join(r, ".doan/config.json"), "{\"v\":1}\n"); return { kind: "success" }; }) {
  const deps = {
    ls: vi.fn(async (target: LsTarget) => cliLs(target)),
    registered: () => registered,
    add: vi.fn(async (path: string): Promise<string | null> => { if (!registered.includes(path)) registered.push(path); return path; }),
    initialize: vi.fn(async (r: string) => init(r)),
    remotes: vi.fn((r: string) => readGitRemotes(r, temp())),
  } satisfies ProjectDeps;
  const projects: AdderProjects = {
    folder: canonicalFolder, destination: path => cloneDestination(path, deps), present: leftoverPresent,
    inspectPath: (path, repository) => inspectPath(path, deps, repository), inspectUrl: repository => inspectUrl(repository, deps),
    select: (path, initialize, repository) => selectProject(path, initialize, repository, deps),
    clone: (url, destination, signal, commit) => cloneProject(url, destination, signal, { ...deps, git: async () => null }, commit),
  };
  return { ...page(projects), deps, registered };
}
async function inspected(p: ReturnType<typeof real>, path: string): Promise<OnboardingOperation> {
  return settled(p.session, operation(await p.ask("inspect", { path })).operationId);
}
async function selected(p: ReturnType<typeof real>, inspection: string, path: string, initialize = false): Promise<OnboardingOperation> {
  return settled(p.session, operation(await p.ask("select", { inspectionId: inspection, path, ...(initialize ? { initialize: true } : {}) })).operationId);
}

describe("the page instance over real folders", () => {
  test("a set-up repository is added as it is", async () => {
    const ready = repo(temp(), { config: "{}" });
    const p = real();
    const found = await inspected(p, ready);
    expect(found.inspection!.candidates).toEqual([{ path: ready, changes: [] }]);
    expect(await selected(p, found.inspection!.inspectionId, ready)).toMatchObject({ state: "succeeded", project: { root: ready } });
    expect(p.registered).toEqual([ready]);
    expect(p.deps.initialize).not.toHaveBeenCalled();
  });

  test("a repository that is not set up is set up only with consent", async () => {
    const fresh = repo(temp());
    const p = real();
    const found = await inspected(p, fresh);
    expect(found.inspection!.candidates).toEqual([{ path: fresh, changes: [".doan/canvases/", ".doan/config.json", ".gitattributes"] }]);
    expect(refusal(await p.ask("select", { inspectionId: found.inspection!.inspectionId, path: fresh }))).toBe("initialize_required");
    expect(p.registered).toEqual([]);
    expect(await selected(p, found.inspection!.inspectionId, fresh, true)).toMatchObject({ state: "succeeded", project: { root: fresh } });
    expect(existsSync(join(fresh, ".doan/config.json"))).toBe(true);
    expect(p.registered).toEqual([fresh]);
  });

  test("a folder holding several repositories offers each, and one is chosen", async () => {
    const parent = temp();
    const a = repo(join(parent, "a"), { config: "{}" }), b = repo(join(parent, "b"));
    const p = real();
    const found = await inspected(p, parent);
    expect(found.inspection!.candidates.map(c => c.path)).toEqual([a, b]);
    expect(await selected(p, found.inspection!.inspectionId, b, true)).toMatchObject({ state: "succeeded", project: { root: b } });
    expect(p.registered).toEqual([b]);
  });

  test("a folder that is not a repository and holds none is offered for setup itself", async () => {
    const plain = temp();
    const found = await inspected(real(), plain);
    expect(found.inspection!.candidates).toEqual([{ path: plain, changes: [".doan/canvases/", ".doan/config.json", ".gitattributes"] }]);
  });

  test.skipIf(asRoot).each([0o111, 0o444])("an unreadable folder (%o) is project_unavailable, never an empty folder to set up", async mode => {
    const locked = temp();
    mkdirSync(join(locked, "inner"));
    chmodSync(locked, mode);
    const p = real();
    expect(await inspected(p, locked)).toMatchObject({ state: "failed", error: { code: "project_unavailable" } });
    expect(p.registered).toEqual([]);
  });

  test("a folder removed between inspection and selection is not registered", async () => {
    const fresh = repo(temp());
    const p = real();
    const found = await inspected(p, fresh);
    rmSync(fresh, { recursive: true });
    expect(await selected(p, found.inspection!.inspectionId, fresh, true)).toMatchObject({ state: "failed", error: { code: "project_unavailable" } });
    expect(p.registered).toEqual([]);
    expect(refusal(await p.ask("inspect", { path: fresh }))).toBe("path_unavailable");
  });

  test("a symlinked path registers its canonical root", async () => {
    const ready = repo(temp(), { config: "{}" });
    const link = join(temp(), "link");
    symlinkSync(ready, link);
    const p = real();
    const found = await inspected(p, link);
    expect(found.inspection!.candidates).toEqual([{ path: ready, changes: [] }]);
    expect(await selected(p, found.inspection!.inspectionId, ready)).toMatchObject({ state: "succeeded", project: { root: ready } });
    expect(p.registered).toEqual([ready]);
  });

  test("a registered project, picked directly or through a symlink, answers its root and is not stored twice", async () => {
    const ready = repo(temp(), { config: "{}" });
    const link = join(temp(), "link");
    symlinkSync(ready, link);
    const p = real([ready]);
    for (const path of [ready, link]) {
      const found = await inspected(p, path);
      expect(await selected(p, found.inspection!.inspectionId, ready)).toMatchObject({ state: "succeeded", project: { root: ready } });
    }
    expect(p.registered).toEqual([ready]);
  });

  test("a folder inside a set-up project answers that project, never a nested one", async () => {
    const ready = repo(temp(), { config: "{}" });
    mkdirSync(join(ready, "design"));
    const p = real([ready]);
    const found = await inspected(p, join(ready, "design"));
    expect(found.inspection!.candidates).toEqual([{ path: ready, changes: [] }]);
    expect(await selected(p, found.inspection!.inspectionId, ready)).toMatchObject({ state: "succeeded", project: { root: ready } });
    expect(p.registered).toEqual([ready]);
    expect(existsSync(join(ready, "design/.doan"))).toBe(false);
  });

  test("a failed setup leaves the folder registered, not set up", async () => {
    const fresh = repo(temp());
    const p = real([], () => ({ kind: "error", message: "m", guidance: "g" }));
    const found = await inspected(p, fresh);
    expect(await selected(p, found.inspection!.inspectionId, fresh, true)).toMatchObject({ state: "failed", error: { code: "init_failed" } });
    expect(p.registered).toEqual([fresh]);
    expect(existsSync(join(fresh, ".doan/config.json"))).toBe(false);
  });

  test("a clone destination that exists is refused, and a clone without Git is git_missing", async () => {
    const parent = temp();
    mkdirSync(join(parent, "studio"));
    const p = real();
    expect(refusal(await p.ask("inspect", { url: URL, destination: join(parent, "studio") }))).toBe("destination_exists");
    const plan = inspectionId(await p.ask("inspect", { url: URL, destination: join(parent, "fresh") }));
    const cloned = await settled(p.session, operation(await p.ask("clone", { inspectionId: plan, destination: join(parent, "fresh") })).operationId);
    expect(cloned).toMatchObject({ state: "failed", error: { code: "git_missing" } });
    expect(existsSync(join(parent, "fresh"))).toBe(false);
  });
});
