import { describe, expect, test } from "vitest";
import type { InstallGate, UpdateEligibility, UpdateSnapshot, UpdateState } from "./types";
import { updateView } from "./view";

// What Settings > About's Version row, the automatic-check row, the header button and the Doan menu item show for
// each update state. The copy is the confirmed draft's (.doan/canvases/app-update.html).

// Local times, so the expectations hold in any time zone.
const NOW = new Date(2026, 10, 8, 16, 5).getTime();
const TODAY_2_41_PM = new Date(2026, 10, 8, 14, 41).getTime();
const TODAY_8_41_AM = new Date(2026, 10, 8, 8, 41).getTime();
const NOV_6_2_41_PM = new Date(2026, 10, 6, 14, 41).getTime();

const enabled: UpdateEligibility = { kind: "enabled" };
const allowed: InstallGate = { kind: "allowed" };
const blocked: InstallGate = { kind: "blocked", reason: "conversation" };
const snapshot = (state: UpdateState, over: Partial<UpdateSnapshot> = {}): UpdateSnapshot => ({ version: "0.1.0", state, eligibility: enabled, gate: allowed, autoCheck: true, lastCheckedAt: TODAY_2_41_PM, ...over });
const view = (state: UpdateState, over: Partial<UpdateSnapshot> = {}) => updateView(snapshot(state, over), NOW);

const CHECK = { action: "check", label: "Check for Updates", prominent: false };
const NOTES = { action: "notes", label: "Release Notes ↗", prominent: false };
const RESTART = { action: "restart", label: "Restart to Update", prominent: true };
const RETRY_CHECK = { action: "check", label: "Retry", ariaLabel: "Check for updates again", prominent: false };
const RETRY_DOWNLOAD = { action: "check", label: "Retry", ariaLabel: "Download Doan 0.1.1 again", prominent: false };
const BLOCKED = { title: "Can’t restart yet", text: "A conversation is running or waiting for your answer. Restart after it finishes, or Doan updates when you quit." };
const STOPPED = "Couldn’t restart Doan. Try again, or quit and open it again.";
const ROW = { description: "", actions: [], busy: null, progress: null, notice: null, error: null, announcement: null };
const MENU_CHECK = { label: "Check for Updates…", action: "check", enabled: true };
const MENU_RESTART = { label: "Restart to Update", action: "restart", enabled: true };
const AUTO_CHECK = { label: "Check for updates automatically", description: "Checks GitHub when Doan opens and every 6 hours, and downloads in the background. When off, a downloaded update still installs when you quit." };

const upToDate: UpdateState = { kind: "upToDate", manual: false };
const ready: UpdateState = { kind: "ready", version: "0.1.1" };

describe("before and during a check", () => {
  test("before the first check with automatic checks off: Not checked yet", () => {
    expect(view({ kind: "idle" }, { autoCheck: false, lastCheckedAt: null }).row).toEqual({ ...ROW, description: "0.1.0 · Not checked yet", actions: [CHECK] });
  });

  test("before the first check with automatic checks on, or after a failed automatic one with no success yet: the version alone", () => {
    expect(view({ kind: "idle" }, { lastCheckedAt: null }).row).toEqual({ ...ROW, description: "0.1.0", actions: [CHECK] });
  });

  test("up to date says when, today or on another day", () => {
    expect(view(upToDate).row).toEqual({ ...ROW, description: "0.1.0 · Up to date, last checked today at 2:41 PM", actions: [CHECK] });
    expect(view(upToDate, { lastCheckedAt: NOV_6_2_41_PM }).row.description).toBe("0.1.0 · Up to date, last checked Nov 6 at 2:41 PM");
    expect(view(upToDate, { lastCheckedAt: TODAY_8_41_AM }).row.description).toBe("0.1.0 · Up to date, last checked today at 8:41 AM");
    expect(view(upToDate, { lastCheckedAt: new Date(2026, 10, 8, 0, 5).getTime() }).row.description).toBe("0.1.0 · Up to date, last checked today at 12:05 AM");
    expect(view(upToDate, { lastCheckedAt: new Date(2026, 10, 8, 12, 0).getTime() }).row.description).toBe("0.1.0 · Up to date, last checked today at 12:00 PM");
  });

  test("only a manual up-to-date result is announced", () => {
    expect(view({ kind: "upToDate", manual: true }).row.announcement).toBe("Doan is up to date.");
    expect(view(upToDate).row.announcement).toBeNull();
  });

  test("a manual check shows the spinner while the description keeps the previous result", () => {
    expect(view({ kind: "checking", manual: true, last: upToDate }).row).toEqual({ ...ROW, description: "0.1.0 · Up to date, last checked today at 2:41 PM", busy: "Checking for updates" });
    expect(view({ kind: "checking", manual: true, last: { kind: "failed", code: "offline", stage: "check" } }).row)
      .toEqual({ ...ROW, description: "0.1.0 · Couldn’t check for updates.", busy: "Checking for updates" });
  });

  test("an automatic check is quiet: the row shows what it showed before, actions included", () => {
    expect(view({ kind: "checking", manual: false, last: upToDate }).row).toEqual(view(upToDate).row);
    const failed: UpdateState = { kind: "failed", code: "offline", stage: "check" };
    expect(view({ kind: "checking", manual: false, last: failed }).row).toEqual(view(failed).row);
  });

  // The state machine returns to the earlier state; the view keeps the last success's time.
  test("a failed automatic check keeps the last successful result", () => {
    expect(view(upToDate, { lastCheckedAt: TODAY_8_41_AM }).row).toEqual({ ...ROW, description: "0.1.0 · Up to date, last checked today at 8:41 AM", actions: [CHECK] });
  });
});

describe("download, ready and restart", () => {
  test("downloading shows the version and a whole percent, never announced", () => {
    expect(view({ kind: "downloading", version: "0.1.1", percent: 0 }).row).toEqual({ ...ROW, description: "0.1.0 · Downloading Doan 0.1.1", progress: 0 });
    expect(view({ kind: "downloading", version: "0.1.1", percent: 42 }).row).toEqual({ ...ROW, description: "0.1.0 · Downloading Doan 0.1.1", progress: 42 });
  });

  test("ready offers Release Notes and Restart to Update", () => {
    expect(view(ready).row).toEqual({ ...ROW, description: "0.1.0 · Doan 0.1.1 is ready. Restart now, or Doan installs it when you quit.", actions: [NOTES, RESTART], announcement: "Doan 0.1.1 is ready." });
  });

  test("ready but blocked by a conversation: the reason under the row, Restart to Update still pressable", () => {
    // A conversation starting or ending is not news: the reason is read when a press is answered blocked.
    expect(view(ready, { gate: blocked }).row).toEqual({ ...ROW, description: "0.1.0 · Doan 0.1.1 is ready.", actions: [NOTES, RESTART], notice: BLOCKED, announcement: "Doan 0.1.1 is ready." });
  });

  test("restarting: the spinner and nothing to press", () => {
    expect(view({ kind: "restarting", version: "0.1.1" }).row).toEqual({ ...ROW, description: "0.1.0 · Doan 0.1.1 is ready.", busy: "Restarting" });
  });

  test("a stopped restart keeps Restart to Update with the stopped line", () => {
    expect(view({ kind: "restartAborted", version: "0.1.1" }).row).toEqual({ ...ROW, description: "0.1.0 · Doan 0.1.1 is ready.", actions: [NOTES, RESTART], error: STOPPED, announcement: STOPPED });
    expect(view({ kind: "restartAborted", version: "0.1.1" }, { gate: blocked }).row).toEqual({ ...ROW, description: "0.1.0 · Doan 0.1.1 is ready.", actions: [NOTES, RESTART], notice: BLOCKED, error: STOPPED, announcement: STOPPED });
  });
});

describe("failures", () => {
  const LINES = {
    offline: "Couldn’t reach GitHub. Check your internet connection, then try again.",
    feedMissing: "The latest release on GitHub doesn’t include update information. Check again later.",
    rateLimited: "GitHub is limiting requests from this network. Try again later.",
    other: "Try again. If it keeps happening, use Copy details to report the problem.",
    signatureMismatch: "The download isn’t signed by the same developer as this copy of Doan, so it won’t be installed. Check again later.",
    checksumMismatch: "The download didn’t match the published file. Try again.",
    diskFull: "There isn’t enough disk space. Free up some space, then try again.",
    installFailed: "Doan couldn’t replace the app in the Applications folder. Try again, or ask an administrator if your account can’t change apps there.",
  } as const;

  test.each(["offline", "feedMissing", "rateLimited", "other"] as const)("a manual check that failed (%s) names the step, why, and Retry", code => {
    expect(view({ kind: "failed", code, stage: "check" }).row).toEqual({ ...ROW, description: "0.1.0 · Couldn’t check for updates.", actions: [RETRY_CHECK], error: LINES[code], announcement: `Couldn’t check for updates. ${LINES[code]}` });
  });

  test.each(["offline", "other", "signatureMismatch", "checksumMismatch", "diskFull"] as const)("a failed download (%s) adds Release Notes and retries the download", code => {
    expect(view({ kind: "failed", code, stage: "download", version: "0.1.1" }).row)
      .toEqual({ ...ROW, description: "0.1.0 · Couldn’t download Doan 0.1.1.", actions: [NOTES, RETRY_DOWNLOAD], error: LINES[code], announcement: `Couldn’t download Doan 0.1.1. ${LINES[code]}` });
  });

  test("a failed install repeats Restart to Update instead of Retry", () => {
    expect(view({ kind: "failed", code: "installFailed", stage: "install", version: "0.1.1" }).row)
      .toEqual({ ...ROW, description: "0.1.0 · Couldn’t install Doan 0.1.1.", actions: [NOTES, RESTART], error: LINES.installFailed, announcement: `Couldn’t install Doan 0.1.1. ${LINES.installFailed}` });
    expect(view({ kind: "failed", code: "installFailed", stage: "install", version: "0.1.1" }, { gate: blocked }).row.notice).toEqual(BLOCKED);
  });
});

describe("copies that don’t update", () => {
  // Agent setup's notice under the doan command row already gives these copies' reason.
  test.each(["dev", "outside-applications", "translocated"] as const)("%s: only “This copy doesn’t update.”, no button, no automatic-check row", reason => {
    const shown = view({ kind: "idle" }, { eligibility: { kind: "disabled", reason }, lastCheckedAt: null });
    expect(shown.row).toEqual({ ...ROW, description: "0.1.0 · This copy doesn’t update." });
    expect(shown.autoCheck).toBeNull();
    expect(shown.header).toBeNull();
    expect(shown.menu).toEqual({ label: "Check for Updates…", action: "openAbout", enabled: true });
  });

  test("a build without the feed in Applications gives the reason itself", () => {
    const shown = view({ kind: "idle" }, { eligibility: { kind: "disabled", reason: "noFeed" }, lastCheckedAt: null });
    expect(shown.row).toEqual({ ...ROW, description: "0.1.0 · This copy doesn’t update. Tester and locally packaged builds don’t check for updates. To get updates, install Doan from GitHub Releases." });
    expect(shown.autoCheck).toBeNull();
    expect(shown.menu.action).toBe("openAbout");
  });
});

describe("the automatic-check row", () => {
  test("shown with the saved choice in a copy that updates", () => {
    expect(view(upToDate).autoCheck).toEqual({ ...AUTO_CHECK, checked: true });
    expect(view(upToDate, { autoCheck: false }).autoCheck).toEqual({ ...AUTO_CHECK, checked: false });
  });

  test("turning it off changes nothing else: Check for Updates and the menu still check", () => {
    const off = view(upToDate, { autoCheck: false, lastCheckedAt: NOV_6_2_41_PM });
    expect(off.row).toEqual({ ...ROW, description: "0.1.0 · Up to date, last checked Nov 6 at 2:41 PM", actions: [CHECK] });
    expect(off.menu).toEqual(MENU_CHECK);
  });
});

describe("the header button and the Doan menu", () => {
  test("no button and Check for Updates… until an update is ready", () => {
    for (const state of [{ kind: "idle" }, upToDate, { kind: "checking", manual: true, last: upToDate }, { kind: "downloading", version: "0.1.1", percent: 3 },
      { kind: "failed", code: "offline", stage: "check" }, { kind: "failed", code: "offline", stage: "download", version: "0.1.1" },
      { kind: "failed", code: "installFailed", stage: "install", version: "0.1.1" }] as UpdateState[]) {
      expect(view(state).header, state.kind).toBeNull();
      expect(view(state).menu, state.kind).toEqual(MENU_CHECK);
    }
  });

  test("ready: the button restarts and the menu item reads Restart to Update", () => {
    expect(view(ready).header).toEqual({ label: "Restart to Update", busy: false, tooltip: "Doan 0.1.1 is ready", popover: null });
    expect(view(ready).menu).toEqual(MENU_RESTART);
  });

  test("blocked: the button and the menu item open the reason", () => {
    expect(view(ready, { gate: blocked }).header).toEqual({ label: "Restart to Update", busy: false, tooltip: "Doan 0.1.1 is ready", popover: BLOCKED });
    expect(view(ready, { gate: blocked }).menu).toEqual(MENU_RESTART);
  });

  test("restarting: the disabled spinner button and a disabled menu item", () => {
    expect(view({ kind: "restarting", version: "0.1.1" }).header).toEqual({ label: "Restarting", busy: true, tooltip: "Doan 0.1.1 is ready", popover: null });
    expect(view({ kind: "restarting", version: "0.1.1" }).menu).toEqual({ ...MENU_RESTART, enabled: false });
  });

  test("a stopped restart: the popover says so and the button restarts again", () => {
    expect(view({ kind: "restartAborted", version: "0.1.1" }).header).toEqual({ label: "Restart to Update", busy: false, tooltip: "Doan 0.1.1 is ready", popover: { title: "Couldn’t restart Doan.", text: "Try again, or quit and open it again." } });
    expect(view({ kind: "restartAborted", version: "0.1.1" }).menu).toEqual(MENU_RESTART);
    // A conversation still running is the reason a press would fail now.
    expect(view({ kind: "restartAborted", version: "0.1.1" }, { gate: blocked }).header?.popover).toEqual(BLOCKED);
  });

  test("a release candidate reads its full version", () => {
    const rc = view({ kind: "ready", version: "0.1.0-rc.2" }, { version: "0.1.0-rc.1" });
    expect(rc.row.description).toBe("0.1.0-rc.1 · Doan 0.1.0-rc.2 is ready. Restart now, or Doan installs it when you quit.");
    expect(rc.header?.tooltip).toBe("Doan 0.1.0-rc.2 is ready");
  });
});
