import { readFileSync } from "node:fs";
import { toolCalls } from "./transcript.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildJudgePrompt, checkList, finalResult, fixtureProblem, judgeCommand, judgeFor, parseJudgement, truncate } from "./judge.ts";

const passing = [{ id: "a", pass: true, detail: "" }];
const failing = [{ id: "a", pass: true, detail: "" }, { id: "b", pass: false, detail: "x" }];
const judged = (verdict: "pass" | "partial" | "fail") => ({ verdict, reasons: [], stalls: [], layer: "none" as const });

test("a failed automatic check decides the result whatever the judge says", () => {
  assert.equal(finalResult(failing, judged("pass")), "fail");
  assert.equal(finalResult(failing, null), "fail");
  assert.equal(finalResult(passing, judged("partial")), "partial");
  assert.equal(finalResult(passing, "skipped"), "pass");
  assert.equal(finalResult(passing, null), "judge_error");
  assert.equal(finalResult([], "skipped"), "fail");
});

test("judge output is parsed, and anything else is a judge error", () => {
  const body = { verdict: "partial", reasons: ["r"], stalls: ["s"], layer: "guide" };
  assert.deepEqual(parseJudgement(JSON.stringify(body)), body);
  assert.deepEqual(parseJudgement("Here you go:\n```json\n" + JSON.stringify(body) + "\n```\n"), body);
  for (const bad of ["", "pass", "{", JSON.stringify({ ...body, verdict: "ok" }), JSON.stringify({ ...body, layer: "ui" }), JSON.stringify({ ...body, reasons: "r" })])
    assert.equal(parseJudgement(bad), null, bad);
});

test("long text is cut and says so", () => {
  assert.deepEqual(truncate("abc", 5, "head"), { text: "abc", truncated: false });
  assert.deepEqual(truncate("abcdef", 3, "head"), { text: "abc", truncated: true });
  assert.deepEqual(truncate("abcdef", 3, "tail"), { text: "def", truncated: true });
  const prompt = buildJudgePrompt({ rubric: "R", prompt: "P", checks: passing, changed: ["a"], diff: "d".repeat(50), transcript: "t".repeat(50) }, { diff: 10, transcript: 10, changed: 10, checks: 1000 });
  assert.match(prompt, /Diff \(truncated to the first 10 characters\)/);
  assert.match(prompt, /Transcript \(truncated to the last 10 characters\)/);
  assert.ok(!prompt.includes("d".repeat(11)));
});

test("the other family judges", () => {
  assert.equal(judgeFor("claude"), "codex");
  assert.equal(judgeFor("codex"), "claude");
  assert.deepEqual(judgeCommand("claude", "P", "/o"), { cmd: "claude", args: ["-p", "--tools", "", "--", "P"] });
  assert.deepEqual(judgeCommand("codex", "P", "/o"), { cmd: "codex", args: ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--output-last-message", "/o", "P"] });
});

test("checks.ts output must be a list of well-formed checks", () => {
  assert.deepEqual(checkList(passing), passing);
  for (const bad of [[], "x", [{ id: "a", pass: "false", detail: "" }], [{ id: "a", pass: 1, detail: "" }], [{ id: "a", pass: true }], [null]]) {
    const result = checkList(bad);
    assert.equal(result.length, 1, JSON.stringify(bad));
    assert.deepEqual([result[0].id, result[0].pass], ["checks_error", false]);
  }
});

test("the changed-file list and check details are capped in the judge prompt", () => {
  const prompt = buildJudgePrompt({ rubric: "", prompt: "", checks: [{ id: "a", pass: true, detail: "x".repeat(100) }], changed: Array.from({ length: 30 }, (_, i) => `f${i}`), diff: "", transcript: "" }, { diff: 10, transcript: 10, changed: 20, checks: 50 });
  assert.match(prompt, /f19\n\(10 more files\)/);
  assert.ok(!prompt.includes("f20"));
  assert.match(prompt, /Automatic checks \(truncated/);
});

test("a fixture whose checks could not run fails the self-test, whichever fixture it is", () => {
  // run.ts turns a throwing checks.ts into this; checkList does the same for a malformed result.
  const thrown = [{ id: "checks_error", pass: false, detail: "TypeError: cannot read properties of null" }];
  for (const broken of [thrown, checkList([{ id: "a", pass: "no" }]), checkList([])]) {
    assert.match(fixtureProblem("fail", broken, finalResult(broken, "skipped")) ?? "", /checks_error/);
    assert.match(fixtureProblem("pass", broken, finalResult(broken, "skipped")) ?? "", /checks_error/);
  }
  assert.equal(fixtureProblem("fail", failing, finalResult(failing, "skipped")), null);
  assert.equal(fixtureProblem("pass", passing, finalResult(passing, "skipped")), null);
  assert.match(fixtureProblem("fail", passing, finalResult(passing, "skipped")) ?? "", /all 1 passed/);
});

test("active invocation evidence survives even an oversized command summary", () => {
  const prompt = buildJudgePrompt({ rubric: "", prompt: "", checks: [], changed: [], diff: "", transcript: "log tail", calls: {
    commands: ["echo " + "x".repeat(30000), "doan active --json"], mcpTools: ["mcp__doan__active"],
  } });
  assert.ok(prompt.includes('"doanActive":{"shellInvoked":true}'));
  assert.ok(prompt.includes("log tail"));
  assert.ok(!prompt.includes("x".repeat(20001)));
});

test("batched rollout errors reach the judge without copying the rollout transcript", () => {
  const rollout = readFileSync(new URL("./fixtures/codex-batched-output.jsonl", import.meta.url), "utf8");
  const prompt = buildJudgePrompt({ rubric: "", prompt: "", checks: [], changed: [], diff: "", transcript: "FINAL_ANSWER", calls: toolCalls(rollout) });
  assert.match(prompt, /app_not_running/);
  assert.match(prompt, /Cannot connect to Doan: operation not permitted/);
  assert.match(prompt, /batch/);
  assert.match(prompt, /FINAL_ANSWER/);
  assert.ok(!prompt.includes("nextSteps"));
});

test("long repeated heredocs cannot displace MCP tools or batch excerpts", () => {
  // loop1 W1-codex repeated a 10,412-character Python heredoc in commands and outputs.
  const command = "python3 - <<'PY'\n" + "x".repeat(25000) + "\nPY\ndoan check";
  const calls = { commands: [command, command, "doan active --json"], mcpTools: ["mcp__doan__active"], outputs: [
    { name: "exec_command", command, callId: "batch-1", scope: "batch" as const, excerpt: "FIRST_BATCH" },
    { name: "exec_command", command: "doan ls", callId: "batch-1", scope: "batch" as const, excerpt: "FIRST_BATCH" },
    { name: "mcp__doan__active", callId: "batch-2", scope: "batch" as const, excerpt: "LAST_BATCH" },
  ] };
  const prompt = buildJudgePrompt({ rubric: "", prompt: "", checks: [], changed: [], diff: "", transcript: "", calls });
  const summary = JSON.parse(prompt.split("## Invoked commands and MCP tools")[1].split("<<<\n")[1].split("\n>>>")[0]);
  assert.deepEqual(summary.mcpTools, ["mcp__doan__active"]);
  assert.deepEqual(summary.doanActive, { shellInvoked: true });
  assert.equal(summary.commands.length, 2);
  assert.ok(summary.commands.every((s: string) => s.length <= 200));
  assert.equal((JSON.stringify(summary).match(/FIRST_BATCH/g) ?? []).length, 1);
  assert.match(JSON.stringify(summary), /LAST_BATCH/);
});

test("tool lookup input and empty results reach the judge", () => {
  const rollout = readFileSync(new URL("./fixtures/codex-tool-search.jsonl", import.meta.url), "utf8");
  const calls = toolCalls(rollout);
  const prompt = buildJudgePrompt({ rubric: "", prompt: "", checks: [], changed: [], diff: "", transcript: "", calls });
  assert.match(prompt, /"toolSearches":\[/);
  assert.match(prompt, /ALL_TOOLS/);
  assert.match(prompt, /"excerpt":"\[\]"/);
  assert.match(prompt, /app_not_running/);
  assert.match(prompt, /toolSearches show the agent looking for tools; an empty result means no available tool matched that lookup/);
});


test("doan calls anywhere in long commands survive extraction and batch deduplication", () => {
  const prefix = "python3 - <<'PY'\n" + "x".repeat(12000) + "\nPY\n";
  const commands = [prefix + "doan check --json", prefix + "doan ls --json", prefix + "doan active\necho " + "y".repeat(12000)];
  const prompt = buildJudgePrompt({ rubric: "", prompt: "", checks: [], changed: [], diff: "", transcript: "", calls: {
    commands, mcpTools: [], outputs: commands.map(command => ({ name: "exec_command", command, callId: "batch", scope: "batch" as const, excerpt: "RESULT" })),
  } });
  const summary = JSON.parse(prompt.split("## Invoked commands and MCP tools")[1].split("<<<\n")[1].split("\n>>>")[0]);
  assert.deepEqual(summary.commands, ["doan check --json", "doan ls --json", "doan active"]);
  assert.deepEqual(summary.outputs[0].calls, summary.commands);
});

test("many tool searches leave room for invocation output", () => {
  const prompt = buildJudgePrompt({ rubric: "", prompt: "", checks: [], changed: [], diff: "", transcript: "", calls: {
    commands: [], mcpTools: [], toolSearches: Array.from({ length: 100 }, (_, i) => ({ callId: `lookup-${i}`, input: "x".repeat(200), excerpt: "y".repeat(300) })),
    outputs: [{ name: "mcp__doan__active", callId: "active", scope: "call", excerpt: "RETAINED_OUTPUT" }],
  } });
  assert.match(prompt, /RETAINED_OUTPUT/);
  const summary = JSON.parse(prompt.split("## Invoked commands and MCP tools")[1].split("<<<\n")[1].split("\n>>>")[0]);
  assert.equal(summary.toolSearches.length, 10);
  assert.equal(summary.omittedToolSearches, 90);
});

test("unresolved patch candidates are labelled and cannot evict invocation summaries", () => {
  const prompt = buildJudgePrompt({ rubric: "", prompt: "", checks: [], changed: [], diff: "", transcript: "", calls: {
    commands: ["doan active --json"], mcpTools: ["mcp__doan__active"], patchCandidates: ["x".repeat(30_000)],
  } });
  assert.match(prompt, /"mcpTools":\["mcp__doan__active"\]/);
  assert.match(prompt, /Unresolved patch candidates.*truncated/);
  assert.ok(prompt.length < 10_000);
});

function invocationSummary(transcript: string) {
  const prompt = buildJudgePrompt({ rubric: "", prompt: "", checks: [], changed: [], diff: "", transcript });
  const summary = JSON.parse(prompt.split("## Invoked commands and MCP tools")[1].split("<<<\n")[1].split("\n>>>")[0]);
  return { prompt, summary };
}

test("preset shell lookups retain IDs and distinguish executed commands from quoted examples", () => {
  const transcript = [
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Run doan design-skill prose-only" }] } }),
    ...["doan design-skill --json", "DOAN_RUNTIME=/tmp/runtime command -p /tmp/doan --repo '/tmp/repo path' design-skill 'clarify' --json", "doan --json design-skill --repo=/tmp/repo context", "echo 'doan design-skill quoted'", "command -v doan design-skill discovery-only", "doan --repo design-skill skill", "doan active --json"].map(command =>
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] } })),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "Guide: doan design-skill guide-only" }] } }),
  ].join("\n");
  const { summary } = invocationSummary(transcript);
  assert.deepEqual(summary.doanDesignSkill, { shellInvoked: true, shellIds: ["clarify", "context"] });
  assert.deepEqual(summary.doanActive, { shellInvoked: true });
  const quoted = invocationSummary("Guide: doan design-skill clarify\n" + JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "printf '%s' 'doan design-skill clarify'" } }] } })).summary;
  assert.deepEqual(quoted.doanDesignSkill, { shellInvoked: false, shellIds: [] });
});

// Any MCP call stays visible to the judge as a tool name; only the shell path counts as a doan lookup.
test("MCP calls named like doan tools are listed but are not doan lookups", () => {
  const transcript = [
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__doan__design_skill", input: { id: "clarify" } }, { type: "tool_use", name: "mcp__doan__active", input: {} }] } }),
    JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "mcp__doan__design_skill", arguments: JSON.stringify({ id: "context" }) } }),
    JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "functions.exec", input: 'await tools.mcp__doan__design_skill({id: "document"});' } }),
  ].join("\n");
  const { summary } = invocationSummary(transcript);
  assert.deepEqual(summary.doanDesignSkill, { shellInvoked: false, shellIds: [] });
  assert.deepEqual(summary.doanActive, { shellInvoked: false });
  assert.deepEqual(summary.mcpTools, ["mcp__doan__design_skill", "mcp__doan__active"]);
  assert.ok(!("mcpDesignSkillIds" in toolCalls(transcript)));
});

test("40 KB synthetic preset bodies cannot evict lookup evidence from the judge budgets", () => {
  // Real preset bodies are not available in batch R; integration rechecks the longest one.
  const body = "SYNTHETIC_PRESET_BODY\n".repeat(2500);
  assert.ok(Buffer.byteLength(body) >= 40 * 1024);
  const transcript = [
    JSON.stringify({ type: "response_item", payload: { type: "function_call", call_id: "shell", name: "exec_command", arguments: JSON.stringify({ cmd: "doan design-skill clarify --json" }) } }),
    JSON.stringify({ type: "response_item", payload: { type: "function_call_output", call_id: "shell", output: body } }),
    JSON.stringify({ type: "response_item", payload: { type: "function_call", call_id: "mcp", name: "mcp__doan__design_skill", arguments: JSON.stringify({ id: "context" }) } }),
    JSON.stringify({ type: "response_item", payload: { type: "function_call_output", call_id: "mcp", output: body } }),
  ].join("\n");
  const { prompt, summary } = invocationSummary(transcript);
  assert.deepEqual(summary.doanDesignSkill, { shellInvoked: true, shellIds: ["clarify"] });
  assert.ok(JSON.stringify(summary).length <= 20_000);
  assert.ok(summary.outputs.every((output: { excerpt: string }) => output.excerpt.length <= 300));
  assert.match(prompt, /Transcript \(truncated to the last 40000 characters\)/);
  assert.ok(prompt.length < 45_000);
});
