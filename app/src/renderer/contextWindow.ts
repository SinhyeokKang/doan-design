import type { ConversationEvent } from "../main/conversation/types";

// The last context.usage before a turn's end. value stops at 100; percent is the real ratio the name and tooltip give.
export interface ContextUsage { value: number; percent: number; used: number; size: number }

// stale: the value is one a session /clear left behind; no ring until a turn measures the new one.
export function contextRing(events: readonly ConversationEvent[], stale = false): ContextUsage | null {
  if (stale) return null;
  let at = events.length - 1;
  while (at >= 0 && events[at]!.type !== "context.usage") at--;
  const last = events[at];
  if (last?.type !== "context.usage") return null;
  const percent = last.used * 100 / last.size;
  return { value: Math.min(percent, 100), percent, used: last.used, size: last.size };
}

// Floored like the percent.
export function tokenText(count: number): string {
  if (count < 1_000) return `${count}`;
  if (count < 1_000_000) return `${Math.floor(count / 1_000)}K`;
  return `${Math.floor(count / 100_000) / 10}M`;
}

// Both percents divide the integer used * 100 by size: (used / size) * 100 can land just under an integer and floor
// one low.
export function contextText({ used, size }: ContextUsage): { label: string; tokens: string } {
  return { label: `Context window ${Math.floor(used * 100 / size)}% used · last turn`, tokens: `${tokenText(used)} of ${tokenText(size)} tokens` };
}
