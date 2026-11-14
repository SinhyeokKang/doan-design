import { expect, test } from "vitest";
import { COOLDOWN_MS, cooldownClock, cooldownEnd, cooldownRemaining, nextTick } from "./buddyCooldown";

// The 24-hour buddy lock after a Settings > General switch (PRODUCT §5 item 0 'General').
const H = 3_600_000;
const T = Date.parse("2026-11-14T10:00:00.000Z");

test("the lock lasts 24 hours", () => {
  expect(COOLDOWN_MS).toBe(24 * H);
});

test("cooldownEnd: 24 hours after the change when the change is in the past", () => {
  expect(cooldownEnd(T, T + 5 * H)).toBe(T + 24 * H);
  expect(cooldownEnd(T, T)).toBe(T + 24 * H);
});

// The clock went back: one run locks at most 24 hours from when it first read the time.
test("cooldownEnd: a change time in the future counts from when this run first saw it", () => {
  expect(cooldownEnd(T + 100 * H, T)).toBe(T + 24 * H);
});

test("cooldownRemaining: the time left, and null at exactly 24 hours and after", () => {
  const end = T + 24 * H;
  expect(cooldownRemaining(end, T)).toBe(24 * H);
  expect(cooldownRemaining(end, end - 1)).toBe(1);
  expect(cooldownRemaining(end, end)).toBeNull();
  expect(cooldownRemaining(end, end + 1)).toBeNull();
});

test("cooldownClock: whole seconds rounded up, as HH:mm:ss", () => {
  expect(cooldownClock(24 * H)).toBe("24:00:00");
  expect(cooldownClock(24 * H - 19_000)).toBe("23:59:41");
  expect(cooldownClock(42 * 60_000 + 17_000)).toBe("00:42:17");
});

test("cooldownClock: 1001 ms is 00:00:02; 1000 ms and 999 ms are 00:00:01", () => {
  expect(cooldownClock(1001)).toBe("00:00:02");
  expect(cooldownClock(1000)).toBe("00:00:01");
  expect(cooldownClock(999)).toBe("00:00:01");
  expect(cooldownClock(1)).toBe("00:00:01");
});

test("cooldownClock: 59 minutes 59.5 seconds rounds up to 01:00:00", () => {
  expect(cooldownClock(H - 500)).toBe("01:00:00");
  expect(cooldownClock(H - 1000)).toBe("00:59:59");
});

test("nextTick: the wait until the shown second changes, 1 to 1000 ms", () => {
  // Just past a second boundary: 2 shows, and 1 ms later 1 does.
  expect(nextTick(1001)).toBe(1);
  // Right on a boundary: the shown second holds for a whole second.
  expect(nextTick(2000)).toBe(1000);
  expect(nextTick(1999)).toBe(999);
  // The last second: the next change is the end itself.
  expect(nextTick(1000)).toBe(1000);
  expect(nextTick(400)).toBe(400);
  expect(nextTick(1)).toBe(1);
  expect(nextTick(24 * H)).toBe(1000);
});
