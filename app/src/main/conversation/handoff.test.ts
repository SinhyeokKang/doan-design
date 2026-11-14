import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HANDOFF_TEXT_LIMIT, handoffDecision, handoffEligibility, handoffGuidanceFor, handoffNoticeKind, handoffQueueOutcome, missedHandoffs, type HandoffAsker, type HandoffJudgement, type MissedInput } from "./handoff";

// The request-time order, the judgement and the prompt condition (ARCHITECTURE §4 'Handoff over app-socket v5' 'Dispatch',
// §7 'Handoff').
const source = { path: ".doan/canvases/a.html", id: "a" };
const asker: HandoffAsker = { root: "/repo", canvas: source, running: true, requested: [] };
const ask = { root: "/repo", path: ".doan/canvases/new.html" };

describe("handoffEligibility", () => {
  it("accepts a running canvas turn started by the person", () => {
    expect(handoffEligibility(ask, asker)).toBeNull();
    expect(handoffEligibility(ask, { ...asker, permissionMode: "acceptEdits" })).toBeNull();
    expect(handoffEligibility(ask, { ...asker, permissionMode: "bypass" })).toBeNull();
  });
  it("refuses in the design order: root, running, canvas, Plan, handoff turn, same path again, same canvas", () => {
    const sameAsk = { ...ask, path: source.path };
    const worst: HandoffAsker = { root: "/other", running: false, permissionMode: "plan", startedBy: "handoff", requested: [sameAsk.path] };
    expect(handoffEligibility(sameAsk, worst)).toBe("root_mismatch");
    expect(handoffEligibility(sameAsk, { ...worst, root: "/repo" })).toBe("not_running");
    expect(handoffEligibility(sameAsk, { ...worst, root: "/repo", running: true })).toBe("not_canvas_conversation");
    expect(handoffEligibility(sameAsk, { ...worst, root: "/repo", running: true, canvas: source })).toBe("plan_mode");
    expect(handoffEligibility(sameAsk, { root: "/repo", running: true, canvas: source, startedBy: "handoff", requested: [sameAsk.path] })).toBe("handoff_turn");
    expect(handoffEligibility(sameAsk, { ...asker, requested: [sameAsk.path] })).toBe("already_requested");
    expect(handoffEligibility(sameAsk, asker)).toBe("same_canvas");
  });
  it("accepts a request for another canvas after this turn's earlier requests, and refuses one for a path it already asked", () => {
    const earlier: HandoffAsker = { ...asker, requested: [".doan/canvases/b.html", ".doan/canvases/c.html"] };
    expect(handoffEligibility(ask, earlier)).toBeNull();
    expect(handoffEligibility({ ...ask, path: ".doan/canvases/c.html" }, earlier)).toBe("already_requested");
    expect(handoffEligibility({ ...ask, path: source.path }, earlier)).toBe("same_canvas");
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

// A guided turn's new canvases that the agent edited and never asked a handoff for (each gets a missed line).
describe("missedHandoffs", () => {
  const made = { path: ".doan/canvases/b.html", id: "b" }, other = { path: ".doan/canvases/c.html", id: "c" };
  const base: MissedInput = { root: "/repo", edits: ["/repo/.doan/canvases/b.html"], listed: [source, made], snapshot: [source], requested: [], source, current: () => false };
  it("names a new canvas the turn edited and asked no handoff for", () => {
    expect(missedHandoffs(base)).toEqual([made]);
  });
  it("names each such canvas once, in the order the turn edited them, whatever spelling the provider reported", () => {
    const edits = [".doan/canvases/c.html", "/repo/.doan/canvases/b.html", "/repo/.doan/canvases/c.html", "/repo/./.doan/canvases/b.html"];
    expect(missedHandoffs({ ...base, edits, listed: [source, made, other] })).toEqual([other, made]);
  });
  it("follows the /private spelling of a root under /private", () => {
    const root = "/private/var/repo";
    expect(missedHandoffs({ ...base, root, edits: ["/var/repo/.doan/canvases/b.html"] })).toEqual([made]);
  });
  it("leaves out the source canvas, even when it is not in the snapshot", () => {
    expect(missedHandoffs({ ...base, edits: ["/repo/.doan/canvases/a.html"], snapshot: [] })).toEqual([]);
  });
  it("leaves out a canvas that existed at the turn's start, by ID or by path", () => {
    expect(missedHandoffs({ ...base, snapshot: [source, made] })).toEqual([]);
    expect(missedHandoffs({ ...base, snapshot: [source, { path: ".doan/canvases/old.html", id: "b" }] })).toEqual([]);
    expect(missedHandoffs({ ...base, snapshot: [source, { path: made.path }] })).toEqual([]);
  });
  it("leaves out a canvas whose ID is listed twice", () => {
    expect(missedHandoffs({ ...base, listed: [source, made, { path: ".doan/canvases/copy.html", id: "b" }] })).toEqual([]);
  });
  it("leaves out a canvas that has a current conversation", () => {
    expect(missedHandoffs({ ...base, current: canvas => canvas.id === "b" })).toEqual([]);
  });
  it("leaves out a canvas the turn asked a handoff for, whatever that request's outcome", () => {
    expect(missedHandoffs({ ...base, requested: [made.path] })).toEqual([]);
    expect(missedHandoffs({ ...base, edits: [...base.edits, "/repo/.doan/canvases/c.html"], listed: [source, made, other], requested: [made.path] })).toEqual([other]);
  });
  it("names nothing for files that are not listed canvases, paths outside the root, or a turn without edits", () => {
    expect(missedHandoffs({ ...base, edits: ["/repo/notes.md", "/repo/.doan/assets/x.png", "/other/.doan/canvases/b.html", "/repo/.doan/canvases/gone.html"] })).toEqual([]);
    expect(missedHandoffs({ ...base, edits: [] })).toEqual([]);
  });
});

// How a handoff turn's queue goes out once every request resolved (one request: as before; several: draft when any was
// cancelled, otherwise the source).
describe("handoffQueueOutcome", () => {
  it("keeps a single request's outcomes: started moves, refused stays, cancelled returns to the draft", () => {
    expect(handoffQueueOutcome(["started"])).toBe("move");
    expect(handoffQueueOutcome(["refused"])).toBe("source");
    expect(handoffQueueOutcome(["cancelled"])).toBe("draft");
  });
  it("returns several requests' queue to the draft when any was cancelled, and sends it to the source otherwise", () => {
    expect(handoffQueueOutcome(["started", "cancelled"])).toBe("draft");
    expect(handoffQueueOutcome(["refused", "cancelled", "started"])).toBe("draft");
    expect(handoffQueueOutcome(["started", "started"])).toBe("source");
    expect(handoffQueueOutcome(["started", "refused"])).toBe("source");
    expect(handoffQueueOutcome(["refused", "refused"])).toBe("source");
  });
});

// One notice per turn: none without a started handoff, today's form for one, the targets in request order for several.
describe("handoffNoticeKind", () => {
  const from = { conversationId: "s", canvas: source };
  const b = { conversationId: "b", canvas: { path: ".doan/canvases/b.html", id: "b" } }, c = { conversationId: "c", canvas: { path: ".doan/canvases/c.html" } };
  it("sends nothing when no handoff started", () => {
    expect(handoffNoticeKind({ root: "/repo", source: from, started: [] })).toBeNull();
  });
  it("sends the single-target notice for one", () => {
    expect(handoffNoticeKind({ root: "/repo", source: from, started: [b] })).toEqual({ root: "/repo", source: from, target: b });
  });
  it("sends one notice with every target, in request order, for two or more", () => {
    expect(handoffNoticeKind({ root: "/repo", source: from, started: [c, b] })).toEqual({ root: "/repo", source: from, targets: [c, b] });
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
