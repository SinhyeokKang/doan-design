import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { ConversationService, resolveListedCanvas, type OpenRunner, type Prepare, type Runner } from "./service";
import { DraftStore } from "./drafts";
import { BIND_GRACE_MS, PROMOTION_SETTLE_MS } from "./project";
import type { Provider } from "../agentAuth/types";
import type { Canvas, EventPayload } from "./types";

// When a finished turn is judged, how its process is ended, what a Send now the agent never reported does, and the
// background work a done turn leaves.
const paths: string[] = [];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
type Hooks = Parameters<OpenRunner>[0];
type Fake = Runner & { steer: NonNullable<Runner["steer"]>; endAfterTurn: ReturnType<typeof vi.fn> };
type Run = { input: Hooks; emit: (event: EventPayload) => void; exited: () => void; runner: Fake };
function fixture(options: { provider?: Provider; legacy?: boolean; listed?: Canvas[] } = {}) {
  const provider = options.provider ?? "claude";
  const dir = mkdtempSync(join(tmpdir(), "doan-turn-end-")); paths.push(dir);
  const store = new ConversationStore(dir), runs: Run[] = [];
  const open = vi.fn<OpenRunner>(async (input, emit, exited) => {
    const runner: Fake = { sessionId: input.sessionId ?? `s${runs.length + 1}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}), steer: vi.fn(async () => {}), endAfterTurn: vi.fn(() => "kill" as const) };
    runs.push({ input, emit, exited, runner }); return runner;
  });
  const quiet = vi.fn();
  const owner = { kind: "doan" as const, provider, connectionId: "conn", accountId: "acct", workspaceId: "org", profile: provider };
  const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: provider, configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, quiet, ...(options.legacy ? {} : { owner }), ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
  const listed: Canvas[] = [...options.listed ?? [{ path: ".doan/canvases/a.html", id: "a" }]];
  const drafts = new DraftStore(join(dir, "conversations"));
  // The transcript the service reads after a turn whose steered message was never reported (io.ts in the app).
  let transcript = "";
  const reads: { configDir: string; sessionId: string; from: number }[] = [];
  const transcripts = { size: vi.fn(() => 100), read: vi.fn((configDir: string, sessionId: string, from: number) => { reads.push({ configDir, sessionId, from }); return transcript; }) };
  const admit = (_root: string, canvas?: Canvas) => canvas ? resolveListedCanvas(canvas, listed) : undefined;
  const changes: string[] = [];
  const service = new ConversationService(store, prepare, open, () => {}, admit, 10_000, () => listed, root => changes.push(root), { drafts, transcripts });
  const types = (id: string) => store.read(id).map(e => e.type);
  const texts = (id: string) => store.read(id).flatMap(e => e.type === "user.message" ? [e.text] : []);
  const summary = (id: string) => service.list("/repo").find(s => s.conversationId === id)!;
  const startCanvas = async () => (await service.start({ root: "/repo", mode: "new", runtime: provider, canvas: { path: ".doan/canvases/a.html" }, text: "hello", anchors: [] })).conversationId;
  const startProject = async () => (await service.start({ root: "/repo", mode: "newDesign", runtime: provider, text: "make a page", anchors: [] })).conversationId;
  const userLine = (uuid: string) => JSON.stringify({ type: "user", uuid, message: { role: "user", content: "x" } }) + "\n";
  return { service, store, runs, open, prepare, quiet, listed, drafts, transcripts, reads, setTranscript: (text: string) => { transcript = text; }, userLine, types, texts, summary, startCanvas, startProject, changes };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const fake = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

describe("judging a project turn once its process group is gone", () => {
  it("judges a settle time after the group went, and a send fired at turn.done starts then (POSTMORTEM 2026-10-28)", async () => {
    fake(); const h = fixture(); const id = await h.startProject();
    h.runs[0]!.emit({ type: "turn.done" });
    const sending = h.service.send(id, "next", []);
    h.runs[0]!.exited();
    await vi.advanceTimersByTimeAsync(PROMOTION_SETTLE_MS - 1);
    expect(h.open).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await sending;
    expect(h.open).toHaveBeenCalledTimes(2);
    expect(h.texts(id)).toEqual(["make a page", "next"]);
  });
  it.each([["failed", { type: "turn.failed", code: "unknown" } as const], ["interrupted", { type: "interrupted", reason: "user" } as const]])("does the same for a %s turn", async (_name, terminal) => {
    fake(); const h = fixture(); const id = await h.startProject();
    h.runs[0]!.emit(terminal); h.runs[0]!.exited();
    const sending = h.service.send(id, "next", []);
    await vi.advanceTimersByTimeAsync(PROMOTION_SETTLE_MS);
    await sending;
    expect(h.open).toHaveBeenCalledTimes(2);
  });
  it("judges a settle time after the end when the process was gone before it", async () => {
    fake(); const h = fixture(); const id = await h.startProject();
    // The group went first: the service writes process_exited itself.
    h.runs[0]!.exited();
    expect(h.types(id).at(-1)).toBe("turn.failed");
    const sending = h.service.send(id, "next", []);
    await vi.advanceTimersByTimeAsync(PROMOTION_SETTLE_MS);
    await sending;
    expect(h.open).toHaveBeenCalledTimes(2);
  });
  it("judges at a folder refresh that comes first", async () => {
    fake(); const h = fixture(); const id = await h.startProject();
    h.listed.push({ path: ".doan/canvases/new.html", id: "new" });
    h.runs[0]!.emit({ type: "turn.done" }); h.runs[0]!.exited();
    h.service.refreshed("/repo", [".doan/canvases/new.html"]);
    expect(h.store.list()[0]!.canvas).toEqual({ path: ".doan/canvases/new.html", id: "new" });
  });
  it("keeps the 10 s bound while the group is still there (a Codex server stays between turns)", async () => {
    fake(); const h = fixture({ provider: "codex" }); const id = await h.startProject();
    h.runs[0]!.emit({ type: "turn.done" });
    let sent = false; const sending = h.service.send(id, "next", []).then(() => { sent = true; });
    await vi.advanceTimersByTimeAsync(BIND_GRACE_MS - 1);
    expect(sent).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await sending;
    expect(h.texts(id)).toEqual(["make a page", "next"]);
  });
  it("rule is the same for an ACP provider whose group ends with the turn", async () => {
    fake(); const h = fixture({ provider: "cursor" }); const id = await h.startProject();
    h.runs[0]!.emit({ type: "turn.done" }); h.runs[0]!.exited();
    const sending = h.service.send(id, "next", []);
    await vi.advanceTimersByTimeAsync(PROMOTION_SETTLE_MS); await sending;
    expect(h.open).toHaveBeenCalledTimes(2);
  });
  it("a Stop while the send waits for the judgement hands the queue back and refuses the send", async () => {
    fake(); const h = fixture(); const id = await h.startProject();
    h.service.queue(id, { text: "queued", anchors: [] });
    h.runs[0]!.emit({ type: "turn.done" });
    await h.service.interrupt(id);
    expect(h.drafts.returned(id)?.text).toBe("queued");
    h.runs[0]!.exited();
    await vi.advanceTimersByTimeAsync(BIND_GRACE_MS);
    expect(h.open).toHaveBeenCalledOnce();
  });
  it("judges a handoff a settle time after the group went", async () => {
    fake(); const h = fixture({ listed: [{ path: ".doan/canvases/a.html", id: "a" }] }); const id = await h.startCanvas();
    const key = h.open.mock.calls[0]![0].env.DOAN_HANDOFF!;
    expect(h.service.requestHandoff({ root: "/repo", handoff: key, path: ".doan/canvases/b.html", text: "go on" })).toBeNull();
    h.runs[0]!.emit({ type: "turn.done" }); h.runs[0]!.exited();
    await vi.advanceTimersByTimeAsync(PROMOTION_SETTLE_MS - 1);
    expect(h.types(id).at(-1)).toBe("turn.done");
    await vi.advanceTimersByTimeAsync(1);
    expect(h.store.read(id).at(-1)).toMatchObject({ type: "handoff.resolved", outcome: "refused", reason: "not_listed" });
  });
});

describe("ending a finished turn's process", () => {
  it("asks the runner on every send that waits for the previous process, a suggestion already here included", async () => {
    const h = fixture(); const id = await h.startCanvas();
    h.runs[0]!.emit({ type: "turn.done" });
    h.runs[0]!.input.suggested!("Run the tests");
    const sending = h.service.send(id, "next", []);
    await tick();
    expect(h.runs[0]!.runner.endAfterTurn).toHaveBeenCalledOnce();
    h.runs[0]!.exited(); await sending;
    expect(h.open).toHaveBeenCalledTimes(2);
  });
  it.each([["failed", { type: "turn.failed", code: "unknown" } as const], ["interrupted", { type: "interrupted", reason: "user" } as const]])("asks for a %s turn's process too", async (_name, terminal) => {
    const h = fixture(); const id = await h.startCanvas();
    h.runs[0]!.emit(terminal);
    const sending = h.service.send(id, "next", []);
    await tick();
    expect(h.runs[0]!.runner.endAfterTurn).toHaveBeenCalledOnce();
    h.runs[0]!.exited(); await sending;
  });
  it("asks when a queue sets the hold at the turn's end", async () => {
    const h = fixture(); const id = await h.startCanvas();
    h.service.queue(id, { text: "queued", anchors: [] });
    h.runs[0]!.emit({ type: "turn.done" });
    await vi.waitFor(() => expect(h.runs[0]!.runner.endAfterTurn).toHaveBeenCalled());
    h.runs[0]!.exited();
    await vi.waitFor(() => expect(h.texts(id)).toEqual(["hello", "queued"]));
  });
  it("a send waiting for a project judgement ends the process before it waits", async () => {
    const h = fixture(); const id = await h.startProject();
    h.runs[0]!.emit({ type: "turn.done" });
    const sending = h.service.send(id, "next", []).catch(() => {});
    await tick();
    expect(h.runs[0]!.runner.endAfterTurn).toHaveBeenCalled();
    h.service.refreshed("/repo", []); h.runs[0]!.exited(); await sending;
  });
});

describe("a steered message the agent never reported (Claude)", () => {
  async function steered(h: ReturnType<typeof fixture>) {
    const id = await h.startCanvas();
    const { itemId } = h.service.queue(id, { text: "also this", anchors: [] });
    const now = h.service.sendNow(id, itemId);
    // A refused Send now rejects; the cases that expect it await it again.
    now.catch(() => {});
    await tick();
    const messageId = vi.mocked(h.runs[0]!.runner.steer).mock.calls[0]![2];
    return { id, itemId, now, messageId };
  }
  it("holds the turn's end until the group is gone, then keeps a message found in the transcript in that turn", async () => {
    const h = fixture(); const { id, now, messageId } = await steered(h);
    h.runs[0]!.emit({ type: "turn.done" });
    expect(h.types(id)).toEqual(["user.message", "turn.started"]);
    h.setTranscript(h.userLine(messageId));
    h.runs[0]!.exited();
    expect(h.types(id)).toEqual(["user.message", "turn.started", "user.message", "turn.done"]);
    expect(h.texts(id)).toEqual(["hello", "also this"]);
    expect(h.types(id)).not.toContain("turn.failed");
    expect(h.reads[0]).toEqual({ configDir: "/profile", sessionId: "s1", from: 100 });
    await now;
    expect(h.drafts.queued(id)).toEqual([]);
    expect(h.drafts.returned(id)).toBeUndefined();
  });
  it("finds a folded message by its attachment's source_uuid", async () => {
    const h = fixture(); const { id, messageId } = await steered(h);
    h.runs[0]!.emit({ type: "turn.done" });
    h.setTranscript(JSON.stringify({ type: "attachment", attachment: { type: "queued_command", source_uuid: messageId } }) + "\n");
    h.runs[0]!.exited();
    expect(h.texts(id)).toEqual(["hello", "also this"]);
  });
  it("sends a message the transcript does not have with the queue, as before", async () => {
    const h = fixture(); const { id, now } = await steered(h);
    h.runs[0]!.emit({ type: "turn.done" }); h.runs[0]!.exited();
    expect(h.types(id)).toEqual(["user.message", "turn.started", "turn.done"]);
    await expect(now).rejects.toThrow("not_running");
    await vi.waitFor(() => expect(h.texts(id)).toEqual(["hello", "also this"]));
  });
  it("on Stop, says stopping at once and keeps a message found in the transcript", async () => {
    const h = fixture(); const { id, messageId } = await steered(h);
    const stopping = h.service.interrupt(id);
    expect(h.summary(id).stopping).toBe(true);
    h.setTranscript(h.userLine(messageId));
    h.runs[0]!.exited(); await stopping;
    expect(h.types(id)).toEqual(["user.message", "turn.started", "user.message", "interrupted"]);
    expect(h.drafts.returned(id)).toBeUndefined();
    expect(h.summary(id).stopping).toBeUndefined();
  });
  it("on a sign-out of its provider, does the same", async () => {
    const h = fixture(); const { id, messageId } = await steered(h);
    const out = h.service.stopRuns("claude");
    h.setTranscript(h.userLine(messageId));
    h.runs[0]!.exited(); await out;
    expect(h.types(id)).toEqual(["user.message", "turn.started", "user.message", "interrupted"]);
  });
  // An archive writes its interrupted end through the journal at once (no read can follow it), so a found message is
  // only kept out of the returned draft; one not found comes back as before.
  it("on archive, keeps a found message out of the returned draft", async () => {
    const h = fixture(); const { id, messageId } = await steered(h);
    // A new conversation on the same canvas archives this one.
    await h.service.start({ root: "/repo", mode: "new", runtime: "claude", canvas: { path: ".doan/canvases/a.html" }, text: "fresh", anchors: [] });
    h.setTranscript(h.userLine(messageId));
    h.runs[0]!.exited();
    expect(h.drafts.returned(id)).toBeUndefined();
    expect(h.drafts.queued(id)).toEqual([]);
  });
  it("on archive, hands a message the transcript does not have back as a draft", async () => {
    const h = fixture(); const { id } = await steered(h);
    await h.service.start({ root: "/repo", mode: "new", runtime: "claude", canvas: { path: ".doan/canvases/a.html" }, text: "fresh", anchors: [] });
    h.runs[0]!.exited();
    expect(h.drafts.returned(id)?.text).toBe("also this");
  });
  it("on app quit, writes nothing more but takes a found message out of the queue", async () => {
    const h = fixture(); const { id, messageId } = await steered(h);
    const quitting = h.service.quit();
    const before = h.types(id);
    h.setTranscript(h.userLine(messageId));
    h.runs[0]!.exited(); await quitting;
    expect(h.types(id)).toEqual(before);
    expect(h.drafts.queued(id)).toEqual([]);
  });
  it("looks in the transcript when the group goes before the turn's end (a crash), and the message joins the turn before its failure", async () => {
    const h = fixture(); const { id, now, messageId } = await steered(h);
    h.setTranscript(h.userLine(messageId));
    h.runs[0]!.exited();
    expect(h.types(id)).toEqual(["user.message", "turn.started", "user.message", "turn.failed"]);
    expect(h.store.read(id).at(-1)).toMatchObject({ type: "turn.failed", code: "process_exited" });
    await now;
    expect(h.drafts.queued(id)).toEqual([]);
    expect(h.drafts.returned(id)).toBeUndefined();
  });
  it("hands a message the transcript does not have back as before when the group goes first", async () => {
    const h = fixture(); const { id } = await steered(h);
    h.runs[0]!.exited();
    expect(h.types(id)).toEqual(["user.message", "turn.started", "turn.failed"]);
    expect(h.drafts.returned(id)?.text).toBe("also this");
  });
  it("writes the held end after 2 s without the group gone, and the message goes back to the queue", async () => {
    const h = fixture(); const { id } = await steered(h);
    fake();
    h.runs[0]!.emit({ type: "turn.done" });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(h.types(id)).toEqual(["user.message", "turn.started"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.types(id)).toEqual(["user.message", "turn.started", "turn.done"]);
    expect(h.transcripts.read).not.toHaveBeenCalled();
    h.runs[0]!.exited();
    expect(h.types(id)).not.toContain("turn.failed");
  });
  it("reads a legacy external conversation's transcript too, from its own profile", async () => {
    const h = fixture({ legacy: true }); const { id, messageId } = await steered(h);
    h.runs[0]!.emit({ type: "turn.done" });
    h.setTranscript(h.userLine(messageId));
    h.runs[0]!.exited();
    expect(h.texts(id)).toEqual(["hello", "also this"]);
  });
  it("leaves a Codex turn's end as it was: written at once", async () => {
    const h = fixture({ provider: "codex" }); const { id } = await steered(h);
    h.runs[0]!.emit({ type: "turn.done" });
    expect(h.types(id)).toEqual(["user.message", "turn.started", "turn.done"]);
    expect(h.transcripts.read).not.toHaveBeenCalled();
  });
});

describe("background work after a done turn", () => {
  async function background(h: ReturnType<typeof fixture>) {
    const id = await h.startCanvas();
    h.runs[0]!.emit({ type: "turn.done" });
    h.runs[0]!.input.backgroundChanged!(true);
    return { id, turnId: h.store.read(id).find(e => e.type === "turn.started")!.turnId };
  }
  it("lists it with the done turn's id, and the conversation is not working; its lease stops counting as a running conversation", async () => {
    const h = fixture(); const { id, turnId } = await background(h);
    expect(h.summary(id)).toMatchObject({ background: { turnId }, working: false, phase: "ended" });
    expect(h.summary(id).background!.stopping).toBeUndefined();
    expect(h.quiet).toHaveBeenLastCalledWith(true);
    expect(h.service.restartHolds()).toEqual({ liveTurns: 0, pendingAnswers: 0 });
  });
  // The queue that goes out at the turn's end is the next send: it ends the group, so no line stands over it.
  it("a project turn ending with a queue lists no background", async () => {
    const h = fixture(); const id = await h.startProject();
    h.service.queue(id, { text: "queued", anchors: [] });
    h.runs[0]!.emit({ type: "turn.done" });
    h.runs[0]!.input.backgroundChanged!(true);
    expect(h.summary(id).background).toBeUndefined();
    expect(h.quiet).not.toHaveBeenCalled();
    expect(h.runs[0]!.runner.endAfterTurn).toHaveBeenCalledOnce();
  });
  // A canvas conversation's queue waits for the previous process before its send is busy; it is the next send all the same.
  it("a canvas turn ending with a queue lists no background", async () => {
    const h = fixture(); const id = await h.startCanvas();
    h.service.queue(id, { text: "queued", anchors: [] });
    h.runs[0]!.emit({ type: "turn.done" });
    h.runs[0]!.input.backgroundChanged!(true);
    expect(h.summary(id).background).toBeUndefined();
    await tick();
    expect(h.summary(id).background).toBeUndefined();
    expect(h.quiet).not.toHaveBeenCalled();
    h.runs[0]!.exited();
    await vi.waitFor(() => expect(h.texts(id)).toEqual(["hello", "queued"]));
  });
  it("drops the line when the group is gone", async () => {
    const h = fixture(); const { id } = await background(h);
    h.runs[0]!.input.backgroundChanged!(false);
    expect(h.summary(id).background).toBeDefined();
    h.runs[0]!.exited();
    expect(h.summary(id).background).toBeUndefined();
  });
  it("the next send ends the group (the runner's own choice) and the line goes once the send is accepted", async () => {
    const h = fixture(); const { id } = await background(h);
    const sending = h.service.send(id, "next", []);
    await tick();
    expect(h.runs[0]!.runner.endAfterTurn).toHaveBeenCalledOnce();
    h.runs[0]!.exited(); await sending;
    expect(h.summary(id).background).toBeUndefined();
  });
  it("Stop of the line stops that done turn's group through stop(), says stopping, and a second press does nothing more", async () => {
    const h = fixture(); const { id, turnId } = await background(h);
    // The group goes while the stop waits.
    vi.mocked(h.runs[0]!.runner.stop).mockImplementation(() => new Promise<void>(resolve => setTimeout(() => { h.runs[0]!.exited(); resolve(); }, 5)));
    let seen: unknown;
    h.changes.length = 0;
    const first = h.service.interrupt(id, turnId);
    seen = h.summary(id).background;
    await h.service.interrupt(id, turnId);
    await first;
    expect(seen).toEqual({ turnId, stopping: true });
    expect(h.runs[0]!.runner.stop).toHaveBeenCalledOnce();
    expect(h.types(id)).toEqual(["user.message", "turn.started", "turn.done"]);
    expect(h.summary(id).background).toBeUndefined();
  });
  it("brings the line's Stop back with a refusal when the group is still there after the stop", async () => {
    const h = fixture(); const { id, turnId } = await background(h);
    await expect(h.service.interrupt(id, turnId)).rejects.toThrow("busy");
    expect(h.summary(id).background).toEqual({ turnId });
  });
  it("a Stop that names an earlier turn does nothing to a send started since", async () => {
    const h = fixture(); const { id, turnId } = await background(h);
    const sending = h.service.send(id, "next", []);
    await tick(); h.runs[0]!.exited(); await sending;
    await h.service.interrupt(id, turnId);
    expect(h.runs[1]!.runner.stop).not.toHaveBeenCalled();
    expect(h.types(id).at(-1)).toBe("turn.started");
  });
  it("a sign-out, an archive, a deletion and the app's quit stop the group without asking, through close()", async () => {
    for (const how of ["signOut", "archive", "delete", "quit"] as const) {
      const h = fixture(); const { id } = await background(h);
      if (how === "signOut") await h.service.stopRuns("claude");
      if (how === "archive") await h.service.start({ root: "/repo", mode: "new", runtime: "claude", canvas: { path: ".doan/canvases/a.html" }, text: "fresh", anchors: [] });
      if (how === "delete") h.service.delete(id);
      if (how === "quit") await h.service.quit();
      expect(h.runs[0]!.runner.close).toHaveBeenCalled();
      expect(h.runs[0]!.runner.endAfterTurn).not.toHaveBeenCalled();
    }
  });
  it("a project Remove stops the background groups of its roots through stop()", async () => {
    const h = fixture(); await background(h);
    h.service.stopBackground(["/elsewhere"]);
    expect(h.runs[0]!.runner.stop).not.toHaveBeenCalled();
    h.service.stopBackground(["/repo"]);
    expect(h.runs[0]!.runner.stop).toHaveBeenCalledOnce();
  });
});
