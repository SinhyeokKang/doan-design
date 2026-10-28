import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shellCommands, commandWords, mcpTools, toolCalls } from "./transcript.ts";
test("only Bash tool_use and Codex exec headers yield shell commands", () => {
  assert.deepEqual(shellCommands('guide: doan active\n{"type":"user","message":{"content":[{"type":"tool_result","content":"doan active"}]}}'), []);
  assert.deepEqual(shellCommands('{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"doan active"}}]}}'), ["doan active"]);
  assert.deepEqual(shellCommands("exec\n/bin/zsh -lc 'doan active --json' in /tmp/repo succeeded in 2ms:\noutput"), ["/bin/zsh -lc 'doan active --json'"]);
});
test("shell wrappers and separators preserve actual command positions", () => {
  assert.deepEqual(commandWords("/bin/zsh -lc 'cd /tmp && doan active --json'"), [["cd", "/tmp"], ["doan", "active", "--json"]]);
  assert.deepEqual(commandWords("echo 'doan active --json'"), [["echo", "doan active --json"]]);
});
test("the command builtin runs its command; lookups and quoted text do not", () => {
  assert.deepEqual(commandWords("command doan active --json"), [["doan", "active", "--json"]]);
  assert.deepEqual(commandWords("/bin/sh -c 'command -p doan active'"), [["doan", "active"]]);
  assert.deepEqual(commandWords("cd /tmp && command -- doan active"), [["cd", "/tmp"], ["doan", "active"]]);
  for (const lookup of ["command -v doan", "command -V doan", "command -pv doan"])
    assert.ok(!commandWords(lookup).some(words => words[0] === "doan"), lookup);
  assert.deepEqual(commandWords("echo 'command doan active'"), [["echo", "command doan active"]]);
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

test("outputs match call ids, retain retries, and exclude unrelated results", () => {
  const event = (payload: object) => ({ type: "response_item", payload });
  const rows = [
    event({ type: "function_call", call_id: "a", name: "exec_command", arguments: '{"cmd":"doan active"}' }),
    event({ type: "function_call", call_id: "b", name: "mcp__doan__active", arguments: "{}" }),
    event({ type: "function_call_output", call_id: "b", output: { content: [{ type: "text", text: "MCP result" }] } }),
    event({ type: "function_call_output", call_id: "other", output: "unrelated" }),
    event({ type: "function_call_output", call_id: "a", output: "x".repeat(1000) }),
    event({ type: "function_call", call_id: "c", name: "exec_command", arguments: '{"cmd":"doan active"}' }),
    event({ type: "function_call_output", call_id: "c", output: "retry result" }),
  ];
  const outputs = toolCalls(rows.map(r => JSON.stringify(r)).join("\n")).outputs;
  assert.deepEqual(outputs, [
    { name: "exec_command", command: "doan active", callId: "a", scope: "call", excerpt: "x".repeat(300) },
    { name: "mcp__doan__active", callId: "b", scope: "call", excerpt: "MCP result" },
    { name: "exec_command", command: "doan active", callId: "c", scope: "call", excerpt: "retry result" },
  ]);
});
test("Claude doan tool results use tool_use_id and skip echo and other MCP tools", () => {
  const rows = [
    { type: "assistant", message: { content: [
      { type: "tool_use", id: "a", name: "Bash", input: { command: "doan active" } },
      { type: "tool_use", id: "b", name: "mcp__doan__active", input: {} },
      { type: "tool_use", id: "c", name: "Bash", input: { command: "echo 'doan active'" } },
      { type: "tool_use", id: "d", name: "mcp__other__active", input: {} },
    ] } },
    { type: "user", message: { content: [
      { type: "tool_result", tool_use_id: "b", content: [{ type: "text", text: "MCP failed" }] },
      { type: "tool_result", tool_use_id: "a", content: "shell failed" },
      { type: "tool_result", tool_use_id: "c", content: "echoed" },
      { type: "tool_result", tool_use_id: "d", content: "other" },
    ] } },
  ];
  assert.deepEqual(toolCalls(rows.map(r => JSON.stringify(r)).join("\n")).outputs, [
    { name: "Bash", command: "doan active", callId: "a", scope: "call", excerpt: "shell failed" },
    { name: "mcp__doan__active", callId: "b", scope: "call", excerpt: "MCP failed" },
  ]);
});

test("shell words keep quoted flag assignments together", () => {
  assert.deepEqual(commandWords('doan --repo="/tmp/my repo" active --json'), [["doan", "--repo=/tmp/my repo", "active", "--json"]]);
  assert.deepEqual(commandWords('doan -repo=\'active\' check'), [["doan", "-repo=active", "check"]]);
  assert.deepEqual(commandWords('echo "doan active"'), [["echo", "doan active"]]);
});

test("only a whole standalone literal patch batch qualifies as code-mode invocation evidence", () => {
  const patch = '*** Begin Patch\n*** Delete File: .doan/canvases/team.html\n*** End Patch';
  const calls = (input: string) => toolCalls(JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec", input } }));
  for (const source of [
    `tools.apply_patch(${JSON.stringify(patch)})`, `/* call */ await tools.apply_patch(${JSON.stringify(patch)}); // end`,
    `await tools.apply_patch('${patch.replaceAll("\n", "\\n")}');`, 'await tools.apply_patch(`' + patch + '`);',
  ]) {
    assert.deepEqual(calls(source).patches, [patch], source);
    assert.equal(calls(source).patchCandidates, undefined);
  }
  const invalidString = `await tools.apply_patch('${patch}');`;
  assert.equal(calls(invalidString).patches, undefined);
  assert.deepEqual(calls(invalidString).patchCandidates, [patch]);
});
