import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { plan, runSteps, withLock } from "./verify.mjs";

const step = (name, script, pass) => ({ name, command: process.execPath, args: ["-e", script], pass });
async function workspace(t) {
  const dir = await mkdtemp(join(tmpdir(), "doan-verify-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("runtime builds through e2e once; eval adds no model calls; unknown flags fail", () => {
  assert.ok(plan([]).some(s => s.name === "build"));
  const steps = plan(["--runtime", "--eval"]);
  assert.equal(steps.filter(s => s.name === "runtime").length, 1);
  assert.ok(!steps.some(s => s.name === "build"));
  assert.deepEqual(steps.find(s => s.name === "eval-self-test").args, ["eval/run.ts", "--self-test"]);
  assert.throws(() => plan(["--skip-tests"]), /Unknown/);
});

test("a failed child stops later steps even if it prints PASS", async t => {
  const dir = await workspace(t);
  const result = await runSteps([
    step("fail", 'console.log("runtime-test: PASS"); process.exit(7)', /^runtime-test: PASS$/m),
    step("not-run", 'throw new Error("must not run")'),
  ], dir, dir);
  assert.equal(result.code, 7);
  assert.equal(result.results.length, 1);
  assert.match(await readFile(join(dir, "fail.log"), "utf8"), /runtime-test: PASS/);
  assert.equal(JSON.parse(await readFile(join(dir, "results.json"), "utf8"))[0].code, 7);
});

test("exit zero without the suite's completion marker fails", async t => {
  const dir = await workspace(t);
  const result = await runSteps([step("runtime", 'console.log("partial PASS")', /^runtime-test: PASS$/m)], dir, dir);
  assert.equal(result.code, 1);
  assert.match(result.results[0].error, /completion marker/);
});

test("successful steps run in order and retain stdout and stderr", async t => {
  const dir = await workspace(t);
  const result = await runSteps([
    step("first", 'require("node:fs").writeFileSync("order", "first"); console.error("diagnostic")'),
    step("second", 'require("node:assert/strict").equal(require("node:fs").readFileSync("order", "utf8"), "first"); console.log("runtime-test: PASS")', /^runtime-test: PASS$/m),
  ], dir, dir);
  assert.equal(result.code, 0);
  assert.deepEqual(result.results.map(r => r.name), ["first", "second"]);
  assert.match(await readFile(join(dir, "first.log"), "utf8"), /diagnostic/);
});

test("signal exits and missing executables cannot become passes", async t => {
  const dir = await workspace(t);
  const killed = await runSteps([step("signal", 'process.kill(process.pid, "SIGTERM")')], dir, dir);
  assert.notEqual(killed.code, 0);
  assert.equal(killed.results[0].signal, "SIGTERM");
  const absent = await runSteps([{ name: "absent", command: join(dir, "missing"), args: [] }], dir, dir);
  assert.equal(absent.code, 127);
});

test("cancellation terminates the active child and does not run the next step", async t => {
  const dir = await workspace(t);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 150);
  t.after(() => clearTimeout(timer));
  const result = await runSteps([step("wait", 'setInterval(() => {}, 1000)'), step("not-run", '')], dir, dir, controller.signal);
  assert.notEqual(result.code, 0);
  assert.equal(result.results.length, 1);
});

test("the checkout lock refuses overlap and releases after a failure", async t => {
  const dir = await workspace(t);
  await assert.rejects(withLock(dir, async () => {
    await assert.rejects(withLock(dir, async () => assert.fail("overlap")), /already running/);
    throw new Error("failed run");
  }), /failed run/);
  let ran = false;
  await withLock(dir, async () => { ran = true; });
  assert.equal(ran, true);
});
