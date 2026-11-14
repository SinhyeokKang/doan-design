import { expect, test, vi } from "vitest";
import type { OnboardingOperation, OnboardingResponse, OnboardingState } from "../formats/types";
import { addPageApi, isMainCheckout, projectFooter, projectNoticeCode, projectNoticeSlot, ProjectStepSession, type ProjectStepState } from "./projectStep";

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
  expect(h.api.inspectOnboardingProject.mock.calls[0]![0]).toEqual({ sessionId: "s1", requestId: "req-1", path: "/code/app", storage: "repo" });
  expect(h.api.selectOnboardingProject.mock.calls[0]![0]).toEqual({ sessionId: "s1", requestId: "req-2", inspectionId: found.inspectionId, path: "/code/app", storage: "repo" });
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

test("several checkouts of the URL are not offered as a list: one is picked (no setup, then main checkout, then newest)", async () => {
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
  expect(h.session.state.error).toEqual({ code: "invalid_url", source: "url" });
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
  expect(phase(h)).toEqual({ kind: "clone", url: "git@github.com:acme/studio.git", inspectionId: plan.inspectionId, destination: "/Users/ada/code/studio", planned: "repo" });
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
  expect(h.session.state.error).toEqual({ code: "access_failed", source: "url" });
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

// A configured folder is selected at once after its inspection; a failure that is not about its configuration keeps the
// CLI's message (window-only detail) for the notice, beside the code's fixed message.
test("a folder Doan couldn’t read keeps main's detail for the notice", async () => {
  const h = harness();
  const reason = "open /code/app/.doan/canvases/sub: permission denied";
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/app");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/app"]]) })));
  h.queue.select!.push(ok(op("project_select", { state: "failed", error: { code: "project_unreadable", message: "The project folder cannot be read.", detail: reason } })));
  await h.session.chooseFolder();
  expect(h.session.state.error).toEqual({ code: "project_unreadable", message: "The project folder cannot be read.", detail: reason });
  expect(phase(h)).toMatchObject({ kind: "candidates" });
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

test("when every checkout needs setup, the picked one goes to the setup screen without a select", async () => {
  const h = harness(["/code/studio", "/wt/plain"], "/Users/ada", ["/code/studio"]);
  h.session.setUrl("https://github.com/acme/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/wt/plain", [".doan/config.json"]], ["/code/studio", [".doan/config.json"]]]) })));
  await h.session.findRepository();
  expect(h.api.selectOnboardingProject).not.toHaveBeenCalled();
  expect(phase(h)).toMatchObject({ kind: "setup", path: "/code/studio", url: "https://github.com/acme/studio" });
});

test("repositories found inside a picked folder are still a list", async () => {
  const h = harness();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/a"], ["/code/b"]]) })));
  await h.session.chooseFolder();
  expect(phase(h)).toMatchObject({ kind: "candidates", url: null, candidates: [{ path: "/code/a" }, { path: "/code/b" }] });
});


test("Clone and continue is busy before main answers, so a second click sends nothing and the reply is kept", async () => {
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

test("Cancel that main refuses because the clone is already published returns to its progress", async () => {
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

test("a stale inspection is inspected again instead of retrying the same request", async () => {
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

test("Retry after a failed folder inspection inspects that folder again, not the URL field", async () => {
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

test("an operation retired from the published list is read by its id", async () => {
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

test("Retry on a cancelled clone plans the current destination, not an older failure", async () => {
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

test("the session says when it waits on the folder picker", async () => {
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

test("an existing folder chosen from the URL path is inspected with that URL; a mismatch stays on the URL screen", async () => {
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

test("Use existing folder sends the URL with the destination path", async () => {
  const h = harness();
  h.session.setUrl("https://github.com/acme/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([]) })), refused("destination_exists"));
  await h.session.findRepository();
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/Users/ada/studio"]]) })));
  h.queue.select!.push(ok(op("project_select", { project: { root: "/Users/ada/studio" } })));
  await h.session.useExisting();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ path: "/Users/ada/studio", url: "https://github.com/acme/studio" });
});

test("Choose another folder on a found checkout keeps the URL; a plain Choose folder does not send one", async () => {
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

test("a folder recovery on a URL screen sends the URL too (not available, setup failed, unreadable configuration, cancelled clone)", async () => {
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

test("a cancelled clone's Choose local folder keeps the URL", async () => {
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

test("a refused completion for no ready agent is cleared once an agent is ready again", async () => {
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

test("Back from a cancelled or failed clone returns to the editable URL, and the old inspection is gone", async () => {
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
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toEqual({ sessionId: "s1", requestId: expect.any(String), url: "https://github.com/acme/studio", storage: "repo" });
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
  expect(h.session.state.error).toEqual({ code: "access_failed", source: "url" });
  h.session.setUrl("https://github.com/git/git");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/git"]]) })));
  await h.session.retry();
  expect(h.api.cloneOnboardingProject).toHaveBeenCalledTimes(1);
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toEqual({ sessionId: "s1", requestId: expect.any(String), url: "https://github.com/git/git", storage: "repo" });
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


test("the main checkout is read from the folder list's git facts", () => {
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

test("Back from a URL setup screen returns to the editable URL; a folder setup does not", async () => {
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

const footerState = (phase: ProjectStepState["phase"], error: ProjectStepState["error"] = null): ProjectStepState => ({ phase, url: "", inspectedUrl: null, error, listChoice: null });
const idle = { busy: false, agentReady: true };
const cand: ProjectStepState["phase"] = { kind: "candidates", inspectionId: "i", url: null, candidates: [{ path: "/w/a", changes: [] }], choice: "/w/a" };
const clonePlan = { kind: "clone", url: "https://github.com/o/r", inspectionId: "i", destination: "/w/r" } as const;
const unplannedClone = { ...clonePlan, inspectionId: null };
const setup: ProjectStepState["phase"] = { kind: "setup", inspectionId: "i", url: null, path: "/w/a", changes: [] };
const cloning = { kind: "cloning", url: "https://github.com/o/r", destination: "/w/r", operationId: "op", cancelling: false } as const;
const cancelled = { kind: "cloneCancelled", url: "https://github.com/o/r", destination: "/w/r" } as const;
const back = (disabled: boolean) => ({ label: "Back", disabled });
const openDoan = (disabled: boolean) => ({ label: "Open Doan", action: "complete", disabled });

test("first run's footer is Back and the step's action, as before the Add Projects page", () => {
  for (const phase of [{ kind: "choose" }, { kind: "checking", path: "/w/a" }, setup, { kind: "selecting", path: "/w/a" }] as const)
    expect(projectFooter("onboarding", footerState(phase), idle)).toEqual({ back: back(false), primary: openDoan(true) });
  expect(projectFooter("onboarding", footerState({ kind: "inspecting", url: "u" }), { busy: true, agentReady: true })).toEqual({ back: back(true), primary: openDoan(true) });
  expect(projectFooter("onboarding", footerState(cand), idle)).toEqual({ back: back(false), primary: { label: "Use this folder", action: "select", disabled: false } });
  expect(projectFooter("onboarding", footerState(cand), { busy: true, agentReady: true })).toEqual({ back: back(true), primary: { label: "Use this folder", action: "select", disabled: true } });
  const clone = (disabled: boolean) => ({ label: "Clone and continue", action: "clone", disabled });
  expect(projectFooter("onboarding", footerState(clonePlan), idle)).toEqual({ back: back(false), primary: clone(false) });
  expect(projectFooter("onboarding", footerState(unplannedClone), idle)).toEqual({ back: back(false), primary: clone(true) });
  expect(projectFooter("onboarding", footerState(clonePlan, { code: "destination_exists" }), idle)).toEqual({ back: back(false), primary: clone(true) });
  expect(projectFooter("onboarding", footerState(cloning), { busy: true, agentReady: true })).toEqual({ back: back(true), primary: clone(true) });
  expect(projectFooter("onboarding", footerState(cancelled), idle)).toEqual({ back: back(false), primary: clone(true) });
  expect(projectFooter("onboarding", footerState({ kind: "ready", root: "/w/a" }), idle)).toEqual({ back: back(false), primary: openDoan(false) });
  expect(projectFooter("onboarding", footerState({ kind: "ready", root: "/w/a" }), { busy: false, agentReady: false })).toEqual({ back: back(false), primary: openDoan(true) });
  expect(projectFooter("onboarding", footerState({ kind: "ready", root: "/w/a" }, { code: "completion_unsupported_version" }), idle)).toEqual({ back: back(false), primary: openDoan(true) });
  expect(projectFooter("onboarding", footerState({ kind: "ready", root: "/w/a" }, { code: "completion_save_failed" }), idle)).toEqual({ back: back(false), primary: { label: "Retry", action: "retry", disabled: false } });
  expect(projectFooter("onboarding", footerState({ kind: "completing", root: "/w/a" }), { busy: true, agentReady: true })).toEqual({ back: back(true), primary: openDoan(true) });
});

// The page's one submit: "Add project" at the bottom right in every unlocked phase, enabled only when it can add.
test("the Add Projects page footer is Cancel and Add project, enabled only when it can add, and none while locked", () => {
  const cancel = { label: "Cancel", disabled: false };
  const off = { back: cancel, primary: { label: "Add project", action: null, disabled: true } };
  // The first screen and the checks have nothing to add yet; Cancel stays usable while a check runs.
  expect(projectFooter("addPage", footerState({ kind: "choose" }), idle)).toEqual(off);
  for (const phase of [{ kind: "inspecting", url: "u" }, { kind: "checking", path: "/w/a" }] as const)
    expect(projectFooter("addPage", footerState(phase), { busy: true, agentReady: true })).toEqual(off);
  // A candidate list always has a pick; a set-up folder or a found checkout is one candidate.
  expect(projectFooter("addPage", footerState(cand), idle)).toEqual({ back: cancel, primary: { label: "Add project", action: "select", disabled: false } });
  // The setup panel's press is the consent, for the inspection the screen was rendered with.
  expect(projectFooter("addPage", footerState(setup), idle)).toEqual({ back: cancel, primary: { label: "Add project", action: "setUp", inspectionId: "i", disabled: false } });
  expect(projectFooter("addPage", footerState(clonePlan), idle)).toEqual({ back: cancel, primary: { label: "Add project", action: "clone", disabled: false } });
  // A cancelled clone can still be cloned: its notice is a status, and the press clones again.
  expect(projectFooter("addPage", footerState(cancelled), idle)).toEqual({ back: cancel, primary: { label: "Add project", action: "clone", disabled: false } });
  // Off while the clone is planned, while the step is busy, and while an error notice shows.
  expect(projectFooter("addPage", footerState(unplannedClone), idle)!.primary).toMatchObject({ action: "clone", disabled: true });
  expect(projectFooter("addPage", footerState(cand), { busy: true, agentReady: true })!.primary).toMatchObject({ action: "select", disabled: true });
  expect(projectFooter("addPage", footerState(setup), { busy: true, agentReady: true })!.primary).toMatchObject({ action: "setUp", disabled: true });
  expect(projectFooter("addPage", footerState(cand, { code: "remote_mismatch" }), idle)!.primary).toMatchObject({ disabled: true });
  expect(projectFooter("addPage", footerState(setup, { code: "init_failed" }), idle)!.primary).toMatchObject({ disabled: true });
  expect(projectFooter("addPage", footerState(clonePlan, { code: "destination_exists" }), idle)!.primary).toMatchObject({ disabled: true });
  expect(projectFooter("addPage", footerState({ kind: "choose" }, { code: "invalid_url", source: "url" }), idle)).toEqual(off);
  // Writing the setup, cloning and stopping a clone lock the page: no footer.
  expect(projectFooter("addPage", footerState({ kind: "selecting", path: "/w/a" }), idle)).toBeNull();
  expect(projectFooter("addPage", footerState(cloning), idle)).toBeNull();
  expect(projectFooter("addPage", footerState({ ...cloning, cancelling: true }), idle)).toBeNull();
});

test("the no-agent notice belongs to first run only", () => {
  const ready = footerState({ kind: "ready", root: "/w/a" });
  expect(projectNoticeCode("onboarding", ready, false)).toBe("no_ready_agent");
  expect(projectNoticeCode("onboarding", ready, true)).toBeNull();
  expect(projectNoticeCode("onboarding", footerState({ kind: "choose" }), false)).toBeNull();
  expect(projectNoticeCode("onboarding", footerState(clonePlan, { code: "destination_exists" }), false)).toBe("destination_exists");
  expect(projectNoticeCode("addPage", ready, false)).toBeNull();
  expect(projectNoticeCode("addPage", footerState({ kind: "ready", root: "/w/a" }, { code: "no_ready_agent" }), true)).toBeNull();
  expect(projectNoticeCode("addPage", footerState(clonePlan, { code: "destination_exists" }), true)).toBe("destination_exists");
});

// The same session over the page's main instance.
function pageHarness() {
  let listener: ((state: { sessionId: string; revision: number; project: null; operations: OnboardingOperation[] }) => void) | null = null;
  const queue: Record<string, Reply[]> = { inspect: [], select: [], clone: [], cancel: [] };
  const next = (name: string) => queue[name]!.shift() ?? refused("bad_request");
  const doan = {
    readAddPage: vi.fn(),
    onAddPageSession: vi.fn((l: typeof listener) => { listener = l; return () => { listener = null; }; }),
    inspectAddPageProject: vi.fn(async (_r: unknown) => next("inspect")),
    selectAddPageProject: vi.fn(async (_r: unknown) => next("select")),
    cloneAddPageProject: vi.fn(async (_r: unknown) => next("clone")),
    cancelAddPageOperation: vi.fn(async (_r: unknown) => next("cancel")),
    chooseOnboardingFolder: vi.fn(async (_p: "project" | "destination"): Promise<string | null> => null),
  };
  let ids = 0, revision = 0;
  const completed = vi.fn(), changed = vi.fn();
  const session = new ProjectStepSession({ api: addPageApi(doan as never), use: "addPage", sessionId: "p1", projects: () => [], homeDirectory: () => "/Users/ada", requestId: () => `req-${++ids}`, changed, completed });
  session.start();
  return { session, doan, queue, completed, changed, emit(operations: OnboardingOperation[]) { listener?.({ sessionId: "p1", revision: ++revision, project: null, operations }); } };
}
const folder = (path: string) => ({ isDirectory: true, path });

// The page adds nothing until Add project is pressed: a set-up folder waits on its candidate screen.
test("the page session talks to the page instance, waits for Add project on a set-up folder, then hands the root over without a ready step", async () => {
  const h = pageHarness();
  h.doan.chooseOnboardingFolder.mockResolvedValueOnce("/code/app");
  const found = inspection([["/code/app"]]);
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: found })));
  h.queue.select!.push(ok(op("project_select", { project: { root: "/code/app" } })));
  await h.session.chooseFolder();
  expect(h.doan.inspectAddPageProject.mock.calls[0]![0]).toEqual({ sessionId: "p1", requestId: "req-1", path: "/code/app", storage: "repo" });
  expect(h.doan.selectAddPageProject).not.toHaveBeenCalled();
  expect(h.completed).not.toHaveBeenCalled();
  expect(h.session.state.phase).toMatchObject({ kind: "candidates", candidates: [{ path: "/code/app", changes: [] }], choice: "/code/app" });
  await h.session.select();
  expect(h.doan.selectAddPageProject.mock.calls[0]![0]).toEqual({ sessionId: "p1", requestId: "req-2", inspectionId: found.inspectionId, path: "/code/app", storage: "repo" });
  expect(h.completed).toHaveBeenCalledWith("/code/app");
  expect(phase(h as never).kind).not.toBe("ready");
});

test("the page: a folder that needs setup goes to setup, a plain folder too, an unreadable one says project_unavailable", async () => {
  for (const [path, changes] of [["/code/plain", [".doan/config.json", ".doan/canvases/"]], ["/code/repo", [".doan/config.json"]]] as const) {
    const h = pageHarness();
    h.doan.chooseOnboardingFolder.mockResolvedValueOnce(path);
    h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([[path, [...changes]]]) })));
    await h.session.chooseFolder();
    expect(h.session.state.phase.kind).toBe("setup");
    expect(h.completed).not.toHaveBeenCalled();
  }
  const h = pageHarness();
  h.doan.chooseOnboardingFolder.mockResolvedValueOnce("/code/locked");
  h.queue.inspect!.push(ok(op("project_inspect", { state: "failed", error: { code: "project_unavailable", message: "m" } })));
  await h.session.chooseFolder();
  expect(h.session.state).toMatchObject({ phase: { kind: "choose" }, error: { code: "project_unavailable" } });
});

test("a folder dropped on the card is inspected like a chosen one; a refused drop leaves a notice the next drag or Choose folder clears", async () => {
  const h = pageHarness();
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/app", [".doan/config.json"]]]) })));
  expect(h.session.canDrop()).toBe(true);
  await h.session.drop([folder("/code/app")]);
  expect(h.doan.inspectAddPageProject.mock.calls[0]![0]).toMatchObject({ path: "/code/app" });
  expect(h.session.state.phase.kind).toBe("setup");
  const g = pageHarness();
  await g.session.drop([folder("/a"), folder("/b")]);
  expect(g.session.dropNotice).toBe("Drop one folder at a time.");
  g.session.dragStarted();
  expect(g.session.dropNotice).toBeNull();
  await g.session.drop([{ isDirectory: false, path: "/a/file.txt" }]);
  expect(g.session.dropNotice).toBe("Only folders can be added.");
  await g.session.chooseFolder();
  expect(g.session.dropNotice).toBeNull();
  expect(g.doan.inspectAddPageProject).not.toHaveBeenCalled();
});

test("a drop is refused while the step is busy, and a second quick drop while the first is inspected is ignored", async () => {
  const h = pageHarness();
  let answer: (reply: OnboardingResponse) => void = () => {};
  h.queue.inspect!.push(new Promise<OnboardingResponse>(resolve => { answer = resolve; }));
  const first = h.session.drop([folder("/code/a")]);
  expect(h.session.state.phase.kind).toBe("checking");
  expect(h.session.canDrop()).toBe(false);
  await h.session.drop([folder("/code/b")]);
  expect(h.doan.inspectAddPageProject).toHaveBeenCalledTimes(1);
  answer(ok(op("project_inspect", { inspection: inspection([["/code/a", [".doan/config.json"]]]) })));
  await first;
  // Only the choose screen shows the card.
  expect(h.session.canDrop()).toBe(false);
});

// Find repository starts a new action, so the last drop notice goes with it (both uses).
test("Find repository clears a refused drop's notice, on the page and in first run", async () => {
  const page = pageHarness();
  await page.session.drop([folder("/a"), folder("/b")]);
  page.session.setUrl("https://github.com/acme/studio");
  void page.session.findRepository();
  expect(page.session.dropNotice).toBeNull();
  const first = harness();
  await first.session.drop([{ isDirectory: false, path: "/a/file.txt" }]);
  expect(first.session.dropNotice).toBe("Only folders can be added.");
  first.session.setUrl("https://github.com/acme/studio");
  void first.session.findRepository();
  expect(first.session.dropNotice).toBeNull();
});

// PRODUCT §5 item 0 'Doan files': the choice is the screen's; a plan made for the other mode is made again before setup
// or clone writes anything, and the choice outlives a refused setup.
const LOCAL = [".doan/canvases/", ".doan/config.json", ".git/info/exclude"];
const REPO = [".doan/canvases/", ".doan/config.json", ".gitattributes"];
test("setting up out of Git plans again for that mode and selects with the storage it showed", async () => {
  const h = harness();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/app");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/app", REPO]]) })));
  await h.session.chooseFolder();
  expect(phase(h)).toMatchObject({ kind: "setup", path: "/code/app", changes: REPO });
  h.session.setStorage("local");
  const local = { inspectionId: "i-local", candidates: [{ path: "/code/app", changes: LOCAL as never, storage: "local" as const }] };
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: local })));
  h.queue.select!.push(ok(op("project_select", { project: { root: "/code/app" } })));
  await setUp(h);
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toEqual({ sessionId: "s1", requestId: expect.any(String), path: "/code/app", storage: "local" });
  expect(h.api.selectOnboardingProject.mock.calls.at(-1)![0]).toEqual({ sessionId: "s1", requestId: expect.any(String), inspectionId: "i-local", path: "/code/app", initialize: true, storage: "local" });
  expect(phase(h)).toEqual({ kind: "ready", root: "/code/app" });
});

test("a project already kept out of Git is set up as it is, whatever the choice", async () => {
  const h = harness();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/app-x");
  const kept = { inspectionId: "i-kept", candidates: [{ path: "/code/app-x", changes: [".doan/canvases/", ".doan/config.json"] as never, storage: "local" as const }] };
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: kept })));
  h.queue.select!.push(ok(op("project_select", { project: { root: "/code/app-x" } })));
  await h.session.chooseFolder();
  expect(phase(h)).toMatchObject({ kind: "setup", storage: "local" });
  await setUp(h);
  expect(h.api.inspectOnboardingProject).toHaveBeenCalledTimes(1);
  expect(h.api.selectOnboardingProject.mock.calls[0]![0]).toMatchObject({ inspectionId: "i-kept", initialize: true, storage: "local" });
});

test("a refused local setup keeps the choice and its reason on the setup screen", async () => {
  const h = harness();
  h.session.setStorage("local");
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/notes");
  const local = { inspectionId: "i-1", candidates: [{ path: "/code/notes", changes: LOCAL as never, storage: "local" as const }] };
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: local })));
  h.queue.select!.push(ok(op("project_select", { state: "failed", error: { code: "local_not_git", message: "m" } })));
  await h.session.chooseFolder();
  await setUp(h);
  expect(h.api.inspectOnboardingProject).toHaveBeenCalledTimes(1);
  expect(h.session.state).toMatchObject({ storage: "local", phase: { kind: "setup", path: "/code/notes" }, error: { code: "local_not_git" } });
});

test("a clone planned for one mode is planned again for the one chosen, and the choice cannot change while it runs", async () => {
  const h = harness();
  h.session.setUrl("https://github.com/acme/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([]) })));
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([], "/Users/ada/studio") })));
  await h.session.findRepository();
  expect(phase(h)).toMatchObject({ kind: "clone", planned: "repo" });
  h.session.setStorage("local");
  const plan = { inspectionId: "i-clone", candidates: [], clone: { destination: "/Users/ada/studio", changes: LOCAL as never, storage: "local" as const } };
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: plan })));
  let finish!: (reply: OnboardingResponse) => void;
  h.queue.clone!.push(new Promise(resolve => { finish = resolve; }));
  const cloning = h.session.clone();
  await flush();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ url: "https://github.com/acme/studio", destination: "/Users/ada/studio", storage: "local" });
  expect(h.api.cloneOnboardingProject.mock.calls[0]![0]).toMatchObject({ inspectionId: "i-clone", destination: "/Users/ada/studio", storage: "local" });
  h.session.setStorage("repo");
  expect(h.session.state.storage).toBe("local");
  finish(ok(op("project_clone", { project: { root: "/Users/ada/studio" } })));
  await cloning;
  expect(phase(h)).toEqual({ kind: "ready", root: "/Users/ada/studio" });
});

// Outside Git the plan for Keep out of Git names .git/, which the panel shows as a line
// under the card. The line follows the radio at once, so the choice plans again; the consent never covers a .git/ the
// screen did not show; and a failed creation reads the folder again, since a .git it left makes it a repository.
const CREATE = [".doan/canvases/", ".doan/config.json", ".git/", ".git/info/exclude"];
const planOf = (id: string, changes: string[], storage?: "local") => ({ inspectionId: id, candidates: [{ path: "/code/new", changes: changes as never, ...(storage ? { storage } : {}) }] });
async function onSetup(h: ReturnType<typeof harness>, changes: string[], storage?: "local") {
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/new");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: planOf("i-0", changes, storage) })));
  await h.session.chooseFolder();
}

test("choosing another mode on the setup screen plans again for it, so the git init line follows the radio", async () => {
  const h = harness();
  await onSetup(h, REPO);
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: planOf("i-local", CREATE, "local") })));
  // It says it plans again, so the screen can give the radio focus back once the radios are enabled again.
  expect(h.session.setStorage("local")).toBe(true);
  await flush(); await flush();
  expect(h.api.inspectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ path: "/code/new", storage: "local" });
  expect(phase(h)).toMatchObject({ kind: "setup", inspectionId: "i-local", changes: CREATE, storage: "local" });
  // Choosing the mode already planned plans nothing.
  expect(h.session.setStorage("local")).toBe(false);
  await flush(); await flush();
  expect(h.api.inspectOnboardingProject).toHaveBeenCalledTimes(2);
  expect(h.api.selectOnboardingProject).not.toHaveBeenCalled();
});

// The radio and Set up in the same task: Set up plans again before it writes, and a plan that now creates a repository
// waits for another press.
test("Keep out of Git chosen and Set up pressed in one task plans again and stops before creating a repository", async () => {
  const h = harness();
  await onSetup(h, REPO);
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: planOf("i-local", CREATE, "local") })));
  h.session.setStorage("local");
  const pressed = setUp(h);
  await pressed; await flush(); await flush();
  expect(h.api.selectOnboardingProject).not.toHaveBeenCalled();
  expect(h.api.inspectOnboardingProject).toHaveBeenCalledTimes(2);
  expect(phase(h)).toMatchObject({ kind: "setup", inspectionId: "i-local", changes: CREATE, storage: "local" });
});

// A plan the radio asked for that cannot be made leaves the person on the setup screen, with Retry planning again.
test("a plan the radio asked for that fails keeps the setup screen, and Retry plans again", async () => {
  const h = harness();
  await onSetup(h, REPO);
  h.queue.inspect!.push(ok(op("project_inspect", { state: "failed", error: { code: "project_unavailable", message: "Gone." } })));
  h.session.setStorage("local");
  await flush(); await flush(); await flush();
  expect(h.session.state).toMatchObject({ phase: { kind: "setup", inspectionId: "i-0", changes: REPO }, error: { code: "project_unavailable" } });
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: planOf("i-local", CREATE, "local") })));
  await h.session.retry();
  expect(h.session.state).toMatchObject({ phase: { kind: "setup", inspectionId: "i-local", changes: CREATE }, error: null });
});

test("a plan made again at Set up that now creates a repository stops on the setup screen until it is pressed again", async () => {
  const h = harness();
  await onSetup(h, REPO);
  h.session.state = { ...h.session.state, storage: "local" };
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: planOf("i-local", CREATE, "local") })));
  await setUp(h);
  expect(h.api.selectOnboardingProject).not.toHaveBeenCalled();
  expect(phase(h)).toMatchObject({ kind: "setup", inspectionId: "i-local", changes: CREATE });
  h.queue.select!.push(ok(op("project_select", { project: { root: "/code/new" } })));
  await setUp(h);
  expect(h.api.selectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ inspectionId: "i-local", initialize: true, storage: "local" });
});

test("a failed setup that was to create a repository reads the folder again and keeps its notice; Retry sets up the new plan", async () => {
  const h = harness();
  h.session.setStorage("local");
  await onSetup(h, CREATE, "local");
  const left = "Setup failed, and Doan couldn’t remove the Git repository it created at /code/new/.git. Remove it or keep it, then try again.";
  h.queue.select!.push(ok(op("project_select", { state: "failed", error: { code: "cleanup_failed", message: left } })));
  const after = [".doan/canvases/", ".doan/config.json", ".git/info/exclude"];
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: planOf("i-after", after, "local") })));
  await setUp(h);
  expect(h.api.inspectOnboardingProject).toHaveBeenCalledTimes(2);
  expect(h.session.state).toMatchObject({ phase: { kind: "setup", inspectionId: "i-after", changes: after }, error: { code: "cleanup_failed", message: left } });
  h.queue.select!.push(ok(op("project_select", { project: { root: "/code/new" } })));
  await h.session.retry();
  expect(h.api.selectOnboardingProject.mock.calls.at(-1)![0]).toMatchObject({ inspectionId: "i-after", initialize: true, storage: "local" });
  expect(phase(h)).toEqual({ kind: "ready", root: "/code/new" });
});

// Where a failure came from decides where its notice sits; the code alone cannot tell (the same codes come from both).
test("a failure records whether it came from a folder or a URL", async () => {
  const chosen = pageHarness();
  chosen.doan.chooseOnboardingFolder.mockResolvedValueOnce("/code/locked");
  chosen.queue.inspect!.push(ok(op("project_inspect", { state: "failed", error: { code: "project_unavailable", message: "m" } })));
  await chosen.session.chooseFolder();
  expect(chosen.session.state.error).toMatchObject({ code: "project_unavailable", source: "folder" });
  const dropped = pageHarness();
  dropped.queue.inspect!.push(ok(op("project_inspect", { state: "failed", error: { code: "config_invalid", message: "m" } })));
  await dropped.session.drop([folder("/code/broken")]);
  expect(dropped.session.state.error).toMatchObject({ code: "config_invalid", source: "folder" });
  // First run's 'Your projects' pick is a folder too.
  const listed = harness(["/code/gone"]);
  listed.session.pickListed("/code/gone");
  listed.queue.inspect!.push(ok(op("project_inspect", { state: "failed", error: { code: "project_unavailable", message: "m" } })));
  await listed.session.useListed();
  expect(listed.session.state.error).toMatchObject({ code: "project_unavailable", source: "folder" });
  // The same code from a URL lookup belongs to the URL.
  const url = pageHarness();
  url.session.setUrl("https://github.com/acme/studio");
  url.queue.inspect!.push(ok(op("project_inspect", { state: "failed", error: { code: "project_unavailable", message: "m" } })));
  await url.session.findRepository();
  expect(url.session.state).toMatchObject({ phase: { kind: "choose" }, error: { code: "project_unavailable", source: "url" } });
  const invalid = pageHarness();
  invalid.session.setUrl("github.com/acme");
  await invalid.session.findRepository();
  expect(invalid.session.state.error).toMatchObject({ code: "invalid_url", source: "url" });
  const unreachable = pageHarness();
  unreachable.session.setUrl("https://github.com/acme/private");
  unreachable.queue.inspect!.push(ok(op("project_inspect", { state: "failed", error: { code: "repository_unreachable", message: "m" } })));
  await unreachable.session.findRepository();
  expect(unreachable.session.state.error).toMatchObject({ code: "access_failed", source: "url" });
});

test("a folder's notice sits under the card, a URL's after the URL field, and any other screen keeps its own place", () => {
  const at = (phase: ProjectStepState["phase"], error: ProjectStepState["error"]) => projectNoticeSlot(footerState(phase, error));
  expect(at({ kind: "choose" }, { code: "project_unavailable", source: "folder" })).toBe("card");
  expect(at({ kind: "choose" }, { code: "project_unavailable", source: "url" })).toBe("url");
  expect(at({ kind: "choose" }, { code: "invalid_url", source: "url" })).toBe("url");
  expect(at({ kind: "choose" }, { code: "access_failed", source: "url" })).toBe("url");
  expect(at({ kind: "choose" }, null)).toBeNull();
  expect(at(setup, { code: "init_failed", source: "folder" })).toBe("screen");
  expect(at(clonePlan, { code: "clone_failed", source: "url" })).toBe("screen");
  expect(at(cand, { code: "project_unavailable", source: "folder" })).toBe("screen");
});

// The drop notice and a folder's error share the slot under the card: the later replaces the earlier.
test("a refused drop and a folder's failure clear each other; a URL's failure is left alone", async () => {
  const h = pageHarness();
  h.doan.chooseOnboardingFolder.mockResolvedValueOnce("/code/locked");
  h.queue.inspect!.push(ok(op("project_inspect", { state: "failed", error: { code: "project_unavailable", message: "m" } })));
  await h.session.chooseFolder();
  expect(h.session.state.error).toMatchObject({ source: "folder" });
  await h.session.drop([folder("/a"), folder("/b")]);
  expect(h.session.dropNotice).toBe("Drop one folder at a time.");
  expect(h.session.state.error).toBeNull();
  // A folder that then fails replaces the drop notice.
  h.queue.inspect!.push(ok(op("project_inspect", { state: "failed", error: { code: "config_invalid", message: "m" } })));
  await h.session.drop([folder("/code/broken")]);
  expect(h.session.dropNotice).toBeNull();
  expect(h.session.state.error).toMatchObject({ code: "config_invalid", source: "folder" });
  // A URL's error has its own place, so a refused drop keeps it.
  const u = pageHarness();
  u.session.setUrl("github.com/acme");
  await u.session.findRepository();
  await u.session.drop([{ isDirectory: false, path: "/a/file.txt" }]);
  expect(u.session.dropNotice).toBe("Only folders can be added.");
  expect(u.session.state.error).toMatchObject({ code: "invalid_url", source: "url" });
});

// A candidate that needs setup opens its panel on the first Add project; the second, on that panel, is the consent.
test("the page: a candidate that needs setup takes two presses, the second carrying the panel's inspection", async () => {
  const h = pageHarness();
  h.doan.chooseOnboardingFolder.mockResolvedValueOnce("/work");
  const found = inspection([["/work/a", [".doan/config.json"]], ["/work/b"]]);
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: found })));
  await h.session.chooseFolder();
  expect(h.session.state.phase).toMatchObject({ kind: "candidates", choice: "/work/a" });
  const first = projectFooter("addPage", h.session.state, { busy: h.session.busy(), agentReady: true })!.primary!;
  expect(first).toMatchObject({ label: "Add project", action: "select", disabled: false });
  await h.session.select();
  expect(h.doan.selectAddPageProject).not.toHaveBeenCalled();
  expect(h.session.state.phase).toMatchObject({ kind: "setup", path: "/work/a", inspectionId: found.inspectionId });
  const second = projectFooter("addPage", h.session.state, { busy: h.session.busy(), agentReady: true })!.primary!;
  expect(second).toEqual({ label: "Add project", action: "setUp", inspectionId: found.inspectionId, disabled: false });
  h.queue.select!.push(ok(op("project_select", { project: { root: "/work/a" } })));
  await h.session.setUp(second.inspectionId!);
  expect(h.doan.selectAddPageProject.mock.calls[0]![0]).toMatchObject({ path: "/work/a", inspectionId: found.inspectionId, initialize: true });
  expect(h.completed).toHaveBeenCalledWith("/work/a");
});

// First run keeps its shipped path: a set-up folder is selected at once.
test("first run still selects a set-up folder at once", async () => {
  const h = harness();
  h.api.chooseOnboardingFolder.mockResolvedValueOnce("/code/app");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/app"]]) })));
  h.queue.select!.push(ok(op("project_select", { project: { root: "/code/app" } })));
  await h.session.chooseFolder();
  expect(h.api.selectOnboardingProject).toHaveBeenCalledTimes(1);
  expect(phase(h)).toEqual({ kind: "ready", root: "/code/app" });
});
