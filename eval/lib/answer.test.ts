import assert from "node:assert/strict";
import { test } from "node:test";
import { finalAnswer, withoutCode } from "./answer.ts";

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

test("withoutCode drops fenced blocks and inline code spans but keeps links and unclosed backticks", () => {
  const link = "[Save](doan:a/element/save)";
  assert.equal(withoutCode(`Fixed ${link}.`), `Fixed ${link}.`);
  assert.equal(withoutCode("See `[x](doan:a/frame/f)` and ``[y](doan:a/frame/g)`` now."), "See  and  now.");
  assert.equal(withoutCode("Before\n```md\n[x](doan:a/frame/f)\n```\nAfter " + link), "Before\n\nAfter " + link);
  assert.equal(withoutCode("~~~\n[x](doan:a/frame/f)\n~~~\nok"), "\nok");
  assert.equal(withoutCode("A lone ` tick and " + link), "A lone ` tick and " + link);
});

test("withoutCode keeps an inline code span inside its paragraph", () => {
  const link = "[Save](doan:a/element/save)";
  // A backtick left open in one paragraph does not swallow the link in the next.
  assert.equal(withoutCode(`Run \`doan check\n\nThen ${link} and \`x\`.`), `Run \`doan check\n\nThen ${link} and .`);
  assert.equal(withoutCode(`One \`a\nb\` two ${link}`), `One  two ${link}`);
});

test("withoutCode treats an unclosed fence as code to the end of the text", () => {
  const link = "[Save](doan:a/element/save)";
  assert.equal(withoutCode(`Intro ${link}\n\`\`\`md\n[x](doan:a/frame/f)\nstill code`), `Intro ${link}\n`);
  // A shorter closing run, or a different fence character, does not close the block.
  assert.equal(withoutCode("````\n[x](doan:a/frame/f)\n```\n[y](doan:a/frame/g)"), "");
  assert.equal(withoutCode("```\n[x](doan:a/frame/f)\n~~~\n[y](doan:a/frame/g)"), "");
  assert.equal(withoutCode("```\nx\n```\n" + link), "\n" + link);
});
