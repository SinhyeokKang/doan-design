import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type { OnboardingResponse, OpenResponse, PrototypeResponse, RemoveRequest, RemoveResponse } from "../formats/types";
import { validateRemoveResponse } from "../formats/validate";
import { answerLine, type RuntimeState } from "./runtime";
import type { FolderState } from "./folderState";

// App-socket v7 (`doan remove`), the socket's half: answerLine checks schema, token and registered root in the v3–v6
// order, then hands the request to the state (index.ts answers it through answerCliRemove).
const token = "secret", root = "/repo";
const request: RemoveRequest = { v: 7, token, root };
const fixtures = join(__dirname, "../../../schema/fixtures/app-socket-v7/request");
const removed: RemoveResponse = { v: 7, ok: true, removed: true, project: "repo", roots: [root, "/repo-fix"] };
const state = (remove: RuntimeState["remove"] = async () => removed) => ({
  isOpen: vi.fn((value: string) => value === root), selection: vi.fn(() => null), work: vi.fn(), conversationWork: vi.fn(),
  onboarding: vi.fn(async (): Promise<OnboardingResponse> => ({ v: 2, ok: false, error: { code: "bad_request", message: "unused" } })),
  open: vi.fn(async (): Promise<OpenResponse> => ({ v: 4, ok: true, opened: true, frame: "none" })),
  handoff: vi.fn(() => null), playPrototype: vi.fn((): PrototypeResponse => ({ v: 6, ok: true, played: true })), remove: vi.fn(remove),
  roots: vi.fn(() => [root]), readRoot: vi.fn(async (): Promise<FolderState> => ({ kind: "uninitialized" })), adopt: vi.fn(),
});
afterEach(() => { vi.restoreAllMocks(); });
const valid = (response: unknown) => { expect(validateRemoveResponse(response)).toBe(true); return response; };

test("v7 validates schema, then token, then registered root, before the removal is judged", async () => {
  const service = state();
  const response = (value: unknown) => answerLine(JSON.stringify(value), token, service);
  expect(valid(await response({ ...request, root: "repo", token: "wrong" }))).toEqual({ v: 7, ok: false, error: { code: "bad_request", message: "The request is not an app-socket v7 request." } });
  // A caller without the token learns nothing about which roots are open.
  expect(valid(await response({ ...request, token: "wrong", root: "/closed" }))).toEqual({ v: 7, ok: false, error: { code: "bad_token", message: "The token does not match this app." } });
  expect(valid(await response({ ...request, token: "wrong" }))).toEqual({ v: 7, ok: false, error: { code: "bad_token", message: "The token does not match this app." } });
  expect(service.isOpen).not.toHaveBeenCalled();
  expect(valid(await response({ ...request, root: "/closed" }))).toEqual({ v: 7, ok: false, error: { code: "project_not_open", message: "The project is not open in Doan." } });
  expect(service.remove).not.toHaveBeenCalled();
  expect(valid(await response(request))).toEqual(removed);
  expect(service.remove).toHaveBeenCalledExactlyOnceWith(request);
});

test("an unregistered worktree is never registered on the way: v7 has no auto-registration", async () => {
  const service = state();
  expect(await answerLine(JSON.stringify({ ...request, root: "/repo-new" }), token, service)).toMatchObject({ v: 7, ok: false, error: { code: "project_not_open" } });
  expect(service.readRoot).not.toHaveBeenCalled();
  expect(service.adopt).not.toHaveBeenCalled();
  expect(service.remove).not.toHaveBeenCalled();
});

test("every shared invalid v7 request fixture is refused as a v7 bad request, and every valid one reaches the removal", async () => {
  for (const name of readdirSync(join(fixtures, "invalid"))) {
    const value: unknown = JSON.parse(readFileSync(join(fixtures, "invalid", name), "utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value) || Reflect.get(value, "v") !== 7) continue;
    const service = state();
    expect(valid(await answerLine(JSON.stringify(value), token, service)), name).toMatchObject({ v: 7, ok: false, error: { code: "bad_request" } });
    expect(service.remove, name).not.toHaveBeenCalled();
  }
  for (const name of readdirSync(join(fixtures, "valid"))) {
    const value = JSON.parse(readFileSync(join(fixtures, "valid", name), "utf8")) as RemoveRequest;
    const service = state();
    service.isOpen.mockReturnValue(true);
    expect(await answerLine(JSON.stringify({ ...value, token }), token, service), name).toEqual(removed);
    expect(service.remove, name).toHaveBeenCalledWith({ ...value, token });
  }
});

test("the state's refusals pass through as valid v7 replies", async () => {
  for (const code of ["project_not_open", "busy", "conversation_running"] as const) {
    const refusal: RemoveResponse = { v: 7, ok: false, error: { code, message: "m" } };
    expect(valid(await answerLine(JSON.stringify(request), token, state(async () => refusal))), code).toEqual(refusal);
  }
});

test("a throwing removal answers a v7 bad request without its error, and v7 starts no other work", async () => {
  const service = state(async () => { throw new Error("/Users/sam/secret path"); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(valid(await answerLine(JSON.stringify(request), token, service))).toEqual({ v: 7, ok: false, error: { code: "bad_request", message: "Doan could not handle this request." } });
  for (const other of [service.work, service.conversationWork, service.onboarding, service.open, service.handoff, service.playPrototype, service.selection, service.readRoot, service.adopt]) expect(other).not.toHaveBeenCalled();
});

test("v1 to v6 never reach the removal and keep their own replies; an unknown version keeps the v1 refusal", async () => {
  const service = state();
  const path = ".doan/canvases/a.html";
  const versions = [
    { v: 1, token, root },
    { v: 2, token, op: "status", sessionId: "s", since: 0 },
    { v: 3, token, root, action: "start", path, session: "s1", provider: "claude" },
    { v: 4, token, root, path },
    { v: 5, token, root, handoff: "a".repeat(64), path, text: "Go on." },
    { v: 6, token, root, path, frame: "f", mark: "390x844" },
  ];
  for (const value of versions) expect(Reflect.get(await answerLine(JSON.stringify(value), token, service), "v"), String(value.v)).toBe(value.v);
  expect(await answerLine(JSON.stringify({ ...request, v: 8 }), token, service)).toMatchObject({ v: 1, ok: false, error: { code: "bad_request" } });
  expect(await answerLine(JSON.stringify({ ...request, v: "7" }), token, service)).toMatchObject({ v: 1, ok: false, error: { code: "bad_request" } });
  expect(service.remove).not.toHaveBeenCalled();
});
