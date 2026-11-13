import type { PlayRequest } from "../../main/prototype/ipc";

// The main window's prototype calls on `window.doan`: Play sends `prototype:play`; main says `prototype:closed` when
// the prototype window closes for any reason.
export interface PrototypeMainCalls {
  playPrototype(request: PlayRequest): void;
  onPrototypeClosed(listener: () => void): () => void;
}

// Integration shim: the main-window preload that adds these two methods lands in a parallel batch. Once it does,
// this becomes `return window.doan satisfies PrototypeMainCalls`.
export function prototypeMainCalls(): PrototypeMainCalls {
  return window.doan as unknown as PrototypeMainCalls;
}
