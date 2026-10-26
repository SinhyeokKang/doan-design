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
