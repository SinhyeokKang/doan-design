import type { PlayRequest } from "../../main/prototype/ipc";

// The main window's prototype calls on `window.doan`: Play sends `prototype:play`; main says `prototype:closed` when
// the prototype window closes for any reason.
export interface PrototypeMainCalls {
  playPrototype(request: PlayRequest): void;
  onPrototypeClosed(listener: () => void): () => void;
}

export function prototypeMainCalls(): PrototypeMainCalls {
  return window.doan satisfies PrototypeMainCalls;
}
