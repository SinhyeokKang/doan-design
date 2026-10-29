import { expect, test, vi } from "vitest";
import type { OnboardingOperation, OnboardingResponse, OnboardingState } from "../formats/types";
import { isMainCheckout, ProjectStepSession } from "./projectStep";

type Reply = OnboardingResponse | Promise<OnboardingResponse>;
const op = (kind: OnboardingOperation["kind"], over: Partial<OnboardingOperation> = {}): OnboardingOperation => ({ operationId: `op-${kind}-${Math.random().toString(36).slice(2)}`, requestId: "r", kind, state: "succeeded", ...over });
const ok = (operation: OnboardingOperation): OnboardingResponse => ({ v: 2, ok: true, op: operation.kind, result: { operation } } as OnboardingResponse);
const refused = (code: string): OnboardingResponse => ({ v: 2, ok: false, error: { code, message: `m:${code}` } } as OnboardingResponse);
const inspection = (candidates: [string, string[]?][], clone?: string) => ({ inspectionId: `i-${Math.random()}`, candidates: candidates.map(([path, changes]) => ({ path, changes: (changes ?? []) as never })), ...(clone ? { clone: { destination: clone, changes: [] } } : {}) });

function harness(projects: string[] = [], home: string | null = "/Users/ada", mains: string[] = []) {
  let listener: ((state: OnboardingState) => void) | null = null;
  const queue: Record<string, Reply[]> = { inspect: [], select: [], clone: [], cancel: [], complete: [] };
  const next = (name: string) => queue[name]!.shift() ?? refused("bad_request");
  const api = {
    readOnboardingSession: vi.fn(),
    onOnboardingSession: vi.fn((l: (state: OnboardingState) => void) => { listener = l; return () => { listener = null; }; }),
    inspectOnboardingProject: vi.fn(async (_r: unknown) => next("inspect")),
    selectOnboardingProject: vi.fn(async (_r: unknown) => next("select")),
    cloneOnboardingProject: vi.fn(async (_r: unknown) => next("clone")),
    cancelOnboardingOperation: vi.fn(async (_r: unknown) => next("cancel")),
    completeOnboarding: vi.fn(async (_r: unknown) => next("complete")),
    chooseOnboardingFolder: vi.fn(async (_p: "project" | "destination"): Promise<string | null> => null),
  };
  let ids = 0, revision = 0;
  const completed = vi.fn();
  const session = new ProjectStepSession({ api, sessionId: "s1", projects: () => projects, homeDirectory: () => home, mainCheckout: path => mains.includes(path), requestId: () => `req-${++ids}`, changed: () => {}, completed });
  session.start();
  return {
    session, api, queue, completed,
    emit(operations: OnboardingOperation[], sessionId = "s1") { listener?.({ sessionId, revision: ++revision, completed: false, agents: null, project: null, operations }); },
    listening: () => listener !== null,
  };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
// The Set up and continue button: consent for the inspection on screen.
const setUp = (h: { session: ProjectStepSession }) => h.session.setUp((h.session.state.phase as { inspectionId: string }).inspectionId);
const phase = (h: ReturnType<typeof harness>) => h.session.state.phase;

test("Choose folder: a picked set-up folder is inspected and selected; a cancelled picker changes nothing", async () => {
  const h = harness();
  await h.session.chooseFolder();
  expect(h.api.chooseOnboardingFolder).toHaveBeenCalledWith("project");
  expect(h.api.inspectOnboardingProject).not.toHaveBeenCalled();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/app");
  const found = inspection([["/code/app"]]);
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: found })));
  h.queue.select!.push(ok(op("project_select", { project: { root: "/code/app" } })));
  await h.session.chooseFolder();
  expect(h.api.inspectOnboardingProject.mock.calls[0]![0]).toEqual({ sessionId: "s1", requestId: "req-1", path: "/code/app" });
  expect(h.api.selectOnboardingProject.mock.calls[0]![0]).toEqual({ sessionId: "s1", requestId: "req-2", inspectionId: found.inspectionId, path: "/code/app" });
  expect(phase(h)).toEqual({ kind: "ready", root: "/code/app" });
});

test("a folder that needs setup asks first, and Set up and continue sends initialize", async () => {
  const h = harness();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/plain");
  const found = inspection([["/code/plain", [".doan/config.json", ".doan/canvases/"]]]);
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: found })));
  await h.session.chooseFolder();
  expect(phase(h)).toMatchObject({ kind: "setup", path: "/code/plain" });
  expect(h.api.selectOnboardingProject).not.toHaveBeenCalled();
  h.queue.select!.push(ok(op("project_select", { project: { root: "/code/plain" } })));
  await setUp(h);
  expect(h.api.selectOnboardingProject.mock.calls[0]![0]).toMatchObject({ path: "/code/plain", initialize: true });
  expect(phase(h)).toEqual({ kind: "ready", root: "/code/plain" });
});

test("D25: several checkouts of the URL are not offered as a list: one is picked (no setup, then main checkout, then newest)", async () => {
  const h = harness(["/code/studio-main", "/wt/studio-old", "/wt/studio-new", "/code/plain"], "/Users/ada", ["/code/studio-main"]);
  h.session.setUrl("https://github.com/acme/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/plain", [".doan/config.json"]], ["/wt/studio-old"], ["/code/studio-main"], ["/wt/studio-new"]]) })));
  await h.session.findRepository();
  expect(phase(h)).toMatchObject({ kind: "candidates", url: "https://github.com/acme/studio", candidates: [{ path: "/code/studio-main", changes: [] }], choice: "/code/studio-main" });
  h.queue.select!.push(ok(op("project_select", { project: { root: "/code/studio-main" } })));
  await h.session.select();
  expect(h.api.selectOnboardingProject.mock.calls[0]![0]).toMatchObject({ path: "/code/studio-main" });
  // Without a main checkout among them, the most recently registered one wins.
  const g = harness(["/wt/studio-old", "/wt/studio-new"]);
  g.session.setUrl("https://github.com/acme/studio");
  g.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/wt/studio-old"], ["/wt/studio-new"]]) })));
  await g.session.findRepository();
  expect(g.session.state.phase).toMatchObject({ candidates: [{ path: "/wt/studio-new" }] });
});


test("an invalid URL is refused locally; editing it clears the error", async () => {
  const h = harness();
  h.session.setUrl("github.com/acme");
  await h.session.findRepository();
  expect(h.session.state.error).toEqual({ code: "invalid_url" });
  expect(h.api.inspectOnboardingProject).not.toHaveBeenCalled();
  h.session.setUrl("https://github.com/acme/studio");
  expect(h.session.state.error).toBeNull();
  expect(h.session.urlValid()).toBe(true);
});

test("a repository with no local checkout plans a clone next to the most recently registered project", async () => {
  const h = harness(["/Users/ada/old/one", "/Users/ada/code/doan-design"]);
  h.session.setUrl("git@github.com:acme/studio.git");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([]) })));
  const plan = inspection([], "/Users/ada/code/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: plan })));
  await h.session.findRepository();
  expect(h.api.inspectOnboardingProject.mock.calls[1]![0]).toMatchObject({ url: "git@github.com:acme/studio.git", destination: "/Users/ada/code/studio" });
  expect(phase(h)).toEqual({ kind: "clone", url: "git@github.com:acme/studio.git", inspectionId: plan.inspectionId, destination: "/Users/ada/code/studio" });
});

test("without registered projects the clone goes under the home folder", async () => {
  const h = harness([]);
  h.session.setUrl("https://github.com/acme/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([]) })), ok(op("project_inspect", { inspection: inspection([], "/Users/ada/studio") })));
  await h.session.findRepository();
  expect(h.api.inspectOnboardingProject.mock.calls[1]![0]).toMatchObject({ destination: "/Users/ada/studio" });
});

test("an inspection still running finishes through the session event, also when the event came before the reply", async () => {
  const h = harness();
  h.session.setUrl("https://github.com/acme/studio");
  const running = op("project_inspect", { state: "running" });
  h.queue.inspect!.push(ok(running));
  const finding = h.session.findRepository();
  await flush();
  expect(phase(h)).toEqual({ kind: "inspecting", url: "https://github.com/acme/studio" });
  h.emit([{ ...running, state: "succeeded", inspection: inspection([["/code/studio"]]) }]);
  await finding;
  expect(phase(h)).toMatchObject({ kind: "candidates" });
  const early = op("project_inspect", { state: "running" });
  let release: (r: OnboardingResponse) => void = () => {};
  h.queue.inspect!.push(new Promise(resolve => { release = resolve; }));
  const again = h.session.findRepository();
  await flush();
  h.emit([{ ...early, state: "succeeded", inspection: inspection([["/code/other"]]) }]);
  release(ok(early));
  await again;
  expect(phase(h)).toMatchObject({ kind: "candidates", choice: "/code/other" });
});

test("Cancel while looking for a repository drops the late result", async () => {
  const h = harness();
  h.session.setUrl("https://github.com/acme/studio");
  let release: (r: OnboardingResponse) => void = () => {};
  h.queue.inspect!.push(new Promise(resolve => { release = resolve; }));
  const finding = h.session.findRepository();
  await flush();
  h.session.cancelInspect();
  release(ok(op("project_inspect", { inspection: inspection([["/code/studio"]]) })));
  await finding;
  expect(phase(h)).toEqual({ kind: "choose" });
  expect(h.session.state.url).toBe("https://github.com/acme/studio");
});

async function planned(h: ReturnType<typeof harness>) {
  h.session.setUrl("https://github.com/acme/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([]) })), ok(op("project_inspect", { inspection: inspection([], "/Users/ada/studio") })));
  await h.session.findRepository();
}

test("clone: progress, Cancel with cleanup, cancelled, then Retry plans and clones again", async () => {
  const h = harness();
  await planned(h);
  const running = op("project_clone", { state: "running" });
  h.queue.clone!.push(ok(running));
  const cloning = h.session.clone();
  await flush();
  expect(phase(h)).toMatchObject({ kind: "cloning", destination: "/Users/ada/studio", cancelling: false });
  expect(h.session.busy()).toBe(true);
  h.queue.cancel!.push(ok({ ...running, cancelling: true }));
  await h.session.cancelClone();
  expect(h.api.cancelOnboardingOperation.mock.calls[0]![0]).toMatchObject({ operationId: running.operationId });
  expect(phase(h)).toMatchObject({ kind: "cloning", cancelling: true });
  h.emit([{ ...running, cancelling: true }]);
  h.emit([{ ...running, state: "cancelled" }]);
  await cloning;
  expect(phase(h)).toEqual({ kind: "cloneCancelled", url: "https://github.com/acme/studio", destination: "/Users/ada/studio" });
  const plan = inspection([], "/Users/ada/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: plan })));
  h.queue.clone!.push(ok(op("project_clone", { project: { root: "/Users/ada/studio" } })));
  await h.session.retry();
  expect(h.api.cloneOnboardingProject.mock.calls[1]![0]).toMatchObject({ inspectionId: plan.inspectionId, destination: "/Users/ada/studio" });
  expect(phase(h)).toEqual({ kind: "ready", root: "/Users/ada/studio" });
});

test("clone failures keep the clone screen with their code and main's message (a kept cleanup path names the folder)", async () => {
  const h = harness();
  await planned(h);
  h.queue.clone!.push(ok(op("project_clone", { state: "failed", error: { code: "cleanup_failed", message: "Couldn't remove /Users/ada/.studio.doan-clone-x. Remove it, then try again." } })));
  await h.session.clone();
  expect(phase(h)).toMatchObject({ kind: "clone", inspectionId: null, destination: "/Users/ada/studio" });
  expect(h.session.state.error).toEqual({ code: "cleanup_failed", message: "Couldn't remove /Users/ada/.studio.doan-clone-x. Remove it, then try again." });
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([], "/Users/ada/studio") })));
  h.queue.clone!.push(ok(op("project_clone", { state: "failed", error: { code: "git_missing", message: "Git is not installed." } })));
  await h.session.retry();
  expect(h.session.state.error?.code).toBe("git_missing");
});

test("a repository Git cannot reach goes back to the first screen with the URL kept", async () => {
  const h = harness();
  await planned(h);
  h.queue.clone!.push(ok(op("project_clone", { state: "failed", error: { code: "repository_unreachable", message: "x" } })));
  await h.session.clone();
  expect(phase(h)).toEqual({ kind: "choose" });
  expect(h.session.state.error).toEqual({ code: "access_failed" });
  expect(h.session.state.url).toBe("https://github.com/acme/studio");
});

test("an existing destination offers Change location and Use existing folder", async () => {
  const h = harness();
  h.session.setUrl("https://github.com/acme/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([]) })), refused("destination_exists"));
  await h.session.findRepository();
  expect(phase(h)).toMatchObject({ kind: "clone", inspectionId: null, destination: "/Users/ada/studio" });
  expect(h.session.state.error?.code).toBe("destination_exists");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/Users/ada/studio"]]) })));
  h.queue.select!.push(ok(op("project_select", { project: { root: "/Users/ada/studio" } })));
  await h.session.useExisting();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ path: "/Users/ada/studio" });
  expect(phase(h)).toEqual({ kind: "ready", root: "/Users/ada/studio" });
});

test("Change location picks a parent and plans the clone there", async () => {
  const h = harness();
  await planned(h);
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/Volumes/work/");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([], "/Volumes/work/studio") })));
  await h.session.changeDestination();
  expect(h.api.chooseOnboardingFolder).toHaveBeenLastCalledWith("destination");
  expect(phase(h)).toMatchObject({ kind: "clone", destination: "/Volumes/work/studio" });
});

test("select failures map to their screens: remote mismatch, setup failed, unreadable configuration", async () => {
  for (const code of ["remote_mismatch", "init_failed", "config_invalid", "project_unavailable"] as const) {
    const h = harness();
    h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/app");
    h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/app", [".doan/config.json"]]]) })));
    await h.session.chooseFolder();
    h.queue.select!.push(ok(op("project_select", { state: "failed", error: { code, message: "x" } })));
    await setUp(h);
    expect(h.session.state.error?.code).toBe(code);
    expect(phase(h)).toMatchObject({ kind: "setup", path: "/code/app" });
  }
});

async function ready(h: ReturnType<typeof harness>) {
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/app");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/app"]]) })));
  h.queue.select!.push(ok(op("project_select", { project: { root: "/code/app" } })));
  await h.session.chooseFolder();
}

test("Open doan saves completion and hands the canonical root to Home", async () => {
  const h = harness();
  await ready(h);
  const running = op("complete", { state: "running" });
  h.queue.complete!.push(ok(running));
  const completing = h.session.complete();
  await flush();
  expect(phase(h)).toEqual({ kind: "completing", root: "/code/app" });
  expect(h.session.busy()).toBe(true);
  h.emit([{ ...running, state: "succeeded", project: { root: "/private/code/app" } }]);
  await completing;
  expect(h.completed).toHaveBeenCalledExactlyOnceWith("/private/code/app");
});

test("a failed save keeps the project and Retry only saves again; a newer marker version offers no Retry", async () => {
  const h = harness();
  await ready(h);
  h.queue.complete!.push(ok(op("complete", { state: "failed", error: { code: "completion_save_failed", message: "x" } })));
  await h.session.complete();
  expect(phase(h)).toEqual({ kind: "ready", root: "/code/app" });
  expect(h.session.state.error?.code).toBe("completion_save_failed");
  h.queue.complete!.push(ok(op("complete", { state: "failed", error: { code: "completion_unsupported_version", message: "x" } })));
  await h.session.retry();
  expect(h.api.selectOnboardingProject).toHaveBeenCalledTimes(1);
  expect(h.api.completeOnboarding).toHaveBeenCalledTimes(2);
  expect(h.session.state.error?.code).toBe("completion_unsupported_version");
  await h.session.retry();
  expect(h.api.completeOnboarding).toHaveBeenCalledTimes(2);
});

test("completion refused because no agent is ready stays on the ready project", async () => {
  const h = harness();
  await ready(h);
  h.queue.complete!.push(refused("no_ready_agent"));
  await h.session.complete();
  expect(phase(h)).toEqual({ kind: "ready", root: "/code/app" });
  expect(h.session.state.error).toEqual({ code: "no_ready_agent", message: "m:no_ready_agent" });
  expect(h.completed).not.toHaveBeenCalled();
});

test("Your projects: a listed project is inspected and selected like a chosen folder", async () => {
  const h = harness(["/code/a", "/code/b"]);
  h.session.pickListed("/code/b");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/b"]]) })));
  h.queue.select!.push(ok(op("project_select", { project: { root: "/code/b" } })));
  await h.session.useListed();
  expect(h.api.inspectOnboardingProject.mock.calls[0]![0]).toMatchObject({ path: "/code/b" });
  expect(phase(h)).toEqual({ kind: "ready", root: "/code/b" });
});

test("events of another session are ignored and dispose unsubscribes", async () => {
  const h = harness();
  h.session.setUrl("https://github.com/acme/studio");
  const running = op("project_inspect", { state: "running" });
  h.queue.inspect!.push(ok(running));
  const finding = h.session.findRepository();
  await flush();
  h.emit([{ ...running, state: "succeeded", inspection: inspection([["/x"]]) }], "other");
  await flush();
  expect(phase(h)).toMatchObject({ kind: "inspecting" });
  h.session.dispose();
  expect(h.listening()).toBe(false);
  void finding;
});

test("D25: when every checkout needs setup, the picked one goes to the setup screen without a select", async () => {
  const h = harness(["/code/studio", "/wt/plain"], "/Users/ada", ["/code/studio"]);
  h.session.setUrl("https://github.com/acme/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/wt/plain", [".doan/config.json"]], ["/code/studio", [".doan/config.json"]]]) })));
  await h.session.findRepository();
  expect(h.api.selectOnboardingProject).not.toHaveBeenCalled();
  expect(phase(h)).toMatchObject({ kind: "setup", path: "/code/studio", url: "https://github.com/acme/studio" });
});

test("D25: repositories found inside a picked folder are still a list", async () => {
  const h = harness();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/a"], ["/code/b"]]) })));
  await h.session.chooseFolder();
  expect(phase(h)).toMatchObject({ kind: "candidates", url: null, candidates: [{ path: "/code/a" }, { path: "/code/b" }] });
});


test("review: Clone and continue is busy before main answers, so a second click sends nothing and the reply is kept", async () => {
  const h = harness();
  await planned(h);
  let release: (r: OnboardingResponse) => void = () => {};
  h.queue.clone!.push(new Promise(resolve => { release = resolve; }));
  const first = h.session.clone();
  await flush();
  expect(h.session.busy()).toBe(true);
  expect(phase(h)).toMatchObject({ kind: "cloning", operationId: null });
  await h.session.clone();
  await h.session.retry();
  await h.session.chooseFolder();
  expect(h.api.cloneOnboardingProject).toHaveBeenCalledTimes(1);
  const running = op("project_clone", { state: "running" });
  release(ok(running));
  await flush();
  expect(phase(h)).toMatchObject({ kind: "cloning", operationId: running.operationId });
  h.emit([{ ...running, state: "succeeded", project: { root: "/Users/ada/studio" } }]);
  await first;
  expect(phase(h)).toEqual({ kind: "ready", root: "/Users/ada/studio" });
});

test("review: Cancel that main refuses because the clone is already published returns to its progress", async () => {
  const h = harness();
  await planned(h);
  const running = op("project_clone", { state: "running" });
  h.queue.clone!.push(ok(running));
  void h.session.clone();
  await flush();
  h.queue.cancel!.push(ok(running));
  await h.session.cancelClone();
  expect(phase(h)).toMatchObject({ kind: "cloning", cancelling: false });
});

test("review: a stale inspection is inspected again instead of retrying the same request", async () => {
  const h = harness();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/plain");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/plain", [".doan/config.json"]]]) })));
  await h.session.chooseFolder();
  h.queue.select!.push(refused("inspection_stale"));
  const fresh = inspection([["/code/plain", [".doan/config.json"]]]);
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: fresh })));
  await setUp(h);
  expect(h.api.inspectOnboardingProject).toHaveBeenCalledTimes(2);
  expect(h.api.inspectOnboardingProject.mock.calls[1]![0]).toMatchObject({ path: "/code/plain" });
  expect(phase(h)).toMatchObject({ kind: "setup", inspectionId: fresh.inspectionId });
});

test("review: Retry after a failed folder inspection inspects that folder again, not the URL field", async () => {
  const h = harness();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/app");
  h.queue.inspect!.push(refused("busy"));
  await h.session.chooseFolder();
  expect(h.session.state.error?.code).toBe("busy");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/app"]]) })));
  h.queue.select!.push(ok(op("project_select", { project: { root: "/code/app" } })));
  await h.session.retry();
  expect(h.api.inspectOnboardingProject.mock.calls[1]![0]).toMatchObject({ path: "/code/app" });
  expect(phase(h)).toEqual({ kind: "ready", root: "/code/app" });
});

test("review: an operation retired from the published list is read by its id", async () => {
  const h = harness();
  h.session.setUrl("https://github.com/acme/studio");
  const running = op("project_inspect", { state: "running" });
  h.queue.inspect!.push(ok(running));
  h.api.readOnboardingSession.mockResolvedValueOnce({ v: 2, ok: true, op: "status", result: { sessionId: "s1", revision: 9, completed: false, agents: null, project: null, operations: [{ ...running, state: "succeeded", inspection: inspection([["/code/studio"]]) }] } });
  const finding = h.session.findRepository();
  await flush();
  h.emit([]);
  await finding;
  expect(h.api.readOnboardingSession).toHaveBeenCalledWith({ sessionId: "s1", operationId: running.operationId });
  expect(phase(h)).toMatchObject({ kind: "candidates" });
});

test("review 2: Retry on a cancelled clone plans the current destination, not an older failure", async () => {
  const h = harness();
  h.session.setUrl("https://github.com/acme/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([]) })), refused("destination_exists"));
  await h.session.findRepository();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/Volumes/work");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([], "/Volumes/work/studio") })));
  await h.session.changeDestination();
  const running = op("project_clone", { state: "running" });
  h.queue.clone!.push(ok(running));
  const cloning = h.session.clone();
  await flush();
  h.queue.cancel!.push(ok({ ...running, cancelling: true }));
  await h.session.cancelClone();
  h.emit([{ ...running, state: "cancelled" }]);
  await cloning;
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([], "/Volumes/work/studio") })));
  h.queue.clone!.push(ok(op("project_clone", { project: { root: "/Volumes/work/studio" } })));
  await h.session.retry();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ destination: "/Volumes/work/studio" });
  expect(phase(h)).toEqual({ kind: "ready", root: "/Volumes/work/studio" });
});

test("review 2: the session says when it waits on the folder picker", async () => {
  const h = harness();
  let pick: (path: string | null) => void = () => {};
  h.api.chooseOnboardingFolder.mockImplementationOnce(() => new Promise(resolve => { pick = resolve; }));
  const choosing = h.session.chooseFolder();
  await flush();
  expect(h.session.picking()).toBe(true);
  pick(null);
  await choosing;
  expect(h.session.picking()).toBe(false);
  expect(phase(h)).toEqual({ kind: "choose" });
});

test("D20: an existing folder chosen from the URL path is inspected with that URL; a mismatch stays on the URL screen", async () => {
  const h = harness();
  await planned(h);
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/other");
  h.queue.inspect!.push(ok(op("project_inspect", { state: "failed", error: { code: "remote_mismatch", message: "x" } })));
  await h.session.chooseExisting();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ path: "/code/other", url: "https://github.com/acme/studio" });
  expect(h.session.state.error).toMatchObject({ code: "remote_mismatch", path: "/code/other" });
  expect(phase(h)).toMatchObject({ kind: "clone", destination: "/Users/ada/studio" });
  h.queue.inspect!.push(refused("destination_exists"));
  await h.session.retry();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ path: "/code/other", url: "https://github.com/acme/studio" });
});

test("D20: Use existing folder sends the URL with the destination path", async () => {
  const h = harness();
  h.session.setUrl("https://github.com/acme/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([]) })), refused("destination_exists"));
  await h.session.findRepository();
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/Users/ada/studio"]]) })));
  h.queue.select!.push(ok(op("project_select", { project: { root: "/Users/ada/studio" } })));
  await h.session.useExisting();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ path: "/Users/ada/studio", url: "https://github.com/acme/studio" });
});

test("D20: Choose another folder on a found checkout keeps the URL; a plain Choose folder does not send one", async () => {
  const h = harness();
  h.session.setUrl("https://github.com/acme/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/a/studio"], ["/b/studio"]]) })));
  await h.session.findRepository();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/c/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { state: "failed", error: { code: "remote_mismatch", message: "x" } })));
  await h.session.chooseExisting();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ path: "/c/studio", url: "https://github.com/acme/studio" });
  expect(phase(h)).toMatchObject({ kind: "candidates" });
  h.session.restart();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/d/app");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/d/app"]]) })));
  h.queue.select!.push(ok(op("project_select", { project: { root: "/d/app" } })));
  await h.session.chooseFolder();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).not.toHaveProperty("url");
});

test("D21: a folder recovery on a URL screen sends the URL too (not available, setup failed, unreadable configuration, cancelled clone)", async () => {
  const h = harness();
  await planned(h);
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/gone");
  h.queue.inspect!.push(refused("path_unavailable"));
  await h.session.chooseExisting();
  expect(phase(h)).toMatchObject({ kind: "clone" });
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/other");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/other", [".doan/config.json"]]]) })));
  await h.session.chooseExisting();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ path: "/code/other", url: "https://github.com/acme/studio" });
  expect(phase(h)).toMatchObject({ kind: "setup", url: "https://github.com/acme/studio" });
  h.queue.select!.push(ok(op("project_select", { state: "failed", error: { code: "init_failed", message: "x" } })));
  await setUp(h);
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/third");
  h.queue.inspect!.push(refused("busy"));
  await h.session.chooseExisting();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ path: "/code/third", url: "https://github.com/acme/studio" });
});

test("D21: a cancelled clone's Choose local folder keeps the URL", async () => {
  const h = harness();
  await planned(h);
  const running = op("project_clone", { state: "running" });
  h.queue.clone!.push(ok(running));
  const cloning = h.session.clone();
  await flush();
  h.emit([{ ...running, state: "cancelled" }]);
  await cloning;
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/local");
  h.queue.inspect!.push(refused("busy"));
  await h.session.chooseExisting();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ path: "/code/local", url: "https://github.com/acme/studio" });
});

test("🟡2: a refused completion for no ready agent is cleared once an agent is ready again", async () => {
  const h = harness();
  await ready(h);
  h.queue.complete!.push(refused("no_ready_agent"));
  await h.session.complete();
  expect(h.session.state.error?.code).toBe("no_ready_agent");
  h.session.agentsReady(false);
  expect(h.session.state.error?.code).toBe("no_ready_agent");
  h.session.agentsReady(true);
  expect(h.session.state.error).toBeNull();
});

test("⚪: an operation main no longer knows is asked for once, not on every event", async () => {
  const h = harness();
  h.session.setUrl("https://github.com/acme/studio");
  const running = op("project_inspect", { state: "running" });
  h.queue.inspect!.push(ok(running));
  h.api.readOnboardingSession.mockResolvedValue({ v: 2, ok: false, error: { code: "operation_not_found", message: "x" } });
  void h.session.findRepository();
  await flush();
  h.emit([]); await flush(); h.emit([]); await flush(); h.emit([]); await flush();
  expect(h.api.readOnboardingSession).toHaveBeenCalledTimes(1);
});

test("V fix: Back from a cancelled or failed clone returns to the editable URL, and the old inspection is gone", async () => {
  const h = harness();
  await planned(h);
  expect(h.session.backToUrl()).toBe(false);
  const running = op("project_clone", { state: "running" });
  h.queue.clone!.push(ok(running));
  const cloning = h.session.clone();
  await flush();
  h.emit([{ ...running, state: "cancelled" }]);
  await cloning;
  expect(h.session.backToUrl()).toBe(true);
  h.session.restart();
  expect(phase(h)).toEqual({ kind: "choose" });
  expect(h.session.state.url).toBe("https://github.com/acme/studio");
  // With the old inspection discarded, Retry looks the URL up again instead of re-planning the old clone.
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/studio"]]) })));
  await h.session.retry();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toEqual({ sessionId: "s1", requestId: expect.any(String), url: "https://github.com/acme/studio" });
  expect(phase(h)).toMatchObject({ kind: "candidates" });
  await planned(h);
  h.queue.clone!.push(ok(op("project_clone", { state: "failed", error: { code: "clone_failed", message: "x" } })));
  await h.session.clone();
  expect(h.session.backToUrl()).toBe(true);
});

test("V re-check: Retry on the access error inspects an edited URL, like Enter, and drops the old clone", async () => {
  const h = harness();
  await planned(h);
  h.queue.clone!.push(ok(op("project_clone", { state: "failed", error: { code: "repository_unreachable", message: "x" } })));
  await h.session.clone();
  expect(h.session.state.error).toEqual({ code: "access_failed" });
  h.session.setUrl("https://github.com/git/git");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/git"]]) })));
  await h.session.retry();
  expect(h.api.cloneOnboardingProject).toHaveBeenCalledTimes(1);
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toEqual({ sessionId: "s1", requestId: expect.any(String), url: "https://github.com/git/git" });
  expect(phase(h)).toMatchObject({ kind: "candidates", url: "https://github.com/git/git" });
});

test("V re-check: Retry on the access error with the URL unchanged clones that repository again", async () => {
  const h = harness();
  await planned(h);
  h.queue.clone!.push(ok(op("project_clone", { state: "failed", error: { code: "repository_unreachable", message: "x" } })));
  await h.session.clone();
  const plan = inspection([], "/Users/ada/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: plan })));
  h.queue.clone!.push(ok(op("project_clone", { project: { root: "/Users/ada/studio" } })));
  await h.session.retry();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ url: "https://github.com/acme/studio", destination: "/Users/ada/studio" });
  expect(h.api.cloneOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ inspectionId: plan.inspectionId });
  expect(phase(h)).toEqual({ kind: "ready", root: "/Users/ada/studio" });
});


test("consent: V's sequence (mismatch, notice Choose another folder, Edit URL, Find, Choose existing folder) stops at setup and writes nothing", async () => {
  const h = harness();
  h.session.setUrl("https://github.com/octocat/linguist");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([]) })), ok(op("project_inspect", { inspection: inspection([], "/Users/ada/linguist") })));
  await h.session.findRepository();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/repos/linguist-mismatch");
  h.queue.inspect!.push(ok(op("project_inspect", { state: "failed", error: { code: "remote_mismatch", message: "x" } })));
  await h.session.chooseExisting();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/repos/git-consortium");
  h.queue.inspect!.push(ok(op("project_inspect", { state: "failed", error: { code: "remote_mismatch", message: "x" } })));
  await h.session.chooseExisting();
  h.session.restart();
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([]) })), ok(op("project_inspect", { inspection: inspection([], "/Users/ada/linguist") })));
  await h.session.findRepository();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/repos/linguist-match");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/repos/linguist-match", [".doan/config.json", ".doan/canvases/", ".gitattributes"]]]) })));
  await h.session.chooseExisting();
  expect(phase(h)).toMatchObject({ kind: "setup", path: "/repos/linguist-match" });
  expect(h.api.selectOnboardingProject).not.toHaveBeenCalled();
});

test("consent: select never sends initialize, whatever it is passed; only Set up and continue does", async () => {
  const h = harness();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/plain");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/plain", [".doan/config.json"]]]) })));
  await h.session.chooseFolder();
  await (h.session.select as (initialize?: boolean) => Promise<void>)(true);
  expect(h.api.selectOnboardingProject).not.toHaveBeenCalled();
  expect(phase(h)).toMatchObject({ kind: "setup" });
});

test("consent: Set up and continue for an inspection no longer on screen sends nothing", async () => {
  const h = harness();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/plain");
  const first = inspection([["/code/plain", [".doan/config.json"]]]);
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: first })));
  await h.session.chooseFolder();
  h.session.restart();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/other");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/other", [".doan/config.json"]]]) })));
  await h.session.chooseFolder();
  await h.session.setUp(first.inspectionId);
  expect(h.api.selectOnboardingProject).not.toHaveBeenCalled();
});

test("consent: a re-inspection after a stale select needs Set up and continue again", async () => {
  const h = harness();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/plain");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/plain", [".doan/config.json"]]]) })));
  await h.session.chooseFolder();
  h.queue.select!.push(refused("inspection_stale"));
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/plain", [".doan/config.json"]]]) })));
  await setUp(h);
  h.queue.select!.push(ok(op("project_select", { project: { root: "/code/plain" } })));
  await h.session.retry();
  expect(h.api.selectOnboardingProject).toHaveBeenCalledTimes(1);
  expect(phase(h)).toMatchObject({ kind: "setup" });
});


test("D25: the main checkout is read from the folder list's git facts", () => {
  const list = (path: string, git: { common: string; main?: string; worktrees: string[] }) => ({ path, kind: "list" as const, canvases: [], servedRev: 0, git });
  const entries = [list("/code/s", { common: "/code/s/.git", worktrees: ["/code/s", "/wt/s"] }), list("/wt/s", { common: "/code/s/.git", main: "/code/s", worktrees: [] }), { path: "/x", kind: "loading" as const }];
  expect(isMainCheckout(entries, "/code/s")).toBe(true);
  expect(isMainCheckout(entries, "/wt/s")).toBe(false);
  expect(isMainCheckout(entries, "/x")).toBe(false);
  expect(isMainCheckout(entries, "/unregistered")).toBe(false);
});

test("UX: inspecting a chosen folder is 'checking', not the setup progress; nothing is written then", async () => {
  const h = harness();
  let release: (r: OnboardingResponse) => void = () => {};
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/app");
  h.queue.inspect!.push(new Promise(resolve => { release = resolve; }));
  const choosing = h.session.chooseFolder();
  await flush();
  expect(phase(h)).toEqual({ kind: "checking", path: "/code/app" });
  expect(h.session.busy()).toBe(true);
  release(ok(op("project_inspect", { inspection: inspection([["/code/app", [".doan/config.json"]]]) })));
  await choosing;
  expect(phase(h)).toMatchObject({ kind: "setup" });
});

test("D25 follow-up: Back from a URL setup screen returns to the editable URL; a folder setup does not", async () => {
  const h = harness(["/code/studio"], "/Users/ada", ["/code/studio"]);
  h.session.setUrl("https://github.com/acme/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/wt/a", [".doan/config.json"]], ["/code/studio", [".doan/config.json"]]]) })));
  await h.session.findRepository();
  expect(phase(h)).toMatchObject({ kind: "setup", url: "https://github.com/acme/studio" });
  expect(h.session.backToUrl()).toBe(true);
  const g = harness();
  g.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/plain");
  g.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/plain", [".doan/config.json"]]]) })));
  await g.session.chooseFolder();
  expect(g.session.backToUrl()).toBe(false);
});
