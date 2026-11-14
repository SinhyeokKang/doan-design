import { quoted } from "./conversationDelete";

// The board's Stop stops only the followed conversation. When that changes under the pointer, Stop stays the same
// element but is unavailable for a moment, so a second click meant for the conversation just stopped does not stop
// the next one.
export const STOP_HOLD_MS = 1000;

// `followed`: the followed conversation (null: none); `until`: the time Stop becomes available again.
export interface StopHold { followed: string | null; until: number }

// Only a change from one followed conversation to another holds Stop; a notice that newly appears has no click to
// catch. The clock is the caller's, so the host and its tests share one rule.
export function nextStopHold(previous: StopHold | null, followed: string | null, now: number): StopHold {
  if (previous !== null && previous.followed === followed) return previous;
  const changed = previous !== null && previous.followed !== null && followed !== null;
  return { followed, until: changed ? now + STOP_HOLD_MS : 0 };
}

export function stopHeld(hold: StopHold, now: number): boolean {
  return now < hold.until;
}

// Stop alone while it stops the conversation the panel shows; another conversation's names it, quoted as the delete
// dialog quotes a title, and an empty title reads Stop alone.
export function stopName(title: string, followsShown: boolean): string {
  const name = followsShown ? null : quoted(title);
  return name === null ? "Stop" : `Stop ${name}`;
}
