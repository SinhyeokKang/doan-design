import { expect, test, vi } from "vitest";
import { answerLine } from "./runtime";
import type { OnboardingResponse, OpenResponse } from "../formats/types";
const token = "secret", root = "/repo", path = ".doan/canvases/a.html";
const request = { v: 3, token, root, action: "start", path };
const state = () => ({ isOpen: vi.fn((value: string) => value === root), selection: () => null, work: vi.fn(), onboarding: async (): Promise<OnboardingResponse> => ({ v: 2, ok: false, error: { code: "bad_request", message: "unused" } }),
  open: async (): Promise<OpenResponse> => ({ v: 4, ok: false, error: { code: "busy", message: "unused" } }) });
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
