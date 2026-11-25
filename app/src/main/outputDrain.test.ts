import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { setImmediate as nextTurn } from "node:timers/promises";
import { afterEach, expect, it, vi } from "vitest";
import { openRunner } from "./conversation/runners";
import { ConversationService } from "./conversation/service";
import { ConversationStore } from "./conversation/store";
import { runClone, spawnClone } from "./onboarding/clone";

const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async original => ({ ...await original<typeof import("node:child_process")>(), spawn }));
const roots: string[] = [];
function temp() { const root = mkdtempSync(join(tmpdir(), "doan-output-drain-")); roots.push(root); return root; }
afterEach(() => {
  vi.restoreAllMocks(); vi.useRealTimers();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fakeChild() {
  const child = Object.assign(new EventEmitter(), {
    pid: 42, exitCode: null as number | null, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
  });
  let alive = true;
  const signals: (number | string)[] = [];
  vi.spyOn(process, "kill").mockImplementation((pid, signal = "SIGTERM") => {
    if (pid !== -child.pid) throw new Error("unexpected group");
    if (signal !== 0) signals.push(signal);
    if (!alive) throw Object.assign(new Error("gone"), { code: "ESRCH" });
    return true;
  });
  spawn.mockReturnValue(child);
  return {
    child, signals, gone: () => { alive = false; },
    exit(code: number) { child.exitCode = code; child.emit("exit", code, null); },
    line(value: unknown) { child.stdout.write(JSON.stringify(value) + "\n"); },
    close() { child.stdout.end(); child.stderr.end(); },
  };
}

async function accepted(runtime: "codex" | "cursor" | "antigravity", text = "hello") {
  const root = temp(), fake = fakeChild(), store = new ConversationStore(root);
  const release = vi.fn(async () => {});
  const service = new ConversationService(store, async () => ({
    command: "/fake", runtime, cwd: root, configDir: root, env: {}, release,
    ...(runtime !== "codex" ? { owner: { kind: "doan" as const, provider: runtime, profile: runtime, accountId: null, workspaceId: null, connectionId: "account" } } : {}),
  }), openRunner, () => {});
  let promptId: number | string | undefined;
  fake.child.stdin.on("data", (bytes: Buffer) => {
    const { id, method } = JSON.parse(bytes.toString());
    if (method === "initialize") fake.line({ jsonrpc: "2.0", id, result: { protocolVersion: 1 } });
    if (method === "session/new") fake.line({ jsonrpc: "2.0", id, result: { sessionId: "s" } });
    if (method === "thread/start") fake.line({ id, result: { thread: { id: "s" } } });
    if (method === "turn/start" || method === "thread/compact/start" || method === "session/prompt") promptId = id;
  });
  const { conversationId } = await service.start({ root, runtime, mode: "new", text, anchors: [] });
  await nextTurn();
  expect(promptId).toBeDefined();
  return { ...fake, promptId, release, service, conversationId, history: () => store.read(conversationId) };
}

it.each(["codex", "cursor"] as const)("records the last %s reply before releasing the accepted turn", async runtime => {
  const run = await accepted(runtime);
  run.gone(); run.exit(0);
  await nextTurn();
  run.child.stdin.destroy();
  run.child.stdin.emit("error", new Error("EPIPE"));
  if (runtime === "codex") {
    run.line({ id: run.promptId, result: { turn: { id: "native" } } });
    run.line({ id: 7, method: "item/tool/requestUserInput", params: { threadId: "s", turnId: "native" } });
    run.line({ method: "item/agentMessage/delta", params: { threadId: "s", turnId: "native", itemId: "m", delta: "last" } });
    run.line({ method: "turn/completed", params: { threadId: "s", turn: { id: "native", status: "completed" } } });
  } else {
    run.line({ jsonrpc: "2.0", id: 7, method: "cursor/ask_question", params: { sessionId: "s" } });
    run.line({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "s", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "last" } } } });
    run.line({ jsonrpc: "2.0", id: run.promptId, result: { stopReason: "end_turn" } });
  }
  run.close();
  await vi.waitFor(() => expect(run.release).toHaveBeenCalledOnce());
  expect(run.history()).toContainEqual(expect.objectContaining({ type: "message.delta", text: "last" }));
  expect(run.history().filter(e => e.type === "turn.failed" || e.type === "turn.done")).toEqual([expect.objectContaining({ type: "turn.done" })]);
});

it.each(["codex", "cursor"] as const)("keeps the %s provider's final refusal on an accepted turn", async runtime => {
  const run = await accepted(runtime);
  run.gone(); run.exit(1);
  await nextTurn();
  run.line({ jsonrpc: "2.0", id: run.promptId, error: { code: -32001, message: "Authentication required" } });
  run.close();
  await vi.waitFor(() => expect(run.release).toHaveBeenCalledOnce());
  expect(run.history().filter(e => e.type === "turn.failed")).toEqual([expect.objectContaining({ code: "not_logged_in" })]);
});

it.each(["codex", "cursor"] as const)("stops the %s group at leader exit and bounds a held pipe without releasing a live group", async runtime => {
  const run = await accepted(runtime);
  vi.useFakeTimers();
  run.exit(1);
  expect(run.signals).toContain("SIGTERM");
  await vi.advanceTimersByTimeAsync(499);
  expect(run.history().some(e => e.type === "turn.failed")).toBe(false);
  await vi.advanceTimersByTimeAsync(2);
  expect(run.history()).toContainEqual(expect.objectContaining({ type: "turn.failed", code: "process_exited" }));
  expect(run.release).not.toHaveBeenCalled();
  run.gone();
  await vi.advanceTimersByTimeAsync(100);
  expect(run.release).toHaveBeenCalledOnce();
  run.close();
});

it("expires an ACP question when its answer arrives after the leader exits", async () => {
  const run = await accepted("antigravity");
  run.line({ jsonrpc: "2.0", id: 7, method: "session/request_permission", params: {
    sessionId: "s", toolCall: { title: "Choose a color" }, options: ["Red", "Blue"].map(name => ({ name, optionId: name, kind: "allow_once" })),
  } });
  const request = run.history().find(e => e.type === "question.request")!;
  run.gone(); run.exit(0);
  try {
    expect(() => run.service.answerQuestion(run.conversationId, request.requestId, { outcome: "skipped" })).toThrow("stale");
  } finally {
    run.line({ jsonrpc: "2.0", id: run.promptId, result: { stopReason: "end_turn" } });
    run.close();
    await vi.waitFor(() => expect(run.release).toHaveBeenCalledOnce());
  }
  expect(run.history()).not.toContainEqual(expect.objectContaining({ type: "question.resolved", outcome: "skipped" }));
  expect(run.history()).toContainEqual(expect.objectContaining({ type: "turn.done" }));
});

it.each(["turn/start", "thread/compact/start"])("consumes the final %s replies across its start deadline", async method => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  const compact = method === "thread/compact/start";
  const run = await accepted("codex", compact ? "/compact" : "hello");
  if (compact) {
    run.line({ id: run.promptId, result: {} });
    await nextTurn();
  }
  await vi.advanceTimersByTimeAsync(9900);
  run.gone(); run.exit(0);
  await vi.advanceTimersByTimeAsync(150);
  if (compact) run.line({ method: "turn/started", params: { threadId: "s", turn: { id: "native" } } });
  else run.line({ id: run.promptId, result: { turn: { id: "native" } } });
  run.line({ method: "turn/completed", params: { threadId: "s", turn: { id: "native", status: "completed" } } });
  run.close();
  await nextTurn();
  expect(run.history().filter(e => e.type === "turn.done" || e.type === "turn.failed")).toEqual([expect.objectContaining({ type: "turn.done" })]);
});

it("reads a final ACP initialize error across the handshake deadline", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const run = fakeChild();
  const opening = openRunner({ runtime: "cursor", command: "/fake", cwd: "/tmp", configDir: "/tmp", env: {} }, () => {}, () => {}, () => {})
    .then(() => "opened", (error: Error) => error.message);
  await vi.advanceTimersByTimeAsync(59_900);
  run.gone(); run.exit(1);
  await vi.advanceTimersByTimeAsync(150);
  run.line({ jsonrpc: "2.0", id: 1, error: { code: -32001, message: "Authentication required" } });
  run.close();
  expect(await opening).toBe("not_logged_in");
});

it("classifies clone stderr delivered after git exits and stops the group before the pipe closes", async () => {
  const root = temp(), run = fakeChild();
  let spawned!: () => void;
  const started = new Promise<void>(resolve => { spawned = resolve; });
  const cloning = runClone({ git: "/fake", url: "local", destination: join(root, "project"), env: {}, signal: new AbortController().signal,
    spawn: (...args) => { const process = spawnClone(...args); spawned(); return process; } });
  await started;
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  run.exit(128);
  await nextTurn();
  expect(run.signals).toContain("SIGTERM");
  run.gone();
  // Group observation precedes the last stderr callback.
  await vi.advanceTimersByTimeAsync(100);
  await nextTurn();
  run.child.stderr.end("fatal: Repository not found\n");
  expect(await cloning).toEqual({ kind: "failed", code: "repository_unreachable" });
});

it("bounds inherited clone stderr from leader exit while a surviving group still holds ownership", async () => {
  vi.useFakeTimers();
  const run = fakeChild();
  const clone = spawnClone("/fake", [], {});
  const gone = vi.fn(); void clone.gone.then(gone);
  run.exit(1);
  await clone.exit; clone.stop();
  await vi.advanceTimersByTimeAsync(500);
  expect(run.child.stderr.destroyed).toBe(true);
  expect(gone).not.toHaveBeenCalled();
  run.gone();
  await vi.advanceTimersByTimeAsync(100);
  expect(gone).toHaveBeenCalledOnce();
});
