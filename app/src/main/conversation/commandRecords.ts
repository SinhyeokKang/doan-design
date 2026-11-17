// Provider records that stand for a command's effect rather than a message: a context boundary the thread draws, or a
// record the thread leaves out. Boundaries are rebuilt from the provider's session records, not kept in Doan's history,
// so they read the same in this run and after a restart (Copilot's excepted: its session/load replay leaves the
// compaction out). Shapes from a live PoC (2026-11-17): Claude Code 2.1.326, Codex 0.167.1, Copilot 1.0.105.
export type BoundaryKind = "compacted" | "cleared";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
// A Claude user message's text: a string, or its text blocks.
function userText(message: unknown): string {
  if (!record(message)) return "";
  if (typeof message.content === "string") return message.content;
  return Array.isArray(message.content) ? message.content.filter(record).filter(c => c.type === "text" && typeof c.text === "string").map(c => c.text as string).join("") : "";
}
const STDOUT = "<local-command-stdout>";

// A Claude stream message or session file line. compact_boundary comes in both (compact_metadata in the stream,
// compactMetadata in the file). A clear shows in the stream as conversation_reset; in the files only as the /clear line
// that starts the new session's file, since the previous file records nothing of it.
export function claudeBoundary(value: unknown): BoundaryKind | null {
  if (!record(value)) return null;
  if (value.type === "system" && value.subtype === "compact_boundary") return "compacted";
  if (value.type === "conversation_reset" && value.trigger === "clear") return "cleared";
  if (value.type === "system" && value.subtype === "local_command" && typeof value.content === "string" && value.content.includes("<command-name>/clear</command-name>")) return "cleared";
  return null;
}
// /compact leaves a summary user message (isCompactSummary) and a "Compacted" output line, as a user message in the
// stream or a local_command line in the file; neither is the person's or the agent's text.
export function claudeHidden(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.type === "user") return value.isCompactSummary === true || userText(value.message).startsWith(STDOUT);
  return value.type === "system" && value.subtype === "local_command" && typeof value.content === "string" && value.content.startsWith(STDOUT);
}

// thread/compact/start opens a turn of its own whose only item is contextCompaction; thread/compacted never came.
export function codexBoundary(turn: unknown): BoundaryKind | null {
  return record(turn) && Array.isArray(turn.items) && turn.items.length === 1 && record(turn.items[0]) && turn.items[0].type === "contextCompaction" ? "compacted" : null;
}
// review/start leaves, in thread/read after a restart, an interrupted child turn whose rootTurnId is the review turn
// (the one with enteredReviewMode). Only such a turn is hidden: the person's own stopped turns stay.
export function codexHiddenTurns(turns: readonly unknown[]): Set<string> {
  const rows = turns.filter(record);
  const reviews = new Set(rows.filter(t => typeof t.id === "string" && Array.isArray(t.items) && t.items.some(i => record(i) && i.type === "enteredReviewMode")).map(t => t.id as string));
  return new Set(rows.filter(t => t.status === "interrupted" && typeof t.id === "string" && typeof t.rootTurnId === "string" && t.rootTurnId !== t.id && reviews.has(t.rootTurnId)).map(t => t.id as string));
}

// Copilot's /compact answers with this text and no model call; it is the only sign of the compaction over ACP.
export function copilotCompacted(text: string): boolean {
  return text.startsWith("Compacted conversation history");
}
