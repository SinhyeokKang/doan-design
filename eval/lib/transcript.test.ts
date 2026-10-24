import { test } from "node:test";
import assert from "node:assert/strict";
import { shellCommands, commandWords } from "./transcript.ts";
test("only Bash tool_use and Codex exec headers yield shell commands", () => {
  assert.deepEqual(shellCommands('guide: doan active\n{"type":"user","message":{"content":[{"type":"tool_result","content":"doan active"}]}}'), []);
  assert.deepEqual(shellCommands('{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"doan active"}}]}}'), ["doan active"]);
  assert.deepEqual(shellCommands("exec\n/bin/zsh -lc 'doan active --json' in /tmp/repo succeeded in 2ms:\noutput"), ["/bin/zsh -lc 'doan active --json'"]);
});
test("shell wrappers and separators preserve actual command positions", () => {
  assert.deepEqual(commandWords("/bin/zsh -lc 'cd /tmp && doan active --json'"), [["cd", "/tmp"], ["doan", "active", "--json"]]);
  assert.deepEqual(commandWords("echo 'doan active --json'"), [["echo", "doan active --json"]]);
});
