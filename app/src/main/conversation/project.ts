// A canvas the agent wrote shows up in the folder list after the watcher's debounce and an ls. A turn that just ended is
// judged this long at the latest for its handoffs, missed lines and drawn canvases (settleDeadline).
export const BIND_GRACE_MS = 10_000;
// Once a turn's process group is gone the turn cannot write any more, and only the watcher's delay is left: 1.5 times the
// longest a written canvas took to reach the folder refresh (3.7 s in the dev app, mostly the `doan ls` it runs).
export const SETTLE_MS = 5572;
// When a turn that ended at endedAt is judged at the latest. exitedAt: when its process group was seen gone, absent
// while it is still there (a Codex server lives between turns, background work can hold a Claude group); grace bounds it.
export function settleDeadline(input: { endedAt: number; exitedAt?: number; settle: number; grace: number }): number {
  const bound = input.endedAt + input.grace;
  return input.exitedAt === undefined ? bound : Math.min(bound, Math.max(input.endedAt, input.exitedAt) + input.settle);
}
