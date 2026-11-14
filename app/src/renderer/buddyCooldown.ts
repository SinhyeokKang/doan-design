// The buddy lock after a Settings > General switch (PRODUCT §5 item 0 'General'): 24 hours from the saved change time,
// measured with the system clock.
export const COOLDOWN_MS = 24 * 60 * 60 * 1000;

// seenAt: when this run first read that change time. A time in the future (the clock went back) would lock for longer
// than 24 hours, so one run locks at most 24 hours from when it saw the time; a relaunch sees it anew.
export function cooldownEnd(changedAt: number, seenAt: number): number {
  return Math.min(changedAt, seenAt) + COOLDOWN_MS;
}

// The time left, or null once the lock is over. A clock set back during the run would read more than 24 hours; it
// holds at 24 until the clock catches up.
export function cooldownRemaining(end: number, now: number): number | null {
  return now < end ? Math.min(end - now, COOLDOWN_MS) : null;
}

const two = (value: number) => String(value).padStart(2, "0");

// HH:mm:ss, whole seconds rounded up: just after a switch reads 24:00:00, and the last second 00:00:01.
export function cooldownClock(remainingMs: number): string {
  const seconds = Math.ceil(remainingMs / 1000);
  return `${two(Math.floor(seconds / 3600))}:${two(Math.floor(seconds / 60) % 60)}:${two(seconds % 60)}`;
}

// The wait until the shown second changes (1–1000 ms), so each redraw lands on a boundary.
export function nextTick(remainingMs: number): number {
  return remainingMs % 1000 || 1000;
}
