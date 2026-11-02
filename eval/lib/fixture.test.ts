import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
    const scenario = { ...loadScenario(join(import.meta.dirname, "../scenarios"), "W3"), dir: base, init: null, selectionValue: null };
    const setup = { options: parseArgs(["--self-test"], new Date()), cli, stub: "stub\n", out: join(base, "out"), meta: { date: "2026-11-02", versions: {}, guideSha256: "test", cliVersion: "test" } };
    const pass = await fixtureRun(setup, scenario, "pass");
    assert.equal(pass.record.result, "pass");
    assert.equal(pass.problems.length, 2);
    assert.match(pass.problems[0], /pass\.before\.commands\.json.*exit 7.*fixture command failed/);
    assert.match(pass.problems[1], /pass\.commands\.json.*exit 7.*fixture command failed/);
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
    const scenario = { ...loadScenario(join(import.meta.dirname, "../scenarios"), "W3"), dir: base, init: null, selectionValue: null };
    const setup = { options: parseArgs(["--self-test"], new Date()), cli, stub: "stub\n", out: join(base, "out"), meta: { date: "2026-11-02", versions: {}, guideSha256: "test", cliVersion: "test" } };
    await fixtureRun(setup, scenario, "pass");
    assert.equal(readFileSync(join(base, "out/W3-fixture-pass/repo/fixture-session.txt"), "utf8"), "eval-fixture-session||");
  } finally { rmSync(base, { recursive: true, force: true }); }
});
