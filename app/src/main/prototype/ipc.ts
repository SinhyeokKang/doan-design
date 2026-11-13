import type { PrototypeSize } from "./mark";

// The prototype window's IPC contract. `play` is the main window's request; `changed` is an event main sends the
// prototype window; every other channel is a request from the prototype window's own main frame.
export const PROTOTYPE_CHANNELS = {
  play: "prototype:play",
  read: "prototype:read",
  changed: "prototype:changed",
  result: "prototype:result",
  frames: "prototype:frames",
  reload: "prototype:reload",
  back: "prototype:back",
  forward: "prototype:forward",
  choose: "prototype:choose",
  close: "prototype:close",
} as const;

export const PROTOTYPE_WINDOW_REQUESTS: readonly string[] = [
  PROTOTYPE_CHANNELS.read, PROTOTYPE_CHANNELS.result, PROTOTYPE_CHANNELS.frames, PROTOTYPE_CHANNELS.reload,
  PROTOTYPE_CHANNELS.back, PROTOTYPE_CHANNELS.forward, PROTOTYPE_CHANNELS.choose, PROTOTYPE_CHANNELS.close,
];

// From the moment the host sets the iframe's src to the run's result. The slowest measured canvas answered in under
// 200ms; the margin is for slow external scripts. A document that blocks its parser never answers at all.
export const PROTOTYPE_LOAD_TIMEOUT_MS = 10_000;

// `prototype:play` from the main window. `mark` is the selected frame's raw mark from the live layout, a size hint
// only: main parses it, builds the URL from its own list and judges the frame in the run's document.
export interface PlayRequest {
  root: string;
  path: string;
  frame: string;
  mark: string;
}

// A frame the run's document lists for the drawer: a unique, non-empty ID with a valid mark, in document order.
export interface PrototypeFrame {
  id: string;
  title?: string;
  size: string;
}

export type LostState = "missing" | "duplicate" | "unmarked" | "invalid";

// `prototype:result`, sent once per run by the host. `ready` and the lost states come from the prototype script in the
// run's document (at DOMContentLoaded, or after the `load` handlers); `timeout` is the host's own 10 s timer.
export type RunMessage =
  | { gen: number; state: "ready"; size: string; frames: PrototypeFrame[] }
  | { gen: number; state: LostState; frames: PrototypeFrame[] }
  | { gen: number; state: "timeout" };

// What main acts on once a message is validated.
export type RunReport =
  | { gen: number; state: "ready"; size: PrototypeSize; frames: PrototypeFrame[] }
  | { gen: number; state: LostState; frames: PrototypeFrame[] }
  | { gen: number; state: "timeout" };

// `prototype:frames`: the drawer list the run sends after the `load` handlers, when its result went out earlier.
export interface FramesMessage {
  gen: number;
  frames: PrototypeFrame[];
}

export type PrototypePhase = "loading" | "ready" | "read-failed" | "init-failed" | "frame-unavailable" | "prototype-unavailable";

// `prototype:changed` and the reply to `prototype:read`. A new `gen` with a new `run` means a new iframe. `run` stays
// the last run's while a frame is lost, so the host keeps the frozen screen under the overlay; it is null only before
// any run started. `title` is the frame's title, or its ID without one. `frames` is empty when the canvas is gone.
export interface PrototypeView {
  gen: number;
  frame: string;
  title: string;
  phase: PrototypePhase;
  detail?: string;
  run: { url: string; markWidth: number } | null;
  frames: PrototypeFrame[];
  canGoBack: boolean;
  canGoForward: boolean;
}

// The prototype window's preload API (`window.doanPrototype`). The preload implements it with
// `satisfies PrototypeWindowApi`; the renderer reads its type from here.
export interface PrototypeWindowApi {
  read(): Promise<PrototypeView | null>;
  onChanged(listener: (view: PrototypeView | null) => void): () => void;
  reportResult(message: RunMessage): Promise<void>;
  reportFrames(message: FramesMessage): Promise<void>;
  reload(gen: number): Promise<void>;
  back(): Promise<void>;
  forward(): Promise<void>;
  choose(frame: string): Promise<void>;
  close(): Promise<void>;
}
