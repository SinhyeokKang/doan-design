// A project conversation promoted to the playing canvas's conversation: main's own conversation.bound event for a
// conversation of the playing root bound to the playing canvas. The prototype window cannot tell it from its list, which
// holds only the playing canvas's conversations (never the project conversation before it was bound), so main relays
// the id alone for the panel's promotion notice and its Open. It holds only until the playing canvas changes (also back
// to the same one) or the window closes. Electron-free.
import type { ConversationEvent } from "../conversation/types";
import type { PlayingCanvas, ScopedConversation } from "./conversationScope";

export interface PromotedDeps {
  playing(): PlayingCanvas | null;
  // The controller's count of playing-canvas changes.
  generation(): number;
}

export function createPrototypePromoted(deps: PromotedDeps) {
  let promoted: { conversationId: string; generation: number } | null = null;
  return {
    // A conversation event as main publishes it, with main's index read after it; whether the promoted id changed.
    event(event: ConversationEvent, conversations: readonly ScopedConversation[]): boolean {
      const playing = deps.playing();
      if (event.type !== "conversation.bound" || playing === null) return false;
      const conversation = conversations.find(candidate => candidate.conversationId === event.conversationId);
      // The root is in the comparison: worktrees share canvas IDs and paths (POSTMORTEM 2026-11-01).
      if (conversation === undefined || conversation.root !== playing.root) return false;
      const onPlaying = "id" in playing.canvas ? event.canvas.id === playing.canvas.id : event.canvas.id === undefined && event.canvas.path === playing.canvas.path;
      if (!onPlaying) return false;
      promoted = { conversationId: event.conversationId, generation: deps.generation() };
      return true;
    },
    current(): string | null {
      return promoted !== null && deps.playing() !== null && promoted.generation === deps.generation() ? promoted.conversationId : null;
    },
    closed(): void { promoted = null; },
  };
}
