import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shellCommands, commandWords, parseCommand, doanCommand, doanPositionals, mcpTools, toolCalls } from "./transcript.ts";
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
    { name: "exec_command", command: "doan active", callId: "c", scope: "call", excerpt: "retry result" },
  ]);
});
// Only shell doan invocations get output excerpts; an MCP call of any name is listed in mcpTools alone.
test("Claude doan tool results use tool_use_id and skip echo and MCP tools", () => {
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
  ]);
  assert.deepEqual(toolCalls(rows.map(r => JSON.stringify(r)).join("\n")).mcpTools, ["mcp__doan__active", "mcp__other__active"]);
});

test("shell words keep quoted flag assignments together", () => {
  assert.deepEqual(commandWords('doan --repo="/tmp/my repo" active --json'), [["doan", "--repo=/tmp/my repo", "active", "--json"]]);
  assert.deepEqual(commandWords('doan -repo=\'active\' check'), [["doan", "-repo=active", "check"]]);
  assert.deepEqual(commandWords('echo "doan active"'), [["echo", "doan active"]]);
});

test("only a lexical code-mode patch mention that is not a whole standalone literal call becomes a candidate", () => {
  const patch = '*** Begin Patch\n*** Delete File: .doan/canvases/team.html\n*** End Patch';
  const event = (payload: object) => JSON.stringify({ type: "response_item", payload });
  const calls = (input: string) => toolCalls(event({ type: "custom_tool_call", name: "exec", input }));
  for (const source of [
    `tools.apply_patch(${JSON.stringify(patch)})`, `/* call */ await tools.apply_patch(${JSON.stringify(patch)}); // end`,
    `await tools.apply_patch('${patch.replaceAll("\n", "\\n")}');`, 'await tools.apply_patch(`' + patch + '`);',
  ]) assert.equal(calls(source).patchCandidates, undefined, source);
  const invalidString = `await tools.apply_patch('${patch}');`;
  assert.deepEqual(calls(invalidString).patchCandidates, [patch]);
  for (const transcript of [
    patch,
    event({ type: "custom_tool_call", name: "apply_patch", input: patch }),
    event({ type: "function_call", name: "functions.apply_patch", arguments: JSON.stringify({ patch }) }),
    event({ type: "custom_tool_call", name: "exec", input: `/* tools.apply_patch(${JSON.stringify(patch)}); */` }),
    event({ type: "custom_tool_call", name: "exec", input: "await tools.apply_patch(computedPatch);" }),
    event({ type: "custom_tool_call_output", output: patch }),
    event({ type: "custom_tool_call", name: "exec", input: `const example = ${JSON.stringify(`tools.apply_patch(${JSON.stringify(patch)})`)};` }),
  ]) assert.equal(toolCalls(transcript).patchCandidates, undefined, transcript);
});
test("a patch inside conditional, deferred or repeated code-mode source stays a candidate", () => {
  const patch = '*** Begin Patch\n*** Delete File: .doan/canvases/team.html\n*** End Patch';
  const call = `await tools.apply_patch(${JSON.stringify(patch)});`;
  for (const source of [
    `if (false) { ${call} }`, `async function example() { ${call} }`,
    `throw new Error('before patch'); ${call}`, `await mightReject(); ${call}`,
    `const deferred = async () => { ${call} };`, `${call} ${call}`,
    `text(${JSON.stringify('example')}); ${call}`, `${call} invalid syntax !`,
  ]) {
    const calls = toolCalls(JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "functions.exec", input: source } }));
    assert.ok(calls.patchCandidates?.includes(patch), source);
  }
});
test("doan export flags are read as flags, so the canvas stays the second positional", () => {
  const words = ["doan", "export", ".doan/canvases/profile.html", "-o", "/tmp/out.html", "--force", "--json"];
  assert.equal(doanCommand(words), "export");
  assert.deepEqual(doanPositionals(words), ["export", ".doan/canvases/profile.html"]);
  assert.deepEqual(doanPositionals(["doan", "export", "-o", "x.html", "a.html", "--force"]), ["export", "a.html"]);
  assert.equal(doanPositionals(["doan", "export", "a.html", "-o"]), undefined);
  assert.equal(doanPositionals(["doan", "export", "a.html", "-x", "y"]), undefined);
});
test("doan handoff --message takes a value, so its message is never a positional", () => {
  assert.deepEqual(doanPositionals(["doan", "handoff", ".doan/canvases/next.html", "--message", "-", "--json"]), ["handoff", ".doan/canvases/next.html"]);
  assert.deepEqual(doanPositionals(["doan", "handoff", "--message=Continue here", ".doan/canvases/next.html"]), ["handoff", ".doan/canvases/next.html"]);
  assert.equal(doanPositionals(["doan", "handoff", ".doan/canvases/next.html", "--message"]), undefined);
});

// A command run through a shell variable or `for` loop is still run, so a preset read through them is still a read;
// only the words the shell would execute count, never an echoed or quoted example.
test("commandWords expands loop and assigned variables where the shell would", () => {
  assert.deepEqual(commandWords("for p in harden clarify; do doan design-skill $p --json; done"),
    [["doan", "design-skill", "harden", "--json"], ["doan", "design-skill", "clarify", "--json"]]);
  assert.deepEqual(commandWords('for p in harden clarify\ndo\n  doan design-skill "${p}" --json | head -5\ndone'),
    [["doan", "design-skill", "harden", "--json"], ["head", "-5"], ["doan", "design-skill", "clarify", "--json"], ["head", "-5"]]);
  assert.deepEqual(commandWords("p=harden; doan design-skill $p --json"), [["doan", "design-skill", "harden", "--json"]]);
  assert.deepEqual(commandWords("ids='harden clarify'; for p in $ids; do doan design-skill $p; done"),
    [["doan", "design-skill", "harden"], ["doan", "design-skill", "clarify"]]);
  assert.deepEqual(commandWords("for a in x y; do for b in 1 2; do echo $a$b; done; done"),
    [["echo", "x1"], ["echo", "x2"], ["echo", "y1"], ["echo", "y2"]]);
  assert.deepEqual(commandWords("bash -c 'for p in harden; do doan design-skill $p; done'"), [["doan", "design-skill", "harden"]]);
  // What follows the loop runs once.
  assert.deepEqual(commandWords("cd /tmp; for p in a b; do echo $p; done; doan active"), [["cd", "/tmp"], ["echo", "a"], ["echo", "b"], ["doan", "active"]]);
});
test("commandWords keeps a single-quoted or escaped $ as a literal and reads it as complete", () => {
  const literal = (command: string) => parseCommand(command);
  assert.deepEqual(literal("doan design-skill '$p'"), { words: [["doan", "design-skill", "$p"]], incomplete: false });
  assert.deepEqual(literal('doan design-skill "\\$p"'), { words: [["doan", "design-skill", "$p"]], incomplete: false });
  assert.deepEqual(literal("doan design-skill \\$p"), { words: [["doan", "design-skill", "$p"]], incomplete: false });
  assert.deepEqual(literal("doan design-skill harden; doan design-skill '$p'"), { words: [["doan", "design-skill", "harden"], ["doan", "design-skill", "$p"]], incomplete: false });
  assert.deepEqual(commandWords("for p in harden; do echo doan design-skill $p; done"), [["echo", "doan", "design-skill", "harden"]]);
  // A variable the shell here may or may not have set is only a problem where it decides what runs.
  assert.deepEqual(literal("cd $HOME && doan design-skill harden"), { words: [["cd", "$HOME"], ["doan", "design-skill", "harden"]], incomplete: false });
  assert.deepEqual(literal("doan active --repo $REPO --json"), { words: [["doan", "active", "--repo", "$REPO", "--json"]], incomplete: false });
});
test("a command whose program or doan operand is unresolved is incomplete and yields no words for it", () => {
  for (const command of ["doan design-skill $p", "p=harden doan design-skill $p", "$c design-skill polish", "doan $c", 'doan design-skill "$p"', "doan design-skill $(echo harden)", "doan design-skill `echo harden`"])
    assert.deepEqual(parseCommand(command), { words: [], incomplete: true }, command);
  // The rest of the command is still read.
  assert.deepEqual(parseCommand("doan design-skill harden; $c design-skill polish"), { words: [["doan", "design-skill", "harden"]], incomplete: true });
  assert.deepEqual(parseCommand("for p in $ids; do doan design-skill $p; done"), { words: [], incomplete: true });
  assert.deepEqual(parseCommand("q=$unset; doan design-skill $q"), { words: [], incomplete: true });
});
test("loop variables and assignments in a body are the shell state that goes on after the loop", () => {
  assert.deepEqual(commandWords("p=harden; for p in polish; do echo $p; done; doan design-skill $p"), [["echo", "polish"], ["doan", "design-skill", "polish"]]);
  assert.deepEqual(commandWords("p=harden; for x in 1; do p=polish; done; doan design-skill $p"), [["doan", "design-skill", "polish"]]);
  assert.deepEqual(commandWords("p=active; for p in help; do echo $p; done; doan $p"), [["echo", "help"], ["doan", "help"]]);
  assert.deepEqual(commandWords("for x in 1 2 3; do echo $q; q=$x; done"), [["echo", "$q"], ["echo", "1"], ["echo", "2"]]);
  assert.deepEqual(commandWords("for a in 1 2; do for b in x y; do last=$a$b; done; done; echo $last $b"), [["echo", "2y", "y"]]);
});
test("a loop with no closing done is incomplete, and nothing from it on is taken as run", () => {
  assert.deepEqual(parseCommand("for p in harden; do doan design-skill $p"), { words: [], incomplete: true });
  assert.deepEqual(parseCommand("for p in harden; do echo start; doan design-skill harden"), { words: [], incomplete: true });
  assert.deepEqual(parseCommand("for p in harden"), { words: [], incomplete: true });
  assert.deepEqual(parseCommand("doan active; for p in a; do for q in b; do doan active; done"), { words: [["doan", "active"]], incomplete: true });
  assert.deepEqual(parseCommand("for p in harden; do doan design-skill $p; done"), { words: [["doan", "design-skill", "harden"]], incomplete: false });
});
test("a loop past the budget is incomplete and leaves no stale variable behind", () => {
  const long = [...Array(64).fill("harden"), "polish"].join(" ");
  assert.deepEqual(parseCommand(`for p in ${long}; do doan design-skill $p; done`).words.filter(words => words.includes("polish")), [["doan", "design-skill", "polish"]]);
  assert.equal(parseCommand(`for p in ${long}; do doan design-skill $p; done`).incomplete, false);
  const over = [...Array(300).fill("harden"), "polish"].join(" ");
  assert.deepEqual(parseCommand(`for p in ${over}; do doan design-skill $p; done`), { words: [], incomplete: true });
  assert.deepEqual(parseCommand(`p=harden; for p in ${over}; do echo; done; doan design-skill $p`), { words: [], incomplete: true });
  // The body assigns and calls: what ran after the first iteration is unknown, so the first read is not the list.
  assert.deepEqual(parseCommand(`p=harden; for x in ${Array(257).fill("1").join(" ")}; do doan design-skill $p; p=polish; done`), { words: [], incomplete: true });
  assert.deepEqual(parseCommand(`doan design-skill harden; for c in ${Array(257).fill("echo").join(" ")} doan; do $c design-skill polish; done`), { words: [["doan", "design-skill", "harden"]], incomplete: true });
  // Nested loops share one budget and the result stays small.
  const sixtyFour = Array.from({ length: 64 }, (_, i) => i).join(" ");
  const nested = parseCommand(`for a in ${sixtyFour}; do for b in ${sixtyFour}; do for c in ${sixtyFour}; do for d in ${sixtyFour}; do echo x; done; done; done; done`);
  assert.equal(nested.incomplete, true);
  assert.ok(nested.words.length <= 256, String(nested.words.length));
  assert.ok(nested.words.every(w => w[0] === "echo"));
});
test("a shell compound or reserved word the reader does not follow makes the rest of the command incomplete", () => {
  // Only plain commands, NAME=value and a closed for loop are followed; if/while/case/groups are never interpreted.
  const unread = (command: string, words: string[][] = []) => assert.deepEqual(parseCommand(command), { words, incomplete: true }, command);
  unread("p=harden; if true; then p=polish; fi; doan design-skill $p", []);
  unread("if true; then doan design-skill polish; fi");
  unread("if true\nthen\n  doan design-skill polish\nfi");
  unread("while false; do echo waiting; doan design-skill harden; done");
  unread("while false; do echo waiting; doan active; done");
  unread("until true; do doan active; done");
  unread("case $x in a) doan active;; esac");
  unread("{ doan active; }");
  unread("(cd /tmp && doan active)");
  unread("f() { doan active; }; f");
  unread("function f { doan active; }");
  unread("select p in a b; do doan active; done");
  unread("for ((i=0; i<2; i++)); do doan active; done");
  unread("done; doan active");
  unread("then doan active");
  // What ran before the construct is still read; nothing after it is, and no variable survives it.
  unread("doan design-skill harden; if true; then doan active; fi; doan design-skill $p", [["doan", "design-skill", "harden"]]);
  unread("p=harden; for x in 1; do while true; do p=polish; done; done; doan design-skill $p", []);
  // Quoted or non-leading reserved words are arguments.
  assert.deepEqual(parseCommand("echo if then while; doan 'if'"), { words: [["echo", "if", "then", "while"], ["doan", "if"]], incomplete: false });
});
