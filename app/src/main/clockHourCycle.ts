// The renderer cannot see macOS's 12/24-hour setting: with "24-hour time" on (AppleICUForce24HourTime), Electron's
// renderer Intl still resolves h12 for an en locale. Main reads it and hands it to the window at creation as a
// command-line argument, so a change of the setting applies after a restart.
export const CLOCK_ARGUMENT = "--doan-clock-hour12=";
// force24 / force12: the macOS defaults (systemPreferences.getUserDefault); locale: the system locale, whose own hour
// cycle decides when neither is set.
export function clockHour12(defaults: { force24: boolean; force12: boolean }, locale: string): boolean {
  if (defaults.force24) return false;
  if (defaults.force12) return true;
  try {
    const cycle = new Intl.DateTimeFormat(locale || undefined, { hour: "numeric" }).resolvedOptions().hourCycle;
    return cycle === "h11" || cycle === "h12";
  } catch { return true; }
}
export function clockArgument(hour12: boolean): string { return `${CLOCK_ARGUMENT}${hour12 ? 1 : 0}`; }
