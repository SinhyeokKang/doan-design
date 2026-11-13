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
