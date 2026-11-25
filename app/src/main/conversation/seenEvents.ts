import type { ConversationEvent } from "./types";

// Shared by main's unseen (summary.ts) and the renderer's seen end (overviewRun.ts) so no mark sticks. Skips lines that
// land after a seen end and would unsee it: markers, handoff results, drawn canvases. Imported by the renderer: types only.
export function toSee(event: ConversationEvent): boolean {
  return !event.type.startsWith("conversation.") && event.type !== "handoff.resolved" && event.type !== "handoff.missed" && event.type !== "canvas.drawn";
}
