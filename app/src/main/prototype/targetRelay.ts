// The frame the prototype window plays as main tells the main window, sent only when it changed. Electron-free; index.ts
// wires it.
import type { PlayingCanvas } from "./conversationScope";
import type { PrototypePlaying } from "./ipc";

export interface TargetRelayDeps {
  playing(): PlayingCanvas | null;
  frame(): string | null;
  sendPlaying(playing: PrototypePlaying | null): void;
}

export function createTargetRelay(deps: TargetRelayDeps) {
  let playingSent = "null";
  const playingTarget = (): PrototypePlaying | null => {
    const playing = deps.playing(), frame = deps.frame();
    if (playing === null || frame === null) return null;
    return { root: playing.root, canvas: { path: playing.path, ...("id" in playing.canvas ? { id: playing.canvas.id } : {}) }, frame };
  };
  return {
    playingTarget,
    // After every change of the playing canvas, every view (a moved row's path) and the window's close.
    changed(): void {
      const playing = playingTarget();
      const text = JSON.stringify(playing);
      if (text !== playingSent) {
        playingSent = text;
        deps.sendPlaying(playing);
      }
    },
  };
}
