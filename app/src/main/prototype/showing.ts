// The conversation the prototype window's open panel shows (`prototype:showing`), which main leaves out of its
// notifications while that window is in front. Only a conversation of the canvas playing when the report arrives is
// taken, and it counts only while that canvas still plays: a play elsewhere drops it until the window reports again,
// so no other conversation's notification is hidden. Electron-free.
import type { FolderEntry } from "../view";
import { prototypeConversationScope, type PlayingCanvas, type ScopedConversation } from "./conversationScope";
import { parseShowingRequest } from "./requests";
import { canvasKeyString } from "./targets";

export interface ShowingDeps {
  playing(): PlayingCanvas | null;
  conversations(): ScopedConversation[];
  entries(): readonly FolderEntry[];
}

export function createPrototypeShowing(deps: ShowingDeps) {
  let shown: { conversationId: string; canvas: string } | null = null;
  return {
    set(kind: unknown, value: unknown): void {
      const request = parseShowingRequest(kind, value);
      if (request === null) return;
      const playing = deps.playing(), id = request.conversationId;
      shown = id !== null && playing !== null && prototypeConversationScope("read", { conversationId: id }, playing, deps.conversations(), deps.entries())
        ? { conversationId: id, canvas: canvasKeyString(playing) } : null;
    },
    shown(): string | null {
      const playing = deps.playing();
      return shown !== null && playing !== null && shown.canvas === canvasKeyString(playing) ? shown.conversationId : null;
    },
    closed(): void { shown = null; },
  };
}
