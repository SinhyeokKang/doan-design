import assert from "node:assert/strict";
import { test } from "node:test";
import { finalAnswer } from "./answer.ts";

test("finalAnswer retains unfenced JSON entries between Codex prose lines", () => {
  const answer = 'Status: one canvas, billing-v2. ls reports an orphan:\n{"id":"billing","file":".doan/comments/billing.jsonl","uncertain":false}\nI left it unchanged; how should I handle it?';
  assert.equal(finalAnswer(answer + "\nOpenAI Codex v0.1\nbanner"), answer);
});

test("finalAnswer retains brace-leading prose and domain JSON without treating them as events", () => {
  for (const line of ['{billing} still has comments.', '{"type":"billing","id":"billing"}', "null"]) {
    const answer = `The listing contains:\n${line}\nPlease specify how to handle it.`;
    assert.equal(finalAnswer(answer), answer);
  }
});

test("finalAnswer excludes actual JSON events and tool output even beside prose", () => {
  for (const event of [
    { type: "user", message: { content: [{ type: "tool_result", content: "guide" }] } },
    { type: "tool_result", content: "guide" },
    { type: "response_item", payload: { type: "custom_tool_call_output", output: "guide" } },
    { type: "item.completed", item: { type: "command_execution", aggregated_output: "guide" } },
    { ok: true, result: { guide: "guide" } },
    { ok: false, error: { code: "missing", message: "guide" } },
    { exit_code: 0, output: "guide" },
  ]) {
    const line = JSON.stringify(event);
    assert.equal(finalAnswer(line), "", line);
    assert.equal(finalAnswer(`Tool output follows:\n${line}`), "", line);
    assert.equal(finalAnswer(line + '\n{"type":"result","result":"Final answer"}'), "Final answer");
  }
});
