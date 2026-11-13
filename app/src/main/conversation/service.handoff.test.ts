import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { HANDOFF_GUIDANCE } from "./prompt";
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
function fixture(options: { provider?: "claude" | "codex"; listed?: Canvas[]; legacy?: boolean; files?: QueueFiles; fast?: QueueOptions["fast"]; defaultEffort?: QueueOptions["defaultEffort"]; draftsDir?: string; limitWindows?: QueueOptions["limitWindows"] } = {}) {
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
  const service = new ConversationService(store, prepare, open, e => published.push(e), admit, 10_000, () => listed, () => {}, { drafts, ...(options.files ? { files: options.files } : {}), ...(options.fast ? { fast: options.fast } : {}), ...(options.defaultEffort ? { defaultEffort: options.defaultEffort } : {}), ...(options.limitWindows ? { limitWindows: options.limitWindows } : {}) }, undefined, undefined, notice => notices.push(notice));
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
  const resolutions = (id: string) => store.read(id).filter(e => e.type === "handoff.resolved");
  const missed = (id: string) => store.read(id).filter(e => e.type === "handoff.missed");
  const texts = (id: string) => store.read(id).flatMap(e => e.type === "user.message" ? [e.text] : []);
  const edit = (id: string, path: string) => service.receive(id, { type: "activity", kind: "edit", path, summary: "Edit" });
  // Lets a released start run to its end: its prepare, then the checks and the refusal after it.
  const drained = async (call: number) => { await prepare.mock.results[call]!.value; for (let i = 0; i < 5; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
  return { dir, drained, service, store, runners, open, prepare, listed, drafts, notices, published, key, ask, prompt, entry, on, last, turnOf, start, settled, resolutions, missed, texts, edit };
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
  it("returns a moved queue as the draft of a next conversation archived before the queue reached it, and restores nothing", async () => {
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
    await vi.waitFor(() => expect(h.drafts.returned(target)).toMatchObject({ text: "and the cart" }));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(h.entry(target).state).toBe("archived");
    expect(h.entry(replacement).state).toBe("current");
    expect(h.texts(target)).toHaveLength(1);
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
  it("returns a moved queue as the draft of a next conversation archived while the queue waits for its first runner to end", async () => {
    const { h, id, target } = await endedEarly({ type: "turn.done" }, { provider: "claude" });
    // The queue went out and its send waits for the first runner's process, which never ends here.
    await vi.waitFor(() => expect(h.service.list("/repo").find(s => s.conversationId === target)?.working).toBe(true));
    expect(h.texts(target)).toHaveLength(1); expect(h.drafts.returned(target)).toBeUndefined();
    const mine = await h.start({ canvas: b, text: "mine" });
    await vi.waitFor(() => expect(h.drafts.returned(target)).toMatchObject({ text: "and the cart" }));
    expect(h.entry(target).state).toBe("archived");
    expect(h.entry(mine).state).toBe("current");
    expect(h.texts(target)).toHaveLength(1);
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
    await h.drained(1);
    expect(h.open).toHaveBeenCalledTimes(2);
    expect(h.on(b)).toBeUndefined();
    expect(resolutions(h, id)).toHaveLength(1);
    expect(h.notices).toEqual([]);
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
    // The source is replaced (its handoff cancelled), then restored by a send whose turn starts without b listed.
    const replacement = await h.start({ text: "replace a's conversation" });
    expect(resolutions(h, id)).toMatchObject([{ outcome: "cancelled" }]);
    h.service.receive(replacement, { type: "turn.done" });
    h.open.mock.calls[0]![2]();
    h.listed.splice(h.listed.indexOf(b), 1);
    await h.service.send(id, "again", []);
    expect(h.entry(id).state).toBe("current");
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

// A queue's send goes out a tick after its flush; whatever took the queue back meanwhile (an archive, a stop) wins, and
// the copy the flush captured is not sent.
describe("a queue taken back before its flush sends", () => {
  it.each([
    // An archive by another start's acceptance; the runner it closes is gone at once here.
    ["an archive", (h: ReturnType<typeof fixture>, id: string) => { (h.service as unknown as { archive(id: string): void }).archive(id); h.open.mock.calls[0]![2](); }],
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
  it("refuses one whose canvas has a current conversation and starts the other, with the single notice", async () => {
    const h = fixture(); const id = await h.start();
    asks(h, b.path, c.path); h.listed.push(b, c);
    const mine = await h.start({ canvas: b, text: "mine" });
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(id)).toHaveLength(2));
    expect(outcomes(h, id)).toEqual([[b.path, "refused", "has_conversation"], [c.path, "started", undefined]]);
    expect(h.on(b)?.conversationId).toBe(mine);
    expect(h.notices).toEqual([{ root: "/repo", source: { conversationId: id, canvas: a }, target: { conversationId: h.on(c)!.conversationId, canvas: c } }]);
  });
  it("starts none until every request is decided: a canvas gone before the judgement waits for the refresh, then is refused", async () => {
    const h = fixture(); const id = await h.start();
    h.listed.push(b, c); asks(h, b.path, c.path);
    h.listed.splice(h.listed.indexOf(b), 1);
    h.service.receive(id, { type: "turn.done" });
    await Promise.resolve(); await Promise.resolve();
    expect(h.prepare).toHaveBeenCalledOnce();
    h.service.refreshed("/repo", []);
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
    h.listed.push(c); h.service.refreshed("/repo", [c.path]);
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(2));
    h.service.refreshed("/repo", []);
    release();
    await vi.waitFor(() => expect(h.resolutions(id)).toHaveLength(2));
    h.service.refreshed("/repo", []);
    await Promise.resolve(); await Promise.resolve();
    expect(h.prepare).toHaveBeenCalledTimes(3);
    expect(outcomes(h, id)).toEqual([[b.path, "started", undefined], [c.path, "started", undefined]]);
    expect(h.store.list().filter(m => m.state === "current")).toHaveLength(3);
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
  it("cancels the rest when the source is archived between two starts, returns the queue as a draft, and keeps the started one", async () => {
    const h = fixture(); const id = await h.start();
    asks(h, b.path, c.path); h.listed.push(b, c);
    h.service.queue(id, { text: "and the cart", anchors: [] });
    const release = hold(h, 2);
    h.service.receive(id, { type: "turn.done" });
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledTimes(3));
    const onB = h.on(b)!.conversationId;
    await h.start({ text: "replace a's conversation" });
    expect(h.entry(id).state).toBe("archived");
    expect(outcomes(h, id)).toEqual([[b.path, "started", undefined], [c.path, "cancelled", undefined]]);
    expect(h.drafts.returned(id)).toMatchObject({ text: "and the cart" });
    release();
    await h.drained(2);
    // No runner and no lease for the cancelled request: source, b and the replacement only.
    expect(h.open).toHaveBeenCalledTimes(3);
    expect(h.on(c)).toBeUndefined();
    expect(h.resolutions(id)).toHaveLength(2);
    expect(h.entry(onB).state).toBe("current");
    expect(h.notices).toEqual([{ root: "/repo", source: { conversationId: id, canvas: a }, target: { conversationId: onB, canvas: b } }]);
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
  it("keeps a project turn judged meanwhile from taking any requested canvas, the second one included", async () => {
    const h = fixture();
    const project = await h.start({ mode: "newDesign", text: "Draw something" }, ["canvas"]);
    const source = await h.start();
    expect(h.ask(h.key(1), b.path)).toBeNull();
    expect(h.ask(h.key(1), c.path)).toBeNull();
    h.listed.push(c);
    h.service.receive(project, { type: "turn.done" });
    h.service.refreshed("/repo", [c.path]);
    expect(h.entry(project).canvas).toBeUndefined();
    h.listed.push(b);
    h.service.receive(source, { type: "turn.done" });
    await vi.waitFor(() => expect(h.resolutions(source)).toHaveLength(2));
    expect(h.on(c)?.conversationId).not.toBe(project);
    expect(h.on(c)).toBeDefined();
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
    h.service.refreshed("/repo", []);
    vi.advanceTimersByTime(4_000);
    h.listed.push(c); h.service.refreshed("/repo", [c.path]);
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
  it("writes none for a project turn, also one promoted to the canvas it edited", async () => {
    const { h, id } = await none(async h => {
      const id = await h.start({ mode: "newDesign", text: "Draw c" }, ["canvas"]);
      h.listed.push(c); h.edit(id, at(c)); h.service.receive(id, { type: "turn.done" }); h.service.refreshed("/repo", [c.path]);
      return id;
    });
    expect(h.entry(id).canvas).toEqual(c);
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
  it("writes none for a canvas another conversation is current on by the deadline", async () => {
    await none(async h => {
      const id = await h.start(); h.listed.push(c); h.edit(id, at(c)); h.service.receive(id, { type: "turn.done" });
      await h.start({ canvas: c, text: "mine" });
      return id;
    });
  });
  it("writes none once the conversation was archived, and never recreates a deleted history", async () => {
    await none(async h => {
      const id = await h.start(); h.listed.push(c); h.edit(id, at(c)); h.service.receive(id, { type: "turn.done" });
      await h.start({ text: "replace a's conversation" });
      return id;
    });
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
