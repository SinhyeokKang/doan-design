import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shellCommands, commandWords, parseCommand, readCommands, doanArgs, doanCommand, doanPositionals, incompleteRead, mcpTools, toolCalls, DOAN_BOOLEAN_FLAGS, DOAN_COMMAND_FLAGS, DOAN_COMMANDS, DOAN_VALUE_FLAGS } from "./transcript.ts";
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
// The reader mirrors doan's flag set: a flag it does not know makes the whole command unreadable, so a check would
// miss a command that only adds a newer flag (`doan init --storage repo`). Compared against run.go so a new flag fails here.
test("doanPositionals knows every flag doan's flag set defines, with its arity", () => {
  const source = readFileSync(new URL("../../cli/internal/cli/run.go", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("func Run("), source.indexOf("SplitArgs(args, fs)"));
  const count = (pattern: RegExp) => [...body.matchAll(pattern)].length;
  const names = (pattern: RegExp) => [...body.matchAll(pattern)].map(m => m[1]!);
  assert.deepEqual([...new Set(names(/\bfs\.(\w+)\(/g))].sort(), ["BoolVar", "Func", "StringVar"], "a new way of defining a flag needs reading here");
  const booleans = names(/\bfs\.BoolVar\(&[\w.]+, "([\w-]+)"/g);
  const looped = /\bfor name, target := range map\[string\]\*string\{([^}]*)\}/.exec(body)?.[1] ?? "";
  const values = [...names(/\bfs\.StringVar\(&[\w.]+, "([\w-]+)"/g), ...names(/\bfs\.Func\("([\w-]+)"/g), ...[...looped.matchAll(/"([\w-]+)":/g)].map(m => m[1]!)];
  assert.equal(booleans.length, count(/\bfs\.BoolVar\(/g), "every BoolVar has a literal name");
  assert.equal(values.length - [...looped.matchAll(/"([\w-]+)":/g)].length + (looped ? 1 : 0), count(/\bfs\.(?:StringVar|Func)\(/g), "every StringVar and Func has a literal name");
  for (const name of ["json", "storage", "session", "initialize", "o"]) assert.ok([...booleans, ...values].includes(name), name);
  // Which command takes which flag is a separate rule (the test below), so only the arity is read here.
  for (const name of values) {
    assert.deepEqual(doanArgs(["doan", "x", `--${name}`, "v", "y"])?.positionals, ["x", "y"], name);
    assert.deepEqual(doanArgs(["doan", "x", `-${name}=v`, "y"])?.positionals, ["x", "y"], name);
  }
  for (const name of booleans) {
    assert.deepEqual(doanArgs(["doan", "x", `--${name}`, "y"])?.positionals, ["x", "y"], name);
    assert.deepEqual(doanArgs(["doan", "x", `-${name}=false`, "y"])?.positionals, ["x", "y"], name);
  }
  // The other direction: a flag the CLI no longer defines would make the reader skip a word the CLI refuses on.
  assert.deepEqual([...DOAN_VALUE_FLAGS].sort(), [...new Set(values)].sort(), "value flags");
  assert.deepEqual([...DOAN_BOOLEAN_FLAGS].sort(), [...new Set(booleans)].sort(), "boolean flags");
});

// SplitArgs reads flags before, between and after the positionals, so a check that wants a flag must take it from the
// same reading, never from the raw words around the command.
test("doanArgs reads flags wherever doan's flag set does, and marks a command the CLI refuses", () => {
  assert.deepEqual(doanArgs(["doan", "--provider", "copilot", "onboarding", "-session=s", "check", "--json"]),
    { positionals: ["onboarding", "check"], flags: [{ name: "provider", value: "copilot" }, { name: "session", value: "s" }, { name: "json", value: undefined }], refused: false });
  // A value flag takes the next word whatever it looks like.
  assert.deepEqual(doanArgs(["doan", "work", "update", "a.html", "--note", "--prototype"]),
    { positionals: ["work", "update", "a.html"], flags: [{ name: "note", value: "--prototype" }], refused: false });
  assert.deepEqual(doanArgs(["doan", "config", "--", "--add-serve", "x"]), { positionals: ["config", "--add-serve", "x"], flags: [], refused: false });
  // Unknown flags, a missing value and a bad boolean are refused by the CLI; the words are still there for an attempt check.
  assert.deepEqual(doanArgs(["doan", "onboarding", "sign-in", "--stop", "--provider", "claude"]),
    { positionals: ["onboarding", "sign-in"], flags: [{ name: "stop", value: undefined }, { name: "provider", value: "claude" }], refused: true });
  assert.equal(doanArgs(["doan", "open", "--frame"])?.refused, true);
  assert.equal(doanArgs(["doan", "open", "--json=maybe"])?.refused, true);
  assert.equal(doanArgs(["git", "status"]), undefined);
});

// A Codex exec whose command the reader cannot see is still a command that ran, so no absence holds beside it.
test("a Codex exec_command whose cmd is not a plain string makes the read incomplete", () => {
  const event = (payload: object) => JSON.stringify({ type: "response_item", payload });
  const exec = (input: string) => event({ type: "custom_tool_call", name: "exec", input });
  for (const transcript of [
    exec("const p = '.doan/canvases/a.html'; await tools.exec_command({cmd: `doan open ${p}`});"),
    exec("const c = 'doan open .doan/canvases/a.html'; await tools.exec_command({cmd: c});"),
    exec("await tools.exec_command({cmd: 'doan ' + 'open .doan/canvases/a.html'});"),
    exec("const args = {cmd: 'doan open .doan/canvases/a.html'}; await tools.exec_command(args);"),
    event({ type: "function_call", name: "exec_command", arguments: JSON.stringify({ cmd: ["doan", "open", ".doan/canvases/a.html"] }) }),
    event({ type: "function_call", name: "exec_command", arguments: "{not json" }),
  ]) {
    const { commands } = toolCalls(transcript);
    assert.equal(incompleteRead(commands), true, transcript);
    assert.ok(!commands.flatMap(commandWords).some(words => words[0] === "doan"), transcript);
  }
  // A literal command stays readable.
  assert.equal(incompleteRead(toolCalls(exec("await tools.exec_command({cmd: 'doan active --json', workdir: '/tmp'});")).commands), false);
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
  for (const command of ["doan design-skill $p", "p=harden doan design-skill $p", "$c design-skill polish", "doan $c", 'doan design-skill "$p"'])
    assert.deepEqual(parseCommand(command), { words: [], incomplete: true }, command);
  // A substitution's own command runs and is read; the word it produces is still unknown.
  for (const command of ["doan design-skill $(echo harden)", "doan design-skill `echo harden`"])
    assert.deepEqual(parseCommand(command), { words: [["echo", "harden"]], incomplete: true }, command);
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

// The command names checks compare with are the CLI's: a renamed command would otherwise leave an absence check that
// can never fail. Compared with run.go's dispatch switch both ways, and every compared literal in eval/ with the list.
test("DOAN_COMMANDS is run.go's command switch, and eval compares only with those names", () => {
  const source = readFileSync(new URL("../../cli/internal/cli/run.go", import.meta.url), "utf8");
  const end = source.indexOf('usageError("Unknown command: " + cmd)');
  const body = source.slice(source.lastIndexOf("switch cmd {", end), end);
  assert.ok(end > 0 && body.length > 0, "run.go's dispatch switch needs reading here");
  assert.deepEqual([...DOAN_COMMANDS].sort(), [...body.matchAll(/^\s*case "([\w-]+)":/gm)].map(m => m[1]!).sort());
  const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "fixtures" || name === "seed" ? [] : sources(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
  const compared = new Set<string>();
  for (const path of sources(join(import.meta.dirname, ".."))) {
    const text = readFileSync(path, "utf8");
    for (const m of text.matchAll(/(?:doanCommand\([^)]*\)|positionals\[0\]|args\??\.?\[0\])\s*[!=]==\s*"([\w-]+)"/g)) compared.add(m[1]!);
    for (const m of text.matchAll(/command: ("[\w-]+"(?:\s*\|\s*"[\w-]+")*)/g)) for (const name of m[1]!.matchAll(/"([\w-]+)"/g)) compared.add(name[1]!);
  }
  // The search above must keep finding the comparisons it was written for.
  for (const name of ["active", "config", "design-skill", "export", "handoff", "init", "onboarding", "open"]) assert.ok(compared.has(name), `no comparison with ${name} found`);
  for (const name of compared) assert.ok(DOAN_COMMANDS.includes(name), `eval compares with ${name}, which run.go does not dispatch`);
});

// Run refuses a flag its command does not take before anything runs, so such a command is refused like an unknown flag.
test("DOAN_COMMAND_FLAGS is run.go's per-command flag table", () => {
  const source = readFileSync(new URL("../../cli/internal/cli/run.go", import.meta.url), "utf8");
  const start = source.indexOf('allowed := map[string]bool{"json": true, "repo": true}');
  const table = source.slice(start, source.indexOf("fs.Visit(", start));
  assert.ok(start > 0, "run.go's flag table needs reading here");
  const read: Record<string, string[]> = {};
  const cases = table.split(/^\s*case "/m).slice(1);
  for (const block of cases) {
    const name = block.slice(0, block.indexOf('"'));
    const flags = [...block.matchAll(/allowed\["([\w-]+)"\] = true/g)].map(m => m[1]!);
    if (/pos\[1\] == "update"/.test(block)) read[`${name} update`] = flags;
    else if (/allowed = map\[string\]bool\{"json": true\}/.test(block) && /range onboardingFlags/.test(block)) {
      const onboarding = readFileSync(new URL("../../cli/internal/cli/onboarding.go", import.meta.url), "utf8");
      const map = /var onboardingFlags = map\[string\]string\{([^}]*)\}/.exec(onboarding)?.[1] ?? "";
      read[name] = [...map.matchAll(/"([\w-]+)":/g)].map(m => m[1]!);
    } else read[name] = flags;
  }
  assert.equal(cases.length, Object.keys(read).length);
  // Every entry is a literal name, or onboarding's loop over its own table.
  assert.equal([...table.matchAll(/allowed\[/g)].length, [...table.matchAll(/allowed\["/g)].length + [...table.matchAll(/allowed\[name\] = true/g)].length, "every allowed flag is read here");
  const model = Object.fromEntries(Object.entries(DOAN_COMMAND_FLAGS).map(([name, flags]) => [name, [...flags].sort()]));
  assert.deepEqual(model, Object.fromEntries(Object.entries(read).map(([name, flags]) => [name, flags.sort()])));
  // What the table means for a command.
  assert.equal(doanArgs(["doan", "design-skill", "clarify", "--repo", ".", "--json"])?.refused, false);
  assert.equal(doanArgs(["doan", "design-skill", "clarify", "--frame", "x"])?.refused, true);
  assert.equal(doanArgs(["doan", "work", "update", "a.html", "--frame", "f", "--note", "n"])?.refused, false);
  assert.equal(doanArgs(["doan", "work", "start", "a.html", "--frame", "f"])?.refused, true);
  assert.equal(doanArgs(["doan", "onboarding", "status", "--session", "s", "--json"])?.refused, false);
  assert.equal(doanArgs(["doan", "--repo", ".", "onboarding", "status"])?.refused, true);
});

// What a command does with its positionals and repeated flags is the CLI's to say: each case runs the real CLI, and
// the reader must refuse exactly the ones the CLI answers with a usage error.
const cliRoot = mkdtempSync(join(tmpdir(), "doan-transcript-"));
const cli = join(cliRoot, "doan");
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(cliRoot, { recursive: true, force: true }));
test("the reader refuses the argument shapes the CLI refuses as usage errors", () => {
  const env = { ...process.env, HOME: cliRoot, DOAN_RUNTIME: join(cliRoot, "runtime.json") };
  const usage = (args: string[]) => {
    let stdout: string;
    try { stdout = execFileSync(cli, [...args, "--json"], { cwd: cliRoot, env, stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 }).toString(); }
    catch (error) { stdout = String((error as { stdout?: Buffer }).stdout ?? ""); }
    return JSON.parse(stdout).error?.code === "usage_error";
  };
  for (const args of [
    ["open", ".doan/canvases/a.html", "--frame", "f"],
    ["open", ".doan/canvases/a.html", "--frame", "x", "--frame", "f"],
    ["open", ".doan/canvases/a.html", ".doan/canvases/b.html"],
    ["open"],
    ["open", ".doan/canvases/a.html", "--prototype"],
    ["open", ".doan/canvases/a.html", "--frame", ""],
    ["export", ".doan/canvases/a.html", "-o", "out.html"],
    ["export", ".doan/canvases/a.html", "-o", "out.html", "--frame", "x", "--frame", "f", "--prototype"],
    ["export", ".doan/canvases/a.html"],
    ["export", ".doan/canvases/a.html", "-o", "out.html", "--frame", "f"],
    ["export", ".doan/canvases/a.html", "-o", "out.html", "--prototype"],
    ["export", ".doan/canvases/a.html", "b.html", "-o", "out.html"],
    ["design-skill", "clarify"],
    ["design-skill", "clarify", "quieter"],
    ["design-skill"],
    ["design-skill", ""],
    ["design-skill", "../clarify"],
    ["design-skill", "Clarify"],
    ["open", ".doan/canvases/a.html", "--frame", "f".repeat(200)],
    ["open", ".doan/canvases/a.html", "--frame", "f".repeat(201)],
    ["open", ".doan/canvases/a.html", "--frame", "é".repeat(200)],
    ["open", ".doan/canvases/a.html", "--frame", "a\tb"],
    ["open", ".doan/canvases/a.html", "--frame", "a\u007fb"],
    ["export", ".doan/canvases/a.html", "-o", "out.html", "--frame", "f".repeat(201), "--prototype"],
    ["export", ".doan/canvases/a.html", "-o", "out.html", "--frame", "a\nb", "--prototype"],
  ]) assert.equal(doanArgs(["doan", ...args, "--json"])?.refused, usage(args), args.join(" "));
});

// A substitution runs its command before the command around it; what it prints is unknown.
test("commands inside $(…) and backticks are read, also in assignments and double quotes", () => {
  const read = (command: string, words: string[][], incomplete = false) => assert.deepEqual(parseCommand(command), { words, incomplete }, command);
  read('body=$(doan design-skill clarify --json); echo "$body" | jq .', [["doan", "design-skill", "clarify", "--json"], ["echo", "$body"], ["jq", "."]]);
  read("sel=$(doan active --json)", [["doan", "active", "--json"]]);
  read("sel=`doan active --json`", [["doan", "active", "--json"]]);
  read('echo "$(doan design-skill clarify --json)"', [["doan", "design-skill", "clarify", "--json"], ["echo", "$()"]]);
  read("x=$(cd /tmp && doan active)", [["cd", "/tmp"], ["doan", "active"]]);
  read("x=$(echo $(doan active))", [["doan", "active"], ["echo", "$()"]]);
  read("for p in harden clarify; do x=$(doan design-skill $p --json); done", [["doan", "design-skill", "harden", "--json"], ["doan", "design-skill", "clarify", "--json"]]);
  // A substitution in a sh -c script was run by the outer shell, once.
  read('bash -c "echo $(doan active)"', [["doan", "active"], ["echo", "$()"]]);
  // Quoted or escaped, it is text; $((…)) is arithmetic.
  read("echo '$(doan active)'", [["echo", "$(doan active)"]]);
  read('echo "\\$(doan active)"', [["echo", "$(doan active)"]]);
  read("echo $((1 + 2)); doan active", [["echo", "$(())"], ["doan", "active"]]);
  // The substitution as the program: its command is read, what runs then is unknown.
  read("$(doan design-skill --json)", [["doan", "design-skill", "--json"]], true);
  // An unterminated substitution is not followed.
  read("x=$(doan design-skill clarify", [], true);
});

// A wrapper runs its operand: the reader takes the operand as the command, and refuses to guess past an option it
// does not know. xargs adds words from its input, so a doan run through it is never read completely.
test("env, timeout, nohup and nice run their operand; xargs into doan is incomplete", () => {
  const read = (command: string, words: string[][], incomplete = false) => assert.deepEqual(parseCommand(command), { words, incomplete }, command);
  read("env DOAN_RUNTIME=/tmp/r doan onboarding status --json", [["doan", "onboarding", "status", "--json"]]);
  read("env -i PATH=/bin -u FOO -- doan active", [["doan", "active"]]);
  read("/usr/bin/env doan active", [["doan", "active"]]);
  read("timeout 30 doan active --json", [["doan", "active", "--json"]]);
  read("timeout -s KILL -k 5 10s doan active", [["doan", "active"]]);
  read("timeout --signal=KILL --preserve-status 10 doan active", [["doan", "active"]]);
  read("nohup doan active & echo started", [["doan", "active"], ["echo", "started"]]);
  read("nice -n 10 doan active", [["doan", "active"]]);
  read("nice env timeout 5 nohup doan active", [["doan", "active"]]);
  read("env -S 'doan active'", [], true);
  read("timeout --bogus 5 doan active", [], true);
  read("doan design-skill --json | jq -r '.result.presets[].id' | xargs -I{} doan design-skill {} --json",
    [["doan", "design-skill", "--json"], ["jq", "-r", ".result.presets[].id"]], true);
  read("echo x | xargs sh -c 'doan active'", [["echo", "x"]], true);
  read("ls | xargs cat", [["ls"], ["xargs", "cat"]]);
});

// An unknown flag before the command may or may not take the next word, so which word is the command is unknown.
test("an unknown flag before the command leaves the command unknown, so the read is incomplete", () => {
  assert.deepEqual(parseCommand("doan --stop s1 onboarding cancel"), { words: [], incomplete: true });
  assert.deepEqual(parseCommand("doan --provider claude --stop onboarding sign-in"), { words: [], incomplete: true });
  // Inline or after the command, the command is still known.
  assert.deepEqual(parseCommand("doan --stop=s1 onboarding cancel"), { words: [["doan", "--stop=s1", "onboarding", "cancel"]], incomplete: false });
  assert.deepEqual(parseCommand("doan onboarding --stop s1 cancel"), { words: [["doan", "onboarding", "--stop", "s1", "cancel"]], incomplete: false });
});

// The shell drops a comment before it runs anything, so neither its words nor its quotes are part of a command.
test("a comment is not part of the command, and its quotes do not open a string", () => {
  const read = (command: string, words: string[][], incomplete = false) => assert.deepEqual(parseCommand(command), { words, incomplete }, command);
  read("doan design-skill polish  # read the polish preset", [["doan", "design-skill", "polish"]]);
  assert.equal(doanArgs(parseCommand("doan design-skill polish # read it").words[0]!)?.refused, false);
  read("# Next: `doan design-skill harden` if needed\ndoan active", [["doan", "active"]]);
  read("# Let's read the preset\nx=$(doan design-skill polish)", [["doan", "design-skill", "polish"]]);
  // Not at the start of a word, or quoted, it is text.
  read("echo a#b '#c' \"#d\"", [["echo", "a#b", "#c", "#d"]]);
});

test("command substitutions the reader cannot follow make the read incomplete", () => {
  // $( ( … ) … ) is a substitution whose body starts with a subshell, not arithmetic.
  assert.equal(parseCommand("echo $((doan design-skill polish) && (true))").incomplete, true);
  assert.deepEqual(parseCommand("echo $(( $(doan design-skill polish | wc -l) + 1 ))"), { words: [], incomplete: true });
  // An unquoted heredoc body runs its substitutions; a quoted one is data.
  assert.equal(parseCommand("cat <<EOF\n$(doan design-skill polish)\nEOF").incomplete, true);
  assert.deepEqual(parseCommand("cat <<'EOF'\n$(doan design-skill polish)\nEOF"), { words: [["cat"]], incomplete: false });
  // A function or case body may never run, so its substitutions are not runs either.
  for (const command of ['f() { echo "$(doan open x.html)"; }', 'case "$1" in run) out=$(doan active);; esac'])
    assert.deepEqual(parseCommand(command), { words: [], incomplete: true }, command);
  // Nesting past what the reader follows is incomplete, not a crash.
  const deep = "echo " + "$(echo ".repeat(2000) + "x" + ")".repeat(2000);
  assert.equal(parseCommand(deep).incomplete, true);
});

test("a wrapper option the shell may expand to nothing makes the read incomplete; time, exec and eval run their operand", () => {
  const read = (command: string, words: string[][], incomplete = false) => assert.deepEqual(parseCommand(command), { words, incomplete }, command);
  for (const command of ["timeout $T doan design-skill polish", "nice -n $N doan active", "env -u $V doan active"]) read(command, [], true);
  read("env DOAN_RUNTIME=$RT doan active", [["doan", "active"]]);
  read("time doan design-skill polish", [["doan", "design-skill", "polish"]]);
  read("/usr/bin/time -p doan active", [["doan", "active"]]);
  read("exec doan active", [["doan", "active"]]);
  read("eval 'doan design-skill polish'", [["doan", "design-skill", "polish"]]);
  read('eval "doan design-skill $p"', [], true);
});

// The shell takes a redirection and its target out of the command's words before it runs the command, so the doan
// argv never holds them; a quoted `>` is an ordinary word.
test("redirections and their targets are not words of the command", () => {
  const read = (command: string, words: string[][], incomplete = false) => assert.deepEqual(parseCommand(command), { words, incomplete }, command);
  const preset = ["doan", "design-skill", "document", "--json"];
  for (const tail of ["> /tmp/x", ">/tmp/x", ">> /tmp/x", "2>/dev/null", "2> /dev/null", "2>&1", ">/tmp/x 2>&1", "&> /tmp/x", "&>>/tmp/x", "< /dev/null", "<<< hi", ">| /tmp/x", "1>&2", "2>&-"])
    read(`doan design-skill document --json ${tail}`, [preset]);
  read("doan design-skill document --json>/tmp/x", [preset]);
  read(">/tmp/x doan design-skill document --json", [preset]);
  read("doan design-skill document --json 2>&1 | head -5", [preset, ["head", "-5"]]);
  read("doan open .doan/canvases/a.html --frame f --json 2>&1; echo done", [["doan", "open", ".doan/canvases/a.html", "--frame", "f", "--json"], ["echo", "done"]]);
  read("cat <<'EOF' > /tmp/x\nbody\nEOF\ndoan active", [["cat"], ["doan", "active"]]);
  // Quoted, a redirection operator is text.
  read("grep -c '>' ~/.zshrc", [["grep", "-c", ">", "~/.zshrc"]]);
  read('echo "a > b" ">>"', [["echo", "a > b", ">>"]]);
  // The read words are what doanArgs sees: the redirected preset read is not refused.
  assert.equal(doanArgs(commandWords("doan design-skill document --json > /tmp/x")[0]!)?.refused, false);
  // A redirection with no target is a syntax error, and a process substitution runs a command this reader does not.
  read("doan active >", [], true);
  read("diff <(doan design-skill polish --json) /tmp/x", [], true);
});

test("readCommands gives each command's redirections with their targets as the shell expands them", () => {
  assert.deepEqual(readCommands(`echo 'export A=1'>>~/.zshrc 2>/dev/null`), {
    commands: [{ words: ["echo", "export A=1"], redirects: [{ op: ">>", target: "~/.zshrc", unresolved: false }, { op: "2>", target: "/dev/null", unresolved: false }] }],
    incomplete: false,
  });
  assert.deepEqual(readCommands(`f=/tmp/x; echo hi > "$f"; echo hi > "$g"`).commands.flatMap(c => c.redirects), [
    { op: ">", target: "/tmp/x", unresolved: false },
    { op: ">", target: "$g", unresolved: true },
  ]);
  // A redirection on a loop's done applies to every command the loop ran.
  assert.deepEqual(readCommands("for p in a b; do echo $p; done >> /tmp/x").commands, [
    { words: ["echo", "a"], redirects: [{ op: ">>", target: "/tmp/x", unresolved: false }] },
    { words: ["echo", "b"], redirects: [{ op: ">>", target: "/tmp/x", unresolved: false }] },
  ]);
  // A command that is only a redirection still writes its target.
  assert.deepEqual(readCommands("> ~/.zshrc").commands, [{ words: [], redirects: [{ op: ">", target: "~/.zshrc", unresolved: false }] }]);
  assert.deepEqual(parseCommand("> ~/.zshrc"), { words: [], incomplete: false });
});

test("sudo runs its operand; a sudo option the reader does not know makes the read incomplete", () => {
  const read = (command: string, words: string[][], incomplete = false) => assert.deepEqual(parseCommand(command), { words, incomplete }, command);
  read("sudo doan design-skill clarify --json", [["doan", "design-skill", "clarify", "--json"]]);
  read("sudo -u me doan open .doan/canvases/a.html", [["doan", "open", ".doan/canvases/a.html"]]);
  read("sudo -E -uroot -- doan active", [["doan", "active"]]);
  read("/usr/bin/sudo env doan active", [["doan", "active"]]);
  read("sudo -X doan active", [], true);
});

// A script file, or an inline script in another language, may run doan where this reader cannot see it.
test("a script the reader cannot see into makes the read incomplete", () => {
  const read = (command: string, words: string[][], incomplete = false) => assert.deepEqual(parseCommand(command), { words, incomplete }, command);
  for (const command of ["bash steps.sh", "sh ./steps.sh", "zsh -x steps.sh", "./steps.sh", "source steps.sh", ". ./steps.sh",
    `node -e "require('child_process').execSync('doan active')"`, `python3 -c "import os; os.system('doan active')"`, `python -c 'import subprocess; subprocess.run(["doan", "active"])'`])
    read(command, [], true);
  read("echo 'doan active' | bash", [["echo", "doan active"]], true);
  // An inline script that does not mention doan runs no doan, and a shell -c script is read as before.
  read(`node -e "console.log(1)"`, [["node", "-e", "console.log(1)"]]);
  read("bash -c 'doan active'", [["doan", "active"]]);
});

test("an inline script that only names a path containing doan is read as it was", () => {
  const read = (command: string, words: string[][], incomplete = false) => assert.deepEqual(parseCommand(command), { words, incomplete }, command);
  read(`doan design-skill document --json > /tmp/doan-doc.json; python3 -I -c "import json;print(json.load(open('/tmp/doan-doc.json'))['result']['body'])"`,
    [["doan", "design-skill", "document", "--json"], ["python3", "-I", "-c", "import json;print(json.load(open('/tmp/doan-doc.json'))['result']['body'])"]]);
  read("python3 fix.py .doan/canvases/a.html", [["python3", "fix.py", ".doan/canvases/a.html"]]);
  read(`python3 -c "import subprocess; subprocess.run(['/usr/local/bin/doan', 'active'])"`, [], true);
});
