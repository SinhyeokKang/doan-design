import type { Provider } from "../agentAuth/types";
import type { BoundaryKind } from "./commandRecords";
import { commandBoundary, commandName } from "./providerCommands";
import type { ConversationEvent } from "./types";

// A conversation's command turns as the thread draws them: each command turn's name (its running label, and no title)
// and the boundaries after them, in record order. Boundaries are not stored: after a restart they are rebuilt from the
// record, a /compact or /clear turn that ended done (no provider record is read). In this run the provider's own event
// decides a turn this run sent (`live`: a boundary kind, or null while none came), so a command the provider did not
// carry out draws none.
// usageStale: the last boundary is a clear and no later turn reported a context value, so the record's last value is the
// previous session's; the ring shows none until a turn measures the new session (nothing is made up meanwhile).
export interface CommandTurns { turns: Record<string, string>; boundaries: { turnId: string; kind: BoundaryKind }[]; usageStale: boolean }
export function commandTurns(provider: Provider, events: readonly ConversationEvent[], live?: ReadonlyMap<string, BoundaryKind | null>): CommandTurns {
  const turns: Record<string, string> = {}, seen = new Set<string>(), ended = new Map<string, string>(), order: string[] = [];
  const measured = new Set<string>();
  for (const event of events) {
    // A turn's own message is its first; a message steered into it later is not the turn's command.
    if (event.type === "user.message" && !seen.has(event.turnId)) {
      seen.add(event.turnId);
      const name = commandName(provider, event.text);
      if (name) { turns[event.turnId] = name; order.push(event.turnId); }
    }
    if (event.type === "turn.done" || event.type === "turn.failed" || event.type === "interrupted") ended.set(event.turnId, event.type);
    if (event.type === "context.usage") measured.add(event.turnId);
  }
  const boundaries: CommandTurns["boundaries"] = [];
  for (const turnId of order) {
    const kind = live?.has(turnId) ? live.get(turnId) : ended.get(turnId) === "turn.done" ? commandBoundary(provider, turns[turnId]!) : null;
    if (kind) boundaries.push({ turnId, kind });
  }
  const lastClear = [...boundaries].reverse().find(boundary => boundary.kind === "cleared");
  const turnOrder = [...seen], after = lastClear ? turnOrder.indexOf(lastClear.turnId) : -1;
  return { turns, boundaries, usageStale: after !== -1 && !turnOrder.slice(after + 1).some(turnId => measured.has(turnId)) };
}
