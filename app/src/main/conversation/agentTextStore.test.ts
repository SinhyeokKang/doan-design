import { afterEach, expect, it } from "vitest";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acpPermission, acpPromptDone, acpPromptFailed, acpQuestion, initialAcp, normalizeAcp } from "./acp";
import { ConversationStore } from "./store";
import { claudePermissionRequest, claudeQuestion, initialTransport, normalizeClaude, normalizeCodex } from "./transport";
import type { EventPayload } from "./types";

// Every agent-written string that reaches a stored event: the store refuses U+0000, and one refused event fails the
// turn's whole write (activity summaries and paths: activityStore.test.ts).
const roots: string[] = [];
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
function stored(events: readonly EventPayload[]): EventPayload[] {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-agent-text-"))); roots.push(root);
  new ConversationStore(root).appendAll("c", "t", events);
  return [...events];
}
const of = <T extends EventPayload["type"]>(events: readonly EventPayload[], type: T) => events.filter((e): e is Extract<EventPayload, { type: T }> => e.type === type);
const codex = { root: "/repo", sessionId: "s", turnId: "t" };

it("stores Claude message text holding U+0000", () => {
  let state = initialTransport();
  const frames = [
    { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "a\0b" } } },
    { type: "assistant", message: { id: "m", content: [{ type: "text", text: "a\0b" }] } },
    { type: "system", subtype: "local_command_output", uuid: "u", content: "c\0d" },
  ];
  const events = frames.flatMap(frame => { const read = normalizeClaude(state, frame, "/repo"); state = read.state; return read.events; });
  expect([...of(stored(events), "message.delta"), ...of(events, "message.done")].map(e => e.text)).toEqual(["a<U+0000>b", "a<U+0000>b", "c<U+0000>d"]);
});

it("stores a Claude built-in's answer holding U+0000", () => {
  const { events } = normalizeClaude(initialTransport(), { type: "result", subtype: "success", is_error: false, num_turns: 0, uuid: "u", result: "a\0b" }, "/repo");
  expect(of(stored(events), "message.done").map(e => e.text)).toEqual(["a<U+0000>b"]);
});

it("stores Codex message text holding U+0000", () => {
  const delta = normalizeCodex(initialTransport(), { method: "item/agentMessage/delta", params: { threadId: "s", turnId: "t", itemId: "i", delta: "a\0b" } }, codex).events;
  const done = normalizeCodex(initialTransport(), { method: "item/completed", params: { threadId: "s", turnId: "t", item: { type: "agentMessage", id: "i", text: "a\0b" } } }, codex).events;
  expect(stored([...delta, ...done]).map(e => "text" in e && e.text)).toEqual(["a<U+0000>b", "a<U+0000>b"]);
});

it("stores ACP message text holding U+0000", () => {
  const chunk = normalizeAcp(initialAcp("t"), { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "a\0b" } }, "/repo");
  const done = acpPromptDone(chunk.state, { stopReason: "end_turn" }).events;
  expect([...of(stored([...chunk.events, ...done]), "message.delta"), ...of(done, "message.done")].map(e => e.text)).toEqual(["a<U+0000>b", "a<U+0000>b"]);
});

it("stores a failed turn's detail holding U+0000 with its code", () => {
  const claude = normalizeClaude(initialTransport(), { type: "result", subtype: "error_during_execution", is_error: true, errors: ["Not logged in\0"] }, "/repo").events;
  const codexFailed = normalizeCodex(initialTransport(), { method: "turn/completed", params: { threadId: "s", turn: { id: "t", status: "failed", error: { message: "a\0b" } } } }, codex).events;
  const model = normalizeCodex(initialTransport(), { method: "turn/completed", params: { threadId: "s", turn: { id: "t", status: "failed", error: { message: "The 'gpt\0x' model is not supported", codexErrorInfo: "modelNotFound" } } } }, codex).events;
  const limited = normalizeCodex(initialTransport(), { method: "turn/completed", params: { threadId: "s", turn: { id: "t", status: "failed", error: { message: "rate\0limit exceeded" } } } }, codex).events;
  const acp = acpPromptFailed(initialAcp("t"), "a\0b").events;
  expect(of(stored([...claude, ...codexFailed, ...model, ...limited, ...acp]), "turn.failed")).toEqual([
    { type: "turn.failed", code: "not_logged_in", detail: "Not logged in<U+0000>" },
    { type: "turn.failed", code: "unknown", detail: "a<U+0000>b" },
    { type: "turn.failed", code: "model_unavailable", model: "gpt<U+0000>x", detail: "The 'gpt<U+0000>x' model is not supported" },
    { type: "turn.failed", code: "rate_limited", detail: "rate<U+0000>limit exceeded" },
    { type: "turn.failed", code: "unknown", detail: "a<U+0000>b" },
  ]);
});

it("stores a permission request whose tool name holds U+0000", () => {
  const claude = claudePermissionRequest("r1", "Bash\0x", { command: "ls" }, [], "/repo");
  const acp = acpPermission({ sessionId: "s", toolCall: { toolCallId: "c", kind: "exe\0cute", title: "ls" }, options: [{ optionId: "a", name: "Allow", kind: "allow_once" }] }, "r2", "/repo")!.event;
  expect(stored([claude, acp]).map(e => e.type === "permission.request" && e.tool)).toEqual(["Bash<U+0000>x", "exe<U+0000>cute"]);
});

// A question is answered with its own text and labels, so one holding U+0000 is refused as one past a limit is: Claude
// denies it with the way to ask instead, and Antigravity's stays a permission request, which stores.
it("refuses a question holding U+0000, and its ACP permission request stores", () => {
  const question = (over: Record<string, unknown>, option: Record<string, unknown> = {}) => ({ questions: [{ question: "Which?", header: "Color", multiSelect: false, options: [{ label: "Red", ...option }, { label: "Blue" }], ...over }] });
  expect(claudeQuestion(question({}))).not.toBeNull();
  for (const input of [question({ question: "Wh\0ich?" }), question({ header: "Co\0lor" }), question({}, { label: "R\0ed" }), question({}, { description: "d\0" })]) expect(claudeQuestion(input)).toBeNull();
  const asked = (title: string, name: string) => ({ sessionId: "s", toolCall: { toolCallId: "q", title }, options: [{ optionId: "1", name, kind: "allow_once" }, { optionId: "2", name: "Blue", kind: "allow_once" }] });
  expect(acpQuestion(asked("Which?", "Red"), "r")).not.toBeNull();
  for (const params of [asked("Wh\0ich?", "Red"), asked("Which?", "R\0ed")]) {
    expect(acpQuestion(params, "r")).toBeNull();
    stored([acpPermission(params, "r", "/repo")!.event]);
  }
});
