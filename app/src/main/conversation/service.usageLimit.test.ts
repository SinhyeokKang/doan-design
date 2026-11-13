import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { ConversationService, resolveListedCanvas, type OpenRunner, type Prepare, type QueueFiles, type Runner } from "./service";
import { DraftStore } from "./drafts";
import type { Provider } from "../agentAuth/types";
import type { UsageWindow } from "../agentAuth/usageTypes";
import type { AttachmentRecord, Canvas, ConversationEvent, EventPayload } from "./types";

// A send while a Doan connection's usage limit holds, and a turn the limit stopped before the agent did anything, wait
// in main and go out a minute after the reset. Every wait runs on a fake clock: no test waits for real time.
const paths: string[] = [];
afterEach(() => { vi.restoreAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
const NOW = Date.parse("2026-11-13T07:00:00.000Z"), MIN = 60_000, HOUR = 60 * MIN;
const RESET = NOW + HOUR, LATER = NOW + 5 * HOUR;

function fakeClock() {
  let now = NOW;
  const timers = new Set<{ at: number; run: () => void }>();
  return {
    now: () => now,
    setTimer: (run: () => void, ms: number) => { const timer = { at: now + Math.max(0, ms), run }; timers.add(timer); return timer; },
    clearTimer: (timer: unknown) => { timers.delete(timer as { at: number; run: () => void }); },
    // Time passes with the app awake: due timers run in order.
    advance(ms: number) { now += ms; for (const timer of [...timers].sort((a, b) => a.at - b.at)) if (timer.at <= now && timers.has(timer)) { timers.delete(timer); timer.run(); } },
    // The Mac slept: the wall clock moved, and no timer ran.
    sleep(ms: number) { now += ms; },
    pending: () => timers.size,
  };
}
type Run = { emit: (event: EventPayload) => void; exited: () => void; runner: Runner };
function fixture(options: { provider?: Provider; files?: QueueFiles; listed?: Canvas[] } = {}) {
  const provider = options.provider ?? "codex";
  const dir = mkdtempSync(join(tmpdir(), "doan-limit-")); paths.push(dir);
  const store = new ConversationStore(dir), runs: Run[] = [];
  const open = vi.fn<OpenRunner>(async (input, emit, exited) => {
    const runner: Runner = { sessionId: input.sessionId ?? `s${runs.length + 1}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    runs.push({ emit, exited, runner }); return runner;
  });
  let connection = "c1";
  const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: provider, configDir: "/profile", cwd: "/repo", command: "/fake", env: {},
    owner: { kind: "doan" as const, provider, connectionId: connection, accountId: "acct", workspaceId: null, profile: provider }, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
  const listed: Canvas[] = [...options.listed ?? [{ path: ".doan/canvases/a.html", id: "a" }, { path: ".doan/canvases/b.html", id: "b" }]];
  const drafts = new DraftStore(join(dir, "conversations"));
  const clock = fakeClock();
  let windows: UsageWindow[] = [];
  const limitWindows = vi.fn(async () => windows);
  let resume: (() => void) | undefined;
  const published: { event: ConversationEvent; deferred: boolean }[] = [], notices: ConversationEvent[] = [];
  const admit = (_root: string, canvas?: Canvas) => canvas ? resolveListedCanvas(canvas, listed) : undefined;
  const service = new ConversationService(store, prepare, open, (event, defer) => published.push({ event, deferred: defer === true }), admit, 10_000, () => listed, () => {},
    { drafts, ...(options.files ? { files: options.files } : {}), limitWindows, clock, resumed: listener => { resume = listener; }, notice: event => notices.push(event) });
  service.connectionChanged(provider, connection);
  const summary = (id: string) => service.list("/repo").find(s => s.conversationId === id)!;
  const texts = (id: string) => store.read(id).flatMap(e => e.type === "user.message" ? [e.text] : []);
  const start = async (canvas = ".doan/canvases/a.html") => (await service.start({ root: "/repo", mode: "new", runtime: provider, canvas: { path: canvas }, text: "hello", anchors: [] })).conversationId;
  const startProject = async (text = "make a page") => (await service.start({ root: "/repo", mode: "newDesign", runtime: provider, text, anchors: [] })).conversationId;
  const limit = (resetsAt: number) => { windows = [{ id: "primary", label: "Weekly", periodMins: 10080, usedPercent: 100, resetsAt, limited: true }]; };
  const noLimit = () => { windows = []; };
  // The limit stopped the turn; the usage read after it settles on a later tick.
  const limited = async (id: string, activity = false, detail = "You've hit your usage limit.") => {
    if (activity) service.receive(id, { type: "activity", kind: "read", summary: "Reading files" });
    service.receive(id, { type: "turn.failed", code: "rate_limited", detail }); service.refreshed("/repo", []);
    await vi.waitFor(() => expect(summary(id).working).toBe(false));
  };
  return { dir, service, store, runs, open, prepare, drafts, clock, limitWindows, published, notices, summary, texts, start, startProject, limit, noLimit, limited, listed,
    resume: () => resume?.(), setConnection: (id: string) => { connection = id; } };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const iso = (at: number) => new Date(at).toISOString();
const failedNotices = (h: ReturnType<typeof fixture>) => h.notices.filter(e => e.type === "turn.failed");

describe("a send while the limit holds", () => {
  it("waits as a queued item and goes out as the person's message a minute after the reset", async () => {
    const h = fixture(); h.limit(RESET); const id = await h.start();
    await h.limited(id, true);
    expect(h.summary(id)).toMatchObject({ limitResetsAt: iso(RESET), queued: 0 });
    expect(h.service.scheduling(id)).toBe(true);
    const first = h.service.schedule(id, { text: "first", anchors: [] }), second = h.service.schedule(id, { text: "second", anchors: [] });
    expect(first).toEqual({ itemId: expect.any(String), at: iso(RESET + MIN) });
    expect(second.at).toBe(first.at);
    expect(h.summary(id)).toMatchObject({ scheduledAt: iso(RESET + MIN), queued: 2, working: false });
    expect(h.service.scheduled(id).map(item => item.text)).toEqual(["first", "second"]);
    // Nothing goes out before the time; the history keeps only the stopped turn.
    h.clock.advance(HOUR + MIN - 1); await tick();
    expect(h.texts(id)).toEqual(["hello"]);
    h.clock.advance(1); await vi.waitFor(() => expect(h.texts(id)).toEqual(["hello", "first\n\nsecond"]));
    expect(h.runs[0]!.runner.send).toHaveBeenCalledTimes(2);
    expect(h.summary(id)).not.toHaveProperty("scheduledAt");
    expect(h.summary(id)).toMatchObject({ queued: 0, working: true });
    expect(h.service.scheduled(id)).toEqual([]);
  });
  it("lets the timer go when the last item is removed, and sends nothing", async () => {
    const h = fixture(); h.limit(RESET); const id = await h.start(); await h.limited(id, true);
    // One timer drops the limit once its reset passed; the schedule adds its own.
    expect(h.clock.pending()).toBe(1);
    const { itemId } = h.service.schedule(id, { text: "never", anchors: [] });
    expect(h.clock.pending()).toBe(2);
    h.service.removeQueued(id, itemId);
    expect(h.clock.pending()).toBe(1);
    expect(h.summary(id)).not.toHaveProperty("scheduledAt");
    h.clock.advance(2 * HOUR); await tick();
    expect(h.texts(id)).toEqual(["hello"]);
    // Its reset passed, so the limit is gone too.
    expect(h.summary(id)).not.toHaveProperty("limitResetsAt");
  });
  it("is not scheduling without a limit", async () => {
    const h = fixture(); const id = await h.start(); await h.limited(id, true);
    expect(h.service.scheduling(id)).toBe(false);
    expect(h.summary(id)).not.toHaveProperty("limitResetsAt");
    expect(() => h.service.schedule(id, { text: "x", anchors: [] })).toThrow("busy");
  });
  it("sends every conversation of the connection at the same time", async () => {
    const h = fixture(); h.limit(RESET);
    const a = await h.start(".doan/canvases/a.html"), b = await h.start(".doan/canvases/b.html");
    await h.limited(a, true);
    expect(h.summary(b)).toMatchObject({ limitResetsAt: iso(RESET) });
    h.service.receive(b, { type: "turn.done" });
    h.service.schedule(a, { text: "to a", anchors: [] }); h.service.schedule(b, { text: "to b", anchors: [] });
    h.clock.advance(HOUR + MIN);
    await vi.waitFor(() => { expect(h.texts(a).at(-1)).toBe("to a"); expect(h.texts(b).at(-1)).toBe("to b"); });
  });
  // Another project conversation of the root holds it at the reset: the schedule waits and goes once the root is free.
  it("waits for the root another project conversation holds", async () => {
    const h = fixture(); h.limit(RESET);
    const first = await h.startProject("first"); await h.limited(first, true);
    h.service.schedule(first, { text: "after the reset", anchors: [] });
    h.clock.advance(HOUR);
    h.noLimit();
    const other = await h.startProject("other");
    h.clock.advance(MIN); await tick();
    expect(h.summary(first)).toMatchObject({ scheduledAt: iso(RESET + MIN), working: false });
    expect(h.texts(first)).toEqual(["first"]);
    h.service.receive(other, { type: "turn.done" }); h.service.refreshed("/repo", []);
    await vi.waitFor(() => expect(h.texts(first)).toEqual(["first", "after the reset"]));
  });
  // A turn the limit stopped is judged as any project turn; a schedule due before that judgement waits for it.
  it("waits for its own turn's judgement when it comes due before it", async () => {
    const h = fixture(); h.limit(NOW + 30_000);
    const id = await h.startProject();
    h.service.receive(id, { type: "turn.failed", code: "rate_limited", detail: "limit" });
    await vi.waitFor(() => expect(h.service.scheduled(id)).toHaveLength(1));
    // Still working while it waits for its judgement, so not shown as scheduled yet.
    expect(h.summary(id).working).toBe(true);
    expect(h.summary(id)).not.toHaveProperty("scheduledAt");
    h.clock.advance(30_000 + MIN); await tick();
    expect(h.texts(id)).toEqual(["make a page"]);
    h.service.refreshed("/repo", []);
    await vi.waitFor(() => expect(h.texts(id)).toEqual(["make a page", "make a page"]));
  });
  it("leaves a legacy external, an ACP provider's and a new conversation's send as before", async () => {
    for (const provider of ["cursor", "copilot", "antigravity"] as const) {
      const h = fixture({ provider }); h.limit(RESET); const id = await h.start(); await h.limited(id, false);
      expect(h.service.scheduling(id)).toBe(false);
      expect(h.summary(id)).not.toHaveProperty("limitResetsAt");
      expect(h.summary(id).queued).toBe(0);
      expect(h.limitWindows).not.toHaveBeenCalled();
    }
    const h = fixture(); h.limit(RESET); const id = await h.start(); await h.limited(id, true);
    h.store.save([...h.store.list(), { conversationId: "legacy", root: "/repo", canvas: { path: ".doan/canvases/b.html", id: "b" }, title: "t", state: "current", owner: { kind: "legacy-external" }, session: { runtime: "codex", origin: "resumed", sessionId: "s", configDir: "/c", cwd: "/repo" } }]);
    expect(h.service.scheduling("legacy")).toBe(false);
    expect(h.summary("legacy")).not.toHaveProperty("limitResetsAt");
    await expect(h.service.start({ root: "/repo", mode: "newDesign", runtime: "codex", text: "x", anchors: [] })).rejects.toMatchObject({ message: "rate_limited", resetsAt: iso(RESET) });
  });
});

describe("a turn the limit stopped before the agent did anything", () => {
  it("schedules its own message again, keeps the failed turn and sends no failure notice", async () => {
    const h = fixture(); h.limit(RESET); const id = await h.start();
    const queued = h.service.queue(id, { text: "queued behind it", anchors: [] });
    await h.limited(id);
    const items = h.service.scheduled(id);
    expect(items.map(item => item.text)).toEqual(["hello", "queued behind it"]);
    expect(items[1]!.itemId).toBe(queued.itemId);
    expect(h.summary(id)).toMatchObject({ scheduledAt: iso(RESET + MIN), queued: 2, working: false });
    expect(h.store.read(id).map(e => e.type)).toEqual(["user.message", "turn.started", "turn.failed"]);
    expect(h.drafts.returned(id)).toBeUndefined();
    expect(h.published.find(p => p.event.type === "turn.failed")?.deferred).toBe(true);
    expect(failedNotices(h)).toEqual([]);
    h.clock.advance(HOUR + MIN);
    await vi.waitFor(() => expect(h.texts(id)).toEqual(["hello", "hello\n\nqueued behind it"]));
  });
  it("fails as before when the agent did something, and the failure notice goes out then, its queue still waiting", async () => {
    const h = fixture(); h.limit(RESET); const id = await h.start();
    h.service.queue(id, { text: "queued", anchors: [] });
    await h.limited(id, true);
    // The message queued behind the turn still waits for the reset; the turn's own does not go again.
    expect(h.service.scheduled(id).map(item => item.text)).toEqual(["queued"]);
    expect(h.summary(id)).toMatchObject({ limitResetsAt: iso(RESET), scheduledAt: iso(RESET + MIN), queued: 1 });
    expect(h.drafts.returned(id)).toBeUndefined();
    expect(failedNotices(h)).toHaveLength(1);
  });
  it("fails as before when the reset is unknown", async () => {
    const h = fixture(); const id = await h.start();
    await h.limited(id);
    expect(h.service.scheduled(id)).toEqual([]);
    expect(h.summary(id)).not.toHaveProperty("limitResetsAt");
    expect(failedNotices(h)).toHaveLength(1);
  });
  it("reads Claude Code's own message when the usage read names no reset", async () => {
    const h = fixture({ provider: "claude" }); const id = await h.start();
    await h.limited(id, false, "You've hit your 5-hour limit · resets 6:10pm (Asia/Seoul)");
    expect(h.summary(id)).toMatchObject({ limitResetsAt: iso(Date.parse("2026-11-13T09:10:00Z")), scheduledAt: iso(Date.parse("2026-11-13T09:11:00Z")) });
  });
  it("issues the stopped message's attachments again by path, and fails as before when one cannot be", async () => {
    const record: AttachmentRecord = { name: "a.png", size: 3, kind: "image", path: "/Users/me/a.png" };
    let gone = false;
    const files: QueueFiles = { reclaim: vi.fn(() => ({ recheck: () => [record], sent: () => {} })), consume: vi.fn(), reissue: vi.fn(() => gone ? null : ["again"]), release: vi.fn(), discard: vi.fn() };
    const h = fixture({ files }); h.limit(RESET);
    const id = (await h.service.start({ root: "/repo", mode: "new", runtime: "codex", canvas: { path: ".doan/canvases/a.html" }, text: "with a file", anchors: [], attachments: [record] })).conversationId;
    await h.limited(id);
    expect(files.reissue).toHaveBeenLastCalledWith([record]);
    expect(h.service.scheduled(id)).toEqual([{ itemId: expect.any(String), text: "with a file", anchors: [], attachments: [record] }]);
    h.clock.advance(HOUR + MIN);
    await vi.waitFor(() => expect(h.texts(id)).toHaveLength(2));
    expect(files.reclaim).toHaveBeenLastCalledWith(["again"]);
    const other = (await h.service.start({ root: "/repo", mode: "new", runtime: "codex", canvas: { path: ".doan/canvases/b.html" }, text: "file gone", anchors: [], attachments: [record] })).conversationId;
    gone = true; h.limit(LATER);
    await h.limited(other);
    expect(h.service.scheduled(other)).toEqual([]);
    expect(failedNotices(h).at(-1)?.conversationId).toBe(other);
  });
});

describe("a scheduled send the limit stops again", () => {
  async function sentOnce(h: ReturnType<typeof fixture>) {
    const id = await h.start(); await h.limited(id);
    h.clock.advance(HOUR + MIN);
    await vi.waitFor(() => expect(h.texts(id)).toEqual(["hello", "hello"]));
    return id;
  }
  it("waits again for a later reset, with no failure notice", async () => {
    const h = fixture(); h.limit(RESET); const id = await sentOnce(h);
    h.limit(LATER);
    await h.limited(id);
    expect(h.summary(id)).toMatchObject({ scheduledAt: iso(LATER + MIN), limitResetsAt: iso(LATER) });
    expect(failedNotices(h)).toEqual([]);
  });
  it("sends once more a minute later when the same reset stopped it, then fails", async () => {
    const h = fixture(); h.limit(RESET); const id = await sentOnce(h);
    await h.limited(id);
    expect(h.summary(id)).toMatchObject({ scheduledAt: iso(h.clock.now() + MIN) });
    h.clock.advance(MIN);
    await vi.waitFor(() => expect(h.texts(id)).toEqual(["hello", "hello", "hello"]));
    await h.limited(id);
    expect(h.service.scheduled(id)).toEqual([]);
    expect(h.summary(id).queued).toBe(0);
    expect(failedNotices(h)).toHaveLength(1);
  });
  it("fails as before for an earlier or unknown reset, or once the agent worked", async () => {
    const cases = [{ activity: true, next: () => {} }, { activity: false, next: (h: ReturnType<typeof fixture>) => h.noLimit() }, { activity: false, next: (h: ReturnType<typeof fixture>) => h.limit(RESET - MIN) }];
    for (const { activity, next } of cases) {
      const h = fixture(); h.limit(RESET); const id = await sentOnce(h);
      next(h); await h.limited(id, activity);
      expect(h.service.scheduled(id)).toEqual([]);
      expect(failedNotices(h)).toHaveLength(1);
    }
  });
});

describe("clearing a schedule", () => {
  async function scheduled(h: ReturnType<typeof fixture>) {
    const id = await h.start(); await h.limited(id, true);
    h.service.schedule(id, { text: "waiting", anchors: [] });
    return id;
  }
  it("hands it back as a draft at once when the conversation is archived", async () => {
    const h = fixture(); h.limit(RESET); const id = await scheduled(h);
    // Another provider's connection holds no limit, so its start goes on and archives this one.
    await h.service.start({ root: "/repo", mode: "new", runtime: "claude", canvas: { path: ".doan/canvases/a.html" }, text: "replacing", anchors: [] });
    expect(h.store.list().find(m => m.conversationId === id)?.state).toBe("archived");
    expect(h.drafts.returned(id)).toMatchObject({ text: "waiting" });
    // Only the limit's own timer is left.
    expect(h.clock.pending()).toBe(1);
  });
  it("hands it back as a draft at once on a sign-out or an account replacement, and forgets the limit", async () => {
    for (const next of [undefined, "c2"]) {
      const h = fixture(); h.limit(RESET); const id = await scheduled(h);
      h.service.connectionChanged("codex", next);
      expect(h.drafts.returned(id)).toMatchObject({ text: "waiting", reason: "interrupted" });
      expect(h.summary(id)).not.toHaveProperty("scheduledAt");
      expect(h.summary(id)).not.toHaveProperty("limitResetsAt");
      expect(h.clock.pending()).toBe(0);
    }
  });
  it("discards it with the conversation", async () => {
    const h = fixture(); h.limit(RESET); const id = await scheduled(h);
    h.service.delete(id);
    expect(h.drafts.queued(id)).toEqual([]);
    expect(h.drafts.returned(id)).toBeUndefined();
    expect(h.clock.pending()).toBe(1);
  });
  it("comes back as a draft after a restart and never goes out by itself", async () => {
    const h = fixture(); h.limit(RESET); const id = await scheduled(h);
    await h.service.quit();
    const drafts = new DraftStore(join(h.dir, "conversations"));
    expect(drafts.returned(id)).toMatchObject({ text: "waiting", reason: "restarted" });
    const restarted = new ConversationService(h.store, h.prepare, h.open, () => {}, () => {}, 10_000, () => [], () => {}, { drafts, clock: h.clock });
    expect(restarted.list("/repo").find(s => s.conversationId === id)).not.toHaveProperty("scheduledAt");
    h.clock.advance(2 * HOUR); await tick();
    expect(h.texts(id)).toEqual(["hello"]);
  });
});

describe("waking from sleep", () => {
  it("sends a schedule that came due while asleep at once, and keeps the others", async () => {
    const h = fixture();
    const a = await h.start(".doan/canvases/a.html"), b = await h.start(".doan/canvases/b.html");
    h.limit(RESET); await h.limited(a, true);
    h.service.schedule(a, { text: "due", anchors: [] });
    h.limit(LATER); await h.limited(b, true);
    h.service.schedule(b, { text: "later", anchors: [] });
    expect(h.summary(a)).toMatchObject({ scheduledAt: iso(RESET + MIN) });
    h.clock.sleep(2 * HOUR); h.resume();
    await vi.waitFor(() => expect(h.texts(a).at(-1)).toBe("due"));
    expect(h.texts(b).at(-1)).toBe("hello");
    expect(h.summary(b)).toMatchObject({ scheduledAt: iso(LATER + MIN) });
    h.clock.advance(3 * HOUR + MIN);
    await vi.waitFor(() => expect(h.texts(b).at(-1)).toBe("later"));
  });
});

describe("a scheduled send that cannot go out", () => {
  it("hands the messages back as a draft when an attachment went away", async () => {
    const files: QueueFiles = { reclaim: vi.fn(() => { throw Object.assign(new Error("attachment_missing"), { missing: ["f1"] }); }), consume: vi.fn(), release: vi.fn(), discard: vi.fn() };
    const h = fixture({ files }); h.limit(RESET); const id = await h.start(); await h.limited(id, true);
    h.service.schedule(id, { text: "with a file", anchors: [], attachments: [{ name: "a.png", size: 3, kind: "image", path: "/Users/me/a.png" }], ids: ["f1"] });
    h.clock.advance(HOUR + MIN);
    await vi.waitFor(() => expect(h.drafts.returned(id)).toMatchObject({ text: "with a file", reason: "attachment_missing" }));
    expect(h.texts(id)).toEqual(["hello"]);
  });
  it("hands the messages back as a draft when the history takes no more", async () => {
    const h = fixture(); h.limit(RESET); const id = await h.start(); await h.limited(id, true);
    h.service.schedule(id, { text: "too much", anchors: [] });
    vi.spyOn(h.store, "appendAll").mockImplementation(() => { throw new Error("File exceeds limit"); });
    h.clock.advance(HOUR + MIN);
    await vi.waitFor(() => expect(h.drafts.returned(id)).toMatchObject({ text: "too much" }));
    expect(h.summary(id)).toMatchObject({ working: false, queued: 0 });
  });
});
