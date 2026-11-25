import { afterEach, expect, it, vi } from "vitest";
import { OwnedGroup } from "./process";
afterEach(() => vi.useRealTimers());
it("bounds callers and escalates without releasing a still-live owned group", async () => {
  vi.useFakeTimers(); let alive = true; const signal = vi.fn(); const released = vi.fn();
  const group = new OwnedGroup(123, signal, () => alive, released);
  const stopped = group.stop(); await vi.advanceTimersByTimeAsync(2500); await stopped;
  expect(signal.mock.calls).toEqual([[123, "SIGTERM"], [123, "SIGKILL"]]); expect(released).not.toHaveBeenCalled();
  group.childExited(); expect(released).not.toHaveBeenCalled(); alive = false;
  await vi.advanceTimersByTimeAsync(100); expect(released).toHaveBeenCalledOnce(); group.childExited(); expect(released).toHaveBeenCalledOnce();
});
it("does not infer exit from failed kill or unknown liveness", async () => {
  vi.useFakeTimers(); const released = vi.fn();
  const group = new OwnedGroup(45, () => { throw new Error("denied"); }, () => { throw new Error("unknown"); }, released);
  const stopped = group.stop(); await vi.advanceTimersByTimeAsync(2500); await stopped; expect(released).not.toHaveBeenCalled();
});
// A finished turn's process with nothing left but its suggestion ends at once; release still waits for the group.
it("kills at once, also while a stop is already escalating, and releases only once the group is observed gone", async () => {
  vi.useFakeTimers(); let alive = true; const signal = vi.fn(); const released = vi.fn();
  const group = new OwnedGroup(77, signal, () => alive, released);
  const stopping = group.stop();
  const killed = group.kill();
  expect(signal.mock.calls).toEqual([[77, "SIGTERM"], [77, "SIGKILL"]]);
  expect(released).not.toHaveBeenCalled();
  alive = false; await vi.advanceTimersByTimeAsync(100);
  expect(released).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(2500); await killed; await stopping;
  // The escalation of the earlier stop sends nothing more once the group is gone.
  expect(signal).toHaveBeenCalledTimes(2);
});
it("kill sends one SIGKILL and nothing for a group already gone", async () => {
  vi.useFakeTimers(); let alive = true; const signal = vi.fn(); const released = vi.fn();
  const group = new OwnedGroup(78, signal, () => alive, released);
  const killed = group.kill(); expect(signal.mock.calls).toEqual([[78, "SIGKILL"]]);
  alive = false; await vi.advanceTimersByTimeAsync(2500); await killed;
  expect(released).toHaveBeenCalledOnce();
  await group.kill(); expect(signal).toHaveBeenCalledOnce();
});
// The 2 s bound is a ceiling for a group that will not go; a caller of a group gone sooner settles once it is observed gone.
it.each(["stop", "kill"] as const)("%s settles once the group is observed gone, before the bound", async how => {
  vi.useFakeTimers(); let alive = true; const released = vi.fn();
  const group = new OwnedGroup(79, vi.fn(), () => alive, released);
  let settled = false; void group[how]().then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(50); expect(settled).toBe(false);
  alive = false; await vi.advanceTimersByTimeAsync(100);
  expect(released).toHaveBeenCalledOnce(); expect(settled).toBe(true);
});
it("a stop and a kill during it both settle when the child's exit shows the group gone", async () => {
  vi.useFakeTimers(); let alive = true;
  const group = new OwnedGroup(80, vi.fn(), () => alive);
  let stopped = false, killed = false;
  void group.stop().then(() => { stopped = true; }); void group.kill().then(() => { killed = true; });
  alive = false; group.childExited(); await Promise.resolve(); await Promise.resolve();
  expect([stopped, killed]).toEqual([true, true]);
});
// An ACP server (Antigravity) runs tool commands in process groups of their own; they are found among its descendants
// before it is signalled (its exit hands them to launchd) and get the same signals. An unrelated group never does.
const TABLE = [
  { pid: 100, ppid: 50, pgid: 100 }, { pid: 101, ppid: 100, pgid: 100 },
  { pid: 200, ppid: 101, pgid: 200 }, { pid: 201, ppid: 200, pgid: 200 }, { pid: 400, ppid: 201, pgid: 400 },
  { pid: 300, ppid: 1, pgid: 300 }, { pid: 301, ppid: 50, pgid: 301 }];
it("also ends the process groups the owned group's descendants started, and no other group", async () => {
  vi.useFakeTimers(); const live = new Set([100, 200, 300, 301, 400]); const signal = vi.fn(); const released = vi.fn();
  const group = new OwnedGroup(100, signal, pgid => live.has(pgid), released, () => Promise.resolve(TABLE));
  const stopped = group.stop(); await vi.advanceTimersByTimeAsync(0);
  expect(signal.mock.calls).toEqual([[100, "SIGTERM"], [200, "SIGTERM"], [400, "SIGTERM"]]);
  // The server goes at once; a tool group that ignores SIGTERM still gets SIGKILL, and the caller waits for it.
  live.delete(100); live.delete(400); await vi.advanceTimersByTimeAsync(100);
  expect(released).toHaveBeenCalledOnce();
  let settled = false; void stopped.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(400);
  expect(signal.mock.calls.slice(3)).toEqual([[200, "SIGKILL"]]);
  live.delete(200); await vi.advanceTimersByTimeAsync(100); expect(settled).toBe(true);
  expect(signal.mock.calls.flat()).not.toContain(300); expect(signal.mock.calls.flat()).not.toContain(301);
});
// A kill ends a Claude turn's process with nothing left in the background ahead of the CLI's next model call; a table
// read takes about as long, so the kill never waits for one.
it("kill signals the owned group at once without reading the process table", () => {
  const signal = vi.fn(); const processes = vi.fn(() => Promise.resolve(TABLE));
  const group = new OwnedGroup(100, signal, () => true, vi.fn(), processes);
  void group.kill();
  expect(signal.mock.calls).toEqual([[100, "SIGKILL"]]); expect(processes).not.toHaveBeenCalled();
});
it("still stops the owned group when the process table cannot be read", async () => {
  vi.useFakeTimers(); const signal = vi.fn();
  const group = new OwnedGroup(100, signal, () => true, vi.fn(), () => Promise.reject(new Error("ps failed")));
  void group.stop(); await vi.advanceTimersByTimeAsync(0);
  expect(signal.mock.calls).toEqual([[100, "SIGTERM"]]);
});
it("stops at once without reading the process table once the leader has exited", () => {
  const signal = vi.fn(); const processes = vi.fn(() => Promise.resolve(TABLE));
  const group = new OwnedGroup(100, signal, () => true, vi.fn(), processes);
  group.childExited(); void group.stop();
  expect(signal.mock.calls).toEqual([[100, "SIGTERM"]]); expect(processes).not.toHaveBeenCalled();
});
