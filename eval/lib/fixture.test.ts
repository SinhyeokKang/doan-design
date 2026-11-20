import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fixtureRun } from "../run.ts";
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
