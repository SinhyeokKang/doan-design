export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Automatic checks only; a manual check never asks. `lastCheckedAt` is the last check's start, kept in memory, so
// every launch checks once. A time ahead of `now` means the clock was set back, and waiting for it would hold checks
// off for as long.
export function shouldCheck(input: { autoCheck: boolean; lastCheckedAt: number | null; now: number }): boolean {
  if (!input.autoCheck) return false;
  if (input.lastCheckedAt === null || input.lastCheckedAt > input.now) return true;
  return input.now - input.lastCheckedAt >= CHECK_INTERVAL_MS;
}
