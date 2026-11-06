import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationService, type OpenRunner, type Prepare, type Prepared, type Runner } from "./service";
import { ConversationStore } from "./store";
import type { EventPayload, StageSignal, TurnStage } from "./types";

// turn-activity C1: the service keeps each live turn's last stage and sends it beside the events, never into the history.
const dirs: string[] = []; afterEach(() => { dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });
const THINKING: TurnStage = { kind: "thinking" }, GENERAL: TurnStage = { kind: "general" };
const READ: TurnStage = { kind: "tool", activity: "read", path: "src/a.ts", summary: "src/a.ts" };
interface Opened { input: Prepared; emit(event: EventPayload): void; exited(): void; runner: Runner }
function fixture(runtime: "claude" | "codex" = "claude") {
  const dir = mkdtempSync(join(tmpdir(), "doan-stage-")); dirs.push(dir);
  const store = new ConversationStore(dir), opened: Opened[] = [], signals: StageSignal[] = [], listChanged = vi.fn();
  const open = vi.fn<OpenRunner>(async (input, emit, exited) => {
    const runner: Runner = { sessionId: input.sessionId ?? `new-${opened.length}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    opened.push({ input, emit, exited, runner }); return runner;
  });
  const prepare = vi.fn<Prepare>(async () => ({ runtime, configDir: "/profile", cwd: "/repo", sessionId: "session", command: "/fake", env: {} }));
  const service = new ConversationService(store, prepare, open, () => {}, undefined, undefined, undefined, listChanged, undefined, undefined, undefined, undefined, signal => signals.push(signal));
  const last = () => opened.at(-1)!;
  return { service, store, opened, signals, listChanged, prepare, last, stage: (stage: TurnStage) => last().input.stage!(stage), history: (id: string) => readFileSync(join(dir, "conversations", `${id}.jsonl`), "utf8") };
}
const request = { root: "/repo", mode: "resume" as const, canvas: { path: ".doan/canvases/a.html" }, text: "hello", anchors: [] };

it("sends a running turn's stage with the turn, the last written seq and a rising rev, and keeps it for a read", async () => {
  const h = fixture(); const { conversationId: id } = await h.service.start(request);
  const turnId = h.store.read(id).at(-1)!.turnId;
  h.stage(THINKING);
  h.last().emit({ type: "activity", kind: "command", summary: "Running a command" });
  h.stage(GENERAL);
  expect(h.signals).toEqual([
    { conversationId: id, turnId, seq: 2, rev: 1, stage: THINKING },
    { conversationId: id, turnId, seq: 3, rev: 2, stage: GENERAL },
  ]);
  expect(h.service.read(id).stage).toEqual({ conversationId: id, turnId, seq: 3, rev: 2, stage: GENERAL });
});

it("sends the same stage once while no event comes, and again with the new seq after one", async () => {
  const h = fixture(); const { conversationId: id } = await h.service.start(request);
  for (let i = 0; i < 83; i++) h.stage(THINKING);
  h.stage({ ...READ }); h.stage({ ...READ });
  h.last().emit({ type: "message.delta", messageId: "m", text: "a" });
  h.stage(THINKING); h.stage(THINKING);
  expect(h.signals.map(s => [s.stage.kind, s.seq, s.rev])).toEqual([["thinking", 2, 1], ["tool", 2, 2], ["thinking", 3, 3]]);
  // A different tool at the same seq is a new stage.
  h.stage({ ...READ, path: "src/b.ts", summary: "src/b.ts" });
  expect(h.signals).toHaveLength(4);
});

it("sends nothing once the turn ended, for each terminal", async () => {
  for (const terminal of [{ type: "turn.done" }, { type: "turn.failed", code: "unknown" }, { type: "interrupted", reason: "user" }] as EventPayload[]) {
    const h = fixture(); const { conversationId: id } = await h.service.start(request);
    h.stage(THINKING); h.last().emit(terminal); h.stage(GENERAL); h.stage(READ);
    expect(h.signals.map(s => s.stage)).toEqual([THINKING]);
    expect(h.service.read(id)).not.toHaveProperty("stage");
  }
});

it("sends nothing before the turn is accepted", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-stage-")); dirs.push(dir);
  const opened: Prepared[] = [], signals: StageSignal[] = []; let hold!: () => void;
  const service = new ConversationService(new ConversationStore(dir), async () => ({ runtime: "claude", configDir: "/profile", cwd: "/repo", sessionId: "session", command: "/fake", env: {} }), async input => {
    opened.push(input); await new Promise<void>(resolve => { hold = resolve; });
    return { sessionId: "session", send: async () => {}, answer: () => false, stop: async () => {}, close: async () => {} };
  }, () => {}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, signal => signals.push(signal));
  const starting = service.start(request);
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  opened[0]!.stage!(THINKING);
  hold(); await starting;
  expect(signals).toEqual([]);
});

it("drops the stage on Stop, whose provider still sends frames until its own result", async () => {
  const h = fixture(); const { conversationId: id } = await h.service.start(request);
  h.stage(THINKING);
  await h.service.interrupt(id);
  h.stage(READ); h.stage(GENERAL);
  expect(h.signals.map(s => s.stage)).toEqual([THINKING]);
  expect(h.service.read(id)).not.toHaveProperty("stage");
});

it("drops the stage when the process dies while thinking, and takes no late one", async () => {
  const h = fixture(); const { conversationId: id } = await h.service.start(request);
  h.stage(THINKING); h.last().exited(); h.stage(GENERAL);
  expect(h.store.read(id).at(-1)).toMatchObject({ type: "turn.failed", code: "process_exited" });
  expect(h.signals.map(s => s.stage)).toEqual([THINKING]);
  expect(h.service.read(id)).not.toHaveProperty("stage");
});

it("has no stage in the read after an archive, a deletion, a sign-out's stop or the quit", async () => {
  const archive = fixture(); const first = (await archive.service.start(request)).conversationId; archive.stage(THINKING);
  // A new conversation for the same canvas archives the running one.
  archive.prepare.mockResolvedValueOnce({ runtime: "claude", configDir: "/profile", cwd: "/repo", command: "/fake", env: {} });
  await archive.service.start({ ...request, mode: "new" as const, runtime: "claude" as const });
  archive.opened[0]!.input.stage!(GENERAL);
  expect(archive.service.read(first)).not.toHaveProperty("stage");
  expect(archive.signals.filter(s => s.conversationId === first).map(s => s.stage)).toEqual([THINKING]);

  const deletion = fixture(); const id = (await deletion.service.start(request)).conversationId; deletion.stage(THINKING);
  deletion.last().emit({ type: "turn.done" }); deletion.service.delete(id); deletion.stage(GENERAL);
  expect(() => deletion.service.read(id)).toThrow("not_found");
  expect(deletion.signals.map(s => s.stage)).toEqual([THINKING]);

  // A doan-account run, which a sign-out stops.
  const stopped = fixture();
  stopped.prepare.mockResolvedValue({ runtime: "claude", configDir: "/profile", cwd: "/repo", sessionId: "session", command: "/fake", env: {}, owner: { kind: "doan", provider: "claude", connectionId: "c1", accountId: "a1", workspaceId: "org", profile: "claude" } });
  const owned = (await stopped.service.start(request)).conversationId; stopped.stage(THINKING);
  await stopped.service.stopRuns("claude"); stopped.stage(GENERAL);
  expect(stopped.store.read(owned).at(-1)).toMatchObject({ type: "interrupted", reason: "user" });
  expect(stopped.signals.map(s => s.stage)).toEqual([THINKING]);
  expect(stopped.service.read(owned)).not.toHaveProperty("stage");

  const quit = fixture(); const running = (await quit.service.start(request)).conversationId; quit.stage(THINKING);
  await quit.service.quit(); quit.stage(GENERAL);
  expect(quit.service.read(running)).not.toHaveProperty("stage");
  expect(quit.signals.map(s => s.stage)).toEqual([THINKING]);
});

it("sends a finished turn's late stage to no later turn of the conversation", async () => {
  const h = fixture(); const { conversationId: id } = await h.service.start(request);
  const first = h.last();
  first.emit({ type: "turn.done" }); first.exited();
  await h.service.send(id, "again", []);
  expect(h.opened).toHaveLength(2);
  first.input.stage!(THINKING);
  expect(h.signals).toEqual([]);
  h.stage(GENERAL);
  expect(h.signals).toEqual([{ conversationId: id, turnId: h.store.read(id).at(-1)!.turnId, seq: 5, rev: 1, stage: GENERAL }]);
});

it("names the new turn on a reused Codex server's next turn and keeps the earlier turn's stage out of its read", async () => {
  const h = fixture("codex"); const { conversationId: id } = await h.service.start(request);
  h.stage(READ); h.last().emit({ type: "turn.done" });
  await h.service.send(id, "again", []);
  expect(h.opened).toHaveLength(1);
  expect(h.service.read(id)).not.toHaveProperty("stage");
  h.stage(THINKING);
  const [first, second] = h.signals;
  expect(second!.turnId).toBe(h.store.read(id).at(-1)!.turnId);
  expect(second!.turnId).not.toBe(first!.turnId);
  expect(second!.rev).toBeGreaterThan(first!.rev);
});

it("writes no stage into the history and changes neither the list nor its unseen", async () => {
  const h = fixture(); const { conversationId: id } = await h.service.start(request);
  const before = h.service.list("/repo"), calls = h.listChanged.mock.calls.length, history = h.history(id);
  h.stage(THINKING); h.stage(READ); h.stage(GENERAL);
  expect(h.signals).toHaveLength(3);
  expect(h.history(id)).toBe(history);
  expect(h.service.list("/repo")).toEqual(before);
  expect(h.listChanged.mock.calls.length).toBe(calls);
});

it("drops the stage when the history stops taking writes, and takes no later one", async () => {
  const h = fixture(); const { conversationId: id } = await h.service.start(request);
  h.stage(THINKING);
  vi.spyOn(h.store, "append").mockImplementationOnce(() => { throw new Error("File exceeds limit"); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.last().emit({ type: "activity", kind: "command", summary: "Running a command" });
  h.stage(GENERAL); h.stage(READ);
  expect(h.signals.map(s => s.stage)).toEqual([THINKING]);
  expect(h.service.read(id)).not.toHaveProperty("stage");
});

it("gives a queued message's turn, started right after the terminal, none of the previous turn's stage", async () => {
  for (const runtime of ["codex", "claude"] as const) {
    const h = fixture(runtime); const { conversationId: id } = await h.service.start(request);
    const firstTurn = h.store.read(id).at(-1)!.turnId, before = h.last();
    h.service.queue(id, { text: "next", anchors: [] });
    h.stage(READ);
    before.emit({ type: "turn.done" });
    // The previous turn's frame in the same tick as its terminal, before the queue goes out.
    before.input.stage!(GENERAL);
    // A Claude turn's queue waits for its process; a reused Codex server takes it at once.
    if (runtime === "claude") before.exited();
    await vi.waitFor(() => expect(h.store.read(id).filter(e => e.type === "turn.started")).toHaveLength(2));
    const nextTurn = h.store.read(id).at(-1)!.turnId;
    expect(nextTurn).not.toBe(firstTurn);
    expect(h.service.read(id)).not.toHaveProperty("stage");
    // Claude's earlier run is not the turn's run any more; its late stage stays out.
    if (runtime === "claude") { before.input.stage!(THINKING); expect(h.service.read(id)).not.toHaveProperty("stage"); }
    h.stage(THINKING);
    expect(h.signals.map(s => [s.turnId === firstTurn ? "first" : s.turnId === nextTurn ? "next" : "other", s.stage.kind])).toEqual([["first", "tool"], ["next", "thinking"]]);
    expect(h.service.read(id).stage).toMatchObject({ turnId: nextTurn, stage: THINKING });
  }
});

it("sends the stage after a steered message with that message's seq and the same turn", async () => {
  const h = fixture(); const { conversationId: id } = await h.service.start(request);
  const turnId = h.store.read(id).at(-1)!.turnId, runner = h.last().runner;
  let steered = "";
  runner.steer = vi.fn(async (_prompt: string, _turn: string, messageId: string) => { steered = messageId; });
  const item = h.service.queue(id, { text: "also this", anchors: [] });
  h.stage(THINKING);
  const sent = h.service.sendNow(id, item.itemId);
  await vi.waitFor(() => expect(steered).not.toBe(""));
  h.last().input.steerConsumed!(steered); await sent;
  const message = h.store.read(id).at(-1)!;
  expect(message).toMatchObject({ type: "user.message", text: "also this", turnId });
  h.stage(THINKING);
  expect(h.signals.map(s => [s.turnId, s.seq, s.stage.kind])).toEqual([[turnId, 2, "thinking"], [turnId, message.seq, "thinking"]]);
  expect(h.service.read(id).stage).toMatchObject({ turnId, seq: message.seq });
});
