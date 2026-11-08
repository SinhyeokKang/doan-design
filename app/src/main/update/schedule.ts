export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Automatic checks only; a manual check never asks. `lastAttemptAt` is the last check's start, answered or not, kept
// in memory, so every launch checks once. It is not the snapshot's lastCheckedAt (the last answer): while checks fail
// that one stays old, and passing it would make every evaluation due. A time ahead of `now` means the clock was set
// back, and waiting for it would hold checks off for as long.
export function shouldCheck(input: { autoCheck: boolean; lastAttemptAt: number | null; now: number }): boolean {
  if (!input.autoCheck) return false;
  if (input.lastAttemptAt === null || input.lastAttemptAt > input.now) return true;
  return input.now - input.lastAttemptAt >= CHECK_INTERVAL_MS;
}
