import type { Ineligible } from "../agentSetup/notice";

// The update shapes main sends the renderer. The renderer imports this module, so it holds types and constants only:
// no validator, no Node built-in, no Electron (rendererImports.test.ts).

// The only failure detail the renderer gets; the updater's own message stays in the main log.
export const UPDATE_ERROR_CODES = ["offline", "feedMissing", "rateLimited", "signatureMismatch", "checksumMismatch", "diskFull", "installFailed", "other"] as const;
export type UpdateErrorCode = typeof UPDATE_ERROR_CODES[number];
export type UpdateErrorSource = "native" | "js";

// Agent setup's reasons, plus noFeed: a build without `app-update.yml` (a tester or local package).
export type UpdateDisabledReason = Ineligible | "noFeed";
export type UpdateEligibility = { kind: "enabled" } | { kind: "disabled"; reason: UpdateDisabledReason };
export type InstallGate = { kind: "allowed" } | { kind: "blocked"; reason: "conversation" };

// `version` is known once the updater announced it, so a failed check has none.
export type UpdateFailure =
  | { kind: "failed"; code: UpdateErrorCode; stage: "check" }
  | { kind: "failed"; code: UpdateErrorCode; stage: "download" | "install"; version: string };
// What a check returns to when it fails quietly. `manual`: a person asked, so the result is announced.
export type SettledUpdateState = { kind: "idle" } | { kind: "upToDate"; manual: boolean } | UpdateFailure;
export type UpdateState =
  | SettledUpdateState
  | { kind: "checking"; manual: boolean; last: SettledUpdateState }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "ready"; version: string }
  | { kind: "restarting"; version: string }
  | { kind: "restartAborted"; version: string };

// electron-updater's events, and the app's: a check starting (`manual` when a person asked), the restart the gate
// allowed, and the quit a conversation's save cancelled. An error's `source` is `native` when Electron's autoUpdater
// (Squirrel.Mac) raised it, which after the download means staging or installing failed, and `js` when
// electron-updater did (updateErrorSource).
export type UpdateEvent =
  | { type: "check"; manual: boolean }
  | { type: "checking-for-update" }
  | { type: "update-available"; version: string }
  | { type: "update-not-available" }
  | { type: "download-progress"; percent: number }
  | { type: "update-downloaded"; version: string }
  | { type: "update-cancelled" }
  | { type: "error"; code: UpdateErrorCode; source: UpdateErrorSource }
  | { type: "install" }
  | { type: "quit-cancelled" };

// `version` is the running Doan's. `lastCheckedAt` (ms since the epoch) is the last check that got an answer; it
// lives in memory only.
export interface UpdateSnapshot {
  version: string;
  state: UpdateState;
  eligibility: UpdateEligibility;
  gate: InstallGate;
  autoCheck: boolean;
  lastCheckedAt: number | null;
}
