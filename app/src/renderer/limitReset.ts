import type { Slot } from "./homeConversations";

// The words for a usage limit's reset time: the queue's status line, the Queue button, the failed turn's line, the
// scheduled slot and the start refusal all say it the same way.

export interface Clock { timeZone: string; hour12: boolean }

// The renderer's own time zone and hour cycle. Chromium takes the hour cycle from the app's locale, not from macOS's
// 24-hour setting, so the two can differ until main reports that setting.
export function localClock(): Clock {
  const options = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
  return { timeZone: options.timeZone, hour12: options.hour12 ?? true };
}

const DAY = 86_400_000;
// The calendar day in the clock's zone, counted from the epoch: a daylight saving change never moves it.
function day(time: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(time);
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / DAY;
}

// What follows "resets": "at 3:00 PM" today, "tomorrow at 3:00 PM", "Thursday at 3:00 PM" within 6 days, else
// "Nov 20 at 3:00 PM". The time and AM/PM are joined by U+202F so they never break apart. null: not a time.
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

// The always-present status line under scheduled rows. Once the reset has passed the rows go out (after main's send
// margin, a wake from sleep, or another project conversation's turn), so it says so.
export function queueStatusLine(resetsAt: string, now: number, clock: Clock): { kind: "scheduled" | "sending"; text: string } {
  const phrase = Date.parse(resetsAt) > now ? resetTimeText(resetsAt, now, clock) : null;
  return phrase ? { kind: "scheduled", text: `Sends when the limit resets ${phrase}.` } : { kind: "sending", text: "Sending…" };
}

// The Queue button's tooltip and sr-only description while the limit holds; null after the reset, when it is the
// shipped Queue.
export function queueButtonHint(resetsAt: string | null, now: number, clock: Clock): { tip: string; description: string } | null {
  const phrase = resetsAt !== null && Date.parse(resetsAt) > now ? resetTimeText(resetsAt, now, clock) : null;
  return phrase ? { tip: `Queue — sends when the limit resets ${phrase}`, description: `Sends when the limit resets ${phrase}.` } : null;
}

// The sidebar slot and the conversation menus' StatusMark for a scheduled conversation.
export function scheduledSlot(resetsAt: string, now: number, clock: Clock): Slot {
  const phrase = Date.parse(resetsAt) > now ? resetTimeText(resetsAt, now, clock) : null;
  return { kind: "scheduled", label: phrase ? `Queued — sends when the limit resets ${phrase}` : "Queued — sending" };
}
