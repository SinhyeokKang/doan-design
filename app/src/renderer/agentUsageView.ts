import { PROVIDERS, type Provider } from "../main/agentAuth/types";
import type { UsageEntry, UsageWindow } from "../main/agentAuth/usageTypes";
import { PROVIDER_NAMES } from "./agentAuthView";
import { blockedNote, ringLimited, ringValue, usageText } from "./agentUsage";
import { providerLogo } from "./homeComposer";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
// The person's colour rule: neutral below 70%, danger from 70% or at a reported limit; there is no warning step.
const DANGER = 70;

// Antigravity has no usage read and is never shown; the rest keep the fixed provider order.
export function shownUsage(entries: readonly UsageEntry[]): UsageEntry[] {
  return entries.filter(entry => entry.provider !== "antigravity").sort((a, b) => PROVIDERS.indexOf(a.provider) - PROVIDERS.indexOf(b.provider));
}

export interface RingView { provider: Provider; value: number | null; limited: boolean; full: boolean; logo: string }
export function ringViews(entries: readonly UsageEntry[], now: number): RingView[] {
  const shown = shownUsage(entries);
  return shown.map(entry => {
    const value = ringValue(entry, now), limited = ringLimited(entry, now);
    return { provider: entry.provider, value, limited, full: limited || (value !== null && value >= DANGER), logo: providerLogo(entry.provider) };
  });
}

// Sizes of the drawn button (draft frame 02): 24px rings 4px apart inside a 4px inset, and at least 8px between it
// and the centred tabs. Where it folds is measured against the draft later (design §4 '좁은 앱 창').
export const USAGE_FOLD = { ring: 24, gap: 8, between: 4, inset: 4 } as const;
export function usageFolds(free: number, count: number): boolean {
  if (count < 2 || Number.isNaN(free)) return false;
  return free < USAGE_FOLD.gap + count * USAGE_FOLD.ring + (count - 1) * USAGE_FOLD.between + 2 * USAGE_FOLD.inset;
}
// The folded button keeps the highest ring, a reported limit first (it is used up whatever its share), and counts
// the others; ties keep the provider order.
export function foldedRing(rings: readonly RingView[]): { ring: RingView; more: number } {
  const rank = (ring: RingView) => ring.limited ? Infinity : ring.value ?? -1;
  const ring = rings.reduce((best, next) => rank(next) > rank(best) ? next : best);
  return { ring, more: rings.length - 1 };
}

export function readText(readAt: number, now: number): string {
  const ago = now - readAt;
  if (ago < MIN) return "Updated just now";
  if (ago < HOUR) return `Updated ${Math.floor(ago / MIN)}m ago`;
  if (ago < DAY) return `Updated ${Math.floor(ago / HOUR)}h ago`;
  return `Updated ${Math.floor(ago / DAY)}d ago`;
}

export interface WindowView { id: string; label: string; text: string; bar: number | null; full: boolean; limited: boolean }
export interface NoteView { text: string; kind?: "error" | "warn" }
export interface RowView { provider: Provider; name: string; logo: string; read: string | null; windows: WindowView[]; note: NoteView | null }

function windowView(window: UsageWindow, now: number): WindowView {
  const passed = window.resetsAt !== undefined && window.resetsAt <= now;
  const limited = !passed && window.limited === true;
  return { id: window.id, label: window.label, text: usageText(window, now), bar: passed ? null : window.usedPercent, full: !passed && (window.usedPercent >= DANGER || limited), limited };
}

// One popover row. The read time shows only beside values; a reason line replaces the windows and keeps no time.
export function rowView(entry: UsageEntry, now: number): RowView {
  const name = PROVIDER_NAMES[entry.provider], base = { provider: entry.provider, name, logo: providerLogo(entry.provider) };
  const reason = (note: NoteView): RowView => ({ ...base, read: null, windows: [], note });
  if (entry.blocked !== undefined) return reason({ text: blockedNote(entry.provider, entry.blocked), kind: "warn" });
  const { reading } = entry;
  if (!reading) return reason({ text: "Reading usage…" });
  if (reading.status === "unavailable") {
    if (reading.reason === "not_supported") return reason({ text: `Usage isn’t available for ${name}.` });
    if (reading.reason === "no_plan_limits") return reason({ text: `${name} isn’t on a plan with usage limits.` });
    return reason({ text: "Couldn’t read usage. Doan tries again when you open this.", kind: "error" });
  }
  const read = entry.inFlight ? "Updating…" : readText(reading.readAt, now);
  if (reading.unlimited) return { ...base, read, windows: [], note: { text: "Unlimited" } };
  return { ...base, read, windows: reading.windows.map(window => windowView(window, now)), note: null };
}

export function usageBusy(entries: readonly UsageEntry[]): boolean {
  return shownUsage(entries).some(entry => entry.inFlight);
}
