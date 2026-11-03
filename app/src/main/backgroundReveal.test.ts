import { describe, expect, test } from "vitest";
import { BACKGROUND_LAUNCH_FLAG, launchedInBackground, revealFor } from "./backgroundReveal";

describe("launchedInBackground", () => {
  test("is true when the CLI's background flag is in the launch argv", () => {
    expect(BACKGROUND_LAUNCH_FLAG).toBe("--doan-launch=background");
    expect(launchedInBackground(["/Applications/Doan.app/Contents/MacOS/Doan", "--doan-launch=background"])).toBe(true);
  });

  test("is false without the flag", () => {
    expect(launchedInBackground(["/Applications/Doan.app/Contents/MacOS/Doan"])).toBe(false);
    expect(launchedInBackground([])).toBe(false);
  });

  test("ignores other argv, including near misses", () => {
    expect(launchedInBackground(["Doan", "--user-data-dir=/tmp/x", "--doan-launch=foreground", "--doan-launch", "background", "--doan-launch=background-x"])).toBe(false);
  });
});

describe("revealFor", () => {
  test("an active app shows the window now and does not bounce", () => {
    for (const windowVisible of [true, false]) for (const bounced of [true, false]) {
      expect(revealFor({ appActive: true, windowVisible, bounced })).toEqual({ show: "now", bounce: false });
    }
  });

  test("an inactive app with a window not on screen waits for activation and bounces", () => {
    expect(revealFor({ appActive: false, windowVisible: false, bounced: false })).toEqual({ show: "on-activate", bounce: true });
  });

  test("a wait that already bounced keeps waiting without bouncing again", () => {
    expect(revealFor({ appActive: false, windowVisible: false, bounced: true })).toEqual({ show: "on-activate", bounce: false });
  });

  test("an inactive app with a visible window does not raise it, and bounces", () => {
    expect(revealFor({ appActive: false, windowVisible: true, bounced: false })).toEqual({ show: "none", bounce: true });
  });
});
