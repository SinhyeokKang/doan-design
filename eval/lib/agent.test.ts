import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { join } from "node:path";
import { test } from "node:test";
import { agentCommand, registeredCodexMcpServers, runProcess, readAgentTranscript } from "./agent.ts";
import { buildJudgePrompt } from "./judge.ts";
import { createContext } from "./context.ts";

test("agent commands match the documented invocations", () => {
  assert.deepEqual(agentCommand("claude", "P"), { cmd: "claude", args: ["-p", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--allowedTools", "Bash Read Write Edit Glob Grep", "--", "P"] });
  assert.deepEqual(agentCommand("codex", "P"), { cmd: "codex", args: ["exec", "--sandbox", "workspace-write", "-c", "features.shell_snapshot=false", "-c", 'approval_policy="never"', "-c", "allow_login_shell=false", "P"] });
  assert.deepEqual(agentCommand("codex", "P", ["figma", "doan"]), { cmd: "codex", args: ["exec", "--sandbox", "workspace-write", "-c", "features.shell_snapshot=false", "-c", 'approval_policy="never"', "-c", "allow_login_shell=false", "-c", "mcp_servers.doan.enabled=false", "P"] });
});

// Claude has --strict-mcp-config; Codex has no equivalent and merges `-c mcp_servers={}` into the
// machine's servers, so a doan server left registered there is switched off by name. Codex 0.166
// refuses to start when that override names a server the config does not define (the override
// alone makes a table without a transport), so it is added only for a registered server.
test("neither agent loads a doan MCP server from the machine's config", () => {
  assert.ok(agentCommand("claude", "P").args.includes("--strict-mcp-config"));
  assert.ok(agentCommand("codex", "P", ["doan"]).args.includes("mcp_servers.doan.enabled=false"));
  for (const agent of ["claude", "codex"] as const) assert.ok(!agentCommand(agent, "P", ["doan"]).args.some(arg => /mcp__doan|^--mcp-config$|mcp_servers\.doan\.(command|args|env)/.test(arg)), agent);
});

test("Codex gets no doan MCP override when the machine registers no doan server", () => {
  assert.ok(!agentCommand("codex", "P").args.some(arg => arg.startsWith("mcp_servers")));
  assert.ok(!agentCommand("codex", "P", ["figma", "doan-extra"]).args.some(arg => arg.startsWith("mcp_servers")));
});

test("registered Codex MCP servers are read from `codex mcp list --json` in the run's environment", () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    // Prints the server names found in FAKE_CODEX_SERVERS so the test controls the machine's config.
    writeFileSync(join(bin, "codex"), '#!/bin/sh\n[ "$1 $2 $3" = "mcp list --json" ] || exit 2\necho "$FAKE_CODEX_SERVERS"\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
    assert.deepEqual(registeredCodexMcpServers({ ...env, FAKE_CODEX_SERVERS: '[{"name":"figma","enabled":true},{"name":"doan","enabled":false}]' }, dir), ["figma", "doan"]);
    assert.deepEqual(registeredCodexMcpServers({ ...env, FAKE_CODEX_SERVERS: "[]" }, dir), []);
    // A list that cannot be read must stop the run: guessing could load a doan server.
    assert.throws(() => registeredCodexMcpServers({ ...env, FAKE_CODEX_SERVERS: "not json" }, dir), /Codex MCP server list/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A login shell re-reads the user's profile, which puts the installed ~/.local/bin ahead of the
// run's bin directory (the snapshot pin alone no longer keeps the run's PATH with Codex 0.166).
test("Codex runs commands in a non-login shell so the run's PATH survives", () => {
  assert.ok(agentCommand("codex", "P").args.includes("allow_login_shell=false"));
});

test("Codex never asks for approval, whatever the machine's own config says", () => {
  assert.ok(agentCommand("codex", "P").args.includes('approval_policy="never"'));
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
    assert.equal(result.transcript, `answer\nsession id: ${id}\n`);
    assert.deepEqual(result.calls.commands, ["doan active --json", "rg --files"]);
    assert.ok(!JSON.stringify(result).includes("unrelated"));
    assert.equal(readFileSync(join(dir, "codex-rollout.jsonl"), "utf8"), rollout);
    assert.equal(readAgentTranscript("claude", dir, { CODEX_HOME: home }).transcript, `answer\nsession id: ${id}\n`);
    writeFileSync(join(dir, "stderr.log"), "no session id");
    assert.equal(readAgentTranscript("codex", dir, { CODEX_HOME: home }).transcript, "answer\nno session id");
    assert.match(readFileSync(join(dir, "codex-rollout-error.txt"), "utf8"), /session id/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("rollout output cannot evict active calls or original log tails from judge evidence", () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const sessions = join(dir, "sessions");
    mkdirSync(sessions);
    const id = "11111111-2222-3333-4444-555555555555";
    const rollout = [
      { type: "response_item", payload: { type: "custom_tool_call", name: "exec", input: 'await tools.exec_command({cmd:"doan active --json"}); await tools.mcp__doan__active({});' } },
      { type: "response_item", payload: { type: "function_call_output", output: "ROLLOUT_NOISE".repeat(10000) } },
    ].map(row => JSON.stringify(row)).join("\n");
    writeFileSync(join(sessions, `rollout-date-${id}.jsonl`), rollout);
    writeFileSync(join(dir, "stdout.log"), "FINAL_ANSWER");
    writeFileSync(join(dir, "stderr.log"), `session id: ${id}\nSTDERR_TAIL`);
    const evidence = readAgentTranscript("codex", dir, { CODEX_HOME: dir });
    const ctx = createContext({ repo: dir, agent: "codex", ...evidence, cli: "/unused", env: {}, seedCommit: "HEAD" });
    assert.deepEqual(ctx.calls, { commands: ["doan active --json"], mcpTools: ["mcp__doan__active"] });
    const prompt = buildJudgePrompt({ rubric: "R", prompt: "P", checks: [], changed: [], diff: "", ...evidence });
    for (const text of ["doan active --json", "mcp__doan__active", "FINAL_ANSWER", "STDERR_TAIL"]) assert.ok(prompt.includes(text), text);
    assert.ok(!prompt.includes("ROLLOUT_NOISE"));
    assert.equal(readFileSync(join(dir, "codex-rollout.jsonl"), "utf8"), rollout);
    const longLogs = buildJudgePrompt({ rubric: "R", prompt: "P", checks: [], changed: [], diff: "", ...evidence, transcript: "x".repeat(50000) + "LOG_TAIL" });
    for (const text of ["doan active --json", "mcp__doan__active", "LOG_TAIL"]) assert.ok(longLogs.includes(text), text);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Codex disables shell snapshots so run-local PATH survives tool calls", () => {
  assert.ok(agentCommand("codex", "P").args.includes("features.shell_snapshot=false"));
});

test("agent CLI provenance rejects missing, stale and ambiguous paths", async () => {
  const { cliProvenance } = await import("./agent.ts");
  const dir = mkdtempSync("/tmp/doan-eval-provenance-");
  try {
    const expected = join(dir, "doan");
    const report = join(dir, "resolved-doan.txt");
    writeFileSync(expected, "measured");
    assert.equal(cliProvenance(report, expected).pass, false);
    const stale = join(dir, "old-doan");
    writeFileSync(stale, "older");
    writeFileSync(report, stale + "\n");
    assert.equal(cliProvenance(report, expected).pass, false);
    writeFileSync(report, expected + "\n/old/doan\n");
    assert.equal(cliProvenance(report, expected).pass, false);
    writeFileSync(report, expected + "\n");
    assert.equal(cliProvenance(report, expected).pass, true);
    const { symlinkSync } = await import("node:fs");
    symlinkSync(expected, join(dir, "alias"));
    writeFileSync(report, join(dir, "alias") + "\n");
    assert.equal(cliProvenance(report, expected).pass, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("shellCli false removes inherited doan while preserving colocated tools", async () => {
  const { prepareWorkspace } = await import("./workspace.ts");
  const { loadScenario } = await import("./scenario.ts");
  const { sh } = await import("./context.ts");
  const dir = mkdtempSync("/tmp/doan-eval-path-");
  const original = process.env.PATH;
  try {
    writeFileSync(join(dir, "doan"), "#!/bin/sh\necho inherited-doan\n", { mode: 0o755 });
    writeFileSync(join(dir, "eval-peer"), "#!/bin/sh\necho peer-ok\n", { mode: 0o755 });
    process.env.PATH = `${dir}:${original}`;
    const scenario = { ...loadScenario(new URL("../scenarios", import.meta.url).pathname, "R2"), shellCli: false };
    const cli = "/tmp/packaged CLI/doan";
    const ws = await prepareWorkspace({ scenario, agent: "claude", cli, stub: "stub" });
    try {
      assert.equal(existsSync(join(ws.base, "bin/doan")), false);
      assert.notEqual(sh("/bin/sh", ["-c", "command -v doan"], ws.repo, ws.env).code, 0);
      assert.equal(sh("eval-peer", [], ws.repo, ws.env).stdout.trim(), "peer-ok");
      assert.equal(existsSync(join(ws.base, "mcp.json")), false);
    } finally { await ws.dispose(); }
    assert.equal(readFileSync(join(dir, "doan"), "utf8"), "#!/bin/sh\necho inherited-doan\n");
  } finally {
    process.env.PATH = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("provenance without a shell CLI requires an explicit absent CLI report", async () => {
  const { cliProvenance } = await import("./agent.ts");
  const dir = mkdtempSync("/tmp/doan-eval-provenance-");
  try {
    const report = join(dir, "resolved-doan.txt");
    assert.equal(cliProvenance(report, null).pass, false);
    writeFileSync(report, "");
    assert.equal(cliProvenance(report, null).pass, true);
    writeFileSync(report, "/usr/local/bin/doan\n");
    assert.equal(cliProvenance(report, null).pass, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
