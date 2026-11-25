import type { ConversationEvent } from "./types";

// Whether an event is something to see: main's unseen (summary.ts) and the renderer's seen end (overviewRun.ts) both use
// it, so neither mark sticks; markers and post-turn lines are skipped. Type-only imports: the renderer imports it.
export function toSee(event: ConversationEvent): boolean {
  return !event.type.startsWith("conversation.") && event.type !== "handoff.resolved" && event.type !== "handoff.missed" && event.type !== "canvas.drawn";
}
