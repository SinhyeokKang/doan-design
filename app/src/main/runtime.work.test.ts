import { afterEach, describe, expect, test, vi } from "vitest";
import { answerLine, AUTO_REGISTER_WAIT_MS } from "./runtime";
import type { OnboardingResponse, OpenResponse } from "../formats/types";
import type { FolderState } from "./folderState";
const token = "secret", root = "/repo", path = ".doan/canvases/a.html";
const request = { v: 3, token, root, action: "start", path };
const state = () => ({ isOpen: vi.fn((value: string) => value === root), selection: () => null, work: vi.fn(), onboarding: async (): Promise<OnboardingResponse> => ({ v: 2, ok: false, error: { code: "bad_request", message: "unused" } }),
  open: async (): Promise<OpenResponse> => ({ v: 4, ok: false, error: { code: "busy", message: "unused" } }),
  roots: () => [root], readRoot: vi.fn(async (): Promise<FolderState> => ({ kind: "uninitialized" })), adopt: vi.fn() });
test("v3 validates schema, then token, then registered root, before applying work", async () => {
  const service = state();
  const response = (value: unknown) => answerLine(JSON.stringify(value), token, service);
  expect(await response({ ...request, path: "outside.html", token: "wrong" })).toMatchObject({ v: 3, ok: false, error: { code: "bad_request" } });
  expect(await response({ ...request, token: "wrong", root: "/closed" })).toMatchObject({ v: 3, ok: false, error: { code: "bad_token" } });
  expect(service.isOpen).not.toHaveBeenCalled();
  expect(await response({ ...request, root: "/closed" })).toMatchObject({ v: 3, ok: false, error: { code: "project_not_open" } });
  expect(service.work).not.toHaveBeenCalled();
  expect(await response(request)).toEqual({ v: 3, ok: true });
  expect(service.work).toHaveBeenCalledWith(request);
  expect(await response({ v: 3, token, root, action: "done" })).toEqual({ v: 3, ok: true });
});
test("non-numeric or unknown versions keep the v1 refusal", async () => {
  for (const v of ["3", 5, null]) expect(await answerLine(JSON.stringify({ ...request, v }), token, state())).toMatchObject({ v: 1, ok: false, error: { code: "bad_request" } });
});

// ARCHITECTURE §4 'Auto-registration': a `start` from an unregistered worktree of a saved repository registers it.
describe("auto-registration", () => {
  const W = "/orca/workspaces/repo/w1";
  const start = { v: 3, token, root: W, action: "start", path, session: "s1", provider: "claude" };
  const done = { v: 3, token, root: W, action: "done", session: "s1", provider: "claude" };
  const worktree = (worktrees: string[], listed = W): FolderState =>
    ({ kind: "list", root: listed, scope: [".doan/canvases"], canvases: [], git: { common: "/repo/.git", main: root, worktrees } });

  // A registry the fake adopt really changes, and a read the test settles.
  function registry(read: FolderState = worktree([root, W])) {
    const roots = [root];
    const events: string[] = [];
    let settle: (view: FolderState) => void = () => {};
    const service = {
      ...state(),
      isOpen: vi.fn((value: string) => roots.includes(value)),
      roots: () => [...roots],
      readRoot: vi.fn((_root: string) => new Promise<FolderState>((resolve) => { settle = resolve; })),
      adopt: vi.fn((value: string) => { events.push(`adopt ${value}`); roots.push(value); }),
      work: vi.fn((value: { action: string; root: string }) => { events.push(`${value.action} ${value.root}`); }),
    };
    const send = (value: unknown) => answerLine(JSON.stringify(value), token, service);
    return { service, roots, events, send, settle: (view: FolderState = read) => settle(view) };
  }

  afterEach(() => { vi.useRealTimers(); });

  test("a worktree of a registered root is adopted, then its work applies and the start is delivered", async () => {
    const { service, events, send, settle } = registry();
    const answer = send(start);
    await vi.waitFor(() => expect(service.readRoot).toHaveBeenCalledExactlyOnceWith(W));
    settle();
    expect(await answer).toEqual({ v: 3, ok: true });
    expect(service.adopt).toHaveBeenCalledExactlyOnceWith(W, worktree([root, W]));
    expect(events).toEqual([`adopt ${W}`, `start ${W}`]);
    expect(service.work).toHaveBeenCalledWith(start);
  });

  test("a token mismatch never reads the root", async () => {
    const { service, send } = registry();
    expect(await send({ ...start, token: "wrong" })).toMatchObject({ v: 3, ok: false, error: { code: "bad_token" } });
    expect(service.readRoot).not.toHaveBeenCalled();
  });

  test("done never registers", async () => {
    const { service, send } = registry();
    expect(await send(done)).toMatchObject({ v: 3, ok: false, error: { code: "project_not_open" } });
    expect(service.readRoot).not.toHaveBeenCalled();
    expect(service.work).not.toHaveBeenCalled();
  });

  test("with no registered root nothing is read", async () => {
    const { service, roots, send } = registry();
    roots.length = 0;
    expect(await send(start)).toMatchObject({ v: 3, ok: false, error: { code: "project_not_open" } });
    expect(service.readRoot).not.toHaveBeenCalled();
  });

  test.each<[string, FolderState]>([
    ["another repository", worktree([W])],
    ["another doan root of the same checkout", worktree([W, "/orca/workspaces/repo/w2/web"])],
    ["no git metadata", { kind: "list", root: W, scope: [], canvases: [] }],
    ["an uninitialized root", { kind: "uninitialized" }],
    ["a listing whose root is not the request root", worktree([root, W], `${W}-real`)],
  ])("%s is refused and nothing is registered", async (_label, read) => {
    const { service, send, settle } = registry(read);
    const answer = send(start);
    await vi.waitFor(() => expect(service.readRoot).toHaveBeenCalled());
    settle();
    expect(await answer).toMatchObject({ v: 3, ok: false, error: { code: "project_not_open" } });
    expect(service.adopt).not.toHaveBeenCalled();
    expect(service.work).not.toHaveBeenCalled();
  });

  test("concurrent starts for one root share a single read", async () => {
    const { service, events, send, settle } = registry();
    const first = send(start);
    const second = send({ ...start, path: ".doan/canvases/b.html" });
    await vi.waitFor(() => expect(service.readRoot).toHaveBeenCalledTimes(1));
    settle();
    expect(await first).toEqual({ v: 3, ok: true });
    expect(await second).toEqual({ v: 3, ok: true });
    expect(service.readRoot).toHaveBeenCalledTimes(1);
    expect(events).toEqual([`adopt ${W}`, `start ${W}`, `start ${W}`]);
  });

  // Judged against the roots registered when the read ends: W never becomes a project of its own.
  test("Remove from Doan during the read registers nothing", async () => {
    const { service, roots, send, settle } = registry();
    const answer = send(start);
    await vi.waitFor(() => expect(service.readRoot).toHaveBeenCalled());
    roots.length = 0;
    settle();
    expect(await answer).toMatchObject({ v: 3, ok: false, error: { code: "project_not_open" } });
    expect(service.adopt).not.toHaveBeenCalled();
    expect(service.work).not.toHaveBeenCalled();
  });

  // spec decision 5: the CLI's 2 s budget has passed, but the registration and this start's work still land.
  test("past the deadline the start is refused, then registered and applied", async () => {
    vi.useFakeTimers();
    const { service, events, send, settle } = registry();
    const answer = send(start);
    await vi.advanceTimersByTimeAsync(AUTO_REGISTER_WAIT_MS);
    expect(await answer).toMatchObject({ v: 3, ok: false, error: { code: "project_not_open" } });
    expect(service.adopt).not.toHaveBeenCalled();
    settle();
    await vi.waitFor(() => expect(events).toEqual([`adopt ${W}`, `start ${W}`]));
  });

  test("the deadline is under the CLI's 2 s budget", () => {
    expect(AUTO_REGISTER_WAIT_MS).toBe(1500);
  });

  // A done dropped here would leave the late start's spinner for 5 minutes.
  test("a done during the registration applies after the start", async () => {
    vi.useFakeTimers();
    const { service, events, send, settle } = registry();
    const started = send(start);
    await vi.advanceTimersByTimeAsync(AUTO_REGISTER_WAIT_MS);
    expect(await started).toMatchObject({ ok: false });
    const finished = send(done);
    await vi.advanceTimersByTimeAsync(0);
    expect(service.readRoot).toHaveBeenCalledTimes(1);
    settle();
    expect(await finished).toEqual({ v: 3, ok: true });
    expect(events).toEqual([`adopt ${W}`, `start ${W}`, `done ${W}`]);
  });

  test("a read that fails registers nothing and answers project_not_open", async () => {
    const { service, send } = registry();
    service.readRoot.mockRejectedValueOnce(new Error("spawn failed"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await send(start)).toMatchObject({ v: 3, ok: false, error: { code: "project_not_open" } });
    expect(service.adopt).not.toHaveBeenCalled();
    error.mockRestore();
  });

  test("a later start after the registration needs no read", async () => {
    const { service, send, settle } = registry();
    const first = send(start);
    await vi.waitFor(() => expect(service.readRoot).toHaveBeenCalled());
    settle();
    await first;
    expect(await send({ ...start, path: ".doan/canvases/b.html" })).toEqual({ v: 3, ok: true });
    expect(service.readRoot).toHaveBeenCalledTimes(1);
  });
});
