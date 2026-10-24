import { expect, test } from "vitest";
import { createThrottle } from "./throttle";

test("allows one call per interval, counting from creation", () => {
  let now = 1_000;
  const allow = createThrottle(60_000, () => now);
  // The shell has just read every root at startup.
  expect(allow()).toBe(false);
  now += 59_999;
  expect(allow()).toBe(false);
  now += 1;
  expect(allow()).toBe(true);
  expect(allow()).toBe(false);
  now += 30_000;
  expect(allow()).toBe(false);
  now += 30_000;
  expect(allow()).toBe(true);
});

test("a clock that goes backwards does not block forever", () => {
  let now = 100_000;
  const allow = createThrottle(60_000, () => now);
  now = 0;
  expect(allow()).toBe(false);
  now = 60_000;
  expect(allow()).toBe(true);
});
