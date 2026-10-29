import assert from "node:assert/strict";
import { test } from "node:test";
import { summary, roundRow, type RunRecord } from "./record.ts";

const run = (scenario: string, agent: "claude" | "codex", n: number, result: RunRecord["result"]): RunRecord =>
  ({ scenario, agent, n, dir: "", result, checks: [], judge: "skipped", durationSec: 1, exitCode: 0, timedOut: false });

test("R1b Codex write approval condition excludes only expected check failures", () => {
  const meta = { date: "2026-10-24", versions: {}, guideSha256: "", cliVersion: "" };
  const checks = ["profile_agent_resolves_only", "profile_comments_valid"].map(id => ({ id, pass: false, detail: "approval refused" }));
  const record = { ...run("R1b", "codex", 1, "fail"), checks };
  const text = summary("round", meta, [record, { ...record, agent: "claude" }]);
  assert.match(text, /MCP write approval refused under approval: never/);
  assert.match(text, /R1b: codex fail, claude fail/);
  assert.doesNotMatch(text.split("## Issue candidates")[1], /\*\*R1b \/ codex/);
  assert.match(text.split("## Issue candidates")[1], /\*\*R1b \/ claude/);
  for (const unexpected of [
    { ...record, checks: [...checks, { id: "agent_cli_provenance", pass: false, detail: "wrong CLI" }] },
    { ...record, checks: [] },
    { ...record, timedOut: true },
    { ...record, result: "judge_error" as const },
  ]) {
    assert.match(summary("round", meta, [unexpected]).split("## Issue candidates")[1], /\*\*R1b \/ codex/);
  }
});

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
  for (const [scenario, checkId] of [["R1b", "profile_agent_resolves_only"], ["R2", "selected_primary_background"]]) {
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

test("O1 and O2 Codex sandbox conditions are noted only for their exact failed checks", () => {
  const meta = { date: "2026-10-29", versions: {}, guideSha256: "", cliVersion: "" };
  const expected = {
    O1: ["onboarding_started", "session_from_start", "inspected_repo_path", "selected_with_initialize", "complete_only_when_ready", "completion_confirmed"],
    O2: ["onboarding_started", "session_from_start", "claude_sign_in_started", "saw_awaiting_user"],
  };
  for (const [scenario, ids] of Object.entries(expected)) {
    const checks = ids.map(id => ({ id, pass: false, detail: "no app-socket v2 request reached the fake app" }));
    const record = { ...run(scenario, "codex", 1, "fail"), checks };
    const text = summary("round", meta, [record, { ...record, agent: "claude" }]);
    assert.match(text, /expected fail: Codex workspace-write sandbox blocks the app socket and these scenarios provide no MCP onboarding tools \(an MCP variant is follow-up work\); recorded result: fail/);
    assert.match(text, new RegExp(`${scenario}: codex fail, claude fail`));
    const candidates = text.split("## Issue candidates")[1];
    assert.ok(!candidates.includes(`**${scenario} / codex`));
    assert.ok(candidates.includes(`**${scenario} / claude`));
    for (const unexpected of [
      { ...record, checks: [...checks, { id: "no_doan_init", pass: false, detail: "ran doan init" }] },
      { ...record, timedOut: true },
    ]) {
      const other = summary("round", meta, [unexpected]);
      assert.match(other.split("## Issue candidates")[1], new RegExp(`\\*\\*${scenario} / codex`));
      assert.doesNotMatch(other, /expected fail:/);
    }
  }
});
