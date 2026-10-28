import { expect, test, vi } from "vitest";
import type { OnboardingOperation, OnboardingResponse, OnboardingState } from "../formats/types";
import { ProjectStepSession } from "./projectStep";

type Reply = OnboardingResponse | Promise<OnboardingResponse>;
const op = (kind: OnboardingOperation["kind"], over: Partial<OnboardingOperation> = {}): OnboardingOperation => ({ operationId: `op-${kind}-${Math.random().toString(36).slice(2)}`, requestId: "r", kind, state: "succeeded", ...over });
const ok = (operation: OnboardingOperation): OnboardingResponse => ({ v: 2, ok: true, op: operation.kind, result: { operation } } as OnboardingResponse);
const refused = (code: string): OnboardingResponse => ({ v: 2, ok: false, error: { code, message: `m:${code}` } } as OnboardingResponse);
const inspection = (candidates: [string, string[]?][], clone?: string) => ({ inspectionId: `i-${Math.random()}`, candidates: candidates.map(([path, changes]) => ({ path, changes: (changes ?? []) as never })), ...(clone ? { clone: { destination: clone, changes: [] } } : {}) });

function harness(projects: string[] = [], home: string | null = "/Users/ada") {
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
  const session = new ProjectStepSession({ api, sessionId: "s1", projects: () => projects, homeDirectory: () => home, requestId: () => `req-${++ids}`, changed: () => {}, completed });
  session.start();
  return {
    session, api, queue, completed,
    emit(operations: OnboardingOperation[], sessionId = "s1") { listener?.({ sessionId, revision: ++revision, completed: false, agents: null, project: null, operations }); },
    listening: () => listener !== null,
  };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
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
  await h.session.select(true);
  expect(h.api.selectOnboardingProject.mock.calls[0]![0]).toMatchObject({ path: "/code/plain", initialize: true });
  expect(phase(h)).toEqual({ kind: "ready", root: "/code/plain" });
});

test("several checkouts are offered as a choice and the chosen one is selected", async () => {
  const h = harness();
  h.session.setUrl("https://github.com/acme/studio");
  const found = inspection([["/code/studio"], ["/wt/studio-auth"]]);
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: found })));
  await h.session.findRepository();
  expect(phase(h)).toMatchObject({ kind: "candidates", url: "https://github.com/acme/studio", choice: "/code/studio" });
  h.session.pickCandidate("/wt/studio-auth");
  h.queue.select!.push(ok(op("project_select", { project: { root: "/wt/studio-auth" } })));
  await h.session.select();
  expect(h.api.selectOnboardingProject.mock.calls[0]![0]).toMatchObject({ path: "/wt/studio-auth" });
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
    await h.session.select(true);
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

test("a chosen checkout that needs setup asks before any select", async () => {
  const h = harness();
  h.session.setUrl("https://github.com/acme/studio");
  h.queue.inspect!.push(ok(op("project_inspect", { inspection: inspection([["/code/studio"], ["/wt/plain", [".doan/config.json"]]]) })));
  await h.session.findRepository();
  h.session.pickCandidate("/wt/plain");
  await h.session.select();
  expect(h.api.selectOnboardingProject).not.toHaveBeenCalled();
  expect(phase(h)).toMatchObject({ kind: "setup", path: "/wt/plain", url: "https://github.com/acme/studio" });
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
  await h.session.select(true);
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
