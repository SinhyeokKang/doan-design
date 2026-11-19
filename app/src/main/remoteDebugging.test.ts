import { describe, expect, test } from "vitest";
import { refusesRemoteDebugging } from "./remoteDebugging";

function commandLine(...switches: string[]) {
  return { hasSwitch: (name: string) => switches.includes(name) };
}

describe("refusesRemoteDebugging", () => {
  test("a packaged app refuses either Chromium remote-debugging switch", () => {
    expect(refusesRemoteDebugging(commandLine("remote-debugging-port"), true)).toBe(true);
    expect(refusesRemoteDebugging(commandLine("remote-debugging-pipe"), true)).toBe(true);
  });

  test("a packaged app starts without them", () => {
    expect(refusesRemoteDebugging(commandLine(), true)).toBe(false);
    expect(refusesRemoteDebugging(commandLine("user-data-dir", "lang"), true)).toBe(false);
  });

  test("dev runs and test harnesses keep the switches", () => {
    expect(refusesRemoteDebugging(commandLine("remote-debugging-port"), false)).toBe(false);
    expect(refusesRemoteDebugging(commandLine("remote-debugging-pipe"), false)).toBe(false);
  });
});
