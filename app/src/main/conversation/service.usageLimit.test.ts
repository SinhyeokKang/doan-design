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
    // The callbacks armed now, to run one by hand after it was cancelled.
    armed: () => [...timers].map(timer => timer.run),
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
  // held: the next post-limit usage read stays open until the test answers it.
  let held: ReturnType<typeof deferred<readonly UsageWindow[]>> | undefined;
  const limitWindows = vi.fn((): Promise<readonly UsageWindow[]> => { const read = held; held = undefined; return read ? read.promise : Promise.resolve(windows); });
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
    service.receive(id, { type: "turn.failed", code: "rate_limited", detail }); service.refreshed("/repo");
    await drain(); expect(summary(id).working).toBe(false);
  };
  return { dir, service, store, runs, open, prepare, drafts, clock, limitWindows, published, notices, summary, texts, start, startProject, limit, noLimit, limited, listed,
    resume: () => resume?.(), setConnection: (id: string) => { connection = id; },
    holdRead: () => { const read = deferred<readonly UsageWindow[]>(); held = read; return { answer: () => read.resolve(windows) }; } };
}
// Every step of a send here is a promise (mocked prepare and runner, synchronous store), so running the microtask queue
// out settles it: no test waits for a timer or a poll.
async function drain(): Promise<void> { for (let i = 0; i < 200; i++) await Promise.resolve(); }
// A promise the test settles itself, for a usage read still running while something else happens.
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const iso = (at: number) => new Date(at).toISOString();
const failedNotices = (h: ReturnType<typeof fixture>) => h.notices.filter(e => e.type === "turn.failed");

describe("a send while the limit holds", () => {
  it("waits as a queued item and goes out as the person's message a minute after the reset", async () => {
    const h = fixture(); h.limit(RESET); const id = await h.start();
    await h.limited(id, true);
    expect(h.summary(id)).toMatchObject({ limitResetsAt: iso(RESET), queued: 0 });
    expect(h.service.scheduling(id)).toBe(true);
    const first = h.service.schedule(id, { text: "first", anchors: [] }), second = h.service.schedule(id, { text: "second", anchors: [] });
    // The renderer shows the reset; the message goes a minute after it.
    expect(first).toEqual({ itemId: expect.any(String), at: iso(RESET) });
    expect(second.at).toBe(first.at);
    expect(h.summary(id)).toMatchObject({ scheduledAt: iso(RESET), queued: 2, working: false });
    expect(h.service.scheduled(id).map(item => item.text)).toEqual(["first", "second"]);
    expect(h.service.scheduled(id).some(item => "turnId" in item)).toBe(false);
    // Nothing goes out before the time; the history keeps only the stopped turn.
    h.clock.advance(HOUR + MIN - 1); await drain();
    expect(h.texts(id)).toEqual(["hello"]);
    h.clock.advance(1); await drain(); expect(h.texts(id)).toEqual(["hello", "first\n\nsecond"]);
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
    h.clock.advance(2 * HOUR); await drain();
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
    await drain(); expect(h.texts(a).at(-1)).toBe("to a"); expect(h.texts(b).at(-1)).toBe("to b");
  });
  // Project conversations of a root run side by side, so another one running never holds a schedule back.
  it("goes out at the reset while another project conversation of the root runs", async () => {
    const h = fixture(); h.limit(RESET);
    const first = await h.startProject("first"); await h.limited(first, true);
    h.service.schedule(first, { text: "after the reset", anchors: [] });
    h.clock.advance(HOUR);
    h.noLimit();
    const other = await h.startProject("other");
    h.clock.advance(MIN); await drain();
    expect(h.texts(first)).toEqual(["first", "after the reset"]);
    expect(h.summary(other).working).toBe(true);
  });
  // A project turn the limit stopped is not judged: its schedule shows and goes out at the reset as a canvas one's.
  it("shows a project turn's schedule once the usage read is over and sends it at the reset without a refresh", async () => {
    const h = fixture(); h.limit(NOW + 30_000);
    const id = await h.startProject();
    h.service.receive(id, { type: "turn.failed", code: "rate_limited", detail: "limit" });
    await drain(); expect(h.service.scheduled(id)).toHaveLength(1);
    expect(h.summary(id)).toMatchObject({ scheduledAt: iso(NOW + 30_000), working: false });
    h.clock.advance(30_000 + MIN); await drain();
    expect(h.texts(id)).toEqual(["make a page", "make a page"]);
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
    h.store.save([...h.store.list(), { conversationId: "legacy", root: "/repo", canvas: { path: ".doan/canvases/b.html", id: "b" }, title: "t", owner: { kind: "legacy-external" }, session: { runtime: "codex", origin: "resumed", sessionId: "s", configDir: "/c", cwd: "/repo" } }]);
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
    // Only the stopped turn's own message names that turn.
    const failedTurn = h.store.read(id).find(e => e.type === "turn.failed")!.turnId;
    expect(items.map(item => item.turnId)).toEqual([failedTurn, undefined]);
    expect(h.summary(id)).toMatchObject({ scheduledAt: iso(RESET), queued: 2, working: false });
    expect(h.store.read(id).map(e => e.type)).toEqual(["user.message", "turn.started", "turn.failed"]);
    expect(h.drafts.returned(id)).toBeUndefined();
    expect(h.published.find(p => p.event.type === "turn.failed")?.deferred).toBe(true);
    expect(failedNotices(h)).toEqual([]);
    h.clock.advance(HOUR + MIN);
    await drain(); expect(h.texts(id)).toEqual(["hello", "hello\n\nqueued behind it"]);
  });
  it("fails as before when the agent did something, and the failure notice goes out then, its queue still waiting", async () => {
    const h = fixture(); h.limit(RESET); const id = await h.start();
    h.service.queue(id, { text: "queued", anchors: [] });
    await h.limited(id, true);
    // The message queued behind the turn still waits for the reset; the turn's own does not go again.
    expect(h.service.scheduled(id).map(item => item.text)).toEqual(["queued"]);
    expect(h.summary(id)).toMatchObject({ limitResetsAt: iso(RESET), scheduledAt: iso(RESET), queued: 1 });
    expect(h.service.scheduled(id)[0]).not.toHaveProperty("turnId");
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
    expect(h.summary(id)).toMatchObject({ limitResetsAt: iso(Date.parse("2026-11-13T09:10:00Z")), scheduledAt: iso(Date.parse("2026-11-13T09:10:00Z")) });
  });
  it("issues the stopped message's attachments again by path, and fails as before when one cannot be", async () => {
    const record: AttachmentRecord = { name: "a.png", size: 3, kind: "image", path: "/Users/me/a.png" };
    let gone = false;
    const files: QueueFiles = { reclaim: vi.fn(() => ({ recheck: () => [record], sent: () => {} })), consume: vi.fn(), reissue: vi.fn(() => gone ? null : ["again"]), release: vi.fn(), discard: vi.fn() };
    const h = fixture({ files }); h.limit(RESET);
    const id = (await h.service.start({ root: "/repo", mode: "new", runtime: "codex", canvas: { path: ".doan/canvases/a.html" }, text: "with a file", anchors: [], attachments: [record] })).conversationId;
    await h.limited(id);
    expect(files.reissue).toHaveBeenLastCalledWith([record]);
    expect(h.service.scheduled(id)).toEqual([{ itemId: expect.any(String), text: "with a file", anchors: [], attachments: [record], turnId: expect.any(String) }]);
    h.clock.advance(HOUR + MIN);
    await drain(); expect(h.texts(id)).toHaveLength(2);
    expect(files.reclaim).toHaveBeenLastCalledWith(["again"]);
    const other = (await h.service.start({ root: "/repo", mode: "new", runtime: "codex", canvas: { path: ".doan/canvases/b.html" }, text: "file gone", anchors: [], attachments: [record] })).conversationId;
    gone = true; h.limit(LATER);
    await h.limited(other);
    expect(h.service.scheduled(other)).toEqual([]);
    expect(failedNotices(h).at(-1)?.conversationId).toBe(other);
  });
});

// A limited project turn stays working while its usage read runs, so the composer queues; that queue waits for the same
// reset, and a folder refresh never sends it early (ARCHITECTURE §7 'Usage-limit schedule').
describe("a project conversation's queue made while its limited turn's usage read runs", () => {
  it("waits for the reset once the reset is known, whatever folder refresh comes", async () => {
    const h = fixture(); h.limit(RESET);
    const id = await h.startProject();
    h.service.receive(id, { type: "turn.failed", code: "rate_limited", detail: "limit" });
    expect(h.summary(id).working).toBe(true);
    h.service.queue(id, { text: "next", anchors: [] });
    await drain();
    h.service.refreshed("/repo"); await drain();
    expect(h.texts(id)).toEqual(["make a page"]);
    expect(h.service.scheduled(id).map(item => item.text)).toEqual(["make a page", "next"]);
    expect(h.summary(id)).toMatchObject({ scheduledAt: iso(RESET), working: false });
    h.clock.advance(HOUR + MIN); await drain();
    expect(h.texts(id)).toEqual(["make a page", "make a page\n\nnext"]);
  });
  it("waits for the usage read when a folder refresh comes first", async () => {
    const h = fixture(); h.limit(RESET);
    const id = await h.startProject();
    const read = h.holdRead();
    h.service.receive(id, { type: "turn.failed", code: "rate_limited", detail: "limit" });
    h.service.queue(id, { text: "next", anchors: [] });
    h.service.refreshed("/repo"); await drain();
    expect(h.texts(id)).toEqual(["make a page"]);
    read.answer(); await drain();
    expect(h.texts(id)).toEqual(["make a page"]);
    expect(h.summary(id)).toMatchObject({ scheduledAt: iso(RESET), working: false });
  });
  it("comes back as a draft when the usage read tells no reset", async () => {
    const h = fixture();
    const id = await h.startProject();
    const read = h.holdRead();
    h.service.receive(id, { type: "activity", kind: "read", summary: "Reading files" });
    h.service.receive(id, { type: "turn.failed", code: "rate_limited", detail: "limit" });
    h.service.queue(id, { text: "next", anchors: [] });
    h.service.refreshed("/repo"); await drain();
    read.answer(); await drain();
    expect(h.texts(id)).toEqual(["make a page"]);
    expect(h.drafts.returned(id)).toMatchObject({ text: "next", reason: "turn_failed" });
  });
});

describe("a scheduled send the limit stops again", () => {
  async function sentOnce(h: ReturnType<typeof fixture>) {
    const id = await h.start(); await h.limited(id);
    h.clock.advance(HOUR + MIN);
    await drain(); expect(h.texts(id)).toEqual(["hello", "hello"]);
    return id;
  }
  it("waits again for a later reset, with no failure notice", async () => {
    const h = fixture(); h.limit(RESET); const id = await sentOnce(h);
    h.limit(LATER);
    await h.limited(id);
    expect(h.summary(id)).toMatchObject({ scheduledAt: iso(LATER), limitResetsAt: iso(LATER) });
    // The repeated message names the turn the limit stopped this time.
    const turns = h.store.read(id).filter(e => e.type === "turn.failed").map(e => e.turnId);
    expect(h.service.scheduled(id).map(item => item.turnId)).toEqual([turns.at(-1)]);
    expect(failedNotices(h)).toEqual([]);
  });
  it("sends once more a minute later when the same reset stopped it, then fails", async () => {
    const h = fixture(); h.limit(RESET); const id = await sentOnce(h);
    await h.limited(id);
    // Sent once more a minute later, still showing the same reset.
    expect(h.summary(id)).toMatchObject({ scheduledAt: iso(RESET) });
    h.clock.advance(MIN - 1); await drain();
    expect(h.texts(id)).toHaveLength(2);
    h.clock.advance(1);
    await drain(); expect(h.texts(id)).toEqual(["hello", "hello", "hello"]);
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
  it("keeps it when another conversation starts on the same canvas", async () => {
    const h = fixture(); h.limit(RESET); const id = await scheduled(h);
    // Another provider's connection holds no limit, so its start goes on beside this one.
    await h.service.start({ root: "/repo", mode: "new", runtime: "claude", canvas: { path: ".doan/canvases/a.html" }, text: "another", anchors: [] });
    expect(h.drafts.returned(id)).toBeUndefined();
    expect(h.service.scheduled(id).map(item => item.text)).toEqual(["waiting"]);
    expect(h.summary(id).scheduledAt).toBeDefined();
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
    h.clock.advance(2 * HOUR); await drain();
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
    expect(h.summary(a)).toMatchObject({ scheduledAt: iso(RESET) });
    h.clock.sleep(2 * HOUR); h.resume();
    await drain(); expect(h.texts(a).at(-1)).toBe("due");
    expect(h.texts(b).at(-1)).toBe("hello");
    expect(h.summary(b)).toMatchObject({ scheduledAt: iso(LATER) });
    h.clock.advance(3 * HOUR + MIN);
    await drain(); expect(h.texts(b).at(-1)).toBe("later");
  });
});

describe("a scheduled send that cannot go out", () => {
  it("hands the messages back as a draft when an attachment went away", async () => {
    const files: QueueFiles = { reclaim: vi.fn(() => { throw Object.assign(new Error("attachment_missing"), { missing: ["f1"] }); }), consume: vi.fn(), release: vi.fn(), discard: vi.fn() };
    const h = fixture({ files }); h.limit(RESET); const id = await h.start(); await h.limited(id, true);
    h.service.schedule(id, { text: "with a file", anchors: [], attachments: [{ name: "a.png", size: 3, kind: "image", path: "/Users/me/a.png" }], ids: ["f1"] });
    h.clock.advance(HOUR + MIN);
    await drain(); expect(h.drafts.returned(id)).toMatchObject({ text: "with a file", reason: "attachment_missing" });
    expect(h.texts(id)).toEqual(["hello"]);
  });
  it("hands the messages back as a draft when the history takes no more", async () => {
    const h = fixture(); h.limit(RESET); const id = await h.start(); await h.limited(id, true);
    h.service.schedule(id, { text: "too much", anchors: [] });
    vi.spyOn(h.store, "appendAll").mockImplementation(() => { throw new Error("File exceeds limit"); });
    h.clock.advance(HOUR + MIN);
    await drain(); expect(h.drafts.returned(id)).toMatchObject({ text: "too much" });
    expect(h.summary(id)).toMatchObject({ working: false, queued: 0 });
  });
});

// A Stop, a sign-out or a stop of the provider's runs while the usage read after a limited turn still runs
// ends that lookup: the stopped turn never goes out again, and its failure notice is told exactly once.
describe("a usage read still running after a limited turn", () => {
  async function stoppedWhileReading(h: ReturnType<typeof fixture>) {
    h.limit(RESET); const id = await h.start();
    h.service.queue(id, { text: "behind", anchors: [] });
    const read = h.holdRead();
    h.service.receive(id, { type: "turn.failed", code: "rate_limited", detail: "limit" });
    await drain();
    expect(h.summary(id).working).toBe(true);
    expect(failedNotices(h)).toEqual([]);
    return { id, read };
  }
  async function stillNothingAfterTheRead(h: ReturnType<typeof fixture>, id: string, read: { answer(): void }) {
    expect(failedNotices(h)).toHaveLength(1);
    read.answer(); await drain();
    expect(h.service.scheduled(id)).toEqual([]);
    expect(failedNotices(h)).toHaveLength(1);
    h.clock.advance(2 * HOUR); await drain();
    expect(h.texts(id)).toEqual(["hello"]);
  }
  it("ends with a Stop: the queue comes back and the turn is not sent again", async () => {
    const h = fixture(); const { id, read } = await stoppedWhileReading(h);
    await h.service.interrupt(id);
    expect(h.drafts.returned(id)).toMatchObject({ text: "behind", reason: "interrupted" });
    expect(h.summary(id).working).toBe(false);
    await stillNothingAfterTheRead(h, id, read);
  });
  it("ends with a stop of the provider's runs, before auth reports a new connection", async () => {
    const h = fixture(); const { id, read } = await stoppedWhileReading(h);
    await h.service.stopRuns("codex");
    expect(h.drafts.returned(id)).toMatchObject({ text: "behind", reason: "interrupted" });
    await stillNothingAfterTheRead(h, id, read);
  });
  it("ends with a sign-out", async () => {
    const h = fixture(); const { id, read } = await stoppedWhileReading(h);
    h.service.connectionChanged("codex", undefined);
    expect(h.drafts.returned(id)).toMatchObject({ text: "behind", reason: "interrupted" });
    await stillNothingAfterTheRead(h, id, read);
  });
  it("goes on when another conversation starts on the same canvas", async () => {
    const h = fixture(); const { id } = await stoppedWhileReading(h);
    await h.service.start({ root: "/repo", mode: "new", runtime: "claude", canvas: { path: ".doan/canvases/a.html" }, text: "another", anchors: [] });
    expect(h.drafts.returned(id)).toBeUndefined();
    expect(h.summary(id).working).toBe(true);
    expect(failedNotices(h)).toEqual([]);
  });
});

// A message Send now put into the turn is the person's too; sending only the first again would drop it.
it("does not send a stopped turn again that took a second message, and tells its failure", async () => {
  const h = fixture(); h.limit(RESET); const id = await h.start();
  h.service.queue(id, { text: "behind", anchors: [] });
  h.service.receive(id, { type: "user.message", text: "steered in", anchors: [] });
  await h.limited(id);
  expect(h.service.scheduled(id)).toEqual([{ itemId: expect.any(String), text: "behind", anchors: [], attachments: [] }]);
  expect(failedNotices(h)).toHaveLength(1);
});

describe("schedule timers", () => {
  it("does nothing when a cancelled timer's callback still runs", async () => {
    const h = fixture(); h.limit(RESET); const id = await h.start(); await h.limited(id, true);
    const before = h.clock.armed();
    const { itemId } = h.service.schedule(id, { text: "removed", anchors: [] });
    const run = h.clock.armed().find(callback => !before.includes(callback))!;
    h.service.removeQueued(id, itemId);
    h.clock.sleep(2 * HOUR); run(); await drain();
    expect(h.texts(id)).toEqual(["hello"]);
  });
  // setTimeout fires at once past 2^31-1 ms; the default clock arms such a schedule again until its time.
  it("waits out a reset further away than one timer can, on the default clock", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: NOW });
    try {
      const far = NOW + 30 * 24 * HOUR;
      const dir = mkdtempSync(join(tmpdir(), "doan-limit-")); paths.push(dir);
      const store = new ConversationStore(dir);
      const open = vi.fn<OpenRunner>(async input => ({ sessionId: input.sessionId ?? "s1", send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) }));
      const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: "codex", configDir: "/profile", cwd: "/repo", command: "/fake", env: {},
        owner: { kind: "doan" as const, provider: "codex" as const, connectionId: "c1", accountId: null, workspaceId: null, profile: "codex" }, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
      const service = new ConversationService(store, prepare, open, () => {}, undefined, 10_000, () => [], () => {},
        { limitWindows: async () => [{ id: "primary", label: "30-day", usedPercent: 100, resetsAt: far, limited: true }] });
      service.connectionChanged("codex", "c1");
      const id = (await service.start({ root: "/repo", mode: "new", runtime: "codex", canvas: { path: ".doan/canvases/a.html" }, text: "hello", anchors: [] })).conversationId;
      service.receive(id, { type: "turn.failed", code: "rate_limited", detail: "limit" });
      await drain();
      const texts = () => store.read(id).flatMap(e => e.type === "user.message" ? [e.text] : []);
      vi.advanceTimersByTime(2 ** 31 - 1); await drain();
      expect(texts()).toEqual(["hello"]);
      vi.advanceTimersByTime(far + MIN - NOW - (2 ** 31 - 1) - 1); await drain();
      expect(texts()).toEqual(["hello"]);
      vi.advanceTimersByTime(1); await drain();
      expect(texts()).toEqual(["hello", "hello"]);
    } finally { vi.useRealTimers(); }
  });
  // Two project conversations of one root due at the same time both go: neither holds the root.
  it("sends two schedules of one root at the same time", async () => {
    const h = fixture();
    const first = await h.startProject("first"); h.service.receive(first, { type: "turn.done" });
    const second = await h.startProject("second"); h.service.receive(second, { type: "turn.done" });
    h.limit(RESET);
    await h.service.send(first, "again", []); await h.limited(first, true);
    h.service.schedule(first, { text: "first after", anchors: [] }); h.service.schedule(second, { text: "second after", anchors: [] });
    h.clock.advance(HOUR + MIN); await drain();
    expect(h.texts(first).at(-1)).toBe("first after");
    expect(h.texts(second).at(-1)).toBe("second after");
  });
});

// A Stop while a send is still being prepared (not accepted yet) cancels it: the turn is never sent, and the messages a
// schedule or a queue was sending come back as one interrupted draft.
describe("a Stop while a send is prepared", () => {
  // The next prepare waits until the test lets it go on.
  function holdPrepare(h: ReturnType<typeof fixture>) {
    const original = h.prepare.getMockImplementation()!;
    let go!: () => void;
    h.prepare.mockImplementationOnce((...args) => new Promise(resolve => { go = () => { void original(...args).then(resolve); }; }));
    return { go: () => go() };
  }
  it("cancels a scheduled send", async () => {
    const h = fixture(); h.limit(RESET); const id = await h.start(); await h.limited(id, true);
    h.service.schedule(id, { text: "scheduled", anchors: [] });
    const held = holdPrepare(h);
    h.clock.advance(HOUR + MIN); await drain();
    expect(h.summary(id).working).toBe(true);
    await h.service.interrupt(id);
    held.go(); await drain();
    expect(h.runs[0]!.runner.send).toHaveBeenCalledTimes(1);
    expect(h.texts(id)).toEqual(["hello"]);
    expect(h.drafts.returned(id)).toEqual({ text: "scheduled", anchors: [], attachments: [], reason: "interrupted" });
    expect(h.summary(id)).toMatchObject({ working: false, queued: 0 });
  });
  it("cancels a queue going out after a done turn", async () => {
    const h = fixture(); const id = await h.start();
    h.service.queue(id, { text: "behind", anchors: [] });
    const held = holdPrepare(h);
    h.service.receive(id, { type: "turn.done" }); await drain();
    await h.service.interrupt(id);
    held.go(); await drain();
    expect(h.runs[0]!.runner.send).toHaveBeenCalledTimes(1);
    expect(h.texts(id)).toEqual(["hello"]);
    expect(h.drafts.returned(id)).toEqual({ text: "behind", anchors: [], attachments: [], reason: "interrupted" });
  });
  it("cancels a person's send", async () => {
    const h = fixture(); const id = await h.start();
    h.service.receive(id, { type: "turn.done" });
    const held = holdPrepare(h);
    const sending = h.service.send(id, "next", []);
    await drain();
    await h.service.interrupt(id);
    held.go();
    await expect(sending).rejects.toThrow("busy");
    expect(h.runs[0]!.runner.send).toHaveBeenCalledTimes(1);
    expect(h.texts(id)).toEqual(["hello"]);
    expect(h.summary(id).working).toBe(false);
  });
});

// The scheduled conversation itself works when its time comes (here a send that reached main directly, past the
// channel's routing): the schedule waits, and its messages go out once, after that turn.
it("waits while the canvas conversation works when its schedule comes due", async () => {
  const h = fixture(); h.limit(RESET); const id = await h.start(); await h.limited(id, true);
  h.service.schedule(id, { text: "scheduled", anchors: [] });
  await h.service.send(id, "working", []);
  h.clock.advance(HOUR + MIN); await drain();
  expect(h.texts(id)).toEqual(["hello", "working"]);
  expect(h.summary(id).working).toBe(true);
  h.service.receive(id, { type: "turn.done" }); await drain();
  expect(h.texts(id)).toEqual(["hello", "working", "scheduled"]);
  h.service.receive(id, { type: "turn.done" }); await drain();
  expect(h.texts(id)).toEqual(["hello", "working", "scheduled"]);
  expect(h.service.scheduled(id)).toEqual([]);
});

// An agent's send never waits for a reset: to a conversation whose limit holds it joins the queue as an agent row, runs
// no turn and arms no schedule, and goes only after a later done turn there.
describe("a send to a conversation whose usage limit holds", () => {
  it("queues as a held agent row, schedules nothing, and stays past the reset", async () => {
    const h = fixture({ listed: [{ path: ".doan/canvases/a.html" }, { path: ".doan/canvases/b.html" }] });
    const source = await h.start();
    const target = await h.start(".doan/canvases/b.html");
    h.limit(RESET);
    await h.limited(target, true);
    expect(h.service.scheduling(target)).toBe(true);
    const key = h.open.mock.calls[0]![0].env.DOAN_HANDOFF!;
    expect(h.service.requestSend({ root: "/repo", handoff: key, path: ".doan/canvases/b.html", text: "Use the new price." })).toBeNull();
    h.service.receive(source, { type: "turn.done" });
    await drain();
    expect(h.store.read(source).filter(e => e.type === "handoff.resolved")).toMatchObject([{ via: "send", outcome: "sent", target: { conversationId: target }, queued: true }]);
    expect(h.texts(target)).toEqual(["hello"]);
    expect(h.drafts.queued(target)).toMatchObject([{ text: "Use the new price.", origin: { via: "send" } }]);
    expect(h.summary(target)).toMatchObject({ agentQueue: [{ held: true }] });
    expect(h.summary(target).scheduledAt).toBeUndefined();
    expect(h.service.scheduled(target)).toEqual([]);
    h.noLimit();
    h.clock.advance(2 * HOUR);
    await drain();
    expect(h.texts(target)).toEqual(["hello"]);
    expect(h.drafts.queued(target)).toHaveLength(1);
  });
  it("leaves an agent row queued behind a person's scheduled message, which goes alone at the reset", async () => {
    const h = fixture({ listed: [{ path: ".doan/canvases/a.html" }, { path: ".doan/canvases/b.html" }] });
    const source = await h.start();
    const target = await h.start(".doan/canvases/b.html");
    h.limit(RESET);
    await h.limited(target, true);
    h.service.schedule(target, { text: "mine at the reset", anchors: [] });
    const key = h.open.mock.calls[0]![0].env.DOAN_HANDOFF!;
    h.service.requestSend({ root: "/repo", handoff: key, path: ".doan/canvases/b.html", text: "Use the new price." });
    h.service.receive(source, { type: "turn.done" });
    await drain();
    expect(h.service.scheduled(target).map(item => item.text)).toEqual(["mine at the reset"]);
    h.noLimit();
    h.clock.advance(HOUR + 2 * MIN);
    await drain();
    expect(h.texts(target)).toEqual(["hello", "mine at the reset"]);
    expect(h.drafts.queued(target)).toMatchObject([{ origin: { via: "send" } }]);
    h.runs.at(-1)!.emit({ type: "turn.done" });
    await drain();
    expect(h.texts(target)).toEqual(["hello", "mine at the reset", "Use the new price."]);
  });
});

// Spec '완료 조건': a received turn the usage limit stops fails as that turn's limit failure and never goes again by itself.
describe("a send's turn the usage limit stops", () => {
  it("is neither queued again nor scheduled, whether or not the agent did anything", async () => {
    for (const activity of [false, true]) {
      const h = fixture({ listed: [{ path: ".doan/canvases/a.html" }, { path: ".doan/canvases/b.html" }] });
      const target = await h.start(".doan/canvases/b.html");
      h.runs[0]!.emit({ type: "turn.done" }); await drain();
      const source = await h.start();
      const key = h.open.mock.calls[1]![0].env.DOAN_HANDOFF!;
      h.service.requestSend({ root: "/repo", handoff: key, path: ".doan/canvases/b.html", text: "Use the new price." });
      h.service.receive(source, { type: "turn.done" });
      await drain();
      expect(h.texts(target)).toEqual(["hello", "Use the new price."]);
      h.limit(RESET);
      await h.limited(target, activity);
      expect(h.drafts.queued(target)).toEqual([]);
      expect(h.summary(target).scheduledAt).toBeUndefined();
      h.noLimit(); h.clock.advance(2 * HOUR); await drain();
      expect(h.texts(target)).toEqual(["hello", "Use the new price."]);
    }
  });
});

// The reset sends every person's row first as one turn (flush of the person's rows only); an agent row goes after it.
describe("an agent row's place while a reset is scheduled", () => {
  const listed = [{ path: ".doan/canvases/a.html" }, { path: ".doan/canvases/b.html" }];
  it("follows the last person's row, wherever it sits in the queue", async () => {
    const h = fixture({ listed });
    const source = await h.start();
    const target = await h.start(".doan/canvases/b.html");
    h.limit(RESET);
    await h.limited(target, true);
    const { itemId: q1 } = h.service.schedule(target, { text: "q1", anchors: [] });
    h.service.requestSend({ root: "/repo", handoff: h.open.mock.calls[0]![0].env.DOAN_HANDOFF!, path: ".doan/canvases/b.html", text: "agent" });
    h.service.receive(source, { type: "turn.done" });
    await drain();
    expect(h.summary(target).agentQueue?.map(row => row.after)).toEqual([q1]);
    const { itemId: q2 } = h.service.schedule(target, { text: "q2", anchors: [] });
    expect(h.drafts.queued(target).map(item => item.text)).toEqual(["q1", "agent", "q2"]);
    expect(h.summary(target).agentQueue?.map(row => row.after)).toEqual([q2]);
  });
  it("follows the last person's row after a stopped turn's own message was queued again in front", async () => {
    const h = fixture({ listed });
    const source = await h.start();
    const target = await h.start(".doan/canvases/b.html");
    h.service.requestSend({ root: "/repo", handoff: h.open.mock.calls[0]![0].env.DOAN_HANDOFF!, path: ".doan/canvases/b.html", text: "agent" });
    h.service.receive(source, { type: "turn.done" });
    await drain();
    const { itemId: q2 } = h.service.queue(target, { text: "q2", anchors: [] });
    h.limit(RESET);
    await h.limited(target, false);
    expect(h.drafts.queued(target).map(item => item.text)).toEqual(["hello", "agent", "q2"]);
    expect(h.summary(target).scheduledAt).toBeDefined();
    expect(h.summary(target).agentQueue?.map(row => row.after)).toEqual([q2]);
  });
});
