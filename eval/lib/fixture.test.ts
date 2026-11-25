import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fixtureRun, realRun } from "../run.ts";
import { parseArgs } from "./args.ts";
import { loadScenario } from "./scenario.ts";

test("pass fixture command failures include both phases and exit codes; fail fixtures keep their judgement", async () => {
  const base = mkdtempSync("/tmp/doan-fixture-test-");
  try {
    const cli = join(base, "cli");
    writeFileSync(cli, '#!/bin/sh\nprintf "fixture command failed\\n" >&2\nexit 7\n', { mode: 0o700 });
    for (const dir of ["seed", "fixtures/pass", "fixtures/fail", "out"]) mkdirSync(join(base, dir), { recursive: true });
    writeFileSync(join(base, "checks.ts"), 'export default ctx => [{ id: "fixture_marker", pass: ctx.read("marker") === "pass", detail: "fixture marker" }];\n');
    for (const kind of ["pass", "fail"] as const) {
      writeFileSync(join(base, "fixtures", kind, "marker"), kind);
      for (const phase of ["before.commands", "commands"])
        writeFileSync(join(base, "fixtures", `${kind}.${phase}.json`), JSON.stringify([[phase, "{{repo}}"]]));
    }
    const scenario = { ...loadScenario(join(import.meta.dirname, "../scenarios"), "W3b"), dir: base, init: null, selectionValue: null };
    const setup = { options: parseArgs(["--self-test"], new Date()), cli, stub: "stub\n", out: join(base, "out"), meta: { date: "2026-11-02", versions: {}, guideSha256: "test", cliVersion: "test" } };
    const pass = await fixtureRun(setup, scenario, "pass");
    assert.equal(pass.record.result, "pass");
    assert.equal(pass.problems.length, 2);
    assert.match(pass.problems[0]!, /pass\.before\.commands\.json.*exit 7.*fixture command failed/);
    assert.match(pass.problems[1]!, /pass\.commands\.json.*exit 7.*fixture command failed/);
    const fail = await fixtureRun(setup, scenario, "fail");
    assert.equal(fail.record.result, "fail");
    assert.deepEqual(fail.problems, []);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("fixture commands use a fixed fake session rather than the runner's identity", async () => {
  const base = mkdtempSync("/tmp/doan-fixture-test-");
  try {
    const cli = join(base, "cli");
    writeFileSync(cli, '#!/bin/sh\nprintf "%s|%s|%s" "$CLAUDE_CODE_SESSION_ID" "$CODEX_THREAD_ID" "$CODEX_SESSION_ID" > fixture-session.txt\n', { mode: 0o700 });
    for (const dir of ["seed", "fixtures/pass", "out"]) mkdirSync(join(base, dir), { recursive: true });
    writeFileSync(join(base, "checks.ts"), 'export default () => [{ id: "fixture_test", pass: true, detail: "fixture test" }];\n');
    writeFileSync(join(base, "fixtures/pass.commands.json"), JSON.stringify([["session"]]));
    const scenario = { ...loadScenario(join(import.meta.dirname, "../scenarios"), "W3b"), dir: base, init: null, selectionValue: null };
    const setup = { options: parseArgs(["--self-test"], new Date()), cli, stub: "stub\n", out: join(base, "out"), meta: { date: "2026-11-02", versions: {}, guideSha256: "test", cliVersion: "test" } };
    await fixtureRun(setup, scenario, "pass");
    assert.equal(readFileSync(join(base, "out/W3b-fixture-pass/repo/fixture-session.txt"), "utf8"), "eval-fixture-session||");
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("a failed self-test build removes its CLI directory", { timeout: 30_000 }, () => {
  const base = mkdtempSync("/tmp/doan-build-test-");
  const round = `build-failure-${basename(base)}`;
  const out = join(import.meta.dirname, "../../.scratch/agent-eval", round + "-self-test");
  const capture = join(base, "build-output");
  let cliDir: string | undefined;
  try {
    writeFileSync(join(base, "go"), '#!/bin/sh\nprintf "%s" "$3" > "$BUILD_CAPTURE"\nexit 1\n', { mode: 0o700 });
    const run = spawnSync(process.execPath, [join(import.meta.dirname, "../run.ts"), "--self-test", "--scenarios", "X1", "--round", round], {
      env: { ...process.env, PATH: base + ":" + process.env.PATH, BUILD_CAPTURE: capture }, timeout: 25_000, encoding: "utf8",
    });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /go build failed/);
    cliDir = dirname(readFileSync(capture, "utf8"));
    assert.equal(existsSync(cliDir), false);
  } finally {
    if (cliDir) rmSync(cliDir, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
    rmSync(base, { recursive: true, force: true });
  }
});

test("a fixture workspace is disposed even when the evidence error cannot be written", { timeout: 15_000 }, async () => {
  const base = mkdtempSync("/tmp/doan-evidence-test-");
  let workspace: string | undefined;
  try {
    const cli = join(base, "cli");
    const dir = join(base, "out/W3b-fixture-pass");
    for (const path of ["seed", "fixtures/pass", "out/W3b-fixture-pass/onboarding.jsonl", "out/W3b-fixture-pass/onboarding-log-error.txt"])
      mkdirSync(join(base, path), { recursive: true });
    writeFileSync(cli, '#!/bin/sh\npwd -P > "$2"\nprintf "fixture" > ../rt/onboarding.jsonl\n', { mode: 0o700 });
    writeFileSync(join(base, "fixtures/pass.commands.json"), JSON.stringify([["record", join(base, "cwd")]]));
    writeFileSync(join(base, "checks.ts"), 'export default () => [{ id: "fixture", pass: true, detail: "fixture" }];');
    const scenario = { ...loadScenario(join(import.meta.dirname, "../scenarios"), "W3b"), dir: base, init: null, selectionValue: null };
    const setup = { options: parseArgs(["--self-test"], new Date()), cli, stub: "stub", out: dirname(dir), meta: { date: "", versions: {}, guideSha256: "", cliVersion: "" } };
    await assert.rejects(fixtureRun(setup, scenario, "pass"), /onboarding-log-error.txt/);
    workspace = dirname(readFileSync(join(base, "cwd"), "utf8").trim());
    assert.equal(existsSync(workspace), false);
  } finally {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    rmSync(base, { recursive: true, force: true });
  }
});

// A signal ends the round only after the runner's own cleanup (POSTMORTEM 2026-11-20), with the signal's exit code.
test("an interrupted self-test removes its workspace and CLI directory and exits 128 plus the signal", { timeout: 60_000 }, async () => {
  const base = mkdtempSync("/tmp/doan-signal-test-");
  const round = `signal-${basename(base)}`;
  const out = join(import.meta.dirname, "../../.scratch/agent-eval", round + "-self-test");
  const reached = join(base, "reached"), release = join(base, "release"), built = join(base, "built");
  let workspace: string | undefined, cliDir: string | undefined;
  try {
    // A fake go "builds" a CLI that answers `skill` and holds its first other call (W3b's init) until released.
    const fakeCli = `#!/bin/sh\nif [ "$1" = skill ]; then echo '{"ok":true,"result":{"version":"0.0.0-test"}}'; exit 0; fi\nif [ ! -e ${reached} ]; then pwd -P > ${reached}; while [ ! -e ${release} ]; do sleep 0.05; done; fi\necho '{}'\n`;
    writeFileSync(join(base, "cli-source"), fakeCli);
    writeFileSync(join(base, "go"), `#!/bin/sh\nprintf "%s" "$3" > ${built}\ncp ${join(base, "cli-source")} "$3" && chmod 700 "$3"\n`, { mode: 0o700 });
    const child = spawn(process.execPath, [join(import.meta.dirname, "../run.ts"), "--self-test", "--scenarios", "W3b", "--round", round], {
      env: { ...process.env, PATH: base + ":" + process.env.PATH }, stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk; });
    const exited = new Promise<number | null>(resolve => child.once("exit", code => resolve(code)));
    // Wait for the condition the run produces: the CLI call inside the workspace.
    for (let i = 0; i < 600 && !existsSync(reached); i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(existsSync(reached), `the fake CLI was never reached: ${stderr}`);
    workspace = dirname(readFileSync(reached, "utf8").trim());
    cliDir = dirname(readFileSync(built, "utf8"));
    child.kill("SIGTERM");
    writeFileSync(release, "");
    assert.equal(await exited, 143, stderr);
    assert.equal(existsSync(workspace), false, "workspace left behind");
    assert.equal(existsSync(cliDir), false, "CLI directory left behind");
  } finally {
    for (const dir of [workspace, cliDir]) if (dir) rmSync(dir, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
    rmSync(base, { recursive: true, force: true });
  }
});

// An unfinished call log fails the run (ARCHITECTURE §14 'CLI call evidence'); the record still says how the agent ended.
test("a real run whose evidence cannot be read keeps the agent's exit facts", { timeout: 30_000 }, async () => {
  const base = mkdtempSync("/tmp/doan-real-run-test-");
  const saved = process.env.PATH;
  try {
    const bin = join(base, "bin");
    mkdirSync(bin);
    // A stand-in Claude whose doan call never completed, as when its group is killed mid-call.
    writeFileSync(join(bin, "claude"), `#!/bin/sh\nprintf '{"id":"x","argv":["open"]}\\n' >> ../doan-calls.jsonl\nexit 3\n`, { mode: 0o700 });
    process.env.PATH = `${bin}:${saved}`;
    const scenario = { ...loadScenario(join(import.meta.dirname, "../scenarios"), "W3b"), init: null, selectionValue: null };
    const setup = { options: parseArgs(["--no-judge", "--round", "real-run-test"], new Date()), cli: join(base, "cli"), stub: "stub\n", out: join(base, "out"), meta: { date: "", versions: {}, guideSha256: "", cliVersion: "" } };
    const record = await realRun(setup, scenario, "claude", 1);
    assert.deepEqual([record.result, record.exitCode, record.timedOut], ["fail", 3, false]);
    assert.equal(typeof record.durationSec, "number");
    assert.match(JSON.stringify(record.checks), /Incomplete doan call log/);
    const meta = JSON.parse(readFileSync(join(base, "out/W3b-claude/meta.json"), "utf8"));
    assert.deepEqual([meta.exitCode, meta.timedOut, meta.result], [3, false, "fail"]);
  } finally {
    process.env.PATH = saved;
    rmSync(base, { recursive: true, force: true });
  }
});

// A workspace dispose cannot finish (a folder the agent locked) must not replace the finished run's record.
test("a real run whose workspace cannot be removed keeps its record and says why", { timeout: 30_000 }, async () => {
  const base = mkdtempSync("/tmp/doan-real-run-test-");
  const saved = process.env.PATH;
  const metaFile = join(base, "out/W3b-claude/meta.json");
  try {
    const bin = join(base, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "claude"), "#!/bin/sh\nmkdir locked && : > locked/file && chmod 500 locked\nexit 0\n", { mode: 0o700 });
    process.env.PATH = `${bin}:${saved}`;
    const scenario = { ...loadScenario(join(import.meta.dirname, "../scenarios"), "W3b"), init: null, selectionValue: null };
    const setup = { options: parseArgs(["--no-judge", "--round", "real-run-test"], new Date()), cli: join(base, "cli"), stub: "stub\n", out: join(base, "out"), meta: { date: "", versions: {}, guideSha256: "", cliVersion: "" } };
    const record = await realRun(setup, scenario, "claude", 1);
    assert.deepEqual([record.exitCode, record.dir], [0, ".scratch/agent-eval/real-run-test/W3b-claude"]);
    assert.notEqual(record.checks.length, 0);
    assert.match(readFileSync(join(base, "out/W3b-claude/workspace-cleanup-error.txt"), "utf8"), /EACCES|EPERM|ENOTEMPTY/);
  } finally {
    process.env.PATH = saved;
    // The locked folder is left in the workspace and in the run's copy of the repo.
    const workspace = existsSync(metaFile) ? dirname(JSON.parse(readFileSync(metaFile, "utf8")).tempRepo) : null;
    for (const dir of [workspace, base]) if (dir && existsSync(dir)) { spawnSync("chmod", ["-R", "u+rwx", dir]); rmSync(dir, { recursive: true, force: true }); }
  }
});
