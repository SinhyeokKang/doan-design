import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
