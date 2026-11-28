import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type { OnboardingResponse, OpenResponse, PrototypeResponse, SendRequest } from "../formats/types";
import { validateSendResponse } from "../formats/validate";
import { answerLine, type RuntimeState } from "./runtime";
import type { FolderState } from "./folderState";

// App-socket v8 (`doan send`), main's half: schema, token (the app's or a conversation's) and registered root, then the
// conversation service, as v5 does for `doan handoff`.
const token = "f".repeat(64), conversation = "c".repeat(64), root = "/repo";
const request: SendRequest = { v: 8, token, root, handoff: "a".repeat(64), path: ".doan/canvases/checkout.html", text: "Use the new price." };
const fixtures = join(__dirname, "../../../schema/fixtures/app-socket-v8/request");
const state = (send: RuntimeState["send"] = () => null) => ({
  isOpen: vi.fn((value: string) => value === root), selection: vi.fn(() => null), work: vi.fn(), conversationWork: vi.fn(), workOthers: vi.fn(() => []),
  onboarding: vi.fn(async (): Promise<OnboardingResponse> => ({ v: 2, ok: false, error: { code: "bad_request", message: "unused" } })),
  open: vi.fn(async (): Promise<OpenResponse> => ({ v: 4, ok: true, opened: true, frame: "none" })),
  handoff: vi.fn(() => null), send: vi.fn(send), playPrototype: vi.fn((): PrototypeResponse => ({ v: 6, ok: false, error: { code: "not_ready", message: "unused" } })),
  remove: async () => ({ v: 7 as const, ok: false as const, error: { code: "bad_request" as const, message: "unused" } }),
  roots: () => [root], readRoot: vi.fn(async (): Promise<FolderState> => ({ kind: "uninitialized" })), adopt: vi.fn(),
});
afterEach(() => { vi.restoreAllMocks(); });
const valid = (response: unknown) => { expect(validateSendResponse(response)).toBe(true); return response; };

test("v8 validates schema, then token, then registered root, before the conversation service's send is asked", async () => {
  const service = state();
  const response = (value: unknown) => answerLine(JSON.stringify(value), token, service, conversation);
  expect(valid(await response({ ...request, path: "outside.html", token: "wrong" }))).toEqual({ v: 8, ok: false, error: { code: "bad_request", message: "The request is not an app-socket v8 request." } });
  expect(valid(await response({ ...request, token: "wrong", root: "/closed" }))).toMatchObject({ v: 8, ok: false, error: { code: "bad_token" } });
  expect(service.isOpen).not.toHaveBeenCalled();
  expect(valid(await response({ ...request, root: "/closed" }))).toMatchObject({ v: 8, ok: false, error: { code: "project_not_open" } });
  expect(service.send).not.toHaveBeenCalled();
  expect(valid(await response(request))).toEqual({ v: 8, ok: true, requested: true });
  expect(service.send).toHaveBeenCalledWith(request);
  expect(service.handoff).not.toHaveBeenCalled();
});

// POSTMORTEM 2026-11-18 'Agents in Doan conversations held the same app-socket credential…': an agent in an app
// conversation holds only the conversation token, so v8 must take it as v5 does.
test("v8 takes a conversation's token as it takes the app's", async () => {
  const service = state();
  expect(valid(await answerLine(JSON.stringify({ ...request, token: conversation }), token, service, conversation))).toEqual({ v: 8, ok: true, requested: true });
  expect(service.send).toHaveBeenCalledWith({ ...request, token: conversation });
  expect(valid(await answerLine(JSON.stringify({ ...request, token: conversation }), token, state()))).toMatchObject({ v: 8, ok: false, error: { code: "bad_token" } });
});

test("each refusal of the conversation service is a v8 refusal with its code, the chain's with their own words", async () => {
  for (const code of ["not_app_conversation", "root_mismatch", "not_running", "plan_mode", "already_requested", "same_canvas", "chain_limit", "chain_one"] as const) {
    const answer = valid(await answerLine(JSON.stringify(request), token, state(() => code)));
    expect(answer, code).toEqual({ v: 8, ok: false, error: { code, message: expect.any(String) } });
  }
  expect(await answerLine(JSON.stringify(request), token, state(() => "chain_one"))).toEqual({ v: 8, ok: false, error: { code: "chain_one", message: "A turn started by a message can send only once." } });
  expect(await answerLine(JSON.stringify(request), token, state(() => "chain_limit"))).toEqual({ v: 8, ok: false, error: { code: "chain_limit", message: "This chain reached 5 steps." } });
});

test("every shared invalid v8 request fixture is refused as a v8 bad request, and every valid one reaches the service", async () => {
  for (const name of readdirSync(join(fixtures, "invalid"))) {
    const value: unknown = JSON.parse(readFileSync(join(fixtures, "invalid", name), "utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value) || Reflect.get(value, "v") !== 8) continue;
    const service = state();
    expect(await answerLine(JSON.stringify(value), token, service), name).toMatchObject({ v: 8, ok: false, error: { code: "bad_request" } });
    expect(service.send, name).not.toHaveBeenCalled();
  }
  for (const name of readdirSync(join(fixtures, "valid"))) {
    const value = JSON.parse(readFileSync(join(fixtures, "valid", name), "utf8")) as SendRequest;
    const service = state();
    service.isOpen.mockReturnValue(true);
    expect(await answerLine(JSON.stringify({ ...value, token }), token, service), name).toMatchObject({ v: 8, ok: true, requested: true });
    expect(service.send, name).toHaveBeenCalledWith({ ...value, token });
  }
});

test("a throwing service answers a v8 bad request without its error", async () => {
  const service = state(() => { throw new Error("/Users/sam/secret path"); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await answerLine(JSON.stringify(request), token, service)).toEqual({ v: 8, ok: false, error: { code: "bad_request", message: "Doan could not handle this request." } });
  for (const other of [service.work, service.conversationWork, service.onboarding, service.open, service.handoff]) expect(other).not.toHaveBeenCalled();
});
