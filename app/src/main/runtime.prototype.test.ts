import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { OnboardingResponse, OpenResponse, PrototypeRequest, PrototypeResponse } from "../formats/types";
import { validatePrototypeResponse } from "../formats/validate";
import { answerCliPlay } from "./prototype/cliPlay";
import { answerLine, type RuntimeState } from "./runtime";
import type { FolderState } from "./folderState";
import type { CanvasRow, FolderEntry } from "./view";

// App-socket v6 (`doan open --prototype`), main's half. answerLine checks schema, token and registered root in the
// v3–v5 order; answerCliPlay (what index.ts gives as playPrototype) then judges readiness, first run and the list, and
// plays through the prototype controller.
const token = "secret", root = "/repo", path = ".doan/canvases/a.html";
const request: PrototypeRequest = { v: 6, token, root, path, frame: "checkout", mark: "390x844" };
const fixtures = join(__dirname, "../../../schema/fixtures/app-socket-v6/request");
const played: PrototypeResponse = { v: 6, ok: true, played: true };
const state = (playPrototype: RuntimeState["playPrototype"] = () => played) => ({
  isOpen: vi.fn((value: string) => value === root), selection: vi.fn(() => null), work: vi.fn(), conversationWork: vi.fn(),
  onboarding: vi.fn(async (): Promise<OnboardingResponse> => ({ v: 2, ok: false, error: { code: "bad_request", message: "unused" } })),
  open: vi.fn(async (): Promise<OpenResponse> => ({ v: 4, ok: true, opened: true, frame: "none" })),
  handoff: vi.fn(() => null), playPrototype: vi.fn(playPrototype), remove: async () => ({ v: 7 as const, ok: false as const, error: { code: "bad_request" as const, message: "unused" } }),
  roots: () => [root], readRoot: vi.fn(async (): Promise<FolderState> => ({ kind: "uninitialized" })), adopt: vi.fn(),
});
afterEach(() => { vi.restoreAllMocks(); });
const valid = (response: unknown) => { expect(validatePrototypeResponse(response)).toBe(true); return response; };

test("v6 validates schema, then token, then registered root, before the play is judged", async () => {
  const service = state();
  const response = (value: unknown) => answerLine(JSON.stringify(value), token, service);
  expect(valid(await response({ ...request, mark: "390", token: "wrong" }))).toEqual({ v: 6, ok: false, error: { code: "bad_request", message: "The request is not an app-socket v6 request." } });
  // A caller without the token learns nothing about which roots are open.
  expect(valid(await response({ ...request, token: "wrong", root: "/closed" }))).toMatchObject({ v: 6, ok: false, error: { code: "bad_token" } });
  expect(service.isOpen).not.toHaveBeenCalled();
  expect(valid(await response({ ...request, root: "/closed" }))).toMatchObject({ v: 6, ok: false, error: { code: "project_not_open" } });
  expect(service.playPrototype).not.toHaveBeenCalled();
  expect(valid(await response(request))).toEqual(played);
  expect(service.playPrototype).toHaveBeenCalledExactlyOnceWith(request);
});

test("every shared invalid v6 request fixture is refused as a v6 bad request, and every valid one reaches the play", async () => {
  for (const name of readdirSync(join(fixtures, "invalid"))) {
    const value: unknown = JSON.parse(readFileSync(join(fixtures, "invalid", name), "utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value) || Reflect.get(value, "v") !== 6) continue;
    const service = state();
    expect(valid(await answerLine(JSON.stringify(value), token, service)), name).toMatchObject({ v: 6, ok: false, error: { code: "bad_request" } });
    expect(service.playPrototype, name).not.toHaveBeenCalled();
  }
  for (const name of readdirSync(join(fixtures, "valid"))) {
    const value = JSON.parse(readFileSync(join(fixtures, "valid", name), "utf8")) as PrototypeRequest;
    const service = state();
    service.isOpen.mockReturnValue(true);
    expect(await answerLine(JSON.stringify({ ...value, token }), token, service), name).toEqual(played);
    expect(service.playPrototype, name).toHaveBeenCalledWith({ ...value, token });
  }
});

test("a throwing play answers a v6 bad request without its error, and v6 starts no other work", async () => {
  const service = state(() => { throw new Error("/Users/sam/secret path"); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(valid(await answerLine(JSON.stringify(request), token, service))).toEqual({ v: 6, ok: false, error: { code: "bad_request", message: "Doan could not handle this request." } });
  for (const other of [service.work, service.conversationWork, service.onboarding, service.open, service.handoff, service.selection]) expect(other).not.toHaveBeenCalled();
});

test("v1 to v5 never reach the play and keep their own replies; an unknown version keeps the v1 refusal", async () => {
  const service = state();
  const versions = [
    { v: 1, token, root },
    { v: 2, token, op: "status", sessionId: "s", since: 0 },
    { v: 3, token, root, action: "start", path, session: "s1", provider: "claude" },
    { v: 4, token, root, path },
    { v: 5, token, root, handoff: "a".repeat(64), path, text: "Go on." },
  ];
  for (const value of versions) expect(Reflect.get(await answerLine(JSON.stringify(value), token, service), "v"), String(value.v)).toBe(value.v);
  expect(await answerLine(JSON.stringify({ ...request, v: 8 }), token, service)).toMatchObject({ v: 1, ok: false, error: { code: "bad_request" } });
  expect(await answerLine(JSON.stringify({ ...request, v: "6" }), token, service)).toMatchObject({ v: 1, ok: false, error: { code: "bad_request" } });
  expect(service.playPrototype).not.toHaveBeenCalled();
});

// index.ts's playPrototype through the socket: the play's own refusals and its success, each a valid v6 reply.
describe("answerCliPlay over app-socket v6", () => {
  const row = (rowPath: string, id: string): CanvasRow => ({ path: rowPath, url: `http://127.0.0.1:1/t/k/a/${rowPath}`, id });
  const listed: FolderEntry[] = [{ path: root, kind: "list", servedRev: 0, canvases: [row(path, "a"), row(".doan/canvases/b.html", "twin"), row(".doan/canvases/c.html", "twin")] }];
  function socket(over: Partial<{ ready: boolean; firstRun: boolean; entries: FolderEntry[]; result: "played" | "activated" | "refused" }> = {}) {
    const play = vi.fn(() => over.result ?? "played");
    const service = state(value => answerCliPlay(value, { ready: () => over.ready ?? true, firstRun: () => over.firstRun ?? false, entries: () => over.entries ?? listed, play }));
    return { play, ask: async (value: PrototypeRequest = request) => valid(await answerLine(JSON.stringify(value), token, service)) };
  }
  const code = (response: unknown) => Reflect.get(Reflect.get(response as object, "error") as object, "code");

  test("a listed canvas plays its frame at the mark's size, and an already playing frame answers the same", async () => {
    const s = socket();
    expect(await s.ask()).toEqual(played);
    expect(s.play).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ target: { root, canvas: { id: "a" }, frame: "checkout" }, size: { width: 390, height: 844 } }));
    expect(await socket({ result: "activated" }).ask()).toEqual(played);
  });

  test("not ready while the app starts or the root is being read", async () => {
    expect(code(await socket({ ready: false }).ask())).toBe("not_ready");
    expect(code(await socket({ entries: [{ path: root, kind: "loading" }] }).ask())).toBe("not_ready");
  });

  test("busy during first run or the buddy screen, with the CLI's sentence", async () => {
    const s = socket({ firstRun: true });
    expect(await s.ask()).toEqual({ v: 6, ok: false, error: { code: "busy", message: "Finish Doan's first run, then try again." } });
    expect(s.play).not.toHaveBeenCalled();
  });

  test("canvas_not_found for an unlisted canvas, a canvas ID two rows share, and a target gone before the play", async () => {
    expect(code(await socket().ask({ ...request, path: ".doan/canvases/gone.html" }))).toBe("canvas_not_found");
    const twin = socket();
    expect(code(await twin.ask({ ...request, path: ".doan/canvases/b.html" }))).toBe("canvas_not_found");
    expect(twin.play).not.toHaveBeenCalled();
    expect(code(await socket({ result: "refused" }).ask())).toBe("canvas_not_found");
  });

  // The schema counts 200 code points; the board and the prototype window select only 200 UTF-16 units.
  test("a frame ID within 200 code points but over 200 UTF-16 units is a bad request", async () => {
    const s = socket();
    expect(code(await s.ask({ ...request, frame: "🦊".repeat(200) }))).toBe("bad_request");
    expect(s.play).not.toHaveBeenCalled();
  });
});
