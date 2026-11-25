export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// `lastAttemptAt` is the last check's start, answered or not, in memory, so every launch checks once; lastCheckedAt
// would make every evaluation due while checks fail. A time ahead of `now` means the clock was set back.
export function shouldCheck(input: { autoCheck: boolean; lastAttemptAt: number | null; now: number }): boolean {
  if (!input.autoCheck) return false;
  if (input.lastAttemptAt === null || input.lastAttemptAt > input.now) return true;
  return input.now - input.lastAttemptAt >= CHECK_INTERVAL_MS;
}
