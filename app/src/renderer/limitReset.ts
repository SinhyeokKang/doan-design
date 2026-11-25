import type { ConversationSummary } from "../main/conversation/summary";
import type { Slot } from "./homeConversations";

// Every place says the reset time the same way.

export interface Clock { timeZone: string; hour12: boolean }

// The renderer's Intl follows the locale instead, so it is only the fallback where the preload value is missing
// (tests).
export function localClock(): Clock {
  const options = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
  const page = (globalThis as { window?: { doan?: { clockHour12?: unknown }; doanPrototype?: { clockHour12?: unknown } } }).window;
  const passed = page?.doan?.clockHour12 ?? page?.doanPrototype?.clockHour12;
  return { timeZone: options.timeZone, hour12: typeof passed === "boolean" ? passed : options.hour12 ?? true };
}

const DAY = 86_400_000;
// A daylight saving change never moves it.
function day(time: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(time);
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / DAY;
}

// The time and AM/PM are joined by U+202F so they never break apart. null: not a time.
export function resetTimeText(at: string, now: number, clock: Clock): string | null {
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  const hours = clock.hour12 ? { hour12: true } : { hourCycle: "h23" as const };
  const clockText = new Intl.DateTimeFormat("en-US", { timeZone: clock.timeZone, hour: "numeric", minute: "2-digit", ...hours }).format(time).replace(/\s+(?=[AP]M$)/, " ");
  const days = day(time, clock.timeZone) - day(now, clock.timeZone);
  if (days === 0) return `at ${clockText}`;
  if (days === 1) return `tomorrow at ${clockText}`;
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: clock.timeZone, ...options }).format(time);
  if (days > 1 && days < 7) return `${format({ weekday: "long" })} at ${clockText}`;
  return `${format({ month: "short", day: "numeric" })} at ${clockText}`;
}

// Once the reset has passed the rows go out (after main's send margin, a wake from sleep, or another turn).
export function queueStatusLine(resetsAt: string, now: number, clock: Clock): { kind: "scheduled" | "sending"; text: string } {
  const phrase = Date.parse(resetsAt) > now ? resetTimeText(resetsAt, now, clock) : null;
  return phrase ? { kind: "scheduled", text: `Sends when the limit resets ${phrase}.` } : { kind: "sending", text: "Sending" };
}

// null after the reset, when the button is the ordinary Queue.
export function queueButtonHint(resetsAt: string | null, now: number, clock: Clock): { tip: string; description: string } | null {
  const phrase = resetsAt !== null && Date.parse(resetsAt) > now ? resetTimeText(resetsAt, now, clock) : null;
  return phrase ? { tip: `Queue — sends when the limit resets ${phrase}`, description: `Sends when the limit resets ${phrase}.` } : null;
}

export function scheduledSlot(resetsAt: string, now: number, clock: Clock): Slot {
  const phrase = Date.parse(resetsAt) > now ? resetTimeText(resetsAt, now, clock) : null;
  return { kind: "scheduled", label: phrase ? `Queued — sends when the limit resets ${phrase}` : "Queued — sending" };
}

// main takes no model, effort, fast or permission mode with such a send, as with a queued message.
export function waitsForReset(c: Pick<ConversationSummary, "limitResetsAt" | "scheduledAt"> | undefined): boolean {
  return !!(c?.limitResetsAt || c?.scheduledAt);
}

// Only while the limit still holds.
export function liveReset(at: string | undefined, now: number, clock: Clock): string | null {
  return at !== undefined && Date.parse(at) > now ? resetTimeText(at, now, clock) : null;
}
