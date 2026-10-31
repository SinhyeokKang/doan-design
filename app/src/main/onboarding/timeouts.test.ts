import { afterEach, beforeEach, expect, test, vi } from "vitest";
// The deadline is 5 s; a hung child and fake timers reach it without waiting.
const hang = vi.hoisted(() => ({ commands: new Set<string>(), spawned: null as (() => void) | null }));
vi.mock("node:child_process", async importOriginal => {
  const real = await importOriginal<typeof import("node:child_process")>();
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  return {
    ...real,
    spawn: (command: string, ...rest: unknown[]) => {
      if (!hang.commands.has(command)) return (real.spawn as (...args: unknown[]) => unknown)(command, ...rest);
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true, unref: () => {} });
      hang.spawned?.();
      return child;
    },
  };
});
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { probeShell, SHELL_TIMEOUT_MS } from "./machine";

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
