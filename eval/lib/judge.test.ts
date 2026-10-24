import assert from "node:assert/strict";
import { test } from "node:test";
import { buildJudgePrompt, checkList, finalResult, judgeCommand, judgeFor, parseJudgement, truncate } from "./judge.ts";

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
