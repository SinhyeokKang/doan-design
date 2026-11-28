import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  assert.deepEqual(commandWords('doan active --repo="/tmp/my repo" --json'), [["doan", "active", "--repo=/tmp/my repo", "--json"]]);
  assert.deepEqual(commandWords('doan check -repo=\'active\''), [["doan", "check", "-repo=active"]]);
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
test("doan send --message takes a value, so its message is never a positional", () => {
  assert.deepEqual(doanPositionals(["doan", "send", ".doan/canvases/next.html", "--message", "-", "--json"]), ["send", ".doan/canvases/next.html"]);
  assert.deepEqual(doanPositionals(["doan", "send", "--message=Pass this on", ".doan/canvases/next.html"]), ["send", ".doan/canvases/next.html"]);
  assert.equal(doanPositionals(["doan", "send", ".doan/canvases/next.html", "--message"]), undefined);
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
  assert.deepEqual(doanArgs(["doan", "onboarding", "--provider", "copilot", "-session=s", "check", "--json"]),
    { positionals: ["onboarding", "check"], flags: [{ name: "provider", value: "copilot" }, { name: "session", value: "s" }, { name: "json", value: undefined }], refused: false });
  // A flag or -- before the command is refused (run.go), but its words are still read for an attempt check.
  assert.deepEqual(doanArgs(["doan", "--provider", "copilot", "onboarding", "-session=s", "check", "--json"]),
    { positionals: ["onboarding", "check"], flags: [{ name: "provider", value: "copilot" }, { name: "session", value: "s" }, { name: "json", value: undefined }], refused: true });
  assert.deepEqual(doanArgs(["doan", "--", "active"]), { positionals: ["active"], flags: [], refused: true });
  assert.equal(doanCommand(["doan", "--repo", ".", "active"]), undefined);
  assert.equal(doanCommand(["doan", "--json", "active"]), undefined);
  // Behind a trailing comment, and with an unresolved flag value, a flag-first call still never reads as run.
  assert.equal(doanArgs(parseCommand("doan --json active # status").words[0]!)?.refused, true);
  assert.deepEqual(parseCommand("doan --repo $R active"), { words: [], incomplete: true });
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

// Only `tools.exec_command(…)` is read as a call; any other way a script reaches exec_command still runs a command.
test("a Codex exec_command reached any other way than tools.exec_command(…) makes the read incomplete", () => {
  const exec = (input: string) => JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec", input } });
  for (const input of [
    "await tools?.exec_command({cmd: 'doan open .doan/canvases/a.html'});",
    "await tools[\"exec_command\"]({cmd: 'doan open .doan/canvases/a.html'});",
    "await tools['exec_command']({cmd: 'doan open .doan/canvases/a.html'});",
    "const run = tools.exec_command; await run({cmd: 'doan open .doan/canvases/a.html'});",
    "const { exec_command } = tools; await exec_command({cmd: 'doan open .doan/canvases/a.html'});",
  ]) {
    const { commands } = toolCalls(exec(input));
    assert.equal(incompleteRead(commands), true, input);
    assert.ok(!commands.flatMap(commandWords).some(words => words[0] === "doan"), input);
  }
  // A string or comment that only mentions it runs nothing.
  assert.deepEqual(toolCalls(exec("text('use exec_command'); // tools.exec_command\nawait tools.exec_command({cmd: 'doan active'});")).commands, ["doan active"]);
});

// Codex records each process an exec script ran (item_completed CommandExecution, with no call id) between the
// script's call and its output, so a template command is read from what actually ran.
test("a Codex exec script's template commands are read from the commands its run recorded", () => {
  const rollout = readFileSync(new URL("./fixtures/codex-template-exec.jsonl", import.meta.url), "utf8");
  const { commands } = toolCalls(rollout);
  assert.equal(incompleteRead(commands), false);
  const doan = commands.flatMap(commandWords).filter(words => words[0] === "doan").map(words => words.slice(1, 6).join(" "));
  for (const frame of ["plan-free", "plan-pro", "plan-team"]) assert.ok(doan.includes(`work update .doan/canvases/pricing.html --frame ${frame}`), frame);
  assert.ok(doan.includes("work done .doan/canvases/pricing.html --json"));
});

test("a template command stays unread when the run did not record a command for it", () => {
  const lines = readFileSync(new URL("./fixtures/codex-template-exec.jsonl", import.meta.url), "utf8").trim().split("\n");
  const ran = (line: string) => line.includes('"CommandExecution"');
  const [call, output] = [lines[0]!, lines.at(-1)!];
  const record = (command: unknown) => JSON.stringify({ type: "event_msg", payload: { type: "item_completed", item: { type: "CommandExecution", command, status: "completed" } } });
  const literal = (cmd: string) => record(["/bin/zsh", "-c", cmd]);
  const other = JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", call_id: "call_other", name: "exec", input: "text(await tools.exec_command({cmd:\"doan ls --json\"}));" } });
  for (const [label, rollout] of [
    // Nothing ran between the call and its output.
    ["no record", [call, output]],
    // Only the literal commands the script names ran, so nothing stands for the template.
    ["only literals", [call, literal("doan check --json"), literal("git diff -- .doan/canvases/pricing.html"), literal("doan work done .doan/canvases/pricing.html --json"), output]],
    // The script's output never arrived, so later commands may still be missing.
    ["no output", lines.slice(0, -1)],
    // A recorded command this reader cannot turn back into a shell script.
    ["unknown argv", [call, ...lines.filter(ran), record(["doan", "open", ".doan/canvases/pricing.html"]), output]],
    // Another script was running too, so a recorded command may be its, not this script's.
    ["overlapping script", [call, other, ...lines.filter(ran), output]],
  ] as const) {
    const { commands } = toolCalls(rollout.join("\n"));
    assert.equal(incompleteRead(commands), true, label);
  }
});

// A literal exec_command in a Codex exec script may stand in a branch that never runs, a function never called or after
// a throw; Codex records each process the script ran, so a literal counts as run only when a record matches it.
test("a Codex exec literal counts as run only when the script's window recorded it, once per record", () => {
  const event = (payload: object) => JSON.stringify({ type: "response_item", payload });
  const call = (input: string, id = "call_s") => event({ type: "custom_tool_call", call_id: id, name: "exec", input });
  const output = (id = "call_s") => event({ type: "custom_tool_call_output", call_id: id, output: "" });
  const record = (command: unknown) => JSON.stringify({ type: "event_msg", payload: { type: "item_completed", item: { type: "CommandExecution", command, status: "completed" } } });
  const ran = (cmd: string) => record(["/bin/zsh", "-c", cmd]);
  const exec = (cmd: string) => `await tools.exec_command({cmd: ${JSON.stringify(cmd)}});`;
  const read = (lines: string[]) => toolCalls(lines.join("\n"));
  for (const source of [
    `if (false) { ${exec("doan init")} } ${exec("doan active --json")}`,
    `async function later() { ${exec("doan init")} } ${exec("doan active --json")}`,
    `${exec("doan active --json")} throw new Error("stop"); ${exec("doan init")}`,
  ]) {
    const calls = read([call(source), ran("doan active --json"), output()]);
    assert.ok(calls.commands.includes("doan active --json"), source);
    assert.ok(!calls.commands.flatMap(commandWords).some(words => doanCommand(words) === "init"), source);
    assert.deepEqual(calls.commandCandidates, ["doan init"], source);
    // A command that ran without a record cannot be ruled out, so no absence check holds beside it.
    assert.equal(incompleteRead(calls.commands), true, source);
  }
  // A command named more than once runs as many times as the window recorded it.
  const twice = `${exec("doan check --json")} if (retry) { ${exec("doan check --json")} }`;
  assert.deepEqual(read([call(twice), ran("doan check --json"), output()]).commandCandidates, ["doan check --json"]);
  const both = read([call(twice), ran("doan check --json"), ran("doan check --json"), output()]);
  assert.equal(both.commandCandidates, undefined);
  assert.equal(incompleteRead(both.commands), false);
  // Every literal that has its record is run, and nothing is a candidate.
  const all = read([call(`${exec("doan active --json")} ${exec("doan ls --json")}`), ran("doan ls --json"), ran("doan active --json"), output()]);
  assert.deepEqual(all.commands, ["doan active --json", "doan ls --json"]);
  assert.equal(all.commandCandidates, undefined);
});

// Without records Codex wrote for this script alone, the literals are what is known to have run.
test("a Codex exec script's literals count as run when its window gives no usable record", () => {
  const event = (payload: object) => JSON.stringify({ type: "response_item", payload });
  const call = (input: string, id = "call_s") => event({ type: "custom_tool_call", call_id: id, name: "exec", input });
  const output = (id = "call_s") => event({ type: "custom_tool_call_output", call_id: id, output: "" });
  const record = (command: unknown) => JSON.stringify({ type: "event_msg", payload: { type: "item_completed", item: { type: "CommandExecution", command, status: "completed" } } });
  const ran = (cmd: string) => record(["/bin/zsh", "-c", cmd]);
  const source = `if (false) { await tools.exec_command({cmd: "doan init"}); } await tools.exec_command({cmd: "doan active --json"});`;
  const other = event({ type: "function_call", call_id: "call_o", name: "exec_command", arguments: JSON.stringify({ cmd: "doan ls --json" }) });
  for (const [label, lines] of [
    ["no record", [call(source), output()]],
    ["no output", [call(source), ran("doan active --json")]],
    ["shared window", [call(source), other, ran("doan active --json"), output(), event({ type: "function_call_output", call_id: "call_o", output: "" })]],
    ["unknown argv", [call(source), ran("doan active --json"), record(["doan", "init"]), output()]],
  ] as const) {
    const calls = toolCalls(lines.join("\n"));
    assert.ok(calls.commands.includes("doan init"), label);
    assert.ok(calls.commands.includes("doan active --json"), label);
    assert.equal(calls.commandCandidates, undefined, label);
  }
});

// A command run through a shell variable or `for` loop is still run, so a preset read through them is still a read;
// only the words the shell would execute count, never an echoed or quoted example.
test("commandWords expands loop and assigned variables where the shell would", () => {
  assert.deepEqual(commandWords("for p in harden clarify; do doan design-skill $p --json; done"),
    [["doan", "design-skill", "harden", "--json"], ["doan", "design-skill", "clarify", "--json"]]);
  assert.deepEqual(commandWords('for p in harden clarify\ndo\n  doan design-skill "${p}" --json | head -5\ndone'),
    [["doan", "design-skill", "harden", "--json"], ["head", "-5"], ["doan", "design-skill", "clarify", "--json"], ["head", "-5"]]);
  assert.deepEqual(commandWords("p=harden; doan design-skill $p --json"), [["doan", "design-skill", "harden", "--json"]]);
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
// Agents run zsh (Codex's exec headers show `/bin/zsh -lc`), which does not split an unquoted variable into words, while
// bash and sh do; a variable holding several words may therefore be one word or several.
test("a bare variable holding several words is unresolved, since zsh passes it as one word and bash splits it", () => {
  assert.deepEqual(parseCommand("ids='harden clarify'; for p in $ids; do doan design-skill $p; done"), { words: [], incomplete: true });
  assert.deepEqual(parseCommand("p='harden clarify'; doan design-skill $p"), { words: [], incomplete: true });
  assert.deepEqual(parseCommand("c='doan init'; $c"), { words: [], incomplete: true });
  // One word, or several quoted into one, reads the same in every shell.
  assert.deepEqual(parseCommand("p=harden; doan design-skill $p"), { words: [["doan", "design-skill", "harden"]], incomplete: false });
  assert.deepEqual(parseCommand("m='a b'; echo \"$m\""), { words: [["echo", "a b"]], incomplete: false });
});
// zsh passes `' harden'` with its space, where bash drops it, so the argument doan gets is not known.
test("a bare variable holding one word with surrounding whitespace is unresolved, since zsh keeps the whitespace", () => {
  assert.deepEqual(parseCommand("p=' harden'; doan design-skill $p"), { words: [], incomplete: true });
  assert.deepEqual(parseCommand("p='harden '; doan design-skill $p"), { words: [], incomplete: true });
  assert.deepEqual(parseCommand("for p in harden; do q=\"$p \"; doan design-skill $q; done"), { words: [], incomplete: true });
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
// Claude bounds polls with `for i in $(seq 1 15)`; bash and zsh split an unquoted substitution into words, so
// seq with whole-number operands is a list the reader knows.
test("a loop over seq with whole-number operands runs once per number seq prints", () => {
  const poll = (list: string) => `for i in ${list}; do out=$(doan onboarding status --session s --json); echo "$out" | grep -q running || break; sleep 1; done; echo "$out"`;
  const status = ["doan", "onboarding", "status", "--session", "s", "--json"];
  const read = parseCommand(poll("$(seq 1 15)"));
  assert.equal(read.incomplete, false);
  assert.equal(read.words.filter(words => words.join(" ") === status.join(" ")).length, 15);
  assert.deepEqual(commandWords("for i in $(seq 3); do echo $i; done"), [["seq", "3"], ["echo", "1"], ["echo", "2"], ["echo", "3"]]);
  assert.deepEqual(commandWords("for i in $(seq 2 2 6); do echo $i; done"), [["seq", "2", "2", "6"], ["echo", "2"], ["echo", "4"], ["echo", "6"]]);
  assert.deepEqual(commandWords("for i in $(seq 5 -2 1); do echo $i; done"), [["seq", "5", "-2", "1"], ["echo", "5"], ["echo", "3"], ["echo", "1"]]);
  // GNU and BSD seq both print nothing when an explicit step points away from the last number.
  assert.deepEqual(commandWords("for i in $(seq 1 -1 5); do echo $i; done; doan active"), [["seq", "1", "-1", "5"], ["doan", "active"]]);
  assert.deepEqual(commandWords("for i in a $(seq 2) b; do echo $i; done"), [["seq", "2"], ["echo", "a"], ["echo", "1"], ["echo", "2"], ["echo", "b"]]);
  assert.deepEqual(commandWords("for i in `seq 2`; do echo $i; done"), [["seq", "2"], ["echo", "1"], ["echo", "2"]]);
});
test("a loop over any other substitution, or seq the reader cannot evaluate, stays incomplete", () => {
  for (const list of [
    '"$(seq 1 3)"', // quoted: one word holding all the numbers
    "x$(seq 1 3)", "$(seq 1 3)x", // joined to other text
    "$(seq 1 300)", // past the loop budget
    "$(seq 1 0 3)", "$(seq 3 0 1)", // a zero step never ends
    "$(seq 3 1)", "$(seq 0)", // no step and counting down: GNU prints nothing, macOS's BSD seq counts down
    "$(seq -w 1 3)", "$(seq 1.5 3)", "$(seq a 3)", "$(seq)", "$(seq 1 2 3 4)", // options, fractions, words, wrong arity
    "$(seq 1 3 | tac)", "$(seq 1 3; doan init)", "$(echo 1 2)", "$(ls)",
  ]) {
    assert.equal(parseCommand(`for i in ${list}; do doan design-skill harden; done`).incomplete, true, list);
  }
  // A seq function or alias, or another IFS, changes what the loop gets.
  for (const before of ["seq() { echo 9; }", "alias seq='echo 9'", "IFS=,", "export IFS=,", "local IFS=,"]) {
    assert.equal(parseCommand(`${before}; for i in $(seq 1 3); do doan design-skill harden; done`).incomplete, true, before);
  }
});
test("a shell compound or reserved word the reader does not follow makes the rest of the command incomplete", () => {
  // Only plain commands, NAME=value, a closed for loop, a closed { …; } group and a function with such a body are
  // followed; if/while/case/subshells are never interpreted.
  const unread = (command: string, words: string[][] = []) => assert.deepEqual(parseCommand(command), { words, incomplete: true }, command);
  unread("p=harden; if true; then p=polish; fi; doan design-skill $p", []);
  unread("if true; then doan design-skill polish; fi");
  unread("if true\nthen\n  doan design-skill polish\nfi");
  unread("while false; do echo waiting; doan design-skill harden; done");
  unread("while false; do echo waiting; doan active; done");
  unread("until true; do doan active; done");
  unread("case $x in a) doan active;; esac");
  unread("(cd /tmp && doan active)");
  unread("f() ( doan active ); f");
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
  assert.equal(doanArgs(["doan", "onboarding", "status", "--repo", "."])?.refused, true);
});

// What a command does with its positionals and repeated flags is the CLI's to say: each case runs the real CLI, and
// the reader must refuse exactly the ones the CLI answers with a usage error.
const cliRoot = mkdtempSync(join(tmpdir(), "doan-transcript-"));
const cli = join(cliRoot, "doan");
before(() => execFileSync("go", ["build", "-o", cli, "./cli/cmd/doan"]));
after(() => rmSync(cliRoot, { recursive: true, force: true }));
test("the reader refuses the argument shapes the CLI refuses as usage errors", () => {
  const env = { ...process.env, HOME: cliRoot, DOAN_RUNTIME: join(cliRoot, "runtime.json") };
  execFileSync(cli, ["init", "--repo", cliRoot], { env });
  mkdirSync(join(cliRoot, ".doan/assets"), { recursive: true });
  writeFileSync(join(cliRoot, ".doan/assets/shared.css"), "body { margin: 0; }\n");
  writeFileSync(join(cliRoot, ".doan/canvases/a.html"), '<meta name="doan:canvas" content="a"><meta name="doan:width" content="800"><link rel="stylesheet" href="../assets/shared.css"><main data-doan-frame="main"></main>');
  const usage = (args: string[]) => {
    let stdout: string;
    try { stdout = execFileSync(cli, [...args, "--json"], { cwd: cliRoot, env, stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 }).toString(); }
    catch (error) { stdout = String((error as { stdout?: Buffer }).stdout ?? ""); }
    return JSON.parse(stdout).error?.code === "usage_error";
  };
  for (const args of [
    ["check"],
    ["check", ".doan/canvases/a.html"],
    ["check", ".doan/canvases/missing.html"],
    ["check", ".doan/assets/shared.css", "--repo", cliRoot, ".doan/canvases/a.html"],
    ["check", join(cliRoot, ".doan/assets/shared.css")],
    ["check", ".doan/config.json"],
    ["check", join(cliRoot, ".doan/config.json"), "--repo", cliRoot],
    ["check", "x.md"],
    ["check", "x.CSS"],
    ["check", ""],
    ["check", "../x.css"],
    ["check", ".doan/assets/"],
    ["check", ".doan/canvases/a.html", "x.md"],
    ["check", ".doan/canvases/a.html", "--frame", "main"],
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
    // The command must be the first argument (ARCHITECTURE §12 'Parsing, output and structure').
    ["--repo", ".", "design-skill"],
    ["--json", "design-skill"],
    ["-json=false", "design-skill"],
    ["-", "design-skill"],
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
  // A function or case body may never run, so its substitutions are not runs either: an uncalled function's body ran
  // nothing, a called one runs them, and a case is not followed.
  assert.deepEqual(parseCommand('f() { echo "$(doan open x.html)"; }'), { words: [], incomplete: false });
  assert.deepEqual(parseCommand('f() { echo "$(doan open x.html)"; }; f'), { words: [["doan", "open", "x.html"], ["echo", "$()"]], incomplete: false });
  assert.deepEqual(parseCommand('case "$1" in run) out=$(doan active);; esac'), { words: [], incomplete: true });
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

// The shell drops a backslash-newline outside single quotes, so a continued line is one command; agents write long
// doan calls this way.
test("a backslash-newline continues the command, outside single quotes", () => {
  const read = (command: string, words: string[][], incomplete = false) => assert.deepEqual(parseCommand(command), { words, incomplete }, command);
  read("doan design-skill audit \\\n  --json", [["doan", "design-skill", "audit", "--json"]]);
  read("doan \\\ninit", [["doan", "init"]]);
  read("doan export .doan/canvases/a.html \\\n  -o /tmp/a.html && \\\n  doan open .doan/canvases/a.html \\\n  --frame hero", [["doan", "export", ".doan/canvases/a.html", "-o", "/tmp/a.html"], ["doan", "open", ".doan/canvases/a.html", "--frame", "hero"]]);
  read("bash -c 'doan design-skill audit \\\n  --json'", [["doan", "design-skill", "audit", "--json"]]);
  read("echo \"a\\\nb\"", [["echo", "ab"]]);
  // Single quotes keep it, an escaped backslash ends the line, and a comment's backslash continues nothing.
  read("echo 'a\\\nb'", [["echo", "a\\\nb"]]);
  read("echo a\\\\\ndoan active", [["echo", "a\\"], ["doan", "active"]]);
  read("# note \\\ndoan active", [["doan", "active"]]);
  const exec = "exec\n/bin/zsh -lc 'doan design-skill audit \\\n  --json' in /tmp/repo succeeded in 2ms:\noutput";
  assert.deepEqual(toolCalls(exec).commands.flatMap(commandWords), [["doan", "design-skill", "audit", "--json"]]);
});

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
    commands: [{ words: ["echo", "export A=1"], homePaths: [undefined, undefined], redirects: [{ op: ">>", target: "~/.zshrc", unresolved: false, homePath: "/.zshrc" }, { op: "2>", target: "/dev/null", unresolved: false, homePath: undefined }] }],
    incomplete: false,
  });
  assert.deepEqual(readCommands(`f=/tmp/x; echo hi > "$f"; echo hi > "$g"`).commands.flatMap(c => c.redirects), [
    { op: ">", target: "/tmp/x", unresolved: false, homePath: undefined },
    { op: ">", target: "$g", unresolved: true, homePath: undefined },
  ]);
  // A redirection on a loop's done applies to every command the loop ran.
  assert.deepEqual(readCommands("for p in a b; do echo $p; done >> /tmp/x").commands, [
    { words: ["echo", "a"], homePaths: [undefined, undefined], redirects: [{ op: ">>", target: "/tmp/x", unresolved: false, homePath: undefined }] },
    { words: ["echo", "b"], homePaths: [undefined, undefined], redirects: [{ op: ">>", target: "/tmp/x", unresolved: false, homePath: undefined }] },
  ]);
  // A command that is only a redirection still writes its target.
  assert.deepEqual(readCommands("> ~/.zshrc").commands, [{ words: [], homePaths: [], redirects: [{ op: ">", target: "~/.zshrc", unresolved: false, homePath: "/.zshrc" }] }]);
  assert.deepEqual(parseCommand("> ~/.zshrc"), { words: [], incomplete: false });
});

// Only an unquoted leading `~` and a `$HOME` outside single quotes become the home directory; a variable assigned just
// the home directory carries it, and a quoted `'~'` or `'$HOME'` is the literal text.
test("readCommands marks the words and targets the shell expands into the home directory", () => {
  const target = (command: string) => { const r = readCommands(command).commands.flatMap(c => c.redirects).at(-1)!; return [r.target, r.homePath]; };
  for (const [command, expected] of [
    ["echo x >> ~/.zshrc", ["~/.zshrc", "/.zshrc"]],
    ['echo x >> "$HOME/.zshrc"', ["$HOME/.zshrc", "/.zshrc"]],
    ['echo x >> "$HOME"/.zshrc', ["$HOME/.zshrc", "/.zshrc"]],
    ["echo x >> ${HOME}/.zprofile", ["${HOME}/.zprofile", "/.zprofile"]],
    ["echo x >> ~", ["~", ""]],
    ["echo x >> '~/.zshrc'", ["~/.zshrc", undefined]],
    ['echo x >> "~/.zshrc"', ["~/.zshrc", undefined]],
    ["echo x >> '$HOME/.zshrc'", ["$HOME/.zshrc", undefined]],
    ["echo x >> \\$HOME/.zshrc", ["$HOME/.zshrc", undefined]],
    ["echo x >> \\~/.zshrc", ["~/.zshrc", undefined]],
    ['echo x >> ~"/.zshrc"', ["~/.zshrc", undefined]],
    ['echo x >> "$HOME".bak/.zshrc', ["$HOME.bak/.zshrc", undefined]],
    ['echo x >> "$HOME"x', ["$HOMEx", undefined]],
    ['D=$HOME; echo x >> "$D/.zshrc"', ["$D/.zshrc", "/.zshrc"]],
    ['D="$HOME/"; echo x >> $D.zshrc', ["$D.zshrc", "/.zshrc"]],
    ["D=~; echo x >> $D/.zshrc", ["~/.zshrc", "/.zshrc"]],
    ['D=$HOME; E="$D"; echo x >> ${E}/.zshrc', ["${E}/.zshrc", "/.zshrc"]],
    ["D='~'; echo x >> $D/.zshrc", ["~/.zshrc", undefined]],
    ["D=$HOME/sub; echo x >> $D/.zshrc", ["$D/.zshrc", undefined]],
    ["D=$HOME; D=/tmp; echo x >> $D/.zshrc", ["/tmp/.zshrc", undefined]],
    ["HOME=/tmp/h; echo x >> $HOME/.zshrc", ["/tmp/h/.zshrc", undefined]],
    ["for d in ~; do echo x >> $d/.zshrc; done", ["~/.zshrc", "/.zshrc"]],
    ["for d in '~'; do echo x >> $d/.zshrc; done", ["~/.zshrc", undefined]],
    ["for f in .zshrc; do echo x >> ~/$f; done", ["~/.zshrc", "/.zshrc"]],
    ['f=.zprofile; echo x >> "$HOME/$f"', ["$HOME/.zprofile", "/.zprofile"]],
    ['export D=$HOME; echo x >> "$D/.zshrc"', ["$D/.zshrc", "/.zshrc"]],
    ["local -r D=~ E=/tmp; echo x >> $D/.zshrc", ["$D/.zshrc", "/.zshrc"]],
    ["D=$HOME; export D=/tmp; echo x >> $D/.zshrc", ["$D/.zshrc", undefined]],
  ] as [string, [string, string | undefined]][]) assert.deepEqual(target(command), expected, command);
  assert.deepEqual(readCommands("tee -a ~/.zshrc '~/.zprofile' \"$HOME\"/.bashrc").commands[0]!.homePaths, [undefined, undefined, "/.zshrc", undefined, "/.bashrc"]);
  // The home path does not change what was read: `$HOME` stays unresolved, and a variable holding it is too.
  assert.deepEqual(parseCommand("D=$HOME; $D/bin/doan active"), { words: [], incomplete: true });
  assert.deepEqual(parseCommand("D=~; $D/bin/doan active"), { words: [["~/bin/doan", "active"]], incomplete: false });
});

// A backslash quotes the next character, so `\>` is a word, and inside `[[ … ]]` `<` and `>` compare strings.
test("an escaped operator and a [[ ]] comparison are not redirections", () => {
  assert.deepEqual(readCommands("echo a \\> ~/.zshrc").commands.map(c => [c.words, c.redirects]), [[["echo", "a", ">", "~/.zshrc"], []]]);
  assert.deepEqual(readCommands("[ a \\< b ]").commands.map(c => [c.words, c.redirects]), [[["[", "a", "<", "b", "]"], []]]);
  assert.deepEqual(readCommands("echo a\\ b \\| c").commands.map(c => c.words), [["echo", "a b", "|", "c"]]);
  assert.deepEqual(readCommands('[[ a > $b ]] && echo yes').commands.map(c => [c.words, c.redirects]), [[["[[", "a", ">", "$b", "]]"], []], [["echo", "yes"], []]]);
  // A redirection after the closing ]] still is one.
  assert.deepEqual(readCommands("[[ a < b ]] > /tmp/x").commands[0]!.redirects.map(r => r.target), ["/tmp/x"]);
  assert.equal(readCommands("echo a \\> ~/.zshrc").incomplete, false);
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
  // An inline script that does not mention doan runs no doan, and a shell -c script is read.
  read(`node -e "console.log(1)"`, [["node", "-e", "console.log(1)"]]);
  read("bash -c 'doan active'", [["doan", "active"]]);
});

test("an inline script that only names a path containing doan is read as it was", () => {
  const read = (command: string, words: string[][], incomplete = false) => assert.deepEqual(parseCommand(command), { words, incomplete }, command);
  read(`doan design-skill document --json > /tmp/doan-doc.json; python3 -I -c "import json;print(json.load(open('/tmp/doan-doc.json'))['result']['body'])"`,
    [["doan", "design-skill", "document", "--json"], ["python3", "-I", "-c", "import json;print(json.load(open('/tmp/doan-doc.json'))['result']['body'])"]]);
  read(`python3 -c "import subprocess; subprocess.run(['/usr/local/bin/doan', 'active'])"`, [], true);
});

// An interpreter's script is read only when it is inline (-c, -e) or a heredoc or here-string the transcript shows; a
// script file, a script read from a file or a pipe, and a find -exec into doan or a shell may run doan unseen.
test("an interpreter running a script the reader cannot see, or find -exec into doan, makes the read incomplete", () => {
  const read = (command: string, words: string[][], incomplete = false) => assert.deepEqual(parseCommand(command), { words, incomplete }, command);
  for (const command of [
    "python3 -I - .doan/canvases/a.html <<'EOF'\nimport os\nos.system('doan check --json')\nEOF",
    "node <<EOF\nrequire('child_process').execSync('doan ls --json')\nEOF",
    "python3 <<< 'import os; os.system(\"doan active\")'",
    "python3 /tmp/run.py",
    "python3 fix.py .doan/canvases/a.html",
    "node build.mjs",
    "python3 -u /tmp/run.py --repo .",
    // A switch after the script is the script's own argument, not an inline script.
    "python3 gen.py -c cfg.json",
    "python3 gen.py -m fast",
    "node build.mjs -e",
    "perl fix.pl -e",
    "ruby fix.rb -e",
    // A module is a script the transcript does not show.
    "python3 -m tools.publish",
    "python3 -I -m pip install x",
    "deno run x.ts",
    "python3 < /tmp/run.py",
    "node - < /tmp/run.js",
    "find . -name '*.html' -exec doan check {} \\;",
    "find . -execdir /usr/local/bin/doan check {} +",
  ]) read(command, [], true);
  read("cat /tmp/run.py | python3", [["cat", "/tmp/run.py"]], true);
  read("find .doan -exec sh -c 'doan check \"$1\"' _ {} \\;", [["find", ".doan", "-exec", "sh", "-c", 'doan check "$1"', "_", "{}", ";"]], true);
  // A script the transcript shows that does not name doan, a module, a version query and a find that runs no doan stay read.
  read("python3 - <<'EOF'\nimport json\nprint(json.load(open('.doan/canvases/a.html')))\nEOF", [["python3", "-"]]);
  read("python3 -I - .doan/canvases/a.html <<'EOF'\nimport sys\nprint(open(sys.argv[1]).read())\nEOF", [["python3", "-I", "-", ".doan/canvases/a.html"]]);
  read("doan ls --json | python3 -m json.tool", [["doan", "ls", "--json"], ["python3", "-m", "json.tool"]]);
  // An option's own value is not the script.
  read("python3 -W ignore -c 'print(1)'", [["python3", "-W", "ignore", "-c", "print(1)"]]);
  read("node -r ./setup.cjs -e 'console.log(1)'", [["node", "-r", "./setup.cjs", "-e", "console.log(1)"]]);
  read("python3 --version; node -v", [["python3", "--version"], ["node", "-v"]]);
  read("perl -0pi -e 's/a/b/' .doan/canvases/a.html", [["perl", "-0pi", "-e", "s/a/b/", ".doan/canvases/a.html"]]);
  read("cat <<'EOF' > /tmp/x\ndoan active\nEOF", [["cat"]]);
  read("find . -name '*.html' -exec cat {} \\;", [["find", ".", "-name", "*.html", "-exec", "cat", "{}", ";"]]);
  // A document-editing heredoc whose text names doan but that starts no process runs no doan.
  read("python3 -I - <<'EOF'\np='DESIGN.md'; s=open(p).read()\ns=s.replace('`doan check` warns on raw values', 'The design system: `doan check` warns')\nopen(p,'w').write(s)\nEOF", [["python3", "-I", "-"]]);
  for (const command of [
    "python3 - <<'EOF'\nimport os\nos.popen('doan ls --json').read()\nEOF",
    "perl <<'EOF'\nsystem \"doan\", \"active\";\nEOF",
    "ruby <<'EOF'\nputs %x(doan active)\nEOF",
    "osascript <<'EOF'\ndo shell script \"doan active\"\nEOF",
  ]) read(command, [], true);
  // Perl and Ruby run a backtick string as a command; to Python and Node it is text.
  read("perl <<'EOF'\nmy $out = `doan ls --json`;\nprint $out;\nEOF", [], true);
  read("ruby <<'EOF'\nputs `doan active`\nEOF", [], true);
  read("node <<'EOF'\nconsole.log(`run doan check`)\nEOF", [["node"]]);
  // find -exec into a shell -c script runs that script, which is read like any sh -c script.
  read("find .agents -type f -exec sh -c 'echo \"== $1\"; cat \"$1\"' _ {} \\;", [["find", ".agents", "-type", "f", "-exec", "sh", "-c", 'echo "== $1"; cat "$1"', "_", "{}", ";"], ["echo", "== $1"], ["cat", "$1"]]);
});

// Codex reads presets from a Python heredoc: a subprocess call whose argv list is all string literals is read as
// that doan command; a list built at run time, or a script file, may run any lookup.
test("a Python heredoc's literal doan argv lists are read, and anything dynamic stays incomplete", () => {
  const rollout = readFileSync(new URL("./fixtures/codex-python-heredoc.jsonl", import.meta.url), "utf8");
  const [literal, dynamic, file] = shellCommands(rollout);
  assert.deepEqual(parseCommand(literal!), { words: [["python3", "-"], ["doan", "design-skill", "context", "--json"], ["doan", "design-skill", "document", "--json"], ["tail", "-40"]], incomplete: false });
  assert.deepEqual(parseCommand(dynamic!), { words: [], incomplete: true });
  assert.deepEqual(parseCommand(file!), { words: [["cat"]], incomplete: true });

  const read = (command: string, words: string[][], incomplete = false) => assert.deepEqual(parseCommand(command), { words, incomplete }, command);
  read("python3 - <<'EOF'\nimport subprocess\nsubprocess.run(['doan', 'active'])\nEOF", [["python3", "-"], ["doan", "active"]]);
  read("python3 -I <<EOF\nimport subprocess\nprint(subprocess.check_output(['/usr/local/bin/doan', 'ls', '--json'], text=True))\nEOF", [["python3", "-I"], ["/usr/local/bin/doan", "ls", "--json"]]);
  // With an inline script the heredoc is only input data, so its calls do not run.
  read("python3 -c 'import sys; print(sys.stdin.read())' <<'EOF'\nimport subprocess\nsubprocess.run(['doan', 'active'])\nEOF", [["python3", "-c", "import sys; print(sys.stdin.read())"]]);
  for (const command of [
    // The shell expands an unquoted body before Python reads it.
    "python3 - <<EOF\nimport subprocess\nsubprocess.run(['doan', 'design-skill', '$P', '--json'])\nEOF",
    // A list held in a variable, a shell, a wrapper running doan, a string command, a comment, a string.
    "python3 - <<'EOF'\nimport subprocess\ncmd = ['doan', 'design-skill', 'document']\nsubprocess.run(cmd)\nEOF",
    // A literal list the call extends or slices is not its argv.
    "python3 - <<'EOF'\nimport subprocess\nname = 'audit'\nsubprocess.run(['doan', 'design-skill'] + [name])\nEOF",
    "python3 - <<'EOF'\nimport subprocess\nsubprocess.run(['doan', 'design-skill', 'audit', 'x'][:3], check=True)\nEOF",
    "python3 - <<'EOF'\nimport subprocess\nsubprocess.run(['doan', 'active'], shell=True)\nEOF",
    "python3 - <<'EOF'\nimport subprocess\nsubprocess.run(['env', 'doan', 'design-skill', 'audit'])\nEOF",
    "python3 - <<'EOF'\nimport os, subprocess\nsubprocess.run(['doan', 'active'])\nos.system('doan design-skill audit')\nEOF",
    "python3 - <<'EOF'\nimport subprocess\n# subprocess.run(['doan', 'design-skill', 'audit'])\nsubprocess.run(['doan', 'active'])\nEOF",
    "python3 - <<'EOF'\nimport subprocess\nprint(\"subprocess.run(['doan', 'design-skill', 'audit'])\")\nEOF",
    "python3 - <<'EOF'\nimport subprocess\n'''\nsubprocess.run(['doan', 'design-skill', 'audit'])\n'''\nEOF",
    "python3 - <<'EOF'\nimport subprocess\nsubprocess.run(['doan', f'design-skill', 'audit'])\nEOF",
    // Only Python is read this way; another interpreter's heredoc stays incomplete.
    "node <<'EOF'\nsubprocess.run(['doan', 'active'])\nEOF",
  ]) read(command, [], true);
});

// A Python heredoc writing canvases carries `doan:canvas` and `doan:width` markup. That markup runs nothing, so it
// does not make the body name doan; a doan word beside it still does.
test("doan: markup in a Python heredoc does not name doan, and a doan word beside it is still read", () => {
  const read = (command: string, words: string[][], incomplete = false) => assert.deepEqual(parseCommand(command), { words, incomplete }, command);
  const meta = `<meta name="doan:canvas" content="a"><meta name="doan:width" content="390">`;
  read(`python3 - <<'PY'\nimport subprocess\nfrom pathlib import Path\nPath('.doan/ds/a.html').write_text('''${meta}''')\nsubprocess.run(['git', 'status'])\nPY`, [["python3", "-"]]);
  read(`python3 - <<'PY'\nimport subprocess\nfrom pathlib import Path\nPath('.doan/ds/a.html').write_text('${meta}')\nsubprocess.run(['doan', 'check'])\nPY`, [["python3", "-"], ["doan", "check"]]);
  read(`python3 - <<'PY'\nimport os\nprint('${meta}')\nos.system('doan design-skill audit')\nPY`, [], true);
  read(`python3 - <<'PY'\nimport subprocess\nprint('''${meta}''')\nsubprocess.run(['doan', 'design-skill', 'audit'])\nPY`, [], true);
});

// Codex prints a multi-line command (a heredoc script, say) across several stderr lines; the header ends at the
// line with the working directory, before the status line.
test("a multi-line Codex exec header is read up to its working directory, not cut at its first line", () => {
  const stderr = readFileSync(new URL("./fixtures/codex-multiline-exec.stderr.log", import.meta.url), "utf8");
  const commands = shellCommands(stderr);
  assert.equal(commands.length, 1);
  assert.ok(commands[0]!.startsWith(`/bin/zsh -c "python3 - <<'PY'\nfrom pathlib import Path\n`), commands[0]);
  assert.ok(commands[0]!.endsWith(`write_text(mobile)\nPY"`), commands[0]);
  assert.deepEqual(parseCommand(commands[0]!), { words: [["python3", "-"]], incomplete: false });
  assert.equal(incompleteRead(commands), false);
  const header = `/bin/zsh -c "python3 - <<'PY'\nprint(\\"in /tmp\\")\nPY"`;
  for (const status of ["\n succeeded in 0ms:", " succeeded in 0ms:", "\n exited 1 in 4ms:", " exited 1 in 4ms:"])
    assert.deepEqual(shellCommands(`exec\n${header} in /tmp/doan-eval-R10/repo${status}\nout\n`), [header], status);
});

test("a command on a later line of a multi-line Codex exec header is read", () => {
  const commands = shellCommands("exec\n/bin/zsh -c \"echo start\ndoan open .doan/canvases/a.html --json\" in /tmp/repo\n succeeded in 3ms:\nok\n");
  assert.ok(commands.flatMap(commandWords).some(words => words[0] === "doan" && words[1] === "open"), JSON.stringify(commands));
  assert.equal(incompleteRead(commands), false);
});

test("a multi-line Codex exec header whose end is not in the log stays incomplete", () => {
  for (const tail of ["", "\n", "\nexec\n/bin/zsh -lc 'ls' in /tmp/repo\n succeeded in 1ms:\n"]) {
    const commands = shellCommands(`exec\n/bin/zsh -c "echo start\ndoan open a.html${tail}`);
    assert.ok(incompleteRead(commands), JSON.stringify(commands));
  }
});

// A brace group that collects two outputs into one file.
test("a brace group's commands are read, each with the redirections on its closing brace", () => {
  const read = readCommands("mkdir -p .doan/assets && { echo '/* source: brand/status.css */'; cat brand/status.css; } > .doan/assets/status.css && doan check --json");
  assert.equal(read.incomplete, false);
  assert.deepEqual(read.commands.map(command => command.words), [["mkdir", "-p", ".doan/assets"], ["echo", "/* source: brand/status.css */"], ["cat", "brand/status.css"], ["doan", "check", "--json"]]);
  for (const inner of [1, 2]) assert.deepEqual(read.commands[inner]!.redirects.map(redirect => [redirect.op, redirect.target]), [[">", ".doan/assets/status.css"]]);
  assert.deepEqual(read.commands[3]!.redirects, []);
  for (const command of ["{ doan active; }", "{\n  doan active\n}", "{ { doan active; }; }", "x=active; { doan $x; }"])
    assert.deepEqual(parseCommand(command), { words: [["doan", "active"]], incomplete: false }, command);
  // A brace group runs in the current shell: its assignments go on after it.
  assert.deepEqual(parseCommand("{ p=polish; }; doan design-skill $p"), { words: [["doan", "design-skill", "polish"]], incomplete: false });
  // A loop and a group nest both ways.
  assert.deepEqual(parseCommand("for p in a b; do { doan design-skill $p; }; done"), { words: [["doan", "design-skill", "a"], ["doan", "design-skill", "b"]], incomplete: false });
  assert.deepEqual(parseCommand("{ for p in a; do doan design-skill $p; done; } 2>/dev/null"), { words: [["doan", "design-skill", "a"]], incomplete: false });
});

test("a brace group the reader cannot close, or with words after its closing brace, is incomplete", () => {
  for (const command of ["{ doan active", "{ doan active }", "{ echo a; } extra; doan active", "}", "echo a; }", "{ if true; then doan active; fi; }"])
    assert.equal(parseCommand(command).incomplete, true, command);
  // What ran before it is still read.
  assert.deepEqual(parseCommand("doan active; { doan open a.html"), { words: [["doan", "active"]], incomplete: true });
});

// A helper function writes one canvas per call through a heredoc.
test("a shell function's body runs where it is called, with the call's arguments", () => {
  const command = "cd /tmp/r/.doan/canvases && mk() { cat > \"$1-mobile.html\" <<EOF\n<title>$2 (mobile)</title>\n$3\nEOF\n}\nmk profile Profile '  <section data-doan-frame=\"profile-form\">\n  </section>'\nmk billing Billing '  <section data-doan-frame=\"billing-form\">\n  </section>'\ncd ../.. && doan check --json; git status --short";
  const read = readCommands(command);
  assert.equal(read.incomplete, false);
  assert.deepEqual(read.commands.map(entry => entry.words), [["cd", "/tmp/r/.doan/canvases"], ["cat"], ["cat"], ["cd", "../.."], ["doan", "check", "--json"], ["git", "status", "--short"]]);
  assert.deepEqual(read.commands.filter(entry => entry.words[0] === "cat").map(entry => entry.redirects.map(redirect => [redirect.op, redirect.target, redirect.unresolved])), [[[">", "profile-mobile.html", false], ["<<", "EOF", false]], [[">", "billing-mobile.html", false], ["<<", "EOF", false]]]);
  for (const form of ["f() { doan active; }; f", "f () { doan active; }; f", "function f { doan active; }; f", "function f() { doan active; }; f", "function f () { doan active; }; f", "f()\n{\n  doan active\n}\nf", "f() {\n  doan $1\n}\nf active"])
    assert.deepEqual(parseCommand(form), { words: [["doan", "active"]], incomplete: false }, form);
  // Each call runs the body again.
  assert.deepEqual(parseCommand("r() { doan design-skill $1 --json; }; r polish; r harden"), { words: [["doan", "design-skill", "polish", "--json"], ["doan", "design-skill", "harden", "--json"]], incomplete: false });
  // Redirections on the definition's closing brace and on the call apply to the body's commands.
  const redirected = readCommands("f() { echo a; } > log.txt; f 2>/dev/null");
  assert.deepEqual(redirected.commands.map(entry => [entry.words, entry.redirects.map(redirect => redirect.target)]), [[["echo", "a"], ["log.txt", "/dev/null"]]]);
});

test("a function that is defined but never called runs nothing", () => {
  assert.deepEqual(parseCommand("f() { doan open a.html; }; echo done"), { words: [["echo", "done"]], incomplete: false });
  assert.deepEqual(parseCommand("function f { doan open a.html; }"), { words: [], incomplete: false });
  // A call before the definition runs an outside program of that name, not the body.
  assert.deepEqual(parseCommand("f; f() { doan open a.html; }"), { words: [["f"]], incomplete: false });
});

test("a function call the reader cannot follow is incomplete, and its arguments do not outlive it", () => {
  for (const command of [
    "f() { doan design-skill \"$@\"; }; f polish",
    "f() { doan design-skill $*; }; f polish",
    "f() { doan design-skill ${@}; }; f polish",
    "f() { [ $# -gt 0 ] && doan active; }; f a",
    "f() { shift; doan design-skill $1; }; f a polish",
    "f() { doan design-skill $1; }; f $UNKNOWN",
    "f() { f; }; f",
    "f() { if true; then doan active; fi; }; f",
    // $1 belonged to the call; after it the shell's own $1 is not known here.
    "f() { echo $1; }; f polish; doan design-skill $1",
  ]) assert.equal(parseCommand(command).incomplete, true, command);
});

test("a function's arguments carry where the shell expands them into the home directory", () => {
  const read = readCommands("w() { echo x >> \"$1/.zshrc\"; cat $1; }; w ~");
  assert.equal(read.incomplete, false);
  assert.deepEqual(read.commands.map(entry => [entry.words, entry.homePaths, entry.redirects.map(redirect => redirect.homePath)]), [[["echo", "x"], [undefined, undefined], ["/.zshrc"]], [["cat", "~"], [undefined, ""], []]]);
  // Outside the call, $1 is not the home directory any more.
  assert.deepEqual(readCommands("w() { :; }; w ~; echo x >> \"$1/.zshrc\"").commands.at(-1)!.redirects.map(redirect => [redirect.homePath, redirect.unresolved]), [[undefined, true]]);
});

test("a function the reader cannot track past its call or definition makes the read incomplete", () => {
  for (const command of [
    // An exported function runs in a child shell the reader reads fresh.
    "f() { doan open a.html; }; export -f f; bash -c f",
    "f() { doan open a.html; }; declare -fx f; bash -c f",
    // A return before the body's end skips what follows it.
    "f() { return; doan work start a.html; }; f",
    "f() { [ -f x ] || return; doan work start a.html; }; f",
    // unset without -f removes a variable of that name first; whether the function is still there is not known.
    "f() { doan open a.html; }; unset f; f",
    // An argument the reader cannot resolve leaves which word is $n unknown.
    "f() { echo $2; }; f $UNKNOWN polish",
  ]) assert.equal(parseCommand(command).incomplete, true, command);
  assert.deepEqual(parseCommand("f() { doan open a.html; }; unset -f f; f"), { words: [["unset", "-f", "f"], ["f"]], incomplete: false });
  assert.deepEqual(parseCommand("f() { doan active; return; }; f"), { words: [["doan", "active"], ["return"]], incomplete: false });
});

test("a function argument below the home directory keeps its home path in the body", () => {
  for (const command of ["w() { echo x > \"$1\"; }; w ~/.zshrc", "w() { echo x > $1; }; w ~/.zshrc"]) {
    const read = readCommands(command);
    assert.equal(read.incomplete, false, command);
    assert.deepEqual(read.commands.map(entry => entry.redirects.map(redirect => redirect.homePath)), [["/.zshrc"]], command);
  }
  assert.deepEqual(readCommands("w() { cp a \"$1/x\"; }; w ~/.config").commands.map(entry => entry.homePaths), [[undefined, undefined, "/.config/x"]]);
});

test("a function body that changes its scope, arguments or flow anywhere is not followed", () => {
  for (const command of [
    "x=open; f() { local x; x=ls; }; f; doan $x a",
    "x=ls; f() { declare x=open; }; f; doan $x a",
    "f() { set -- open; doan $1 a; }; f x",
    "f() { for x in 1; do shift; done; doan open $1; }; f a b",
    "f() { { shift; }; doan open \"$1\"; }; f a b",
    "f() { for x in 1; do return; done; doan open a; }; f",
    "f() { { return; }; doan open a; }; f",
    "f() { exit; doan open a; }; f",
    "f() { trap 'doan open a' EXIT; }; f",
    "f() { echo $(doan open \"$@\"); }; f a",
    "f() { echo $(doan open $#); }; f a",
    "f() { doan $10 a; }; f 1 2 3 4 5 6 7 8 9 open",
    "f() { doan ${1:-open} a; }; f",
    "f() { doan open a; }; time f",
    "f() { doan open a; }; nohup f",
  ]) assert.equal(parseCommand(command).incomplete, true, command);
  // ${N} braced is the Nth argument, and a return that ends the body skips nothing.
  assert.deepEqual(parseCommand("f() { doan ${10} a; }; f 1 2 3 4 5 6 7 8 9 open"), { words: [["doan", "open", "a"]], incomplete: false });
});

test("a Codex exec header ends at any status line, so its output is never read as the command", () => {
  const commands = shellCommands("exec\n/bin/zsh -lc 'doan active' in /tmp/repo\n declined in 0ms:\ncopied\nresult in /x\n succeeded in 1ms:\n");
  assert.deepEqual(commands, ["/bin/zsh -lc 'doan active'"]);
});
