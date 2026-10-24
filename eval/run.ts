// Keep evaluation behavior aligned with docs/ARCHITECTURE.md §14 (agent evaluation)
// and the procedure in .agents/skills/agent-eval/SKILL.md so rounds stay comparable.
//   node eval/run.ts [--scenarios W1,R2] [--agents claude,codex] [--repeat N] [--round <name>] [--no-judge]
//   node eval/run.ts --self-test [--scenarios ...]
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { assertRealState, realState } from "../app/e2e/real-state.ts";
import { agentCommand, cliProvenance, killRunning, runProcess, readAgentTranscript } from "./lib/agent.ts";
import { parseArgs, type Agent, type Options } from "./lib/args.ts";
import { createContext, sh } from "./lib/context.ts";
import { buildJudgePrompt, checkList, finalResult, fixtureProblem, judgeCommand, judgeFor, parseJudgement, type Judgement } from "./lib/judge.ts";
import { summary, type RoundMeta, type RunRecord } from "./lib/record.ts";
import { loadScenario, renderPrompt, scenarioIds, selectIds, type LoadedScenario } from "./lib/scenario.ts";
import type { Check, Checks } from "./lib/types.ts";
import { copyRepo, prepareWorkspace, type Workspace } from "./lib/workspace.ts";

const ROOT = dirname(import.meta.dirname);
const SCENARIOS = join(ROOT, "eval/scenarios");
// The CLI bundled in the app, so agents see what users get (SKILL.md 'Requirements').
const PACKAGED_CLI = join(ROOT, "app/dist/mac-arm64/doan.app/Contents/Resources/bin/doan");
const STUB = join(ROOT, "app/src/main/onboarding/SKILL.md");
const GUIDE = join(ROOT, "cli/internal/cli/skill.md");

const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

async function runChecks(scenario: LoadedScenario, ctx: ReturnType<typeof createContext>): Promise<Check[]> {
  try {
    const checks: Checks = (await import(join(scenario.dir, "checks.ts"))).default;
    return checkList(checks(ctx));
  } catch (error) {
    return [{ id: "checks_error", pass: false, detail: (error as Error).stack ?? String(error) }];
  }
}

function judgeMaterial(ws: Workspace, ctx: ReturnType<typeof createContext>) {
  // Intent-to-add makes new files show up in the diff; the index is the temp repo's own.
  sh("git", ["-C", ws.repo, "add", "-A", "-N", "-f"], ws.repo, ws.env);
  return { changed: ctx.changedFiles(), diff: sh("git", ["-C", ws.repo, "diff", "--no-color", "--no-ext-diff", ws.seedCommit], ws.repo, ws.env).stdout };
}

async function judge(agent: Agent, prompt: string, dir: string): Promise<{ judgement: Judgement | null; raw: string }> {
  const judgeAgent = judgeFor(agent);
  const cwd = mkdtempSync("/tmp/doan-eval-judge-");
  try {
    const outFile = join(dir, "judge-last-message.txt");
    const { cmd, args } = judgeCommand(judgeAgent, prompt, outFile);
    const result = await runProcess({ cmd, args, cwd, env: process.env, timeoutSec: 600, stdoutPath: join(dir, "judge-stdout.log"), stderrPath: join(dir, "judge-stderr.log") });
    const raw = existsSync(outFile) ? readFileSync(outFile, "utf8") : readFileSync(join(dir, "judge-stdout.log"), "utf8");
    return { judgement: result.timedOut ? null : parseJudgement(raw), raw };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

interface RoundSetup { options: Options; cli: string; stub: string; meta: RoundMeta; out: string }

async function realRun(setup: RoundSetup, scenario: LoadedScenario, agent: Agent, n: number): Promise<RunRecord> {
  const name = `${scenario.id}-${agent}${setup.options.repeat > 1 ? `-${n}` : ""}`;
  const dir = join(setup.out, name);
  mkdirSync(dir, { recursive: true });
  const ws = await prepareWorkspace({ scenario, agent, cli: setup.cli, stub: setup.stub });
  try {
    const resolutionPath = join(ws.base, "resolved-doan.txt");
    const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
    const prompt = `Evaluation setup: before doing the task, run\ncommand -v doan > ${quote(resolutionPath)}\nfrom your shell without changing PATH. This records the executable used for this run.\n\n` + renderPrompt(scenario.promptTemplate, ws.repo);
    writeFileSync(join(dir, "prompt.txt"), prompt);
    const runtime = ws.env.DOAN_RUNTIME;
    if (!runtime) throw new Error("Workspace has no DOAN_RUNTIME");
    const { cmd, args } = agentCommand(agent, prompt, scenario.mcp ? { cli: setup.cli, runtime, configPath: join(ws.base, "mcp.json") } : undefined);
    console.log(`start ${name} (${ws.repo})`);
    const startedAt = new Date().toISOString();
    const proc = await runProcess({ cmd, args, cwd: ws.repo, env: ws.env, timeoutSec: scenario.timeoutSec, stdoutPath: join(dir, "stdout.log"), stderrPath: join(dir, "stderr.log") });
    const evidence = readAgentTranscript(agent, dir, ws.env);
    const ctx = createContext({ repo: ws.repo, agent, ...evidence, cli: setup.cli, env: ws.env, seedCommit: ws.seedCommit });
    const checks = await runChecks(scenario, ctx);
    checks.push(cliProvenance(resolutionPath, setup.cli));
    if (existsSync(resolutionPath)) cpSync(resolutionPath, join(dir, "resolved-doan.txt"));
    writeFileSync(join(dir, "checks.json"), JSON.stringify(checks, null, 2) + "\n");
    let judgement: Judgement | null | "skipped" = "skipped";
    if (setup.options.judge) {
      // An agent can leave a repo git cannot read (deleted .git, say); that is a judge_error, not a lost round.
      try {
        const { changed, diff } = judgeMaterial(ws, ctx);
        const judged = await judge(agent, buildJudgePrompt({ rubric: scenario.rubric, prompt, checks, changed, diff, ...evidence }), dir);
        judgement = judged.judgement;
        writeFileSync(join(dir, "judge.json"), JSON.stringify(judgement ?? { judge_error: true, raw: judged.raw }, null, 2) + "\n");
      } catch (error) {
        judgement = null;
        writeFileSync(join(dir, "judge.json"), JSON.stringify({ judge_error: true, error: (error as Error).stack }, null, 2) + "\n");
      }
    }
    try { copyRepo(ws.repo, join(dir, "repo")); } catch (error) { writeFileSync(join(dir, "repo-copy-error.txt"), `${(error as Error).stack}\n`); }
    const record: RunRecord = { scenario: scenario.id, agent, n, dir: join(".scratch/agent-eval", setup.options.round, name), result: finalResult(checks, judgement), checks, judge: judgement, durationSec: proc.durationSec, exitCode: proc.code, timedOut: proc.timedOut };
    writeFileSync(join(dir, "meta.json"), JSON.stringify({
      scenario: scenario.id, shellCli: scenario.shellCli, agent, n, agentVersion: setup.meta.versions[agent], judge: setup.options.judge ? judgeFor(agent) : null, argv: [cmd, ...args],
      // Where the agent reads the rest of its config from; everything else in the environment is inherited as is.
      inheritedConfig: { HOME: process.env.HOME ?? null, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR ?? null, CODEX_HOME: process.env.CODEX_HOME ?? null },
      guideSha256: setup.meta.guideSha256, cliVersion: setup.meta.cliVersion, cli: setup.cli, tempRepo: ws.repo, startedAt,
      durationSec: proc.durationSec, exitCode: proc.code, signal: proc.signal, timedOut: proc.timedOut, result: record.result,
    }, null, 2) + "\n");
    console.log(`done  ${name}: ${record.result} (${proc.durationSec}s${proc.timedOut ? ", timed out" : ""})`);
    return record;
  } finally {
    await ws.dispose();
  }
}

// The fake agent: lays a fixture over the seed, and prints the fixture's
// transcript file when there is one (`fixtures/<kind>.transcript.txt`).
async function fixtureRun(setup: RoundSetup, scenario: LoadedScenario, kind: "pass" | "fail"): Promise<{ record: RunRecord; problems: string[] }> {
  const name = `${scenario.id}-fixture-${kind}`;
  const dir = join(setup.out, name);
  mkdirSync(dir, { recursive: true });
  const ws = await prepareWorkspace({ scenario, agent: "fixture", cli: setup.cli, stub: setup.stub });
  const problems: string[] = [];
  try {
    renderPrompt(scenario.promptTemplate, ws.repo);
    cpSync(join(scenario.dir, "fixtures", kind), ws.repo, { recursive: true, force: true });
    const transcriptFile = join(scenario.dir, "fixtures", `${kind}.transcript.txt`);
    const transcript = existsSync(transcriptFile) ? readFileSync(transcriptFile, "utf8") : "";
    const ctx = createContext({ repo: ws.repo, agent: "fixture", transcript, cli: setup.cli, env: ws.env, seedCommit: ws.seedCommit });
    const checks = await runChecks(scenario, ctx);
    writeFileSync(join(dir, "checks.json"), JSON.stringify(checks, null, 2) + "\n");
    // A fixed fake judge still goes through prompt building and parsing.
    const { changed, diff } = judgeMaterial(ws, ctx);
    buildJudgePrompt({ rubric: scenario.rubric, prompt: scenario.promptTemplate, checks, changed, diff, transcript });
    const judgement = setup.options.judge ? parseJudgement(JSON.stringify({ verdict: "pass", reasons: ["fake judge"], stalls: [], layer: "none" })) : "skipped";
    const result = finalResult(checks, judgement);
    const problem = fixtureProblem(kind, checks, result);
    if (problem) problems.push(`${name}: ${problem}`);
    if (scenario.selectionValue && kind === "pass") {
      const active = ctx.doan(["active"]);
      // The CLI drops `root` from what it prints; the rest must arrive unchanged.
      if (active.code !== 0 || !isDeepStrictEqual(active.json?.result?.selection, scenario.selectionValue))
        problems.push(`${name}: doan active against the fake app returned ${JSON.stringify(active.json)} (exit ${active.code})`);
      else console.log(`self-test: ${scenario.id} doan active returned the selection`);
    }
    copyRepo(ws.repo, join(dir, "repo"));
    // n orders the pass fixture before the fail one in the summary.
    return { record: { scenario: scenario.id, agent: "fixture", n: kind === "pass" ? 1 : 2, dir: join(".scratch/agent-eval", setup.options.round, name), result, checks, judge: judgement, durationSec: null, exitCode: null, timedOut: false }, problems };
  } finally {
    await ws.dispose();
  }
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2), new Date());
  if (options.selfTest) options.round = `${options.round}-self-test`;
  const scenarios = selectIds(scenarioIds(SCENARIOS), options.scenarios, options.selfTest).map(id => loadScenario(SCENARIOS, id));
  if (scenarios.length === 0) throw new Error("no scenarios to run");
  const before = await realState();
  const out = join(ROOT, ".scratch/agent-eval", options.round);
  if (existsSync(out)) throw new Error(`${out} already exists; pick another --round`);
  mkdirSync(out, { recursive: true });

  let cli = PACKAGED_CLI;
  let cliDir: string | null = null;
  if (options.selfTest) {
    // Built here so the self-test does not depend on a packaged app; real rounds never use this build.
    if (!existsSync(PACKAGED_CLI)) console.log(`note: no packaged CLI at ${PACKAGED_CLI}; run \`npm --prefix app run package\` before a real round`);
    cliDir = mkdtempSync("/tmp/doan-eval-cli-");
    cli = join(cliDir, "doan");
    const build = sh("go", ["build", "-o", cli, "./cli/cmd/doan"], ROOT, process.env);
    if (build.code !== 0) throw new Error(`go build failed: ${build.stderr}`);
  } else if (!existsSync(PACKAGED_CLI)) {
    throw new Error(`no packaged CLI at ${PACKAGED_CLI}; run \`npm --prefix app run package\` at the HEAD being measured`);
  }

  try {
    const skill = sh(cli, ["skill", "--json"], ROOT, process.env);
    const versions: RoundMeta["versions"] = {};
    if (!options.selfTest) {
      const needed = new Set<Agent>([...options.agents, ...(options.judge ? options.agents.map(judgeFor) : [])]);
      for (const agent of needed) {
        const version = sh(agent, ["--version"], ROOT, process.env);
        if (version.code !== 0) throw new Error(`${agent} --version failed; is it on PATH and signed in? ${version.stderr}`);
        if (options.agents.includes(agent)) versions[agent] = version.stdout.trim();
      }
    }
    const meta: RoundMeta = { date: new Date().toISOString().slice(0, 10), versions, guideSha256: sha256(readFileSync(GUIDE)), cliVersion: JSON.parse(skill.stdout).result.version };
    const setup: RoundSetup = { options, cli, stub: readFileSync(STUB, "utf8"), meta, out };

    const records: RunRecord[] = [];
    const problems: string[] = [];
    if (options.selfTest) {
      for (const scenario of scenarios)
        for (const kind of ["pass", "fail"] as const) {
          const run = await fixtureRun(setup, scenario, kind);
          records.push(run.record);
          problems.push(...run.problems);
          console.log(`self-test: ${scenario.id} ${kind} fixture -> ${run.record.result}${run.problems.length ? " (unexpected)" : ""}`);
        }
    } else {
      // One lane per agent: runs of one agent are sequential, the two agents run side by side.
      const lanes = await Promise.all(options.agents.map(async agent => {
        const mine: RunRecord[] = [];
        for (const scenario of scenarios)
          for (let n = 1; n <= options.repeat; n++) {
            // One broken run is recorded as a failure; the lane and the round go on.
            try {
              mine.push(await realRun(setup, scenario, agent, n));
            } catch (error) {
              console.error(`error ${scenario.id}-${agent}-${n}: ${(error as Error).message}`);
              mine.push({ scenario: scenario.id, agent, n, dir: "", result: "fail", checks: [{ id: "runner_error", pass: false, detail: (error as Error).stack ?? String(error) }], judge: "skipped", durationSec: null, exitCode: null, timedOut: false });
            }
          }
        return mine;
      }));
      records.push(...scenarios.flatMap(s => lanes.flat().filter(r => r.scenario === s.id)));
    }

    writeFileSync(join(out, "results.json"), JSON.stringify({ round: options.round, selfTest: options.selfTest, meta, runs: records, problems }, null, 2) + "\n");
    writeFileSync(join(out, "summary.md"), summary(options.round, meta, records));
    console.log(`results: ${join(out, "summary.md")}`);
    if (problems.length) {
      for (const problem of problems) console.error(`self-test FAIL ${problem}`);
      return 1;
    }
    if (options.selfTest) console.log(`self-test PASS (${scenarios.length} scenario${scenarios.length === 1 ? "" : "s"})`);
    return 0;
  } finally {
    if (cliDir) rmSync(cliDir, { recursive: true, force: true });
    // Also on a failed round: a run must never have touched the user's own doan setup.
    await assertRealState(before);
  }
}

// Agents run in their own process groups, out of reach of the terminal's Ctrl-C.
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    killRunning();
    process.exit(130);
  });

main().then(code => { process.exitCode = code; }, error => {
  console.error(`eval: ${(error as Error).message}`);
  process.exitCode = 1;
});
