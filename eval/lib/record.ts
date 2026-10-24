import { KNOWN_CONDITIONS } from "./known-conditions.ts";
import type { Agent } from "./args.ts";
import type { Judgement, Result } from "./judge.ts";
import type { Check } from "./types.ts";

export interface RunRecord {
  scenario: string;
  agent: Agent | "fixture";
  n: number;
  dir: string;
  result: Result;
  checks: Check[];
  judge: Judgement | null | "skipped";
  durationSec: number | null;
  exitCode: number | null;
  timedOut: boolean;
}

export interface RoundMeta { date: string; versions: Partial<Record<Agent, string>>; guideSha256: string; cliVersion: string }

const NAMES: Record<Agent, string> = { claude: "Claude Code", codex: "Codex" };

// One row for the 'Rounds' table in docs/USABILITY-EVAL.md; Notes is left for the person recording it.
export function roundRow(meta: RoundMeta, runs: RunRecord[]): string {
  const agents = Object.entries(meta.versions).map(([agent, version]) => `${NAMES[agent as Agent]} ${version?.match(/\d+\.\d+\.\d+\S*/)?.[0] ?? version}`).join(", ");
  const scenarios = [...new Set(runs.map(run => run.scenario))];
  const results = scenarios.map(scenario => {
    const mine = runs.filter(run => run.scenario === scenario);
    const agentsHere = [...new Set(mine.map(run => run.agent))];
    return `${scenario}: ${agentsHere.map(agent => `${agent} ${mine.filter(run => run.agent === agent).sort((a, b) => a.n - b.n).map(run => run.result).join("/")}`).join(", ")}`;
  }).join("; ");
  return `| ${meta.date} | ${agents} | ${meta.guideSha256.slice(0, 12)} | ${meta.cliVersion} | ${results} | |`;
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function summary(round: string, meta: RoundMeta, runs: RunRecord[]): string {
  const condition = (run: RunRecord) => KNOWN_CONDITIONS.find(entry => entry.scenario === run.scenario && entry.agent === run.agent);
  const judgeCell = (judge: RunRecord["judge"]) => judge === "skipped" ? "skipped" : judge === null ? "judge_error" : judge.verdict;
  const lines = [
    `# agent-eval round ${round}`, "",
    "Row for the 'Rounds' table in docs/USABILITY-EVAL.md:", "",
    "```", roundRow(meta, runs), "```", "",
    "## Runs", "",
    "| Scenario | Agent | n | Result | Failed checks | Judge | Layer | Seconds | Exit |",
    "|---|---|---|---|---|---|---|---|---|",
    ...runs.map(run => `| ${run.scenario} | ${run.agent} | ${run.n} | ${run.result} | ${cell(run.checks.filter(c => !c.pass).map(c => c.id).join(", "))} | ${judgeCell(run.judge)} | ${typeof run.judge === "object" && run.judge ? run.judge.layer : ""} | ${run.durationSec ?? ""} | ${run.timedOut ? "timeout" : run.exitCode ?? ""} |`),
    "", ...runs.filter(run => condition(run)).map(run => `- ${run.scenario} / ${run.agent} #${run.n}: ${condition(run)!.note}; recorded result: ${run.result}.`),
    "", "## Issue candidates", "",
    "Every run that did not pass outside the known conditions above, with what the checks and the judge saw. Confirm against the transcript before recording an issue.", "",
  ];
  const notPassed = runs.filter(run => run.result !== "pass" && !(run.result === "fail" && condition(run)));
  if (notPassed.length === 0) lines.push("None.");
  for (const run of notPassed) {
    lines.push(`- **${run.scenario} / ${run.agent} #${run.n}** (${run.result}) — \`${run.dir}\``);
    for (const check of run.checks.filter(c => !c.pass)) lines.push(`  - check \`${check.id}\`: ${cell(check.detail)}`);
    if (run.judge && run.judge !== "skipped") {
      for (const reason of run.judge.reasons) lines.push(`  - judge (${run.judge.layer}): ${cell(reason)}`);
      for (const stall of run.judge.stalls) lines.push(`  - stall: ${cell(stall)}`);
    }
  }
  return lines.join("\n") + "\n";
}
