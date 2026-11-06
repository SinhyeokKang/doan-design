import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HANDOFF_TEXT_LIMIT, handoffDecision, handoffEligibility, handoffGuidanceFor, type HandoffAsker, type HandoffJudgement } from "./handoff";

// canvas-handoff B2 (design §3 request-time order, §5 judgement and prompt condition).
const source = { path: ".doan/canvases/a.html", id: "a" };
const asker: HandoffAsker = { root: "/repo", canvas: source, running: true, requested: false };
const ask = { root: "/repo", path: ".doan/canvases/new.html" };

describe("handoffEligibility", () => {
  it("accepts a running canvas turn started by the person", () => {
    expect(handoffEligibility(ask, asker)).toBeNull();
    expect(handoffEligibility(ask, { ...asker, permissionMode: "acceptEdits" })).toBeNull();
    expect(handoffEligibility(ask, { ...asker, permissionMode: "bypass" })).toBeNull();
  });
  it("refuses in the design order: root, running, canvas, Plan, handoff turn, second request, same canvas", () => {
    const worst: HandoffAsker = { root: "/other", running: false, permissionMode: "plan", startedBy: "handoff", requested: true };
    const sameAsk = { ...ask, path: source.path };
    expect(handoffEligibility(sameAsk, worst)).toBe("root_mismatch");
    expect(handoffEligibility(sameAsk, { ...worst, root: "/repo" })).toBe("not_running");
    expect(handoffEligibility(sameAsk, { ...worst, root: "/repo", running: true })).toBe("not_canvas_conversation");
    expect(handoffEligibility(sameAsk, { ...worst, root: "/repo", running: true, canvas: source })).toBe("plan_mode");
    expect(handoffEligibility(sameAsk, { root: "/repo", running: true, canvas: source, startedBy: "handoff", requested: true })).toBe("handoff_turn");
    expect(handoffEligibility(sameAsk, { ...asker, requested: true })).toBe("already_requested");
    expect(handoffEligibility(sameAsk, asker)).toBe("same_canvas");
  });
  it("compares the root as a string, never re-deriving it", () => {
    expect(handoffEligibility({ ...ask, root: "/repo/" }, asker)).toBe("root_mismatch");
  });
  it("reads Plan from the conversation's current mode, so a mode Claude switched to after a plan approval is not Plan", () => {
    expect(handoffEligibility(ask, { ...asker, permissionMode: "plan" })).toBe("plan_mode");
    expect(handoffEligibility(ask, { ...asker, permissionMode: "acceptEdits" })).toBeNull();
  });
});

describe("handoffDecision", () => {
  const made = { path: ".doan/canvases/new.html", id: "new" };
  const base: HandoffJudgement = { done: true, path: made.path, listed: [source, made], snapshot: [source], source, settled: false, current: () => false };
  it("cancels a turn that did not end done, whatever is listed", () => {
    expect(handoffDecision({ ...base, done: false })).toEqual({ kind: "cancelled" });
    expect(handoffDecision({ ...base, done: false, listed: [] })).toEqual({ kind: "cancelled" });
  });
  it("starts at once when the canvas is already listed at the turn's end", () => {
    expect(handoffDecision(base)).toEqual({ kind: "start", canvas: made });
  });
  it("waits while the canvas is not listed yet, and refuses once a refresh or the window passed", () => {
    expect(handoffDecision({ ...base, listed: [source] })).toEqual({ kind: "wait" });
    expect(handoffDecision({ ...base, listed: [source], settled: true })).toEqual({ kind: "refused", reason: "not_listed" });
  });
  it("refuses a canvas whose ID is listed twice", () => {
    expect(handoffDecision({ ...base, listed: [source, made, { path: ".doan/canvases/copy.html", id: "new" }] })).toEqual({ kind: "refused", reason: "not_listed" });
  });
  it("refuses a canvas that existed at the turn's acceptance, by ID or by path", () => {
    expect(handoffDecision({ ...base, snapshot: [source, made] })).toEqual({ kind: "refused", reason: "not_new" });
    expect(handoffDecision({ ...base, snapshot: [source, { path: ".doan/canvases/old-name.html", id: "new" }] })).toEqual({ kind: "refused", reason: "not_new" });
    expect(handoffDecision({ ...base, snapshot: [source, { path: made.path }] })).toEqual({ kind: "refused", reason: "not_new" });
  });
  it("refuses a canvas that has a current conversation", () => {
    expect(handoffDecision({ ...base, current: canvas => canvas.id === "new" })).toEqual({ kind: "refused", reason: "has_conversation" });
  });
  it("refuses the conversation's own canvas before asking whether it is new or has a conversation", () => {
    const moved = { path: ".doan/canvases/moved.html", id: "a" };
    expect(handoffDecision({ ...base, path: moved.path, listed: [moved], current: () => true })).toEqual({ kind: "refused", reason: "same_canvas" });
  });
  it("starts on a canvas without an ID by its path", () => {
    const plain = { path: ".doan/canvases/plain.html" };
    expect(handoffDecision({ ...base, path: plain.path, listed: [source, plain] })).toEqual({ kind: "start", canvas: plain });
  });
});

describe("handoffGuidanceFor", () => {
  const doan = { owner: { kind: "doan" }, canvas: source };
  it("teaches only a Doan-connected canvas conversation's turn that is not Plan and not started by a handoff", () => {
    expect(handoffGuidanceFor(doan, {})).toBe(true);
    expect(handoffGuidanceFor(doan, { permissionMode: "bypass" })).toBe(true);
    expect(handoffGuidanceFor(doan, { permissionMode: "plan" })).toBe(false);
    expect(handoffGuidanceFor(doan, { startedBy: "handoff" })).toBe(false);
    expect(handoffGuidanceFor({ owner: { kind: "doan" } }, {})).toBe(false);
    expect(handoffGuidanceFor({ owner: { kind: "legacy-external" }, canvas: source }, {})).toBe(false);
  });
});

it("keeps HANDOFF_TEXT_LIMIT at the v5 schema's text maxLength", () => {
  const schema = JSON.parse(readFileSync(join(__dirname, "../../../../schema/app-socket.v5.schema.json"), "utf8")) as { $defs: { request: { properties: { text: { maxLength: number } } } } };
  expect(HANDOFF_TEXT_LIMIT).toBe(schema.$defs.request.properties.text.maxLength);
});
