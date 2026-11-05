import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtempSync, realpathSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { runProcess, probeShell, SHELL_TIMEOUT_MS } from "./machine";
let temp: string;
let home: string;
let env: NodeJS.ProcessEnv;
let oldHome: string | undefined;
function file(path: string, content: string, mode = 0o644) { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, content, { mode }); }
beforeEach(() => {
  temp = realpathSync(mkdtempSync("/tmp/doan-G-")); home = join(temp, "home"); mkdirSync(home);
  oldHome = process.env.HOME; process.env.HOME = home;
  env = { HOME: home, PATH: "/usr/bin:/bin", SHELL: join(temp, "zsh"), CLAUDE_CONFIG_DIR: join(home, ".claude"), CODEX_HOME: join(home, ".codex") };
  file(env.SHELL!, '#!/bin/sh\nPATH="$HOME/bin:/usr/bin:/bin"; export PATH\neval "$2"\n', 0o755);
});
afterEach(() => { if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome; rmSync(temp, { recursive: true, force: true }); });
test("pins a bounded deadline above the measured shell duration", () => { expect(SHELL_TIMEOUT_MS).toBe(5000); expect(homedir()).toBe(home); });
test("probes nonce output, ignores startup noise and settles without inherited pipe close", async () => {
  file(env.SHELL!, '#!/bin/sh\necho noise\neval "$2"\nsleep 30 &\n', 0o755);
  expect(await probeShell(env)).toMatchObject({ ok: true, path: "/usr/bin:/bin:/usr/sbin:/sbin" });
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
test("the login shell sees only the launchd environment, and the rc file still selects the profile", async () => {
  const dump = join(temp, "env.txt");
  const inherited = { ...env, SSH_AUTH_SOCK: "/tmp/agent.sock", TMPDIR: temp, ORCA_TERMINAL_HANDLE: "term_1", ORCA_AGENT_HOOK_TOKEN: "tok",
    CLAUDE_CODE_SESSION_ID: "s", TERM_PROGRAM: "Orca", FOO: "bar" };
  file(env.SHELL!, `#!/bin/sh\n/usr/bin/env > ${dump}\neval "$2"\n`, 0o755);
  expect(await probeShell(inherited)).toEqual({ ok: true, path: "/usr/bin:/bin:/usr/sbin:/sbin" });
  const seen = Object.fromEntries(readFileSync(dump, "utf8").trim().split("\n").map(line => line.split(/=(.*)/s).slice(0, 2)));
  expect(seen).toMatchObject({ HOME: home, SSH_AUTH_SOCK: "/tmp/agent.sock", TMPDIR: temp, SHELL: env.SHELL });
  for (const name of ["ORCA_TERMINAL_HANDLE", "ORCA_AGENT_HOOK_TOKEN", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CONFIG_DIR", "CODEX_HOME", "TERM_PROGRAM", "FOO"]) expect(seen).not.toHaveProperty(name);
  file(env.SHELL!, `#!/bin/sh\nCLAUDE_CONFIG_DIR=${home}/rc-claude; export CLAUDE_CONFIG_DIR\neval "$2"\n`, 0o755);
  expect(await probeShell(inherited)).toMatchObject({ ok: true, claudeConfigDir: `${home}/rc-claude` });
});
// prompt-suggestion decision 2: the only way to turn Claude's suggestions off is the login shell's own value.
test("reads CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION from the login shell only", async () => {
  const inherited = { ...env, CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: "terminal" };
  expect(await probeShell(inherited)).not.toHaveProperty("promptSuggestion");
  file(env.SHELL!, '#!/bin/sh\nCLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false; export CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION\neval "$2"\n', 0o755);
  expect(await probeShell(inherited)).toEqual({ ok: true, path: "/usr/bin:/bin:/usr/sbin:/sbin", promptSuggestion: "false" });
});
