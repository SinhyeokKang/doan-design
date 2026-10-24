import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
import { runProcess } from "./machine";
afterEach(() => vi.useRealTimers());
test.each(["false", "throw"])("timeout settles once even when kill returns %s and no exit follows", async kind => {
  vi.useFakeTimers();
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), unref: vi.fn(), kill: vi.fn(() => { if (kind === "throw") throw new Error("kill failed"); return false; }) });
  mocks.spawn.mockReturnValue(child);
  const result = vi.fn(); const waiting = runProcess("/fake", [], { HOME: "/tmp/isolated" }, 20).then(value => { result(value); return value; });
  await vi.advanceTimersByTimeAsync(20);
  expect(await waiting).toMatchObject({ timedOut: true, exitCode: null });
  child.emit("exit", 0); child.emit("error", new Error("late"));
  expect(result).toHaveBeenCalledTimes(1); expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  expect(mocks.spawn).toHaveBeenLastCalledWith("/fake", [], expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }));
});
test("exit settles without close when another process retains stdout", async () => {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), unref: vi.fn(), kill: vi.fn() });
  mocks.spawn.mockReturnValue(child); const waiting = runProcess("/fake", [], { HOME: "/tmp/isolated" }, 200);
  child.stdout.write("result"); child.emit("exit", 0);
  expect(await waiting).toMatchObject({ exitCode: 0, stdout: "result", timedOut: false });
});
