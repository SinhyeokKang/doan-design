import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { InstallGate, UpdateEligibility, UpdateSnapshot } from "./types";
import { CHECK_INTERVAL_MS } from "./schedule";

// electron-updater's MacUpdater and Electron's native autoUpdater, as electronUpdater wires them.
const electron = vi.hoisted(() => ({ native: undefined as unknown as import("node:events").EventEmitter, created: 0 }));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  electron.native = new EventEmitter();
  return { autoUpdater: electron.native };
});
vi.mock("electron-updater", () => ({ MacUpdater: class { constructor() { electron.created++; } } }));

const { INSTALL_QUIT_WAIT_MS, RESTART_STAGE_WAIT_MS, UpdateService, electronUpdater, hasFeedConfig, releaseNotesUrl } = await import("./service");

// electron-updater's updater as the service drives it: events, the three calls, and the settings it sets.
class FakeUpdater extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  allowPrerelease = false;
  logger: { info(message: unknown): void; warn(message: unknown): void; error(message: unknown): void } | null = null;
  checkForUpdates = vi.fn(async (): Promise<unknown> => null);
  downloadUpdate = vi.fn(async (): Promise<unknown> => []);
  quitAndInstall = vi.fn();
}

const ENABLED: UpdateEligibility = { kind: "enabled" };
const ALLOWED: InstallGate = { kind: "allowed" };
const BLOCKED: InstallGate = { kind: "blocked", reason: "conversation" };
// An NSError from Squirrel.Mac as Electron hands it over: its domain marks it native.
const native = (domain: string, code: number, message = "Squirrel failed") => Object.assign(new Error(message), { domain, code });

function fixture(options: { version?: string; eligibility?: UpdateEligibility; autoCheck?: boolean } = {}) {
  const updaters: FakeUpdater[] = [];
  const staged = new EventEmitter();
  let gate: InstallGate = ALLOWED;
  const published: UpdateSnapshot[] = [];
  const deps = {
    version: options.version ?? "0.1.0",
    eligibility: options.eligibility ?? ENABLED,
    autoCheck: options.autoCheck ?? true,
    createUpdater: vi.fn(() => { const updater = new FakeUpdater(); updaters.push(updater); return updater; }),
    onStaged: (listener: () => void) => { staged.on("staged", listener); },
    gate: () => gate,
    publish: vi.fn((snapshot: UpdateSnapshot) => { published.push(snapshot); }),
    quit: vi.fn(),
    log: vi.fn(),
    now: () => Date.now(),
  };
  const service = new UpdateService(deps);
  return {
    service, deps, published,
    updater: () => { const updater = updaters[0]; if (!updater) throw new Error("no updater"); return updater; },
    stage: () => { staged.emit("staged"); },
    setGate: (next: InstallGate) => { gate = next; },
    state: () => service.snapshot().state,
  };
}
type Fixture = ReturnType<typeof fixture>;

// Started, its launch check answered, the update downloaded and (unless `staged: false`) staged by Squirrel.Mac.
function ready(h: Fixture, version = "0.2.0", options: { staged?: boolean } = {}) {
  h.service.start();
  h.updater().emit("checking-for-update");
  h.updater().emit("update-available", { version });
  h.updater().emit("update-downloaded", { version });
  if (options.staged !== false) h.stage();
  expect(h.state()).toEqual({ kind: "ready", version });
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 10, 8, 14, 0) });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a copy that doesn't update", () => {
  test.each<UpdateEligibility>([{ kind: "disabled", reason: "dev" }, { kind: "disabled", reason: "noFeed" }, { kind: "disabled", reason: "outside-applications" }])("never creates an updater or checks: %o", eligibility => {
    const h = fixture({ eligibility });
    h.service.start();
    h.service.check();
    vi.advanceTimersByTime(2 * CHECK_INTERVAL_MS);
    expect(h.deps.createUpdater).not.toHaveBeenCalled();
    expect(h.service.install()).toBeNull();
    expect(h.deps.quit).not.toHaveBeenCalled();
    expect(h.service.snapshot()).toEqual({ version: "0.1.0", state: { kind: "idle" }, eligibility, gate: ALLOWED, autoCheck: true, lastCheckedAt: null });
  });
});

describe("the updater", () => {
  test("is created once, downloads in the background and installs on quit", () => {
    const h = fixture();
    h.service.start();
    expect(h.deps.createUpdater).toHaveBeenCalledOnce();
    expect(h.updater()).toMatchObject({ autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: false });
  });

  test("takes prereleases only when this version is one", () => {
    const h = fixture({ version: "0.1.0-rc.1" });
    h.service.start();
    expect(h.updater().allowPrerelease).toBe(true);
  });

  test("logs to the main log, not to the renderer", () => {
    const h = fixture();
    h.service.start();
    h.updater().logger?.info("Checking for update");
    h.updater().logger?.error("boom");
    expect(h.deps.log).toHaveBeenCalledWith(expect.stringContaining("Checking for update"));
    expect(h.deps.log).toHaveBeenCalledWith(expect.stringContaining("boom"));
    expect(JSON.stringify(h.published)).not.toContain("boom");
  });
});

describe("checking", () => {
  test("an automatic check runs at launch and every 6 hours while automatic checks are on", () => {
    const h = fixture();
    h.service.start();
    expect(h.updater().checkForUpdates).toHaveBeenCalledOnce();
    expect(h.state()).toEqual({ kind: "checking", manual: false, last: { kind: "idle" } });
    h.updater().emit("update-not-available", { version: "0.1.0" });
    vi.advanceTimersByTime(CHECK_INTERVAL_MS - 60_000);
    expect(h.updater().checkForUpdates).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60_000);
    expect(h.updater().checkForUpdates).toHaveBeenCalledTimes(2);
  });

  test("with automatic checks off nothing checks on its own, and turning them on checks when one is due", () => {
    const h = fixture({ autoCheck: false });
    h.service.start();
    vi.advanceTimersByTime(2 * CHECK_INTERVAL_MS);
    expect(h.deps.createUpdater).toHaveBeenCalledOnce();
    expect(h.updater().checkForUpdates).not.toHaveBeenCalled();
    h.service.setAutoCheck(true);
    expect(h.updater().checkForUpdates).toHaveBeenCalledOnce();
    expect(h.service.snapshot().autoCheck).toBe(true);
  });

  test("turning automatic checks off stops the next one and is published", () => {
    const h = fixture();
    h.service.start();
    h.updater().emit("update-not-available", { version: "0.1.0" });
    h.service.setAutoCheck(false);
    expect(h.published.at(-1)?.autoCheck).toBe(false);
    vi.advanceTimersByTime(2 * CHECK_INTERVAL_MS);
    expect(h.updater().checkForUpdates).toHaveBeenCalledOnce();
  });

  test("a manual check runs whatever the setting and is announced as manual", () => {
    const h = fixture({ autoCheck: false });
    h.service.start();
    h.service.check();
    expect(h.updater().checkForUpdates).toHaveBeenCalledOnce();
    expect(h.state()).toEqual({ kind: "checking", manual: true, last: { kind: "idle" } });
  });

  test("a manual check during an automatic one becomes manual without a second updater check", () => {
    const h = fixture();
    h.service.start();
    h.service.check();
    expect(h.updater().checkForUpdates).toHaveBeenCalledOnce();
    expect(h.state()).toMatchObject({ kind: "checking", manual: true });
  });

  test("a check while an update downloads or waits starts nothing", () => {
    const h = fixture();
    ready(h);
    h.service.check();
    expect(h.updater().checkForUpdates).toHaveBeenCalledOnce();
  });

  test("an answered check records when; a failed one does not", () => {
    const h = fixture();
    h.service.start();
    h.updater().emit("update-not-available", { version: "0.1.0" });
    const answered = Date.now();
    expect(h.service.snapshot().lastCheckedAt).toBe(answered);
    vi.advanceTimersByTime(60_000);
    h.service.check();
    h.updater().emit("error", Object.assign(new Error("net::ERR_INTERNET_DISCONNECTED"), {}));
    expect(h.state()).toEqual({ kind: "failed", code: "offline", stage: "check" });
    expect(h.service.snapshot().lastCheckedAt).toBe(answered);
  });

  test("an update's arrival is an answer, and its download and readiness follow the updater", () => {
    const h = fixture();
    h.service.start();
    h.updater().emit("update-available", { version: "0.2.0" });
    expect(h.service.snapshot().lastCheckedAt).toBe(Date.now());
    h.updater().emit("download-progress", { percent: 41.7 });
    expect(h.state()).toEqual({ kind: "downloading", version: "0.2.0", percent: 41 });
    h.updater().emit("update-downloaded", { version: "0.2.0" });
    expect(h.state()).toEqual({ kind: "ready", version: "0.2.0" });
  });

  test("a rejected updater call is handled through its error event, never left unhandled", async () => {
    const h = fixture();
    h.service.start();
    h.updater().checkForUpdates.mockRejectedValueOnce(new Error("net::ERR_INTERNET_DISCONNECTED"));
    h.updater().emit("update-not-available", { version: "0.1.0" });
    h.service.check();
    await vi.runAllTicks();
    await Promise.resolve();
    expect(h.updater().checkForUpdates).toHaveBeenCalledTimes(2);
  });

  test("publishes a change once and nothing for an event that changes nothing", () => {
    const h = fixture();
    h.service.start();
    const count = h.published.length;
    h.updater().emit("checking-for-update");
    expect(h.published).toHaveLength(count);
    h.updater().emit("update-not-available", { version: "0.1.0" });
    expect(h.published).toHaveLength(count + 1);
    expect(h.published.at(-1)).toEqual(h.service.snapshot());
  });
});

describe("errors", () => {
  test("every error is logged in full and reaches the snapshot only as a code, its source read from the error", () => {
    const h = fixture();
    ready(h);
    // electron-updater's own error after the download (a later check) keeps the update.
    h.updater().emit("error", Object.assign(new Error("HttpError: 404 /secret/path"), { code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND" }));
    expect(h.state()).toEqual({ kind: "ready", version: "0.2.0" });
    // Squirrel refusing a read-only volume while staging is an install failure.
    const readOnly = native("SQRLUpdaterErrorDomain", 8, "/secret/Doan.app is on a read-only volume");
    h.updater().emit("error", readOnly);
    expect(h.state()).toEqual({ kind: "failed", code: "installFailed", stage: "install", version: "0.2.0" });
    expect(h.deps.log).toHaveBeenCalledWith(expect.any(String), readOnly);
    expect(JSON.stringify(h.published)).not.toContain("secret");
  });
});

describe("Restart to Update", () => {
  test("nothing to install answers null and quits nothing", () => {
    const h = fixture();
    h.service.start();
    expect(h.service.install()).toBeNull();
    expect(h.deps.quit).not.toHaveBeenCalled();
    expect(h.service.installPending).toBe(false);
  });

  test("a conversation still running blocks the press, asked at the press, and the snapshot carries it", () => {
    const h = fixture();
    ready(h);
    h.setGate(BLOCKED);
    expect(h.service.install()).toEqual(BLOCKED);
    expect(h.deps.quit).not.toHaveBeenCalled();
    expect(h.state()).toEqual({ kind: "ready", version: "0.2.0" });
    expect(h.published.at(-1)?.gate).toEqual(BLOCKED);
  });

  test("a staged update restarts: the state says so and main's quit starts with the install pending", () => {
    const h = fixture();
    ready(h);
    expect(h.service.install()).toEqual(ALLOWED);
    expect(h.state()).toEqual({ kind: "restarting", version: "0.2.0" });
    expect(h.service.installPending).toBe(true);
    expect(h.deps.quit).toHaveBeenCalledOnce();
    expect(h.updater().quitAndInstall).not.toHaveBeenCalled();
  });

  test("an update Squirrel is still staging waits for it before quitting", () => {
    const h = fixture();
    ready(h, "0.2.0", { staged: false });
    expect(h.service.install()).toEqual(ALLOWED);
    expect(h.state()).toEqual({ kind: "restarting", version: "0.2.0" });
    expect(h.deps.quit).not.toHaveBeenCalled();
    expect(h.service.installPending).toBe(false);
    h.stage();
    expect(h.deps.quit).toHaveBeenCalledOnce();
    expect(h.service.installPending).toBe(true);
  });

  test("staging that never finishes stops the restart instead of waiting forever, and nothing quits later", () => {
    const h = fixture();
    ready(h, "0.2.0", { staged: false });
    h.service.install();
    vi.advanceTimersByTime(RESTART_STAGE_WAIT_MS);
    expect(h.state()).toEqual({ kind: "restartAborted", version: "0.2.0" });
    expect(h.deps.quit).not.toHaveBeenCalled();
    h.stage();
    expect(h.deps.quit).not.toHaveBeenCalled();
  });

  test("staging that fails while waiting keeps the app open with the failure", () => {
    const h = fixture();
    ready(h, "0.2.0", { staged: false });
    h.service.install();
    h.updater().emit("error", native("SQRLUpdaterErrorDomain", 8));
    expect(h.state()).toEqual({ kind: "failed", code: "installFailed", stage: "install", version: "0.2.0" });
    vi.advanceTimersByTime(RESTART_STAGE_WAIT_MS);
    expect(h.state()).toEqual({ kind: "failed", code: "installFailed", stage: "install", version: "0.2.0" });
    expect(h.deps.quit).not.toHaveBeenCalled();
  });

  // Squirrel stages once per download, so after a staging failure only a new download stages again; the downloaded
  // file is cached, so this reads no network.
  test("a press after a staging failure stages the cached download again before quitting", () => {
    const h = fixture();
    ready(h, "0.2.0", { staged: false });
    h.updater().emit("error", native("SQRLUpdaterErrorDomain", 8));
    expect(h.service.install()).toEqual(ALLOWED);
    expect(h.updater().downloadUpdate).toHaveBeenCalledOnce();
    expect(h.state()).toEqual({ kind: "restarting", version: "0.2.0" });
    expect(h.deps.quit).not.toHaveBeenCalled();
    h.updater().emit("update-downloaded", { version: "0.2.0" });
    h.stage();
    expect(h.deps.quit).toHaveBeenCalledOnce();
  });

  test("a press while Squirrel is still staging does not start another download", () => {
    const h = fixture();
    ready(h, "0.2.0", { staged: false });
    h.service.install();
    expect(h.updater().downloadUpdate).not.toHaveBeenCalled();
  });

  test("quitAndInstall hands over to the updater once main's quit is done", () => {
    const h = fixture();
    ready(h);
    h.service.install();
    h.service.quitAndInstall();
    expect(h.updater().quitAndInstall).toHaveBeenCalledOnce();
  });

  test("an install that does not quit falls back to a plain quit after a wait", () => {
    const h = fixture();
    ready(h);
    h.service.install();
    h.service.quitAndInstall();
    vi.advanceTimersByTime(INSTALL_QUIT_WAIT_MS - 1);
    expect(h.deps.quit).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(h.deps.quit).toHaveBeenCalledTimes(2);
  });

  test("a native error after quitAndInstall quits at once, since main has already torn down", () => {
    const h = fixture();
    ready(h);
    h.service.install();
    h.service.quitAndInstall();
    h.updater().emit("error", native("SQRLUpdaterErrorDomain", 3, "No update available, can't quit and install"));
    expect(h.deps.quit).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(INSTALL_QUIT_WAIT_MS);
    expect(h.deps.quit).toHaveBeenCalledTimes(2);
  });

  test("a quit a conversation's save cancelled leaves the update ready to restart again", () => {
    const h = fixture();
    ready(h);
    h.service.install();
    h.service.quitCancelled();
    expect(h.state()).toEqual({ kind: "restartAborted", version: "0.2.0" });
    expect(h.service.installPending).toBe(false);
    expect(h.service.install()).toEqual(ALLOWED);
    expect(h.deps.quit).toHaveBeenCalledTimes(2);
  });

  test("a cancelled quit that was not a restart changes nothing", () => {
    const h = fixture();
    ready(h);
    h.service.quitCancelled();
    expect(h.state()).toEqual({ kind: "ready", version: "0.2.0" });
  });
});

describe("the gate in the snapshot", () => {
  test("is read again when main says conversations changed, and published only when it changes", () => {
    const h = fixture();
    h.service.start();
    const count = h.published.length;
    h.service.refreshGate();
    expect(h.published).toHaveLength(count);
    h.setGate(BLOCKED);
    h.service.refreshGate();
    expect(h.published).toHaveLength(count + 1);
    expect(h.service.snapshot().gate).toEqual(BLOCKED);
  });
});

describe("release notes", () => {
  const snapshot = (state: UpdateSnapshot["state"]): UpdateSnapshot => ({ version: "0.1.0", state, eligibility: ENABLED, gate: ALLOWED, autoCheck: true, lastCheckedAt: null });
  test("open the release page of the update the row names", () => {
    expect(releaseNotesUrl(snapshot({ kind: "ready", version: "0.2.0" }))).toBe("https://github.com/SinhyeokKang/doan-design/releases/tag/v0.2.0");
    expect(releaseNotesUrl(snapshot({ kind: "restartAborted", version: "0.2.0-rc.2" }))).toBe("https://github.com/SinhyeokKang/doan-design/releases/tag/v0.2.0-rc.2");
    expect(releaseNotesUrl(snapshot({ kind: "failed", code: "other", stage: "download", version: "0.2.0" }))).toBe("https://github.com/SinhyeokKang/doan-design/releases/tag/v0.2.0");
  });
  test("are not opened without an update, or for a version that is not one", () => {
    expect(releaseNotesUrl(snapshot({ kind: "idle" }))).toBeNull();
    expect(releaseNotesUrl(snapshot({ kind: "failed", code: "offline", stage: "check" }))).toBeNull();
    for (const version of ["0.2.0/../../evil", "../0.2.0", "0.2.0?x=1", "0.2", "v0.2.0", "0.2.0 ", ""]) expect(releaseNotesUrl(snapshot({ kind: "ready", version })), version).toBeNull();
  });
});

describe("Electron wiring", () => {
  test("the updater is electron-updater's MacUpdater, made only when asked, and staging is Electron's native update-downloaded", () => {
    const wiring = electronUpdater();
    expect(electron.created).toBe(0);
    wiring.createUpdater();
    expect(electron.created).toBe(1);
    const staged = vi.fn();
    wiring.onStaged(staged);
    electron.native.emit("update-downloaded");
    expect(staged).toHaveBeenCalledOnce();
  });

  test("the feed is the bundle's app-update.yml", () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-feed-"));
    try {
      expect(hasFeedConfig(dir)).toBe(false);
      writeFileSync(join(dir, "app-update.yml"), "provider: github\n");
      expect(hasFeedConfig(dir)).toBe(true);
      expect(hasFeedConfig(undefined)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
