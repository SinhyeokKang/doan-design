import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, readlinkSync, rmSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createMachine, runProcess, probeShell, needsOnboarding, markClosed, SHELL_TIMEOUT_MS, AGENT_TIMEOUT_MS } from "./machine";
let temp: string;
let home: string;
let env: NodeJS.ProcessEnv;
let cli: string;
let oldHome: string | undefined;
function file(path: string, content: string, mode = 0o644) { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, content, { mode }); }
function machine(command = cli) { return createMachine({ env, command }); }
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
test.each(["file", "directory", "parent-file", "parent-link"])("blocked %s stays byte-identical", async kind => {
  const target = join(home, ".local/bin/doan");
  if (kind === "parent-file") file(join(home, ".local/bin"), "keep");
  else if (kind === "parent-link") { mkdirSync(join(home, ".local")); symlinkSync(temp, join(home, ".local/bin")); }
  else if (kind === "file") file(target, "keep");
  else mkdirSync(target, { recursive: true });
  const before = (await import("node:child_process")).execFileSync("/usr/bin/find", [home, "-ls"]).toString();
  const m = machine(); const state = await m.read("r"); expect(state.cli.state).toBe("blocked");
  expect((await m.run({ step: "cli", expected: state.expected })).kind).toBe("unavailable");
  const after = (await import("node:child_process")).execFileSync("/usr/bin/find", [home, "-ls"]).toString();
  expect(createHash("sha256").update(after).digest("hex")).toBe(createHash("sha256").update(before).digest("hex"));
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
test("connect refuses MCP until the CLI link is ours", async () => {
  agent("claude"); const m = machine(); const state = await m.read("r");
  expect((await m.run({ step: "connect", agent: "claude", expected: state.expected })).kind).toBe("unavailable");
  expect(existsSync(join(home, "calls"))).toBe(false);
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
test("corrupt or absent onboarding opens; close writes an atomic empty object", async () => {
  const userData = join(temp, "data"); mkdirSync(userData);
  expect(await needsOnboarding(userData)).toBe(true); file(join(userData, "onboarding.json"), "bad"); expect(await needsOnboarding(userData)).toBe(true);
  await markClosed(userData); expect(await needsOnboarding(userData)).toBe(false); expect(JSON.parse(readFileSync(join(userData, "onboarding.json"), "utf8"))).toEqual({});
});
