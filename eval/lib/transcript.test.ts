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
