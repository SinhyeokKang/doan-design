import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { join } from "node:path";
import { test } from "node:test";
import { agentCommand, runProcess } from "./agent.ts";

test("agent commands match the documented invocations", () => {
  assert.deepEqual(agentCommand("claude", "P"), { cmd: "claude", args: ["-p", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--allowedTools", "Bash Read Write Edit Glob Grep", "--", "P"] });
  assert.deepEqual(agentCommand("codex", "P"), { cmd: "codex", args: ["exec", "--sandbox", "workspace-write", "-c", "mcp_servers.doan.enabled=false", "P"] });
});

test("a run past its time limit is killed with its children and settles once", async () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const started = Date.now();
    // The background sleep holds the output file open; only a group kill ends it.
    const result = await runProcess({ cmd: "sh", args: ["-c", "echo hi; sleep 30 & sleep 30"], cwd: dir, env: process.env, timeoutSec: 1, stdoutPath: join(dir, "o"), stderrPath: join(dir, "e") });
    assert.equal(result.timedOut, true);
    assert.ok(Date.now() - started < 10_000);
    assert.equal(readFileSync(join(dir, "o"), "utf8"), "hi\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stdin is /dev/null and the exit code is kept", async () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const result = await runProcess({ cmd: "sh", args: ["-c", "cat; exit 3"], cwd: dir, env: process.env, timeoutSec: 10, stdoutPath: join(dir, "o"), stderrPath: join(dir, "e") });
    assert.deepEqual([result.code, result.timedOut, readFileSync(join(dir, "o"), "utf8")], [3, false, ""]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tools an agent left running are killed when it exits", async () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    await runProcess({ cmd: "sh", args: ["-c", `sleep 30 >/dev/null 2>&1 & echo $! > ${dir}/pid`], cwd: dir, env: process.env, timeoutSec: 10, stdoutPath: join(dir, "o"), stderrPath: join(dir, "e") });
    await sleep(100);
    const pid = Number(readFileSync(join(dir, "pid"), "utf8"));
    assert.throws(() => process.kill(pid, 0), /ESRCH/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a spawn that throws still settles", async () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const result = await runProcess({ cmd: "sh", args: ["-c", "echo\0x"], cwd: dir, env: process.env, timeoutSec: 10, stdoutPath: join(dir, "o"), stderrPath: join(dir, "e") });
    assert.match(result.signal ?? "", /^spawn: /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
