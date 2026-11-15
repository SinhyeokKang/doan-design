import { vi } from "vitest";

// The real module even in a test file that mocks node:child_process to prove the code under test spawns nothing.
const { execFileSync, spawn } = await vi.importActual<typeof import("node:child_process")>("node:child_process");

// Opening a FIFO with no writer blocks open(2) until one appears. The rescuer opens the write end after this delay, so
// a reader that does block (on main or a libuv thread) is released and fails on time instead of hanging the run.
export const FIFO_RESCUE_MS = 2000;
// Well under the rescue delay: a reader that refuses the FIFO returns at once.
export const PROMPT_MS = 1000;

export async function withFifo<T>(path: string, read: () => T | Promise<T>): Promise<{ value: T; ms: number }> {
  execFileSync("/usr/bin/mkfifo", [path]);
  const rescuer = spawn("/bin/sh", ["-c", `sleep ${FIFO_RESCUE_MS / 1000}; : > "$1"`, "sh", path], { stdio: "ignore" });
  const started = performance.now();
  try {
    const value = await read();
    return { value, ms: performance.now() - started };
  } finally { rescuer.kill("SIGKILL"); }
}
