// The prototype window's playing target as main tells the main window, and the drawing and promoted conversation ids it
// relays to the prototype window, each sent only when it changed. Electron-free; index.ts wires it.
import { prototypeTargetRef, type PrototypeTargetRef } from "./drawing";
import type { PlayingCanvas } from "./conversationScope";

export interface TargetRelayDeps {
  playing(): PlayingCanvas | null;
  generation(): number;
  // The prototype window is open.
  open(): boolean;
  drawing(): string | null;
  promoted(): string | null;
  sendTarget(target: PrototypeTargetRef | null): void;
  sendDrawing(conversationId: string | null): void;
  sendPromoted(conversationId: string | null): void;
}

export function createTargetRelay(deps: TargetRelayDeps) {
  let targetSent = "null", drawingSent = "null", promotedSent = "null";
  const drawing = (): void => {
    const conversationId = deps.drawing();
    const text = JSON.stringify(conversationId);
    if (text === drawingSent || !deps.open()) return;
    drawingSent = text;
    deps.sendDrawing(conversationId);
  };
  const promoted = (): void => {
    const conversationId = deps.promoted();
    const text = JSON.stringify(conversationId);
    if (text === promotedSent || !deps.open()) return;
    promotedSent = text;
    deps.sendPromoted(conversationId);
  };
  return {
    target(): PrototypeTargetRef | null { return prototypeTargetRef(deps.playing(), deps.generation()); },
    // After every change of the playing canvas, every view (a moved row's path) and the window's close. The generation
    // is part of the value, so a return to the same canvas is a new target the main window reports on again.
    changed(): void {
      const target = prototypeTargetRef(deps.playing(), deps.generation());
      const text = JSON.stringify(target);
      if (text !== targetSent) {
        targetSent = text;
        deps.sendTarget(target);
      }
      if (!deps.open()) { drawingSent = "null"; promotedSent = "null"; }
      else { drawing(); promoted(); }
    },
    drawing,
    promoted,
    readDrawing(): string | null { const conversationId = deps.drawing(); drawingSent = JSON.stringify(conversationId); return conversationId; },
    readPromoted(): string | null { const conversationId = deps.promoted(); promotedSent = JSON.stringify(conversationId); return conversationId; },
  };
}
