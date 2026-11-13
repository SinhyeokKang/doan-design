import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { HANDOFF_GUIDANCE } from "./prompt";
import { ConversationService, resolveListedCanvas, type OpenRunner, type Prepare, type QueueFiles, type QueueOptions, type Runner, type StartRequest } from "./service";
import { foldConversation } from "./state";
import { DraftStore } from "./drafts";
import type { HandoffNotice } from "./handoff";
import type { Canvas, ConversationEvent } from "./types";

// The conversation service's half of a handoff, with fake runners.
const paths: string[] = [];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
const a = { path: ".doan/canvases/a.html", id: "a" }, b = { path: ".doan/canvases/b.html", id: "b" }, c = { path: ".doan/canvases/c.html", id: "c" };
type Steering = Runner & { steer: NonNullable<Runner["steer"]> };
function fixture(options: { provider?: "claude" | "codex"; listed?: Canvas[]; legacy?: boolean; files?: QueueFiles; fast?: QueueOptions["fast"]; defaultEffort?: QueueOptions["defaultEffort"] } = {}) {
  const provider = options.provider ?? "codex";
  const dir = mkdtempSync(join(tmpdir(), "doan-handoff-")); paths.push(dir);
  const store = new ConversationStore(dir); const runners: Steering[] = []; let session = 0;
  const open = vi.fn<OpenRunner>(async input => {
    const runner: Steering = { sessionId: input.sessionId ?? `s${++session}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}), steer: vi.fn(async () => {}) };
    runners.push(runner); return runner;
  });
  const owner = { kind: "doan" as const, provider, connectionId: "conn", accountId: "acct", workspaceId: null, profile: provider };
  const prepared: Prepare = async (_request, stored) => ({ runtime: provider, configDir: "/profile", cwd: "/repo", command: "/fake", env: { KEEP: "1" }, ...(options.legacy ? {} : { owner }), ...(stored ? { sessionId: stored.session.sessionId } : {}) });
  const prepare = vi.fn<Prepare>(prepared);
  const listed: Canvas[] = [...options.listed ?? [a]];
  const drafts = new DraftStore(null);
  const notices: HandoffNotice[] = [];
  const published: ConversationEvent[] = [];
  const admit = (_root: string, canvas?: Canvas) => canvas ? resolveListedCanvas(canvas, listed) : undefined;
  const service = new ConversationService(store, prepare, open, e => published.push(e), admit, 10_000, () => listed, () => {}, { drafts, ...(options.files ? { files: options.files } : {}), ...(options.fast ? { fast: options.fast } : {}), ...(options.defaultEffort ? { defaultEffort: options.defaultEffort } : {}) }, undefined, undefined, notice => notices.push(notice));
  const sourceRequest: StartRequest = { root: "/repo", mode: "new", runtime: provider, canvas: a, text: "Make a checkout page", anchors: [], model: "gpt-x", effort: "high", permissionMode: "acceptEdits" };
  const key = (runner: number) => open.mock.calls[runner]![0].env.DOAN_HANDOFF;
  const ask = (handoff: string | undefined, path: string, root = "/repo", text = "The person wants a checkout flow; the cart is next.") =>
    service.requestHandoff({ root, handoff: handoff ?? "", path, text });
  const prompt = (runner: number, call = 0) => vi.mocked(runners[runner]!.send).mock.calls[call]![0];
  const entry = (id: string) => store.list().find(m => m.conversationId === id)!;
  const on = (canvas: Canvas) => store.list().find(m => m.canvas?.id === canvas.id && m.state === "current");
  const last = (id: string) => store.read(id).at(-1)!;
  const turnOf = (id: string) => store.read(id).filter(e => e.type === "turn.started").at(-1)!.turnId;
  // omit: fields of the canvas request a project or legacy start leaves out.
  const start = async (request: Partial<StartRequest> = {}, omit: ("canvas" | "runtime" | "effort")[] = []) => {
    const full: Partial<StartRequest> = { ...sourceRequest, ...request };
    for (const field of omit) delete full[field];
    return (await service.start(full as StartRequest)).conversationId;
  };
  const settled = () => vi.waitFor(() => expect(store.list().flatMap(m => store.read(m.conversationId)).some(e => e.type === "handoff.resolved")).toBe(true));
  return { service, store, runners, open, prepare, listed, drafts, notices, published, key, ask, prompt, entry, on, last, turnOf, start, settled };
}

describe("the handoff key", () => {
  it("gives each runner of a Doan-connected conversation its own 64-hex DOAN_HANDOFF next to its id", async () => {
    const h = fixture({ listed: [a, b] });
    const first = await h.start(), second = await h.start({ canvas: b });
    expect(h.key(0)).toMatch(/^[0-9a-f]{64}$/);
    expect(h.key(1)).toMatch(/^[0-9a-f]{64}$/);
    expect(h.key(0)).not.toBe(h.key(1));
    expect(h.open.mock.calls[0]![0].env).toEqual({ KEEP: "1", DOAN_CONVERSATION_ID: first, DOAN_HANDOFF: h.key(0) });
    expect(h.open.mock.calls[1]![0].env.DOAN_CONVERSATION_ID).toBe(second);
  });
  it("gives a project conversation a key too, but never a legacy external one", async () => {
    const project = fixture();
    await project.start({ mode: "newDesign" }, ["canvas"]);
    expect(project.key(0)).toMatch(/^[0-9a-f]{64}$/);
    const legacy = fixture({ legacy: true });
    const id = await legacy.start({ mode: "resume" }, ["runtime"]);
    expect(legacy.open.mock.calls[0]![0].env).toEqual({ KEEP: "1", DOAN_CONVERSATION_ID: id });
    expect(legacy.prompt(0)).not.toContain(HANDOFF_GUIDANCE);
  });
  it("forgets a key once its runner's process is gone, and the next runner has a new one", async () => {
    const h = fixture({ provider: "claude" });
    const id = await h.start(); const first = h.key(0)!;
    h.service.receive(id, { type: "turn.done" });
    h.open.mock.calls[0]![2]();
    expect(h.ask(first, b.path)).toBe("not_app_conversation");
    await h.service.send(id, "again", []);
    expect(h.key(1)).toMatch(/^[0-9a-f]{64}$/);
    expect(h.key(1)).not.toBe(first);
    expect(h.ask(first, b.path)).toBe("not_app_conversation");
    expect(h.ask(h.key(1), b.path)).toBeNull();
  });
  it("answers an unknown key as not an app conversation", async () => {
    const h = fixture(); await h.start();
    expect(h.ask("f".repeat(64), b.path)).toBe("not_app_conversation");
  });
});

describe("a handoff request", () => {
  it("is taken once per turn and written as handoff.requested in that turn", async () => {
    const h = fixture(); const id = await h.start();
    expect(h.prompt(0)).toContain(HANDOFF_GUIDANCE);
    expect(h.ask(h.key(0), b.path, "/repo", "  Continue {{1}} here.\n")).toBeNull();
    expect(h.last(id)).toMatchObject({ type: "handoff.requested", canvas: { path: b.path }, text: "Continue {{1}} here.", turnId: h.turnOf(id) });
    expect(h.published.at(-1)).toMatchObject({ type: "handoff.requested" });
    expect(h.ask(h.key(0), c.path)).toBe("already_requested");
  });
  it("refuses a root that differs as a string, the conversation's own canvas and a turn that ended", async () => {
    const h = fixture(); const id = await h.start();
    expect(h.ask(h.key(0), b.path, "/repo/")).toBe("root_mismatch");
    expect(h.ask(h.key(0), a.path)).toBe("same_canvas");
    h.service.receive(id, { type: "turn.done" });
    expect(h.ask(h.key(0), b.path)).toBe("not_running");
  });
  it("refuses a project conversation, which promotion binds instead", async () => {
    const h = fixture(); await h.start({ mode: "newDesign" }, ["canvas"]);
    expect(h.prompt(0)).not.toContain(HANDOFF_GUIDANCE);
    expect(h.ask(h.key(0), b.path)).toBe("not_canvas_conversation");
  });
  it("refuses in Plan, by the conversation's mode now, and takes the request once a plan approval changed it", async () => {
    const h = fixture({ provider: "claude" }); await h.start({ permissionMode: "plan" });
    expect(h.prompt(0)).not.toContain(HANDOFF_GUIDANCE);
    expect(h.ask(h.key(0), b.path)).toBe("plan_mode");
    h.open.mock.calls[0]![0].planApproved!("acceptEdits");
    expect(h.ask(h.key(0), b.path)).toBeNull();
  });
});

describe("the end of a turn that asked", () => {
  it("starts the next conversation at once when the canvas is listed, with the source's provider, choice and current mode", async () => {
    const h = fixture(); const id = await h.start();
    const requestedIn = h.turnOf(id);
    const text = "The person wants a checkout flow.\nKeep {{1}} literal.";
    expect(h.ask(h.key(0), b.path, "/repo", text)).toBeNull();
    h.listed.push(b);
    h.service.setPermissionMode(id, "bypass");
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    const target = h.on(b)!;
    expect(target).toMatchObject({ root: "/repo", canvas: b, state: "current", model: "gpt-x", effort: "high", permissionMode: "bypass", session: { runtime: "codex" }, title: "The person wants a checkout flow. Keep {{1}} literal." });
    expect(h.open.mock.calls[1]![0]).toMatchObject({ model: "gpt-x", effort: "high", permissionMode: "bypass" });
    expect(h.store.read(target.conversationId).slice(0, 2)).toMatchObject([
      { type: "user.message", text, anchors: [], origin: { kind: "handoff", conversationId: id, canvas: a } }, { type: "turn.started" }]);
    const data = JSON.parse(h.prompt(1).split("\n\n")[1]!) as Record<string, unknown>;
    expect(data).toEqual({ context: { root: "/repo", canvas: b, from: a }, handoffText: text });
    expect(h.prompt(1)).not.toContain(HANDOFF_GUIDANCE);
    expect(h.last(id)).toMatchObject({ type: "handoff.resolved", outcome: "started", target: { conversationId: target.conversationId, canvas: b }, turnId: requestedIn, conversationId: id });
    expect(h.entry(id)).toMatchObject({ state: "current", canvas: a });
    expect(h.notices).toEqual([{ root: "/repo", source: { conversationId: id, canvas: a }, target: { conversationId: target.conversationId, canvas: b } }]);
  });
  it("waits for the folder refresh when the canvas is not listed yet, and holds the conversation working until then", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path);
    h.service.receive(id, { type: "turn.done" });
    await Promise.resolve();
    expect(h.on(b)).toBeUndefined();
    expect(h.service.list("/repo").find(s => s.conversationId === id)?.working).toBe(true);
    h.listed.push(b); h.service.refreshed("/repo", [b.path]);
    await h.settled();
    expect(h.on(b)).toBeDefined();
    expect(h.service.list("/repo").find(s => s.conversationId === id)?.working).toBe(false);
  });
  it("refuses as not listed after a refresh or the window without the canvas, and sends the queue to the source", async () => {
    const refreshed = fixture(); const id = await refreshed.start();
    refreshed.ask(refreshed.key(0), b.path);
    refreshed.service.queue(id, { text: "and the cart", anchors: [] });
    refreshed.service.receive(id, { type: "turn.done" });
    refreshed.service.refreshed("/repo", []);
    await refreshed.settled();
    expect(refreshed.last(id)).toMatchObject({ type: "handoff.resolved", outcome: "refused", reason: "not_listed" });
    await vi.waitFor(() => expect(refreshed.store.read(id).filter(e => e.type === "user.message").map(e => e.type === "user.message" && e.text)).toEqual(["Make a checkout page", "and the cart"]));
    expect(refreshed.notices).toEqual([]);

    // Date too: the judgement is due a fixed time after the turn's end, so no real millisecond may pass meanwhile.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const timed = fixture(); const other = await timed.start();
    timed.ask(timed.key(0), b.path);
    timed.service.receive(other, { type: "turn.done" });
    vi.advanceTimersByTime(9_999);
    expect(timed.last(other).type).toBe("turn.done");
    vi.advanceTimersByTime(1);
    vi.useRealTimers();
    await timed.settled();
    expect(timed.last(other)).toMatchObject({ type: "handoff.resolved", outcome: "refused", reason: "not_listed" });
  });
  it("refuses a canvas that existed when the turn was accepted, and one that has a current conversation", async () => {
    const old = fixture({ listed: [a, b] }); const id = await old.start();
    old.ask(old.key(0), b.path); old.service.receive(id, { type: "turn.done" });
    await old.settled();
    expect(old.last(id)).toMatchObject({ type: "handoff.resolved", outcome: "refused", reason: "not_new" });

    const taken = fixture(); const source = await taken.start();
    taken.ask(taken.key(0), b.path); taken.listed.push(b);
    const mine = await taken.start({ canvas: b, text: "mine" });
    taken.service.receive(source, { type: "turn.done" });
    await taken.settled();
    expect(taken.last(source)).toMatchObject({ type: "handoff.resolved", outcome: "refused", reason: "has_conversation" });
    expect(taken.on(b)?.conversationId).toBe(mine);
  });
  it("cancels when the turn stops, and the queue comes back as a draft as before", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    await h.service.interrupt(id);
    expect(h.last(id)).toMatchObject({ type: "handoff.resolved", outcome: "cancelled", turnId: h.turnOf(id) });
    expect(h.on(b)).toBeUndefined();
    expect(h.drafts.returned(id)).toMatchObject({ text: "and the cart" });
    expect(h.prepare).toHaveBeenCalledOnce();
  });
  it("cancels when a failed turn ends it", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    h.service.receive(id, { type: "turn.failed", code: "process_exited" });
    expect(h.last(id)).toMatchObject({ type: "handoff.resolved", outcome: "cancelled" });
    expect(h.on(b)).toBeUndefined();
  });
  it("cancels when the conversation is archived while the handoff waits for its judgement", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path);
    h.service.receive(id, { type: "turn.done" });
    await h.start({ text: "replace a's conversation" });
    expect(h.entry(id).state).toBe("archived");
    expect(h.store.read(id).filter(e => e.type === "handoff.resolved")).toMatchObject([{ outcome: "cancelled" }]);
    h.listed.push(b); h.service.refreshed("/repo", [b.path]);
    await Promise.resolve(); await Promise.resolve();
    expect(h.on(b)).toBeUndefined();
    expect(h.notices).toEqual([]);
  });
  it("refuses without archiving when the target got a current conversation while the next one prepared", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    let release = () => {};
    const prepared = h.prepare.getMockImplementation()!;
    h.prepare.mockImplementationOnce(async (...args) => { await new Promise<void>(resolve => { release = resolve; }); return prepared(...args); });
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(2));
    const mine = await h.start({ canvas: b, text: "mine" });
    release();
    await h.settled();
    expect(h.last(id)).toMatchObject({ type: "handoff.resolved", outcome: "refused", reason: "has_conversation" });
    expect(h.on(b)?.conversationId).toBe(mine);
    expect(h.store.list().filter(m => m.state === "archived")).toEqual([]);
    expect(h.notices).toEqual([]);
  });
  it("records a refused start's code, and the queue goes to the source's next turn", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    h.prepare.mockRejectedValueOnce(new Error("not_logged_in"));
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    expect(h.store.read(id).find(e => e.type === "handoff.resolved")).toMatchObject({ outcome: "refused", reason: "not_logged_in" });
    expect(h.on(b)).toBeUndefined();
    await vi.waitFor(() => expect(h.store.read(id).filter(e => e.type === "user.message")).toHaveLength(2));
  });
  it("moves the person's queue to the next conversation, which sends it after its first turn", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    const target = h.on(b)!.conversationId;
    expect(h.drafts.queued(id)).toEqual([]);
    expect(h.drafts.queued(target).map(item => item.text)).toEqual(["and the cart"]);
    h.service.receive(target, { type: "turn.done" });
    await vi.waitFor(() => expect(h.store.read(target).filter(e => e.type === "user.message").map(e => e.type === "user.message" && e.text)).toEqual([expect.any(String), "and the cart"]));
    expect(h.store.read(id).filter(e => e.type === "user.message")).toHaveLength(1);
    expect(h.drafts.returned(id)).toBeUndefined();
  });
});

describe("the conversation a handoff started", () => {
  async function handedOff() {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    return { h, id, target: h.on(b)!.conversationId };
  }
  it("cannot hand off again in its first turn, even after a steered message, and can once the person sends", async () => {
    const { h, target } = await handedOff();
    expect(h.ask(h.key(1), c.path)).toBe("handoff_turn");
    const { itemId } = h.service.queue(target, { text: "also this", anchors: [] });
    const sent = h.service.sendNow(target, itemId);
    await vi.waitFor(() => expect(h.runners[1]!.steer).toHaveBeenCalledOnce());
    h.open.mock.calls[1]![0].steerConsumed!(vi.mocked(h.runners[1]!.steer).mock.calls[0]![2]);
    await sent;
    expect(h.ask(h.key(1), c.path)).toBe("handoff_turn");
    h.service.receive(target, { type: "turn.done" });
    await h.service.send(target, "Now make the cart", []);
    expect(h.prompt(1, 1)).toContain(HANDOFF_GUIDANCE);
    expect(h.ask(h.key(1), c.path)).toBeNull();
  });
});

describe("a handoff beside the root's project turns", () => {
  it("keeps a project turn judged meanwhile from taking the requested canvas, and the handoff starts there", async () => {
    const h = fixture();
    const project = await h.start({ mode: "newDesign", text: "Draw something" }, ["canvas"]);
    const source = await h.start();
    expect(h.ask(h.key(1), b.path)).toBeNull();
    h.listed.push(b);
    h.service.receive(project, { type: "turn.done" });
    h.service.refreshed("/repo", [b.path]);
    expect(h.entry(project).canvas).toBeUndefined();
    h.service.receive(source, { type: "turn.done" });
    await h.settled();
    expect(h.on(b)?.conversationId).not.toBe(project);
    expect(h.on(b)).toBeDefined();
  });
  it("keeps a project turn judged after the start from taking the canvas over", async () => {
    const h = fixture();
    const project = await h.start({ mode: "newDesign", text: "Draw something" }, ["canvas"]);
    const source = await h.start();
    h.ask(h.key(1), b.path); h.listed.push(b);
    h.service.receive(source, { type: "turn.done" });
    await h.settled();
    const target = h.on(b)!.conversationId;
    h.service.receive(target, { type: "turn.done" });
    h.service.receive(project, { type: "turn.done" });
    h.service.refreshed("/repo", []);
    expect(h.entry(project).canvas).toBeUndefined();
    expect(h.on(b)?.conversationId).toBe(target);
  });
  it("lets a promoted Codex conversation that reuses its runner hand off with the key it opened with", async () => {
    const h = fixture();
    const id = await h.start({ mode: "newDesign", text: "Draw b" }, ["canvas"]);
    const key = h.key(0);
    h.listed.push(b);
    h.service.receive(id, { type: "turn.done" }); h.service.refreshed("/repo", [b.path]);
    expect(h.entry(id).canvas).toEqual(b);
    await h.service.send(id, "Now draw c", []);
    expect(h.open).toHaveBeenCalledOnce();
    expect(h.prompt(0, 1)).toContain(HANDOFF_GUIDANCE);
    expect(h.ask(key, c.path)).toBeNull();
  });
});

// A sign-out cancels a handoff it finds waiting, and the concurrency paths of
// ARCHITECTURE §7 'Handoff' each have a case.
describe("a handoff a stop, an archive, a quit or a broken history meets", () => {
  // The successor's preparation, held until release.
  function hold(h: ReturnType<typeof fixture>) {
    let release = () => {};
    const prepared = h.prepare.getMockImplementation()!;
    h.prepare.mockImplementationOnce(async (...args) => { await new Promise<void>(resolve => { release = resolve; }); return prepared(...args); });
    return () => release();
  }
  const resolutions = (h: ReturnType<typeof fixture>, id: string) => h.store.read(id).filter(e => e.type === "handoff.resolved");
  it("cancels a handoff waiting for its judgement when its provider's runs are stopped, and never starts it", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    h.service.receive(id, { type: "turn.done" });
    await h.service.stopRuns("codex");
    expect(resolutions(h, id)).toMatchObject([{ outcome: "cancelled" }]);
    expect(h.drafts.returned(id)).toMatchObject({ text: "and the cart" });
    h.listed.push(b); h.service.refreshed("/repo", [b.path]);
    await Promise.resolve(); await Promise.resolve();
    expect(h.on(b)).toBeUndefined();
    expect(h.prepare).toHaveBeenCalledOnce();
    expect(h.store.read(id).filter(e => e.type === "user.message")).toHaveLength(1);
  });
  it("cancels a handoff whose next conversation is starting when its provider's runs are stopped", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    const release = hold(h);
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(2));
    await h.service.stopRuns("codex");
    expect(resolutions(h, id)).toMatchObject([{ outcome: "cancelled" }]);
    release();
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
    await Promise.resolve(); await Promise.resolve();
    expect(h.on(b)).toBeUndefined();
    expect(resolutions(h, id)).toHaveLength(1);
    expect(h.notices).toEqual([]);
  });
  it("records a start a stop ended as cancelled, not as the start's refusal", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    let fail = () => {};
    h.prepare.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = () => reject(new Error("process_exited")); }));
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(2));
    await h.service.stopRuns("codex");
    fail();
    await vi.waitFor(() => expect(resolutions(h, id)).toHaveLength(1));
    await Promise.resolve();
    expect(resolutions(h, id)).toMatchObject([{ outcome: "cancelled" }]);
  });
  it("cancels when the conversation is archived while the next one starts, and the start is refused", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    const release = hold(h);
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(2));
    await h.start({ text: "replace a's conversation" });
    expect(h.entry(id).state).toBe("archived");
    expect(resolutions(h, id)).toMatchObject([{ outcome: "cancelled" }]);
    release();
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(3));
    await Promise.resolve(); await Promise.resolve();
    expect(h.on(b)).toBeUndefined();
    expect(resolutions(h, id)).toHaveLength(1);
    expect(h.notices).toEqual([]);
  });
  it("holds a message queued while the handoff waits, then moves it with a start", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path);
    h.service.receive(id, { type: "turn.done" });
    h.service.queue(id, { text: "and the cart", anchors: [] });
    await Promise.resolve(); await Promise.resolve();
    expect(h.store.read(id).filter(e => e.type === "user.message")).toHaveLength(1);
    h.listed.push(b); h.service.refreshed("/repo", [b.path]);
    await h.settled();
    const target = h.on(b)!.conversationId;
    expect(h.drafts.queued(target).map(item => item.text)).toEqual(["and the cart"]);
    expect(h.drafts.queued(id)).toEqual([]);
    expect(h.service.list("/repo").find(s => s.conversationId === id)?.working).toBe(false);
  });
  it("holds a message queued while the handoff waits, then sends it to the source after a refusal", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path);
    h.service.receive(id, { type: "turn.done" });
    h.service.queue(id, { text: "and the cart", anchors: [] });
    h.service.refreshed("/repo", []);
    await h.settled();
    expect(h.last(id)).toMatchObject({ type: "handoff.resolved", outcome: "refused", reason: "not_listed" });
    await vi.waitFor(() => expect(h.store.read(id).filter(e => e.type === "user.message").map(e => e.type === "user.message" && e.text)).toEqual(["Make a checkout page", "and the cart"]));
  });
  it("moves the queue's attachment ids with it: the next conversation reclaims them and the source releases none", async () => {
    const files = { reclaim: vi.fn((_ids: string[]) => ({ recheck: () => [], sent: () => {} })), consume: vi.fn(), discard: vi.fn(), release: vi.fn() };
    const h = fixture({ files }); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    h.service.queue(id, { text: "see the file", anchors: [], ids: ["file-1"] });
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    const target = h.on(b)!.conversationId;
    h.service.receive(target, { type: "turn.done" });
    await vi.waitFor(() => expect(files.consume).toHaveBeenCalledWith(["file-1"]));
    expect(files.reclaim).toHaveBeenCalledWith(["file-1"]);
    await h.start({ text: "replace a's conversation" });
    expect(files.release).not.toHaveBeenCalled();
  });
  it("writes no resolution when the app quits while the handoff waits; the next start reads it as cancelled", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path);
    h.service.receive(id, { type: "turn.done" });
    const waiting = h.service.send(id, "more", []);
    await h.service.quit();
    await expect(waiting).rejects.toThrow("busy");
    expect(h.store.read(id).some(e => e.type === "handoff.resolved")).toBe(false);
    expect(foldConversation(h.store.read(id), id, true).handoffs[h.turnOf(id)]?.[0]?.outcome).toBe("cancelled");
    h.listed.push(b); h.service.refreshed("/repo", [b.path]);
    await Promise.resolve();
    expect(h.prepare).toHaveBeenCalledOnce();
  });
  it("drops a handoff whose history stopped taking writes, so it no longer contests a project turn's canvas", async () => {
    const h = fixture();
    const project = await h.start({ mode: "newDesign", text: "Draw something" }, ["canvas"]);
    const source = await h.start();
    h.ask(h.key(1), b.path);
    const append = h.store.append.bind(h.store);
    vi.spyOn(h.store, "append").mockImplementation((id, turn, event) => { if (id === source) throw new Error("EIO"); return append(id, turn, event); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.service.receive(source, { type: "activity", kind: "other", summary: "x" });
    const x = { path: ".doan/canvases/x.html", id: "x" };
    h.listed.push(x);
    h.service.receive(project, { type: "turn.done" });
    h.service.refreshed("/repo", [x.path]);
    expect(h.entry(project).canvas).toEqual(x);
  });
});

describe("Send now and the handoff guidance", () => {
  const steered = async (h: ReturnType<typeof fixture>, id: string, runner: number) => {
    const { itemId } = h.service.queue(id, { text: "also this", anchors: [] });
    void h.service.sendNow(id, itemId);
    await vi.waitFor(() => expect(h.runners[runner]!.steer).toHaveBeenCalled());
    return vi.mocked(h.runners[runner]!.steer).mock.calls.at(-1)![0];
  };
  it("carries the guidance on a person's turn, not on a handoff's first turn nor on a turn that already handed off", async () => {
    const person = fixture(); const id = await person.start();
    expect(await steered(person, id, 0)).toContain(HANDOFF_GUIDANCE);

    const asked = fixture(); const other = await asked.start();
    asked.ask(asked.key(0), b.path);
    expect(await steered(asked, other, 0)).not.toContain(HANDOFF_GUIDANCE);

    const h = fixture(); const source = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    h.service.receive(source, { type: "turn.done" });
    await h.settled();
    expect(await steered(h, h.on(b)!.conversationId, 1)).not.toContain(HANDOFF_GUIDANCE);
  });
});

// The next conversation inherits the earlier one's Fast; its run takes Fast only when this
// run's list says the model takes it.
describe("fast", () => {
  async function handOff(h: ReturnType<typeof fixture>, request: Partial<StartRequest>) {
    const id = await h.start(request);
    expect(h.ask(h.key(0), b.path)).toBeNull();
    h.listed.push(b);
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    return h.on(b)!;
  }
  it("inherits the stored Fast and runs with it on a model that takes it", async () => {
    const h = fixture({ fast: () => true });
    const target = await handOff(h, { fast: true });
    expect(target).toMatchObject({ model: "gpt-x", fast: true });
    expect(h.open.mock.calls[1]![0]).toMatchObject({ model: "gpt-x", fast: true });
  });
  it("inherits the stored Fast but runs without it on a model that does not take it", async () => {
    const h = fixture({ fast: (_root, _provider, model) => model !== "gpt-x" });
    const target = await handOff(h, { fast: true });
    expect(target).toMatchObject({ fast: true });
    expect(h.open.mock.calls[1]![0]).not.toHaveProperty("fast");
  });
  it("starts without Fast when the earlier conversation had none", async () => {
    const h = fixture({ fast: () => true });
    const target = await handOff(h, {});
    expect(target).not.toHaveProperty("fast");
    expect(h.open.mock.calls[1]![0]).not.toHaveProperty("fast");
  });
});

// The next conversation's first turn names its model's default level when the model has no stored
// effort, as every later turn does, so the person's Codex model_reasoning_effort never runs it at another level.
describe("effort", () => {
  async function handOff(h: ReturnType<typeof fixture>, omit: "effort"[]) {
    const id = await h.start({}, omit);
    expect(h.ask(h.key(0), b.path)).toBeNull();
    h.listed.push(b);
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    return h.on(b)!;
  }
  it("runs the first turn at the model's default level without storing it", async () => {
    const h = fixture({ defaultEffort: (_root, _provider, model) => model === "gpt-x" ? "medium" : undefined });
    const target = await handOff(h, ["effort"]);
    expect(target).toMatchObject({ model: "gpt-x" });
    expect(target).not.toHaveProperty("effort");
    expect(h.open.mock.calls[1]![0]).toMatchObject({ model: "gpt-x", effort: "medium" });
  });
  it("keeps a stored effort", async () => {
    const h = fixture({ defaultEffort: () => "medium" });
    const target = await handOff(h, []);
    expect(target).toMatchObject({ model: "gpt-x", effort: "high" });
    expect(h.open.mock.calls[1]![0]).toMatchObject({ effort: "high" });
  });
});
