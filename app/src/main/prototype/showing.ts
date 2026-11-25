// Main leaves this conversation out of its notifications while the prototype window is in front. It counts only until the
// playing canvas changes, even back, so no notification is hidden on a report the window has not made again.
import type { FolderEntry } from "../view";
import { prototypeConversationScope, type PlayingCanvas, type ScopedConversation } from "./conversationScope";
import { parseShowingRequest } from "./requests";

export interface ShowingDeps {
  playing(): PlayingCanvas | null;
  // The controller's count of playing-canvas changes.
  generation(): number;
  conversations(): ScopedConversation[];
  entries(): readonly FolderEntry[];
}

export function createPrototypeShowing(deps: ShowingDeps) {
  let shown: { conversationId: string; generation: number } | null = null;
  return {
    set(kind: unknown, value: unknown): void {
      const request = parseShowingRequest(kind, value);
      if (request === null) return;
      const playing = deps.playing(), id = request.conversationId;
      shown = id !== null && playing !== null && prototypeConversationScope("read", { conversationId: id }, playing, deps.conversations(), deps.entries())
        ? { conversationId: id, generation: deps.generation() } : null;
    },
    shown(): string | null {
      return shown !== null && deps.playing() !== null && shown.generation === deps.generation() ? shown.conversationId : null;
    },
    closed(): void { shown = null; },
  };
}
