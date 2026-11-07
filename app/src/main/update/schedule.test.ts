import { describe, expect, test } from "vitest";
import { CHECK_INTERVAL_MS, shouldCheck } from "./schedule";

const HOUR = 60 * 60 * 1000;
const now = 1_800_000_000_000;

// Automatic checks: once right after launch, then every 6 hours. The time lives in memory, so every launch checks.
describe("shouldCheck", () => {
  test("the interval is 6 hours", () => {
    expect(CHECK_INTERVAL_MS).toBe(6 * HOUR);
  });

  test("checks once right after launch", () => {
    expect(shouldCheck({ autoCheck: true, lastCheckedAt: null, now })).toBe(true);
  });

  test("then only once 6 hours have passed", () => {
    expect(shouldCheck({ autoCheck: true, lastCheckedAt: now - 1 * HOUR, now })).toBe(false);
    expect(shouldCheck({ autoCheck: true, lastCheckedAt: now - 6 * HOUR + 1, now })).toBe(false);
    expect(shouldCheck({ autoCheck: true, lastCheckedAt: now - 6 * HOUR, now })).toBe(true);
    expect(shouldCheck({ autoCheck: true, lastCheckedAt: now - 30 * HOUR, now })).toBe(true);
  });

  // A clock set back would otherwise hold checks off until it caught up with the old time.
  test("a last check in the future is due", () => {
    expect(shouldCheck({ autoCheck: true, lastCheckedAt: now + HOUR, now })).toBe(true);
  });

  test("with automatic checks off, never", () => {
    expect(shouldCheck({ autoCheck: false, lastCheckedAt: null, now })).toBe(false);
    expect(shouldCheck({ autoCheck: false, lastCheckedAt: now - 30 * HOUR, now })).toBe(false);
  });
});
