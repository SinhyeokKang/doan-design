import { describe, expect, it } from "vitest";
import claudeThinking from "./fixtures/claude-thinking.json";
import claudeFixture from "./fixtures/claude.json";
import claudeContext from "./fixtures/claude-context.json";
import askFixture from "./fixtures/claude-ask-user-question.json";
import codexRead from "./fixtures/codex-read.json";
import codexFixture from "./fixtures/codex.json";
import codexHome from "./fixtures/codex-home.json";
import copilotThought from "./fixtures/acp-copilot-thought.json";
import copilotFixture from "./fixtures/acp-copilot.json";
import copilotParallel from "./fixtures/acp-copilot-parallel.json";
import cursorFixture from "./fixtures/acp-cursor.json";
import { GENERIC_SUMMARY, initialTransport, normalizeClaude, normalizeCodex, type CodexContext } from "./transport";
import { acpPromptDone, initialAcp, normalizeAcp, type AcpTransport } from "./acp";
import type { EventPayload, TransportState, TurnStage } from "./types";

// The stage each normalizer reports beside its events. The stage goes out after
// the frame's events, so each step keeps the two together in frame order.
interface Step { events: EventPayload[]; stage?: TurnStage }
const TERMINALS = ["turn.done", "turn.failed", "interrupted"];
const GENERAL: TurnStage = { kind: "general" };
const THINKING: TurnStage = { kind: "thinking" };
const COMMAND: TurnStage = { kind: "tool", activity: "command", summary: GENERIC_SUMMARY.command };
const stagesOf = (steps: Step[]) => steps.flatMap(step => step.stage ? [step.stage] : []);
const eventsOf = (steps: Step[]) => steps.flatMap(step => step.events);
// The stages with each repeat folded, as main sends them (C1 drops a stage equal to the last one).
const folded = (stages: TurnStage[]) => stages.filter((stage, i) => i === 0 || JSON.stringify(stage) !== JSON.stringify(stages[i - 1]));
// After the turn's terminal, no step reports a stage.
function expectNoStageAfterTerminal(steps: Step[]) {
  const end = steps.findIndex(step => step.events.some(e => TERMINALS.includes(e.type)));
  expect(end).toBeGreaterThanOrEqual(0);
  expect(steps.slice(end).filter(step => step.stage)).toEqual([]);
  expect(eventsOf(steps).filter(e => TERMINALS.includes(e.type))).toHaveLength(1);
}

function claudeSteps(frames: readonly unknown[], state: TransportState = initialTransport()) {
  const steps: Step[] = [];
  for (const frame of frames) { const result = normalizeClaude(state, frame, "/repo"); state = result.state; steps.push({ events: result.events, ...(result.stage ? { stage: result.stage } : {}) }); }
  return { steps, state };
}
const CODEX: CodexContext = { root: "/repo", sessionId: "session-1", turnId: "turn-1" };
function codexSteps(frames: readonly unknown[], state: TransportState = initialTransport(), context: CodexContext = CODEX) {
  const steps: Step[] = [];
  for (const frame of frames) { const result = normalizeCodex(state, frame, context); state = result.state; steps.push({ events: result.events, ...(result.stage ? { stage: result.stage } : {}) }); }
  return { steps, state };
}
// ACP turns: session/update notifications and the session/prompt result; client requests are left to the runner.
function acpSteps(frames: readonly Record<string, any>[], state: AcpTransport = initialAcp("turn-1")) {
  const steps: Step[] = [];
  for (const frame of frames) {
    if (frame.method && frame.method !== "session/update") continue;
    const result = frame.method ? normalizeAcp(state, frame.params.update, "/repo") : acpPromptDone(state, frame.result);
    state = result.state; steps.push({ events: result.events, ...(result.stage ? { stage: result.stage } : {}) });
  }
  return { steps, state };
}
const update = (u: Record<string, unknown>) => ({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "s", update: u } });
const thought = update({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "…" } });

describe("Claude stages", () => {
  it("reports thinking from a thinking block's start to its stop, and general on a request and a tool result", () => {
    const { steps } = claudeSteps(claudeThinking.thinking);
    expect(stagesOf(steps)).toEqual([
      GENERAL, // system/status requesting after the prompt
      THINKING, GENERAL, // the first thinking block
      GENERAL, GENERAL, // the Bash result, then requesting
      THINKING, GENERAL,
      GENERAL, GENERAL,
      THINKING, GENERAL, // the thinking before the reply
    ]);
    expectNoStageAfterTerminal(steps);
  });
  it("ends thinking on the thinking block's own stop, and reports nothing on the tool block's stop", () => {
    const frames = claudeThinking.thinking as Record<string, any>[], { steps } = claudeSteps(frames);
    const stop = (index: number) => frames.findIndex(f => f.type === "stream_event" && f.event.type === "content_block_stop" && f.event.index === index);
    expect(steps[stop(0)]!.stage).toEqual(GENERAL);
    // The tool block's stop comes after the activity, which already tells the tool.
    expect(steps.findIndex(step => step.events.some(e => e.type === "activity"))).toBeLessThan(stop(1));
    expect(steps[stop(1)]!.stage).toBeUndefined();
  });
  it("never reports a tool stage: the activity event says it", () => {
    const fixtures = [claudeThinking.thinking, claudeThinking.task, claudeFixture, claudeContext.tool, claudeContext.compact, [askFixture.toolUse]];
    for (const frames of fixtures) expect(stagesOf(claudeSteps(frames).steps).filter(stage => stage.kind === "tool")).toEqual([]);
  });
  it("reports nothing for a subagent's frames, nor after the Agent activity until the top-level tool result", () => {
    const frames = claudeThinking.task as Record<string, any>[], { steps } = claudeSteps(frames);
    const nested = frames.flatMap((frame, i) => frame.parent_tool_use_id ? [i] : []);
    expect(nested.length).toBeGreaterThan(0);
    for (const i of nested) expect(steps[i]).toEqual({ events: [] });
    // While the subagent runs the Agent activity is the newest event, so the indicator is in the tool state that event gives: no
    // general follows it, not even at the Agent tool block's stop, until the Agent's own tool result.
    const agent = steps.findIndex(step => step.events.some(e => e.type === "activity"));
    const result = frames.findIndex(f => f.type === "user" && !f.parent_tool_use_id && f.message.content.some((c: { type: string }) => c.type === "tool_result"));
    const toolStop = frames.findIndex((f, i) => i > agent && f.type === "stream_event" && f.event.type === "content_block_stop");
    expect(agent).toBeGreaterThanOrEqual(0);
    expect(toolStop).toBeGreaterThan(agent);
    expect(toolStop).toBeLessThan(result);
    expect(steps[toolStop]).toEqual({ events: [] });
    expect(steps.slice(agent + 1, result).filter(step => step.stage)).toEqual([]);
    expect(steps[result]!.stage).toEqual(GENERAL);
    // requesting before the call, the Agent result, requesting after it; the system/task_* frames report nothing.
    expect(stagesOf(steps)).toEqual([GENERAL, GENERAL, GENERAL]);
    expectNoStageAfterTerminal(steps);
  });
  it("ignores a nested thinking block and a nested tool result", () => {
    const nested = [
      { type: "stream_event", parent_tool_use_id: "tool-1", event: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } } },
      { type: "stream_event", parent_tool_use_id: "tool-1", event: { type: "content_block_stop", index: 0 } },
      { type: "user", parent_tool_use_id: "tool-1", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tool-2", content: "x" }] } },
      { type: "system", subtype: "status", status: "requesting", parent_tool_use_id: "tool-1" },
    ];
    expect(stagesOf(claudeSteps(nested).steps)).toEqual([]);
  });
  it("reports nothing for a user frame that is no tool result, another status, or a text or tool block's stop", () => {
    const frames = [
      { type: "user", parent_tool_use_id: null, message: { role: "user", content: [{ type: "text", text: "a steered message" }] } },
      { type: "system", subtype: "status", status: null },
      { type: "system", subtype: "status", status: "compacting" },
      { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
      { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_stop", index: 0 } },
      { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "t", name: "Read", input: {} } } },
      { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_stop", index: 1 } },
      { type: "system", subtype: "thinking_tokens", estimated_tokens: 5, estimated_tokens_delta: 5 },
    ];
    expect(stagesOf(claudeSteps(frames).steps)).toEqual([]);
  });
  it("reports nothing after the terminal, nor on the terminal's own frame", () => {
    const { state } = claudeSteps(claudeThinking.thinking);
    expect(state.terminal).toBe(true);
    const late = claudeThinking.thinking.filter(frame => (frame as { type: string }).type !== "result");
    expect(stagesOf(claudeSteps(late, state).steps)).toEqual([]);
  });
  it("keeps a Doan connector tool's input out of every stage", () => {
    const frames = [
      { type: "system", subtype: "status", status: "requesting" },
      { type: "assistant", parent_tool_use_id: null, message: { id: "m", content: [{ type: "tool_use", id: "t", name: "mcp__doan-notion__search", input: { query: "SECRET-QUERY" } }] } },
      { type: "user", parent_tool_use_id: null, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "SECRET-RESULT" }] } },
    ];
    const stages = stagesOf(claudeSteps(frames).steps);
    expect(stages).toEqual([GENERAL, GENERAL]);
    expect(JSON.stringify(stages)).not.toMatch(/SECRET/);
  });
});

describe("Codex stages", () => {
  it("reports a read stage for a single read or listFiles action and general when that item completes", () => {
    const { steps } = codexSteps(codexRead.read);
    expect(stagesOf(steps)).toEqual([
      { kind: "tool", activity: "read", summary: GENERIC_SUMMARY.read }, // listFiles with a null path
      GENERAL,
      { kind: "tool", activity: "read", path: "/repo/notes.txt", summary: "notes.txt" },
      GENERAL,
    ]);
    // The stage goes out with its item's activity event, which stays a command.
    const started = steps.filter(step => step.stage?.kind === "tool");
    for (const step of started) expect(step.events).toEqual([{ type: "activity", kind: "command", summary: GENERIC_SUMMARY.command }]);
    expectNoStageAfterTerminal(steps);
  });
  it("reports nothing for a command whose commandActions hold several actions, nor for reasoning items", () => {
    const { steps } = codexSteps(codexRead.search);
    expect(stagesOf(steps)).toEqual([]);
    expectNoStageAfterTerminal(steps);
  });
  function command(actions: unknown, method = "item/started", over: Record<string, unknown> = {}) {
    return { method, params: { threadId: "session-1", turnId: "turn-1", item: { type: "commandExecution", id: "c", command: "/bin/zsh -c \"COMMAND_TEXT\"", cwd: "/repo", status: "inProgress", ...(actions === undefined ? {} : { commandActions: actions }) } }, ...over };
  }
  it("reports a read stage for a single search or listFiles action without its folder path", () => {
    const search = [{ type: "search", command: "COMMAND_TEXT", query: "lantern", path: "." }];
    const { steps } = codexSteps([command(search), command(search, "item/completed")]);
    expect(stagesOf(steps)).toEqual([{ kind: "tool", activity: "read", summary: GENERIC_SUMMARY.read }, GENERAL]);
    expect(stagesOf(codexSteps([command([{ type: "listFiles", command: "COMMAND_TEXT", path: "src" }])]).steps)).toEqual([{ kind: "tool", activity: "read", summary: GENERIC_SUMMARY.read }]);
    expect(eventsOf(steps)).toEqual([{ type: "activity", kind: "command", summary: GENERIC_SUMMARY.command }]);
  });
  it("shows a read path outside the root as written, and inside it relative", () => {
    expect(stagesOf(codexSteps([command([{ type: "read", command: "COMMAND_TEXT", name: "a", path: "/elsewhere/a.txt" }])]).steps)).toEqual([{ kind: "tool", activity: "read", path: "/elsewhere/a.txt", summary: "/elsewhere/a.txt" }]);
    expect(stagesOf(codexSteps([command([{ type: "read", command: "COMMAND_TEXT", name: "a", path: "src/a.ts" }])]).steps)).toEqual([{ kind: "tool", activity: "read", path: "src/a.ts", summary: "src/a.ts" }]);
    // A file named like the generic phrase keeps its path, which is what the renderer goes by (review RU-R2).
    expect(stagesOf(codexSteps([command([{ type: "read", command: "COMMAND_TEXT", name: "Reading files", path: "Reading files" }])]).steps)).toEqual([{ kind: "tool", activity: "read", path: "Reading files", summary: "Reading files" }]);
  });
  it.each([
    ["an unknown action", [{ type: "unknown", command: "COMMAND_TEXT" }]],
    ["no action", []],
    ["no commandActions", undefined],
    ["two read actions", [{ type: "read", command: "COMMAND_TEXT", name: "a", path: "/repo/a" }, { type: "read", command: "COMMAND_TEXT", name: "b", path: "/repo/b" }]],
    ["a read with no path", [{ type: "read", command: "COMMAND_TEXT", name: "a", path: null }]],
    ["a read with an empty path", [{ type: "read", command: "COMMAND_TEXT", name: "a", path: "" }]],
    ["a malformed action", ["read"]],
  ])("reports nothing for %s, start or completion, and keeps the command activity", (_, actions) => {
    const { steps } = codexSteps([command(actions), command(actions, "item/completed")]);
    expect(stagesOf(steps)).toEqual([]);
    expect(eventsOf(steps)).toEqual([{ type: "activity", kind: "command", summary: GENERIC_SUMMARY.command }]);
  });
  it("reports nothing for file changes, MCP tool calls or a Doan connector's call, whose activity says it", () => {
    const item = (method: string, value: Record<string, unknown>) => ({ method, params: { threadId: "session-1", turnId: "turn-1", item: value } });
    const doan = { type: "mcpToolCall", id: "m", server: "doan-notion", tool: "search", arguments: { query: "SECRET-QUERY" } };
    const edit = { type: "fileChange", id: "f", changes: [{ path: "/repo/a.txt", kind: "update" }] };
    const { steps } = codexSteps([item("item/started", doan), item("item/completed", doan), item("item/started", edit), item("item/completed", edit)]);
    expect(stagesOf(steps)).toEqual([]);
    expect(eventsOf(steps).map(e => e.type)).toEqual(["activity", "activity"]);
    // The recorded turns: Codex 0.163.0's file decline, and the Home run's unknown command, image view and file change.
    for (const frames of [codexFixture, codexHome]) expect(stagesOf(codexSteps(frames).steps)).toEqual([]);
  });
  it("ignores another thread's or turn's notifications", () => {
    const read = [{ type: "read", command: "COMMAND_TEXT", name: "a", path: "/repo/a" }];
    const frames = [
      command(read, "item/started", { params: { ...command(read).params, threadId: "other" } }),
      command(read, "item/started", { params: { ...command(read).params, turnId: "turn-0" } }),
      command(read, "item/completed", { params: { ...command(read).params, turnId: "turn-0" } }),
      { ...command(read), params: { item: command(read).params.item } },
    ];
    const { steps } = codexSteps(frames);
    expect(stagesOf(steps)).toEqual([]);
    expect(eventsOf(steps)).toEqual([]);
  });
  it("reports nothing for a server request, even one naming a read item", () => {
    const request = { id: 7, method: "item/commandExecution/requestApproval", params: { threadId: "session-1", turnId: "turn-1", itemId: "c", command: "cat a", commandActions: [{ type: "read", command: "cat a", name: "a", path: "/repo/a" }] } };
    expect(codexSteps([request]).steps[0]!.stage).toBeUndefined();
  });
  it("reports nothing after the terminal", () => {
    const { state } = codexSteps(codexRead.read);
    expect(state.terminal).toBe(true);
    expect(stagesOf(codexSteps(codexRead.read.filter(m => m.method !== "turn/completed"), state).steps)).toEqual([]);
  });
  it("bounds the path and summary to 512 and never carries the command", () => {
    const long = "/repo/" + "d/".repeat(400) + "a.txt";
    const [stage] = stagesOf(codexSteps([command([{ type: "read", command: "COMMAND_TEXT", name: "a", path: long }])]).steps);
    expect(stage).toMatchObject({ kind: "tool", activity: "read" });
    if (stage?.kind !== "tool") throw new Error("no tool stage");
    expect(stage.path).toHaveLength(512);
    expect(stage.summary).toHaveLength(512);
    const all = [...stagesOf(codexSteps(codexRead.read).steps), ...stagesOf(codexSteps(codexRead.search).steps), stage];
    expect(JSON.stringify(all)).not.toMatch(/COMMAND_TEXT/);
  });
});

describe("ACP stages", () => {
  it("reports Copilot's thought chunks as thinking until a tool call, then the tool while it runs and general once it completes", () => {
    const { steps } = acpSteps(copilotThought.turn);
    const stages = stagesOf(steps);
    expect(stages.filter(stage => stage.kind === "thinking")).toHaveLength(83);
    expect(folded(stages)).toEqual([
      THINKING,
      COMMAND, // pending execute: its title is the command, so the stage says only that one runs
      GENERAL, // completed
      { kind: "tool", activity: "read", path: "/repo/notes.txt", summary: "Viewing /repo/notes.txt" },
      GENERAL,
    ]);
    // The status-less update between pending and completed (5 s of sleep) keeps the command stage.
    const statusless = copilotThought.turn.findIndex(f => f.params?.update.sessionUpdate === "tool_call_update" && !("status" in f.params.update));
    expect(steps[statusless]).toEqual({ events: [] });
    expect(JSON.stringify(stages)).not.toMatch(/COMMAND_TEXT/);
    expectNoStageAfterTerminal(steps);
  });
  it("ends thinking on a message chunk, a tool call or a tool update with a status", () => {
    const tool = (u: Record<string, unknown>) => update({ toolCallId: "t", kind: "read", title: "Read a", locations: [{ path: "/repo/a" }], ...u });
    const cases: [string, unknown, TurnStage][] = [
      ["a message chunk", update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } }), GENERAL],
      ["a tool call", tool({ sessionUpdate: "tool_call", status: "pending" }), { kind: "tool", activity: "read", path: "/repo/a", summary: "Read a" }],
      ["a tool call with no status", tool({ sessionUpdate: "tool_call" }), { kind: "tool", activity: "read", path: "/repo/a", summary: "Read a" }],
      ["an in-progress update", tool({ sessionUpdate: "tool_call_update", status: "in_progress" }), { kind: "tool", activity: "read", path: "/repo/a", summary: "Read a" }],
      ["a completed update", tool({ sessionUpdate: "tool_call_update", status: "completed" }), GENERAL],
      ["a failed update", tool({ sessionUpdate: "tool_call_update", status: "failed" }), GENERAL],
    ];
    for (const [, frame, after] of cases) expect(stagesOf(acpSteps([thought, frame] as Record<string, any>[]).steps)).toEqual([THINKING, after]);
  });
  it("keeps thinking through usage, plan, command list and status-less tool updates", () => {
    const quiet = [
      update({ sessionUpdate: "usage_update", used: 10, size: 100 }),
      update({ sessionUpdate: "plan", entries: [] }),
      update({ sessionUpdate: "available_commands_update", availableCommands: [] }),
      update({ sessionUpdate: "tool_call_update", toolCallId: "t", content: [] }),
    ];
    const { steps, state } = acpSteps([thought, ...quiet] as Record<string, any>[]);
    expect(stagesOf(steps)).toEqual([THINKING]);
    // Still thinking: the next message chunk ends it.
    expect(stagesOf(acpSteps([update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } })] as Record<string, any>[], state).steps)).toEqual([GENERAL]);
  });
  it("reports nothing for a message chunk, usage or plan outside thinking", () => {
    const frames = [update({ sessionUpdate: "usage_update", used: 10, size: 100 }), update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } }), update({ sessionUpdate: "plan", entries: [] })];
    expect(stagesOf(acpSteps(frames as Record<string, any>[]).steps)).toEqual([]);
  });
  it("ends thinking on a status-bearing update even for a tool already completed", () => {
    const done = update({ sessionUpdate: "tool_call_update", toolCallId: "t", kind: "read", status: "completed" });
    const { state } = acpSteps([done] as Record<string, any>[]);
    const { steps, state: after } = acpSteps([thought, update({ sessionUpdate: "tool_call_update", toolCallId: "t", status: "completed" })] as Record<string, any>[], state);
    expect(steps).toEqual([{ events: [], stage: THINKING }, { events: [], stage: GENERAL }]);
    expect(after.thinking).toBeUndefined();
    // A status-less update for it leaves thinking on.
    expect(stagesOf(acpSteps([thought, update({ sessionUpdate: "tool_call_update", toolCallId: "t", content: [] })] as Record<string, any>[], state).steps)).toEqual([THINKING]);
  });
  it("ends an unknown status as general, in thinking or not", () => {
    const odd = update({ sessionUpdate: "tool_call_update", toolCallId: "t", kind: "read", title: "Read a", status: "cancelled" });
    expect(acpSteps([odd] as Record<string, any>[]).steps).toEqual([{ events: [], stage: GENERAL }]);
    const { steps, state } = acpSteps([thought, odd] as Record<string, any>[]);
    expect(stagesOf(steps)).toEqual([THINKING, GENERAL]);
    expect(state.thinking).toBeUndefined();
    expect(state.activities).toEqual([]);
  });
  it("reports Cursor's pending and in-progress tools by kind, never an execute title, and general once none runs", () => {
    const { steps } = acpSteps(cursorFixture.turn);
    expect(folded(stagesOf(steps))).toEqual([
      COMMAND,
      { kind: "tool", activity: "edit", summary: "Edit File" },
      { kind: "tool", activity: "edit", path: "/repo/hello.txt", summary: "Edit `/repo/hello.txt`" },
      COMMAND, // the edit completed while the execute was still in progress
      GENERAL,
    ]);
    expect(JSON.stringify(stagesOf(steps))).not.toMatch(/command -v|echo \$PATH/);
    expectNoStageAfterTerminal(steps);
  });
  it("reports Copilot's failed tool as general", () => {
    const { steps } = acpSteps(copilotFixture.turn);
    expect(folded(stagesOf(steps))).toEqual([COMMAND, GENERAL, { kind: "tool", activity: "edit", summary: "apply_patch" }, GENERAL]);
    // The failed call leaves no activity: a rejected or failed call changed nothing.
    const failed = copilotFixture.turn.findIndex(f => (f as Record<string, any>).params?.update?.status === "failed");
    expect(acpSteps(copilotFixture.turn.slice(0, failed + 1)).steps.at(-1)).toEqual({ events: [], stage: GENERAL });
    expectNoStageAfterTerminal(steps);
  });
  it("reports nothing for a tool already completed, nor after the terminal", () => {
    const done = update({ sessionUpdate: "tool_call_update", toolCallId: "t", kind: "read", status: "completed" });
    const { state } = acpSteps([done] as Record<string, any>[]);
    expect(stagesOf(acpSteps([update({ sessionUpdate: "tool_call_update", toolCallId: "t", status: "in_progress" })] as Record<string, any>[], state).steps)).toEqual([]);
    const ended = acpSteps(copilotThought.turn).state;
    expect(ended.terminal).toBe(true);
    expect(stagesOf(acpSteps(copilotThought.turn.filter(f => f.method), ended).steps)).toEqual([]);
  });
  // R1: Copilot started a search, a glob and a 6 s command within 4 ms; the first two completed 72 ms later.
  it("keeps the command that still runs as the stage when Copilot's parallel search and glob complete", () => {
    const { steps } = acpSteps(copilotParallel.turn);
    const SEARCH: TurnStage = { kind: "tool", activity: "other", path: "/repo", summary: "Searching for 'QUERY'" };
    expect(folded(stagesOf(steps))).toEqual([
      THINKING,
      SEARCH,
      { kind: "tool", activity: "read", path: "/repo", summary: "Finding files matching QUERY" },
      COMMAND,
      GENERAL, // the command completed last
      THINKING,
      { kind: "tool", activity: "read", path: "/repo/notes.txt", summary: "Viewing /repo/notes.txt" },
      GENERAL,
      SEARCH,
      GENERAL,
    ]);
    const completions = copilotParallel.turn.flatMap((f, i) => (f as Record<string, any>).params?.update?.status === "completed" ? [i] : []);
    expect(completions.slice(0, 2).map(i => steps[i]!.stage)).toEqual([COMMAND, COMMAND]);
    expect(eventsOf(steps)).toEqual([
      { type: "activity", kind: "read", path: "/repo", insideDesign: false, summary: "Finding files matching QUERY" },
      { type: "activity", kind: "other", path: "/repo", insideDesign: false, summary: "Searching for 'QUERY'" },
      { type: "activity", kind: "command", summary: GENERIC_SUMMARY.command },
      { type: "activity", kind: "read", path: "/repo/notes.txt", insideDesign: false, summary: "Viewing /repo/notes.txt" },
      { type: "activity", kind: "other", path: "/repo", insideDesign: false, summary: "Searching for 'QUERY'" },
      { type: "message.delta", messageId: "turn-1:0", text: "The word **lantern** appears in `src/a.ts` and `notes.txt`." },
      { type: "message.delta", messageId: "turn-1:0", text: " The command output was `done`. The second line of `notes.t" },
      { type: "message.delta", messageId: "turn-1:0", text: "xt` is: “The word lantern appears only in this notes file.”" },
      { type: "message.done", messageId: "turn-1:0", text: "The word **lantern** appears in `src/a.ts` and `notes.txt`. The command output was `done`. The second line of `notes.txt` is: “The word lantern appears only in this notes file.”" },
      { type: "context.usage", used: 15574, size: 272000 },
      { type: "turn.done" },
    ]);
    expect(JSON.stringify(stagesOf(steps))).not.toMatch(/COMMAND_TEXT/);
    expectNoStageAfterTerminal(steps);
  });
  it("gives the stage back to the latest tool still running when another ends, and general once none runs", () => {
    const call = (id: string, u: Record<string, unknown>) => update({ toolCallId: id, ...u });
    const A: TurnStage = { kind: "tool", activity: "read", path: "/repo/a", summary: "Read a" };
    const B: TurnStage = { kind: "tool", activity: "edit", path: "/repo/b", summary: "Edit b" };
    const startA = call("a", { sessionUpdate: "tool_call", kind: "read", title: "Read a", status: "pending", locations: [{ path: "/repo/a" }] });
    const startB = call("b", { sessionUpdate: "tool_call", kind: "edit", title: "Edit b", status: "pending", locations: [{ path: "/repo/b" }] });
    const startC = call("c", { sessionUpdate: "tool_call", kind: "execute", title: "COMMAND_TEXT", status: "pending" });
    const end = (id: string, status: string) => call(id, { sessionUpdate: "tool_call_update", status });
    const stages = (frames: unknown[]) => stagesOf(acpSteps(frames as Record<string, any>[]).steps);
    // Two running, one fails: the other one is the stage; it completes last: general.
    expect(stages([startA, startB, end("b", "failed"), end("a", "completed")])).toEqual([A, B, A, GENERAL]);
    expect(stages([startA, startB, end("a", "failed"), end("b", "completed")])).toEqual([A, B, B, GENERAL]);
    // The most recently started of those still running, not the most recently updated.
    expect(stages([startA, startB, startC, call("a", { sessionUpdate: "tool_call_update", status: "in_progress" }), end("c", "completed")])).toEqual([A, B, COMMAND, A, B]);
    expect(stages([startA, startB, startC, end("b", "completed"), end("c", "completed"), end("a", "completed")])).toEqual([A, B, COMMAND, COMMAND, A, GENERAL]);
    // An unknown status ends a tool too; a status-less update changes nothing.
    expect(stages([startA, startB, call("b", { sessionUpdate: "tool_call_update", content: [] }), end("b", "cancelled"), end("a", "cancelled")])).toEqual([A, B, A, GENERAL]);
    // Thinking still comes and goes as before: a thought chunk is thinking, the next completion names the running tool.
    expect(stages([startA, startB, thought, end("b", "completed")])).toEqual([A, B, THINKING, A]);
    // An update for a tool that already completed reports nothing, as before.
    expect(stages([startA, end("a", "completed"), startB, end("a", "completed")])).toEqual([A, GENERAL, B]);
    // A call marked done while it runs (the runner's Antigravity question) still ends on its completion.
    const asked = acpSteps([call("q", { sessionUpdate: "tool_call_update", title: "Which?", status: "pending" })] as Record<string, any>[]).state;
    const marked = { ...asked, activities: [...asked.activities, "q"] };
    const after = acpSteps([end("q", "completed"), startA, end("a", "completed")] as Record<string, any>[], marked);
    expect(stagesOf(after.steps)).toEqual([GENERAL, A, GENERAL]);
    expect("running" in after.state).toBe(false);
    // No tool left running leaves no trace in the state.
    const { state } = acpSteps([startA, startB, end("b", "completed"), end("a", "failed")] as Record<string, any>[]);
    expect(state).toEqual(acpSteps([startA, end("a", "failed"), startB, end("b", "completed")] as Record<string, any>[]).state);
    expect("running" in state).toBe(false);
  });
  it("bounds a tool's path and summary to 512", () => {
    const long = "/repo/" + "d/".repeat(400) + "a.txt";
    const [stage] = stagesOf(acpSteps([update({ sessionUpdate: "tool_call", toolCallId: "t", kind: "read", title: "T".repeat(600), status: "pending", locations: [{ path: long }] })] as Record<string, any>[]).steps);
    if (stage?.kind !== "tool") throw new Error("no tool stage");
    expect(stage.summary).toHaveLength(512);
    expect(stage.path).toHaveLength(512);
  });
});

describe("ACP tool summary (B2)", () => {
  // In the recorded turns no completion changes a tool's kind, path or title after its last running update, so the stage
  // that tool showed while it ran is its completed activity's kind, path and summary.
  it.each([
    ["Copilot thought turn", copilotThought.turn, 2],
    ["Copilot", copilotFixture.turn, 1],
    ["Cursor", cursorFixture.turn, 2],
  ])("gives each %s tool's last running stage its completed activity's summary (%i tools)", (_, frames, tools) => {
    let state = initialAcp("turn-1");
    const running = new Map<string, { stage: TurnStage; tool: unknown }>(); let compared = 0;
    for (const frame of frames as Record<string, any>[]) {
      if (frame.method !== "session/update") continue;
      const u = frame.params.update, result = normalizeAcp(state, u, "/repo"); state = result.state;
      // Only the update's own running stage: an ending update names another tool still running.
      const runs = u.status === "pending" || u.status === "in_progress" || (u.sessionUpdate === "tool_call" && !u.status);
      if (runs && result.stage?.kind === "tool") running.set(u.toolCallId, { stage: result.stage, tool: state.tools[u.toolCallId] });
      const activity = result.events.find(e => e.type === "activity");
      if (activity?.type !== "activity") continue;
      const last = running.get(u.toolCallId);
      expect(last?.tool).toEqual(state.tools[u.toolCallId]);
      expect(last?.stage).toEqual({ kind: "tool", activity: activity.kind, ...(activity.path ? { path: activity.path } : {}), summary: activity.summary });
      compared++;
    }
    expect(compared).toBe(tools);
  });
  it("words a completion that brings a new title by the same rule the running stage used", () => {
    const tool = (u: Record<string, unknown>) => update({ toolCallId: "t", kind: "edit", locations: [{ path: "/repo/a.txt" }], ...u });
    const { steps } = acpSteps([tool({ sessionUpdate: "tool_call", title: "Edit File", status: "pending" }), tool({ sessionUpdate: "tool_call_update", title: "Edit `/repo/a.txt`", status: "completed" })] as Record<string, any>[]);
    expect(steps[0]!.stage).toEqual({ kind: "tool", activity: "edit", path: "/repo/a.txt", summary: "Edit File" });
    expect(steps[1]!.events).toEqual([{ type: "activity", kind: "edit", path: "/repo/a.txt", insideDesign: false, summary: "Edit `/repo/a.txt`" }]);
    // The same final record, still running, reads as the activity does.
    const running = acpSteps([tool({ sessionUpdate: "tool_call", title: "Edit File", status: "pending" }), tool({ sessionUpdate: "tool_call_update", title: "Edit `/repo/a.txt`", status: "in_progress" })] as Record<string, any>[]).steps[1]!.stage;
    expect(running).toEqual({ kind: "tool", activity: "edit", path: "/repo/a.txt", summary: "Edit `/repo/a.txt`" });
  });
  it("keeps the recorded ACP turns' activities as they were", () => {
    // The A1 turns are pinned whole in turnActivityFixtures.test.ts.
    const activities = (frames: readonly unknown[]) => eventsOf(acpSteps(frames as Record<string, any>[]).steps).filter(e => e.type === "activity");
    expect(activities(cursorFixture.turn)).toEqual([
      { type: "activity", kind: "edit", path: "/repo/hello.txt", insideDesign: false, summary: "Edit `/repo/hello.txt`" },
      { type: "activity", kind: "command", summary: GENERIC_SUMMARY.command },
    ]);
    expect(activities(copilotFixture.turn)).toEqual([{ type: "activity", kind: "command", summary: GENERIC_SUMMARY.command }]);
    expect(activities(copilotThought.turn)).toEqual([
      { type: "activity", kind: "command", summary: GENERIC_SUMMARY.command },
      { type: "activity", kind: "read", path: "/repo/notes.txt", insideDesign: false, summary: "Viewing /repo/notes.txt" },
    ]);
  });
});
