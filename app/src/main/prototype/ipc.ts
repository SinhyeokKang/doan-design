import type { HomeMemory } from "../../restore/uiState";
import type { BuddyId } from "../../renderer/buddies";
import type { ComposerChoice } from "../../renderer/rememberChoice";
import type { Provider } from "../agentAuth/types";
import type { ExportReply } from "../canvasExport";
import type { ConversationError } from "../conversation/ipc";
import type { ReplyAnchor } from "../conversation/replyAnchor";
import type { ConversationSummary } from "../conversation/summary";
import type { Anchor, Canvas } from "../conversation/types";
import type { NewConversationPreference } from "../preferences";
import type { FolderEntry } from "../view";
import type { Rect } from "./fit";
import type { PrototypeSize } from "./mark";

// Events to the prototype window: `changed`, `snapshot`, `exportRunning`, `visible` (also its request for the first value);
// `closed` goes to the main window and `play` is its request; every other channel is the prototype window's request.
export const PROTOTYPE_CHANNELS = {
  play: "prototype:play",
  read: "prototype:read",
  changed: "prototype:changed",
  result: "prototype:result",
  frames: "prototype:frames",
  // A link the run's document followed (GotoMessage); main judges it against its own run.
  goto: "prototype:goto",
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
  // The composer's narrow reads, each with its push: provider readiness without identity, the resumable session's work,
  // and the composer settings. A full account, settings or work read stays the main window's.
  auth: "prototype:auth",
  authChanged: "prototype:authChanged",
  work: "prototype:work",
  workChanged: "prototype:workChanged",
  composer: "prototype:composer",
  composerChanged: "prototype:composerChanged",
  // The conversation the main window last showed on the playing canvas (its ui-state), by id only; the window reads
  // nothing else of ui-state and never writes it.
  rememberedConversation: "prototype:rememberedConversation",
  // Whether a conversation is still indexed under the playing root (conversationScope.ts prototypeConversationListed):
  // `{root, conversationId}` → boolean | null.
  conversationListed: "prototype:conversationListed",
  // Main hands it to the main window, which owns ui-state and applies it as its own composer's pick: a write from main
  // would be lost to the main window's next whole-file save.
  remember: "prototype:remember",
  // The playing root's folder entry (its canvas rows) and its changes; the window reads it again when the view's root
  // changes.
  entry: "prototype:entry",
  entryChanged: "prototype:entryChanged",
  // To the main window: a checked reveal (PrototypeReveal) and a Last used pick (ComposerChoice).
  revealRequest: "prototype:revealRequest",
  lastUsed: "prototype:lastUsed",
  // To the main window: the frame the window plays (PrototypePlaying | null) whenever it changes, and the main window's
  // read of it. The toolbar's frame drawer marks that row while it is a frame of the canvas the main window shows.
  playing: "prototype:playing",
} as const;

export const PROTOTYPE_WINDOW_REQUESTS: readonly string[] = [
  PROTOTYPE_CHANNELS.read, PROTOTYPE_CHANNELS.result, PROTOTYPE_CHANNELS.frames, PROTOTYPE_CHANNELS.goto, PROTOTYPE_CHANNELS.reload,
  PROTOTYPE_CHANNELS.back, PROTOTYPE_CHANNELS.forward, PROTOTYPE_CHANNELS.choose, PROTOTYPE_CHANNELS.close,
  PROTOTYPE_CHANNELS.mode, PROTOTYPE_CHANNELS.export, PROTOTYPE_CHANNELS.revealExport, PROTOTYPE_CHANNELS.visible,
  PROTOTYPE_CHANNELS.panel, PROTOTYPE_CHANNELS.showing, PROTOTYPE_CHANNELS.reveal,
  PROTOTYPE_CHANNELS.auth, PROTOTYPE_CHANNELS.work, PROTOTYPE_CHANNELS.composer, PROTOTYPE_CHANNELS.remember, PROTOTYPE_CHANNELS.entry,
  PROTOTYPE_CHANNELS.rememberedConversation, PROTOTYPE_CHANNELS.conversationListed,
];

// From the moment the host sets the iframe's src. Canvases answer well within this; the margin is for slow external
// scripts. A document that blocks its parser never answers at all.
export const PROTOTYPE_LOAD_TIMEOUT_MS = 10_000;

// `prototype:play` from the main window. `mark` is the selected frame's raw mark from the live layout, a size hint
// only: main parses it, builds the URL from its own list and judges the frame in the run's document.
export interface PlayRequest {
  root: string;
  path: string;
  frame: string;
  mark: string;
}

// A unique, non-empty ID with a valid mark, in document order. `number` is its 1-based position among all
// `data-doan-frame` elements outside `<template>`, so the drawer numbers a frame as the main frame drawer does.
export interface PrototypeFrame {
  id: string;
  title?: string;
  size: string;
  number: number;
}

export type LostState = "missing" | "duplicate" | "unmarked" | "invalid";

// A `data-doan-goto` link outside `<template>`: its raw value and the raw ids of the frames around it, outermost first.
// A value or id over 200 UTF-16 units is left out rather than cut, so groups come from raw ids as the fixture defines.
export interface PrototypeGoto {
  value: string;
  frames: string[];
}

// Posted once, plus one FramesMessage after `load` handlers if later; the host tells them apart by `state`. It accepts only
// its current iframe, origin "null" and current `gen`, forwards the data unchanged, and main validates it again.
export type RunMessage =
  | { gen: number; state: "ready"; size: string; frames: PrototypeFrame[]; gotos: PrototypeGoto[] }
  | { gen: number; state: LostState; frames: PrototypeFrame[]; gotos: PrototypeGoto[] }
  | { gen: number; state: "timeout" };

// What main acts on once a message is validated.
export type RunReport =
  | { gen: number; state: "ready"; size: PrototypeSize; frames: PrototypeFrame[]; gotos: PrototypeGoto[] }
  | { gen: number; state: LostState; frames: PrototypeFrame[]; gotos: PrototypeGoto[] }
  | { gen: number; state: "timeout" };

// `prototype:frames`: the drawer list the run sends after the `load` handlers, when its result went out earlier.
export interface FramesMessage {
  gen: number;
  frames: PrototypeFrame[];
  gotos: PrototypeGoto[];
}

// A click on a link inside the playing frame that the canvas did not default-prevent, posted by the prototype script
// after a 0 ms timer. `goto` is the link's raw value, or null when it is over 200 UTF-16 units (no frame can have it).
export interface GotoMessage {
  gen: number;
  goto: string | null;
}

// Fit keeps the frame's viewport at its mark and scales it down to the panel; Responsive makes the panel the viewport.
export type PrototypeMode = "fit" | "responsive";

export type PrototypePhase = "loading" | "ready" | "read-failed" | "init-failed" | "frame-unavailable" | "prototype-unavailable";

// A new `gen` with a new `run` means a new iframe. `run` stays the last run's while a frame is lost, so the frozen screen
// stays under the overlay. `canvas` keeps the last known label while the canvas is gone; `frames` is then empty.
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
  // The window's canvases share one renderer process, so a killed loading run took every earlier iframe with it: drop
  // those older than `gen` and show the latest still. False again once a run is ready.
  previousStopped: boolean;
  frames: PrototypeFrame[];
  // The current run's links, for the drawer's groups; kept and cleared with `frames`.
  gotos: PrototypeGoto[];
  canGoBack: boolean;
  canGoForward: boolean;
  // Main keeps it across runs and close, for as long as the app runs.
  panel: PrototypePanel;
  // The target canvas's row in its root's list (gone also covers an unregistered root or a failed list). The composer
  // refuses input while it is gone or shared.
  canvasRow: "present" | "loading" | "gone" | "duplicate";
}

// `prototype:playing`: the playing target as the main window names a canvas (its root, its row's last listed path and
// its ID when it has one) and the frame.
export interface PrototypePlaying {
  root: string;
  canvas: { path: string; id?: string };
  frame: string;
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

// `prototype:reveal`, from the prototype window: a person's chip, an answer's chip, Sign in, a notice's Open, and a
// handoff line's or card's Open.
export type RevealPayload =
  | { kind: "chip"; conversationId: string; anchor: Anchor }
  | { kind: "reply"; conversationId: string; link: ReplyAnchor }
  | { kind: "settings"; provider?: Provider }
  | { kind: "conversation"; conversationId: string }
  | { kind: "handoff"; canvas: Canvas; conversationId?: string };

// `prototype:revealRequest`, main to the main window once the request passed its checks and the window came forward.
// The main window decides whether it can show it now (a dialog, a page lock or first run keeps everything, with a toast).
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

// Captured when a ready run turns failed or unavailable and sent before that view, under its `gen`. `box` is where it was
// taken in the content panel; the window shows it there even after a mode switch or resize.
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
  goto(message: GotoMessage): Promise<void>;
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
  rememberedConversation(): Promise<string | null>;
  onComposerSettings(listener: (settings: PrototypeComposerSettings) => void): () => void;
  rememberChoice(choice: ComposerChoice): Promise<void>;
  readTargetEntry(): Promise<FolderEntry | null>;
  onTargetEntry(listener: (entry: FolderEntry | null) => void): () => void;
  // null when root is not the playing root or main cannot tell; ask again on a `conversation:listChanged` of that root.
  conversationListed(request: { root: string; conversationId: string }): Promise<boolean | null>;
  // The main window's `conversation:list`, naming the canvas the window shows: main answers its rows only while it
  // plays that canvas, else `{error: "not_playing"}` (the view of the new target follows).
  listConversations(request: { root: string; canvas: Canvas }): Promise<ConversationSummary[] | ConversationError>;
}
