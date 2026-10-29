import { connectionSummary } from "../../setup/connectionSummary";
import { agentsView, idleUi } from "../../renderer/onboardingView";
import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtempSync, realpathSync, lstatSync, readdirSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, readlinkSync, rmSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createMachine, runProcess, probeShell, SHELL_TIMEOUT_MS, AGENT_TIMEOUT_MS } from "./machine";
let temp: string;
let home: string;
let env: NodeJS.ProcessEnv;
let cli: string;
let oldHome: string | undefined;
function file(path: string, content: string, mode = 0o644) { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, content, { mode }); }
function treeHash(path: string): string {
  const info = lstatSync(path);
  const value = info.isSymbolicLink() ? `link:${readlinkSync(path)}` : info.isDirectory() ? readdirSync(path).sort().map(name => `${name}:${treeHash(join(path, name))}`).join("\n") : readFileSync(path).toString("base64");
  return createHash("sha256").update(`${info.mode}:${value}`).digest("hex");
}
function machine(command = cli) { return createMachine({ env, command, version: "9.8.7" }); }
beforeEach(() => {
  temp = realpathSync(mkdtempSync("/tmp/doan-G-")); home = join(temp, "home"); mkdirSync(home);
  oldHome = process.env.HOME; process.env.HOME = home;
  cli = join(temp, "doan"); file(cli, "#!/bin/sh\nexit 0\n", 0o755);
  env = { HOME: home, PATH: "/usr/bin:/bin", SHELL: join(temp, "zsh"), CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex") };
  file(env.SHELL!, '#!/bin/sh\nPATH="$HOME/bin:/usr/bin:/bin"; export PATH\neval "$2"\n', 0o755);
});
afterEach(() => { if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome; rmSync(temp, { recursive: true, force: true }); });
test("pins bounded deadlines above the measured shell and agent durations", () => { expect(SHELL_TIMEOUT_MS).toBe(5000); expect(AGENT_TIMEOUT_MS).toBe(10000); expect(homedir()).toBe(home); });
test("probes nonce output, ignores startup noise and settles without inherited pipe close", async () => {
  file(env.SHELL!, '#!/bin/sh\necho noise\neval "$2"\nsleep 30 &\n', 0o755);
  expect(await probeShell(env)).toMatchObject({ ok: true, path: "/usr/bin:/bin" });
});
test("unexecutable shell and missing fallback are check failures", async () => {
  expect(await probeShell({ ...env, SHELL: "/no/shell" })).toMatchObject({ ok: false });
  expect(await probeShell({ ...env, SHELL: undefined }, () => "")).toMatchObject({ ok: false });
});
test("process deadline and ENOENT settle once with stdin ignored", async () => {
  expect(await runProcess("/bin/sh", ["-c", "read value; echo eof"], env, 500)).toMatchObject({ stdout: "eof\n", exitCode: 0 });
  expect(await runProcess("/bin/sleep", ["30"], env, 20)).toMatchObject({ timedOut: true });
  expect(await runProcess("/missing/agent", [], env, 100)).toMatchObject({ spawnError: expect.any(String) });
});
test("CLI install is atomic, concurrent requests cannot write twice and stale snapshots fail", async () => {
  const m = machine(); const state = await m.read("r1");
  const request = { step: "cli", expected: state.expected };
  const results = await Promise.all([m.run(request), m.run(request)]);
  expect(results.map(r => r.kind).sort()).toEqual(["busy", "success"]);
  expect(readlinkSync(join(home, ".local/bin/doan"))).toBe(cli);
  expect((await m.run(request)).kind).toBe("stale");
  expect((await m.read("r2")).cli.state).toBe("ours");
});
test.each(["file", "directory", "parent-file"])("blocked %s stays byte-identical", async kind => {
  const target = join(home, ".local/bin/doan");
  if (kind === "parent-file") file(join(home, ".local/bin"), "keep");
  else if (kind === "file") file(target, "keep");
  else mkdirSync(target, { recursive: true });
  const before = treeHash(home);
  const m = machine(); const state = await m.read("r"); expect(state.cli.state).toBe("blocked");
  expect((await m.run({ step: "cli", expected: state.expected })).kind).toBe("unavailable");
  expect(treeHash(home)).toBe(before);
});
test("replacement requires confirmation and rechecks the exact readlink before writing", async () => {
  const target = join(home, ".local/bin/doan"); mkdirSync(join(target, ".."), { recursive: true }); symlinkSync("/old", target);
  const m = machine(); const state = await m.read("r");
  const result = await m.run({ step: "cli", expected: state.expected }); expect(result.kind).toBe("confirm");
  if (result.kind !== "confirm") throw new Error("confirmation absent");
  expect(readlinkSync(target)).toBe("/old"); rmSync(target); symlinkSync("/changed", target);
  expect((await m.answer({ id: result.id, allow: true })).kind).toBe("stale"); expect(readlinkSync(target)).toBe("/changed");
});
test.each(["doan", "/private/AppTranslocation/copy/doan"])("refuses unavailable CLI %s", async command => {
  const m = machine(command); const state = await m.read("r");
  expect((await m.run({ step: "cli", expected: state.expected })).kind).toBe("unavailable");
});
function agent(name: string) {
  file(join(home, "bin", name), `#!/bin/sh\nprintf '%s\\n' "$*" >> "$HOME/calls"\nif [ "$2" = get ]; then echo "Error: No MCP server named 'doan' found." >&2; exit 1; fi\nexit 0\n`, 0o755);
}
test("state names the paths and targets the wizard shows", async () => {
  const custom = await machine().read("r");
  expect(custom.display).toEqual({
    home, cliPath: join(home, ".local/bin/doan"), cliTarget: cli, stubPath: join(home, ".agents/skills/doan/SKILL.md"),
    claudeLinkPath: join(home, ".claude/skills/doan"), claudeLinkTarget: "../../.agents/skills/doan", mcpCommand: `${join(home, ".local/bin/doan")} mcp`,
    configFile: { claude: join(home, ".claude/.claude.json"), codex: join(home, ".codex/config.toml") }, configFromEnv: { claude: true, codex: true },
    blocked: { cli: null, stub: null, claudeLink: null }, appVersion: "9.8.7",
  });
  delete env.CLAUDE_CONFIG_DIR; delete env.CODEX_HOME;
  const defaults = await machine("doan").read("r");
  expect(defaults.display).toMatchObject({ cliTarget: null, configFile: { claude: join(home, ".claude.json"), codex: join(home, ".codex/config.toml") }, configFromEnv: { claude: false, codex: false } });
});
test.each([["target", ".local/bin/doan"], ["parent", ".local/bin"]])("state names the item in the way of a blocked %s", async (_kind, name) => {
  file(join(home, name), "keep");
  file(join(home, ".agents/skills/doan"), "keep");
  const state = await machine().read("r");
  expect(state.display.blocked).toEqual({ cli: join(home, name), stub: join(home, ".agents/skills/doan"), claudeLink: null });
});
const mcpWrites = () => existsSync(join(home, "calls")) ? readFileSync(join(home, "calls"), "utf8").split("\n").filter(line => /^mcp (add|remove)/.test(line)) : [];
function cliNotOurs(kind: "missing" | "dangling" | "link-other" | "blocked") {
  const target = join(home, ".local/bin/doan");
  if (kind === "link-other" || kind === "dangling") {
    const old = join(temp, "old-doan");
    if (kind === "link-other") file(old, "old CLI");
    mkdirSync(join(target, ".."), { recursive: true }); symlinkSync(old, target);
  }
  else if (kind === "blocked") file(target, "keep");
}
// design.md flow 6: only MCP needs the step 1 link; the stub and Claude link do not.
test.each((["missing", "dangling", "link-other", "blocked"] as const).flatMap(cliKind => (["claude", "codex"] as const).map(name => ({ cliKind, name }))))("CLI $cliKind: $name connect installs the stub and link but never writes MCP", async ({ cliKind, name }) => {
  agent(name); cliNotOurs(cliKind); const m = machine(); const state = await m.read("r");
  expect(await m.run({ step: "connect", agent: name, expected: state.expected })).toEqual({ kind: "unavailable", message: "Install the CLI link in step 1 before connecting MCP." });
  expect(readFileSync(join(home, ".agents/skills/doan/SKILL.md"), "utf8")).toContain("[doan:skill] end of guide");
  if (name === "claude") expect(realpathSync(join(home, ".claude/skills/doan"))).toBe(join(home, ".agents/skills/doan"));
  else expect(existsSync(join(home, ".claude/skills/doan"))).toBe(false);
  expect(mcpWrites()).toEqual([]);
  expect((await m.read("r2")).cli.state).toBe(cliKind);
});
test("CLI missing: replacements still ask, Cancel writes nothing and approval stops before MCP", async () => {
  agent("claude"); const m = machine();
  const stub = join(home, ".agents/skills/doan/SKILL.md"); file(stub, "custom");
  const link = join(home, ".claude/skills/doan"); mkdirSync(join(link, ".."), { recursive: true }); symlinkSync("/elsewhere", link);
  const asked = await m.run({ step: "connect", agent: "claude", expected: (await m.read("1")).expected });
  if (asked.kind !== "confirm") throw new Error("confirmation absent"); expect(asked.target).toBe("stub");
  expect(await m.answer({ id: asked.id, allow: false })).toEqual({ kind: "cancelled" });
  expect(readFileSync(stub, "utf8")).toBe("custom"); expect(readlinkSync(link)).toBe("/elsewhere");
  const again = await m.run({ step: "connect", agent: "claude", expected: (await m.read("2")).expected });
  if (again.kind !== "confirm") throw new Error("confirmation absent");
  const linkAsk = await m.answer({ id: again.id, allow: true });
  if (linkAsk.kind !== "confirm") throw new Error("link confirmation absent"); expect(linkAsk.target).toBe("claudeLink");
  expect(await m.answer({ id: linkAsk.id, allow: true })).toMatchObject({ kind: "unavailable" });
  expect(readFileSync(stub, "utf8")).toContain("[doan:skill] end of guide"); expect(realpathSync(link)).toBe(join(home, ".agents/skills/doan"));
  expect(mcpWrites()).toEqual([]);
});
test("CLI missing: an existing other MCP registration is neither confirmed nor replaced", async () => {
  const exe = join(home, "bin/codex");
  file(exe, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$HOME/calls"\nif [ "$2" = get ]; then printf '%s\\n' '{"name":"doan","enabled":true,"transport":{"type":"stdio","command":"/other","args":["mcp"]}}'; fi\n`, 0o755);
  const m = machine();
  expect(await m.run({ step: "connect", agent: "codex", expected: (await m.read("1")).expected })).toMatchObject({ kind: "unavailable" });
  expect(mcpWrites()).toEqual([]);
});
test("Claude connect installs stub and a relative custom-config link then uses user scope with probed env", async () => {
  agent("claude"); env.CLAUDE_CONFIG_DIR = join(home, "custom/deeper/config");
  const m = machine(); let state = await m.read("r"); await m.run({ step: "cli", expected: state.expected }); state = await m.read("r2");
  expect((await m.run({ step: "connect", agent: "claude", expected: state.expected })).kind).toBe("success");
  expect(readFileSync(join(home, ".agents/skills/doan/SKILL.md"), "utf8")).toContain("[doan:skill] end of guide");
  expect(realpathSync(join(env.CLAUDE_CONFIG_DIR!, "skills/doan"))).toBe(join(home, ".agents/skills/doan"));
  expect(readlinkSync(join(env.CLAUDE_CONFIG_DIR!, "skills/doan"))).not.toBe("../../.agents/skills/doan");
  expect(readFileSync(join(home, "calls"), "utf8")).toBe(`mcp add --scope user doan -- ${home}/.local/bin/doan mcp\n`);
});
test("changed stub confirmation preserves siblings and cancellation never replaces", async () => {
  agent("claude"); const m = machine(); await m.run({ step: "cli", expected: (await m.read("1")).expected });
  const stub = join(home, ".agents/skills/doan/SKILL.md"); file(stub, "custom"); file(join(stub, "../notes"), "keep");
  const result = await m.run({ step: "connect", agent: "claude", expected: (await m.read("2")).expected });
  expect(result.kind).toBe("confirm"); if (result.kind !== "confirm") throw new Error("confirmation absent");
  expect((await m.answer({ id: result.id, allow: false })).kind).toBe("cancelled"); expect(readFileSync(stub, "utf8")).toBe("custom");
  const retry = await m.run({ step: "connect", agent: "claude", expected: (await m.read("3")).expected });
  if (retry.kind !== "confirm") throw new Error("confirmation absent");
  expect((await m.answer({ id: retry.id, allow: true })).kind).toBe("success"); expect(readFileSync(join(stub, "../notes"), "utf8")).toBe("keep");
});
test.each(["file-link", "file-directory"])("blocked stub %s stops before MCP and preserves content", async kind => {
  agent("claude"); const m = machine(); await m.run({ step: "cli", expected: (await m.read("1")).expected });
  const stub = join(home, ".agents/skills/doan/SKILL.md");
  { mkdirSync(dirnameForTest(stub), { recursive: true }); if (kind === "file-link") symlinkSync(cli, stub); else mkdirSync(stub); }
  const before = treeHash(home);
  const state = await m.read("2"); expect(state.stub.state).toBe("blocked");
  expect((await m.run({ step: "connect", agent: "claude", expected: state.expected })).kind).toBe("unavailable");
  expect(treeHash(home)).toEqual(before); expect(existsSync(join(home, "calls"))).toBe(false);
});
function dirnameForTest(path: string) { return join(path, ".."); }
test("Codex replacement asks once then overwrites without remove", async () => {
  const exe = join(home, "bin/codex");
  file(exe, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$HOME/calls"\nif [ "$2" = get ]; then printf '%s\\n' '{"name":"doan","enabled":true,"transport":{"type":"stdio","command":"/other","args":["mcp"]}}'; fi\n`, 0o755);
  const m = machine(); await m.run({ step: "cli", expected: (await m.read("1")).expected });
  const pending = await m.run({ step: "connect", agent: "codex", expected: (await m.read("2")).expected });
  expect(pending.kind).toBe("confirm"); if (pending.kind !== "confirm") throw new Error("confirmation absent");
  expect(readFileSync(join(home, "calls"), "utf8")).not.toContain("mcp add");
  expect((await m.answer({ id: pending.id, allow: true })).kind).toBe("success");
  const calls = readFileSync(join(home, "calls"), "utf8"); expect(calls).toContain(`mcp add doan -- ${home}/.local/bin/doan mcp`); expect(calls).not.toContain("mcp remove");
});
test("Claude failed replacement retains original registration and stops after remove failure", async () => {
  agent("claude"); const config = join(env.CLAUDE_CONFIG_DIR!, ".claude.json");
  const original = { command: "/other", args: ["mcp"] }; file(config, JSON.stringify({ mcpServers: { doan: original } }));
  file(join(home, "bin/claude"), '#!/bin/sh\necho "$*" >> "$HOME/calls"\necho failure >&2\nexit 1\n', 0o755);
  const m = machine(); await m.run({ step: "cli", expected: (await m.read("1")).expected });
  const pending = await m.run({ step: "connect", agent: "claude", expected: (await m.read("2")).expected });
  if (pending.kind !== "confirm") throw new Error("confirmation absent");
  expect(await m.answer({ id: pending.id, allow: true })).toMatchObject({ kind: "error", original: JSON.stringify(original) });
  expect(readFileSync(join(home, "calls"), "utf8")).toBe("mcp remove --scope user doan\n");
});
test("agent disappearing after detection reports failure and never invokes another executable", async () => {
  agent("claude"); const m = machine(); await m.run({ step: "cli", expected: (await m.read("1")).expected });
  const state = await m.read("2"); rmSync(join(home, "bin/claude"));
  expect((await m.run({ step: "connect", agent: "claude", expected: state.expected })).kind).toBe("stale");
  expect(existsSync(join(home, "calls"))).toBe(false);
});

test.each(["claude", "codex"] as const)("invalid config only blocks its own agent: %s", async invalid => {
  agent("claude"); agent("codex");
  const key = invalid === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
  env[key] = "~/invalid";
  const other = invalid === "claude" ? "codex" : "claude";
  const m = machine(); await m.run({ step: "cli", expected: (await m.read("1")).expected });
  const state = await m.read("2");
  expect(state.agents[other].mcp.state).toBe("missing");
  expect(await m.run({ step: "connect", agent: other, expected: state.expected })).toEqual({ kind: "success" });
  expect(await m.run({ step: "connect", agent: invalid, expected: (await m.read("3")).expected })).toMatchObject({ kind: "unavailable", message: `${key} must be an absolute path: ~/invalid` });
});

test("canonical identity uses disk spelling and leaves link loops foreign", async () => {
  const mixed = join(temp, "CaseDir/Doan"); file(mixed, "cli");
  const alternate = join(temp, "casedir/doan");
  // This regression exercises the case-insensitive macOS volume used by the app.
  expect(existsSync(alternate)).toBe(true);
  const target = join(home, ".local/bin/doan"); mkdirSync(join(target, ".."), { recursive: true }); symlinkSync(alternate, target);
  expect((await machine(mixed).read("1")).cli.state).toBe("ours");
  rmSync(target); symlinkSync(target, target);
  expect((await machine(mixed).read("2")).cli.state).toBe("link-other");
});

test.each([".local", ".claude", ".agents"].flatMap(name => ["link", "file"].map(kind => ({ name, kind }))))("blocked message identifies ancestor $name ($kind)", async ({ name, kind }) => {
  agent("claude"); const m = machine();
  if (name !== ".local") await m.run({ step: "cli", expected: (await m.read("1")).expected });
  const ancestor = join(home, name); if (kind === "link") symlinkSync(join(temp, "missing"), ancestor); else file(ancestor, "keep");
  const result = await m.run({ step: name === ".local" ? "cli" : "connect", ...(name === ".local" ? {} : { agent: "claude" }), expected: (await m.read("2")).expected });
  expect(result).toMatchObject({ kind: "unavailable", message: expect.stringContaining(`${ancestor} is ${kind === "link" ? "a link" : "not a directory"}.`) });
});

test("sibling auto-update does not stale a pending link replacement", async () => {
  const target = join(home, ".local/bin/doan"); mkdirSync(join(target, ".."), { recursive: true }); symlinkSync("/old", target);
  const m = machine(); const pending = await m.run({ step: "cli", expected: (await m.read("1")).expected });
  if (pending.kind !== "confirm") throw new Error("confirmation absent");
  file(join(target, "../claude"), "new version");
  expect(await m.answer({ id: pending.id, allow: true })).toEqual({ kind: "success" });
});

test("invoke-time ENOENT names the detected executable", async () => {
  const exe = join(home, "bin/claude"); file(exe, "#!/missing/interpreter\n", 0o755);
  const m = machine(); await m.run({ step: "cli", expected: (await m.read("1")).expected });
  expect(await m.run({ step: "connect", agent: "claude", expected: (await m.read("2")).expected })).toMatchObject({ kind: "error", message: expect.stringContaining(`Couldn't run Claude Code at ${exe}. Choose Check Again.`) });
});

test("a Codex registration that cannot be run keeps the agent, path and cause", async () => {
  const exe = join(home, "bin/codex"); file(exe, "#!/missing/interpreter\n", 0o755);
  const state = await machine().read("r");
  expect(state.agents.codex.mcp.state).toBe("unknown");
  expect(state.agents.codex.mcp.value).toMatch(new RegExp(`^Couldn't run Codex at ${exe}\\. .*ENOENT`));
  expect(state.agents.codex.mcp.value).not.toContain("Check Again");
});
test("unreadable and absent registrations stay distinct from run failures", async () => {
  file(join(home, "bin/codex"), "#!/bin/sh\necho 'not json'\n", 0o755); agent("claude");
  let state = await machine().read("r");
  expect(state.agents.codex.mcp).toEqual({ state: "unknown", value: "Unreadable registration." });
  expect(state.agents.claude.mcp).toEqual({ state: "missing", value: "" });
  agent("codex"); state = await machine().read("r2");
  expect(state.agents.codex.mcp).toEqual({ state: "missing", value: "" });
});
test.each(["claude", "codex"] as const)("an invalid %s config location is the shown cause", async name => {
  agent(name); const key = name === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME"; env[key] = "~/invalid";
  expect((await machine().read("r")).agents[name].mcp).toEqual({ state: "unknown", value: `${key} must be an absolute path: ~/invalid` });
});


test.each(["skills", "config"])("Claude follows a symlinked %s directory and resolves the relative skill link from its real parent", async kind => {
  agent("claude");
  const realConfig = join(home, ".claude"); mkdirSync(join(realConfig, "skills"), { recursive: true });
  const config = join(home, "profiles/id/home"); mkdirSync(join(config, ".."), { recursive: true });
  if (kind === "config") symlinkSync(realConfig, config);
  else { mkdirSync(config); symlinkSync(join(realConfig, "skills"), join(config, "skills")); }
  env.CLAUDE_CONFIG_DIR = config;
  const m = machine(); await m.run({ step: "cli", expected: (await m.read("1")).expected });
  const state = await m.read("2");
  expect(state.claudeLink.state).toBe("missing");
  expect(state.display.claudeLinkPath).toBe(join(config, "skills/doan"));
  expect(state.display.realPaths?.claudeLink).toBe(join(realConfig, "skills/doan"));
  expect(state.display.claudeLinkTarget).toBe("../../.agents/skills/doan");
  expect(await m.run({ step: "connect", agent: "claude", expected: state.expected })).toEqual({ kind: "success" });
  expect(readlinkSync(join(realConfig, "skills/doan"))).toBe("../../.agents/skills/doan");
  expect(readFileSync(join(config, "skills/doan/SKILL.md"), "utf8")).toContain("[doan:skill] end of guide");
});

test.each([".agents", ".agents/skills", ".local/bin"])("setup follows the existing directory at %s", async name => {
  agent("claude");
  const real = join(temp, "managed"); mkdirSync(real);
  const link = join(home, name); mkdirSync(join(link, ".."), { recursive: true }); symlinkSync(real, link);
  const m = machine();
  expect(await m.run({ step: "cli", expected: (await m.read("1")).expected })).toEqual({ kind: "success" });
  expect(await m.run({ step: "connect", agent: "claude", expected: (await m.read("2")).expected })).toEqual({ kind: "success" });
  const target = name === ".local/bin" ? "doan" : name === ".agents" ? "skills/doan/SKILL.md" : "doan/SKILL.md";
  expect(existsSync(join(real, target))).toBe(true);
  expect(readFileSync(join(home, ".claude/skills/doan/SKILL.md"), "utf8")).toContain("[doan:skill] end of guide");
});

test.each(["dangling", "file", "loop"])("blocks a %s ancestor link without writing through it", async kind => {
  const link = join(home, ".local/bin"); mkdirSync(join(home, ".local"));
  const target = join(temp, "destination"); if (kind === "file") file(target, "keep");
  symlinkSync(kind === "loop" ? link : target, link);
  const before = treeHash(temp), m = machine(), state = await m.read("1");
  expect(state.cli.state).toBe("blocked");
  expect(await m.run({ step: "cli", expected: state.expected })).toMatchObject({ kind: "unavailable" });
  expect(treeHash(temp)).toBe(before);
});

test.each([".local/bin", ".agents/skills", ".claude/skills"])("swapping ancestor %s after the read is stale even with missing final targets", async name => {
  agent("claude");
  const first = join(temp, "first"), second = join(temp, "second"); mkdirSync(first); mkdirSync(second);
  const parent = join(home, name); mkdirSync(join(parent, ".."), { recursive: true }); symlinkSync(first, parent);
  const m = machine(), state = await m.read("1");
  rmSync(parent); symlinkSync(second, parent);
  expect(await m.run({ step: name === ".local/bin" ? "cli" : "connect", ...(name === ".local/bin" ? {} : { agent: "claude" }), expected: state.expected })).toEqual({ kind: "stale" });
  expect(readdirSync(first)).toEqual([]); expect(readdirSync(second)).toEqual([]);
});


test.each(["claude", "shared"])("Claude uses the shared stub when the %s skills directory aliases the other", async direction => {
  agent("claude");
  const shared = join(home, ".agents/skills"), claude = join(home, ".claude/skills");
  const target = direction === "claude" ? shared : claude, alias = direction === "claude" ? claude : shared;
  mkdirSync(target, { recursive: true }); mkdirSync(join(alias, ".."), { recursive: true }); symlinkSync(target, alias);
  const m = machine(); await m.run({ step: "cli", expected: (await m.read("1")).expected });
  const before = await m.read("2");
  expect(before.claudeLink.state).toBe("missing");
  expect(await m.run({ step: "connect", agent: "claude", expected: before.expected })).toEqual({ kind: "success" });
  const after = await m.read("3");
  expect(after.stub.state).toBe("ours"); expect(after.claudeLink.state).toBe("ours");
  expect(after.display).toMatchObject({ claudeSharedSkills: true, claudeLinkTarget: "" });
  expect(after.display.blocked.claudeLink).toBeNull();
  expect(lstatSync(join(target, "doan")).isDirectory()).toBe(true);
  expect(readdirSync(join(target, "doan"))).toEqual(["SKILL.md"]);
  expect(readlinkSync(alias)).toBe(target);
  expect(mcpWrites()).toHaveLength(1);
  const unchanged = treeHash(target);
  expect(await m.run({ step: "connect", agent: "claude", expected: after.expected })).toEqual({ kind: "success" });
  expect(treeHash(target)).toBe(unchanged);
});

test("relative Claude config never displays a resolved destination or link target", async () => {
  agent("claude"); env.CLAUDE_CONFIG_DIR = "rel/claude";
  const m = machine(), state = await m.read("1");
  expect(state.display.claudeLinkPath).toBe("rel/claude/skills/doan");
  expect(state.display.realPaths?.claudeLink).toBeUndefined();
  expect(state.display.claudeLinkTarget).toBe("");
  expect(await m.run({ step: "connect", agent: "claude", expected: state.expected })).toMatchObject({ kind: "unavailable", message: expect.stringContaining("must be an absolute path") });
});

test("a dangling CLI link is diagnosed separately and requires approval before replacement", async () => {
  cliNotOurs("dangling"); const m = machine(); const state = await m.read("r");
  expect(state.cli.state).toBe("dangling");
  const target = join(home, ".local/bin/doan"), old = readlinkSync(target);
  const result = await m.run({ step: "cli", expected: state.expected });
  expect(result).toMatchObject({ kind: "confirm", message: `Current: ${old} (missing). New: ${cli}` });
  if (result.kind !== "confirm") throw new Error("confirmation absent");
  expect(readlinkSync(target)).toBe(old);
  expect(await m.answer({ id: result.id, allow: false })).toEqual({ kind: "cancelled" });
  expect(readlinkSync(target)).toBe(old);
  const retry = await m.run({ step: "cli", expected: (await m.read("r2")).expected });
  if (retry.kind !== "confirm") throw new Error("confirmation absent");
  expect(await m.answer({ id: retry.id, allow: true })).toEqual({ kind: "success" });
  expect((await m.read("r3")).cli.state).toBe("ours");
});
test("a dangling Claude skill link requires confirmation", async () => {
  agent("claude"); const m = machine();
  await m.run({ step: "cli", expected: (await m.read("r1")).expected });
  const link = join(home, ".claude/skills/doan"); mkdirSync(join(link, ".."), { recursive: true }); symlinkSync("/missing-doan-skill", link);
  const state = await m.read("r2"); expect(state.claudeLink.state).toBe("dangling");
  const result = await m.run({ step: "connect", agent: "claude", expected: state.expected });
  expect(result).toMatchObject({ kind: "confirm", target: "claudeLink" });
  expect(readlinkSync(link)).toBe("/missing-doan-skill");
});

test("existing other target: replacement requires confirmation and rechecks the exact readlink before writing", async () => {
  const target = join(home, ".local/bin/doan"); mkdirSync(join(target, ".."), { recursive: true }); const other = join(temp, "other-doan"); file(other, "other CLI"); symlinkSync(other, target);
  const m = machine(); const state = await m.read("r");
  const result = await m.run({ step: "cli", expected: state.expected }); expect(result.kind).toBe("confirm");
  if (result.kind !== "confirm") throw new Error("confirmation absent");
  expect(result.message).toBe(`Replace the link pointing to ${other}?`);
  const beforeCancel = treeHash(home);
  expect(await m.answer({ id: result.id, allow: false })).toEqual({ kind: "cancelled" });
  expect(treeHash(home)).toBe(beforeCancel);
  const retry = await m.run({ step: "cli", expected: (await m.read("again")).expected });
  if (retry.kind !== "confirm") throw new Error("confirmation absent");
  expect(readlinkSync(target)).toBe(other); rmSync(target); symlinkSync("/changed", target);
  expect((await m.answer({ id: retry.id, allow: true })).kind).toBe("stale"); expect(readlinkSync(target)).toBe("/changed");
});

test("existing other target: CLI missing: replacements still ask, Cancel writes nothing and approval stops before MCP", async () => {
  agent("claude"); const m = machine();
  const stub = join(home, ".agents/skills/doan/SKILL.md"); file(stub, "custom");
  const link = join(home, ".claude/skills/doan"); mkdirSync(join(link, ".."), { recursive: true }); const other = join(temp, "other-skill"); mkdirSync(other); symlinkSync(other, link);
  const asked = await m.run({ step: "connect", agent: "claude", expected: (await m.read("1")).expected });
  if (asked.kind !== "confirm") throw new Error("confirmation absent"); expect(asked.target).toBe("stub");
  expect(await m.answer({ id: asked.id, allow: false })).toEqual({ kind: "cancelled" });
  expect(readFileSync(stub, "utf8")).toBe("custom"); expect(readlinkSync(link)).toBe(other);
  const again = await m.run({ step: "connect", agent: "claude", expected: (await m.read("2")).expected });
  if (again.kind !== "confirm") throw new Error("confirmation absent");
  const linkAsk = await m.answer({ id: again.id, allow: true });
  if (linkAsk.kind !== "confirm") throw new Error("link confirmation absent"); expect(linkAsk.target).toBe("claudeLink");
  expect(linkAsk.message).toBe(`Replace the link pointing to ${other}?`);
  const beforeCancel = treeHash(home);
  expect(await m.answer({ id: linkAsk.id, allow: false })).toEqual({ kind: "cancelled" });
  expect(treeHash(home)).toBe(beforeCancel);
  const replacement = await m.run({ step: "connect", agent: "claude", expected: (await m.read("3")).expected });
  if (replacement.kind !== "confirm") throw new Error("link confirmation absent");
  expect(await m.answer({ id: replacement.id, allow: true })).toMatchObject({ kind: "unavailable" });
  expect(readFileSync(stub, "utf8")).toContain("[doan:skill] end of guide"); expect(realpathSync(link)).toBe(join(home, ".agents/skills/doan"));
  expect(mcpWrites()).toEqual([]);
});

test("existing other target: sibling auto-update does not stale a pending link replacement", async () => {
  const target = join(home, ".local/bin/doan"); mkdirSync(join(target, ".."), { recursive: true }); const other = join(temp, "other-doan"); file(other, "other CLI"); symlinkSync(other, target);
  const m = machine(); const pending = await m.run({ step: "cli", expected: (await m.read("1")).expected });
  if (pending.kind !== "confirm") throw new Error("confirmation absent");
  expect(pending.message).toBe(`Replace the link pointing to ${other}?`);
  file(join(target, "../claude"), "new version");
  expect(await m.answer({ id: pending.id, allow: true })).toEqual({ kind: "success" });
});

test.each(["relative", "absolute", "linked-parent"])("our %s Claude link with a missing shared stub is incomplete, not broken", async kind => {
  agent("claude"); const m = machine();
  await m.run({ step: "cli", expected: (await m.read("cli")).expected });
  const link = join(home, ".claude/skills/doan"), shared = join(home, ".agents/skills/doan");
  mkdirSync(join(link, ".."), { recursive: true });
  if (kind === "linked-parent") {
    const realSkills = join(temp, "real-skills"); mkdirSync(realSkills);
    mkdirSync(join(home, ".agents")); symlinkSync(realSkills, join(home, ".agents/skills"));
  }
  symlinkSync(kind === "absolute" ? shared : "../../.agents/skills/doan", link);
  const before = await m.read("before");
  expect(before.stub.state).toBe("missing");
  expect(before.claudeLink.state).toBe("missing");
  expect(connectionSummary(before, false).claude).toBe("not-connected");
  const card = agentsView(before, idleUi()).agents.find(card => card.agent === "claude");
  expect(card?.items.find(item => item.key === "claude-link")).toMatchObject({ chip: { text: "Not installed" } });
  expect(card?.items.find(item => item.key === "claude-link")?.msg).toBeUndefined();
  const linkStamp = lstatSync(link).ino;
  expect(await m.run({ step: "connect", agent: "claude", expected: before.expected })).toEqual({ kind: "success" });
  expect(lstatSync(link).ino).toBe(linkStamp);
  expect((await m.read("after")).claudeLink.state).toBe("ours");
});
test("a foreign missing Claude target remains broken when the shared stub is missing", async () => {
  agent("claude"); const link = join(home, ".claude/skills/doan");
  mkdirSync(join(link, ".."), { recursive: true }); symlinkSync("../../.agents/skills/other", link);
  const before = await machine().read("before");
  expect(before.stub.state).toBe("missing"); expect(before.claudeLink.state).toBe("dangling");
  expect(connectionSummary(before, false).claude).toBe("needs-attention");
  const card = agentsView(before, idleUi()).agents.find(card => card.agent === "claude");
  expect(card?.items.find(item => item.key === "claude-link")).toMatchObject({ chip: { text: "Link is broken" } });
});

test.each(["claude", "codex"] as const)("missing %s uses the display name and actionable check guidance", async agent => {
  const m = machine(); const state = await m.read("missing");
  expect(await m.run({ step: "connect", agent, expected: state.expected })).toMatchObject({
    kind: "unavailable", message: `Couldn't find ${agent === "claude" ? "Claude Code" : "Codex"}. Install it, then choose Check Again.`,
  });
});

test.each((["claude", "codex"] as const).flatMap(agent => [false, true].map(raw => ({ agent, raw }))))("$agent failure keeps raw stderr or uses its display name", async ({ agent, raw }) => {
  const exe = join(home, "bin", agent);
  file(exe, `#!/bin/sh
if [ "$2" = get ]; then echo "Error: No MCP server named 'doan' found." >&2; exit 1; fi
${raw ? "echo 'raw claude /codex/path failed' >&2" : ""}
exit 1
`, 0o755);
  const m = machine();
  await m.run({ step: "cli", expected: (await m.read("cli")).expected });
  expect(await m.run({ step: "connect", agent, expected: (await m.read("agent")).expected })).toMatchObject({
    kind: "error", message: raw ? "raw claude /codex/path failed\n" : `${agent === "claude" ? "Claude Code" : "Codex"} failed. Choose Check Again.`,
  });
});

const BUNDLED_STUB = readFileSync(join(__dirname, "SKILL.md"), "utf8");
// The stub shipped from c994913 until design presets; existing installs hold these bytes.
const PRESET_LESS_STUB = readFileSync(join(__dirname, "fixtures/SKILL-c994913.md"), "utf8");
test("the bundled stub points to design presets through the guide without listing them", () => {
  for (const text of ["doan skill", "`skill`", "doan design-skill", "doan design-skill <id>", "design_skill", "[doan:skill] end of guide"]) expect(BUNDLED_STUB).toContain(text);
  for (const preset of ["clarify", "context", "polish"]) expect(BUNDLED_STUB).not.toContain(preset);
  expect(BUNDLED_STUB).not.toBe(PRESET_LESS_STUB);
});
// Without either path the guide's failure rule is unreachable, so the stub must carry it (U-010). The app
// conversation's turn prompt forbids suggesting Settings > Connections, so the stub defers to it.
test("the bundled stub says what to do when neither the shell nor MCP guide works", () => {
  for (const text of ["neither", "were not applied", "Settings… > Connections", "other doan binaries", "doan's source files", "doan app's conversation instructions"]) expect(BUNDLED_STUB).toContain(text);
  expect(BUNDLED_STUB.split("\n").length).toBeLessThanOrEqual(20);
});
test("connect writes the exact bundled stub bytes", async () => {
  agent("claude"); const m = machine(); await m.run({ step: "cli", expected: (await m.read("1")).expected });
  expect(await m.run({ step: "connect", agent: "claude", expected: (await m.read("2")).expected })).toEqual({ kind: "success" });
  expect(readFileSync(join(home, ".agents/skills/doan/SKILL.md"), "utf8")).toBe(BUNDLED_STUB);
  expect((await m.read("3")).stub.state).toBe("ours");
});
test("a stub installed before design presets differs and is replaced only after confirmation", async () => {
  agent("claude"); const m = machine(); await m.run({ step: "cli", expected: (await m.read("1")).expected });
  const stub = join(home, ".agents/skills/doan/SKILL.md"); file(stub, PRESET_LESS_STUB);
  const state = await m.read("2"); expect(state.stub.state).toBe("differs");
  const asked = await m.run({ step: "connect", agent: "claude", expected: state.expected });
  if (asked.kind !== "confirm") throw new Error("confirmation absent");
  expect(asked).toMatchObject({ target: "stub", message: "Your edits to SKILL.md will be replaced." });
  expect(readFileSync(stub, "utf8")).toBe(PRESET_LESS_STUB);
  expect(await m.answer({ id: asked.id, allow: true })).toEqual({ kind: "success" });
  expect(readFileSync(stub, "utf8")).toBe(BUNDLED_STUB);
});
test("a pre-preset stub that changes after the confirmation is shown is stale and kept", async () => {
  agent("claude"); const m = machine(); await m.run({ step: "cli", expected: (await m.read("1")).expected });
  const stub = join(home, ".agents/skills/doan/SKILL.md"); file(stub, PRESET_LESS_STUB);
  const asked = await m.run({ step: "connect", agent: "claude", expected: (await m.read("2")).expected });
  if (asked.kind !== "confirm") throw new Error("confirmation absent"); expect(asked.target).toBe("stub");
  writeFileSync(stub, `${PRESET_LESS_STUB}edited\n`);
  expect(await m.answer({ id: asked.id, allow: true })).toEqual({ kind: "stale" });
  expect(readFileSync(stub, "utf8")).toBe(`${PRESET_LESS_STUB}edited\n`);
  expect(mcpWrites()).toEqual([]);
});
