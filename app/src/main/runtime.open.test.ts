import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type { OnboardingResponse, OpenRequest, OpenResponse } from "../formats/types";
import { validateOpenResponse } from "../formats/validate";
import { OPEN_ANSWER_TIMEOUT_MS, openRequests, type OpenAsk, type OpenRequestsHost } from "./deepLinks";
import { answerLine, LINE_WAIT_MS, startRuntime, type Runtime } from "./runtime";
import type { FolderState } from "./folderState";

// canvas-open-offer T5: app-socket v4 (`doan open`), main's half. answerLine checks schema, token and registered root
// in the v3 order; openRequests (deepLinks.ts) then answers readiness and the list itself and asks the renderer, by id,
// for everything else.
const token = "secret", root = "/repo", path = ".doan/canvases/a.html";
const request: OpenRequest = { v: 4, token, root, path };
const fixtures = join(__dirname, "../../../schema/fixtures/app-socket-v4/request");
const state = (open: (request: OpenRequest) => Promise<OpenResponse> = async () => ({ v: 4, ok: true, opened: true, frame: "none" })) => ({
  isOpen: vi.fn((value: string) => value === root), selection: vi.fn(() => null), work: vi.fn(),
  onboarding: vi.fn(async (): Promise<OnboardingResponse> => ({ v: 2, ok: false, error: { code: "bad_request", message: "unused" } })),
  open: vi.fn(open),
  roots: () => [root], readRoot: vi.fn(async (): Promise<FolderState> => ({ kind: "uninitialized" })), adopt: vi.fn(),
});

test("v4 validates schema, then token, then registered root, before the open handler runs", async () => {
  const service = state();
  const response = (value: unknown) => answerLine(JSON.stringify(value), token, service);
  expect(await response({ ...request, path: "outside.html", token: "wrong" })).toEqual({ v: 4, ok: false, error: { code: "bad_request", message: "The request is not an app-socket v4 request." } });
  expect(await response({ ...request, token: "wrong", root: "/closed" })).toMatchObject({ v: 4, ok: false, error: { code: "bad_token" } });
  expect(service.isOpen).not.toHaveBeenCalled();
  expect(await response({ ...request, root: "/closed" })).toMatchObject({ v: 4, ok: false, error: { code: "project_not_open" } });
  expect(service.open).not.toHaveBeenCalled();
  expect(await response({ ...request, frame: "hero" })).toEqual({ v: 4, ok: true, opened: true, frame: "none" });
  expect(service.open).toHaveBeenCalledWith({ ...request, frame: "hero" });
});

test("every shared invalid v4 request fixture is refused as a v4 bad request, and every valid one reaches the handler", async () => {
  for (const name of readdirSync(join(fixtures, "invalid"))) {
    const value: unknown = JSON.parse(readFileSync(join(fixtures, "invalid", name), "utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value) || Reflect.get(value, "v") !== 4) continue;
    const service = state();
    expect(await answerLine(JSON.stringify(value), token, service), name).toMatchObject({ v: 4, ok: false, error: { code: "bad_request" } });
    expect(service.open, name).not.toHaveBeenCalled();
  }
  for (const name of readdirSync(join(fixtures, "valid"))) {
    const value = JSON.parse(readFileSync(join(fixtures, "valid", name), "utf8")) as OpenRequest;
    const service = state();
    service.isOpen.mockReturnValue(true);
    expect(await answerLine(JSON.stringify({ ...value, token }), token, service), name).toMatchObject({ v: 4, ok: true });
    expect(service.open, name).toHaveBeenCalledWith({ ...value, token });
  }
});

test("a throwing open handler answers a v4 bad request without its error, and v4 never starts work or onboarding", async () => {
  const service = state(async () => { throw new Error("/Users/sam/secret path"); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await answerLine(JSON.stringify(request), token, service)).toEqual({ v: 4, ok: false, error: { code: "bad_request", message: "Doan could not handle this request." } });
  expect(service.work).not.toHaveBeenCalled();
  expect(service.onboarding).not.toHaveBeenCalled();
  expect(service.selection).not.toHaveBeenCalled();
});

// openRequests: the host is everything it can touch. It reads readiness and the folder list, sends the renderer a
// request and brings the window forward; it has no way to write, send, start a conversation or change a setting.
const entries = [
  { path: root, kind: "list", canvases: [{ path }] },
  { path: "/loading", kind: "loading" },
  { path: "/other", kind: "list", canvases: [] },
];
function host(patch: Partial<OpenRequestsHost> = {}) {
  const asked: OpenAsk[] = [];
  const value = { ready: vi.fn(() => true), entries: vi.fn(() => entries), ask: vi.fn((ask: OpenAsk) => { asked.push(ask); return true; }), opened: vi.fn(), ...patch };
  return { host: value, asked };
}
const valid = (response: OpenResponse) => { expect(validateOpenResponse(response)).toBe(true); return response; };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test("before links are ready, or while the target project is read, main answers not_ready at once and asks nobody", async () => {
  const notReady = host({ ready: vi.fn(() => false) });
  expect(valid(await openRequests(notReady.host).open(request))).toEqual({ v: 4, ok: false, error: { code: "not_ready", message: "Doan is still starting. Try again shortly." } });
  const loading = host();
  expect(valid(await openRequests(loading.host).open({ ...request, root: "/loading" }))).toEqual({ v: 4, ok: false, error: { code: "not_ready", message: "Doan is still reading this project. Try again shortly." } });
  for (const { host: value } of [notReady, loading]) { expect(value.ask).not.toHaveBeenCalled(); expect(value.opened).not.toHaveBeenCalled(); }
});

test("a canvas not in the list, or a root no longer registered, is refused by main without the renderer or the window", async () => {
  const { host: value } = host();
  const requests = openRequests(value);
  expect(valid(await requests.open({ ...request, root: "/other" }))).toEqual({ v: 4, ok: false, error: { code: "canvas_not_found", message: "The canvas is not in the project's canvas list in Doan." } });
  expect(valid(await requests.open({ ...request, path: ".doan/canvases/b.html" }))).toMatchObject({ error: { code: "canvas_not_found" } });
  expect(valid(await requests.open({ ...request, root: "/gone" }))).toMatchObject({ error: { code: "project_not_open" } });
  expect(value.ask).not.toHaveBeenCalled();
  expect(value.opened).not.toHaveBeenCalled();
});

// POSTMORTEM 2026-11-03: the renderer test injects this event by hand, so main's own test pins every field it sends.
test("a listed canvas is sent to the renderer with an id, its root, its canvas path, the frame only when asked, and when main stops waiting", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000_000);
  const { host: value, asked } = host();
  const requests = openRequests(value);
  const first = requests.open({ ...request, frame: "hero" }), second = requests.open(request);
  const expires = 1_000_000 + OPEN_ANSWER_TIMEOUT_MS;
  expect(asked).toStrictEqual([{ id: expect.any(String), root, canvas: path, frame: "hero", expires }, { id: expect.any(String), root, canvas: path, expires }]);
  expect(Object.keys(asked[1]!).sort()).toEqual(["canvas", "expires", "id", "root"]);
  expect(asked[0]!.id).not.toBe(asked[1]!.id);
  requests.answer({ id: asked[0]!.id, kind: "opened", frame: "found" });
  requests.answer({ id: asked[1]!.id, kind: "opened", frame: "none" });
  expect(valid(await first)).toEqual({ v: 4, ok: true, opened: true, frame: "found" });
  expect(valid(await second)).toEqual({ v: 4, ok: true, opened: true, frame: "none" });
});

test("only an opened canvas brings the window forward, after the renderer decided", async () => {
  const { host: value, asked } = host();
  const requests = openRequests(value);
  const pending = requests.open({ ...request, frame: "gone" });
  expect(value.opened).not.toHaveBeenCalled();
  requests.answer({ id: asked[0]!.id, kind: "opened", frame: "missing" });
  expect(valid(await pending)).toEqual({ v: 4, ok: true, opened: true, frame: "missing" });
  expect(value.opened).toHaveBeenCalledTimes(1);
});

test("a renderer refusal is busy with what blocks, or canvas_not_found, and never brings the window forward", async () => {
  const { host: value, asked } = host();
  const requests = openRequests(value);
  const reasons = {
    add_projects: "The Add Projects page in Doan is in the middle of a task. Finish or cancel it, then try again.",
    settings: "Settings in Doan is in the middle of a change. Finish or cancel it, then try again.",
    project_settings: "Project Settings in Doan is in the middle of a change. Finish or cancel it, then try again.",
    first_run: "Finish Doan's first run, then try again.",
    dialog: "A dialog in Doan is busy and did not close. Finish it, then try again.",
  };
  for (const [reason, message] of Object.entries(reasons)) {
    const pending = requests.open(request);
    requests.answer({ id: asked.at(-1)!.id, kind: "busy", reason });
    expect(valid(await pending)).toEqual({ v: 4, ok: false, error: { code: "busy", message } });
  }
  const pending = requests.open(request);
  requests.answer({ id: asked.at(-1)!.id, kind: "canvas_not_found" });
  expect(valid(await pending)).toEqual({ v: 4, ok: false, error: { code: "canvas_not_found", message: "The canvas is not in the project's canvas list in Doan." } });
  expect(value.opened).not.toHaveBeenCalled();
});

test("concurrent requests each get their own answer, whatever order the renderer answers in", async () => {
  const { host: value, asked } = host();
  const requests = openRequests(value);
  const first = requests.open({ ...request, frame: "a" }), second = requests.open({ ...request, frame: "b" });
  requests.answer({ id: asked[1]!.id, kind: "busy", reason: "dialog" });
  requests.answer({ id: asked[0]!.id, kind: "opened", frame: "found" });
  expect(await first).toEqual({ v: 4, ok: true, opened: true, frame: "found" });
  expect(await second).toMatchObject({ v: 4, ok: false, error: { code: "busy" } });
  expect(value.opened).toHaveBeenCalledTimes(1);
});

test("the renderer timeout answers busy well inside the socket deadline, and a late answer is dropped", async () => {
  // The CLI's per-attempt deadline is 2 s from before its dial, the app's 2 s from connect; 1 s leaves room for both.
  expect(OPEN_ANSWER_TIMEOUT_MS).toBe(1000);
  expect(OPEN_ANSWER_TIMEOUT_MS).toBeLessThan(LINE_WAIT_MS);
  vi.useFakeTimers();
  const { host: value, asked } = host();
  const requests = openRequests(value);
  let settled: OpenResponse | undefined;
  void requests.open(request).then(response => { settled = response; });
  await vi.advanceTimersByTimeAsync(OPEN_ANSWER_TIMEOUT_MS - 1);
  expect(settled).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  expect(settled).toEqual({ v: 4, ok: false, error: { code: "busy", message: "Doan did not answer in time. Try again shortly." } });
  requests.answer({ id: asked[0]!.id, kind: "opened", frame: "none" });
  expect(value.opened).not.toHaveBeenCalled();
  // An answer settles once: the timer of an answered request does nothing.
  const next = requests.open(request);
  requests.answer({ id: asked[1]!.id, kind: "opened", frame: "none" });
  await vi.advanceTimersByTimeAsync(OPEN_ANSWER_TIMEOUT_MS);
  expect(await next).toEqual({ v: 4, ok: true, opened: true, frame: "none" });
});

test("with no window to ask, the request is busy at once and says so", async () => {
  const { host: value } = host({ ask: vi.fn(() => false) });
  expect(valid(await openRequests(value).open(request))).toEqual({ v: 4, ok: false, error: { code: "busy", message: "Doan has no window open. Open Doan, then try again." } });
  expect(value.opened).not.toHaveBeenCalled();
});

test("malformed renderer answers are ignored, including a frame result that does not fit the request", async () => {
  vi.useFakeTimers();
  const { host: value, asked } = host();
  const requests = openRequests(value);
  let framed: OpenResponse | undefined, plain: OpenResponse | undefined;
  void requests.open({ ...request, frame: "hero" }).then(response => { framed = response; });
  void requests.open(request).then(response => { plain = response; });
  const [withFrame, without] = [asked[0]!.id, asked[1]!.id];
  for (const answer of [null, "1", [], { id: withFrame }, { id: 1, kind: "canvas_not_found" }, { id: "nope", kind: "canvas_not_found" },
    { id: withFrame, kind: "opened", frame: "none" }, { id: without, kind: "opened", frame: "found" }, { id: without, kind: "opened", frame: "missing" },
    { id: withFrame, kind: "opened", frame: "yes" }, { id: withFrame, kind: "opened" }, { id: withFrame, kind: "busy", reason: "toString" },
    { id: withFrame, kind: "busy", reason: "dialog", message: "/Users/sam" }, { id: withFrame, kind: "canvas_not_found", root }]) requests.answer(answer);
  await vi.advanceTimersByTimeAsync(0);
  expect(framed).toBeUndefined(); expect(plain).toBeUndefined();
  requests.answer({ id: withFrame, kind: "opened", frame: "found" });
  requests.answer({ id: without, kind: "opened", frame: "none" });
  await vi.advanceTimersByTimeAsync(0);
  expect(framed).toEqual({ v: 4, ok: true, opened: true, frame: "found" });
  expect(plain).toEqual({ v: 4, ok: true, opened: true, frame: "none" });
});

// The whole path over a real socket: the CLI's line in, the renderer's answer, one v4 line out.
let runtime: Runtime | undefined, userData: string | undefined;
afterEach(async () => {
  runtime?.disposeSync(); runtime = undefined;
  if (userData) await rm(userData, { recursive: true, force: true });
  userData = undefined;
});
test("over the socket, a v4 request is answered with the renderer's decision", async () => {
  userData = await mkdtemp(join(tmpdir(), "doan-runtime-open-test-"));
  const requests = openRequests(host({ ask: vi.fn((ask: OpenAsk) => { queueMicrotask(() => requests.answer({ id: ask.id, kind: "opened", frame: "found" })); return true; }) }).host);
  runtime = await startRuntime(userData, { ...state(), open: value => requests.open(value) });
  const text = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const client = connect(runtime!.socket);
    client.on("connect", () => client.write(`${JSON.stringify({ ...request, token: runtime!.token, frame: "hero" })}\n`));
    client.on("data", (chunk: Buffer) => chunks.push(chunk));
    client.on("error", reject);
    client.on("close", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
  expect(text).toBe(`${JSON.stringify({ v: 4, ok: true, opened: true, frame: "found" })}\n`);
});
