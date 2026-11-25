import type { Provider } from "../agentAuth/types";
import type { BoundaryKind } from "./commandRecords";
import { commandBoundary, messageCommand } from "./providerCommands";
import type { ConversationEvent } from "./types";

// A conversation's command boundaries in record order, rebuilt after a restart from /compact or /clear turns that ended
// done. In this run the provider's own event decides (`live`), so a command the provider did not carry out draws none.
export interface CommandTurns { boundaries: { turnId: string; kind: BoundaryKind }[] }
export function commandTurns(provider: Provider, events: readonly ConversationEvent[], live?: ReadonlyMap<string, BoundaryKind | null>): CommandTurns {
  const turns = new Map<string, string>(), seen = new Set<string>(), ended = new Map<string, string>();
  for (const event of events) {
    // A turn's own message is its first; a message steered into it later is not the turn's command.
    if (event.type === "user.message" && !seen.has(event.turnId)) {
      seen.add(event.turnId);
      const name = messageCommand(provider, event);
      if (name) turns.set(event.turnId, name);
    }
    if (event.type === "turn.done" || event.type === "turn.failed" || event.type === "interrupted") ended.set(event.turnId, event.type);
  }
  const boundaries: CommandTurns["boundaries"] = [];
  for (const [turnId, name] of turns) {
    const kind = live?.has(turnId) ? live.get(turnId) : ended.get(turnId) === "turn.done" ? commandBoundary(provider, name) : null;
    if (kind) boundaries.push({ turnId, kind });
  }
  return { boundaries };
}
