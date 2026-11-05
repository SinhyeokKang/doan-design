import { describe, expect, it } from "vitest";
import { READ_INTERVAL_MS, shouldRead } from "./usageSchedule";
import type { UsageEntry, UsageReading, UsageTrigger } from "./usageTypes";

const NOW = Date.parse("2026-11-05T05:00:00Z");
const ok = (ago: number, resetsAt?: number): UsageReading => ({ status: "ok", readAt: NOW - ago, windows: [{ id: "five_hour", label: "5-hour", usedPercent: 10, ...(resetsAt === undefined ? {} : { resetsAt }) }] });
const failed = (ago: number): UsageReading => ({ status: "unavailable", reason: "read_failed", readAt: NOW - ago });
const entry = (reading?: UsageReading, more: Partial<UsageEntry> = {}): Pick<UsageEntry, "reading" | "inFlight" | "blocked"> => ({ reading, inFlight: false, ...more });
const T = {
  start: { kind: "start" }, signIn: { kind: "signIn" }, open: { kind: "open" }, refresh: { kind: "refresh" },
  turnEnd: { kind: "turnEnd", owner: "doan" }, legacyTurnEnd: { kind: "turnEnd", owner: "legacy-external" },
} satisfies Record<string, UsageTrigger>;
const SOON = READ_INTERVAL_MS - 1;

describe("shouldRead", () => {
  it("is five minutes", () => { expect(READ_INTERVAL_MS).toBe(300_000); });

  it.each([T.start, T.signIn, T.open, T.refresh, T.turnEnd])("reads with nothing cached (app start, after a restart, after sign-in): %o", trigger => {
    expect(shouldRead(entry(), NOW, trigger, true)).toBe(true);
  });

  it.each([T.start, T.signIn, T.open, T.turnEnd])("waits five minutes after the last read: %o", trigger => {
    expect(shouldRead(entry(ok(SOON)), NOW, trigger, true)).toBe(false);
    expect(shouldRead(entry(ok(READ_INTERVAL_MS)), NOW, trigger, true)).toBe(true);
  });

  it("counts a failed read toward the interval for every trigger but opening", () => {
    expect(shouldRead(entry(failed(SOON)), NOW, T.turnEnd, true)).toBe(false);
    expect(shouldRead(entry(failed(SOON)), NOW, T.start, true)).toBe(false);
    expect(shouldRead(entry(failed(SOON)), NOW, T.open, true)).toBe(true);
  });

  it("reads on opening when a window's reset time has passed", () => {
    expect(shouldRead(entry(ok(SOON, NOW)), NOW, T.open, true)).toBe(true);
    expect(shouldRead(entry(ok(SOON, NOW + 1)), NOW, T.open, true)).toBe(false);
    expect(shouldRead(entry(ok(SOON, NOW)), NOW, T.turnEnd, true)).toBe(false);
  });

  it("keeps the interval on opening for a reading that is not a failure", () => {
    const notSupported: UsageReading = { status: "unavailable", reason: "not_supported", readAt: NOW - SOON };
    expect(shouldRead(entry(notSupported), NOW, T.open, true)).toBe(false);
  });

  it("reads on refresh regardless of the interval", () => {
    expect(shouldRead(entry(ok(0)), NOW, T.refresh, true)).toBe(true);
  });

  it.each([T.start, T.open, T.refresh, T.turnEnd])("joins a read in flight instead of starting one: %o", trigger => {
    expect(shouldRead(entry(undefined, { inFlight: true }), NOW, trigger, true)).toBe(false);
  });

  it.each([T.start, T.signIn, T.open, T.refresh, T.turnEnd])("does not read while the app window is not visible: %o", trigger => {
    expect(shouldRead(entry(), NOW, trigger, false)).toBe(false);
  });

  it.each([T.start, T.open, T.refresh, T.turnEnd])("does not read a connection that can't be used: %o", trigger => {
    expect(shouldRead(entry(undefined, { blocked: "reauth_required" }), NOW, trigger, true)).toBe(false);
  });

  it("does not count a legacy external turn", () => {
    expect(shouldRead(entry(), NOW, T.legacyTurnEnd, true)).toBe(false);
    expect(shouldRead(entry(ok(READ_INTERVAL_MS)), NOW, T.legacyTurnEnd, true)).toBe(false);
  });
});
