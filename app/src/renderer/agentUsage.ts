import { PROVIDERS, type Provider, type ReadinessCause } from "../main/agentAuth/types";
import type { UsageEntry, UsageWindow } from "../main/agentAuth/usageTypes";
import { PROVIDER_NAMES } from "./agentAuthView";

const MIN = 60_000;
const passed = (w: UsageWindow, now: number) => w.resetsAt !== undefined && w.resetsAt <= now;
const active = (entry: Pick<UsageEntry, "reading">, now: number) => entry.reading?.status === "ok" ? entry.reading.windows.filter(w => !passed(w, now)) : [];

// The ring shows the fullest window that has not reset yet; a passed window's value is stale until the next read.
export function ringValue(entry: Pick<UsageEntry, "reading" | "blocked">, now: number): number | null {
  if (entry.blocked !== undefined) return null;
  const windows = active(entry, now);
  return windows.length === 0 ? null : Math.max(...windows.map(w => w.usedPercent));
}

function duration(ms: number): string {
  if (ms < MIN) return "less than a minute";
  const mins = Math.floor(ms / MIN);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60), restMins = mins % 60;
  if (hours < 24) return restMins ? `${hours}h ${restMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24), restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

// "Limit reached" only when the provider reported it; a 100% without a report stays "100% used".
export function usageText(window: UsageWindow, now: number): string {
  if (passed(window, now)) return "Reset · updating";
  const head = window.limited ? "Limit reached" : `${Math.round(window.usedPercent)}% used`;
  return window.resetsAt === undefined ? head : `${head} · resets in ${duration(window.resetsAt - now)}`;
}

// The Settings › Agents cause for a connection that can't be used. The entry carries only the cause, so an expired
// sign-in is told apart by reauth_required alone.
export function blockedText(provider: Provider, cause: ReadinessCause): string {
  const name = PROVIDER_NAMES[provider];
  if (cause === "reauth_required") return `${name}’s sign-in expired`;
  if (cause === "version_unsupported" || cause === "version_incompatible") return `${name} needs an update`;
  return `${name} isn’t available right now`;
}

function state(entry: UsageEntry, now: number): string {
  const name = PROVIDER_NAMES[entry.provider], { reading } = entry;
  if (entry.blocked !== undefined) return blockedText(entry.provider, entry.blocked);
  if (!reading) return `${name} reading usage`;
  if (reading.status === "unavailable") return `${name} usage unavailable`;
  if (reading.unlimited) return `${name} unlimited`;
  const windows = active(entry, now);
  if (windows.some(w => w.limited)) return `${name} limit reached`;
  const value = ringValue(entry, now);
  if (value !== null) return `${name} ${Math.round(value)}% used`;
  return reading.windows.length > 0 ? `${name} usage resetting` : `${name} usage unavailable`;
}

// The usage button's description (aria-describedby); its name stays "Agent usage". Antigravity is never shown.
export function usageDescription(entries: readonly UsageEntry[], now: number): string {
  return entries.filter(entry => entry.provider !== "antigravity")
    .sort((a, b) => PROVIDERS.indexOf(a.provider) - PROVIDERS.indexOf(b.provider))
    .map(entry => `${state(entry, now)}.`).join(" ");
}
