import { expect, test, vi } from "vitest";
import type { OnboardingResponse, OpenResponse, PrototypeResponse, RemoveResponse } from "../formats/types";
import { answerLine } from "./runtime";
import type { FolderState } from "./folderState";

// App conversations' credential (ARCHITECTURE §4 'App-socket credentials') answers v1 and v3–v6, never onboarding (v2)
// or a project removal (v7), which stay with the terminal's full token.
const token = "f".repeat(64), conversation = "c".repeat(64), root = "/repo", path = ".doan/canvases/a.html";
const state = () => ({
  isOpen: vi.fn((value: string) => value === root), selection: vi.fn(() => null), work: vi.fn(), conversationWork: vi.fn(), workOthers: vi.fn(() => []),
  onboarding: vi.fn(async (): Promise<OnboardingResponse> => ({ v: 2, ok: true, op: "start", result: { sessionId: "s1", revision: 0, completed: false, agents: null, project: null, operations: [] } })),
  open: vi.fn(async (): Promise<OpenResponse> => ({ v: 4, ok: true, opened: true, frame: "none" })),
  handoff: vi.fn(() => null), playPrototype: vi.fn((): PrototypeResponse => ({ v: 6, ok: true, played: true })),
  remove: vi.fn(async (): Promise<RemoveResponse> => ({ v: 7, ok: true, removed: true, project: "repo", roots: [root] })),
  roots: vi.fn(() => [root]), readRoot: vi.fn(async (): Promise<FolderState> => ({ kind: "uninitialized" })), adopt: vi.fn(),
});
const requests = (credential: string) => ({
  v1: { v: 1, token: credential, root },
  v3: { v: 3, token: credential, root, action: "start", path },
  v4: { v: 4, token: credential, root, path },
  v5: { v: 5, token: credential, root, handoff: "a".repeat(64), path: ".doan/canvases/new.html", text: "Continue." },
  v6: { v: 6, token: credential, root, path, frame: "checkout", mark: "390x844" },
  v2: { v: 2, token: credential, op: "start" },
  v7: { v: 7, token: credential, root },
});

test("the conversation credential answers active, work, open, handoff and prototype requests", async () => {
  const service = state();
  for (const [name, value] of Object.entries(requests(conversation)).filter(([name]) => !["v2", "v7"].includes(name)))
    expect(await answerLine(JSON.stringify(value), token, service, conversation), name).toMatchObject({ ok: true });
  expect(service.work).toHaveBeenCalledOnce();
  expect(service.open).toHaveBeenCalledOnce();
  expect(service.handoff).toHaveBeenCalledOnce();
  expect(service.playPrototype).toHaveBeenCalledOnce();
});

test("the conversation credential is refused for onboarding and project removal before either runs", async () => {
  const service = state();
  const { v2, v7 } = requests(conversation);
  expect(await answerLine(JSON.stringify(v2), token, service, conversation)).toEqual({ v: 2, ok: false, error: { code: "bad_token", message: "The token does not match this app." } });
  expect(await answerLine(JSON.stringify(v7), token, service, conversation)).toEqual({ v: 7, ok: false, error: { code: "bad_token", message: "The token does not match this app." } });
  expect(service.onboarding).not.toHaveBeenCalled();
  expect(service.remove).not.toHaveBeenCalled();
  expect(service.isOpen).not.toHaveBeenCalled();
});

test("the full token keeps every version", async () => {
  const service = state();
  for (const [name, value] of Object.entries(requests(token)))
    expect(await answerLine(JSON.stringify(value), token, service, conversation), name).toMatchObject({ ok: true });
  expect(service.onboarding).toHaveBeenCalledOnce();
  expect(service.remove).toHaveBeenCalledOnce();
});
