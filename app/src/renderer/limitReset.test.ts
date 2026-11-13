import { describe, expect, test, vi } from "vitest";
import { liveReset, localClock, queueButtonHint, queueStatusLine, resetTimeText, scheduledSlot, waitsForReset, type Clock } from "./limitReset";

const SEOUL: Clock = { timeZone: "Asia/Seoul", hour12: true };
const NNBSP = " ";
// Friday, Nov 13, 2026, 10:00 in Seoul (UTC+9, no daylight saving time).
const NOW = Date.parse("2026-11-13T10:00:00+09:00");
const at = (local: string) => new Date(Date.parse(`${local}+09:00`)).toISOString();

describe("resetTimeText", () => {
  test("today is the time alone; tomorrow; a weekday within 6 days; a month and day after that", () => {
    expect(resetTimeText(at("2026-11-13T15:00:00"), NOW, SEOUL)).toBe(`at 3:00${NNBSP}PM`);
    expect(resetTimeText(at("2026-11-14T15:00:00"), NOW, SEOUL)).toBe(`tomorrow at 3:00${NNBSP}PM`);
    expect(resetTimeText(at("2026-11-15T15:00:00"), NOW, SEOUL)).toBe(`Sunday at 3:00${NNBSP}PM`);
    expect(resetTimeText(at("2026-11-19T15:00:00"), NOW, SEOUL)).toBe(`Thursday at 3:00${NNBSP}PM`);
    expect(resetTimeText(at("2026-11-20T15:00:00"), NOW, SEOUL)).toBe(`Nov 20 at 3:00${NNBSP}PM`);
  });

  test("the time and AM/PM are joined by a narrow no-break space; 24-hour time has neither", () => {
    expect(resetTimeText(at("2026-11-13T11:05:00"), NOW, SEOUL)).toBe(`at 11:05${NNBSP}AM`);
    expect(resetTimeText(at("2026-11-13T15:00:00"), NOW, { ...SEOUL, hour12: false })).toBe("at 15:00");
    // Midnight reads 00:00, never 24:00.
    expect(resetTimeText(at("2026-11-14T00:00:00"), NOW, { ...SEOUL, hour12: false })).toBe("tomorrow at 00:00");
  });

  test("the day changes at the clock's midnight, not 24 hours after now", () => {
    const late = Date.parse("2026-11-13T23:59:00+09:00");
    expect(resetTimeText(at("2026-11-14T00:01:00"), late, SEOUL)).toBe(`tomorrow at 12:01${NNBSP}AM`);
    expect(resetTimeText(at("2026-11-13T23:59:30"), late, SEOUL)).toBe(`at 11:59${NNBSP}PM`);
  });

  test("days are counted in the clock's time zone", () => {
    // Now is Nov 12, 20:00 in New York, where a reset at 23:00 in Seoul is 9:00 the next morning.
    const reset = at("2026-11-13T23:00:00");
    expect(resetTimeText(reset, NOW, SEOUL)).toBe(`at 11:00${NNBSP}PM`);
    expect(resetTimeText(reset, NOW, { timeZone: "America/New_York", hour12: true })).toBe(`tomorrow at 9:00${NNBSP}AM`);
  });

  test("a daylight saving change in between neither shifts the day nor the time", () => {
    const ny: Clock = { timeZone: "America/New_York", hour12: true };
    // US daylight saving time ends at 2:00 on Nov 1, 2026: a 25-hour day.
    const before = Date.parse("2026-10-31T23:30:00-04:00");
    expect(resetTimeText("2026-11-02T04:30:00.000Z", before, ny)).toBe(`tomorrow at 11:30${NNBSP}PM`);
    expect(resetTimeText("2026-11-07T04:30:00.000Z", before, ny)).toBe(`Friday at 11:30${NNBSP}PM`);
    expect(resetTimeText("2026-11-08T04:30:00.000Z", before, ny)).toBe(`Nov 7 at 11:30${NNBSP}PM`);
  });

  test("an unreadable time is null", () => {
    expect(resetTimeText("", NOW, SEOUL)).toBeNull();
    expect(resetTimeText("soon", NOW, SEOUL)).toBeNull();
  });
});

describe("queueStatusLine", () => {
  test("names the reset until it passes, then reads Sending…", () => {
    const reset = at("2026-11-13T15:00:00");
    expect(queueStatusLine(reset, NOW, SEOUL)).toEqual({ kind: "scheduled", text: `Sends when the limit resets at 3:00${NNBSP}PM.` });
    expect(queueStatusLine(at("2026-11-19T15:00:00"), NOW, SEOUL).text).toBe(`Sends when the limit resets Thursday at 3:00${NNBSP}PM.`);
    expect(queueStatusLine(reset, Date.parse(reset), SEOUL)).toEqual({ kind: "sending", text: "Sending…" });
    expect(queueStatusLine(reset, Date.parse(reset) + 30_000, SEOUL)).toEqual({ kind: "sending", text: "Sending…" });
  });

  test("an unreadable time reads Sending…, since nothing is known to wait for", () => {
    expect(queueStatusLine("", NOW, SEOUL)).toEqual({ kind: "sending", text: "Sending…" });
  });
});

describe("queueButtonHint", () => {
  test("while the limit holds, the tooltip and the description name the reset", () => {
    expect(queueButtonHint(at("2026-11-14T15:00:00"), NOW, SEOUL)).toEqual({
      tip: `Queue — sends when the limit resets tomorrow at 3:00${NNBSP}PM`,
      description: `Sends when the limit resets tomorrow at 3:00${NNBSP}PM.`,
    });
  });

  test("after the reset, or with no reset known, the button is the shipped Queue", () => {
    const reset = at("2026-11-13T15:00:00");
    expect(queueButtonHint(reset, Date.parse(reset), SEOUL)).toBeNull();
    expect(queueButtonHint(null, NOW, SEOUL)).toBeNull();
    expect(queueButtonHint("soon", NOW, SEOUL)).toBeNull();
  });
});

describe("scheduledSlot", () => {
  test("the sidebar slot and StatusMark name the reset", () => {
    expect(scheduledSlot(at("2026-11-13T15:00:00"), NOW, SEOUL)).toEqual({ kind: "scheduled", label: `Queued — sends when the limit resets at 3:00${NNBSP}PM` });
  });

  // Not drawn: the draft names only the waiting state, so the passed one says what the status line says.
  test("once the reset passed it reads as going out, without a time", () => {
    const reset = at("2026-11-13T15:00:00");
    expect(scheduledSlot(reset, Date.parse(reset) + 1, SEOUL)).toEqual({ kind: "scheduled", label: "Queued — sending" });
  });
});

describe("waitsForReset and liveReset", () => {
  test("a send waits while the limit holds or the conversation is scheduled", () => {
    expect(waitsForReset({ limitResetsAt: "2026-11-13T06:00:00.000Z" })).toBe(true);
    expect(waitsForReset({ scheduledAt: "2026-11-13T06:00:00.000Z" })).toBe(true);
    expect(waitsForReset({})).toBe(false);
    expect(waitsForReset(undefined)).toBe(false);
  });
  test("the failed turn names the reset only before it", () => {
    const reset = at("2026-11-13T15:00:00");
    expect(liveReset(reset, NOW, SEOUL)).toBe(`at 3:00${NNBSP}PM`);
    expect(liveReset(reset, Date.parse(reset), SEOUL)).toBeNull();
    expect(liveReset(undefined, NOW, SEOUL)).toBeNull();
  });
});

describe("localClock", () => {
  test("takes macOS's hour cycle from the preload value, and the locale's without it", () => {
    vi.stubGlobal("window", { doan: { clockHour12: false } });
    try { expect(localClock().hour12).toBe(false); } finally { vi.unstubAllGlobals(); }
    vi.stubGlobal("window", { doan: { clockHour12: true } });
    try { expect(localClock().hour12).toBe(true); } finally { vi.unstubAllGlobals(); }
    expect(typeof localClock().hour12).toBe("boolean");
  });
});

