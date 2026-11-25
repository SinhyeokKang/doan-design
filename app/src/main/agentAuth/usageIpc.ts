import type { UsageService } from "./usageService";
import type { UsageEntry } from "./usageTypes";

// read: a request from the main window and the prototype window (senderAllowed). changed: an event main sends both
// windows, never a request.
export const USAGE_CHANNELS = { read: "agent-usage:read", changed: "agent-usage:changed" } as const;

// No trigger answers the current entries only; "open" and "refresh" may start reads. Anything else is refused with an
// empty list and reads nothing.
export function usageRequest(service: Pick<UsageService, "entries" | "trigger">, value: unknown): UsageEntry[] {
  if (value === undefined) return service.entries();
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).some(key => key !== "trigger")) return [];
  const trigger = (value as { trigger?: unknown }).trigger;
  if (trigger === undefined) return service.entries();
  if (trigger !== "open" && trigger !== "refresh") return [];
  service.trigger({ kind: trigger });
  return service.entries();
}
