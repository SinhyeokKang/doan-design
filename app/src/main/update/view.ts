import type { SettledUpdateState, UpdateErrorCode, UpdateSnapshot, UpdateState } from "./types";

// What Settings > About's Version row, the automatic-check row, the header button and the Doan menu item show
// (PRODUCT §5 item 0 'About'). The renderer imports this module, so it may import only types and other modules
// like it: no validator, no Node built-in, no Electron (rendererImports.test.ts).

// `action` is what a press asks main for: a manual check, Restart to Update, or the release page. Retry is a manual
// check, named for what it repeats.
export interface UpdateButton { action: "check" | "restart" | "notes"; label: string; ariaLabel?: string; prominent: boolean }
export interface UpdateNotice { title: string; text: string }
// `busy` is the spinner's label in place of the buttons; `progress` the download's whole percent. `notice` is the
// reason Restart to Update cannot run now, `error` the line under the row. `announcement` is what the page's live
// region reads when it changes; null for states nobody asked about (progress, an automatic check's answer).
export interface UpdateRowView {
  description: string;
  actions: UpdateButton[];
  busy: string | null;
  progress: number | null;
  notice: UpdateNotice | null;
  error: string | null;
  announcement: string | null;
}
export interface UpdateAutoCheckView { label: string; description: string; checked: boolean }
// The header button, shown while a downloaded update waits for Restart to Update. `popover` is what a press opens
// instead of restarting; null when a press restarts.
export interface UpdateHeaderView { label: string; busy: boolean; tooltip: string; popover: UpdateNotice | null }
// openAbout: a copy that doesn't update, where the item only opens About. check: opens About and checks.
export interface UpdateMenuView { label: string; action: "check" | "openAbout" | "restart"; enabled: boolean }
export interface UpdateView { row: UpdateRowView; autoCheck: UpdateAutoCheckView | null; header: UpdateHeaderView | null; menu: UpdateMenuView }

const AUTO_CHECK_LABEL = "Check for updates automatically";
const AUTO_CHECK_DESCRIPTION = "Checks GitHub when Doan opens and every 6 hours, and downloads in the background. When off, a downloaded update still installs when you quit.";

const BLOCKED: UpdateNotice = { title: "Can’t restart yet", text: "A conversation is running or waiting for your answer. Restart after it finishes, or Doan updates when you quit." };
const STOPPED: UpdateNotice = { title: "Couldn’t restart Doan.", text: "Try again, or quit and open it again." };
const STOPPED_LINE = `${STOPPED.title} ${STOPPED.text}`;
// The line under a failed row says why only as far as the code knows, and how to recover.
const ERROR_LINES: Record<UpdateErrorCode, string> = {
  offline: "Couldn’t reach GitHub. Check your internet connection, then try again.",
  feedMissing: "The latest release on GitHub doesn’t include update information. Check again later.",
  rateLimited: "GitHub is limiting requests from this network. Try again later.",
  signatureMismatch: "The download isn’t signed by the same developer as this copy of Doan, so it won’t be installed. Check again later.",
  checksumMismatch: "The download didn’t match the published file. Try again.",
  diskFull: "There isn’t enough disk space. Free up some space, then try again.",
  installFailed: "Doan couldn’t replace the app in the Applications folder. Try again, or ask an administrator if your account can’t change apps there.",
  other: "Try again. If it keeps happening, use Copy details to report the problem.",
};
const NO_FEED = "This copy doesn’t update. Tester and locally packaged builds don’t check for updates. To get updates, install Doan from GitHub Releases.";
// Agent setup's About notice already gives the reason for these copies.
const DOESNT_UPDATE = "This copy doesn’t update.";

const CHECK: UpdateButton = { action: "check", label: "Check for Updates", prominent: false };
const NOTES: UpdateButton = { action: "notes", label: "Release Notes ↗", prominent: false };
// The About page's one filled button.
const RESTART: UpdateButton = { action: "restart", label: "Restart to Update", prominent: true };
const MENU_CHECK: UpdateMenuView = { label: "Check for Updates…", action: "check", enabled: true };
const MENU_RESTART: UpdateMenuView = { label: "Restart to Update", action: "restart", enabled: true };

const EMPTY_ROW: Omit<UpdateRowView, "description"> = { actions: [], busy: null, progress: null, notice: null, error: null, announcement: null };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "today at 2:41 PM" or "Nov 6 at 2:41 PM", in local time. Written out rather than through Intl, whose en-US time
// puts a narrow no-break space before PM in recent ICU.
function when(at: number, now: number): string {
  const date = new Date(at), today = new Date(now);
  const hours = date.getHours();
  const time = `${hours % 12 === 0 ? 12 : hours % 12}:${String(date.getMinutes()).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  const sameDay = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  return `${sameDay ? "today" : `${MONTHS[date.getMonth()]} ${date.getDate()}`} at ${time}`;
}

function failureTitle(state: Extract<UpdateState, { kind: "failed" }>): string {
  switch (state.stage) {
    case "check": return "Couldn’t check for updates.";
    case "download": return `Couldn’t download Doan ${state.version}.`;
    case "install": return `Couldn’t install Doan ${state.version}.`;
  }
}

function settledRow(state: SettledUpdateState, snapshot: UpdateSnapshot, now: number): UpdateRowView {
  const withVersion = (text: string) => `${snapshot.version} · ${text}`;
  switch (state.kind) {
    case "idle":
      return { ...EMPTY_ROW, description: !snapshot.autoCheck && snapshot.lastCheckedAt === null ? withVersion("Not checked yet") : snapshot.version, actions: [CHECK] };
    case "upToDate":
      return {
        ...EMPTY_ROW,
        description: withVersion(snapshot.lastCheckedAt === null ? "Up to date" : `Up to date, last checked ${when(snapshot.lastCheckedAt, now)}`),
        actions: [CHECK],
        announcement: state.manual ? "Doan is up to date." : null,
      };
    case "failed": {
      const title = failureTitle(state);
      const line = ERROR_LINES[state.code];
      const actions = state.stage === "check" ? [{ ...CHECK, label: "Retry", ariaLabel: "Check for updates again" }]
        : state.stage === "download" ? [NOTES, { ...CHECK, label: "Retry", ariaLabel: `Download Doan ${state.version} again` }]
        : [NOTES, RESTART];
      const notice = state.stage === "install" && snapshot.gate.kind === "blocked" ? BLOCKED : null;
      return { ...EMPTY_ROW, description: withVersion(title), actions, notice, error: line, announcement: `${title} ${line}` };
    }
  }
}

function row(snapshot: UpdateSnapshot, now: number): UpdateRowView {
  const { state, version } = snapshot;
  const blocked = snapshot.gate.kind === "blocked";
  switch (state.kind) {
    case "idle":
    case "upToDate":
    case "failed":
      return settledRow(state, snapshot, now);
    case "checking": {
      const last = settledRow(state.last, snapshot, now);
      // An automatic check is quiet, so its failure can go back to this row unchanged.
      return state.manual ? { ...EMPTY_ROW, description: last.description, busy: "Checking for updates" } : last;
    }
    case "downloading":
      return { ...EMPTY_ROW, description: `${version} · Downloading Doan ${state.version}`, progress: state.percent };
    case "ready":
      // The announcement ignores the gate: a turn starting or ending is not news to read. The page reads the notice
      // when a press is answered blocked.
      return blocked
        ? { ...EMPTY_ROW, description: `${version} · Doan ${state.version} is ready.`, actions: [NOTES, RESTART], notice: BLOCKED, announcement: `Doan ${state.version} is ready.` }
        : { ...EMPTY_ROW, description: `${version} · Doan ${state.version} is ready. Restart now, or Doan installs it when you quit.`, actions: [NOTES, RESTART], announcement: `Doan ${state.version} is ready.` };
    case "restarting":
      return { ...EMPTY_ROW, description: `${version} · Doan ${state.version} is ready.`, busy: "Restarting" };
    case "restartAborted":
      return { ...EMPTY_ROW, description: `${version} · Doan ${state.version} is ready.`, actions: [NOTES, RESTART], notice: blocked ? BLOCKED : null, error: STOPPED_LINE, announcement: STOPPED_LINE };
  }
}

function header(snapshot: UpdateSnapshot): UpdateHeaderView | null {
  const { state } = snapshot;
  if (state.kind !== "ready" && state.kind !== "restarting" && state.kind !== "restartAborted") return null;
  const tooltip = `Doan ${state.version} is ready`;
  if (state.kind === "restarting") return { label: "Restarting", busy: true, tooltip, popover: null };
  // A conversation still running is why a press would fail now, so its reason wins over the stopped restart.
  const popover = snapshot.gate.kind === "blocked" ? BLOCKED : state.kind === "restartAborted" ? STOPPED : null;
  return { label: "Restart to Update", busy: false, tooltip, popover };
}

function menu(state: UpdateState): UpdateMenuView {
  if (state.kind === "ready" || state.kind === "restartAborted") return MENU_RESTART;
  if (state.kind === "restarting") return { ...MENU_RESTART, enabled: false };
  return MENU_CHECK;
}

// `now` (ms since the epoch) dates "Last checked". The menu's other conditions (first run, a modal, a page lock)
// are menuState's.
export function updateView(snapshot: UpdateSnapshot, now: number): UpdateView {
  if (snapshot.eligibility.kind === "disabled") {
    const text = snapshot.eligibility.reason === "noFeed" ? NO_FEED : DOESNT_UPDATE;
    return { row: { ...EMPTY_ROW, description: `${snapshot.version} · ${text}` }, autoCheck: null, header: null, menu: { label: "Check for Updates…", action: "openAbout", enabled: true } };
  }
  return {
    row: row(snapshot, now),
    autoCheck: { label: AUTO_CHECK_LABEL, description: AUTO_CHECK_DESCRIPTION, checked: snapshot.autoCheck },
    header: header(snapshot),
    menu: menu(snapshot.state),
  };
}
