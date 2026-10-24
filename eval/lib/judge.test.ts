import assert from "node:assert/strict";
import { test } from "node:test";
import { buildJudgePrompt, finalResult, judgeCommand, judgeFor, parseJudgement, truncate } from "./judge.ts";

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
  const prompt = buildJudgePrompt({ rubric: "R", prompt: "P", checks: passing, changed: ["a"], diff: "d".repeat(50), transcript: "t".repeat(50) }, { diff: 10, transcript: 10 });
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
