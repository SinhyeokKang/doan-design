import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";
import type { InstallGate, UpdateEligibility, UpdateSnapshot } from "./types";
import type { Updater } from "./service";
import { CHECK_INTERVAL_MS } from "./schedule";

// electron-updater's MacUpdater and Electron's native autoUpdater, as electronUpdater wires them. The MacUpdater
// stand-in asks electron-updater's real GitHubProvider, over a fake GitHub, which release the feed offers, the way
// AppUpdater's checkForUpdates does through getUpdateInfoAndProvider.
const electron = vi.hoisted(() => ({
  native: undefined as unknown as import("node:events").EventEmitter,
  created: 0,
  // Newest first, as GitHub's releases.atom lists them; the stable ones are the releases a stable copy may take.
  releases: [] as string[],
  // Each request path the fake GitHub answered or refused.
  requests: [] as string[],
  offline: false,
}));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  electron.native = new EventEmitter();
  return { autoUpdater: electron.native };
});
vi.mock("electron-updater", async () => {
  const { GitHubProvider } = await import("electron-updater/out/providers/GitHubProvider");
  const BASE = "/SinhyeokKang/doan-design/releases";
  const respond = (path: string): string => {
    electron.requests.push(path);
    if (electron.offline) throw new Error("net::ERR_INTERNET_DISCONNECTED");
    if (path === `${BASE}.atom`) {
      const entries = electron.releases.map(version => `<entry><id>${version}</id><link rel="alternate" type="text/html" href="https://github.com${BASE}/tag/v${version}"/><title>${version}</title><content>No content.</content></entry>`);
      return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">${entries.join("")}</feed>`;
    }
    if (path === `${BASE}/latest`) {
      const stable = electron.releases.find(version => !version.includes("-"));
      if (stable === undefined) throw new Error("404 Not Found");
      return JSON.stringify({ tag_name: `v${stable}` });
    }
    // The release workflow publishes latest-mac.yml in every release, a release candidate's included.
    const yml = new RegExp(`^${BASE}/download/v([^/]+)/latest-mac\\.yml$`).exec(path)?.[1];
    if (yml === undefined || !electron.releases.includes(yml)) throw new Error("404 Not Found");
    return `version: ${yml}\nfiles:\n  - url: Doan-${yml}-arm64-mac.zip\n    sha512: x\n    size: 1\npath: Doan-${yml}-arm64-mac.zip\nsha512: x\nreleaseDate: '2026-11-08T00:00:00.000Z'\n`;
  };
  const executor = { request: async (options: { path?: string | null }) => respond(options.path ?? "") };
  class MacUpdater {
    allowPrerelease = false;
    channel: string | null = null;
    fullChangelog = false;
    currentVersion = "0.1.0";
    constructor() { electron.created++; }
    protected async getUpdateInfoAndProvider() {
      const provider = new GitHubProvider({ provider: "github", owner: "SinhyeokKang", repo: "doan-design" }, this as never, { executor: executor as never, platform: "darwin", isUseMultipleRangeRequest: false });
      return { info: await provider.getLatestVersion(), provider };
    }
    async checkForUpdates() { return { updateInfo: (await this.getUpdateInfoAndProvider()).info }; }
  }
  return { MacUpdater };
});

const { INSTALL_QUIT_WAIT_MS, RESTART_STAGE_WAIT_MS, UpdateService, electronUpdater, hasFeedConfig, releaseNotesUrl } = await import("./service");

// electron-updater's updater as the service drives it: events, the three calls, and the settings it sets.
class FakeUpdater extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  allowPrerelease = false;
  logger: { info(message: unknown): void; warn(message: unknown): void; error(message: unknown): void } | null = null;
  checkForUpdates = vi.fn(async (): Promise<{ downloadPromise?: Promise<unknown> | null } | null> => null);
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
    relaunch: vi.fn(),
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

  // With autoDownload, checkForUpdates' result carries the download, which rejects on its own when the download or
  // Squirrel's staging fails; the failure reaches the state as an error event.
  test("an automatic download that fails is never left as an unhandled rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const h = fixture();
      h.service.start();
      h.updater().emit("update-not-available", { version: "0.1.0" });
      h.updater().checkForUpdates.mockImplementationOnce(async () => ({ downloadPromise: Promise.reject(new Error("net::ERR_CONNECTION_RESET")) }));
      h.service.check();
      for (let i = 0; i < 5; i++) await new Promise<void>(resolve => { process.nextTick(resolve); });
      expect(unhandled).not.toHaveBeenCalled();
    } finally { process.off("unhandledRejection", unhandled); }
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

  // The press asked the gate, but a conversation can start during the staging wait; quitting then would stop it.
  test("a conversation that starts while Squirrel stages holds the restart: nothing quits and the update waits ready", () => {
    const h = fixture();
    ready(h, "0.2.0", { staged: false });
    expect(h.service.install()).toEqual(ALLOWED);
    h.setGate(BLOCKED);
    h.stage();
    expect(h.deps.quit).not.toHaveBeenCalled();
    expect(h.service.installPending).toBe(false);
    expect(h.state()).toEqual({ kind: "ready", version: "0.2.0" });
    expect(h.published.at(-1)?.gate).toEqual(BLOCKED);
    vi.advanceTimersByTime(RESTART_STAGE_WAIT_MS);
    expect(h.state()).toEqual({ kind: "ready", version: "0.2.0" });
    // Once it ends, a press restarts at once: the download is staged.
    h.setGate(ALLOWED);
    expect(h.service.install()).toEqual(ALLOWED);
    expect(h.deps.quit).toHaveBeenCalledOnce();
  });

  test("a conversation that starts while the cached download is staged again holds the restart too", () => {
    const h = fixture();
    ready(h, "0.2.0", { staged: false });
    h.updater().emit("error", native("SQRLUpdaterErrorDomain", 8));
    expect(h.service.install()).toEqual(ALLOWED);
    h.setGate(BLOCKED);
    h.updater().emit("update-downloaded", { version: "0.2.0" });
    h.stage();
    expect(h.deps.quit).not.toHaveBeenCalled();
    expect(h.state()).toEqual({ kind: "ready", version: "0.2.0" });
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

  // Restart still reopens Doan, on the old version; autoInstallOnAppQuit tries the update again on the next quit.
  test("an install that does not quit falls back after a wait to relaunching this version and quitting", () => {
    const h = fixture();
    ready(h);
    h.service.install();
    h.service.quitAndInstall();
    vi.advanceTimersByTime(INSTALL_QUIT_WAIT_MS - 1);
    expect(h.deps.quit).toHaveBeenCalledOnce();
    expect(h.deps.relaunch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.deps.relaunch).toHaveBeenCalledOnce();
    expect(h.deps.quit).toHaveBeenCalledTimes(2);
    expect(h.deps.relaunch.mock.invocationCallOrder[0]).toBeLessThan(h.deps.quit.mock.invocationCallOrder[1]!);
    expect(h.deps.log).toHaveBeenCalledWith(expect.stringContaining("relaunch"));
  });

  test("a native error after quitAndInstall quits at once, since main has already torn down", () => {
    const h = fixture();
    ready(h);
    h.service.install();
    h.service.quitAndInstall();
    h.updater().emit("error", native("SQRLUpdaterErrorDomain", 3, "No update available, can't quit and install"));
    expect(h.deps.relaunch).toHaveBeenCalledOnce();
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
  test("is read again once the current change is done when main says conversations changed, once per burst, and published only when it changes", async () => {
    const h = fixture();
    h.service.start();
    const count = h.published.length;
    h.service.conversationsChanged();
    await Promise.resolve();
    expect(h.published).toHaveLength(count);
    h.setGate(BLOCKED);
    const gate = vi.spyOn(h.deps, "gate");
    h.service.conversationsChanged();
    h.service.conversationsChanged();
    expect(h.service.snapshot().gate).toEqual(ALLOWED);
    await Promise.resolve();
    expect(gate).toHaveBeenCalledOnce();
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

// electron-updater only follows a prerelease copy's own channel ("rc" takes only rc tags), so the wiring also asks
// for the newest stable release and takes whichever is newer. A stable copy never asks for a prerelease.
describe("which release the feed offers", () => {
  beforeEach(() => { vi.useRealTimers(); electron.requests = []; electron.offline = false; });

  async function offered(version: string, releases: string[]) {
    electron.releases = releases;
    const updater = electronUpdater().createUpdater() as unknown as Updater & { currentVersion: string };
    updater.currentVersion = version;
    // As UpdateService.start sets it from the running version.
    updater.allowPrerelease = version.includes("-");
    const before = updater.allowPrerelease;
    const result = await updater.checkForUpdates() as unknown as { updateInfo: { version: string; tag: string } };
    expect(updater.allowPrerelease).toBe(before);
    return result.updateInfo;
  }

  test("a release candidate takes the stable release it led to", async () => {
    expect(await offered("0.1.0-rc.2", ["0.1.0", "0.1.0-rc.2", "0.1.0-rc.1"])).toMatchObject({ version: "0.1.0", tag: "v0.1.0" });
  });

  test("a release candidate takes the next release candidate", async () => {
    expect(await offered("0.1.1-rc.1", ["0.1.1-rc.2", "0.1.1-rc.1", "0.1.0"])).toMatchObject({ version: "0.1.1-rc.2", tag: "v0.1.1-rc.2" });
  });

  test("a release candidate takes the newer of a stable release and a release candidate", async () => {
    expect(await offered("0.1.1-rc.1", ["0.1.2-rc.1", "0.1.1", "0.1.1-rc.1"])).toMatchObject({ version: "0.1.2-rc.1" });
    expect(await offered("0.1.1-rc.1", ["0.1.1", "0.1.1-rc.2", "0.1.1-rc.1"])).toMatchObject({ version: "0.1.1" });
  });

  test("a release candidate still updates when the feed has no stable release, or no release candidate of its channel", async () => {
    expect(await offered("0.1.0-rc.1", ["0.1.0-rc.2", "0.1.0-rc.1"])).toMatchObject({ version: "0.1.0-rc.2" });
    expect(await offered("0.1.0-rc.2", ["0.1.1", "0.1.0"])).toMatchObject({ version: "0.1.1" });
  });

  test("a release candidate's failed check fails with electron-updater's error", async () => {
    electron.offline = true;
    await expect(offered("0.1.1-rc.1", ["0.1.1"])).rejects.toThrow(/INTERNET_DISCONNECTED/);
  });

  test("a stable copy never takes a prerelease and asks only for the stable release", async () => {
    expect(await offered("0.1.0", ["0.1.1-rc.1", "0.1.0"])).toMatchObject({ version: "0.1.0" });
    expect(electron.requests.filter(path => path.endsWith("/latest"))).toHaveLength(1);
  });
});

// Main tells the service on every conversation event and every end of a turn's work. The conversation service calls
// those before it has finished applying the change (a turn's end is published before the turn is marked ended; a send
// publishes turn.started before it is accepted), so the gate must be read after, from the real service.
describe("the gate follows the real conversation service", () => {
  beforeEach(() => { vi.useRealTimers(); });
  const prepared = { runtime: "codex" as const, configDir: "/profile", cwd: "/repo", sessionId: "same-session", command: "/fake", env: {} };
  const request = { root: "/repo", mode: "resume" as const, canvas: { path: ".doan/canvases/a.html" }, text: "hello", anchors: [] };
  const ask = { type: "permission.request" as const, requestId: "r1", tool: "Bash", summary: "ls", options: [{ id: "allow", label: "Allow", kind: "allow" as const }] };

  async function wired() {
    const { ConversationService } = await import("../conversation/service");
    const { ConversationStore } = await import("../conversation/store");
    const { installGate } = await import("./gate");
    const dir = mkdtempSync(join(tmpdir(), "doan-update-gate-"));
    onTestFinished(() => { rmSync(dir, { recursive: true, force: true }); });
    const open = vi.fn(async (input: { sessionId?: string }) => ({ sessionId: input.sessionId ?? "s", send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) }));
    const reads: { liveTurns: number; pendingAnswers: number }[] = [];
    let updates: InstanceType<typeof UpdateService> | undefined;
    const store = new ConversationStore(dir);
    const conversations = new ConversationService(store, vi.fn(async () => prepared), open as never, () => { updates?.conversationsChanged(); },
      undefined, undefined, undefined, undefined, undefined, undefined, () => { updates?.conversationsChanged(); });
    updates = new UpdateService({
      version: "0.1.0", eligibility: ENABLED, autoCheck: false, createUpdater: () => new FakeUpdater(), onStaged: () => {},
      gate: () => { const holds = conversations.restartHolds(); reads.push(holds); return installGate(holds); },
      publish: () => {}, quit: vi.fn(), relaunch: vi.fn(), log: vi.fn(), now: () => Date.now(),
    });
    const service = updates;
    const settle = async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); };
    return { conversations, store, reads, gate: () => service.snapshot().gate, settle };
  }

  test("a turn's end allows the restart, a follow-up send blocks it, and an answered request drops from the count", async () => {
    const w = await wired();
    const id = (await w.conversations.start(request)).conversationId;
    await w.settle();
    expect(w.gate()).toEqual(BLOCKED);
    w.conversations.receive(id, { type: "turn.done" });
    await w.settle();
    expect(w.gate()).toEqual(ALLOWED);
    await w.conversations.send(id, "again", []);
    await w.settle();
    expect(w.gate()).toEqual(BLOCKED);
    w.conversations.receive(id, ask);
    await w.settle();
    expect(w.reads.at(-1)).toEqual({ liveTurns: 1, pendingAnswers: 1 });
    w.conversations.receive(id, { type: "permission.resolved", requestId: "r1", optionId: "allow" });
    await w.settle();
    expect(w.reads.at(-1)).toEqual({ liveTurns: 1, pendingAnswers: 0 });
  });

  test("a turn whose history stopped taking writes allows the restart, though it publishes no event", async () => {
    const w = await wired();
    const id = (await w.conversations.start(request)).conversationId;
    await w.settle();
    expect(w.gate()).toEqual(BLOCKED);
    vi.spyOn(w.store, "append").mockImplementationOnce(() => { throw new Error("File exceeds limit"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    w.conversations.receive(id, { type: "activity", kind: "read", summary: "Read a.html" } as never);
    await w.settle();
    expect(w.gate()).toEqual(ALLOWED);
  });
});
