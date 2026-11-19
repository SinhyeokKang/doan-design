import { COMMAND_ALIASES } from "./providerCommands";

// Provider records that stand for a command's effect rather than a message: a context boundary the thread draws, or a
// record the thread leaves out. Boundaries are never stored: in this run they come from the provider's stream, and after
// a restart each `/compact` or Claude `/clear` turn that ended done stands for one (ARCHITECTURE §7 'Provider built-in
// commands'). Shapes from a live check (2026-11-17): Claude Code 2.1.326, Codex 0.167.1, Copilot 1.0.105.
export type BoundaryKind = "compacted" | "cleared";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
// Doan sends an alias as /clear, but a session the person cleared by an alias in a terminal may name the alias.
const CLEAR_NAMES = ["clear", ...Object.entries(COMMAND_ALIASES.claude).filter(([, name]) => name === "clear").map(([alias]) => alias)];

// A Claude stream message or session file line. compact_boundary comes in both (compact_metadata in the stream,
// compactMetadata in the file). A clear shows in the stream as conversation_reset; in the files only as the /clear line
// that starts the new session's file, since the previous file records nothing of it.
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
