import type { ConversationEvent } from "../main/conversation/types";

// The ring's reading of a conversation (context-window-ring design §3): the last context.usage recorded before a turn's
// end. value fills the ring and stops at 100; percent is the real ratio the name and tooltip give.
export interface ContextUsage { value: number; percent: number; used: number; size: number }

export function contextRing(events: readonly ConversationEvent[]): ContextUsage | null {
  let at = events.length - 1;
  while (at >= 0 && events[at]!.type !== "context.usage") at--;
  const last = events[at];
  if (last?.type !== "context.usage") return null;
  const percent = last.used * 100 / last.size;
  return { value: Math.min(percent, 100), percent, used: last.used, size: last.size };
}

// Counts read as the provider's window is usually named: 84K, 1M, 1.2M; floored like the percent.
export function tokenText(count: number): string {
  if (count < 1_000) return `${count}`;
  if (count < 1_000_000) return `${Math.floor(count / 1_000)}K`;
  return `${Math.floor(count / 100_000) / 10}M`;
}

// label is the ring's name and the tooltip's first line; tokens its description and second line. The percent is
// floored from used and size, not from percent, whose float product can land just under an integer (0.29 * 100).
export function contextText({ used, size }: ContextUsage): { label: string; tokens: string } {
  return { label: `Context window ${Math.floor(used * 100 / size)}% used · last turn`, tokens: `${tokenText(used)} of ${tokenText(size)} tokens` };
}
