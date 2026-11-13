// The conversation the prototype window's open panel shows (`prototype:showing`), which main leaves out of its
// notifications while that window is in front. Only a conversation of the canvas playing when the report arrives is
// taken, and it counts only until the playing canvas changes, even back to that canvas, so no conversation's
// notification is hidden on a report the window has not made again. Electron-free.
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
