import type { SettledUpdateState, UpdateErrorCode, UpdateErrorSource, UpdateEvent, UpdateState } from "./types";

const settled = (state: UpdateState): state is SettledUpdateState => state.kind === "idle" || state.kind === "upToDate" || state.kind === "failed";
// The states that hold a downloaded update Restart to Update can install.
const installable = (state: UpdateState): state is Extract<UpdateState, { version: string }> =>
  state.kind === "ready" || state.kind === "restartAborted" || (state.kind === "failed" && state.stage === "install");

// An event a state does not use returns that same object, so the caller can tell nothing changed.
export function updateState(prev: UpdateState, event: UpdateEvent): UpdateState {
  switch (event.type) {
    case "check":
      if (settled(prev)) return { kind: "checking", manual: event.manual, last: prev };
      return prev.kind === "checking" && event.manual && !prev.manual ? { ...prev, manual: true } : prev;
    case "checking-for-update":
      return settled(prev) ? { kind: "checking", manual: false, last: prev } : prev;
    case "update-not-available":
      if (prev.kind === "checking") return { kind: "upToDate", manual: prev.manual };
      return settled(prev) ? { kind: "upToDate", manual: false } : prev;
    case "update-available":
      if (prev.kind === "restarting") return prev;
      if ((prev.kind === "downloading" || prev.kind === "ready" || prev.kind === "restartAborted") && prev.version === event.version) return prev;
      return { kind: "downloading", version: event.version, percent: 0 };
    case "download-progress": {
      if (prev.kind !== "downloading" || Number.isNaN(event.percent)) return prev;
      const percent = Math.min(100, Math.max(0, Math.floor(event.percent)));
      return percent === prev.percent ? prev : { ...prev, percent };
    }
    case "update-downloaded":
      if (prev.kind === "restarting") return prev;
      if ((prev.kind === "ready" || prev.kind === "restartAborted") && prev.version === event.version) return prev;
      return { kind: "ready", version: event.version };
    case "update-cancelled":
      return prev.kind === "downloading" ? { kind: "idle" } : prev;
    case "error":
      return failed(prev, event.code, event.source);
    case "install":
      if (installable(prev)) return { kind: "restarting", version: prev.version };
      // An automatic check after a failed install still shows that install's Restart to Update.
      return prev.kind === "checking" && installable(prev.last) ? { kind: "restarting", version: prev.last.version } : prev;
    // A hold, not a failure: the update waits ready, and the gate gives the reason.
    case "restart-held":
      return prev.kind === "restarting" ? { kind: "ready", version: prev.version } : prev;
    case "quit-cancelled":
      return prev.kind === "restarting" ? { kind: "restartAborted", version: prev.version } : prev;
  }
}

function failed(prev: UpdateState, code: UpdateErrorCode, source: UpdateErrorSource): UpdateState {
  switch (prev.kind) {
    // Automatic checks fail quietly: the row keeps what it showed.
    case "checking": return prev.manual ? { kind: "failed", code, stage: "check" } : prev.last;
    // A download is shown however it started.
    case "downloading": return { kind: "failed", code, stage: "download", version: prev.version };
    // Squirrel.Mac stages the update after electron-updater reports it downloaded, and quitAndInstall waits for that,
    // so a native error here means nothing is staged: download again, unless the install itself failed. An
    // electron-updater error here comes from a later check and must not take the update away.
    case "ready":
    case "restartAborted":
    case "restarting":
      if (source === "js") return prev;
      return { kind: "failed", code, stage: code === "installFailed" ? "install" : "download", version: prev.version };
    default: return prev;
  }
}
