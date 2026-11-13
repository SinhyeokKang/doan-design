import type { Provider } from "../agentAuth/types";
import type { UsageWindow } from "../agentAuth/usageTypes";
import type { EventPayload, FailureCode } from "./types";

// A scheduled message goes out this long after the reset: a request right at the reset was not confirmed to be accepted.
export const SEND_DELAY_MS = 60_000;
export function sendAt(resetsAt: number): number { return resetsAt + SEND_DELAY_MS; }

// When a connection's usage limit lifts, from its usage read: the latest reset among the windows the provider itself
// reports as limited (usageParse.ts sets limited only then), and only one still ahead. previous: the reset a scheduled
// send went out for, which still counts after it passed, so a send stopped again by that same window reads it again.
export function limitResetFromUsage(windows: readonly Pick<UsageWindow, "resetsAt" | "limited">[], now: number, previous?: number): number | null {
  const resets = windows.flatMap(w => w.limited && w.resetsAt !== undefined ? [w.resetsAt] : []);
  if (!resets.length) return null;
  const latest = Math.max(...resets);
  return latest > now || latest === previous ? latest : null;
}

// Each Doan connection's live limit, in memory only and keyed by connectionId (a replacement is a new key). reset null
// clears the connection; a reset already passed is never kept, and every update drops the ones that passed.
export interface LimitEntry { provider: Provider; resetsAt: number }
export function limitState(prev: ReadonlyMap<string, LimitEntry>, connectionId: string, reset: LimitEntry | null, now: number): Map<string, LimitEntry> {
  const next = new Map([...prev].filter(([id, entry]) => id !== connectionId && entry.resetsAt > now));
  if (reset && reset.resetsAt > now) next.set(connectionId, reset);
  return next;
}

// What a Send does. queue: the conversation works, so the renderer queues as before; schedule: the message waits in main
// until the reset (only an existing Doan Claude Code or Codex conversation); refuse: the limit holds and nothing can
// wait for it (a new conversation, a legacy external conversation, an ACP provider). limit: the reset time of the
// conversation's connection, if main holds one; scheduled: its messages already wait for a reset that may have passed.
export type SendRoute = "send" | "queue" | "schedule" | "refuse";
export function sendDecision(input: { provider: Provider; owner: "doan" | "legacy-external"; start: boolean; limit: number | null; working: boolean; scheduled: boolean; now: number }): SendRoute {
  if (input.working) return "queue";
  const waits = !input.start && input.owner === "doan" && (input.provider === "claude" || input.provider === "codex");
  if (waits && input.scheduled) return "schedule";
  if (input.limit === null || input.limit <= input.now) return "send";
  return waits ? "schedule" : "refuse";
}

// Claude Code's own words for a usage limit, which it writes as an assistant message of its own (model <synthetic>, no
// model call; fixtures/claude-rate-limit-transcripts.json) and the transport reads as a message.
const CLAUDE_LIMIT_NOTICE = /^You've hit your .+ limit\b/;
// Whether the agent did anything in one turn's events: a reply text or a tool step (an activity, a permission request or
// a question). A message that is the turn's own failure notice is the provider's, not the agent's.
export function turnHadActivity(events: readonly EventPayload[]): boolean {
  const failed = events.find(e => e.type === "turn.failed"), notice = failed?.type === "turn.failed" ? failed.detail?.trim() : undefined;
  return events.some(e => {
    if (e.type === "activity" || e.type === "permission.request" || e.type === "question.request" || e.type === "handoff.requested") return true;
    if (e.type !== "message.delta" && e.type !== "message.done") return false;
    const text = e.text.trim();
    return !!text && text !== notice && !CLAUDE_LIMIT_NOTICE.test(text);
  });
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const RESET = /\bresets\s+(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*([ap]m)?\s*\(([^()\s]+)\)/i;
// A reset named without a date that passed within this long, and is the one a scheduled send went out for, is the one
// meant: a send at the reset that the limit stopped again still names it.
const RECENT_MS = 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
// Claude Code's limit message as the fallback source of the reset (“You've hit your 5-hour limit · resets 10:10pm
// (Asia/Seoul)”, “… resets Oct 17 at 1pm (Asia/Seoul)”), in the IANA zone it names. Without a date: the next such
// time, unless that time is `previous` (the reset a scheduled send went out for) and passed within the hour. A date
// takes the year that puts it nearest to now. null when any part cannot be read.
export function claudeResetFromDetail(detail: string, now: number, previous?: number): number | null {
  const match = RESET.exec(detail); if (!match) return null;
  const [, month, day, hourText, minuteText, meridiem, zone] = match;
  let hour = Number(hourText); const minute = minuteText === undefined ? 0 : Number(minuteText);
  if (minute > 59) return null;
  if (meridiem) { if (hour < 1 || hour > 12) return null; hour = hour % 12 + (meridiem.toLowerCase() === "pm" ? 12 : 0); }
  else if (hour > 23) return null;
  let local: LocalDate;
  try { local = localDate(now, zone!); } catch { return null; }
  if (month !== undefined) {
    const m = MONTHS.indexOf(month.toLowerCase()); if (m === -1) return null;
    const d = Number(day);
    const candidates = [local.year - 1, local.year, local.year + 1].map(year => ({ year, at: zoned({ year, month: m, day: d, hour, minute }, zone!) }));
    const valid = candidates.filter(c => c.at !== null && localDate(c.at, zone!).month === m && localDate(c.at, zone!).day === d);
    if (!valid.length) return null;
    return valid.reduce((best, c) => Math.abs(c.at! - now) < Math.abs(best.at! - now) ? c : best).at;
  }
  const today = zoned({ ...local, hour, minute }, zone!); if (today === null) return null;
  // The same wall time a day either side; a DST change moves it by the hour it adds or drops.
  const times = [-1, 0, 1].map(days => zonedShift(today, days, zone!, hour, minute)).filter((t): t is number => t !== null);
  const past = times.filter(t => t <= now).at(-1), next = times.find(t => t > now);
  if (past !== undefined && past === previous && now - past <= RECENT_MS) return past;
  return next ?? null;
}
interface LocalDate { year: number; month: number; day: number }
function parts(at: number, zone: string): LocalDate & { hour: number; minute: number } {
  const format = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
  const read = Object.fromEntries(format.formatToParts(at).filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
  return { year: read.year!, month: read.month! - 1, day: read.day!, hour: read.hour!, minute: read.minute! };
}
function localDate(at: number, zone: string): LocalDate { const p = parts(at, zone); return { year: p.year, month: p.month, day: p.day }; }
// The instant a wall time in the zone names: the offset is read at a first guess and again at the result, which settles
// it across a DST change. Seconds are dropped, since zones' offsets are whole minutes here.
function zoned(wall: LocalDate & { hour: number; minute: number }, zone: string): number | null {
  const target = Date.UTC(wall.year, wall.month, wall.day, wall.hour, wall.minute);
  if (!Number.isFinite(target)) return null;
  const offset = (at: number) => { const p = parts(at, zone); return Date.UTC(p.year, p.month, p.day, p.hour, p.minute) - Math.floor(at / 60_000) * 60_000; };
  let at = target - offset(target);
  at = target - offset(at);
  return at;
}
function zonedShift(today: number, days: number, zone: string, hour: number, minute: number): number | null {
  return days === 0 ? today : zoned({ ...localDate(today + days * DAY_MS, zone), hour, minute }, zone);
}

// What a turn the usage limit stopped does with its own message. schedule: it waits for the reset; retry: a scheduled
// send the same reset stopped again (sent too early) goes once more a minute later; none: it fails as any turn does.
// Only a turn in which the agent did nothing may send its message again, or the work done would run twice.
// previousReset: the reset a scheduled send went out for; retriedSame: it was already sent again for that reset.
export type AutoSchedule = "schedule" | "retry" | "none";
export function autoSchedule(input: { code: FailureCode; hadActivity: boolean; reset: number | null; previousReset?: number; retriedSame: boolean; now: number }): AutoSchedule {
  const { reset, previousReset } = input;
  if (input.code !== "rate_limited" || input.hadActivity || reset === null) return "none";
  if (previousReset !== undefined && reset === previousReset) return input.retriedSame ? "none" : "retry";
  if (previousReset !== undefined && reset < previousReset) return "none";
  return reset > input.now ? "schedule" : "none";
}
