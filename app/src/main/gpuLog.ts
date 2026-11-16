import { appendFileSync } from "node:fs";

// Evidence for transient rendering glitches: a lost GPU process or a fall back to software compositing, which in a
// transparent vibrancy window can draw translucent fills opaque until restart. A packaged app started from Finder drops
// stderr, so each event is also appended to a file under userData that a person can send us.

export interface GpuLog {
  processGone(details: { type: string; reason: string; exitCode: number }): void;
  // `app.getGPUFeatureStatus().gpu_compositing` after a `gpu-info-update`.
  compositing(status: string): void;
}

// Electron reports "enabled", "enabled_on", "enabled_readback", "enabled_force"…; anything else means no GPU compositing.
const enabled = (status: string) => status.startsWith("enabled");

export function createGpuLog(file: string, now: () => Date = () => new Date()): GpuLog {
  const append = (line: string) => {
    try { appendFileSync(file, `${now().toISOString()} ${line}\n`); } catch (error) { console.error("doan: cannot write the GPU log", error); }
  };
  // `gpu-info-update` fires often; only a change is worth a line, and the return to enabled closes a fallback's record.
  let last = "enabled";
  return {
    processGone({ type, reason, exitCode }) {
      if (type !== "GPU") return;
      console.error("doan: GPU process gone", { reason, exitCode });
      append(`GPU process gone: reason=${reason} exitCode=${exitCode}`);
    },
    compositing(status) {
      const previous = last;
      last = status;
      if (status === previous || (enabled(status) && enabled(previous))) return;
      if (!enabled(status)) console.error("doan: GPU compositing is not enabled", status);
      append(`GPU compositing: ${status}`);
    },
  };
}
