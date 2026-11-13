import { expect, it } from "vitest";
import { clockArgument, clockHour12 } from "./clockHourCycle";

it("follows macOS's forced 24- or 12-hour time, else the system locale's hour cycle", () => {
  expect(clockHour12({ force24: true, force12: false }, "en-US")).toBe(false);
  expect(clockHour12({ force24: false, force12: true }, "en-GB")).toBe(true);
  expect(clockHour12({ force24: false, force12: false }, "en-US")).toBe(true);
  expect(clockHour12({ force24: false, force12: false }, "en-GB")).toBe(false);
  expect(clockHour12({ force24: false, force12: false }, "de-DE")).toBe(false);
});
it("hands the window one argument", () => {
  expect(clockArgument(true)).toBe("--doan-clock-hour12=1");
  expect(clockArgument(false)).toBe("--doan-clock-hour12=0");
});
