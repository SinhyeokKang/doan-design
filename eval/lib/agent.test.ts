import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { join } from "node:path";
import { test } from "node:test";
import { agentCommand, isolateUserInstructions, registeredCodexMcpServers, runProcess, readAgentTranscript } from "./agent.ts";
import { buildJudgePrompt } from "./judge.ts";
import { createContext } from "./context.ts";

test("agent commands match the documented invocations", () => {
  assert.deepEqual(agentCommand("claude", "P"), { cmd: "claude", args: ["-p", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--allowedTools", "Bash Read Write Edit Glob Grep", "--", "P"] });
  assert.deepEqual(agentCommand("codex", "P"), { cmd: "codex", args: ["exec", "--sandbox", "workspace-write", "-c", "features.shell_snapshot=false", "-c", 'approval_policy="never"', "-c", "allow_login_shell=false", "P"] });
  assert.deepEqual(agentCommand("codex", "P", ["figma", "doan"]), { cmd: "codex", args: ["exec", "--sandbox", "workspace-write", "-c", "features.shell_snapshot=false", "-c", 'approval_policy="never"', "-c", "allow_login_shell=false", "-c", "mcp_servers.doan.enabled=false", "P"] });
});

// Codex 0.167 `exec` refuses to start outside a Git repository unless the directory is trusted,
// and a run's fresh folder never is; Git workspaces keep the check.
test("Codex skips its Git repository check only in a scenario folder outside Git", () => {
  assert.deepEqual(agentCommand("codex", "P", [], false), { cmd: "codex", args: ["exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "-c", "features.shell_snapshot=false", "-c", 'approval_policy="never"', "-c", "allow_login_shell=false", "P"] });
  assert.ok(!agentCommand("codex", "P", [], true).args.includes("--skip-git-repo-check"));
  assert.deepEqual(agentCommand("claude", "P", [], false), agentCommand("claude", "P"));
});

// Codex merges `-c mcp_servers={}` into the machine's servers, so a registered doan server is switched off by name.
// Codex 0.166 refuses to start on an override for an undefined server, so only a registered one gets it.
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

// A login shell re-reads the user's profile, which puts ~/.local/bin ahead of the run's bin directory.
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
    writeFileSync(join(sessions, `rollout-date-${id}.jsonl`), rollout, { mode: 0o600 });
    writeFileSync(join(sessions, "rollout-other.jsonl"), "unrelated");
    writeFileSync(join(dir, "stdout.log"), "answer");
    writeFileSync(join(dir, "stderr.log"), `session id: ${id}\n`);
    const result = readAgentTranscript("codex", dir, { CODEX_HOME: home });
    assert.equal(result.transcript, `answer\nsession id: ${id}\n`);
    assert.deepEqual(result.calls.commands, ["doan active --json", "rg --files"]);
    assert.ok(!JSON.stringify(result).includes("unrelated"));
    assert.equal(readFileSync(join(dir, "codex-rollout.jsonl"), "utf8"), rollout);
    assert.equal(statSync(join(dir, "codex-rollout.jsonl")).mode & 0o077, 0);
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

// Every file and directory under `dir` with its bytes and modification time, to show a home was left as it was.
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    const path = join(entry.parentPath, entry.name);
    const stat = lstatSync(path);
    out[path] = `${stat.mtimeMs} ${entry.isFile() ? readFileSync(path, "utf8") : entry.isDirectory() ? "dir" : "other"}`;
  }
  return out;
}

// A run must not inherit the user's own instructions, yet signs in as the user with the user's model settings.
test("a Codex run gets its own CODEX_HOME that links only sign-in from the user's and copies the user's config", () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const real = join(dir, "real");
    mkdirSync(join(real, "skills/mine"), { recursive: true });
    mkdirSync(join(real, "rules"));
    mkdirSync(join(real, "sessions"));
    for (const [name, text] of Object.entries({ "AGENTS.md": "say 구현 시작해\n", "AGENTS.override.md": "override\n", ".env": "PATH=/decoy\n", "auth.json": "{\"tokens\":1}\n", "auth.lock": "", "auth.json.lock": "", "config.toml": "model = \"m\"\n", "hooks.json": "{}\n", "skills/mine/SKILL.md": "skill\n", "rules/default.rules": "rule\n" }))
      writeFileSync(join(real, name), text);
    const before = snapshot(real);
    const home = join(dir, "run/codex-home");
    const env = isolateUserInstructions("codex", { CODEX_HOME: real, HOME: dir, PATH: "/run/bin" }, home);
    assert.equal(env.CODEX_HOME, home);
    assert.equal(env.PATH, "/run/bin");
    assert.equal(env.CLAUDE_CODE_DISABLE_CLAUDE_MDS, undefined);
    assert.deepEqual(readdirSync(home).sort(), ["auth.json", "auth.json.lock", "auth.lock", "config.toml"]);
    // Links, not copies: Codex writes refreshed tokens through auth.json in place and coordinates with the user's own
    // Codex through auth.lock and auth.json.lock, so a copy would leave the user's sign-in behind.
    for (const name of ["auth.json", "auth.json.lock", "auth.lock"]) {
      assert.ok(lstatSync(join(home, name)).isSymbolicLink(), name);
      assert.equal(readlinkSync(join(home, name)), join(real, name));
    }
    // A copy: Codex saves project trust into $CODEX_HOME/config.toml (`codex exec --trust`, codex-cli 0.169.0), so a
    // link would carry a run's writes into the user's config.
    assert.ok(lstatSync(join(home, "config.toml")).isFile());
    assert.equal(readFileSync(join(home, "config.toml"), "utf8"), "model = \"m\"\n");
    writeFileSync(join(home, "config.toml"), "written by the run\n");
    assert.deepEqual(snapshot(real), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Codex 0.169.0 loads a project's .codex/ rule only for a project trusted in config.toml (a `-c` trust override
// does not count), so the run's config.toml must carry that trust.
test("a Codex run's config trusts exactly the given folders on top of the user's settings", () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const real = join(dir, "real");
    mkdirSync(real);
    writeFileSync(join(real, "auth.json"), "{}\n");
    writeFileSync(join(real, "config.toml"), "model = \"m\"\n\n[projects.\"/elsewhere\"]\ntrust_level = \"untrusted\"");
    const before = snapshot(real);
    const repo = join(dir, "run/repo");
    const worktree = join(dir, "run/worktree");
    const home = isolateUserInstructions("codex", { CODEX_HOME: real, HOME: dir }, join(dir, "run/codex-home"), [repo, worktree]).CODEX_HOME!;
    assert.equal(readFileSync(join(home, "config.toml"), "utf8"),
      `model = "m"\n\n[projects."/elsewhere"]\ntrust_level = "untrusted"\n\n[projects.${JSON.stringify(repo)}]\ntrust_level = "trusted"\n\n[projects.${JSON.stringify(worktree)}]\ntrust_level = "trusted"\n`);
    assert.deepEqual(snapshot(real), before);
    // With no user config, the run's config holds only the trust.
    const bare = join(dir, "bare");
    mkdirSync(bare);
    const bareHome = isolateUserInstructions("codex", { CODEX_HOME: bare, HOME: dir }, join(dir, "run2"), [repo]).CODEX_HOME!;
    assert.equal(readFileSync(join(bareHome, "config.toml"), "utf8"), `[projects.${JSON.stringify(repo)}]\ntrust_level = "trusted"\n`);
    assert.deepEqual(readdirSync(bare), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Codex (0.169.0) creates its lock files only at a sign-in or token refresh, so a run prepared before then must
// still take the user's locks.
test("the user's lock files are linked whenever auth.json is, even before Codex has created them; that home defaults to ~/.codex", () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    mkdirSync(join(dir, ".codex"));
    writeFileSync(join(dir, ".codex/auth.json"), "{}\n");
    writeFileSync(join(dir, ".codex/AGENTS.md"), "global\n");
    const home = join(dir, "run/codex-home");
    const env = isolateUserInstructions("codex", { HOME: dir }, home);
    assert.equal(env.CODEX_HOME, home);
    assert.deepEqual(readdirSync(home).sort(), ["auth.json", "auth.json.lock", "auth.lock"]);
    for (const name of ["auth.json", "auth.json.lock", "auth.lock"]) assert.equal(readlinkSync(join(home, name)), join(dir, ".codex", name));
    // An empty CODEX_HOME is unset, as readAgentTranscript reads it.
    assert.deepEqual(readdirSync(isolateUserInstructions("codex", { HOME: dir, CODEX_HOME: "" }, join(dir, "run2")).CODEX_HOME!).sort(), ["auth.json", "auth.json.lock", "auth.lock"]);
    // A lock link that dangles creates nothing in the user's home until Codex takes the lock there.
    assert.deepEqual(readdirSync(join(dir, ".codex")).sort(), ["AGENTS.md", "auth.json"]);
    // With no sign-in to coordinate, nothing is linked.
    const none = join(dir, "none");
    mkdirSync(none);
    assert.deepEqual(readdirSync(isolateUserInstructions("codex", { HOME: dir, CODEX_HOME: none }, join(dir, "run3")).CODEX_HOME!), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Claude Code 2.1.325 loads ~/.claude/CLAUDE.md (or $CLAUDE_CONFIG_DIR/CLAUDE.md) and user rules whenever user settings
// load, and user settings also carry the model; CLAUDE_CODE_DISABLE_CLAUDE_MDS turns off only the memory files.
test("a Claude run ignores CLAUDE.md memory files and keeps the user's config directory", () => {
  const dir = mkdtempSync("/tmp/doan-eval-test-");
  try {
    const env = isolateUserInstructions("claude", { CLAUDE_CONFIG_DIR: "/config", HOME: "/home", CODEX_HOME: "/codex" }, join(dir, "unused"));
    assert.equal(env.CLAUDE_CODE_DISABLE_CLAUDE_MDS, "1");
    assert.equal(env.CLAUDE_CONFIG_DIR, "/config");
    assert.equal(env.CODEX_HOME, "/codex");
    assert.equal(existsSync(join(dir, "unused")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// CLAUDE_CODE_DISABLE_CLAUDE_MDS also hides a project's own memory files, so a seed must not rely on one.
test("no scenario seed carries a project memory file the Claude isolation would hide", () => {
  const scenarios = join(import.meta.dirname, "../scenarios");
  const found: string[] = [];
  for (const id of readdirSync(scenarios)) {
    const seed = join(scenarios, id, "seed");
    if (!existsSync(seed) || !statSync(seed).isDirectory()) continue;
    for (const entry of readdirSync(seed, { recursive: true, withFileTypes: true })) {
      const path = join(entry.parentPath, entry.name).slice(seed.length + 1);
      if (/(?:^|\/)(?:CLAUDE\.md|CLAUDE\.local\.md)$|(?:^|\/)\.claude\/rules(?:\/|$)/.test(path)) found.push(`${id}/seed/${path}`);
    }
  }
  assert.deepEqual(found, []);
});
