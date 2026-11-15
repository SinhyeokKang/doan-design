import type { PlayRequest, PrototypePlaying } from "../../main/prototype/ipc";

// The main window's prototype calls on `window.doan`: Play sends `prototype:play`; main says `prototype:closed` when
// the prototype window closes for any reason, and `prototype:playing` whenever the frame it plays changes.
export interface PrototypeMainCalls {
  playPrototype(request: PlayRequest): void;
  onPrototypeClosed(listener: () => void): () => void;
  onPrototypePlaying(listener: (playing: PrototypePlaying | null) => void): () => void;
  readPrototypePlaying(): Promise<PrototypePlaying | null>;
}

export function prototypeMainCalls(): PrototypeMainCalls {
  return window.doan satisfies PrototypeMainCalls;
}
