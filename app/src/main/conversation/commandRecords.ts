import { COMMAND_ALIASES } from "./providerCommands";

// Provider records that stand for a command's effect: a context boundary the thread draws, or a record it leaves out.
// Boundaries are never stored (ARCHITECTURE §7 'Provider built-in commands').
export type BoundaryKind = "compacted" | "cleared";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
// Doan sends an alias as /clear, but a session the person cleared by an alias in a terminal may name the alias.
const CLEAR_NAMES = ["clear", ...Object.entries(COMMAND_ALIASES.claude).filter(([, name]) => name === "clear").map(([alias]) => alias)];

// A Claude stream message or session file line. compact_boundary comes in both; a clear shows in the stream as
// conversation_reset, and in the files only as the /clear line that starts the new session's file.
export function claudeBoundary(value: unknown): BoundaryKind | null {
  if (!record(value)) return null;
  if (value.type === "system" && value.subtype === "compact_boundary") return "compacted";
  if (value.type === "conversation_reset" && value.trigger === "clear") return "cleared";
  if (value.type === "system" && value.subtype === "local_command" && typeof value.content === "string" && CLEAR_NAMES.some(name => (value.content as string).includes(`<command-name>/${name}</command-name>`))) return "cleared";
  return null;
}

// Copilot's /compact answers with this text and no model call; it is the only sign of the compaction over ACP.
export function copilotCompacted(text: string): boolean {
  return text.startsWith("Compacted conversation history");
}
