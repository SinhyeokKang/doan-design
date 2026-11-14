import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type { HandoffRequest, OnboardingResponse, OpenResponse, PrototypeResponse } from "../formats/types";
import { validateHandoffResponse } from "../formats/validate";
import { answerLine, type RuntimeState } from "./runtime";
import type { FolderState } from "./folderState";

// App-socket v5 (`doan handoff`), main's half. answerLine checks schema, token and registered root
// in the v3/v4 order, and only then asks the conversation service, which owns every later check.
const token = "secret", root = "/repo";
const request: HandoffRequest = { v: 5, token, root, handoff: "a".repeat(64), path: ".doan/canvases/new.html", text: "Continue the checkout flow." };
const fixtures = join(__dirname, "../../../schema/fixtures/app-socket-v5/request");
const state = (handoff: RuntimeState["handoff"] = () => null) => ({
  isOpen: vi.fn((value: string) => value === root), selection: vi.fn(() => null), work: vi.fn(), conversationWork: vi.fn(),
  onboarding: vi.fn(async (): Promise<OnboardingResponse> => ({ v: 2, ok: false, error: { code: "bad_request", message: "unused" } })),
  open: vi.fn(async (): Promise<OpenResponse> => ({ v: 4, ok: true, opened: true, frame: "none" })),
  handoff: vi.fn(handoff), playPrototype: vi.fn((): PrototypeResponse => ({ v: 6, ok: false, error: { code: "not_ready", message: "unused" } })),
  roots: () => [root], readRoot: vi.fn(async (): Promise<FolderState> => ({ kind: "uninitialized" })), adopt: vi.fn(),
});
afterEach(() => { vi.restoreAllMocks(); });
const valid = (response: unknown) => { expect(validateHandoffResponse(response)).toBe(true); return response; };

test("v5 validates schema, then token, then registered root, before the conversation service is asked", async () => {
  const service = state();
  const response = (value: unknown) => answerLine(JSON.stringify(value), token, service);
  expect(valid(await response({ ...request, path: "outside.html", token: "wrong" }))).toEqual({ v: 5, ok: false, error: { code: "bad_request", message: "The request is not an app-socket v5 request." } });
  expect(valid(await response({ ...request, token: "wrong", root: "/closed", handoff: "b".repeat(64) }))).toMatchObject({ v: 5, ok: false, error: { code: "bad_token" } });
  expect(service.isOpen).not.toHaveBeenCalled();
  expect(valid(await response({ ...request, root: "/closed" }))).toMatchObject({ v: 5, ok: false, error: { code: "project_not_open" } });
  expect(service.handoff).not.toHaveBeenCalled();
  expect(valid(await response(request))).toEqual({ v: 5, ok: true, requested: true });
  expect(service.handoff).toHaveBeenCalledWith(request);
});

test("each refusal of the conversation service is a v5 refusal with its code", async () => {
  for (const code of ["not_app_conversation", "root_mismatch", "not_running", "not_canvas_conversation", "plan_mode", "handoff_turn", "already_requested", "same_canvas"] as const) {
    const answer = valid(await answerLine(JSON.stringify(request), token, state(() => code)));
    expect(answer, code).toEqual({ v: 5, ok: false, error: { code, message: expect.any(String) } });
  }
});

test("names a second request for the same canvas, since a turn may hand off to each new canvas once", async () => {
  expect(valid(await answerLine(JSON.stringify(request), token, state(() => "already_requested")))).toEqual({ v: 5, ok: false, error: { code: "already_requested", message: "This turn already handed off to this canvas." } });
});

test("every shared invalid v5 request fixture is refused as a v5 bad request, and every valid one reaches the service", async () => {
  for (const name of readdirSync(join(fixtures, "invalid"))) {
    const value: unknown = JSON.parse(readFileSync(join(fixtures, "invalid", name), "utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value) || Reflect.get(value, "v") !== 5) continue;
    const service = state();
    expect(await answerLine(JSON.stringify(value), token, service), name).toMatchObject({ v: 5, ok: false, error: { code: "bad_request" } });
    expect(service.handoff, name).not.toHaveBeenCalled();
  }
  for (const name of readdirSync(join(fixtures, "valid"))) {
    const value = JSON.parse(readFileSync(join(fixtures, "valid", name), "utf8")) as HandoffRequest;
    const service = state();
    service.isOpen.mockReturnValue(true);
    expect(await answerLine(JSON.stringify({ ...value, token }), token, service), name).toMatchObject({ v: 5, ok: true, requested: true });
    expect(service.handoff, name).toHaveBeenCalledWith({ ...value, token });
  }
});

test("a throwing service answers a v5 bad request without its error, and v5 starts no other work", async () => {
  const service = state(() => { throw new Error("/Users/sam/secret path"); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const answer = await answerLine(JSON.stringify(request), token, service);
  expect(answer).toEqual({ v: 5, ok: false, error: { code: "bad_request", message: "Doan could not handle this request." } });
  for (const other of [service.work, service.conversationWork, service.onboarding, service.open, service.selection]) expect(other).not.toHaveBeenCalled();
});

test("other versions never reach the handoff service, and an unknown version keeps the v1 refusal", async () => {
  const service = state();
  for (const v of [1, 2, 3, 4, 6]) await answerLine(JSON.stringify({ ...request, v }), token, service);
  expect(await answerLine(JSON.stringify({ ...request, v: 6 }), token, service)).toMatchObject({ v: 6, ok: false, error: { code: "bad_request" } });
  expect(await answerLine(JSON.stringify({ ...request, v: 8 }), token, service)).toMatchObject({ v: 1, ok: false, error: { code: "bad_request" } });
  expect(await answerLine(JSON.stringify({ ...request, v: "5" }), token, service)).toMatchObject({ v: 1, ok: false, error: { code: "bad_request" } });
  expect(service.handoff).not.toHaveBeenCalled();
});
