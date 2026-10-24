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
  assert.ok(prompt.includes('"doanActive":{"shellInvoked":true,"mcpInvoked":true}'));
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
