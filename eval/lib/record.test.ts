import assert from "node:assert/strict";
import { test } from "node:test";
import { summary, roundRow, type RunRecord } from "./record.ts";

const run = (scenario: string, agent: "claude" | "codex", n: number, result: RunRecord["result"]): RunRecord =>
  ({ scenario, agent, n, dir: "", result, checks: [], judge: "skipped", durationSec: 1, exitCode: 0, timedOut: false });

test("the round row groups results by scenario and keeps repeats in order", () => {
  const row = roundRow({ date: "2026-10-24", versions: { claude: "2.1.310 (Claude Code)", codex: "codex-cli 0.164.0" }, guideSha256: "ab".repeat(32), cliVersion: "0.1.0" },
    [run("W1", "claude", 1, "pass"), run("W1", "codex", 1, "fail"), run("W1", "codex", 2, "pass"), run("R2", "claude", 1, "judge_error")]);
  assert.equal(row, `| 2026-10-24 | Claude Code 2.1.310, Codex 0.164.0 | ${"ab".repeat(6)} | 0.1.0 | W1: claude pass, codex fail/pass; R2: claude judge_error | |`);
});

test("known R2 Codex condition is noted without hiding or rewriting results", () => {
  const meta = { date: "2026-10-24", versions: {}, guideSha256: "", cliVersion: "" };
  const text = summary("round", meta, [{ ...run("R2", "codex", 1, "fail"), checks: [{ id: "selected_primary_background", pass: false, detail: "selection unavailable" }] }, run("R2", "claude", 1, "fail"), run("R2b", "codex", 1, "fail")]);
  assert.match(text, /expected fail: MCP disabled by design \(see R2b\)/);
  assert.match(text, /R2: codex fail, claude fail/);
  const candidates = text.split("## Issue candidates")[1];
  assert.ok(!candidates.includes("**R2 / codex"));
  assert.ok(candidates.includes("**R2 / claude"));
  assert.ok(candidates.includes("**R2b / codex"));
});


test("unexpected R2 Codex failures remain issue candidates", () => {
  const meta = { date: "2026-10-24", versions: {}, guideSha256: "", cliVersion: "" };
  const expected = { id: "selected_primary_background", pass: false, detail: "selection unavailable" };
  for (const checks of [[], [expected, { id: "other_elements_unchanged", pass: false, detail: "unexpected edit" }], [{ id: "checks_error", pass: false, detail: "broken check" }]]) {
    const text = summary("round", meta, [{ ...run("R2", "codex", 1, "fail"), checks }]);
    assert.match(text.split("## Issue candidates")[1], /\*\*R2 \/ codex/);
    assert.doesNotMatch(text, /expected fail:/);
  }
  for (const result of ["fail", "partial", "judge_error"] as const) {
    const text = summary("round", meta, [{ ...run("R2", "codex", 1, result), checks: [expected], timedOut: true }]);
    assert.match(text.split("## Issue candidates")[1], /\*\*R2 \/ codex/);
    assert.doesNotMatch(text, /expected fail:/);
  }
});

test("both by-design R2 Codex failed checks are noted without becoming issue candidates", () => {
  const meta = { date: "2026-10-24", versions: {}, guideSha256: "", cliVersion: "" };
  const checks = [
    { id: "selected_primary_background", pass: false, detail: "selection unavailable" },
    { id: "only_canvas_changed", pass: false, detail: "no file changed" },
  ];
  const text = summary("round", meta, [{ ...run("R2", "codex", 1, "fail"), checks }]);
  assert.match(text, /expected fail: MCP disabled by design \(see R2b\); recorded result: fail/);
  assert.match(text, /selected_primary_background, only_canvas_changed/);
  assert.match(text, /R2: codex fail/);
  assert.doesNotMatch(text.split("## Issue candidates")[1], /\*\*R2 \/ codex/);

  const unexpected = summary("round", meta, [{ ...run("R2", "codex", 1, "fail"), checks: [
    ...checks, { id: "other_elements_unchanged", pass: false, detail: "unexpected edit" },
  ] }]);
  assert.match(unexpected.split("## Issue candidates")[1], /\*\*R2 \/ codex/);
  assert.doesNotMatch(unexpected, /expected fail:/);
});
