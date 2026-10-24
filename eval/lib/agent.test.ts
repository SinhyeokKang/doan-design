import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { join } from "node:path";
import { test } from "node:test";
import { agentCommand, runProcess, readAgentTranscript } from "./agent.ts";

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

test("MCP run config pins the measured CLI and runtime without changing global config", () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const mcp = { cli: '/tmp/packaged CLI/doan', runtime: '/tmp/rt/runtime.json', configPath: join(dir, "mcp.json") };
    const claude = agentCommand("claude", "P", mcp);
    assert.ok(claude.args.includes("--strict-mcp-config"));
    assert.equal(claude.args[claude.args.indexOf("--mcp-config") + 1], mcp.configPath);
    assert.match(claude.args[claude.args.indexOf("--allowedTools") + 1], /mcp__doan__\*/);
    assert.deepEqual(JSON.parse(readFileSync(mcp.configPath, "utf8")), { mcpServers: { doan: { command: mcp.cli, args: ["mcp"], env: { DOAN_RUNTIME: mcp.runtime } } } });
    const codex = agentCommand("codex", "P", mcp);
    assert.deepEqual(codex.args.slice(0, 3), ["exec", "--sandbox", "workspace-write"]);
    for (const option of [`mcp_servers.doan.command=${JSON.stringify(mcp.cli)}`, 'mcp_servers.doan.args=["mcp"]', `mcp_servers.doan.env.DOAN_RUNTIME=${JSON.stringify(mcp.runtime)}`, "mcp_servers.doan.enabled=true"]) assert.ok(codex.args.includes(option));
    assert.ok(!codex.args.includes("mcp_servers.doan.enabled=false"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("Codex transcript copies only the matching session rollout from inherited CODEX_HOME", () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const home = join(dir, "codex");
    const sessions = join(home, "sessions/2026/10/24");
    mkdirSync(sessions, { recursive: true });
    const id = "11111111-2222-3333-4444-555555555555";
    const rollout = readFileSync(new URL("./fixtures/codex-batched.jsonl", import.meta.url), "utf8");
    writeFileSync(join(sessions, `rollout-date-${id}.jsonl`), rollout);
    writeFileSync(join(sessions, "rollout-other.jsonl"), "unrelated");
    writeFileSync(join(dir, "stdout.log"), "answer");
    writeFileSync(join(dir, "stderr.log"), `session id: ${id}\n`);
    const result = readAgentTranscript("codex", dir, { CODEX_HOME: home });
    assert.ok(result.includes(rollout));
    assert.ok(!result.includes("unrelated"));
    assert.equal(readFileSync(join(dir, "codex-rollout.jsonl"), "utf8"), rollout);
    assert.equal(readAgentTranscript("claude", dir, { CODEX_HOME: home }), `answer\nsession id: ${id}\n`);
    writeFileSync(join(dir, "stderr.log"), "no session id");
    assert.equal(readAgentTranscript("codex", dir, { CODEX_HOME: home }), "answer\nno session id");
    assert.match(readFileSync(join(dir, "codex-rollout-error.txt"), "utf8"), /session id/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
