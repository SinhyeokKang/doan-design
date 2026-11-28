import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conversationHandler } from "./ipc";
import { ConversationService, type OpenRunner, type Prepare, type Runner } from "./service";
import { ConversationStore } from "./store";
import { DraftStore } from "./drafts";
import type { Anchor, Canvas } from "./types";

// Every way a message goes out (start, send, queue and its flush, Send now) checks canvas anchors against the root's
// list as it is then.
const paths: string[] = [];
afterEach(() => { vi.restoreAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });

const OLD = ".doan/canvases/checkout-flow.html", NEW = ".doan/canvases/flows/checkout-flow.html";
const ref = (path: string): Anchor => ({ canvas: { path, id: "checkout" } });
const gone: Anchor = { canvas: { path: ".doan/canvases/pricing.html", id: "pricing" } };
const frame: Anchor = { frame: { id: "hero" } };

const NOW = Date.parse("2026-11-13T07:00:00.000Z"), RESET = NOW + 3_600_000;
function setup(limit = false) {
  const dir = mkdtempSync(join(tmpdir(), "doan-canvas-send-")); paths.push(dir);
  const store = new ConversationStore(dir); const runners: Runner[] = [];
  const open = vi.fn<OpenRunner>(async input => {
    const runner: Runner = { sessionId: input.sessionId ?? `s${runners.length + 1}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    runners.push(runner); return runner;
  });
  const owner = { kind: "doan" as const, provider: "claude" as const, connectionId: "c", accountId: "a", workspaceId: "o", profile: "p" };
  const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: "claude" as const, configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, owner, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
  const listed: Canvas[] = [{ path: OLD, id: "checkout" }];
  const drafts = new DraftStore(join(dir, "conversations"));
  let unreadable = false, now = NOW;
  const timers = new Set<{ at: number; run: () => void }>();
  const clock = { now: () => now, setTimer: (run: () => void, ms: number) => { const timer = { at: now + ms, run }; timers.add(timer); return timer; }, clearTimer: (timer: unknown) => { timers.delete(timer as { at: number; run: () => void }); } };
  const windows = [{ id: "five_hour", label: "5-hour", periodMins: 300, usedPercent: 100, resetsAt: RESET, limited: true as const }];
  const service = new ConversationService(store, prepare, open, () => {}, undefined, 10_000, () => { if (unreadable) throw new Error("unknown"); return listed; }, () => {},
    { drafts, ...(limit ? { limitWindows: async () => windows, clock } : {}) });
  if (limit) service.connectionChanged("claude", "c");
  const advance = (ms: number) => { now += ms; for (const timer of [...timers].sort((a, b) => a.at - b.at)) if (timer.at <= now && timers.has(timer)) { timers.delete(timer); timer.run(); } };
  const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: listed }]);
  const move = (to: string) => { listed.splice(0, listed.length, { path: to, id: "checkout" }); };
  const userMessages = (id: string) => store.read(id).filter(e => e.type === "user.message");
  const prompts = () => runners.flatMap(r => vi.mocked(r.send).mock.calls.map(call => call[0]));
  const start = async (text = "x", anchors: Anchor[] = []) => (await handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text, anchors }) as { conversationId: string }).conversationId;
  const failList = (on: boolean) => { unreadable = on; };
  return { service, store, handle, open, runners, listed, move, userMessages, prompts, start, failList, advance };
}

describe("send-time canvas anchors", () => {
  it("starts with the canvas's current path, and a deleted canvas as its name", async () => {
    const h = setup(); h.move(NEW);
    const id = await h.start("Follow {{1}} and {{2}} in {{3}}", [ref(OLD), gone, frame]);
    expect(h.userMessages(id)[0]).toMatchObject({ text: "Follow {{1}} and pricing in {{2}}", anchors: [ref(NEW), frame] });
    expect(h.prompts()[0]).toContain(NEW);
    expect(h.prompts()[0]).not.toContain(OLD);
    expect(h.prompts()[0]).not.toContain("pricing.html");
  });

  it("sends with the canvas's current path, and a deleted canvas as its name", async () => {
    const h = setup();
    const id = await h.start();
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    h.move(NEW);
    expect(await h.handle(true, "send", { conversationId: id, text: "{{1}} then {{2}}", anchors: [gone, ref(OLD)] })).toBeUndefined();
    await vi.waitFor(() => expect(h.userMessages(id)).toHaveLength(2));
    expect(h.userMessages(id)[1]).toMatchObject({ text: "pricing then {{1}}", anchors: [ref(NEW)] });
    expect(h.prompts().at(-1)).toContain(NEW);
    expect(h.prompts().at(-1)).not.toContain(OLD);
  });

  it("checks a queued message again when the queue goes out, after the canvas moved or was deleted", async () => {
    const h = setup();
    const id = await h.start();
    expect(await h.handle(true, "queue", { conversationId: id, text: "one {{1}}", anchors: [ref(OLD)] })).toEqual({ itemId: expect.any(String) });
    expect(await h.handle(true, "queue", { conversationId: id, text: "two {{1}}", anchors: [{ canvas: { path: ".doan/canvases/other.html", id: "checkout" } }] })).toEqual({ itemId: expect.any(String) });
    h.move(NEW);
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(h.userMessages(id)).toHaveLength(2));
    expect(h.userMessages(id)[1]).toMatchObject({ text: "one {{1}}\n\ntwo {{2}}", anchors: [ref(NEW), ref(NEW)] });
    expect(h.prompts().at(-1)).not.toContain(OLD);
  });

  it("turns a queued canvas chip into its name when its canvas is gone by the time the queue goes out", async () => {
    const h = setup();
    const id = await h.start();
    await h.handle(true, "queue", { conversationId: id, text: "see {{1}} near {{2}}", anchors: [ref(OLD), frame] });
    h.listed.splice(0);
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(h.userMessages(id)).toHaveLength(2));
    expect(h.userMessages(id)[1]).toMatchObject({ text: "see checkout-flow near {{1}}", anchors: [frame] });
  });

  // Queueing happens while the agent may be rewriting that canvas, so only the moment it goes out decides.
  it("keeps a canvas chip queued while its canvas is briefly unlisted, and sends it with the path listed at flush", async () => {
    const h = setup();
    const id = await h.start();
    h.listed.splice(0);
    await h.handle(true, "queue", { conversationId: id, text: "see {{1}}", anchors: [ref(OLD)] });
    h.move(NEW);
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(h.userMessages(id)).toHaveLength(2));
    expect(h.userMessages(id)[1]).toMatchObject({ text: "see {{1}}", anchors: [ref(NEW)] });
  });

  it("keeps a send held for the usage limit as it was sent, and checks it when it goes out after the reset", async () => {
    const h = setup(true);
    const id = await h.start();
    h.service.receive(id, { type: "activity", kind: "read", summary: "Reading files" });
    h.service.receive(id, { type: "turn.failed", code: "rate_limited", detail: "Rate limited" }); h.service.refreshed("/repo");
    await vi.waitFor(() => expect(h.service.list("/repo")[0]).toMatchObject({ limitResetsAt: new Date(RESET).toISOString(), working: false }));
    h.listed.splice(0);
    expect(await h.handle(true, "send", { conversationId: id, text: "after {{1}}", anchors: [ref(OLD)] })).toEqual({ scheduled: expect.anything() });
    expect(await h.handle(true, "scheduled", { conversationId: id })).toMatchObject([{ text: "after {{1}}", anchors: [ref(OLD)] }]);
    h.move(NEW);
    h.open.mock.calls[0]![2]();
    h.advance(2 * 3_600_000);
    await vi.waitFor(() => expect(h.userMessages(id)).toHaveLength(2));
    expect(h.userMessages(id)[1]).toMatchObject({ text: "after {{1}}", anchors: [ref(NEW)] });
  });

  it("gives a queue back as a draft, with nothing left sending, when the list cannot be read as it goes out", async () => {
    const h = setup();
    const id = await h.start();
    await h.handle(true, "queue", { conversationId: id, text: "one {{1}}", anchors: [ref(OLD)] });
    h.failList(true);
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await vi.waitFor(() => expect(h.service.list("/repo")[0]).toMatchObject({ queued: 0, working: false }));
    h.failList(false);
    expect(h.userMessages(id)).toHaveLength(1);
    expect(h.service.takeDraft(id)).toMatchObject({ text: "one {{1}}", anchors: [ref(OLD)] });
  });

  it("checks a message sent now into the running turn against the list at that moment", async () => {
    const h = setup();
    const id = await h.start();
    const steer = vi.fn(async (_prompt: string, _turnId: string, _messageId: string) => {});
    h.runners[0]!.steer = steer;
    const queued = await h.handle(true, "queue", { conversationId: id, text: "now {{1}} and {{2}}", anchors: [ref(OLD), gone] }) as { itemId: string };
    h.move(NEW);
    const sent = h.handle(true, "sendQueuedNow", { conversationId: id, itemId: queued.itemId });
    await vi.waitFor(() => expect(steer).toHaveBeenCalledOnce());
    const prompt = steer.mock.calls[0]![0];
    expect(prompt).toContain(NEW);
    expect(prompt).not.toContain(OLD);
    expect(prompt).not.toContain("pricing.html");
    h.open.mock.calls[0]![0].steerConsumed!(steer.mock.calls[0]![2]);
    await sent;
    expect(h.userMessages(id).at(-1)).toMatchObject({ text: "now {{1}} and pricing", anchors: [ref(NEW)] });
  });

  it("leaves a message sent now queued, not marked sending, when its list cannot be read", async () => {
    const h = setup();
    const id = await h.start();
    const steer = vi.fn(async (_prompt: string, _turnId: string, _messageId: string) => {});
    h.runners[0]!.steer = steer;
    const queued = await h.handle(true, "queue", { conversationId: id, text: "now {{1}}", anchors: [ref(OLD)] }) as { itemId: string };
    h.failList(true);
    await expect(h.service.sendNow(id, queued.itemId)).rejects.toThrow("unknown");
    h.failList(false);
    void h.service.sendNow(id, queued.itemId).catch(() => {});
    await vi.waitFor(() => expect(steer).toHaveBeenCalledOnce());
  });

  it("still reads a conversation whose canvas anchor's canvas was deleted later", async () => {
    const h = setup();
    const id = await h.start("{{1}}", [ref(OLD)]);
    h.listed.splice(0);
    expect(h.store.read(id).find(e => e.type === "user.message")).toMatchObject({ anchors: [ref(OLD)] });
    expect(() => h.service.read(id)).not.toThrow();
  });
});
