import { PROVIDERS, type Provider } from "../main/agentAuth/types";
import type { UsageBlock, UsageEntry, UsageWindow } from "../main/agentAuth/usageTypes";
import { connectionLine, PROVIDER_NAMES } from "./agentAuthView";

const MIN = 60_000;
const passed = (w: UsageWindow, now: number) => w.resetsAt !== undefined && w.resetsAt <= now;
const active = (entry: Pick<UsageEntry, "reading">, now: number) => entry.reading?.status === "ok" ? entry.reading.windows.filter(w => !passed(w, now)) : [];

// The ring shows the fullest window that has not reset yet; a passed window's value is stale until the next read.
// True when a window that has not reset yet is limited. The 70% danger threshold belongs to the ring's caller.
export function ringLimited(entry: Pick<UsageEntry, "reading" | "blocked">, now: number): boolean {
  return entry.blocked === undefined && active(entry, now).some(w => w.limited);
}

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

// A connection that can't be used reads as its Settings › Agents row (ARCHITECTURE §7 'Agent usage'), as a sentence: the popover
// row under the provider's name.
export function blockedNote(provider: Provider, block: UsageBlock): string {
  const line = connectionLine(provider, block);
  return line.endsWith(".") ? line : `${line}.`;
}
// The button's description lists every provider, so a row sentence that doesn't name its provider is led by the name.
// Without its last full stop: the description adds one per provider.
export function blockedText(provider: Provider, block: UsageBlock): string {
  const line = connectionLine(provider, block).replace(/\.$/, ""), name = PROVIDER_NAMES[provider];
  return line.includes(name) ? line : `${name}: ${line}`;
}

function state(entry: UsageEntry, now: number): string {
  const name = PROVIDER_NAMES[entry.provider], { reading } = entry;
  if (entry.blocked !== undefined) return blockedText(entry.provider, entry.blocked);
  if (!reading) return `${name} reading usage`;
  if (reading.status === "unavailable") return `${name} usage unavailable`;
  if (reading.unlimited) return `${name} unlimited`;
  if (ringLimited(entry, now)) return `${name} limit reached`;
  const value = ringValue(entry, now);
  return value !== null ? `${name} ${Math.round(value)}% used` : `${name} usage resetting`;
}

// The usage button's description (aria-describedby); its name stays "Agent usage". Antigravity is never shown.
export function usageDescription(entries: readonly UsageEntry[], now: number): string {
  return entries.filter(entry => entry.provider !== "antigravity")
    .sort((a, b) => PROVIDERS.indexOf(a.provider) - PROVIDERS.indexOf(b.provider))
    .map(entry => `${state(entry, now)}.`).join(" ");
}
