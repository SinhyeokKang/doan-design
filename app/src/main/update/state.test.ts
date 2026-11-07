import { describe, expect, test } from "vitest";
import { updateState } from "./state";
import type { UpdateErrorCode, UpdateEvent, UpdateState } from "./types";

// The update state machine: electron-updater events and the app's own events (a check starting, the restart
// beginning, the quit cancelled) move one state. An event a state does not use returns that same state object, so
// the service can skip a push.

const idle: UpdateState = { kind: "idle" };
const upToDate: UpdateState = { kind: "upToDate", manual: false };
const failedCheck: UpdateState = { kind: "failed", code: "offline", stage: "check" };
const failedDownload: UpdateState = { kind: "failed", code: "offline", stage: "download", version: "0.1.1" };
const failedInstall: UpdateState = { kind: "failed", code: "installFailed", stage: "install", version: "0.1.1" };
const downloading: UpdateState = { kind: "downloading", version: "0.1.1", percent: 42 };
const ready: UpdateState = { kind: "ready", version: "0.1.1" };
const restarting: UpdateState = { kind: "restarting", version: "0.1.1" };
const restartAborted: UpdateState = { kind: "restartAborted", version: "0.1.1" };
const ALL: UpdateState[] = [idle, upToDate, failedCheck, failedDownload, failedInstall, { kind: "checking", manual: false, last: idle }, { kind: "checking", manual: true, last: upToDate }, downloading, ready, restarting, restartAborted];

const run = (state: UpdateState, ...events: UpdateEvent[]) => events.reduce(updateState, state);
const error = (code: UpdateErrorCode): UpdateEvent => ({ type: "error", code });

describe("checking", () => {
  test("a check starts from a settled state and keeps it to show meanwhile", () => {
    expect(run(idle, { type: "check", manual: false })).toEqual({ kind: "checking", manual: false, last: idle });
    expect(run(upToDate, { type: "check", manual: true })).toEqual({ kind: "checking", manual: true, last: upToDate });
    // Retry after a failure is a manual check.
    expect(run(failedCheck, { type: "check", manual: true })).toEqual({ kind: "checking", manual: true, last: failedCheck });
    expect(run(failedDownload, { type: "check", manual: true })).toEqual({ kind: "checking", manual: true, last: failedDownload });
  });

  test("the updater's own checking event starts an automatic check, and changes nothing during one", () => {
    expect(run(idle, { type: "checking-for-update" })).toEqual({ kind: "checking", manual: false, last: idle });
    const manual: UpdateState = { kind: "checking", manual: true, last: idle };
    expect(run(manual, { type: "checking-for-update" })).toBe(manual);
  });

  test("a manual check during an automatic one makes it manual; an automatic one during a manual one changes nothing", () => {
    const auto: UpdateState = { kind: "checking", manual: false, last: upToDate };
    expect(run(auto, { type: "check", manual: true })).toEqual({ kind: "checking", manual: true, last: upToDate });
    const manual: UpdateState = { kind: "checking", manual: true, last: upToDate };
    expect(run(manual, { type: "check", manual: false })).toBe(manual);
    expect(run(manual, { type: "check", manual: true })).toBe(manual);
  });

  test("no update: up to date, remembering whether a person asked", () => {
    expect(run(idle, { type: "check", manual: true }, { type: "update-not-available" })).toEqual({ kind: "upToDate", manual: true });
    expect(run(upToDate, { type: "check", manual: false }, { type: "update-not-available" })).toEqual({ kind: "upToDate", manual: false });
    // An answer without a check the app saw is an automatic one.
    expect(run(idle, { type: "update-not-available" })).toEqual({ kind: "upToDate", manual: false });
  });

  test("an update found starts its download at 0%", () => {
    expect(run(idle, { type: "check", manual: false }, { type: "update-available", version: "0.1.1" })).toEqual({ kind: "downloading", version: "0.1.1", percent: 0 });
  });

  test("a failed manual check shows; a failed automatic check goes back to what it showed before", () => {
    expect(run(upToDate, { type: "check", manual: true }, error("offline"))).toEqual({ kind: "failed", code: "offline", stage: "check" });
    expect(run(upToDate, { type: "check", manual: false }, error("offline"))).toEqual(upToDate);
    expect(run(idle, { type: "check", manual: false }, error("rateLimited"))).toEqual(idle);
    expect(run(failedCheck, { type: "checking-for-update" }, error("other"))).toEqual(failedCheck);
  });

  test("an error with no check under way changes nothing", () => {
    for (const state of [idle, upToDate, failedCheck, failedDownload]) expect(run(state, error("offline"))).toBe(state);
  });
});

describe("downloading", () => {
  test("progress is a whole percent between 0 and 100", () => {
    expect(run(downloading, { type: "download-progress", percent: 57.9 })).toEqual({ ...downloading, percent: 57 });
    expect(run(downloading, { type: "download-progress", percent: 140 })).toEqual({ ...downloading, percent: 100 });
    expect(run(downloading, { type: "download-progress", percent: -3 })).toEqual({ ...downloading, percent: 0 });
    expect(run(downloading, { type: "download-progress", percent: Number.NaN })).toBe(downloading);
  });

  test("progress outside a download changes nothing", () => {
    for (const state of [idle, upToDate, ready, restarting]) expect(run(state, { type: "download-progress", percent: 10 })).toBe(state);
  });

  test("a check while downloading changes nothing; a newer version restarts the download", () => {
    expect(run(downloading, { type: "check", manual: true })).toBe(downloading);
    expect(run(downloading, { type: "check", manual: false })).toBe(downloading);
    expect(run(downloading, { type: "checking-for-update" })).toBe(downloading);
    expect(run(downloading, { type: "update-available", version: "0.1.1" })).toBe(downloading);
    expect(run(downloading, { type: "update-not-available" })).toBe(downloading);
    expect(run(downloading, { type: "update-available", version: "0.1.2" })).toEqual({ kind: "downloading", version: "0.1.2", percent: 0 });
  });

  test("a downloaded update is ready", () => {
    expect(run(downloading, { type: "update-downloaded", version: "0.1.1" })).toEqual(ready);
  });

  test("a failed download always shows, automatic or not, with its version", () => {
    for (const code of ["offline", "other", "checksumMismatch", "diskFull", "signatureMismatch"] as const) {
      expect(run(downloading, error(code))).toEqual({ kind: "failed", code, stage: "download", version: "0.1.1" });
    }
    expect(run(upToDate, { type: "check", manual: false }, { type: "update-available", version: "0.1.1" }, error("offline"))).toEqual(failedDownload);
  });

  test("Retry after a failed download checks again and downloads", () => {
    expect(run(failedDownload, { type: "check", manual: true }, { type: "checking-for-update" }, { type: "update-available", version: "0.1.1" }, { type: "download-progress", percent: 5 }))
      .toEqual({ kind: "downloading", version: "0.1.1", percent: 5 });
  });

  test("a cancelled download goes back to no result", () => {
    expect(run(downloading, { type: "update-cancelled" })).toEqual(idle);
    for (const state of [idle, upToDate, ready, restarting]) expect(run(state, { type: "update-cancelled" })).toBe(state);
  });
});

describe("ready", () => {
  test("checking again for the same version changes nothing", () => {
    expect(run(ready, { type: "check", manual: true })).toBe(ready);
    expect(run(ready, { type: "check", manual: false })).toBe(ready);
    expect(run(ready, { type: "checking-for-update" })).toBe(ready);
    expect(run(ready, { type: "update-available", version: "0.1.1" })).toBe(ready);
    expect(run(ready, { type: "update-downloaded", version: "0.1.1" })).toBe(ready);
    expect(run(ready, { type: "update-not-available" })).toBe(ready);
  });

  test("a newer version found while ready downloads it", () => {
    expect(run(ready, { type: "update-available", version: "0.1.2" })).toEqual({ kind: "downloading", version: "0.1.2", percent: 0 });
  });

  // Squirrel.Mac fetches and verifies the update after electron-updater reports it downloaded, so its errors arrive
  // while ready. A later check that fails must not take a working update away.
  test("a check that fails while ready changes nothing; Squirrel's own failures show", () => {
    for (const code of ["offline", "rateLimited", "feedMissing", "other"] as const) expect(run(ready, error(code))).toBe(ready);
    for (const code of ["signatureMismatch", "checksumMismatch", "diskFull"] as const) expect(run(ready, error(code))).toEqual({ kind: "failed", code, stage: "download", version: "0.1.1" });
    expect(run(ready, error("installFailed"))).toEqual(failedInstall);
  });
});

describe("restarting", () => {
  test("Restart to Update starts the restart from ready, a stopped restart or a failed install", () => {
    for (const state of [ready, restartAborted, failedInstall]) expect(run(state, { type: "install" })).toEqual(restarting);
  });

  test("the restart starts only with a downloaded update", () => {
    for (const state of [idle, upToDate, failedCheck, failedDownload, downloading, { kind: "checking", manual: true, last: idle } as UpdateState, restarting]) {
      expect(run(state, { type: "install" })).toBe(state);
    }
  });

  test("a cancelled quit stops the restart, and pressing again restarts", () => {
    expect(run(restarting, { type: "quit-cancelled" })).toEqual(restartAborted);
    expect(run(restartAborted, { type: "install" }, { type: "quit-cancelled" }, { type: "install" })).toEqual(restarting);
  });

  test("a cancelled quit outside a restart changes nothing", () => {
    for (const state of ALL.filter(state => state.kind !== "restarting")) expect(run(state, { type: "quit-cancelled" })).toBe(state);
  });

  test("an error while restarting is an install failure", () => {
    expect(run(restarting, error("installFailed"))).toEqual(failedInstall);
    expect(run(restarting, error("other"))).toEqual({ kind: "failed", code: "other", stage: "install", version: "0.1.1" });
  });

  test("while restarting, checks and updater news change nothing", () => {
    for (const event of [{ type: "check", manual: true }, { type: "checking-for-update" }, { type: "update-available", version: "0.1.2" }, { type: "update-not-available" },
      { type: "update-downloaded", version: "0.1.2" }, { type: "update-cancelled" }] as UpdateEvent[]) {
      expect(run(restarting, event), event.type).toBe(restarting);
    }
  });

  test("a stopped restart keeps its update like ready does", () => {
    expect(run(restartAborted, { type: "check", manual: false })).toBe(restartAborted);
    expect(run(restartAborted, { type: "update-downloaded", version: "0.1.1" })).toBe(restartAborted);
    expect(run(restartAborted, error("offline"))).toBe(restartAborted);
    expect(run(restartAborted, error("installFailed"))).toEqual(failedInstall);
    expect(run(restartAborted, { type: "update-available", version: "0.1.2" })).toEqual({ kind: "downloading", version: "0.1.2", percent: 0 });
  });
});
