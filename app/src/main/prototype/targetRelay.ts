// The prototype window's playing target and frame as main tells the main window, each sent only when it changed.
// Electron-free; index.ts wires it.
import type { PlayingCanvas } from "./conversationScope";
import type { PrototypePlaying } from "./ipc";

// The playing canvas as the main window names a canvas: its root, its row's last listed path and its ID when it has one.
// `generation` names this play of it (the controller's canvasGeneration), so a return to the same canvas (A → B → A) is
// a new target.
export interface PrototypeTargetRef {
  root: string;
  canvas: { path: string; id?: string };
  generation: number;
}

export function prototypeTargetRef(playing: PlayingCanvas | null, generation: number): PrototypeTargetRef | null {
  if (playing === null) return null;
  return { root: playing.root, canvas: { ...("id" in playing.canvas ? { id: playing.canvas.id } : {}), path: playing.path }, generation };
}

export interface TargetRelayDeps {
  playing(): PlayingCanvas | null;
  frame(): string | null;
  generation(): number;
  sendTarget(target: PrototypeTargetRef | null): void;
  sendPlaying(playing: PrototypePlaying | null): void;
}

export function createTargetRelay(deps: TargetRelayDeps) {
  let targetSent = "null", playingSent = "null";
  const playingTarget = (): PrototypePlaying | null => {
    const playing = deps.playing(), frame = deps.frame();
    if (playing === null || frame === null) return null;
    return { root: playing.root, canvas: { path: playing.path, ...("id" in playing.canvas ? { id: playing.canvas.id } : {}) }, frame };
  };
  return {
    target(): PrototypeTargetRef | null { return prototypeTargetRef(deps.playing(), deps.generation()); },
    playingTarget,
    // After every change of the playing canvas, every view (a moved row's path) and the window's close. The generation
    // is part of the value, so a return to the same canvas is a new target.
    changed(): void {
      const target = prototypeTargetRef(deps.playing(), deps.generation());
      const text = JSON.stringify(target);
      if (text !== targetSent) {
        targetSent = text;
        deps.sendTarget(target);
      }
      const playing = playingTarget();
      const playingText = JSON.stringify(playing);
      if (playingText !== playingSent) {
        playingSent = playingText;
        deps.sendPlaying(playing);
      }
    },
  };
}
