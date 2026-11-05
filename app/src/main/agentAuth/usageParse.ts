import type { UsageReading, UsageWindow } from "./usageTypes";

// Usage reads are experimental or private provider APIs. Keys this module does not know are ignored; a key it reads
// with the wrong type, or a required key that is missing, makes the whole response read_failed rather than a guess.
class Shape extends Error {}
type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
function obj(value: unknown): Obj { if (!isObj(value)) throw new Shape(); return value; }
function num(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new Shape(); return value; }
function optional<T>(value: unknown, read: (value: unknown) => T): T | undefined { return value === null || value === undefined ? undefined : read(value); }
function isoTime(value: unknown): number {
  const at = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(at)) throw new Shape();
  return at;
}
const clamp = (percent: number) => Math.min(100, Math.max(0, percent));

function window(id: string, label: string, usedPercent: number, resetsAt: number | undefined, limited = false): UsageWindow {
  return { id, label, usedPercent: clamp(usedPercent), ...(resetsAt === undefined ? {} : { resetsAt }), ...(limited ? { limited: true as const } : {}) };
}

function reading(readAt: number, parse: () => UsageReading): UsageReading {
  try { return parse(); } catch (error) {
    if (error instanceof Shape) return { status: "unavailable", reason: "read_failed", readAt };
    throw error;
  }
}

// A reading with no windows that is not unlimited has nothing to show; it reads as no plan limits, not as an empty ok.
function ok(readAt: number, windows: UsageWindow[]): UsageReading {
  return windows.length === 0 ? { status: "unavailable", reason: "no_plan_limits", readAt } : { status: "ok", windows, readAt };
}
function unlimited(readAt: number): UsageReading { return { status: "ok", windows: [], unlimited: true, readAt }; }

const CLAUDE_WINDOWS: [key: string, label: string][] = [
  ["five_hour", "5-hour"], ["seven_day", "Weekly"], ["seven_day_opus", "Weekly · Opus"], ["seven_day_sonnet", "Weekly · Sonnet"],
];

// Claude SDK usage (control request get_usage). A window with null utilization has nothing to show and is skipped.
// limited only from locked_reason: at 99% the PoC saw it null with limits[].severity "critical", which is not a report.
export function claudeUsage(response: unknown, readAt: number): UsageReading {
  return reading(readAt, () => {
    const root = obj(response);
    if (typeof root.rate_limits_available !== "boolean") throw new Shape();
    if (!root.rate_limits_available) return { status: "unavailable", reason: "no_plan_limits", readAt };
    const limits = obj(root.rate_limits), windows: UsageWindow[] = [];
    for (const [key, label] of CLAUDE_WINDOWS) {
      const entry = optional(limits[key], obj);
      if (!entry) continue;
      const used = optional(entry.utilization, num), resetsAt = optional(entry.resets_at, isoTime);
      if (entry.locked_reason !== undefined && entry.locked_reason !== null && typeof entry.locked_reason !== "string") throw new Shape();
      if (used !== undefined) windows.push(window(key, label, used, resetsAt, typeof entry.locked_reason === "string"));
    }
    const scoped = limits.model_scoped;
    if (scoped !== undefined && scoped !== null) {
      if (!Array.isArray(scoped)) throw new Shape();
      for (const item of scoped) {
        const entry = obj(item);
        if (typeof entry.display_name !== "string" || entry.display_name === "") throw new Shape();
        const used = optional(entry.utilization, num), resetsAt = optional(entry.resets_at, isoTime);
        const label = `Weekly · ${entry.display_name}`;
        // seven_day_opus/sonnet may also arrive as a model_scoped entry; the first one wins.
        if (used !== undefined && !windows.some(w => w.label === label)) windows.push(window(`model_scoped:${entry.display_name}`, label, used, resetsAt));
      }
    }
    return ok(readAt, windows);
  });
}

function durationLabel(mins: number | undefined, fallback: string): string {
  if (mins === undefined) return fallback;
  if (mins === 10080) return "Weekly";
  if (mins >= 1440 && mins % 1440 === 0) return `${mins / 1440}-day`;
  if (mins % 60 === 0) return `${mins / 60}-hour`;
  return `${mins}-minute`;
}

// Codex app-server account/rateLimits/read. rateLimitReachedType belongs to the snapshot, not to one window, so it
// marks the fullest window(s): the one the provider is holding the account on.
export function codexUsage(response: unknown, readAt: number): UsageReading {
  return reading(readAt, () => {
    const limits = obj(obj(response).rateLimits), windows: UsageWindow[] = [];
    for (const [key, fallback] of [["primary", "Primary"], ["secondary", "Secondary"]] as const) {
      const entry = optional(limits[key], obj);
      if (!entry) continue;
      const resetsAt = optional(entry.resetsAt, num);
      windows.push(window(key, durationLabel(optional(entry.windowDurationMins, num), fallback), num(entry.usedPercent), resetsAt === undefined ? undefined : resetsAt * 1000));
    }
    const reached = limits.rateLimitReachedType;
    if (reached !== undefined && reached !== null) {
      if (typeof reached !== "string") throw new Shape();
      const top = Math.max(...windows.map(w => w.usedPercent));
      for (const w of windows) if (w.usedPercent === top) w.limited = true;
    }
    return ok(readAt, windows);
  });
}

const COPILOT_LABELS: Record<string, string> = { chat: "Chat", completions: "Completions", premium_interactions: "Premium requests" };
const kindLabel = (key: string) => COPILOT_LABELS[key] ?? (key.charAt(0).toUpperCase() + key.slice(1)).replaceAll("_", " ");

// Copilot headless account.getQuota. A kind with hasQuota false or no entitlement (free premium_interactions in the
// PoC) has remainingPercentage 0 and would read as 100% used, so it is left out, as are unlimited kinds.
export function copilotUsage(response: unknown, readAt: number): UsageReading {
  return reading(readAt, () => {
    const snapshots = obj(obj(response).quotaSnapshots), windows: UsageWindow[] = [];
    let anyUnlimited = false;
    for (const [key, value] of Object.entries(snapshots)) {
      const kind = obj(value);
      if (kind.isUnlimitedEntitlement === true) { anyUnlimited = true; continue; }
      if (kind.hasQuota === false || num(kind.entitlementRequests) <= 0) continue;
      const remaining = num(kind.remainingPercentage);
      const limited = remaining <= 0 && kind.usageAllowedWithExhaustedQuota === false;
      windows.push(window(key, kindLabel(key), 100 - remaining, optional(kind.resetDate, isoTime), limited));
    }
    if (windows.length > 0) return ok(readAt, windows);
    return anyUnlimited ? unlimited(readAt) : { status: "unavailable", reason: "no_plan_limits", readAt };
  });
}

// Cursor GET /api/usage-summary body: the plan's Auto and API shares of the billing cycle. The private API reports no
// reached limit, so neither window is ever limited.
export function cursorUsage(response: unknown, readAt: number): UsageReading {
  return reading(readAt, () => {
    const root = obj(response);
    if (root.isUnlimited === true) return unlimited(readAt);
    if (root.isUnlimited !== false) throw new Shape();
    const plan = obj(obj(root.individualUsage).plan), resetsAt = optional(root.billingCycleEnd, isoTime);
    return ok(readAt, [window("auto", "Auto", num(plan.autoPercentUsed), resetsAt), window("api", "API", num(plan.apiPercentUsed), resetsAt)]);
  });
}

// A CLI version without the read answers JSON-RPC -32601 (Codex, Copilot) or, for Claude, rejects the control request
// as an unsupported subtype. Doan reads not_supported from that answer, not from the version number (ARCHITECTURE §7).
export function usageNotSupported(error: unknown): boolean {
  if (isObj(error) && error.code === -32601) return true;
  const message = error instanceof Error ? error.message : isObj(error) && typeof error.message === "string" ? error.message : "";
  return /Method not found|Unsupported control request subtype/.test(message);
}
