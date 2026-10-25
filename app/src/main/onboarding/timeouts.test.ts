import { afterEach, beforeEach, expect, test, vi } from "vitest";
// Deadlines are 5 s and 10 s; a hung child and fake timers reach them without waiting.
const hang = vi.hoisted(() => ({ commands: new Set<string>(), spawned: null as (() => void) | null }));
vi.mock("node:child_process", async importOriginal => {
  const real = await importOriginal<typeof import("node:child_process")>();
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  return {
    ...real,
    spawn: (command: string, ...rest: unknown[]) => {
      if (!hang.commands.has(command) && !(Array.isArray(rest[0]) && rest[0][1] === "add" && hang.commands.has(`${command}:add`))) return (real.spawn as (...args: unknown[]) => unknown)(command, ...rest);
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true, unref: () => {} });
      hang.spawned?.();
      return child;
    },
  };
});
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AGENT_TIMEOUT_MS, createMachine, probeShell, SHELL_TIMEOUT_MS } from "./machine";

let temp: string;
beforeEach(() => { temp = realpathSync(mkdtempSync("/tmp/doan-timeout-")); });
afterEach(() => { vi.useRealTimers(); hang.commands.clear(); hang.spawned = null; rmSync(temp, { recursive: true, force: true }); });

function hungUntilSpawned(command: string): Promise<void> {
  hang.commands.add(command);
  return new Promise(resolve => { hang.spawned = resolve; });
}

test("a login shell timeout names the selected shell", async () => {
  const shell = join(temp, "zsh"); writeFileSync(shell, "#!/bin/sh\n", { mode: 0o755 });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const spawned = hungUntilSpawned(shell);
  const probe = probeShell({ HOME: temp, SHELL: shell, PATH: "/usr/bin:/bin" });
  await spawned; vi.advanceTimersByTime(SHELL_TIMEOUT_MS);
  expect(await probe).toEqual({ ok: false, reason: `Your login shell (${shell}) didn’t answer in time.` });
});

test("a Codex registration read that times out keeps the agent, path and reason", async () => {
  const home = join(temp, "home"), shell = join(temp, "zsh"), exe = join(home, "bin/codex");
  mkdirSync(join(home, "bin"), { recursive: true });
  writeFileSync(shell, '#!/bin/sh\nPATH="$HOME/bin:/usr/bin:/bin"; export PATH\neval "$2"\n', { mode: 0o755 });
  writeFileSync(exe, "#!/bin/sh\n", { mode: 0o755 });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const spawned = hungUntilSpawned(exe);
  const read = createMachine({ command: join(temp, "doan"), env: { HOME: home, SHELL: shell, PATH: "/usr/bin:/bin" }, version: "0.1.0" }).read("r");
  await spawned; vi.advanceTimersByTime(AGENT_TIMEOUT_MS);
  expect((await read).agents.codex.mcp).toEqual({ state: "unknown", value: `Codex at ${exe} didn’t answer in ${AGENT_TIMEOUT_MS / 1000} s.` });
});

test.each(["claude", "codex"] as const)("%s connect timeout uses the display name and Check Again", async agent => {
  const home = join(temp, "home"), shell = join(temp, "zsh"), exe = join(home, "bin", agent);
  mkdirSync(join(home, "bin"), { recursive: true });
  writeFileSync(shell, '#!/bin/sh\nPATH="$HOME/bin:/usr/bin:/bin"; export PATH\neval "$2"\n', { mode: 0o755 });
  writeFileSync(exe, '#!/bin/sh\necho "Error: No MCP server named \'doan\' found." >&2\nexit 1\n', { mode: 0o755 });
  const command = join(temp, "doan"); writeFileSync(command, "#!/bin/sh\n", { mode: 0o755 });
  const m = createMachine({ command, env: { HOME: home, SHELL: shell, PATH: "/usr/bin:/bin" }, version: "0.1.0" });
  await m.run({ step: "cli", expected: (await m.read("cli")).expected });
  const state = await m.read("agent");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const spawned = hungUntilSpawned(`${exe}:add`);
  const run = m.run({ step: "connect", agent, expected: state.expected });
  await spawned; vi.advanceTimersByTime(AGENT_TIMEOUT_MS);
  expect(await run).toMatchObject({ kind: "error", message: `${agent === "claude" ? "Claude Code" : "Codex"} timed out. Choose Check Again.` });
});
