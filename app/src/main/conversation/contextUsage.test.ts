import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import claude from "./fixtures/claude.json";
import claudeContext from "./fixtures/claude-context.json";
import codexContext from "./fixtures/codex-context.json";
import acpContext from "./fixtures/acp-context.json";
import cursor from "./fixtures/acp-cursor.json";
import { endSteerWait, initialTransport, normalizeClaude, normalizeCodex, steerTransport } from "./transport";
import { acpEnded, acpPromptDone, acpPromptFailed, initialAcp, normalizeAcp, type AcpTransport } from "./acp";
import { ConversationStore } from "./store";
import type { EventPayload, TransportState } from "./types";

// How each transport reads a turn's context value and how the store keeps it. The fixtures are recorded provider
// frames (fixtures/README.md); variants below change one field of them.
const TERMINALS = ["turn.done", "turn.failed", "interrupted"];
// One terminal per turn, and at most one context.usage, right before it.
function expectShape(events: EventPayload[]) {
  expect(events.filter(e => TERMINALS.includes(e.type))).toHaveLength(1);
  const usage = events.filter(e => e.type === "context.usage");
  expect(usage.length).toBeLessThanOrEqual(1);
  if (usage.length) expect(events.findIndex(e => e.type === "context.usage")).toBe(events.length - 2);
}
const usageOf = (events: EventPayload[]) => events.filter(e => e.type === "context.usage");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("Claude context usage", () => {
  type Step = unknown | { steer: string };
  function run(frames: Step[], stop: "user" | "appQuit" | null = null) {
    let state: TransportState = { ...initialTransport(), stop };
    const events: EventPayload[] = [];
    for (const frame of frames) {
      if (frame && typeof frame === "object" && "steer" in frame) { state = steerTransport(state, String(frame.steer)); continue; }
      const next = normalizeClaude(state, frame, "/repo"); state = next.state; events.push(...next.events);
    }
    return { state, events };
  }
  const tool = () => clone(claudeContext.tool) as Record<string, any>[];
  it("records the last top-level call's input plus cache tokens against its model's window, right before the terminal", () => {
    const { events } = run(tool());
    expect(events.slice(-2)).toEqual([{ type: "context.usage", used: 2 + 4916 + 30853, size: 1_000_000 }, { type: "turn.done" }]);
    expectShape(events);
  });
  it("ignores a subagent's call, however large", () => {
    const frames = tool();
    frames.splice(3, 0, { ...frames[2], parent_tool_use_id: "tool-1", message: { ...frames[2]!.message, id: "sub", usage: { input_tokens: 900_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
    expect(usageOf(run(frames).events)).toEqual([{ type: "context.usage", used: 35771, size: 1_000_000 }]);
  });
  it("picks the window of the call's own model, not an auxiliary model's", () => {
    const frames = tool();
    frames[3]!.modelUsage["claude-haiku-5-5"].contextWindow = 200_000;
    frames[3]!.modelUsage["claude-sonnet-5-5"].contextWindow = 400_000;
    expect(usageOf(run(frames).events)).toEqual([{ type: "context.usage", used: 35771, size: 400_000 }]);
  });
  it.each([
    ["a model modelUsage does not name", (f: Record<string, any>[]) => { f[2]!.message.model = "claude-other"; }],
    ["no window for the model", (f: Record<string, any>[]) => { delete f[3]!.modelUsage["claude-sonnet-5-5"].contextWindow; }],
    ["no modelUsage", (f: Record<string, any>[]) => { delete f[3]!.modelUsage; }],
    ["a window of 0", (f: Record<string, any>[]) => { f[3]!.modelUsage["claude-sonnet-5-5"].contextWindow = 0; }],
    ["a fractional window", (f: Record<string, any>[]) => { f[3]!.modelUsage["claude-sonnet-5-5"].contextWindow = 1.5; }],
    ["no call usage at all", (f: Record<string, any>[]) => { delete f[0]!.message.usage; delete f[2]!.message.usage; }],
  ])("records nothing for %s", (_name, change) => {
    const frames = tool(); change(frames);
    const { events } = run(frames);
    expect(usageOf(events)).toEqual([]); expect(events.at(-1)).toEqual({ type: "turn.done" });
  });
  it.each([
    ["negative", { input_tokens: -1 }],
    ["fractional", { cache_read_input_tokens: 0.5 }],
    ["text", { input_tokens: "2" }],
  ])("drops a call whose usage is %s and keeps the call before it", (_name, usage) => {
    const frames = tool();
    frames[2]!.message.usage = { ...frames[2]!.message.usage, ...usage };
    expect(usageOf(run(frames).events)).toEqual([{ type: "context.usage", used: 4 + 7446 + 23407, size: 1_000_000 }]);
  });
  it("keeps the last model call over a later synthetic message (an API error's), whose model no window names", () => {
    const frames = tool();
    const synthetic = { ...frames[2], message: { ...frames[2]!.message, id: "msg-err", model: "<synthetic>", usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } };
    frames.splice(3, 0, synthetic);
    expect(usageOf(run(frames).events)).toEqual([{ type: "context.usage", used: 35771, size: 1_000_000 }]);
  });
  it("counts absent or null cache fields as none", () => {
    const frames = tool();
    frames[2]!.message.usage = { input_tokens: 120, cache_creation_input_tokens: null };
    expect(usageOf(run(frames).events)).toEqual([{ type: "context.usage", used: 120, size: 1_000_000 }]);
  });
  it("records nothing for a /compact turn, which has no top-level call", () => {
    const { events } = run(claudeContext.compact);
    expect(events).toEqual([{ type: "turn.done" }]);
  });
  it("records nothing for a turn whose frames carry no usage", () => {
    expect(usageOf(run(claude).events)).toEqual([]);
  });
  it("puts the value before a failed result's turn.failed and an aborted result's", () => {
    const frames = tool();
    const failed = run([...frames.slice(0, 3), { type: "result", subtype: "error_during_execution", is_error: true, errors: ["Unrecognized provider failure"], modelUsage: frames[3]!.modelUsage }]).events;
    expect(failed.slice(-2)).toEqual([{ type: "context.usage", used: 35771, size: 1_000_000 }, { type: "turn.failed", code: "unknown", detail: "Unrecognized provider failure" }]);
    const aborted = run([...frames.slice(0, 3), { type: "result", subtype: "error_during_execution", is_error: true, terminal_reason: "aborted_tools", errors: [], modelUsage: frames[3]!.modelUsage }]).events;
    expect(aborted.slice(-2)).toEqual([{ type: "context.usage", used: 35771, size: 1_000_000 }, { type: "turn.failed", code: "process_exited" }]);
    expectShape(failed); expectShape(aborted);
  });
  it.each(["user", "appQuit"] as const)("records nothing for a turn stopped by %s", stop => {
    const { events } = run(tool(), stop);
    expect(events.at(-1)).toEqual({ type: "interrupted", reason: stop }); expect(usageOf(events)).toEqual([]);
  });
  it("keeps what was emitted when frames come after the terminal (the suggestion's own call)", () => {
    const frames = tool();
    const after = { ...frames[2], message: { ...frames[2]!.message, id: "suggest", usage: { input_tokens: 500_000 } } };
    const { events } = run([...frames, after, { type: "prompt_suggestion", suggestion: "Next" }, frames[3]]);
    expect(usageOf(events)).toEqual([{ type: "context.usage", used: 35771, size: 1_000_000 }]); expectShape(events);
  });
  const STEERED = "008d3a33-94cc-41f0-ad00-4b370be622d2";
  it("records one value, the continued turn's last call, for a turn a steered message continued", () => {
    const frames = tool();
    const later = { ...frames[2], message: { ...frames[2]!.message, id: "msg-3", usage: { input_tokens: 3, cache_creation_input_tokens: 100, cache_read_input_tokens: 40_000 } } };
    const { events } = run([{ steer: STEERED }, ...frames.slice(0, 3), { ...frames[3], user_message_uuids: ["first"] },
      { type: "system", subtype: "init", user_message_uuids: [STEERED] }, later, { ...frames[3], user_message_uuids: [STEERED] }]);
    expect(usageOf(events)).toEqual([{ type: "context.usage", used: 40_103, size: 1_000_000 }]); expectShape(events);
  });
  it("records the value before the turn.done that ends an expired steer wait", () => {
    const frames = tool();
    const waiting = run([{ steer: STEERED }, ...frames.slice(0, 3), { ...frames[3], user_message_uuids: ["first"] }]);
    expect(waiting.events.filter(e => TERMINALS.includes(e.type) || e.type === "context.usage")).toEqual([]);
    expect(endSteerWait(waiting.state).events).toEqual([{ type: "context.usage", used: 35771, size: 1_000_000 }, { type: "turn.done" }]);
  });
});

describe("Codex context usage", () => {
  const frames = codexContext.turns as Record<string, any>[];
  function run(list: unknown[], turnId: string, stop: "user" | null = null, sessionId = "session-1") {
    let state: TransportState = { ...initialTransport(), stop };
    const events: EventPayload[] = [];
    for (const raw of list) { const next = normalizeCodex(state, raw, { root: "/repo", sessionId, turnId }); state = next.state; events.push(...next.events); }
    return events;
  }
  const turnB = () => clone(frames.slice(4)) as Record<string, any>[];
  it("records the last call's inputTokens (cache included) against modelContextWindow before turn/completed", () => {
    const events = run(frames.slice(0, 4), "turn-a");
    expect(events).toEqual([{ type: "context.usage", used: 14832, size: 258400 }, { type: "turn.done" }]);
  });
  it("keeps only the last of several notifications in a turn, never totalTokens", () => {
    expect(run(turnB(), "turn-b")).toEqual([{ type: "context.usage", used: 17109, size: 258400 }, { type: "turn.done" }]);
  });
  it("drops the previous turn's notification a resumed thread replays before the new turn starts", () => {
    expect(run(codexContext.resume, "turn-c")).toEqual([{ type: "context.usage", used: 31087, size: 258400 }, { type: "turn.done" }]);
    // Before turn/start answers, the turn is known only by its local id.
    expect(run(codexContext.resume.slice(0, 1), "local-turn")).toEqual([]);
  });
  it("ignores another thread's or another turn's notification", () => {
    const list = turnB();
    const other = { ...list[2], params: { ...list[2]!.params, turnId: "turn-a", tokenUsage: { ...list[2]!.params.tokenUsage, last: { ...list[2]!.params.tokenUsage.last, inputTokens: 1 } } } };
    const thread = { ...list[2], params: { ...list[2]!.params, threadId: "session-2", tokenUsage: { ...list[2]!.params.tokenUsage, last: { ...list[2]!.params.tokenUsage.last, inputTokens: 2 } } } };
    expect(run([...list.slice(0, 4), other, thread, list[4]], "turn-b")).toEqual([{ type: "context.usage", used: 17109, size: 258400 }, { type: "turn.done" }]);
  });
  it.each([
    ["a null window", (u: Record<string, any>) => { u.modelContextWindow = null; }],
    ["a window of 0", (u: Record<string, any>) => { u.modelContextWindow = 0; }],
    ["negative input", (u: Record<string, any>) => { u.last.inputTokens = -5; }],
    ["fractional input", (u: Record<string, any>) => { u.last.inputTokens = 10.5; }],
    ["no last", (u: Record<string, any>) => { delete u.last; }],
  ])("records nothing for %s, and keeps an earlier valid value of the turn", (_name, change) => {
    const alone = clone(frames.slice(0, 4)) as Record<string, any>[];
    change(alone[2]!.params.tokenUsage);
    expect(run(alone, "turn-a")).toEqual([{ type: "turn.done" }]);
    const list = turnB(); change(list[3]!.params.tokenUsage);
    expect(run(list, "turn-b")).toEqual([{ type: "context.usage", used: 17020, size: 258400 }, { type: "turn.done" }]);
  });
  it("puts the value before an error notification's turn.failed, and not on a retried error", () => {
    const list = turnB();
    const retried = { method: "error", params: { threadId: "session-1", turnId: "turn-b", willRetry: true, error: { message: "Reconnecting" } } };
    const error = { method: "error", params: { threadId: "session-1", turnId: "turn-b", willRetry: false, error: { message: "Unrecognized provider failure" } } };
    const events = run([...list.slice(0, 3), retried, error, list[4]], "turn-b");
    expect(events).toEqual([{ type: "context.usage", used: 17020, size: 258400 }, { type: "turn.failed", code: "unknown", detail: "Unrecognized provider failure" }]);
  });
  it("records nothing for a stopped turn", () => {
    expect(run(turnB(), "turn-b", "user")).toEqual([{ type: "interrupted", reason: "user" }]);
  });
});

describe("ACP context usage", () => {
  function run(frames: Record<string, any>[], stop: "user" | null = null, end: (s: AcpTransport) => { state: AcpTransport; events: EventPayload[] } = s => acpPromptDone(s, frames.at(-1)!.result)) {
    let state: AcpTransport = { ...initialAcp("turn-1"), stop };
    const events: EventPayload[] = [];
    for (const frame of frames) {
      if (frame.method !== "session/update") continue;
      const next = normalizeAcp(state, frame.params.update, "/repo"); state = next.state; events.push(...next.events);
    }
    const ended = end(state); events.push(...ended.events);
    return { state: ended.state, events };
  }
  it.each([
    ["Copilot", acpContext.copilot, 14425, 272000],
    ["Copilot, the last of a tool turn's updates", acpContext.copilotTool, 15162, 272000],
    ["Copilot after session/load", acpContext.copilotLoaded, 13235, 272000],
    ["Antigravity, the last of a turn's updates", acpContext.antigravity, 13265, 1048576],
    ["Antigravity after session/load", acpContext.antigravityLoaded, 13660, 1048576],
  ])("records %s usage_update before turn.done", (_name, frames, used, size) => {
    expect(run(frames as Record<string, any>[]).events).toEqual([{ type: "context.usage", used, size }, { type: "turn.done" }]);
  });
  it("records nothing for Cursor's recorded turn, which sends no usage_update", () => {
    const { events } = run(cursor.turn as Record<string, any>[]);
    expect(usageOf(events)).toEqual([]); expect(events.at(-1)).toEqual({ type: "turn.done" }); expectShape(events);
  });
  it("puts the value after the pending message and before the terminal", () => {
    const chunk = { method: "session/update", params: { sessionId: "session-1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "OK" } } } };
    const frames = [...acpContext.copilot.slice(0, 1), chunk, ...acpContext.copilot.slice(1)] as Record<string, any>[];
    expect(run(frames).events).toEqual([
      { type: "message.delta", messageId: "turn-1:0", text: "OK" }, { type: "message.done", messageId: "turn-1:0", text: "OK" },
      { type: "context.usage", used: 14425, size: 272000 }, { type: "turn.done" }]);
  });
  it("puts the value before a failed prompt's turn.failed and an ended server's", () => {
    const frames = acpContext.copilot as Record<string, any>[];
    expect(run(frames, null, s => acpPromptFailed(s, "Rate limit exceeded")).events).toEqual([{ type: "context.usage", used: 14425, size: 272000 }, { type: "turn.failed", code: "rate_limited", detail: "Rate limit exceeded" }]);
    expect(run(frames, null, acpEnded).events).toEqual([{ type: "context.usage", used: 14425, size: 272000 }, { type: "turn.failed", code: "process_exited" }]);
  });
  it("records nothing for a cancelled prompt or a stopped turn", () => {
    const frames = acpContext.copilot as Record<string, any>[];
    expect(run(frames, null, s => acpPromptDone(s, { stopReason: "cancelled" })).events).toEqual([{ type: "interrupted", reason: "user" }]);
    expect(run(frames, "user").events).toEqual([{ type: "interrupted", reason: "user" }]);
  });
  it.each([
    ["negative used", { used: -1 }], ["fractional used", { used: 1.5 }], ["size 0", { size: 0 }], ["no size", { size: undefined }], ["text used", { used: "10" }],
  ])("drops an update with %s and keeps the turn's earlier value", (_name, change) => {
    const frames = clone(acpContext.copilotTool) as Record<string, any>[];
    frames[2]!.params.update = { ...frames[2]!.params.update, ...change };
    expect(usageOf(run(frames).events)).toEqual([{ type: "context.usage", used: 15089, size: 272000 }]);
  });
  it("ignores an update after the terminal", () => {
    const { state, events } = run(acpContext.copilot as Record<string, any>[]);
    expect(normalizeAcp(state, { sessionUpdate: "usage_update", used: 1, size: 2 }, "/repo").events).toEqual([]);
    expect(acpEnded(state).events).toEqual([]); expectShape(events);
  });
});

describe("context.usage history lines", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
  function setup() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-context-store-"))); roots.push(root);
    return { store: new ConversationStore(root), log: join(root, "conversations", "c.jsonl") };
  }
  const line = (seq: number, body: Record<string, unknown>) => JSON.stringify({ v: 1, conversationId: "c", seq, turnId: "t", at: "2026-11-06T00:00:00.000Z", ...body }) + "\n";
  it("reads and appends a valid line", () => {
    const { store, log } = setup();
    store.append("c", "t", { type: "turn.started" });
    writeFileSync(log, line(1, { type: "turn.started" }) + line(2, { type: "context.usage", used: 0, size: 1 }));
    expect(store.read("c").map(e => e.type)).toEqual(["turn.started", "context.usage"]);
    expect(store.append("c", "t", { type: "context.usage", used: 84_000, size: 200_000 })).toMatchObject({ seq: 3, type: "context.usage", used: 84_000, size: 200_000 });
    expect(store.append("c", "t", { type: "turn.done" }).seq).toBe(4);
  });
  it.each([
    ["negative used", { used: -1, size: 10 }], ["fractional used", { used: 1.5, size: 10 }], ["size 0", { used: 0, size: 0 }],
    ["fractional size", { used: 1, size: 2.5 }], ["no used", { size: 10 }], ["no size", { used: 1 }], ["text size", { used: 1, size: "10" }],
    ["an unsafe integer", { used: 2 ** 53, size: 2 ** 53 + 2 }],
  ])("reads a line with %s as corrupt and refuses to append it", (_name, body) => {
    const { store, log } = setup();
    store.append("c", "t", { type: "turn.started" });
    expect(() => store.append("c", "t", { type: "context.usage", ...body } as EventPayload)).toThrow("Invalid conversation event");
    writeFileSync(log, line(1, { type: "turn.started" }) + line(2, { type: "context.usage", ...body }));
    expect(() => store.read("c")).toThrow("Invalid conversation event");
  });
});
