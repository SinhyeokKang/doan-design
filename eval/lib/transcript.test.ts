import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shellCommands, commandWords, mcpTools } from "./transcript.ts";
test("only Bash tool_use and Codex exec headers yield shell commands", () => {
  assert.deepEqual(shellCommands('guide: doan active\n{"type":"user","message":{"content":[{"type":"tool_result","content":"doan active"}]}}'), []);
  assert.deepEqual(shellCommands('{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"doan active"}}]}}'), ["doan active"]);
  assert.deepEqual(shellCommands("exec\n/bin/zsh -lc 'doan active --json' in /tmp/repo succeeded in 2ms:\noutput"), ["/bin/zsh -lc 'doan active --json'"]);
});
test("shell wrappers and separators preserve actual command positions", () => {
  assert.deepEqual(commandWords("/bin/zsh -lc 'cd /tmp && doan active --json'"), [["cd", "/tmp"], ["doan", "active", "--json"]]);
  assert.deepEqual(commandWords("echo 'doan active --json'"), [["echo", "doan active --json"]]);
});
test("Codex exec headers preserve in inside quoted commands", () => {
  for (const command of ["echo look in app; doan active --json", "for f in 1; do doan active --json; done", "echo look in /tmp/app; doan active --json"]) {
    for (const quote of ["'", '"']) {
      const header = `/bin/zsh -lc ${quote}${command}${quote}`;
      for (const suffix of ["", " succeeded in 2ms:", " exited 1 in 2ms:"]) {
        assert.deepEqual(shellCommands(`exec\n${header} in /tmp/my repo${suffix}\noutput`), [header]);
      }
    }
  }
});
test("Codex commands containing in retain invocation and echo boundaries", () => {
  const actual = shellCommands("exec\n/bin/zsh -lc 'echo look in app; doan active --json' in /tmp/repo\n succeeded in 2ms:");
  assert.ok(actual.flatMap(commandWords).some(words => words[0] === "doan" && words[1] === "active"));
  const echoed = shellCommands('exec\n/bin/zsh -lc \'echo "look in app; doan active --json"\' in /tmp/repo\n succeeded in 2ms:');
  assert.ok(!echoed.flatMap(commandWords).some(words => words[0] === "doan" && words[1] === "active"));
  const quotedRecord = 'exec\n/bin/zsh -lc \'doan active --json\' in /tmp/repo';
  assert.deepEqual(shellCommands(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: quotedRecord }] } })), []);
});

test("Codex rollout keeps both commands in a batched exec call", () => {
  const rollout = readFileSync(new URL("./fixtures/codex-batched.jsonl", import.meta.url), "utf8");
  assert.deepEqual(shellCommands(rollout), ["doan active --json", "rg --files"]);
});
test("Codex direct calls are read but tool output and quoted code are not calls", () => {
  const event = (payload: object) => JSON.stringify({ type: "response_item", payload });
  assert.deepEqual(shellCommands(event({ type: "function_call", name: "exec_command", arguments: JSON.stringify({ cmd: "doan active" }) })), ["doan active"]);
  assert.deepEqual(shellCommands(event({ type: "function_call_output", output: 'tools.exec_command({cmd:"doan active"})' })), []);
  assert.deepEqual(shellCommands(event({ type: "custom_tool_call", name: "exec", input: `text('tools.exec_command({cmd:"doan active"})'); // tools.exec_command({cmd:"doan active"})` })), []);
});
test("MCP calls are recognized in Claude and Codex transcripts without counting mentions", () => {
  const claude = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__doan__active", input: { repo: "/tmp/repo" } }] } });
  const direct = JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "mcp__doan__active", arguments: "{}" } });
  const batch = JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec", input: "text(await tools.mcp__doan__active({repo: '/tmp/repo'}));" } });
  for (const transcript of [claude, direct, batch, 'tool doan.active({"repo":"/tmp/repo"})']) assert.deepEqual(mcpTools(transcript), ["mcp__doan__active"]);
  for (const transcript of ['Guide: mcp__doan__active', JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: batch }] } })]) assert.deepEqual(mcpTools(transcript), []);
});
