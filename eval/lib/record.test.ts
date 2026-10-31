import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { KNOWN_CONDITIONS } from "./known-conditions.ts";
import { summary, roundRow, type RunRecord } from "./record.ts";

// The table is empty while no condition is known; a stand-in entry exercises the mechanism.
const CONDITION = { scenario: "X1", agent: "codex" as const, expectedFailedChecks: ["first_check", "second_check"], note: "expected fail: stand-in condition" };
before(() => { KNOWN_CONDITIONS.push(CONDITION); });
after(() => { KNOWN_CONDITIONS.splice(KNOWN_CONDITIONS.indexOf(CONDITION), 1); });

const run = (scenario: string, agent: "claude" | "codex", n: number, result: RunRecord["result"]): RunRecord =>
  ({ scenario, agent, n, dir: "", result, checks: [], judge: "skipped", durationSec: 1, exitCode: 0, timedOut: false });

test("a known condition excludes only its expected check failures", () => {
  const meta = { date: "2026-10-24", versions: {}, guideSha256: "", cliVersion: "" };
  const checks = ["first_check", "second_check"].map(id => ({ id, pass: false, detail: "expected" }));
  const record = { ...run("X1", "codex", 1, "fail"), checks };
  const text = summary("round", meta, [record, { ...record, agent: "claude" }]);
  assert.match(text, /expected fail: stand-in condition; recorded result: fail/);
  assert.match(text, /X1: codex fail, claude fail/);
  assert.doesNotMatch(text.split("## Issue candidates")[1], /\*\*X1 \/ codex/);
  assert.match(text.split("## Issue candidates")[1], /\*\*X1 \/ claude/);
  for (const unexpected of [
    { ...record, checks: [...checks, { id: "agent_cli_provenance", pass: false, detail: "wrong CLI" }] },
    { ...record, checks: [] },
    { ...record, timedOut: true },
    { ...record, result: "judge_error" as const },
  ]) {
    assert.match(summary("round", meta, [unexpected]).split("## Issue candidates")[1], /\*\*X1 \/ codex/);
  }
});

test("the round row groups results by scenario and keeps repeats in order", () => {
  const row = roundRow({ date: "2026-10-24", versions: { claude: "2.1.310 (Claude Code)", codex: "codex-cli 0.164.0" }, guideSha256: "ab".repeat(32), cliVersion: "0.1.0" },
    [run("W1", "claude", 1, "pass"), run("W1", "codex", 1, "fail"), run("W1", "codex", 2, "pass"), run("R2", "claude", 1, "judge_error")]);
  assert.equal(row, `| 2026-10-24 | Claude Code 2.1.310, Codex 0.164.0 | ${"ab".repeat(6)} | 0.1.0 | W1: claude pass, codex fail/pass; R2: claude judge_error | |`);
});

// Codex reaches the app socket through the workspace's project rule, so these are no longer known conditions.
test("R2, O1 and O2 Codex failures are issue candidates", () => {
  const meta = { date: "2026-10-31", versions: {}, guideSha256: "", cliVersion: "" };
  const formerlyExpected = {
    R2: ["selected_primary_background", "only_canvas_changed"],
    O1: ["onboarding_started", "session_from_start", "inspected_repo_path", "selected_with_initialize", "complete_only_when_ready", "completion_confirmed"],
    O2: ["onboarding_started", "session_from_start", "claude_sign_in_started", "saw_awaiting_user"],
  };
  for (const [scenario, ids] of Object.entries(formerlyExpected)) {
    const checks = ids.map(id => ({ id, pass: false, detail: "app socket unreachable" }));
    const text = summary("round", meta, [{ ...run(scenario, "codex", 1, "fail"), checks }]);
    assert.match(text.split("## Issue candidates")[1], new RegExp(`\\*\\*${scenario} / codex`));
    assert.doesNotMatch(text, /expected fail:|\| known \|/);
  }
});

test("judge-only partials keep their evidence outside issue candidates without rewriting results", () => {
  const meta = { date: "2026-10-24", versions: {}, guideSha256: "", cliVersion: "" };
  const record: RunRecord = {
    ...run("H3", "codex", 1, "partial"), dir: "H3-codex",
    checks: [{ id: "canvas_copy_in_component", pass: true, detail: "copy present" }],
    judge: { verdict: "partial", layer: "none", reasons: ["Failed install omitted from final report"], stalls: ["Install retry"] },
  };
  const before = JSON.stringify(record);
  const text = summary("round", meta, [record]);
  const partials = text.split("## Judge-only partials")[1]?.split("## ")[0];
  assert.ok(partials, "summary includes a Judge-only partials section");
  assert.match(partials, /\*\*H3 \/ codex #1\*\* \(partial\).*`H3-codex`/);
  assert.match(partials, /judge \(none\): Failed install omitted from final report/);
  assert.match(partials, /stall: Install retry/);
  assert.doesNotMatch(text.split("## Issue candidates")[1], /\*\*H3 \/ codex/);
  assert.match(text.split("## Issue candidates")[1], /None\./);
  assert.match(text, /H3: codex partial/);
  assert.match(text, /\| H3 \| codex \| 1 \| partial \|  \| partial \| none \|/);
  assert.equal(JSON.stringify(record), before);

  for (const unexpected of [
    { ...record, checks: [...record.checks, { id: "unexpected_edit", pass: false, detail: "changed tooling" }], result: "fail" as const },
    { ...record, checks: [] },
    { ...record, timedOut: true },
    { ...record, judge: { ...record.judge as Exclude<RunRecord["judge"], null | "skipped">, verdict: "fail" as const }, result: "fail" as const },
    { ...record, judge: null, result: "judge_error" as const },
    { ...record, judge: "skipped" as const },
  ]) {
    const output = summary("round", meta, [unexpected]);
    assert.match(output.split("## Issue candidates")[1], /\*\*H3 \/ codex/);
    assert.doesNotMatch(output.split("## Judge-only partials")[1]?.split("## ")[0] ?? "", /\*\*H3 \/ codex/);
  }
});

test("known-condition table matches replace only the displayed layer", () => {
  const meta = { date: "2026-10-24", versions: {}, guideSha256: "", cliVersion: "" };
  for (const [scenario, checkId] of [["X1", "first_check"]]) {
    for (const judge of [
      { verdict: "fail", layer: "product", reasons: ["Known limitation"], stalls: [] },
      { verdict: "fail", layer: "none", reasons: [], stalls: [] },
      null, "skipped",
    ] as RunRecord["judge"][]) {
      const record = { ...run(scenario, "codex", 1, "fail"), checks: [{ id: checkId, pass: false, detail: "expected" }], judge };
      const before = JSON.stringify(record);
      const text = summary("round", meta, [record]);
      const verdict = judge === null ? "judge_error" : judge === "skipped" ? "skipped" : judge.verdict;
      assert.ok(text.includes(`| ${scenario} | codex | 1 | fail | ${checkId} | ${verdict} | known |`));
      assert.equal(JSON.stringify(record), before);

      for (const unexpected of [
        { ...record, agent: "claude" as const },
        { ...record, timedOut: true },
        { ...record, checks: [...record.checks, { id: "unexpected_edit", pass: false, detail: "changed tooling" }] },
      ]) {
        const output = summary("round", meta, [unexpected]);
        assert.doesNotMatch(output, /\| known \|/);
        const layer = typeof judge === "object" && judge ? judge.layer : "";
        assert.ok(output.includes(`| ${verdict} | ${layer} |`));
      }
    }
  }
});

