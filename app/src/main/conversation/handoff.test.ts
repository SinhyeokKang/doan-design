import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAIN_STEPS, HANDOFF_TEXT_LIMIT, canvasesAt, handoffDecision, handoffEligibility, handoffGuidanceFor, handoffNoticeKind, handoffQueueOutcome, latestConversation, missedHandoffs, nextOrigin, originLink, type HandoffAsker, type HandoffJudgement, type MissedInput, type SendCandidate } from "./handoff";

// The request-time order, the judgement and the prompt condition (ARCHITECTURE §4 'Handoff over app-socket v5' 'Dispatch',
// §7 'Handoff').
const source = { path: ".doan/canvases/a.html", id: "a" };
const asker: HandoffAsker = { root: "/repo", canvas: source, running: true, step: 0, requested: [] };
const ask = { root: "/repo", path: ".doan/canvases/new.html" };

describe("handoffEligibility", () => {
  it("accepts a running canvas turn started by the person", () => {
    expect(handoffEligibility(ask, asker)).toBeNull();
    expect(handoffEligibility(ask, { ...asker, permissionMode: "acceptEdits" })).toBeNull();
    expect(handoffEligibility(ask, { ...asker, permissionMode: "bypass" })).toBeNull();
  });
  it("refuses in the design order: root, running, Plan, same path again, same canvas, then the chain's limit and its one request", () => {
    const sameAsk = { ...ask, path: source.path };
    const worst: HandoffAsker = { root: "/other", running: false, permissionMode: "plan", step: CHAIN_STEPS, requested: [sameAsk.path] };
    expect(handoffEligibility(sameAsk, worst)).toBe("root_mismatch");
    expect(handoffEligibility(sameAsk, { ...worst, root: "/repo" })).toBe("not_running");
    expect(handoffEligibility(sameAsk, { ...worst, root: "/repo", running: true })).toBe("plan_mode");
    expect(handoffEligibility(sameAsk, { ...worst, root: "/repo", running: true, canvas: source })).toBe("plan_mode");
    expect(handoffEligibility(sameAsk, { root: "/repo", running: true, canvas: source, step: CHAIN_STEPS, requested: [sameAsk.path] })).toBe("already_requested");
    expect(handoffEligibility(sameAsk, { ...asker, step: CHAIN_STEPS })).toBe("same_canvas");
    expect(handoffEligibility(ask, { ...asker, step: CHAIN_STEPS, requested: [".doan/canvases/b.html"] })).toBe("chain_limit");
    expect(handoffEligibility(ask, { ...asker, step: 1, requested: [".doan/canvases/b.html"] })).toBe("chain_one");
  });
  it("accepts one request at steps 1 to 4 and none at step 5", () => {
    for (const step of [1, 2, 3, 4]) expect(handoffEligibility(ask, { ...asker, step }), String(step)).toBeNull();
    expect(handoffEligibility(ask, { ...asker, step: 5 })).toBe("chain_limit");
    expect(CHAIN_STEPS).toBe(5);
  });
  it("counts only the requests the turn took: a refused request leaves a step-1 turn its one", () => {
    // requested holds the taken requests, whatever their judgement did later; an immediate refusal never joins it.
    expect(handoffEligibility(ask, { ...asker, step: 1, requested: [] })).toBeNull();
    expect(handoffEligibility({ ...ask, path: source.path }, { ...asker, step: 1 })).toBe("same_canvas");
    expect(handoffEligibility(ask, { ...asker, step: 1 })).toBeNull();
  });
  it("accepts a step-0 turn's request for another canvas after its earlier requests, and refuses one for a path it already asked", () => {
    const earlier: HandoffAsker = { ...asker, requested: [".doan/canvases/b.html", ".doan/canvases/c.html"] };
    expect(handoffEligibility(ask, earlier)).toBeNull();
    expect(handoffEligibility({ ...ask, path: ".doan/canvases/c.html" }, earlier)).toBe("already_requested");
    expect(handoffEligibility({ ...ask, path: source.path }, earlier)).toBe("same_canvas");
  });
  // A project conversation (no canvas) hands off as a canvas one does; it has no canvas of its own to refuse.
  it("accepts a running project conversation's turn, and refuses it as a canvas turn's for Plan, a path asked again and a chain", () => {
    const project: HandoffAsker = { root: "/repo", running: true, step: 0, requested: [] };
    expect(handoffEligibility(ask, project)).toBeNull();
    expect(handoffEligibility({ ...ask, path: source.path }, project)).toBeNull();
    expect(handoffEligibility(ask, { ...project, running: false })).toBe("not_running");
    expect(handoffEligibility(ask, { ...project, permissionMode: "plan" })).toBe("plan_mode");
    expect(handoffEligibility(ask, { ...project, requested: [ask.path] })).toBe("already_requested");
    expect(handoffEligibility(ask, { ...project, step: 1, requested: [source.path] })).toBe("chain_one");
  });
  it("compares the root as a string, never re-deriving it", () => {
    expect(handoffEligibility({ ...ask, root: "/repo/" }, asker)).toBe("root_mismatch");
  });
  it("reads Plan from the conversation's current mode, so a mode Claude switched to after a plan approval is not Plan", () => {
    expect(handoffEligibility(ask, { ...asker, permissionMode: "plan" })).toBe("plan_mode");
    expect(handoffEligibility(ask, { ...asker, permissionMode: "acceptEdits" })).toBeNull();
  });
});

// The rows a send may go to: Doan-connected, signed in, readable, on the canvas, in the root.
describe("latestConversation", () => {
  const b = { path: ".doan/canvases/b.html", id: "b" };
  const row = (conversationId: string, lastActivityAt: string, more: Partial<SendCandidate> = {}): SendCandidate => ({ conversationId, root: "/repo", canvas: b, owner: "doan", signedIn: true, lastActivityAt, ...more });
  it("names none when the canvas has no conversation", () => {
    expect(latestConversation("/repo", b, [])).toBeNull();
    expect(latestConversation("/repo", b, [row("x", "2026-11-28T00:00:00.000Z", { canvas: source })])).toBeNull();
  });
  it("names the one conversation, a running one too", () => {
    expect(latestConversation("/repo", b, [row("x", "2026-11-28T00:00:00.000Z")])).toBe("x");
  });
  it("names the one with the latest activity, and the first by conversationId on a tie", () => {
    const rows = [row("old", "2026-11-27T00:00:00.000Z"), row("new", "2026-11-28T01:00:00.000Z"), row("mid", "2026-11-28T00:00:00.000Z")];
    expect(latestConversation("/repo", b, rows)).toBe("new");
    expect(latestConversation("/repo", b, [row("z", "2026-11-28T00:00:00.000Z"), row("m", "2026-11-28T00:00:00.000Z")])).toBe("m");
    expect(latestConversation("/repo", b, [row("m", "2026-11-28T00:00:00.000Z"), row("z", "2026-11-28T00:00:00.000Z")])).toBe("m");
  });
  it("skips legacy external conversations, signed-out providers' and unreadable ones, even when they are later", () => {
    const rows = [row("ok", "2026-11-01T00:00:00.000Z"), row("legacy", "2026-11-28T00:00:00.000Z", { owner: "legacy-external" }),
      row("out", "2026-11-28T00:00:00.000Z", { signedIn: false }), row("bad", "2026-11-28T00:00:00.000Z", { readError: true })];
    expect(latestConversation("/repo", b, rows)).toBe("ok");
    expect(latestConversation("/repo", b, rows.slice(1))).toBeNull();
  });
  it("skips another root's conversations and project conversations", () => {
    expect(latestConversation("/repo", b, [row("other", "2026-11-28T00:00:00.000Z", { root: "/repo-wt" }), row("p", "2026-11-28T00:00:00.000Z", { canvas: undefined })])).toBeNull();
  });
  it("matches a renamed canvas by its ID, and an ID-less canvas by its path", () => {
    expect(latestConversation("/repo", { path: ".doan/canvases/renamed.html", id: "b" }, [row("x", "2026-11-28T00:00:00.000Z")])).toBe("x");
    const plain = { path: ".doan/canvases/plain.html" };
    expect(latestConversation("/repo", plain, [row("p", "2026-11-28T00:00:00.000Z", { canvas: plain })])).toBe("p");
  });
});

describe("handoffDecision", () => {
  const made = { path: ".doan/canvases/new.html", id: "new" };
  const base: HandoffJudgement = { done: true, root: "/repo", path: made.path, listed: [source, made], source, settled: false };
  const on = (conversationId: string, canvas = made, lastActivityAt = "2026-11-28T00:00:00.000Z"): SendCandidate => ({ conversationId, root: "/repo", canvas, owner: "doan", signedIn: true, lastActivityAt });
  it("cancels a turn that did not end done, whatever is listed", () => {
    expect(handoffDecision({ ...base, done: false })).toEqual({ kind: "cancelled" });
    expect(handoffDecision({ ...base, done: false, listed: [] })).toEqual({ kind: "cancelled" });
  });
  it("starts at once when the canvas is already listed at the turn's end", () => {
    expect(handoffDecision(base)).toEqual({ kind: "start", canvas: made });
  });
  it("starts a canvas that already existed at the turn's acceptance", () => {
    expect(handoffDecision({ ...base, conversations: [on("x")] })).toEqual({ kind: "start", canvas: made });
    expect(handoffDecision({ ...base, via: "handoff", chain: ["x"], conversations: [on("x")] })).toEqual({ kind: "start", canvas: made });
  });
  it("waits while the canvas is not listed yet, and refuses once a refresh or the window passed", () => {
    expect(handoffDecision({ ...base, listed: [source] })).toEqual({ kind: "wait" });
    expect(handoffDecision({ ...base, listed: [source], settled: true })).toEqual({ kind: "refused", reason: "not_listed" });
    expect(handoffDecision({ ...base, via: "send", listed: [source], settled: true })).toEqual({ kind: "refused", reason: "not_listed" });
  });
  it("refuses a path listed twice or a canvas whose ID is listed twice", () => {
    expect(handoffDecision({ ...base, listed: [source, made, { path: ".doan/canvases/copy.html", id: "new" }] })).toEqual({ kind: "refused", reason: "not_listed" });
    expect(handoffDecision({ ...base, listed: [source, made, { path: made.path, id: "other" }] })).toEqual({ kind: "refused", reason: "not_listed" });
  });
  it("refuses the conversation's own canvas, followed by its ID, for a handoff and a send", () => {
    const moved = { path: ".doan/canvases/moved.html", id: "a" };
    expect(handoffDecision({ ...base, path: moved.path, listed: [moved] })).toEqual({ kind: "refused", reason: "same_canvas" });
    expect(handoffDecision({ ...base, via: "send", path: moved.path, listed: [moved] })).toEqual({ kind: "refused", reason: "same_canvas" });
  });
  it("judges a project conversation's request without a source canvas", () => {
    const { source: _source, ...project } = base;
    expect(handoffDecision(project)).toEqual({ kind: "start", canvas: made });
    expect(handoffDecision({ ...project, path: source.path })).toEqual({ kind: "start", canvas: source });
    expect(handoffDecision({ ...project, listed: [source] })).toEqual({ kind: "wait" });
  });
  it("starts on a canvas without an ID by its path", () => {
    const plain = { path: ".doan/canvases/plain.html" };
    expect(handoffDecision({ ...base, path: plain.path, listed: [source, plain] })).toEqual({ kind: "start", canvas: plain });
  });
  it("sends to the canvas's latest conversation, idle or running, and starts one when it has none it can send to", () => {
    const send: HandoffJudgement = { ...base, via: "send", chain: ["s"] };
    expect(handoffDecision({ ...send, conversations: [on("old", made, "2026-11-01T00:00:00.000Z"), on("x")] })).toEqual({ kind: "send", canvas: made, conversationId: "x" });
    expect(handoffDecision(send)).toEqual({ kind: "start", canvas: made });
    expect(handoffDecision({ ...send, conversations: [{ ...on("legacy"), owner: "legacy-external" }, { ...on("out"), signedIn: false }] })).toEqual({ kind: "start", canvas: made });
    expect(handoffDecision({ ...send, conversations: [on("elsewhere", source)] })).toEqual({ kind: "start", canvas: made });
  });
  it("refuses a send whose conversation is earlier in the chain, at its start, its middle and in a chain of four", () => {
    const send: HandoffJudgement = { ...base, via: "send" };
    expect(handoffDecision({ ...send, chain: ["x", "s"], conversations: [on("x")] })).toEqual({ kind: "refused", reason: "chain_return" });
    expect(handoffDecision({ ...send, chain: ["p", "x", "s"], conversations: [on("x")] })).toEqual({ kind: "refused", reason: "chain_return" });
    expect(handoffDecision({ ...send, chain: ["p", "q", "r", "s"], conversations: [on("r")] })).toEqual({ kind: "refused", reason: "chain_return" });
    expect(handoffDecision({ ...send, chain: ["p", "q", "r", "s"], conversations: [on("y")] })).toEqual({ kind: "send", canvas: made, conversationId: "y" });
  });
});

// An origin as the history keeps it: an earlier build's has no via, chain or provider.
describe("originLink and nextOrigin", () => {
  it("reads an earlier build's origin as a handoff whose chain is its sender alone", () => {
    expect(originLink({ kind: "handoff", conversationId: "s", canvas: source })).toEqual({ via: "handoff", chain: ["s"] });
    expect(originLink({ kind: "handoff", conversationId: "s" })).toEqual({ via: "handoff", chain: ["s"] });
  });
  it("reads a new origin's via, chain and provider as written", () => {
    expect(originLink({ kind: "handoff", conversationId: "s", via: "send", chain: ["p", "s"], provider: "claude" })).toEqual({ via: "send", chain: ["p", "s"], provider: "claude" });
  });
  it("builds the next link from the sending turn's chain, ending with the sender", () => {
    expect(nextOrigin({ conversationId: "s", canvas: source, provider: "codex" }, [], "send")).toEqual({ kind: "handoff", conversationId: "s", canvas: source, via: "send", chain: ["s"], provider: "codex" });
    expect(nextOrigin({ conversationId: "s", provider: "claude" }, ["p", "q"], "handoff")).toEqual({ kind: "handoff", conversationId: "s", via: "handoff", chain: ["p", "q", "s"], provider: "claude" });
  });
});

// A guided turn's new canvases that the agent edited and never asked a handoff for (each gets a missed line).
describe("missedHandoffs", () => {
  const made = { path: ".doan/canvases/b.html", id: "b" }, other = { path: ".doan/canvases/c.html", id: "c" };
  const base: MissedInput = { root: "/repo", step: 0, edits: ["/repo/.doan/canvases/b.html"], listed: [source, made], snapshot: [source], requested: [], source };
  it("names a new canvas the turn edited and asked no handoff for", () => {
    expect(missedHandoffs(base)).toEqual([made]);
  });
  it("names nothing for a turn at step 1 or later", () => {
    for (const step of [1, 4, 5]) expect(missedHandoffs({ ...base, step }), String(step)).toEqual([]);
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
  it("names a project conversation's new canvases without a source canvas", () => {
    const { source: _source, ...project } = base;
    expect(missedHandoffs(project)).toEqual([made]);
    expect(missedHandoffs({ ...project, edits: ["/repo/.doan/canvases/a.html", "/repo/.doan/canvases/b.html"], snapshot: [] })).toEqual([source, made]);
  });
  it("leaves out a canvas that existed at the turn's start, by ID or by path", () => {
    expect(missedHandoffs({ ...base, snapshot: [source, made] })).toEqual([]);
    expect(missedHandoffs({ ...base, snapshot: [source, { path: ".doan/canvases/old.html", id: "b" }] })).toEqual([]);
    expect(missedHandoffs({ ...base, snapshot: [source, { path: made.path }] })).toEqual([]);
  });
  it("leaves out a canvas whose ID is listed twice", () => {
    expect(missedHandoffs({ ...base, listed: [source, made, { path: ".doan/canvases/copy.html", id: "b" }] })).toEqual([]);
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

// The listed canvases a turn's edit paths name, for missed lines and drawn cards.
describe("canvasesAt", () => {
  const root = "/private/tmp/repo";
  const a = { path: ".doan/canvases/a.html", id: "a" }, b = { path: ".doan/canvases/b.html", id: "b" };
  it("reads absolute, aliased, dotted and relative paths against the root, once each, in edit order", () => {
    expect(canvasesAt(root, [`${root}/.doan/canvases/b.html`, "/tmp/repo/.doan/canvases/a.html", ".doan/x/../canvases/b.html"], [a, b], [a, b])).toEqual([b, a]);
    expect(canvasesAt(root, ["../repo/.doan/canvases/a.html"], [a], [a])).toEqual([a]);
  });
  // Worktrees share a prefix: a sibling worktree's path is outside the root (POSTMORTEM 2026-11-01).
  it("names nothing outside the root, a sibling worktree with the same prefix included", () => {
    expect(canvasesAt(root, ["../other/.doan/canvases/a.html", "/private/tmp/repo-worktree/.doan/canvases/a.html", "/elsewhere/.doan/canvases/a.html"], [a], [a])).toEqual([]);
  });
  it("names only listed canvases", () => {
    expect(canvasesAt(root, ["src/app.ts", ".doan/assets/x.png", ".doan/canvases/a.html"], [a], [a])).toEqual([a]);
  });
  it("follows a canvas moved during the turn by its ID", () => {
    const moved = { path: ".doan/canvases/renamed.html", id: "a" };
    expect(canvasesAt(root, [".doan/canvases/a.html"], [moved, b], [a, b])).toEqual([moved]);
  });
  it("names neither canvas when two swapped paths, or another took a moved canvas's old path", () => {
    const swappedA = { path: ".doan/canvases/b.html", id: "a" }, swappedB = { path: ".doan/canvases/a.html", id: "b" };
    expect(canvasesAt(root, [".doan/canvases/a.html"], [swappedA, swappedB], [a, b])).toEqual([]);
    const moved = { path: ".doan/canvases/renamed.html", id: "a" }, took = { path: ".doan/canvases/a.html", id: "b" };
    expect(canvasesAt(root, [".doan/canvases/a.html"], [moved, took], [a, b])).toEqual([]);
  });
  it("names nothing for a canvas deleted during the turn", () => {
    expect(canvasesAt(root, [".doan/canvases/a.html"], [b], [a, b])).toEqual([]);
  });
});

// How a handoff turn's queue goes out once every request resolved (one request: move only for a handoff that started;
// several: draft when any was cancelled, otherwise the source).
describe("handoffQueueOutcome", () => {
  const h = (outcome: "started" | "refused" | "cancelled" | "sent") => ({ outcome, via: "handoff" as const });
  const s = (outcome: "started" | "refused" | "cancelled" | "sent") => ({ outcome, via: "send" as const });
  it("keeps a single handoff's outcomes: started moves, refused stays, cancelled returns to the draft", () => {
    expect(handoffQueueOutcome([h("started")])).toBe("move");
    expect(handoffQueueOutcome([h("refused")])).toBe("source");
    expect(handoffQueueOutcome([h("cancelled")])).toBe("draft");
  });
  it("keeps the queue on the source for a single send, delivered or starting a conversation, and drafts a cancelled one", () => {
    expect(handoffQueueOutcome([s("sent")])).toBe("source");
    expect(handoffQueueOutcome([s("started")])).toBe("source");
    expect(handoffQueueOutcome([s("refused")])).toBe("source");
    expect(handoffQueueOutcome([s("cancelled")])).toBe("draft");
  });
  it("returns several requests' queue to the draft when any was cancelled, and sends it to the source otherwise", () => {
    expect(handoffQueueOutcome([h("started"), h("cancelled")])).toBe("draft");
    expect(handoffQueueOutcome([h("refused"), s("cancelled"), h("started")])).toBe("draft");
    expect(handoffQueueOutcome([h("started"), h("started")])).toBe("source");
    expect(handoffQueueOutcome([h("started"), s("sent")])).toBe("source");
    expect(handoffQueueOutcome([h("refused"), h("refused")])).toBe("source");
  });
});

// One notice per turn: none without a started or sent request; a step-0 turn's handoffs keep the moving forms; any send,
// or a turn at step 1 or later, sends the form the screen never follows, with each target's via.
describe("handoffNoticeKind", () => {
  const from = { conversationId: "s", canvas: source };
  const b = { conversationId: "b", canvas: { path: ".doan/canvases/b.html", id: "b" } }, c = { conversationId: "c", canvas: { path: ".doan/canvases/c.html" } };
  const handed = (target: typeof b) => ({ ...target, via: "handoff" as const }), sent = (target: typeof b) => ({ ...target, via: "send" as const });
  it("sends nothing when no request started or sent", () => {
    expect(handoffNoticeKind({ root: "/repo", source: from, step: 0, started: [] })).toBeNull();
    expect(handoffNoticeKind({ root: "/repo", source: from, step: 2, started: [] })).toBeNull();
  });
  it("sends the single-target notice for one handoff of a step-0 turn", () => {
    expect(handoffNoticeKind({ root: "/repo", source: from, step: 0, started: [handed(b)] })).toEqual({ root: "/repo", source: from, target: b });
  });
  it("sends one notice with every target, in request order, for a step-0 turn's two or more handoffs", () => {
    expect(handoffNoticeKind({ root: "/repo", source: from, step: 0, started: [handed(c), handed(b)] })).toEqual({ root: "/repo", source: from, targets: [c, b] });
  });
  it("names a project conversation's source without a canvas, for one target and for several", () => {
    const project = { conversationId: "p" };
    expect(handoffNoticeKind({ root: "/repo", source: project, step: 0, started: [handed(b)] })).toEqual({ root: "/repo", source: project, target: b });
    expect(handoffNoticeKind({ root: "/repo", source: project, step: 0, started: [handed(b), handed(c)] })).toEqual({ root: "/repo", source: project, targets: [b, c] });
    expect(handoffNoticeKind({ root: "/repo", source: project, step: 0, started: [sent(b)] })).toEqual({ kind: "message", root: "/repo", source: project, targets: [sent(b)] });
  });
  it("sends the non-moving form for a send, a step-1 or later handoff, and a mix", () => {
    expect(handoffNoticeKind({ root: "/repo", source: from, step: 0, started: [sent(b)] })).toEqual({ kind: "message", root: "/repo", source: from, targets: [sent(b)] });
    expect(handoffNoticeKind({ root: "/repo", source: from, step: 1, started: [handed(b)] })).toEqual({ kind: "message", root: "/repo", source: from, targets: [handed(b)] });
    expect(handoffNoticeKind({ root: "/repo", source: from, step: 0, started: [handed(c), sent(b)] })).toEqual({ kind: "message", root: "/repo", source: from, targets: [handed(c), sent(b)] });
    expect(handoffNoticeKind({ root: "/repo", source: from, step: 0, started: [sent(c), sent(b)] })).toEqual({ kind: "message", root: "/repo", source: from, targets: [sent(c), sent(b)] });
  });
});

describe("handoffGuidanceFor", () => {
  const doan = { owner: { kind: "doan" }, canvas: source };
  it("teaches a Doan-connected conversation's step-0 turn the person's guidance, steps 1 to 4 the received one, step 5 none", () => {
    for (const conversation of [doan, { owner: { kind: "doan" } }]) {
      expect(handoffGuidanceFor(conversation, { step: 0 })).toBe("person");
      expect(handoffGuidanceFor(conversation, { step: 0, permissionMode: "bypass" })).toBe("person");
      for (const step of [1, 2, 3, 4]) expect(handoffGuidanceFor(conversation, { step }), String(step)).toBe("received");
      expect(handoffGuidanceFor(conversation, { step: 5 })).toBeNull();
    }
  });
  it("teaches nothing in Plan or to a legacy external conversation", () => {
    expect(handoffGuidanceFor(doan, { step: 0, permissionMode: "plan" })).toBeNull();
    expect(handoffGuidanceFor(doan, { step: 2, permissionMode: "plan" })).toBeNull();
    expect(handoffGuidanceFor({ owner: { kind: "legacy-external" }, canvas: source }, { step: 0 })).toBeNull();
    expect(handoffGuidanceFor({ owner: { kind: "legacy-external" } }, { step: 1 })).toBeNull();
  });
});

it("keeps HANDOFF_TEXT_LIMIT at the v5 schema's text maxLength", () => {
  const schema = JSON.parse(readFileSync(join(__dirname, "../../../../schema/app-socket.v5.schema.json"), "utf8")) as { $defs: { request: { properties: { text: { maxLength: number } } } } };
  expect(HANDOFF_TEXT_LIMIT).toBe(schema.$defs.request.properties.text.maxLength);
});
