import { existsSync } from "node:fs";
import { join } from "node:path";
import { autoUpdater as nativeUpdater } from "electron";
import { MacUpdater } from "electron-updater";
import { updateErrorCode, updateErrorSource } from "./errorCode";
import { shouldCheck } from "./schedule";
import { updateState } from "./state";
import type { InstallGate, UpdateEligibility, UpdateEvent, UpdateSnapshot, UpdateState } from "./types";

export interface UpdaterLogger { info(message?: unknown): void; warn(message?: unknown): void; error(message?: unknown): void; debug?(message: string): void }
// The part of electron-updater's AppUpdater the service uses.
export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  logger: UpdaterLogger | null;
  // electron-updater's events as the service reads them; the payloads carry more than these fields.
  on(event: "checking-for-update" | "update-not-available" | "update-cancelled", listener: () => void): unknown;
  on(event: "update-available", listener: (info: { version: string }) => void): unknown;
  on(event: "update-downloaded", listener: (info: { version: string }) => void): unknown;
  on(event: "download-progress", listener: (progress: { percent: number }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}
export interface UpdateServiceDeps {
  version: string;
  eligibility: UpdateEligibility;
  autoCheck: boolean;
  createUpdater(): Updater;
  // Squirrel.Mac finished staging the download, after electron-updater already reported it downloaded.
  onStaged(listener: () => void): void;
  // D23, asked at each press and whenever main says conversations changed.
  gate(): InstallGate;
  publish(snapshot: UpdateSnapshot): void;
  // app.quit(): main's own quit, whose before-quit saves conversations and flushes state.
  quit(): void;
  log(message: string, detail?: unknown): void;
  now(): number;
}

// How often the automatic schedule is looked at; shouldCheck decides whether 6 hours have passed, so a Mac that slept
// through the due time checks soon after it wakes.
const TICK_MS = 10 * 60 * 1000;
// Squirrel.Mac unzips and verifies the download before it can install; a restart waits this long for it.
export const RESTART_STAGE_WAIT_MS = 60 * 1000;
// After main's quit has torn everything down, the app must end even when the install never quits it.
export const INSTALL_QUIT_WAIT_MS = 10 * 1000;

const RELEASE_PAGE = "https://github.com/SinhyeokKang/doan-design/releases/tag/v";
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$/;

// The release page of the update the row names; null without one or for a version that is not a plain semver.
export function releaseNotesUrl(snapshot: UpdateSnapshot): string | null {
  const { state } = snapshot;
  const version = "version" in state ? state.version : null;
  return version !== null && VERSION.test(version) ? `${RELEASE_PAGE}${version}` : null;
}

// Release builds carry app-update.yml beside the app's resources; tester and local packages do not.
export function hasFeedConfig(resources: string | undefined): boolean {
  return typeof resources === "string" && existsSync(join(resources, "app-update.yml"));
}

// MacUpdater directly rather than electron-updater's autoUpdater getter, so nothing is made until the service asks.
export function electronUpdater(): Pick<UpdateServiceDeps, "createUpdater" | "onStaged"> {
  return {
    createUpdater: () => new MacUpdater(),
    onStaged: listener => { nativeUpdater.on("update-downloaded", listener); },
  };
}

const prerelease = (version: string) => version.includes("-");

// Checks, downloads and Restart to Update (ARCHITECTURE §7). The renderer gets snapshots with fixed error codes only;
// every updater message goes to the main log.
export class UpdateService {
  private state: UpdateState = { kind: "idle" };
  private gateNow: InstallGate;
  private autoCheck: boolean;
  private lastCheckedAt: number | null = null;
  private lastAttemptAt: number | null = null;
  private updater: Updater | null = null;
  // Squirrel.Mac holds the current download staged, so quitAndInstall installs at once.
  private staged = false;
  // Staging failed, and Squirrel.Mac stages again only for a new download.
  private stagingFailed = false;
  // Restart to Update has started main's quit; its end installs instead of quitting.
  private pending = false;
  private installing = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: UpdateServiceDeps) {
    this.gateNow = deps.gate();
    this.autoCheck = deps.autoCheck;
  }

  get installPending(): boolean { return this.pending; }

  snapshot(): UpdateSnapshot {
    return { version: this.deps.version, state: this.state, eligibility: this.deps.eligibility, gate: this.gateNow, autoCheck: this.autoCheck, lastCheckedAt: this.lastCheckedAt };
  }

  start(): void {
    if (this.deps.eligibility.kind !== "enabled" || this.updater) return;
    const updater = this.deps.createUpdater();
    this.updater = updater;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    // D12: an rc copy follows rc releases; a stable copy never takes one.
    updater.allowPrerelease = prerelease(this.deps.version);
    const log = (level: string) => (message?: unknown) => { this.deps.log(`doan: update: ${level}: ${String(message)}`); };
    updater.logger = { info: log("info"), warn: log("warn"), error: log("error") };
    updater.on("checking-for-update", () => { this.apply({ type: "checking-for-update" }); });
    updater.on("update-available", info => { this.lastCheckedAt = this.deps.now(); this.apply({ type: "update-available", version: info.version }, true); });
    updater.on("update-not-available", () => { this.lastCheckedAt = this.deps.now(); this.apply({ type: "update-not-available" }, true); });
    updater.on("download-progress", progress => { this.apply({ type: "download-progress", percent: progress.percent }); });
    updater.on("update-downloaded", info => {
      // Squirrel.Mac stages this download next; what it staged before is not this one.
      this.staged = false;
      this.stagingFailed = false;
      this.apply({ type: "update-downloaded", version: info.version });
    });
    updater.on("update-cancelled", () => { this.apply({ type: "update-cancelled" }); });
    updater.on("error", error => { this.failed(error); });
    this.deps.onStaged(() => { this.stagedNow(); });
    this.tick();
    setInterval(() => { this.tick(); }, TICK_MS).unref();
  }

  // About's button, the menu item and Retry: whatever the automatic-check setting says.
  check(): void {
    this.startCheck(true);
  }

  setAutoCheck(on: boolean): void {
    if (on === this.autoCheck) return;
    this.autoCheck = on;
    this.deps.publish(this.snapshot());
    this.tick();
  }

  refreshGate(): void {
    const gate = this.deps.gate();
    if (gate.kind === this.gateNow.kind) return;
    this.gateNow = gate;
    this.deps.publish(this.snapshot());
  }

  // Restart to Update. null when there is nothing to install. The gate is asked now, not taken from the snapshot: a
  // turn can start between the snapshot and the press (POSTMORTEM 2026-10-25 'A toast's Open was dropped…').
  install(): InstallGate | null {
    if (!this.updater || this.pending) return null;
    const next = updateState(this.state, { type: "install" });
    if (next === this.state) return null;
    const gate = this.deps.gate();
    if (gate.kind !== this.gateNow.kind) { this.gateNow = gate; this.deps.publish(this.snapshot()); }
    if (gate.kind === "blocked") return gate;
    this.setState(next);
    if (this.staged) { this.beginQuit(); return gate; }
    // Wait for Squirrel.Mac before tearing anything down: a quit that cannot install would leave a stopped app.
    this.arm(RESTART_STAGE_WAIT_MS, () => {
      this.deps.log("doan: update: the download was not staged in time; the restart stopped");
      this.apply({ type: "quit-cancelled" });
    });
    if (this.stagingFailed) {
      // The download is cached, so this reads no network; its errors arrive as error events.
      this.stagingFailed = false;
      this.updater.downloadUpdate().catch(() => {});
    }
    return gate;
  }

  // The end of main's quit, after conversations are saved and state is flushed.
  quitAndInstall(): void {
    if (!this.updater) { this.deps.quit(); return; }
    this.installing = true;
    this.arm(INSTALL_QUIT_WAIT_MS, () => { this.fallBack("the install did not quit Doan"); });
    this.updater.quitAndInstall();
  }

  // A conversation's save cancelled main's quit: nothing installs, and the update waits for the next press or quit.
  quitCancelled(): void {
    if (!this.pending) return;
    this.pending = false;
    this.apply({ type: "quit-cancelled" });
  }

  private tick(): void {
    if (shouldCheck({ autoCheck: this.autoCheck, lastAttemptAt: this.lastAttemptAt, now: this.deps.now() })) this.startCheck(false);
  }

  private startCheck(manual: boolean): void {
    const updater = this.updater;
    if (!updater) return;
    const before = this.state;
    this.apply({ type: "check", manual });
    // A check already running was upgraded to manual by the state machine, and one while an update downloads or waits
    // is ignored: neither asks the updater again.
    if (this.state.kind !== "checking" || before.kind === "checking") return;
    this.lastAttemptAt = this.deps.now();
    // A failure also arrives as an error event, which is where it is handled.
    updater.checkForUpdates().catch(() => {});
  }

  private failed(error: Error): void {
    const source = updateErrorSource(error);
    this.deps.log("doan: update: error", error);
    if (source === "native" && !this.staged) this.stagingFailed = true;
    if (this.installing) { this.fallBack("the install failed"); return; }
    const waiting = this.state.kind === "restarting" && !this.pending;
    this.apply({ type: "error", code: updateErrorCode(error), source });
    if (waiting && this.state.kind !== "restarting") this.disarm();
  }

  private stagedNow(): void {
    this.staged = true;
    this.stagingFailed = false;
    if (this.state.kind === "restarting" && !this.pending) this.beginQuit();
  }

  private beginQuit(): void {
    this.disarm();
    this.pending = true;
    this.deps.quit();
  }

  // Main has torn down conversations, sign-ins and state, so the app ends with a plain quit rather than staying.
  private fallBack(reason: string): void {
    this.disarm();
    this.installing = false;
    this.deps.log(`doan: update: ${reason}; quitting without it`);
    this.deps.quit();
  }

  private arm(ms: number, fire: () => void): void {
    this.disarm();
    this.timer = setTimeout(() => { this.timer = undefined; fire(); }, ms);
  }

  private disarm(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private apply(event: UpdateEvent, answered = false): void {
    const next = updateState(this.state, event);
    if (next !== this.state) this.setState(next);
    else if (answered) this.deps.publish(this.snapshot());
  }

  private setState(next: UpdateState): void {
    this.state = next;
    this.deps.publish(this.snapshot());
  }
}
