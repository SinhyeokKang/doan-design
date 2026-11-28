import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { HANDOFF_GUIDANCE, RECEIVED_GUIDANCE } from "./prompt";
import { ConversationService, resolveListedCanvas, type OpenRunner, type Prepare, type QueueFiles, type QueueOptions, type Runner, type StartRequest } from "./service";
import { foldConversation } from "./state";
import { DraftStore } from "./drafts";
import type { ConversationHandoffNotice } from "./handoff";
import type { Canvas, ConversationEvent, EventPayload } from "./types";

// The conversation service's half of a handoff, with fake runners.
const paths: string[] = [];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
const a = { path: ".doan/canvases/a.html", id: "a" }, b = { path: ".doan/canvases/b.html", id: "b" }, c = { path: ".doan/canvases/c.html", id: "c" };
type Steering = Runner & { steer: NonNullable<Runner["steer"]> };
function fixture(options: { provider?: "claude" | "codex"; listed?: Canvas[]; legacy?: boolean; files?: QueueFiles; fast?: QueueOptions["fast"]; defaultEffort?: QueueOptions["defaultEffort"]; draftsDir?: string; limitWindows?: QueueOptions["limitWindows"]; exitWaitMs?: number } = {}) {
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
  const drafts = new DraftStore(options.draftsDir ?? null);
  const notices: ConversationHandoffNotice[] = [];
  const published: ConversationEvent[] = [];
  const admit = (_root: string, canvas?: Canvas) => canvas ? resolveListedCanvas(canvas, listed) : undefined;
  const service = new ConversationService(store, prepare, open, e => published.push(e), admit, options.exitWaitMs ?? 10_000, () => listed, () => {}, { drafts, ...(options.files ? { files: options.files } : {}), ...(options.fast ? { fast: options.fast } : {}), ...(options.defaultEffort ? { defaultEffort: options.defaultEffort } : {}), ...(options.limitWindows ? { limitWindows: options.limitWindows } : {}) }, undefined, undefined, notice => notices.push(notice));
  const sourceRequest: StartRequest = { root: "/repo", mode: "new", runtime: provider, canvas: a, text: "Make a checkout page", anchors: [], model: "gpt-x", effort: "high", permissionMode: "acceptEdits" };
  const key = (runner: number) => open.mock.calls[runner]![0].env.DOAN_HANDOFF;
  const ask = (handoff: string | undefined, path: string, root = "/repo", text = "The person wants a checkout flow; the cart is next.") =>
    service.requestHandoff({ root, handoff: handoff ?? "", path, text });
  const send = (handoff: string | undefined, path: string, text = "Use the new price on the summary.", root = "/repo") =>
    service.requestSend({ root, handoff: handoff ?? "", path, text });
  const prompt = (runner: number, call = 0) => vi.mocked(runners[runner]!.send).mock.calls[call]![0];
  const entry = (id: string) => store.list().find(m => m.conversationId === id)!;
  const on = (canvas: Canvas) => store.list().find(m => m.canvas?.id === canvas.id);
  const all = (canvas: Canvas) => store.list().filter(m => m.canvas?.id === canvas.id).map(m => m.conversationId);
  const last = (id: string) => store.read(id).at(-1)!;
  const turnOf = (id: string) => store.read(id).filter(e => e.type === "turn.started").at(-1)!.turnId;
  // omit: fields of the canvas request a project or legacy start leaves out.
  const start = async (request: Partial<StartRequest> = {}, omit: ("canvas" | "runtime" | "effort")[] = []) => {
    const full: Partial<StartRequest> = { ...sourceRequest, ...request };
    for (const field of omit) delete full[field];
    return (await service.start(full as StartRequest)).conversationId;
  };
  const settled = () => vi.waitFor(() => expect(store.list().flatMap(m => store.read(m.conversationId)).some(e => e.type === "handoff.resolved")).toBe(true));
  const resolutions = (id: string) => store.read(id).filter(e => e.type === "handoff.resolved");
  const missed = (id: string) => store.read(id).filter(e => e.type === "handoff.missed");
  const texts = (id: string) => store.read(id).flatMap(e => e.type === "user.message" ? [e.text] : []);
  const edit = (id: string, path: string) => service.receive(id, { type: "activity", kind: "edit", path, summary: "Edit" });
  // Lets a released start run to its end: its prepare, then the checks and the refusal after it.
  const drained = async (call: number) => { await prepare.mock.results[call]!.value; for (let i = 0; i < 5; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
  return { dir, drained, service, store, runners, open, prepare, listed, drafts, notices, published, key, ask, send, prompt, entry, on, all, last, turnOf, start, settled, resolutions, missed, texts, edit };
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
    expect(h.ask(h.key(0), c.path)).toBeNull();
    expect(h.last(id)).toMatchObject({ type: "handoff.requested", canvas: { path: c.path }, turnId: h.turnOf(id) });
    expect(h.ask(h.key(0), b.path)).toBe("already_requested");
    expect(h.ask(h.key(0), c.path)).toBe("already_requested");
  });
  it("refuses a root that differs as a string, the conversation's own canvas and a turn that ended", async () => {
    const h = fixture(); const id = await h.start();
    expect(h.ask(h.key(0), b.path, "/repo/")).toBe("root_mismatch");
    expect(h.ask(h.key(0), a.path)).toBe("same_canvas");
    h.service.receive(id, { type: "turn.done" });
    expect(h.ask(h.key(0), b.path)).toBe("not_running");
  });
  it("takes a project conversation's request, whose turn carries the guidance, also for a canvas that already exists", async () => {
    const h = fixture(); const id = await h.start({ mode: "newDesign" }, ["canvas"]);
    expect(h.prompt(0)).toContain(HANDOFF_GUIDANCE);
    expect(h.ask(h.key(0), b.path)).toBeNull();
    expect(h.last(id)).toMatchObject({ type: "handoff.requested", canvas: { path: b.path }, turnId: h.turnOf(id) });
    expect(h.ask(h.key(0), a.path)).toBeNull();
    expect(h.ask(h.key(0), b.path)).toBe("already_requested");
  });
  it("refuses in Plan, by the conversation's mode now, and takes the request once a plan approval changed it", async () => {
    const h = fixture({ provider: "claude" }); await h.start({ permissionMode: "plan" });
    expect(h.prompt(0)).not.toContain(HANDOFF_GUIDANCE);
    expect(h.ask(h.key(0), b.path)).toBe("plan_mode");
    h.open.mock.calls[0]![0].modeReported!({ source: "status", mode: "acceptEdits" }, undefined, undefined);
    expect(h.ask(h.key(0), b.path)).toBeNull();
  });
});

describe("the end of a turn that asked", () => {
  it("starts the listed canvas with the source's choices, a first-line title and the full handoff message", async () => {
    const h = fixture(); const id = await h.start();
    const requestedIn = h.turnOf(id);
    const text = "The person wants a checkout flow.\nKeep {{1}} literal.";
    expect(h.ask(h.key(0), b.path, "/repo", text)).toBeNull();
    h.listed.push(b);
    h.service.setPermissionMode(id, "bypass");
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    const target = h.on(b)!;
    expect(target).toMatchObject({ root: "/repo", canvas: b, model: "gpt-x", effort: "high", permissionMode: "bypass", session: { runtime: "codex" }, title: "The person wants a checkout flow." });
    expect(h.open.mock.calls[1]![0]).toMatchObject({ model: "gpt-x", effort: "high", permissionMode: "bypass" });
    expect(h.store.read(target.conversationId).slice(0, 2)).toMatchObject([
      { type: "user.message", text, anchors: [], origin: { kind: "handoff", conversationId: id, canvas: a } }, { type: "turn.started" }]);
    const data = JSON.parse(h.prompt(1).split("\n\n")[1]!) as Record<string, unknown>;
    expect(data).toEqual({ context: { root: "/repo", canvas: b, from: a }, handoffText: text });
    expect(h.prompt(1)).not.toContain(HANDOFF_GUIDANCE);
    expect(h.last(id)).toMatchObject({ type: "handoff.resolved", outcome: "started", target: { conversationId: target.conversationId, canvas: b }, turnId: requestedIn, conversationId: id });
    expect(h.entry(id)).toMatchObject({ canvas: a });
    expect(h.notices).toEqual([{ root: "/repo", source: { conversationId: id, canvas: a }, target: { conversationId: target.conversationId, canvas: b } }]);
  });
  it("waits for the folder refresh when the canvas is not listed yet, and holds the conversation working until then", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path);
    h.service.receive(id, { type: "turn.done" });
    await Promise.resolve();
    expect(h.on(b)).toBeUndefined();
    expect(h.service.list("/repo").find(s => s.conversationId === id)?.working).toBe(true);
    h.listed.push(b); h.service.refreshed("/repo");
    await h.settled();
    expect(h.on(b)).toBeDefined();
    expect(h.service.list("/repo").find(s => s.conversationId === id)?.working).toBe(false);
  });
  it("refuses as not listed after a refresh or the window without the canvas, and sends the queue to the source", async () => {
    const refreshed = fixture(); const id = await refreshed.start();
    refreshed.ask(refreshed.key(0), b.path);
    refreshed.service.queue(id, { text: "and the cart", anchors: [] });
    refreshed.service.receive(id, { type: "turn.done" });
    refreshed.service.refreshed("/repo");
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
  it("starts a canvas that existed when the turn was accepted, and adds a conversation to a new one that already has one", async () => {
    const old = fixture({ listed: [a, b] }); const id = await old.start();
    old.ask(old.key(0), b.path); old.service.receive(id, { type: "turn.done" });
    await old.settled();
    expect(old.last(id)).toMatchObject({ type: "handoff.resolved", via: "handoff", outcome: "started", target: { conversationId: old.on(b)!.conversationId, canvas: b } });

    const taken = fixture(); const source = await taken.start();
    taken.ask(taken.key(0), b.path); taken.listed.push(b);
    const mine = await taken.start({ canvas: b, text: "mine" });
    const before = taken.store.read(mine);
    taken.service.receive(source, { type: "turn.done" });
    await taken.settled();
    expect(taken.last(source)).toMatchObject({ type: "handoff.resolved", outcome: "started" });
    expect(taken.all(b)).toHaveLength(2);
    expect(taken.store.read(mine)).toEqual(before);
  });
  it("adds a conversation to a new canvas whose conversation is working, which goes on", async () => {
    const h = fixture(); const source = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    const mine = await h.start({ canvas: b, text: "mine" });
    h.service.receive(source, { type: "turn.done" });
    await h.settled();
    expect(h.last(source)).toMatchObject({ type: "handoff.resolved", outcome: "started" });
    expect(h.all(b)).toHaveLength(2);
    expect(h.store.read(mine).map(e => e.type)).toEqual(["user.message", "turn.started"]);
    expect(h.runners[1]!.stop).not.toHaveBeenCalled(); expect(h.runners[1]!.close).not.toHaveBeenCalled();
    expect(h.service.list("/repo").find(c => c.conversationId === mine)?.working).toBe(true);
  });
  it("starts a conversation for each of two turns that hand off to the same new canvas", async () => {
    const h = fixture({ listed: [a, c] });
    const first = await h.start(), second = await h.start({ canvas: c });
    expect(h.ask(h.key(0), b.path)).toBeNull(); expect(h.ask(h.key(1), b.path)).toBeNull();
    h.listed.push(b);
    h.service.receive(first, { type: "turn.done" }); h.service.receive(second, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(first)).toHaveLength(1));
    await vi.waitFor(() => expect(h.resolutions(second)).toHaveLength(1));
    expect(h.resolutions(first)).toMatchObject([{ outcome: "started" }]);
    expect(h.resolutions(second)).toMatchObject([{ outcome: "started" }]);
    expect(h.all(b)).toHaveLength(2);
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
  it("keeps waiting for its judgement, then starts, when another conversation starts on the source canvas meanwhile", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path);
    h.service.receive(id, { type: "turn.done" });
    await h.start({ text: "another conversation on a" });
    expect(h.resolutions(id)).toEqual([]);
    h.listed.push(b); h.service.refreshed("/repo");
    await h.settled();
    expect(h.resolutions(id)).toMatchObject([{ outcome: "started" }]);
    expect(h.on(b)).toBeDefined();
  });
  it("starts beside a conversation the target got while the next one prepared, and leaves that one alone", async () => {
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
    expect(h.last(id)).toMatchObject({ type: "handoff.resolved", outcome: "started" });
    expect(h.all(b)).toHaveLength(2);
    expect(h.store.read(mine).map(e => e.type)).toEqual(["user.message", "turn.started"]);
    expect(h.notices).toHaveLength(1);
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
  // The queue follows a single started handoff even when that conversation's first turn ended before its start was
  // accepted: it is then handled as that turn's end handles a queue (sent after done, a draft after a failure).
  const endedEarly = async (end: EventPayload, options: Parameters<typeof fixture>[0] = {}) => {
    const h = fixture(options); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    const open = h.open.getMockImplementation()!;
    h.open.mockImplementationOnce(async (input, event, ...rest) => { const runner = await open(input, event, ...rest); event(end); return runner; });
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    return { h, id, target: h.on(b)!.conversationId };
  };
  it("moves the queue to a next conversation whose first turn ended done before acceptance, which sends it", async () => {
    const { h, id, target } = await endedEarly({ type: "turn.done" });
    await vi.waitFor(() => expect(h.texts(target)).toEqual([expect.any(String), "and the cart"]));
    expect(h.drafts.queued(target)).toEqual([]);
    expect(h.texts(id)).toEqual(["Make a checkout page"]);
    expect(h.drafts.queued(id)).toEqual([]); expect(h.drafts.returned(id)).toBeUndefined();
  });
  it("moves the queue to a next conversation whose first turn failed before acceptance, which returns it as its draft", async () => {
    const { h, id, target } = await endedEarly({ type: "turn.failed", code: "process_exited" });
    expect(h.drafts.returned(target)).toMatchObject({ text: "and the cart", reason: "turn_failed" });
    expect(h.drafts.queued(target)).toEqual([]);
    expect(h.service.list("/repo").find(s => s.conversationId === target)?.working).toBe(false);
    expect(h.texts(id)).toEqual(["Make a checkout page"]);
    expect(h.drafts.queued(id)).toEqual([]); expect(h.drafts.returned(id)).toBeUndefined();
  });
  it("moves the queue to a next conversation whose first turn was stopped before acceptance, which returns it as its draft", async () => {
    const { h, id, target } = await endedEarly({ type: "interrupted", reason: "user" });
    expect(h.drafts.returned(target)).toMatchObject({ text: "and the cart", reason: "interrupted" });
    expect(h.drafts.queued(target)).toEqual([]);
    expect(h.texts(id)).toEqual(["Make a checkout page"]); expect(h.drafts.returned(id)).toBeUndefined();
  });
  it("leaves a moved queue to the usage read a rate-limited first turn started, which returns it once the read is over", async () => {
    let answer = (_windows: readonly never[]) => {};
    const limitWindows = vi.fn(() => new Promise<readonly never[]>(resolve => { answer = resolve; }));
    const { h, id, target } = await endedEarly({ type: "turn.failed", code: "rate_limited" }, { limitWindows });
    await vi.waitFor(() => expect(limitWindows).toHaveBeenCalledOnce());
    expect(h.drafts.queued(target).map(item => item.text)).toEqual(["and the cart"]);
    expect(h.drafts.returned(target)).toBeUndefined();
    answer([]);
    await vi.waitFor(() => expect(h.drafts.returned(target)).toMatchObject({ text: "and the cart" }));
    expect(h.drafts.queued(target)).toEqual([]);
    expect(h.texts(id)).toEqual(["Make a checkout page"]); expect(h.drafts.returned(id)).toBeUndefined();
  });
  it("sends a moved queue in the next conversation even when another conversation started on its canvas before the queue reached it", async () => {
    const h = fixture({ provider: "claude" }); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    const open = h.open.getMockImplementation()!;
    h.open.mockImplementationOnce(async (input, event, ...rest) => { const runner = await open(input, event, ...rest); event({ type: "turn.done" }); return runner; });
    // Another start on b is accepted after the handoff's start and before its resolution, and ends; the first runner is gone.
    const real = h.service.start.bind(h.service);
    let replacement = "";
    const spy = vi.spyOn(h.service, "start").mockImplementation(async (request, attached, handoff) => {
      const result = await real(request, attached, handoff);
      if (handoff) {
        spy.mockRestore();
        replacement = (await real({ root: "/repo", mode: "new", runtime: "claude", canvas: b, text: "mine", anchors: [] })).conversationId;
        h.service.receive(replacement, { type: "turn.done" });
        h.open.mock.calls[1]![2]();
      }
      return result;
    });
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    const first = h.resolutions(id)[0]!;
    const target = first.type === "handoff.resolved" && first.outcome === "started" ? first.target.conversationId : "";
    await vi.waitFor(() => expect(h.texts(target)).toEqual([expect.any(String), "and the cart"]));
    expect(h.drafts.returned(target)).toBeUndefined();
    expect(h.texts(replacement)).toEqual(["mine"]);
    expect(h.texts(id)).toEqual(["Make a checkout page"]);
  });
  it("gives the queue back as the source's draft when the next conversation was deleted before the queue reached it", async () => {
    const files = { reclaim: vi.fn((_ids: string[]) => ({ recheck: () => [], sent: () => {} })), consume: vi.fn(), discard: vi.fn(), release: vi.fn() };
    const h = fixture({ files }); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    h.service.queue(id, { text: "and the cart", anchors: [], ids: ["file-1"] });
    const open = h.open.getMockImplementation()!;
    h.open.mockImplementationOnce(async (input, event, ...rest) => { const runner = await open(input, event, ...rest); event({ type: "turn.done" }); return runner; });
    // The next conversation is accepted, ends and is deleted before the handoff's start is resolved.
    const real = h.service.start.bind(h.service);
    let deleted = "";
    const spy = vi.spyOn(h.service, "start").mockImplementation(async (request, attached, handoff) => {
      const result = await real(request, attached, handoff);
      if (handoff) { spy.mockRestore(); deleted = result.conversationId; h.service.delete(deleted); }
      return result;
    });
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    await vi.waitFor(() => expect(h.drafts.returned(id)).toMatchObject({ text: "and the cart" }));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(h.drafts.returned(deleted)).toBeUndefined(); expect(h.drafts.queued(deleted)).toEqual([]);
    expect(h.store.read(deleted)).toEqual([]);
    expect(h.texts(id)).toEqual(["Make a checkout page"]); expect(h.drafts.queued(id)).toEqual([]);
    // The file stays held for the source's draft, not released or consumed under the deleted id.
    expect(files.release).not.toHaveBeenCalled(); expect(files.consume).not.toHaveBeenCalled();
  });
  it("keeps a moved queue waiting for the next conversation's first runner when another conversation starts on its canvas", async () => {
    const { h, id, target } = await endedEarly({ type: "turn.done" }, { provider: "claude" });
    // The queue went out and its send waits for the first runner's process.
    await vi.waitFor(() => expect(h.service.list("/repo").find(s => s.conversationId === target)?.working).toBe(true));
    expect(h.texts(target)).toHaveLength(1); expect(h.drafts.returned(target)).toBeUndefined();
    const mine = await h.start({ canvas: b, text: "mine" });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(h.drafts.returned(target)).toBeUndefined();
    expect(h.service.list("/repo").find(s => s.conversationId === target)?.working).toBe(true);
    h.open.mock.calls[1]![2]();
    await vi.waitFor(() => expect(h.texts(target)).toEqual([expect.any(String), "and the cart"]));
    expect(h.texts(mine)).toEqual(["mine"]);
    expect(h.texts(id)).toEqual(["Make a checkout page"]);
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
  it("hands off once in its first turn, even after a steered message, carrying the chain on, and freely once the person sends", async () => {
    const { h, id, target } = await handedOff();
    h.listed.push(c);
    expect(h.ask(h.key(1), c.path)).toBeNull();
    expect(h.ask(h.key(1), a.path)).toBe("chain_one");
    const { itemId } = h.service.queue(target, { text: "also this", anchors: [] });
    const sent = h.service.sendNow(target, itemId);
    await vi.waitFor(() => expect(h.runners[1]!.steer).toHaveBeenCalledOnce());
    h.open.mock.calls[1]![0].steerConsumed!(vi.mocked(h.runners[1]!.steer).mock.calls[0]![2]);
    await sent;
    expect(h.ask(h.key(1), a.path)).toBe("chain_one");
    h.service.receive(target, { type: "turn.done" });
    await vi.waitFor(() => expect(h.on(c)).toBeDefined());
    const onC = h.on(c)!.conversationId;
    expect(h.store.read(onC)[0]).toMatchObject({ type: "user.message", origin: { kind: "handoff", conversationId: target, canvas: b, via: "handoff", chain: [id, target], provider: "codex" } });
    await h.service.send(target, "Now make the cart", []);
    expect(h.prompt(1, 1)).toContain(HANDOFF_GUIDANCE);
    expect(h.ask(h.key(1), a.path)).toBeNull();
    expect(h.ask(h.key(1), ".doan/canvases/d.html")).toBeNull();
  });
});

// A project conversation (no canvas) hands off as a canvas conversation does; it is never bound to a canvas, and the
// project conversations of a root run side by side (ARCHITECTURE §7 'Handoff').
describe("a project conversation's handoff", () => {
  const project = (h: ReturnType<typeof fixture>, text = "Draw a checkout page") => h.start({ mode: "newDesign", text }, ["canvas"]);
  const at = (canvas: Canvas) => `/repo/${canvas.path}`;
  it.each(["claude", "codex"] as const)("starts the next %s conversation from the Overview with the source's settings, and the source stays a project conversation", async provider => {
    const h = fixture({ provider }); const id = await project(h);
    const requestedIn = h.turnOf(id);
    expect(h.ask(h.key(0), b.path, "/repo", "Continue the checkout.")).toBeNull();
    h.listed.push(b);
    h.service.setPermissionMode(id, "bypass");
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    const target = h.on(b)!;
    expect(target).toMatchObject({ root: "/repo", canvas: b, model: "gpt-x", effort: "high", permissionMode: "bypass", session: { runtime: provider } });
    expect(target).not.toHaveProperty("fromHome");
    expect(h.store.read(target.conversationId)[0]).toEqual(expect.objectContaining({ type: "user.message", text: "Continue the checkout.", anchors: [], origin: { kind: "handoff", conversationId: id, via: "handoff", chain: [id], provider } }));
    expect(JSON.parse(h.prompt(1).split("\n\n")[1]!)).toEqual({ context: { root: "/repo", canvas: b }, handoffText: "Continue the checkout." });
    expect(h.prompt(1)).not.toContain(HANDOFF_GUIDANCE);
    expect(h.last(id)).toMatchObject({ type: "handoff.resolved", outcome: "started", target: { conversationId: target.conversationId, canvas: b }, turnId: requestedIn });
    expect(h.entry(id)).not.toHaveProperty("canvas");
    expect(h.store.read(id).some(e => e.type === "conversation.bound")).toBe(false);
    expect(h.notices).toEqual([{ root: "/repo", source: { conversationId: id }, target: { conversationId: target.conversationId, canvas: b } }]);
  });
  it("sends one notice without a source canvas for several started conversations", async () => {
    const h = fixture(); const id = await project(h);
    h.ask(h.key(0), b.path); h.ask(h.key(0), c.path); h.listed.push(b, c);
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(id)).toHaveLength(2));
    expect(h.notices).toEqual([{ root: "/repo", source: { conversationId: id }, targets: [{ conversationId: h.on(b)!.conversationId, canvas: b }, { conversationId: h.on(c)!.conversationId, canvas: c }] }]);
  });
  // A turn's canvases never move the conversation, whatever it made or edited.
  it.each([
    ["one new canvas without a request", [c], [] as Canvas[]],
    ["an existing canvas it edited", [a], [a]],
    ["two new canvases without a request", [b, c], []],
  ] as const)("stays a project conversation after a turn that drew %s, and starts nothing", async (_name, edited, existing) => {
    const h = fixture({ listed: [...existing] }); const id = await project(h);
    for (const canvas of edited) { if (!h.listed.includes(canvas)) h.listed.push(canvas); h.edit(id, at(canvas)); }
    h.service.receive(id, { type: "turn.done" });
    h.service.refreshed("/repo");
    await Promise.resolve();
    expect(h.entry(id)).not.toHaveProperty("canvas");
    expect(h.store.read(id).some(e => e.type === "conversation.bound")).toBe(false);
    expect(h.store.list()).toHaveLength(1);
    expect(h.prepare).toHaveBeenCalledOnce();
    expect(h.notices).toEqual([]);
  });
  it("starts only the requested new canvas of a turn that also edited an existing one, whose drawn card names the new one", async () => {
    const h = fixture(); const id = await project(h);
    h.edit(id, at(a)); h.listed.push(b); h.edit(id, at(b));
    h.ask(h.key(0), b.path);
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    expect(h.store.list().filter(m => m.conversationId !== id).map(m => m.canvas)).toEqual([b]);
    expect(h.entry(id)).not.toHaveProperty("canvas");
    expect(h.store.read(id).filter(e => e.type === "canvas.drawn").map(e => e.type === "canvas.drawn" && e.canvas)).toEqual([b]);
  });
  it("starts and sends two project conversations of a root side by side", async () => {
    const h = fixture(); const first = await project(h, "first"), second = await project(h, "second");
    expect(h.service.list("/repo").filter(row => row.working)).toHaveLength(2);
    h.service.receive(first, { type: "turn.done" });
    await h.service.send(first, "first again", []);
    h.service.receive(second, { type: "turn.done" });
    await h.service.send(second, "second again", []);
    expect(h.texts(first)).toEqual(["first", "first again"]);
    expect(h.texts(second)).toEqual(["second", "second again"]);
  });
  it("starts a conversation for each of a project turn and a canvas turn that hand off to the same new canvas", async () => {
    const h = fixture(); const id = await project(h); const canvas = await h.start();
    expect(h.ask(h.key(0), b.path)).toBeNull(); expect(h.ask(h.key(1), b.path)).toBeNull();
    h.listed.push(b);
    h.service.receive(id, { type: "turn.done" }); h.service.receive(canvas, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(id)).toHaveLength(1));
    await vi.waitFor(() => expect(h.resolutions(canvas)).toHaveLength(1));
    expect([...h.resolutions(id), ...h.resolutions(canvas)]).toMatchObject([{ outcome: "started" }, { outcome: "started" }]);
    expect(h.all(b)).toHaveLength(2);
  });
  it("holds a message queued while the handoff waits and moves it to the one started conversation", async () => {
    const h = fixture(); const id = await project(h);
    h.ask(h.key(0), b.path);
    h.service.receive(id, { type: "turn.done" });
    expect(h.service.list("/repo")[0]?.working).toBe(true);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    await Promise.resolve(); await Promise.resolve();
    expect(h.texts(id)).toEqual(["Draw a checkout page"]);
    h.listed.push(b); h.service.refreshed("/repo");
    await h.settled();
    expect(h.drafts.queued(h.on(b)!.conversationId).map(item => item.text)).toEqual(["and the cart"]);
    expect(h.drafts.queued(id)).toEqual([]);
    expect(h.service.list("/repo").find(row => row.conversationId === id)?.working).toBe(false);
  });
  it("sends a queue at once after a turn without a request, as a canvas conversation's", async () => {
    const h = fixture(); const id = await project(h);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.texts(id)).toEqual(["Draw a checkout page", "and the cart"]));
  });
  // POSTMORTEM 2026-11 'A queue taken back as a draft was still sent by the flush already under way'.
  it.each([
    ["a Stop", (h: ReturnType<typeof fixture>, id: string) => { void h.service.interrupt(id); }],
    ["a stop of its provider", (h: ReturnType<typeof fixture>) => { void h.service.stopRuns("codex"); }],
  ] as const)("sends nothing after %s takes a refused handoff's queue back before its flush", async (_name, take) => {
    const h = fixture(); const id = await project(h);
    h.ask(h.key(0), b.path);
    h.service.receive(id, { type: "turn.done" });
    h.service.queue(id, { text: "and the cart", anchors: [] });
    h.service.refreshed("/repo");
    take(h, id);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(h.texts(id)).toEqual(["Draw a checkout page"]);
    expect(h.drafts.returned(id)).toMatchObject({ text: "and the cart" });
  });
  it.each([
    ["fails", (h: ReturnType<typeof fixture>, id: string) => { h.service.receive(id, { type: "turn.failed", code: "process_exited" }); }],
    ["is stopped", async (h: ReturnType<typeof fixture>, id: string) => { await h.service.interrupt(id); }],
    ["hits the usage limit", (h: ReturnType<typeof fixture>, id: string) => { h.service.receive(id, { type: "turn.failed", code: "rate_limited", detail: "limit" }); }],
  ] as const)("cancels the request of a turn that %s", async (_name, end) => {
    const h = fixture(); const id = await project(h);
    h.ask(h.key(0), b.path); h.listed.push(b);
    await end(h, id);
    expect(h.last(id)).toMatchObject({ type: "handoff.resolved", outcome: "cancelled" });
    expect(h.on(b)).toBeUndefined();
    expect(h.prepare).toHaveBeenCalledOnce();
  });
  it("cancels a waiting request when its provider signs out, and writes nothing when the app quits", async () => {
    const out = fixture(); const id = await project(out);
    out.ask(out.key(0), b.path); out.service.receive(id, { type: "turn.done" });
    await out.service.stopRuns("codex");
    expect(out.resolutions(id)).toMatchObject([{ outcome: "cancelled" }]);
    const quit = fixture(); const other = await project(quit);
    quit.ask(quit.key(0), b.path); quit.service.receive(other, { type: "turn.done" });
    await quit.service.quit();
    quit.listed.push(b); quit.service.refreshed("/repo");
    await Promise.resolve();
    expect(quit.resolutions(other)).toEqual([]);
    expect(quit.prepare).toHaveBeenCalledOnce();
  });
  // POSTMORTEM 2026-11 'The same conversation read as finished in its row while Delete said the agent was working'.
  it("lists the source working and refuses its Delete while a start prepares, then both let go once it is cancelled", async () => {
    const h = fixture(); const id = await project(h);
    h.ask(h.key(0), b.path); h.listed.push(b);
    let release = () => {};
    const prepared = h.prepare.getMockImplementation()!;
    h.prepare.mockImplementationOnce(async (...args) => { await new Promise<void>(resolve => { release = resolve; }); return prepared(...args); });
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(2));
    expect(h.service.list("/repo").find(row => row.conversationId === id)?.working).toBe(true);
    expect(() => h.service.delete(id)).toThrow("busy");
    // A removal's Stop cancels the start under way: it is refused at its next check and opens no runner.
    const removing = h.service.interruptProjectTurn(id, h.service.list("/repo")[0]!.projectTurnId!);
    h.open.mock.calls[0]![2]();
    await removing;
    release();
    await h.drained(1);
    expect(h.on(b)).toBeUndefined();
    expect(h.open).toHaveBeenCalledOnce();
    expect(h.resolutions(id)).toMatchObject([{ outcome: "cancelled" }]);
    expect(h.service.list("/repo").find(row => row.conversationId === id)?.working).toBe(false);
    expect(() => h.service.delete(id)).not.toThrow();
  });
  it("refuses as not listed a target trashed before the judgement", async () => {
    const h = fixture(); const id = await project(h);
    h.listed.push(b); h.ask(h.key(0), b.path);
    h.listed.splice(h.listed.indexOf(b), 1);
    h.service.receive(id, { type: "turn.done" });
    h.service.refreshed("/repo");
    await h.settled();
    expect(h.last(id)).toMatchObject({ type: "handoff.resolved", outcome: "refused", reason: "not_listed" });
  });
  it("teaches no handoff in Plan, takes a request after a plan approval, and writes no missed line for that turn", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const h = fixture({ provider: "claude" }); const id = await h.start({ mode: "newDesign", text: "Plan a checkout", permissionMode: "plan" }, ["canvas"]);
    expect(h.prompt(0)).not.toContain(HANDOFF_GUIDANCE);
    expect(h.ask(h.key(0), b.path)).toBe("plan_mode");
    h.open.mock.calls[0]![0].modeReported!({ source: "status", mode: "acceptEdits" }, undefined, undefined);
    expect(h.ask(h.key(0), b.path)).toBeNull();
    h.listed.push(b, c); h.edit(id, at(b)); h.edit(id, at(c));
    h.service.receive(id, { type: "turn.done" });
    vi.advanceTimersByTime(10_000); await Promise.resolve();
    expect(h.missed(id)).toEqual([]);
  });
  it("lets a Codex project conversation that reuses its runner hand off with the key it opened with", async () => {
    const h = fixture(); const id = await project(h, "Draw b");
    const key = h.key(0);
    h.service.receive(id, { type: "turn.done" });
    await h.service.send(id, "Now draw c", []);
    expect(h.open).toHaveBeenCalledOnce();
    expect(h.prompt(0, 1)).toContain(HANDOFF_GUIDANCE);
    expect(h.ask(key, c.path)).toBeNull();
  });
});
// A project Remove stops the root's project conversations: a request still waiting for its judgement or its start is
// cancelled with it, so no conversation starts in a root on its way out (as a deletion cancels it).
describe("a project removal", () => {
  it("cancels a handoff waiting for its judgement and returns once the conversation stops working", async () => {
    const h = fixture({ provider: "claude" }); const id = await h.start({ mode: "newDesign", text: "Draw b" }, ["canvas"]);
    h.ask(h.key(0), b.path);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    h.service.receive(id, { type: "turn.done" });
    h.open.mock.calls[0]![2]();
    const turn = h.service.list("/repo")[0]!.projectTurnId!;
    expect(turn).toBe(h.turnOf(id));
    await h.service.interruptProjectTurn(id, turn);
    expect(h.resolutions(id)).toMatchObject([{ outcome: "cancelled" }]);
    expect(h.drafts.returned(id)).toMatchObject({ text: "and the cart" });
    expect(h.service.projectRemovalBusy(["/repo"])).toBe(false);
    h.listed.push(b); h.service.refreshed("/repo");
    await Promise.resolve();
    expect(h.on(b)).toBeUndefined();
    expect(h.prepare).toHaveBeenCalledOnce();
  });
});

// A sign-out cancels a handoff it finds waiting, and the concurrency paths of
// ARCHITECTURE §7 'Handoff' each have a case.
describe("a handoff a stop, a quit or a broken history meets", () => {
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
    h.listed.push(b); h.service.refreshed("/repo");
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
    await h.drained(1);
    expect(h.open).toHaveBeenCalledOnce();
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
  it("starts the next conversation when another conversation starts on the source canvas while it prepares", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    const release = hold(h);
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(2));
    await h.start({ text: "another conversation on a" });
    expect(resolutions(h, id)).toEqual([]);
    release();
    await h.settled();
    expect(resolutions(h, id)).toMatchObject([{ outcome: "started" }]);
    expect(h.on(b)).toBeDefined();
  });
  // Held in its preparation, the old start meets the check after it; held while its runner opens, the one right before
  // acceptance.
  it.each(["prepare", "open"] as const)("never starts a cancelled turn's handoff from a later turn's request for the same path (held in %s)", async held => {
    const h = fixture(); const id = await h.start();
    const gates: (() => void)[] = [];
    const base = h.prepare.getMockImplementation()!, opened = h.open.getMockImplementation()!;
    const gate = () => new Promise<void>(resolve => gates.push(resolve));
    h.prepare.mockImplementation(async (request, stored) => {
      if (request.canvas?.id !== "b") return base(request, stored);
      if (held === "prepare") await gate();
      const prepared = await base(request, stored);
      return { ...prepared, env: { ...prepared.env, TARGET: "b" } };
    });
    h.open.mockImplementation(async (input, ...rest) => { if (held === "open" && input.env.TARGET === "b") await gate(); return opened(input, ...rest); });
    h.ask(h.key(0), b.path, "/repo", "From the first turn."); h.listed.push(b);
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(gates).toHaveLength(1));
    // Its provider's runs are stopped (its handoff cancelled), then a send starts a turn without b listed.
    await h.service.stopRuns("codex");
    expect(resolutions(h, id)).toMatchObject([{ outcome: "cancelled" }]);
    h.open.mock.calls[0]![2]();
    h.listed.splice(h.listed.indexOf(b), 1);
    await h.service.send(id, "again", []);
    const key = h.open.mock.calls.filter(call => call[0].env.DOAN_CONVERSATION_ID === id).at(-1)![0].env.DOAN_HANDOFF;
    h.listed.push(b);
    expect(h.ask(key, b.path, "/repo", "From the second turn.")).toBeNull();
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(gates).toHaveLength(2));
    gates[0]!();
    await h.drained(h.prepare.mock.calls.findIndex(call => call[0].canvas?.id === "b"));
    expect(h.on(b)).toBeUndefined();
    gates[1]!();
    await vi.waitFor(() => expect(resolutions(h, id)).toHaveLength(2));
    expect(resolutions(h, id).at(-1)).toMatchObject({ canvas: { path: b.path }, outcome: "started" });
    expect(h.store.read(h.on(b)!.conversationId)[0]).toMatchObject({ type: "user.message", text: "From the second turn." });
  });
  it("holds a message queued while the handoff waits, then moves it with a start", async () => {
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path);
    h.service.receive(id, { type: "turn.done" });
    h.service.queue(id, { text: "and the cart", anchors: [] });
    await Promise.resolve(); await Promise.resolve();
    expect(h.store.read(id).filter(e => e.type === "user.message")).toHaveLength(1);
    h.listed.push(b); h.service.refreshed("/repo");
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
    h.service.refreshed("/repo");
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
  it("gives a queued message that would not fit beside the next conversation's own queue back to the source, with its attachment ids", async () => {
    const files = { reclaim: vi.fn((_ids: string[]) => ({ recheck: () => [], sent: () => {} })), consume: vi.fn(), discard: vi.fn(), release: vi.fn() };
    const h = fixture({ files }); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    const record = { name: "a.png", size: 3, kind: "image" as const, path: "/Users/me/a.png" };
    h.service.queue(id, { text: "see the files", anchors: [], attachments: Array(6).fill(record), ids: ["f1", "f2", "f3", "f4", "f5", "f6"] });
    // The person queues into the next conversation between its start and the handoff's settling.
    const real = h.service.start.bind(h.service);
    const spy = vi.spyOn(h.service, "start").mockImplementation(async (request, attached, handoff) => {
      const result = await real(request, attached, handoff);
      if (handoff) { spy.mockRestore(); h.drafts.add(result.conversationId, { itemId: "mine", text: "mine", anchors: [], attachments: Array(6).fill(record) }); }
      return result;
    });
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    const target = h.on(b)!.conversationId;
    await vi.waitFor(() => expect(h.drafts.returned(id)).toMatchObject({ text: "see the files", reason: "queue_limit" }));
    expect(h.drafts.queued(target).map(item => item.itemId)).toEqual(["mine"]);
    expect(h.service.takeDraft(id)).toMatchObject({ text: "see the files", ids: ["f1", "f2", "f3", "f4", "f5", "f6"] });
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
    h.listed.push(b); h.service.refreshed("/repo");
    await Promise.resolve();
    expect(h.prepare).toHaveBeenCalledOnce();
  });
});

describe("Send now and the handoff guidance", () => {
  const steered = async (h: ReturnType<typeof fixture>, id: string, runner: number) => {
    const { itemId } = h.service.queue(id, { text: "also this", anchors: [] });
    void h.service.sendNow(id, itemId);
    await vi.waitFor(() => expect(h.runners[runner]!.steer).toHaveBeenCalled());
    return vi.mocked(h.runners[runner]!.steer).mock.calls.at(-1)![0];
  };
  it("carries the guidance on a person's turn, also one that asked already, but not on a handoff's first turn", async () => {
    const person = fixture(); const id = await person.start();
    expect(await steered(person, id, 0)).toContain(HANDOFF_GUIDANCE);

    const asked = fixture(); const other = await asked.start();
    asked.ask(asked.key(0), b.path);
    expect(await steered(asked, other, 0)).toContain(HANDOFF_GUIDANCE);
    expect(asked.ask(asked.key(0), c.path)).toBeNull();

    const h = fixture(); const source = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    h.service.receive(source, { type: "turn.done" });
    await h.settled();
    expect(await steered(h, h.on(b)!.conversationId, 1)).not.toContain(HANDOFF_GUIDANCE);
  });
});

// A queue's send goes out a tick after its flush; whatever took the queue back meanwhile (a Stop, a stop of its
// provider) wins, and the copy the flush captured is not sent (POSTMORTEM 2026-11-14).
describe("a queue taken back before its flush sends", () => {
  it.each([
    ["a Stop", (h: ReturnType<typeof fixture>, id: string) => { void h.service.interrupt(id); }],
    ["a stop of its provider", (h: ReturnType<typeof fixture>) => { void h.service.stopRuns("codex"); }],
  ] as const)("sends nothing after %s, and the draft holds the queue once", async (_name, take) => {
    const h = fixture(); const id = await h.start();
    h.service.queue(id, { text: "and the cart", anchors: [] });
    h.service.receive(id, { type: "turn.done" });
    take(h, id);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(h.texts(id)).toEqual(["Make a checkout page"]);
    expect(h.drafts.returned(id)).toMatchObject({ text: "and the cart" });
    expect(h.prepare).toHaveBeenCalledOnce();
  });
});

// A turn may hand off to each new canvas it made: every request is judged on its own, the decided starts go one at a
// time in request order, and the queue and the notice wait for the last resolution (ARCHITECTURE §7 'Handoff').
describe("a turn that asks for several canvases", () => {
  const b2 = { path: ".doan/canvases/b2.html", id: "b" };
  const asks = (h: ReturnType<typeof fixture>, ...paths: string[]) => { for (const path of paths) expect(h.ask(h.key(0), path, "/repo", `Continue ${path}.`)).toBeNull(); };
  const outcomes = (h: ReturnType<typeof fixture>, id: string) => h.resolutions(id).map(e => e.type === "handoff.resolved" && [e.canvas?.path, e.outcome, e.outcome === "refused" ? e.reason : undefined]);
  // Holds the nth preparation from now (1: the next one) until release.
  function hold(h: ReturnType<typeof fixture>, nth: number) {
    let release = () => {};
    const prepared = h.prepare.getMockImplementation()!;
    for (let i = 1; i < nth; i++) h.prepare.mockImplementationOnce(prepared);
    h.prepare.mockImplementationOnce(async (...args) => { await new Promise<void>(resolve => { release = resolve; }); return prepared(...args); });
    return () => release();
  }
  it("starts each in request order, one at a time, then sends one notice and the queue to the source", async () => {
    const h = fixture(); const id = await h.start(); const turn = h.turnOf(id);
    asks(h, c.path, b.path); h.listed.push(b, c);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    const release = hold(h, 1);
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(2));
    await Promise.resolve(); await Promise.resolve();
    expect(h.prepare).toHaveBeenCalledTimes(2);
    expect(h.prepare.mock.calls[1]![0]).toMatchObject({ canvas: c });
    release();
    await vi.waitFor(() => expect(h.resolutions(id)).toHaveLength(2));
    const onC = h.on(c)!.conversationId, onB = h.on(b)!.conversationId;
    expect(h.prepare.mock.calls[2]![0]).toMatchObject({ canvas: b });
    expect(h.resolutions(id)).toMatchObject([
      { canvas: { path: c.path }, outcome: "started", target: { conversationId: onC, canvas: c }, turnId: turn },
      { canvas: { path: b.path }, outcome: "started", target: { conversationId: onB, canvas: b }, turnId: turn }]);
    expect(h.store.read(onC)[0]).toMatchObject({ type: "user.message", text: `Continue ${c.path}.`, origin: { conversationId: id, canvas: a } });
    expect(h.entry(onB)).toMatchObject({ model: "gpt-x", effort: "high", permissionMode: "acceptEdits" });
    expect(h.notices).toEqual([{ root: "/repo", source: { conversationId: id, canvas: a }, targets: [{ conversationId: onC, canvas: c }, { conversationId: onB, canvas: b }] }]);
    await vi.waitFor(() => expect(h.texts(id)).toEqual(["Make a checkout page", "and the cart"]));
    expect(h.drafts.queued(onB)).toEqual([]); expect(h.drafts.queued(onC)).toEqual([]);
  });
  it("starts both when one canvas already has a conversation, with the notice for several", async () => {
    const h = fixture(); const id = await h.start();
    asks(h, b.path, c.path); h.listed.push(b, c);
    const mine = await h.start({ canvas: b, text: "mine" });
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(id)).toHaveLength(2));
    expect(outcomes(h, id)).toEqual([[b.path, "started", undefined], [c.path, "started", undefined]]);
    const onB = h.all(b).find(other => other !== mine)!;
    expect(h.notices).toEqual([{ root: "/repo", source: { conversationId: id, canvas: a }, targets: [{ conversationId: onB, canvas: b }, { conversationId: h.on(c)!.conversationId, canvas: c }] }]);
  });
  it("starts none until every request is decided: a canvas gone before the judgement waits for the refresh, then is refused", async () => {
    const h = fixture(); const id = await h.start();
    h.listed.push(b, c); asks(h, b.path, c.path);
    h.listed.splice(h.listed.indexOf(b), 1);
    h.service.receive(id, { type: "turn.done" });
    await Promise.resolve(); await Promise.resolve();
    expect(h.prepare).toHaveBeenCalledOnce();
    h.service.refreshed("/repo");
    await vi.waitFor(() => expect(h.resolutions(id)).toHaveLength(2));
    expect(outcomes(h, id)).toEqual([[b.path, "refused", "not_listed"], [c.path, "started", undefined]]);
  });
  it("waits for a canvas not listed yet before starting the listed one, and a second refresh starts nothing twice", async () => {
    const h = fixture(); const id = await h.start();
    asks(h, b.path, c.path); h.listed.push(b);
    h.service.receive(id, { type: "turn.done" });
    await Promise.resolve(); await Promise.resolve();
    expect(h.prepare).toHaveBeenCalledOnce();
    expect(h.service.list("/repo").find(s => s.conversationId === id)?.working).toBe(true);
    const release = hold(h, 1);
    h.listed.push(c); h.service.refreshed("/repo");
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(2));
    h.service.refreshed("/repo");
    release();
    await vi.waitFor(() => expect(h.resolutions(id)).toHaveLength(2));
    h.service.refreshed("/repo");
    await Promise.resolve(); await Promise.resolve();
    expect(h.prepare).toHaveBeenCalledTimes(3);
    expect(outcomes(h, id)).toEqual([[b.path, "started", undefined], [c.path, "started", undefined]]);
    expect(h.store.list()).toHaveLength(3);
  });
  it("refuses both of two new canvases that share an ID, and sends the queue to the source", async () => {
    const h = fixture(); const id = await h.start();
    asks(h, b.path, b2.path); h.listed.push(b, b2);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    h.service.receive(id, { type: "turn.done" });
    expect(outcomes(h, id)).toEqual([[b.path, "refused", "not_listed"], [b2.path, "refused", "not_listed"]]);
    await vi.waitFor(() => expect(h.texts(id)).toEqual(["Make a checkout page", "and the cart"]));
    expect(h.notices).toEqual([]);
  });
  it("goes on with the rest when another conversation starts on the source canvas between two starts", async () => {
    const h = fixture(); const id = await h.start();
    asks(h, b.path, c.path); h.listed.push(b, c);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    const release = hold(h, 2);
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(3));
    await h.start({ text: "another conversation on a" });
    expect(outcomes(h, id)).toEqual([[b.path, "started", undefined]]);
    release();
    await vi.waitFor(() => expect(h.resolutions(id)).toHaveLength(2));
    expect(outcomes(h, id)).toEqual([[b.path, "started", undefined], [c.path, "started", undefined]]);
    await vi.waitFor(() => expect(h.texts(id)).toEqual(["Make a checkout page", "and the cart"]));
  });
  it("cancels the rest when its provider's runs are stopped between two starts, and returns the queue as a draft", async () => {
    const h = fixture(); const id = await h.start();
    asks(h, b.path, c.path); h.listed.push(b, c);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    const release = hold(h, 2);
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(3));
    await h.service.stopRuns("codex");
    expect(outcomes(h, id)).toEqual([[b.path, "started", undefined], [c.path, "cancelled", undefined]]);
    expect(h.drafts.returned(id)).toMatchObject({ text: "and the cart" });
    release();
    await h.drained(2);
    expect(h.open).toHaveBeenCalledTimes(2);
    expect(h.on(c)).toBeUndefined();
    expect(h.resolutions(id)).toHaveLength(2);
    expect(h.texts(id)).toEqual(["Make a checkout page"]);
  });
  it("writes nothing for the rest when the app quits between two starts; the next start reads them as cancelled", async () => {
    const h = fixture(); const id = await h.start();
    asks(h, b.path, c.path); h.listed.push(b, c);
    const release = hold(h, 2);
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(3));
    await h.service.quit();
    release();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(outcomes(h, id)).toEqual([[b.path, "started", undefined]]);
    expect(foldConversation(h.store.read(id), id, true).handoffs[h.turnOf(id)]?.map(f => f.outcome)).toEqual(["started", "cancelled"]);
    expect(h.on(c)).toBeUndefined();
  });
  it("keeps a queue on disk when the app quits between two starts, and the next start returns it as a draft", async () => {
    const draftsDir = mkdtempSync(join(tmpdir(), "doan-handoff-drafts-")); paths.push(draftsDir);
    const h = fixture({ draftsDir }); const id = await h.start();
    asks(h, b.path, c.path); h.listed.push(b, c);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    const release = hold(h, 2);
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(3));
    await h.service.quit();
    release(); await h.drained(2);
    expect(h.texts(id)).toEqual(["Make a checkout page"]);
    expect(h.drafts.returned(id)).toBeUndefined();
    expect(new DraftStore(draftsDir).returned(id)).toMatchObject({ text: "and the cart", reason: "restarted" });
  });
  it("cancels every request of a turn that failed", async () => {
    const h = fixture(); const id = await h.start();
    asks(h, b.path, c.path); h.listed.push(b, c);
    h.service.receive(id, { type: "turn.failed", code: "process_exited" });
    expect(outcomes(h, id)).toEqual([[b.path, "cancelled", undefined], [c.path, "cancelled", undefined]]);
    expect(h.prepare).toHaveBeenCalledOnce();
  });
});

// A guided turn that ended done gets a missed line for each new canvas it edited and asked no handoff for, at the
// handoff's deadline, without holding the queue or the working state (ARCHITECTURE §7 'Handoff').
describe("missed handoffs", () => {
  const at = (canvas: Canvas) => `/repo/${canvas.path}`;
  const fake = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  const deadline = () => vi.advanceTimersByTime(10_000);
  it("writes a missed line for a new canvas the turn edited without a request, at the deadline", async () => {
    fake();
    const h = fixture(); const id = await h.start(); const turn = h.turnOf(id);
    h.listed.push(c); h.edit(id, at(c));
    h.service.receive(id, { type: "turn.done" });
    vi.advanceTimersByTime(9_999);
    expect(h.missed(id)).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(h.missed(id)).toMatchObject([{ type: "handoff.missed", canvas: c, turnId: turn }]);
    expect(h.published.at(-1)).toMatchObject({ type: "handoff.missed" });
    expect(h.on(c)).toBeUndefined();
    expect(h.prepare).toHaveBeenCalledOnce();
  });
  it("comes earlier once the turn's process is gone, as the handoff judgement does", async () => {
    fake();
    const h = fixture({ provider: "claude" }); const id = await h.start();
    h.listed.push(c); h.edit(id, at(c));
    h.service.receive(id, { type: "turn.done" });
    h.open.mock.calls[0]![2]();
    vi.advanceTimersByTime(5_572);
    expect(h.missed(id)).toHaveLength(1);
  });
  it("names the missed canvas beside a request that started in the same turn", async () => {
    fake();
    const h = fixture(); const id = await h.start();
    h.listed.push(b, c); h.edit(id, at(b)); h.edit(id, at(c));
    expect(h.ask(h.key(0), b.path)).toBeNull();
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    deadline();
    expect(h.resolutions(id)).toMatchObject([{ canvas: { path: b.path }, outcome: "started" }]);
    expect(h.missed(id)).toMatchObject([{ canvas: c }]);
  });
  it("sends the queue at once and is not working while the missed line waits, and a next send leaves it due", async () => {
    fake();
    const h = fixture(); const id = await h.start(); const first = h.turnOf(id);
    h.listed.push(c); h.edit(id, at(c));
    h.service.queue(id, { text: "and the cart", anchors: [] });
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.texts(id)).toEqual(["Make a checkout page", "and the cart"]));
    h.service.receive(id, { type: "turn.done" });
    expect(h.service.list("/repo").find(s => s.conversationId === id)?.working).toBe(false);
    await h.service.send(id, "more", []);
    deadline();
    expect(h.missed(id)).toMatchObject([{ canvas: c, turnId: first }]);
  });
  it("names a canvas listed only after the first refresh, as long as it is listed by the deadline", async () => {
    fake();
    const h = fixture(); const id = await h.start();
    h.edit(id, at(c));
    h.service.receive(id, { type: "turn.done" });
    h.service.refreshed("/repo");
    vi.advanceTimersByTime(4_000);
    h.listed.push(c); h.service.refreshed("/repo");
    deadline();
    expect(h.missed(id)).toMatchObject([{ canvas: c }]);
  });
  it("keeps each guided turn's missed line when the next turn ends before the earlier deadline, under its own turn", async () => {
    fake();
    const d = { path: ".doan/canvases/d.html", id: "d" };
    const h = fixture(); const id = await h.start(); const first = h.turnOf(id);
    h.listed.push(c); h.edit(id, at(c));
    h.service.receive(id, { type: "turn.done" });
    vi.advanceTimersByTime(1_000);
    await h.service.send(id, "and d", []); const second = h.turnOf(id);
    h.listed.push(d); h.edit(id, at(d));
    h.service.receive(id, { type: "turn.done" });
    vi.advanceTimersByTime(9_000);
    expect(h.missed(id)).toMatchObject([{ canvas: c, turnId: first }]);
    vi.advanceTimersByTime(1_000);
    expect(h.missed(id)).toMatchObject([{ canvas: c, turnId: first }, { canvas: d, turnId: second }]);
  });
  it("comes a settle time after a late exit, but never after the window's end", async () => {
    fake();
    const late = fixture({ provider: "claude" }); const id = await late.start();
    late.listed.push(c); late.edit(id, at(c));
    late.service.receive(id, { type: "turn.done" });
    vi.advanceTimersByTime(3_000);
    late.open.mock.calls[0]![2]();
    vi.advanceTimersByTime(5_571);
    expect(late.missed(id)).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(late.missed(id)).toHaveLength(1);

    const capped = fixture({ provider: "claude" }); const other = await capped.start();
    capped.listed.push(c); capped.edit(other, at(c));
    capped.service.receive(other, { type: "turn.done" });
    vi.advanceTimersByTime(9_000);
    capped.open.mock.calls[0]![2]();
    vi.advanceTimersByTime(999);
    expect(capped.missed(other)).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(capped.missed(other)).toHaveLength(1);
  });
  it("comes a settle time after the previous runner exits while the next send waits for it", async () => {
    fake();
    const h = fixture({ provider: "claude" }); const id = await h.start(); const first = h.turnOf(id);
    h.listed.push(c); h.edit(id, at(c));
    h.service.receive(id, { type: "turn.done" });
    vi.advanceTimersByTime(1_000);
    const sent = h.service.send(id, "more", []);
    vi.advanceTimersByTime(1_000);
    h.open.mock.calls[0]![2]();
    await sent;
    vi.advanceTimersByTime(5_571);
    expect(h.missed(id)).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(h.missed(id)).toMatchObject([{ canvas: c, turnId: first }]);
  });
  it("attempts no missed write once a later write failed and dropped the conversation's handoffs", async () => {
    fake();
    const h = fixture(); const id = await h.start();
    h.listed.push(c); h.edit(id, at(c));
    h.service.receive(id, { type: "turn.done" });
    await h.service.send(id, "more", []);
    const append = h.store.append.bind(h.store);
    const spy = vi.spyOn(h.store, "append").mockImplementation((conversation, turn, event) => { if (conversation === id && event.type === "activity") throw new Error("EIO"); return append(conversation, turn, event); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.service.receive(id, { type: "activity", kind: "other", summary: "x" });
    deadline();
    expect(spy.mock.calls.filter(([, , event]) => event.type === "handoff.missed")).toEqual([]);
    expect(h.missed(id)).toEqual([]);
  });
  const none = async (setup: (h: ReturnType<typeof fixture>) => Promise<string>) => {
    fake();
    const h = fixture(); const id = await setup(h);
    deadline();
    await Promise.resolve();
    expect(h.store.list().flatMap(m => h.missed(m.conversationId))).toEqual([]);
    return { h, id };
  };
  it("writes none for a Plan turn or a handoff's first turn", async () => {
    await none(async h => { const id = await h.start({ permissionMode: "plan" }); h.listed.push(c); h.edit(id, at(c)); h.service.receive(id, { type: "turn.done" }); return id; });
    fake();
    const h = fixture(); const id = await h.start();
    h.ask(h.key(0), b.path); h.listed.push(b);
    h.service.receive(id, { type: "turn.done" });
    await h.settled();
    const target = h.on(b)!.conversationId;
    h.listed.push(c); h.edit(target, at(c));
    h.service.receive(target, { type: "turn.done" });
    deadline(); await Promise.resolve();
    expect(h.missed(target)).toEqual([]);
    expect(h.missed(id)).toEqual([]);
  });
  it("writes one for a project turn's new canvas, which leaves the conversation a project one", async () => {
    fake();
    const h = fixture(); const id = await h.start({ mode: "newDesign", text: "Draw c" }, ["canvas"]); const turn = h.turnOf(id);
    h.listed.push(c); h.edit(id, at(a)); h.edit(id, at(c));
    h.service.receive(id, { type: "turn.done" }); h.service.refreshed("/repo");
    deadline();
    expect(h.missed(id)).toMatchObject([{ type: "handoff.missed", canvas: c, turnId: turn }]);
    expect(h.entry(id)).not.toHaveProperty("canvas");
  });
  it("writes none for a failed or a stopped turn", async () => {
    await none(async h => { const id = await h.start(); h.listed.push(c); h.edit(id, at(c)); h.service.receive(id, { type: "turn.failed", code: "process_exited" }); return id; });
    await none(async h => { const id = await h.start(); h.listed.push(c); h.edit(id, at(c)); await h.service.interrupt(id); return id; });
  });
  it("writes none for existing canvases, files that are not canvases, or a canvas made without an edit activity", async () => {
    await none(async h => { h.listed.push(b); const id = await h.start(); h.edit(id, at(a)); h.edit(id, at(b)); h.service.receive(id, { type: "turn.done" }); return id; });
    await none(async h => { const id = await h.start(); h.edit(id, "/repo/notes.md"); h.edit(id, "/repo/.doan/assets/x.png"); h.service.receive(id, { type: "turn.done" }); return id; });
    await none(async h => {
      const id = await h.start(); h.listed.push(c);
      h.service.receive(id, { type: "activity", kind: "command", summary: "Ran a command" });
      h.service.receive(id, { type: "turn.done" }); return id;
    });
  });
  it("writes one for a new canvas another conversation started on by the deadline", async () => {
    fake();
    const h = fixture(); const id = await h.start(); h.listed.push(c); h.edit(id, at(c)); h.service.receive(id, { type: "turn.done" });
    await h.start({ canvas: c, text: "mine" });
    deadline(); await Promise.resolve();
    expect(h.missed(id)).toMatchObject([{ canvas: c }]);
  });
  it("still writes one when another conversation started on the source canvas, and never recreates a deleted history", async () => {
    fake();
    const kept = fixture(); const source = await kept.start(); kept.listed.push(c); kept.edit(source, at(c)); kept.service.receive(source, { type: "turn.done" });
    await kept.start({ text: "another conversation on a" });
    deadline(); await Promise.resolve();
    expect(kept.missed(source)).toMatchObject([{ canvas: c }]);
    const { h, id } = await none(async h => {
      const id = await h.start(); h.listed.push(c); h.edit(id, at(c)); h.service.receive(id, { type: "turn.done" });
      h.service.delete(id);
      return id;
    });
    expect(h.store.read(id)).toEqual([]);
    expect(existsSync(join(h.dir, "conversations", `${id}.jsonl`))).toBe(false);
  });
  it("writes none after the app quit, nor for a history that stopped taking writes", async () => {
    await none(async h => { const id = await h.start(); h.listed.push(c); h.edit(id, at(c)); h.service.receive(id, { type: "turn.done" }); await h.service.quit(); return id; });
    fake();
    const h = fixture(); const id = await h.start(); h.listed.push(c); h.edit(id, at(c));
    h.service.receive(id, { type: "turn.done" });
    const append = h.store.append.bind(h.store);
    vi.spyOn(h.store, "append").mockImplementation((conversation, turn, event) => { if (conversation === id && event.type === "handoff.missed") throw new Error("EIO"); return append(conversation, turn, event); });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    deadline();
    expect(h.missed(id)).toEqual([]);
    expect(logged).toHaveBeenCalled();
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

// `doan send`: the message goes to the canvas's latest conversation once the asking turn ended done, at once when that
// conversation rests and queued behind its turn otherwise (ARCHITECTURE §7 'Handoff').
describe("a send", () => {
  const d = { path: ".doan/canvases/d.html", id: "d" };
  const agentRows = (h: ReturnType<typeof fixture>, id: string) => h.drafts.queued(id).filter(item => item.origin);
  const userMessages = (h: ReturnType<typeof fixture>, id: string) => h.store.read(id).flatMap(e => e.type === "user.message" ? [e] : []);
  // x: the receiving conversation on b (runner 0), resting unless busy; s: the sender on a (runner 1).
  async function pair(options: { busy?: boolean; provider?: "claude" | "codex"; draftsDir?: string } = {}) {
    const h = fixture({ listed: [a, b, c], ...options });
    const x = await h.start({ canvas: b, text: "mine" });
    if (!options.busy) h.service.receive(x, { type: "turn.done" });
    const s = await h.start();
    return { h, x, s };
  }
  it("is taken as a request with its via, and counts with handoffs for the same canvas", async () => {
    const { h, s } = await pair();
    expect(h.send(h.key(1), b.path)).toBeNull();
    expect(h.last(s)).toMatchObject({ type: "handoff.requested", canvas: { path: b.path }, text: "Use the new price on the summary.", via: "send", turnId: h.turnOf(s) });
    expect(h.ask(h.key(1), b.path)).toBe("already_requested");
    expect(h.send(h.key(1), b.path)).toBe("already_requested");
    expect(h.send(h.key(1), a.path)).toBe("same_canvas");
    expect(h.send(h.key(1), c.path)).toBeNull();
  });
  it("starts a turn on a resting conversation with its own choices, an origin message and the send's prompt, and keeps its title", async () => {
    const { h, x, s } = await pair();
    h.send(h.key(1), b.path);
    h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(1));
    expect(h.last(s)).toMatchObject({ type: "handoff.resolved", canvas: { path: b.path }, via: "send", outcome: "sent", target: { conversationId: x, canvas: b }, queued: false });
    expect(userMessages(h, x).at(-1)).toMatchObject({ text: "Use the new price on the summary.", anchors: [], origin: { kind: "handoff", conversationId: s, canvas: a, via: "send", chain: [s], provider: "codex" } });
    const prompt = h.prompt(0, 1), sections = prompt.split("\n\n");
    expect(JSON.parse(sections[1]!)).toEqual({ context: { root: "/repo", canvas: b, from: a }, handoffText: "Use the new price on the summary." });
    expect(sections[0]).toContain("sent it to this conversation");
    expect(sections).toContain(RECEIVED_GUIDANCE);
    expect(prompt).not.toContain(HANDOFF_GUIDANCE);
    expect(h.entry(x).title).toBe("mine");
    expect(h.store.list().filter(m => m.canvas?.id === "b")).toHaveLength(1);
    expect(h.notices).toEqual([{ kind: "message", root: "/repo", source: { conversationId: s, canvas: a }, targets: [{ conversationId: x, canvas: b, via: "send" }] }]);
  });
  // A message's leading command name is the agent's text: it is never run as a command (POSTMORTEM 2026-11-18).
  it("sends text that starts with a command name or holds markers as the agent's message", async () => {
    const { h, x, s } = await pair();
    h.send(h.key(1), b.path, "/compact {{1}} then go on");
    h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toMatchObject([{ outcome: "sent" }]));
    expect(userMessages(h, x).at(-1)).toMatchObject({ text: "/compact {{1}} then go on", anchors: [] });
    expect(JSON.parse(h.prompt(0, 1).split("\n\n")[1]!).handoffText).toBe("/compact {{1}} then go on");
  });
  it("queues behind a running turn, and behind one waiting for an answer, then goes alone after its done end", async () => {
    for (const waiting of [false, true]) {
      const { h, x, s } = await pair({ busy: true });
      if (waiting) h.service.receive(x, { type: "permission.request", requestId: "r", tool: "Bash", summary: "ls", options: [{ id: "y", label: "Allow", kind: "allow" }] });
      h.send(h.key(1), b.path);
      h.service.receive(s, { type: "turn.done" });
      await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(1));
      expect(h.last(s)).toMatchObject({ outcome: "sent", target: { conversationId: x, canvas: b }, queued: true });
      expect(userMessages(h, x)).toHaveLength(1);
      expect(agentRows(h, x)).toMatchObject([{ text: "Use the new price on the summary.", anchors: [], attachments: [], origin: { conversationId: s, via: "send" } }]);
      expect(h.service.list("/repo").find(row => row.conversationId === x)?.agentQueue).toEqual([{ itemId: agentRows(h, x)[0]!.itemId, provider: "codex", source: { conversationId: s, canvas: a }, line: "Use the new price on the summary.", held: false }]);
      if (waiting) h.service.receive(x, { type: "permission.resolved", requestId: "r", optionId: "y" });
      h.service.receive(x, { type: "turn.done" });
      await vi.waitFor(() => expect(userMessages(h, x)).toHaveLength(2));
      expect(userMessages(h, x)[1]).toMatchObject({ origin: { conversationId: s } });
      expect(agentRows(h, x)).toEqual([]);
    }
  });
  it("sends the person's rows and an agent's row as separate turns, in queue order", async () => {
    const { h, x, s } = await pair({ busy: true });
    h.service.queue(x, { text: "first of mine", anchors: [] });
    h.send(h.key(1), b.path);
    h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(1));
    h.service.queue(x, { text: "second of mine", anchors: [] });
    h.service.queue(x, { text: "third of mine", anchors: [] });
    h.service.receive(x, { type: "turn.done" });
    await vi.waitFor(() => expect(userMessages(h, x)).toHaveLength(2));
    expect(userMessages(h, x)[1]).toMatchObject({ text: "first of mine" });
    h.service.receive(x, { type: "turn.done" });
    await vi.waitFor(() => expect(userMessages(h, x)).toHaveLength(3));
    expect(userMessages(h, x)[2]).toMatchObject({ text: "Use the new price on the summary.", origin: { conversationId: s } });
    h.service.receive(x, { type: "turn.done" });
    await vi.waitFor(() => expect(userMessages(h, x)).toHaveLength(4));
    expect(userMessages(h, x)[3]).toMatchObject({ text: "second of mine\n\nthird of mine" });
  });
  it("keeps an agent's row queued and held through a failed or stopped turn, never as a draft, until a done turn of the person's", async () => {
    for (const end of [{ type: "turn.failed", code: "process_exited" }, { type: "interrupted", reason: "user" }] as EventPayload[]) {
      const { h, x, s } = await pair({ busy: true });
      h.service.queue(x, { text: "mine too", anchors: [] });
      h.send(h.key(1), b.path);
      h.service.receive(s, { type: "turn.done" });
      await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(1));
      h.service.receive(x, end);
      expect(h.drafts.returned(x)).toMatchObject({ text: "mine too" });
      expect(agentRows(h, x)).toHaveLength(1);
      expect(h.service.list("/repo").find(row => row.conversationId === x)?.agentQueue).toMatchObject([{ held: true }]);
      expect(userMessages(h, x)).toHaveLength(1);
      await h.service.send(x, "go on", []);
      // Still held while the person's turn runs: it goes once that turn ended done.
      expect(h.service.list("/repo").find(row => row.conversationId === x)?.agentQueue).toMatchObject([{ held: true }]);
      h.service.receive(x, { type: "turn.done" });
      await vi.waitFor(() => expect(userMessages(h, x)).toHaveLength(3));
      expect(userMessages(h, x)[2]).toMatchObject({ origin: { conversationId: s } });
    }
  });
  it("refuses Send now for an agent's row, and removes it with ×", async () => {
    const { h, x, s } = await pair({ busy: true });
    h.send(h.key(1), b.path);
    h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(1));
    const [row] = agentRows(h, x);
    await expect(h.service.sendNow(x, row!.itemId)).rejects.toThrow("bad_request");
    expect(agentRows(h, x)).toHaveLength(1);
    h.service.removeQueued(x, row!.itemId);
    expect(agentRows(h, x)).toEqual([]);
    h.service.receive(x, { type: "turn.done" });
    await h.drained(h.prepare.mock.calls.length - 1);
    expect(userMessages(h, x)).toHaveLength(1);
  });
  it("starts the first of two sends that reach one resting conversation in the same moment and queues the other", async () => {
    const h = fixture({ listed: [a, b, c] });
    const x = await h.start({ canvas: b, text: "mine" }); h.service.receive(x, { type: "turn.done" });
    const s1 = await h.start(), s2 = await h.start({ canvas: c });
    h.send(h.key(1), b.path, "from a"); h.send(h.key(2), b.path, "from c");
    h.service.receive(s1, { type: "turn.done" }); h.service.receive(s2, { type: "turn.done" });
    await vi.waitFor(() => expect([...h.resolutions(s1), ...h.resolutions(s2)]).toHaveLength(2));
    expect(h.resolutions(s1)).toMatchObject([{ outcome: "sent", target: { conversationId: x }, queued: false }]);
    expect(h.resolutions(s2)).toMatchObject([{ outcome: "sent", target: { conversationId: x }, queued: true }]);
    h.service.receive(x, { type: "turn.done" });
    await vi.waitFor(() => expect(userMessages(h, x).map(m => m.text)).toEqual(["mine", "from a", "from c"]));
  });
  it("starts a conversation on a canvas with none it can reach, a send still, and two such sends start one each", async () => {
    const h = fixture({ listed: [a, b, c] });
    const s1 = await h.start(), s2 = await h.start({ canvas: c });
    h.send(h.key(0), b.path, "from a\nsecond line"); h.send(h.key(1), b.path, "from c");
    h.service.receive(s1, { type: "turn.done" }); h.service.receive(s2, { type: "turn.done" });
    await vi.waitFor(() => expect([...h.resolutions(s1), ...h.resolutions(s2)]).toHaveLength(2));
    expect(h.all(b)).toHaveLength(2);
    const first = h.resolutions(s1)[0]!, started = first.type === "handoff.resolved" && first.outcome === "sent" ? first.target.conversationId : "";
    expect(first).toMatchObject({ via: "send", outcome: "sent", target: { canvas: b }, queued: false });
    expect(h.entry(started).title).toBe("from a");
    expect(userMessages(h, started)).toMatchObject([{ text: "from a\nsecond line", origin: { conversationId: s1, via: "send", chain: [s1] } }]);
    expect(h.store.read(started).some(e => e.type === "turn.started")).toBe(true);
  });
  it("skips a legacy external conversation, even a later one", async () => {
    const h = fixture({ listed: [a, b] });
    const x = await h.start({ canvas: b, text: "mine" }); h.service.receive(x, { type: "turn.done" });
    h.store.save([...h.store.list(), { conversationId: "legacy", root: "/repo", canvas: b, title: "t", owner: { kind: "legacy-external" }, session: { runtime: "codex", origin: "resumed", sessionId: "s-legacy", configDir: "/c", cwd: "/repo" } }]);
    h.store.append("legacy", "t", { type: "user.message", text: "later", anchors: [] });
    const s = await h.start();
    h.send(h.key(1), b.path);
    h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(1));
    expect(h.last(s)).toMatchObject({ outcome: "sent", target: { conversationId: x } });
    expect(h.store.read("legacy")).toHaveLength(1);
  });
  it("refuses a send back into the chain, and a second request of a turn a message started", async () => {
    const { h, x, s } = await pair();
    h.send(h.key(1), b.path);
    h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(1));
    expect(h.send(h.key(0), a.path, "back to you")).toBeNull();
    expect(h.send(h.key(0), c.path)).toBe("chain_one");
    expect(h.ask(h.key(0), c.path)).toBe("chain_one");
    h.service.receive(x, { type: "turn.done" });
    // The chain_one requests are written at once (recordChainRefusal); the taken one is judged at the turn's end.
    await vi.waitFor(() => expect(h.resolutions(x)).toHaveLength(2));
    expect(h.resolutions(x)).toMatchObject([{ canvas: { path: c.path }, via: "send", outcome: "refused", reason: "chain_one" }, { canvas: { path: a.path }, via: "send", outcome: "refused", reason: "chain_return" }]);
    expect(userMessages(h, s)).toHaveLength(1);
  });
  it("writes no missed line for a turn a message started, whatever new canvas it edited", async () => {
    const h = fixture({ listed: [a, b] });
    const s = await h.start(); h.send(h.key(0), b.path);
    h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(1));
    const target = h.on(b)!.conversationId;
    h.edit(target, "/repo/.doan/canvases/d.html"); h.listed.push(d);
    h.service.receive(target, { type: "turn.done" });
    h.service.refreshed("/repo");
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(h.missed(target)).toEqual([]);
    expect(h.prompt(1)).toContain(RECEIVED_GUIDANCE);
  });
  it("refuses a send whose conversation was deleted between the judgement and the delivery", async () => {
    const { h, x, s } = await pair();
    h.ask(h.key(1), c.path); h.send(h.key(1), b.path);
    let release = () => {};
    const prepared = h.prepare.getMockImplementation()!;
    h.prepare.mockImplementationOnce(async (...args) => { await new Promise<void>(resolve => { release = resolve; }); return prepared(...args); });
    h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(3));
    h.service.delete(x);
    release();
    await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(2));
    expect(h.resolutions(s)).toMatchObject([{ canvas: { path: c.path }, outcome: "started" }, { canvas: { path: b.path }, via: "send", outcome: "refused", reason: "not_found" }]);
  });
  it("drops a queued agent's row with its conversation's deletion, leaving the drafts readable", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-send-drafts-")); paths.push(dir);
    const { h, x, s } = await pair({ busy: true, draftsDir: dir });
    h.send(h.key(1), b.path);
    h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(1));
    h.service.receive(x, { type: "interrupted", reason: "user" });
    h.service.delete(x);
    expect(h.drafts.queued(x)).toEqual([]);
    expect(new DraftStore(dir).queued(x)).toEqual([]);
    expect(h.last(s)).toMatchObject({ outcome: "sent", queued: true });
  });
  it("keeps an agent's row queued and held after a restart, returns the person's rows as a draft, and sends it after the person's next done turn", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-send-drafts-")); paths.push(dir);
    const { h, x, s } = await pair({ busy: true, draftsDir: dir });
    h.service.queue(x, { text: "mine queued", anchors: [] });
    h.send(h.key(1), b.path);
    h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(1));
    await h.service.quit();
    const again = new ConversationService(h.store, h.prepare, h.open, () => {}, undefined, 10_000, () => h.listed, () => {}, { drafts: new DraftStore(dir) });
    const row = () => again.list("/repo").find(r => r.conversationId === x)!;
    expect(row()).toMatchObject({ returnedDraft: true, agentQueue: [{ source: { conversationId: s, canvas: a }, held: true }] });
    expect(again.takeDraft(x)).toMatchObject({ text: "mine queued" });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(userMessages(h, x)).toHaveLength(1);
    await again.send(x, "carry on", []);
    again.receive(x, { type: "turn.done" });
    await vi.waitFor(() => expect(userMessages(h, x).map(m => m.text)).toEqual(["mine", "carry on", "Use the new price on the summary."]));
  });
  it("leaves an agent's row with its conversation when that conversation hands off and its queue moves", async () => {
    const { h, x, s } = await pair({ busy: true });
    h.send(h.key(1), b.path);
    h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(1));
    expect(h.ask(h.key(0), c.path)).toBeNull();
    h.service.queue(x, { text: "mine for c", anchors: [] });
    h.service.receive(x, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(x)).toHaveLength(1));
    const onC = h.on(c)!.conversationId;
    expect(h.drafts.queued(onC).map(item => item.text)).toEqual(["mine for c"]);
    await vi.waitFor(() => expect(userMessages(h, x).at(-1)).toMatchObject({ origin: { conversationId: s } }));
    expect(agentRows(h, x)).toEqual([]);
  });
  it("sends from a project conversation with an origin that names no canvas", async () => {
    const h = fixture({ listed: [a, b] });
    const x = await h.start({ canvas: b, text: "mine" }); h.service.receive(x, { type: "turn.done" });
    const p = await h.start({ mode: "newDesign" }, ["canvas"]);
    expect(h.send(h.key(1), b.path)).toBeNull();
    h.service.receive(p, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(p)).toHaveLength(1));
    expect(userMessages(h, x).at(-1)).toMatchObject({ origin: { kind: "handoff", conversationId: p, via: "send", chain: [p], provider: "codex" } });
    expect(userMessages(h, x).at(-1)!.origin).not.toHaveProperty("canvas");
    expect(h.notices).toEqual([{ kind: "message", root: "/repo", source: { conversationId: p }, targets: [{ conversationId: x, canvas: b, via: "send" }] }]);
  });
  it("keeps the source's queue on the source after a send, and refuses the source's Delete while the send waits", async () => {
    const { h, x, s } = await pair({ busy: true });
    h.send(h.key(1), b.path);
    h.service.queue(s, { text: "after the send", anchors: [] });
    let release = () => {};
    const prepared = h.prepare.getMockImplementation()!;
    h.prepare.mockImplementation(async (...args) => { await new Promise<void>(resolve => { release = resolve; }); return prepared(...args); });
    h.service.receive(x, { type: "turn.done" });
    h.service.receive(s, { type: "turn.done" });
    expect(() => h.service.delete(s)).toThrow("busy");
    h.prepare.mockImplementation(prepared);
    release();
    await vi.waitFor(() => expect(userMessages(h, s).map(m => m.text)).toEqual(["Make a checkout page", "after the send"]));
    expect(h.resolutions(s)).toMatchObject([{ outcome: "sent" }]);
  });
});

// chain_one and chain_limit are refused on the socket and also written to the asking turn's history as a request and its
// refused resolution, so the source's canvas card words them as it words chain_return.
describe("a chain refusal's record", () => {
  const e = { path: ".doan/canvases/e.html", id: "e" }, f = { path: ".doan/canvases/f.html", id: "f" }, d = { path: ".doan/canvases/d.html", id: "d" };
  const handoffLines = (h: ReturnType<typeof fixture>, id: string) => h.store.read(id).filter(event => event.type === "handoff.requested" || event.type === "handoff.resolved")
    .map(({ v: _v, conversationId: _c, seq: _s, at: _a, ...rest }) => rest);
  it("writes a step-1 turn's second request as requested and refused chain_one, once per canvas, never as a taken request", async () => {
    const h = fixture({ listed: [a, b, c] });
    const s = await h.start(); h.send(h.key(0), b.path);
    h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(1));
    const x = h.on(b)!.conversationId, turnId = h.turnOf(x);
    expect(h.ask(h.key(1), c.path)).toBeNull();
    expect(h.send(h.key(1), a.path, "Back to you")).toBe("chain_one");
    expect(h.send(h.key(1), a.path, "Back to you")).toBe("chain_one");
    expect(h.send(h.key(1), d.path, "   ")).toBe("chain_one");
    expect(handoffLines(h, x)).toEqual([
      { type: "handoff.requested", canvas: { path: c.path }, text: "The person wants a checkout flow; the cart is next.", via: "handoff", turnId },
      { type: "handoff.requested", canvas: { path: a.path }, text: "Back to you", via: "send", turnId },
      { type: "handoff.resolved", canvas: { path: a.path }, via: "send", outcome: "refused", reason: "chain_one", turnId },
    ]);
    expect(foldConversation(h.store.read(x), x, false).handoffs[turnId]).toMatchObject([{ canvas: { path: c.path }, outcome: "pending" }, { canvas: { path: a.path }, via: "send", outcome: "refused", reason: "chain_one" }]);
    // Only the taken request is judged; the queue and working follow it alone.
    h.service.receive(x, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(x)).toHaveLength(2));
    expect(h.resolutions(x).at(-1)).toMatchObject({ canvas: { path: c.path }, outcome: "started" });
    expect(h.service.list("/repo").find(row => row.conversationId === x)?.working).toBe(false);
  });
  it("leaves a chain-refused request out of the judgement: nothing held for it, no missed line", async () => {
    const h = fixture({ listed: [a, b, c] });
    const s = await h.start(); h.send(h.key(0), b.path);
    h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(1));
    const x = h.on(b)!.conversationId;
    expect(h.ask(h.key(1), c.path)).toBeNull();
    expect(h.ask(h.key(1), d.path)).toBe("chain_one");
    h.edit(x, `/repo/${d.path}`); h.listed.push(d);
    h.service.queue(x, { text: "after", anchors: [] });
    h.service.receive(x, { type: "turn.done" });
    // The one taken handoff decides the queue: it follows the work, as for a turn with no other request.
    await vi.waitFor(() => expect(h.resolutions(x)).toHaveLength(2));
    expect(h.drafts.queued(h.on(c)!.conversationId).map(item => item.text)).toEqual(["after"]);
    h.service.refreshed("/repo");
    expect(h.missed(x)).toEqual([]);
    expect(h.service.list("/repo").find(row => row.conversationId === x)?.working).toBe(false);
  });
  it("writes a step-5 turn's request as requested and refused chain_limit", async () => {
    const h = fixture({ listed: [a, b, c, d, e, f] });
    let id = await h.start();
    // Each hop starts a conversation on the next canvas from the turn the previous message started.
    for (const [runner, next] of [b, c, d, e, f].entries()) {
      expect(h.send(h.key(runner), next.path, `to ${next.id}`)).toBeNull();
      h.service.receive(id, { type: "turn.done" });
      await vi.waitFor(() => expect(h.on(next)).toBeDefined());
      id = h.on(next)!.conversationId;
    }
    expect(h.store.read(id)[0]).toMatchObject({ type: "user.message", origin: { chain: expect.arrayContaining([]) } });
    const first = h.store.read(id)[0]!;
    expect(first.type === "user.message" && first.origin?.chain).toHaveLength(5);
    expect(h.prompt(5)).not.toContain(RECEIVED_GUIDANCE);
    expect(h.send(h.key(5), a.path, "Past the end")).toBe("chain_limit");
    expect(handoffLines(h, id)).toEqual([
      { type: "handoff.requested", canvas: { path: a.path }, text: "Past the end", via: "send", turnId: h.turnOf(id) },
      { type: "handoff.resolved", canvas: { path: a.path }, via: "send", outcome: "refused", reason: "chain_limit", turnId: h.turnOf(id) },
    ]);
    h.service.receive(id, { type: "turn.done" });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(h.resolutions(id)).toHaveLength(1);
  });
  it("writes nothing for the other refusals, which are the CLI's to report", async () => {
    const h = fixture({ listed: [a, b] });
    const s = await h.start();
    const before = h.store.read(s).length;
    expect(h.send(h.key(0), a.path)).toBe("same_canvas");
    expect(h.ask(h.key(0), b.path, "/other")).toBe("root_mismatch");
    expect(h.store.read(s)).toHaveLength(before);
  });
});

// Review fixes: a direct send runs as a queued row would, a wait for the previous process never strands it, and a held
// row goes only after a turn the person's message started (spec '큐에 든 에이전트 메시지').
describe("a send's delivery", () => {
  const agentRows = (h: ReturnType<typeof fixture>, id: string) => h.drafts.queued(id).filter(item => item.origin);
  const userMessages = (h: ReturnType<typeof fixture>, id: string) => h.store.read(id).flatMap(e => e.type === "user.message" ? [e] : []);
  const row = (h: ReturnType<typeof fixture>, id: string) => h.service.list("/repo").find(r => r.conversationId === id)!;
  it("runs a direct send on the receiving conversation's Fast and its model's default effort", async () => {
    const h = fixture({ listed: [a, b], fast: () => true, defaultEffort: () => "medium" });
    const x = await h.start({ canvas: b, text: "mine", fast: true }, ["effort"]);
    h.service.receive(x, { type: "turn.done" });
    const s = await h.start();
    h.send(h.key(1), b.path);
    h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toMatchObject([{ outcome: "sent", queued: false }]));
    expect(vi.mocked(h.runners[0]!.send).mock.calls[1]![3]).toMatchObject({ model: "gpt-x", effort: "medium", fast: true });
  });
  // POSTMORTEM 2026-10-28: a send issued before the previous process's exit callback.
  it("waits for the receiving conversation's previous process and starts the turn once it exits", async () => {
    const h = fixture({ provider: "claude", listed: [a, b] });
    const x = await h.start({ canvas: b, text: "mine" }); h.service.receive(x, { type: "turn.done" });
    const s = await h.start();
    h.send(h.key(1), b.path); h.service.receive(s, { type: "turn.done" });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(userMessages(h, x)).toHaveLength(1);
    h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(h.resolutions(s)).toMatchObject([{ outcome: "sent", target: { conversationId: x }, queued: false }]));
    expect(userMessages(h, x)).toHaveLength(2);
  });
  it("queues a send whose wait for the previous process timed out, and sends it once that process exits", async () => {
    const h = fixture({ provider: "claude", listed: [a, b], exitWaitMs: 20 });
    const x = await h.start({ canvas: b, text: "mine" }); h.service.receive(x, { type: "turn.done" });
    const s = await h.start();
    h.send(h.key(1), b.path); h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toMatchObject([{ outcome: "sent", target: { conversationId: x }, queued: true }]));
    expect(row(h, x).agentQueue).toMatchObject([{ held: false }]);
    expect(userMessages(h, x)).toHaveLength(1);
    h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(userMessages(h, x)).toHaveLength(2));
    expect(userMessages(h, x)[1]).toMatchObject({ origin: { conversationId: s } });
    expect(agentRows(h, x)).toEqual([]);
  });
  it("keeps a send the person's Stop refused during its wait as a held row, which the exit does not send", async () => {
    const h = fixture({ provider: "claude", listed: [a, b] });
    const x = await h.start({ canvas: b, text: "mine" }); h.service.receive(x, { type: "turn.done" });
    const s = await h.start();
    h.send(h.key(1), b.path); h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(row(h, x).working).toBe(true));
    await h.service.interrupt(x);
    await vi.waitFor(() => expect(h.resolutions(s)).toMatchObject([{ outcome: "sent", queued: true }]));
    expect(row(h, x).agentQueue).toMatchObject([{ held: true }]);
    h.open.mock.calls[0]![2]();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(userMessages(h, x)).toHaveLength(1);
  });
  it("puts a send behind the held rows of a resting conversation, and sends them only after a turn the person's message started", async () => {
    const h = fixture({ listed: [a, b, c] });
    const x = await h.start({ canvas: b, text: "mine" });
    const s1 = await h.start(), s2 = await h.start({ canvas: c });
    h.send(h.key(1), b.path, "first"); h.service.receive(s1, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s1)).toMatchObject([{ queued: true }]));
    h.service.receive(x, { type: "interrupted", reason: "user" });
    expect(row(h, x).agentQueue).toMatchObject([{ held: true }]);
    h.send(h.key(2), b.path, "second"); h.service.receive(s2, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s2)).toMatchObject([{ outcome: "sent", target: { conversationId: x }, queued: true }]));
    expect(userMessages(h, x)).toHaveLength(1);
    expect(row(h, x).agentQueue?.map(r => r.line)).toEqual(["first", "second"]);
    expect(row(h, x).agentQueue?.every(r => r.held)).toBe(true);
    await h.service.send(x, "go on", []);
    h.service.receive(x, { type: "turn.done" });
    await vi.waitFor(() => expect(userMessages(h, x)).toHaveLength(3));
    expect(userMessages(h, x)[2]).toMatchObject({ text: "first", origin: { conversationId: s1 } });
    h.service.receive(x, { type: "turn.done" });
    await vi.waitFor(() => expect(userMessages(h, x).map(m => m.text)).toEqual(["mine", "go on", "first", "second"]));
  });
  it("keeps queue order: a held row goes before a row queued behind the person's turn", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-send-drafts-")); paths.push(dir);
    const h = fixture({ listed: [a, b, c], draftsDir: dir });
    const x = await h.start({ canvas: b, text: "mine" });
    const s1 = await h.start();
    h.send(h.key(1), b.path, "held"); h.service.receive(s1, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s1)).toHaveLength(1));
    // The held row waits; a later send queues behind the person's running turn, after it.
    h.service.receive(x, { type: "turn.failed", code: "process_exited" });
    const step1 = await h.start({ canvas: c });
    h.send(h.key(2), b.path, "armed");
    await h.service.send(x, "go on", []);
    h.service.receive(step1, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(step1)).toMatchObject([{ queued: true }]));
    expect(row(h, x).agentQueue).toMatchObject([{ line: "held", held: true }, { line: "armed", held: false }]);
    h.service.receive(x, { type: "turn.done" });
    await vi.waitFor(() => expect(userMessages(h, x).map(m => m.text)).toEqual(["mine", "go on", "held"]));
    h.service.receive(x, { type: "turn.done" });
    await vi.waitFor(() => expect(userMessages(h, x).map(m => m.text)).toEqual(["mine", "go on", "held", "armed"]));
  });
  it("re-reads a person's canvas chip as it goes out after an agent's row", async () => {
    const h = fixture({ listed: [a, b, c] });
    const x = await h.start({ canvas: b, text: "mine" });
    const s = await h.start();
    h.send(h.key(1), b.path); h.service.receive(s, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s)).toHaveLength(1));
    h.service.queue(x, { text: "look at {{1}}", anchors: [{ canvas: { path: c.path, id: "c" } }] });
    h.service.receive(x, { type: "turn.done" });
    await vi.waitFor(() => expect(userMessages(h, x)).toHaveLength(2));
    h.listed.splice(h.listed.indexOf(c), 1, { path: ".doan/canvases/c-renamed.html", id: "c" });
    h.service.receive(x, { type: "turn.done" });
    await vi.waitFor(() => expect(userMessages(h, x)).toHaveLength(3));
    expect(userMessages(h, x)[2]).toMatchObject({ text: "look at {{1}}", anchors: [{ canvas: { path: ".doan/canvases/c-renamed.html", id: "c" } }] });
  });
});

// For batch C: a sent card names its conversation after that conversation is gone, and the queue interleaves agent rows
// with the person's rows in their send order.
describe("what a send leaves for the renderer", () => {
  const userMessages = (h: ReturnType<typeof fixture>, id: string) => h.store.read(id).flatMap(e => e.type === "user.message" ? [e] : []);
  it("puts the receiving conversation's title on the sent resolution, sent at once, queued or started", async () => {
    const h = fixture({ listed: [a, b, c] });
    const x = await h.start({ canvas: b, text: "Checkout flow\nmore" }); h.service.receive(x, { type: "turn.done" });
    const s1 = await h.start();
    h.send(h.key(1), b.path); h.service.receive(s1, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s1)).toHaveLength(1));
    expect(h.resolutions(s1)[0]).toMatchObject({ outcome: "sent", target: { conversationId: x, canvas: b, title: "Checkout flow" }, queued: false });
    const s2 = await h.start();
    h.send(h.key(2), b.path); h.service.receive(s2, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s2)).toHaveLength(1));
    expect(h.resolutions(s2)[0]).toMatchObject({ outcome: "sent", target: { conversationId: x, title: "Checkout flow" }, queued: true });
    const s3 = await h.start();
    h.send(h.key(3), c.path, "Summary page\nwith totals"); h.service.receive(s3, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s3)).toHaveLength(1));
    expect(h.resolutions(s3)[0]).toMatchObject({ outcome: "sent", target: { canvas: c, title: "Summary page" }, queued: false });
  });
  it("names for each agent row the person's row it follows in the queue, or none when it comes first", async () => {
    const h = fixture({ listed: [a, b, c] });
    const x = await h.start({ canvas: b, text: "mine" });
    const s1 = await h.start(), s2 = await h.start({ canvas: c });
    h.send(h.key(1), b.path, "first agent"); h.service.receive(s1, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s1)).toHaveLength(1));
    const { itemId: p1 } = h.service.queue(x, { text: "p1", anchors: [] });
    const { itemId: p2 } = h.service.queue(x, { text: "p2", anchors: [] });
    h.send(h.key(2), b.path, "second agent"); h.service.receive(s2, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s2)).toHaveLength(1));
    const s3 = await h.start();
    h.send(h.key(3), b.path, "third agent"); h.service.receive(s3, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(s3)).toHaveLength(1));
    const row = () => h.service.list("/repo").find(r => r.conversationId === x)!;
    expect(row().agentQueue?.map(r => [r.line, r.after])).toEqual([["first agent", null], ["second agent", p2], ["third agent", p2]]);
    expect(p1).not.toBe(p2);
    // The first agent row goes out alone; the rest keep their place behind p2.
    h.service.receive(x, { type: "turn.done" });
    await vi.waitFor(() => expect(userMessages(h, x)).toHaveLength(2));
    expect(row().agentQueue?.map(r => [r.line, r.after])).toEqual([["second agent", p2], ["third agent", p2]]);
  });
});
