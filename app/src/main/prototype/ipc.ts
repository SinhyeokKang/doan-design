import type { HomeMemory } from "../../restore/uiState";
import type { BuddyId } from "../../renderer/buddies";
import type { ComposerChoice } from "../../renderer/rememberChoice";
import type { Provider } from "../agentAuth/types";
import type { ExportReply } from "../canvasExport";
import type { ReplyAnchor } from "../conversation/replyAnchor";
import type { Anchor, Canvas } from "../conversation/types";
import type { NewConversationPreference } from "../preferences";
import type { FolderEntry } from "../view";
import type { Rect } from "./fit";
import type { PrototypeSize } from "./mark";

// The prototype window's IPC contract. `play` is the main window's request; `changed`, `snapshot`, `exportRunning` and
// `visible` are events main sends the prototype window (`visible` is also its request for the first value), `closed` an
// event main sends the main window; every other channel is a request from the prototype window's own main frame.
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
  mode: "prototype:mode",
  // To the main window when the prototype window closes for any reason, so focus can go back to a live Play control.
  closed: "prototype:closed",
  // To the prototype window, before the view that turns a ready run failed or unavailable (PrototypeSnapshot).
  snapshot: "prototype:snapshot",
  // Export prototype names the target the window showed at the click; Show in Finder names only an id main gave.
  export: "prototype:export",
  revealExport: "prototype:revealExport",
  // To the prototype window once the person chose a file and the CLI is about to run, with the export's target.
  exportRunning: "prototype:exportRunning",
  // Shown natively: the window is visible and not minimized, and the app is not hidden (document.hidden misses both).
  visible: "prototype:visible",
  // The conversation panel's open state and width; main sizes the window and answers with the view.
  panel: "prototype:panel",
  // The conversation the open panel shows (null when closed or showing none), for seen and notifications.
  showing: "prototype:showing",
  // A thread chip or a main-window-only button: main checks it against the playing canvas and asks the main window.
  reveal: "prototype:reveal",
  // The composer's narrow reads, each with the event main pushes: provider readiness without the account's identity,
  // the terminal work of the session the playing canvas would resume, and the New conversations default, Last used
  // and buddy. A full account, settings or work read stays the main window's.
  auth: "prototype:auth",
  authChanged: "prototype:authChanged",
  work: "prototype:work",
  workChanged: "prototype:workChanged",
  composer: "prototype:composer",
  composerChanged: "prototype:composerChanged",
  // A composer pick to remember as Last used. Main hands it to the main window, which owns ui-state and applies it
  // as its own composer's (rememberChoice, preferenceAfterPick); a write from main would be lost to the main
  // window's next whole-file save.
  remember: "prototype:remember",
  // The playing root's folder entry (its canvas rows) and its changes; the window reads it again when the view's root
  // changes.
  entry: "prototype:entry",
  entryChanged: "prototype:entryChanged",
  // To the main window: a checked reveal (PrototypeReveal) and a Last used pick (ComposerChoice).
  revealRequest: "prototype:revealRequest",
  lastUsed: "prototype:lastUsed",
  // The drawing project conversation (drawing.ts). To the main window: the playing target (PrototypeTargetRef | null)
  // whenever it changes, and its read; from the main window: which project conversation draws it. To the prototype
  // window: that conversation's id only (`{conversationId}`), and its read.
  target: "prototype:target",
  readTarget: "prototype:readTarget",
  setDrawing: "prototype:setDrawing",
  drawing: "prototype:drawing",
  drawingChanged: "prototype:drawingChanged",
  // A project conversation promoted to the playing canvas's conversation (promoted.ts), by id only (`{conversationId}`),
  // and its read.
  promoted: "prototype:promoted",
  promotedChanged: "prototype:promotedChanged",
} as const;

export const PROTOTYPE_WINDOW_REQUESTS: readonly string[] = [
  PROTOTYPE_CHANNELS.read, PROTOTYPE_CHANNELS.result, PROTOTYPE_CHANNELS.frames, PROTOTYPE_CHANNELS.reload,
  PROTOTYPE_CHANNELS.back, PROTOTYPE_CHANNELS.forward, PROTOTYPE_CHANNELS.choose, PROTOTYPE_CHANNELS.close,
  PROTOTYPE_CHANNELS.mode, PROTOTYPE_CHANNELS.export, PROTOTYPE_CHANNELS.revealExport, PROTOTYPE_CHANNELS.visible,
  PROTOTYPE_CHANNELS.panel, PROTOTYPE_CHANNELS.showing, PROTOTYPE_CHANNELS.reveal,
  PROTOTYPE_CHANNELS.auth, PROTOTYPE_CHANNELS.work, PROTOTYPE_CHANNELS.composer, PROTOTYPE_CHANNELS.remember, PROTOTYPE_CHANNELS.entry,
  PROTOTYPE_CHANNELS.drawing, PROTOTYPE_CHANNELS.promoted,
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
// `number` is its 1-based position among all `data-doan-frame` elements of that document outside `<template>`, the
// order the board's layout lists, so the drawer numbers a frame as the main frame drawer does.
export interface PrototypeFrame {
  id: string;
  title?: string;
  size: string;
  number: number;
}

export type LostState = "missing" | "duplicate" | "unmarked" | "invalid";

// The prototype script in the run's document posts a RunMessage once and, when that went out before the `load`
// handlers, one FramesMessage after them, both exactly as typed here (a RunMessage has `state`, a FramesMessage does
// not). The host accepts only its current iframe's window, origin "null" and the current `gen`, then forwards the data
// unchanged; main validates it again.
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

// Fit keeps the frame's viewport at its mark and scales it down to the panel; Responsive makes the panel the viewport.
export type PrototypeMode = "fit" | "responsive";

export type PrototypePhase = "loading" | "ready" | "read-failed" | "init-failed" | "frame-unavailable" | "prototype-unavailable";

// `prototype:changed` and the reply to `prototype:read`. A new `gen` with a new `run` means a new iframe. `run` stays
// the last run's while a frame is lost, so the host keeps the frozen screen under the overlay; it is null only before
// any run started. `title` is the frame's title, or its ID without one. `canvas` is the target canvas's label (its file
// stem, as the sidebar names it), the last known one while the canvas is gone. `frames` is empty when the canvas is
// gone.
export interface PrototypeView {
  gen: number;
  // The target's root and its canvas row's path (the last listed one while the canvas is gone): what Export sends back.
  root: string;
  path: string;
  // The target canvas's ID; absent for an ID-less canvas, which its path keys. With root and path it names the canvas
  // whose conversation the panel shows.
  canvasId?: string;
  frame: string;
  title: string;
  canvas: string;
  phase: PrototypePhase;
  detail?: string;
  // The mark is the run's size (its ready size once it answered), 0 x 0 while not known; each iframe keeps its own.
  run: { url: string; markWidth: number; markHeight: number } | null;
  // Main keeps it across runs and close, for as long as the app runs.
  mode: PrototypeMode;
  // A loading run was killed since the last ready one. The window's canvases share one renderer process, so every
  // earlier iframe still on screen died with it: drop iframes older than `gen` and show the latest still image
  // (re-sent under this `gen` before this view). False again once a run is ready.
  previousStopped: boolean;
  frames: PrototypeFrame[];
  canGoBack: boolean;
  canGoForward: boolean;
  // Main keeps it across runs and close, for as long as the app runs.
  panel: PrototypePanel;
  // The target canvas's row in its root's list: present (whatever the run's phase), being read, gone (also an
  // unregistered root or a failed list) or its ID shared by two rows. The panel's composer refuses input while it is
  // gone or shared.
  canvasRow: "present" | "loading" | "gone" | "duplicate";
}

// The conversation panel. `width` is null until the panel first opened; main fits it to the window when it opens.
export interface PrototypePanel {
  open: boolean;
  width: number | null;
}

// `prototype:panel`. A width is the handle's, within the panel's range for the window at the time.
export interface PanelRequest {
  open: boolean;
  width?: number;
}

// `prototype:reveal`, from the prototype window: a person's chip, an answer's chip, Sign in, the drawing project
// conversation's or a notice's Open, and a handoff line's or card's Open.
export type RevealPayload =
  | { kind: "chip"; conversationId: string; anchor: Anchor }
  | { kind: "reply"; conversationId: string; link: ReplyAnchor }
  | { kind: "settings"; provider?: Provider }
  | { kind: "conversation"; conversationId: string }
  | { kind: "handoff"; canvas: Canvas; conversationId?: string };

// `prototype:revealRequest`, main to the main window once the request passed its checks and the window came forward.
// `chip` is a person's chip: the canvas is its conversation's, which may not be the one the main window shows. `reply`
// is an answer's chip as the main window's answer chips go (replyChipTarget). `settings` opens Settings > Agents at the
// provider. `conversation` opens a conversation: on its canvas, or in its root's Overview without one. `handoff` opens
// a canvas of the root, with its panel on the conversation when one is named. The main window decides whether it can
// show it now (a dialog, a page lock or first run keeps everything as it is, with a toast).
export type PrototypeReveal =
  | { kind: "chip"; root: string; canvas: Canvas; conversationId: string; anchor: Anchor }
  | { kind: "reply"; root: string; conversationId: string; link: ReplyAnchor }
  | { kind: "settings"; provider?: Provider }
  | { kind: "conversation"; root: string; conversationId: string; canvas?: Canvas }
  | { kind: "handoff"; root: string; canvas: Canvas; conversationId?: string };

// `prototype:composer`: what the main window's composer reads from preferences and ui-state, without the last project.
export interface PrototypeComposerSettings {
  home: Omit<HomeMemory, "lastRoot"> | null;
  newConversation: NewConversationPreference | null;
  buddy: BuddyId;
}

// `prototype:snapshot`: the iframe area of the window as PNG bytes, captured when a ready run turns failed or
// unavailable and sent before that view. `gen` is the view's gen it belongs under. `box` is where the image was taken
// in the content panel; the window shows it there, even after a mode switch or a refit moved the frame.
export interface PrototypeSnapshot {
  gen: number;
  png: Uint8Array;
  box: Rect;
}

// `prototype:export` and `prototype:exportRunning`: a frame of a listed canvas row.
export interface ExportTarget {
  root: string;
  path: string;
  frame: string;
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
  setMode(mode: PrototypeMode): Promise<void>;
  // Main shows the save panel and runs the CLI; the reply is the canvas row export's.
  export(target: ExportTarget): Promise<ExportReply>;
  revealExport(id: string): Promise<void>;
  onExportRunning(listener: (target: ExportTarget) => void): () => void;
  onWindowVisible(listener: (visible: boolean) => void): () => void;
  setPanel(request: PanelRequest): Promise<void>;
  setShowing(conversationId: string | null): Promise<void>;
  // Main answers nothing back: the main window shows the outcome.
  reveal(request: RevealPayload): Promise<void>;
  readComposerSettings(): Promise<PrototypeComposerSettings | null>;
  onComposerSettings(listener: (settings: PrototypeComposerSettings) => void): () => void;
  rememberChoice(choice: ComposerChoice): Promise<void>;
  readTargetEntry(): Promise<FolderEntry | null>;
  onTargetEntry(listener: (entry: FolderEntry | null) => void): () => void;
  // The project conversation drawing the playing canvas, by id only (null for none); its Open reveals it in the main
  // window as `{kind: "conversation", conversationId}`.
  readDrawing(): Promise<string | null>;
  onDrawing(listener: (conversationId: string | null) => void): () => void;
  // A project conversation promoted to the playing canvas's conversation, by id only (null for none); the panel's
  // promotion notice, whose Open reveals it in the main window.
  readPromoted(): Promise<string | null>;
  onPromoted(listener: (conversationId: string | null) => void): () => void;
}
