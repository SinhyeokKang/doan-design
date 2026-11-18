import type { ConversationEvent } from "./types";

// Whether an event is something to see: main's unseen (summary.ts) and the renderer's seen end (overviewRun.ts) both
// measure through it, so a line one side skips cannot leave the other's mark stuck. Markers of binding, and an earlier
// build's archiving and restoring, would mark a seen end unseen again; a handoff's resolution, a missed handoff's line
// and a drawn canvas also come after the turn's end, often while the person is moved to the next conversation.
// Type-only imports: the renderer imports it.
export function toSee(event: ConversationEvent): boolean {
  return !event.type.startsWith("conversation.") && event.type !== "handoff.resolved" && event.type !== "handoff.missed" && event.type !== "canvas.drawn";
}
