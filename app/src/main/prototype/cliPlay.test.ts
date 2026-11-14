import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../view";
import { cliPlayDecision } from "./cliPlay";

const base = "http://127.0.0.1:5123/t/tok/";
const row = (path: string, patch: Partial<CanvasRow> = {}): CanvasRow => ({ path, url: `${base}k1/${path}`, ...patch });
const entries: FolderEntry[] = [
  { path: "/r", kind: "list", canvases: [row(".doan/canvases/proto.html", { id: "proto" }), row(".doan/canvases/a.html", { id: "twin" }), row(".doan/canvases/b.html", { id: "twin" })], servedRev: 0 },
  { path: "/loading", kind: "loading" },
];
const request = { root: "/r", path: ".doan/canvases/proto.html", frame: "phone", mark: "390x844" };
const decide = (over: Partial<Parameters<typeof cliPlayDecision>[0]> = {}) => cliPlayDecision({ ready: true, firstRun: false, entries, request, ...over });
const code = (decision: ReturnType<typeof cliPlayDecision>) => decision.kind === "refuse" && !decision.response.ok ? decision.response.error.code : null;

// `doan open --prototype` (app-socket v6) once its schema, token and registered root passed.
describe("cliPlayDecision", () => {
  test("a listed canvas plays its frame at the mark's size", () => {
    expect(decide()).toEqual({ kind: "play", target: { root: "/r", canvas: { id: "proto" }, frame: "phone" }, size: { width: 390, height: 844 } });
  });

  test("not ready while the app is starting or the root is being read; the CLI retries", () => {
    expect(code(decide({ ready: false }))).toBe("not_ready");
    expect(code(decide({ request: { ...request, root: "/loading" } }))).toBe("not_ready");
  });

  test("busy while first run or the buddy screen is open, but only once the app is ready", () => {
    const busy = decide({ firstRun: true });
    expect(busy).toEqual({ kind: "refuse", response: { v: 6, ok: false, error: { code: "busy", message: "Finish Doan's first run, then try again." } } });
    expect(code(decide({ firstRun: true, ready: false }))).toBe("not_ready");
  });

  test("a canvas the list does not hold, or whose ID two rows share, is not found, after busy", () => {
    expect(code(decide({ request: { ...request, path: ".doan/canvases/gone.html" } }))).toBe("canvas_not_found");
    expect(code(decide({ request: { ...request, path: ".doan/canvases/a.html" } }))).toBe("canvas_not_found");
    expect(code(decide({ request: { ...request, path: ".doan/canvases/gone.html" }, firstRun: true }))).toBe("busy");
  });

  test("a root that left the list since the socket checked it is not open", () => {
    expect(code(decide({ request: { ...request, root: "/gone" } }))).toBe("project_not_open");
  });

  test("every refusal is a v6 response with a message", () => {
    for (const decision of [decide({ ready: false }), decide({ firstRun: true }), decide({ request: { ...request, path: ".doan/canvases/gone.html" } }), decide({ request: { ...request, root: "/gone" } })]) {
      expect(decision.kind).toBe("refuse");
      if (decision.kind === "refuse") expect(decision.response).toMatchObject({ v: 6, ok: false, error: { message: expect.stringMatching(/\S/) } });
    }
  });
});
