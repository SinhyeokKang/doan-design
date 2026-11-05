import type { UsageEntry, UsageTrigger } from "./usageTypes";

export const READ_INTERVAL_MS = 5 * 60_000;

// Whether a trigger starts a new usage read for one provider. There is no polling: reads happen only on these triggers.
// A failed read counts toward the interval like any other, except that opening the popover retries it at once, as it
// does a window whose reset time has passed (the value shown is known to be stale).
export function shouldRead(entry: Pick<UsageEntry, "reading" | "inFlight" | "blocked">, now: number, trigger: UsageTrigger, visible: boolean): boolean {
  if (!visible || entry.blocked !== undefined || entry.inFlight) return false;
  if (trigger.kind === "turnEnd" && trigger.owner !== "doan") return false;
  if (trigger.kind === "refresh") return true;
  const { reading } = entry;
  if (!reading) return true;
  if (trigger.kind === "open") {
    if (reading.status === "unavailable" && reading.reason === "read_failed") return true;
    if (reading.status === "ok" && reading.windows.some(w => w.resetsAt !== undefined && w.resetsAt <= now)) return true;
  }
  return now - reading.readAt >= READ_INTERVAL_MS;
}
