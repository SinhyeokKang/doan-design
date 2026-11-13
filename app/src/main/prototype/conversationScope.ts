// The prototype window's conversation panel reaches only the conversations of the canvas it plays (PRODUCT §5 item 2
// 'Prototype window'). Main checks every conversation request, event and reveal of the prototype role here against the
// target as it is when the request arrives, so a request sent before another play is judged by the new target.
// No Electron and no validators (ajv): the renderer imports this file's types, and a value import that reached ajv would
// blank the window under its CSP (POSTMORTEM 2026-10-30).
import type { UiState } from "../../restore/uiState";
import type { AuthSnapshot } from "../agentAuth/ipc";
import type { ConversationHandoffNotice } from "../conversation/handoff";
import type { Preferences } from "../preferences";
import type { Canvas, ConversationEvent, StageSignal } from "../conversation/types";
import type { FolderEntry } from "../view";
import type { WorkItem } from "../workState";
import type { PrototypeComposerSettings, PrototypeReveal, RevealPayload } from "./ipc";
import { resolveTarget, type CanvasKey } from "./targets";

// The canvas the window plays: its root, its key and its row's last listed path (an ID-keyed canvas whose file became
// unreadable is found only by that path, resolveTarget).
export interface PlayingCanvas {
  root: string;
  canvas: CanvasKey;
  path: string;
}

// What main's conversation index says about a conversation; ConversationMetadata has these fields.
export interface ScopedConversation {
  conversationId: string;
  root: string;
  canvas?: Canvas;
}

// Every conversation method the panel's thread, composer and new conversation state call. delete and newDesign are not
// here: the window has no conversation menu and starts only the playing canvas's conversation.
export const PROTOTYPE_CONVERSATION_METHODS: ReadonlySet<string> = new Set([
  "read", "list", "forCanvas", "resumeTarget", "start", "send", "queue", "removeQueued", "sendQueuedNow", "takeDraft", "interrupt",
  "answerPermission", "answerQuestion", "markSeen", "models", "skills", "setPermissionMode", "scheduled",
]);
const ROOT_ONLY: ReadonlySet<string> = new Set(["list", "models", "skills"]);
const BY_CANVAS: ReadonlySet<string> = new Set(["forCanvas", "resumeTarget", "start"]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

// The playing canvas's listed row path, or null while it cannot be judged: the root's list is loading, the row is gone
// or its ID is shared, or the root is not registered. Nothing is guessed then. The run's phase is not looked at, so a
// lost frame or a failed load leaves the panel usable.
function playingRow(playing: PlayingCanvas | null, entries: readonly FolderEntry[]): string | null {
  if (playing === null) return null;
  const resolved = resolveTarget(playing, entries, playing.path);
  return resolved.kind === "present" ? resolved.path : null;
}

// The rule the conversation service admits a canvas by (service.ts resolveListedCanvas): exactly one listed row, by ID,
// else by path.
function listedPath(canvas: Canvas, root: string, entries: readonly FolderEntry[]): string | null {
  const entry = entries.find(candidate => candidate.path === root);
  if (entry === undefined || entry.kind !== "list") return null;
  const matches = entry.canvases.filter(row => canvas.id !== undefined ? row.id === canvas.id : row.path === canvas.path);
  return matches.length === 1 ? matches[0]!.path : null;
}

function canvasValue(value: unknown): Canvas | null {
  const canvas = record(value);
  if (canvas === null || typeof canvas.path !== "string" || (canvas.id !== undefined && typeof canvas.id !== "string")) return null;
  return { path: canvas.path, ...(typeof canvas.id === "string" ? { id: canvas.id } : {}) };
}

// The root is part of every comparison: worktrees of one repository share canvas IDs and paths (POSTMORTEM 2026-11-01).
function onPlayingCanvas(canvas: Canvas | undefined, root: string, playing: PlayingCanvas, row: string, entries: readonly FolderEntry[]): boolean {
  return canvas !== undefined && root === playing.root && listedPath(canvas, root, entries) === row;
}

function conversationInScope(id: unknown, playing: PlayingCanvas, row: string, conversations: readonly ScopedConversation[], entries: readonly FolderEntry[]): ScopedConversation | null {
  const conversation = typeof id === "string" ? conversations.find(candidate => candidate.conversationId === id) : undefined;
  return conversation !== undefined && onPlayingCanvas(conversation.canvas, conversation.root, playing, row, entries) ? conversation : null;
}

// Whether the prototype role may make this conversation request. The request's own shape and limits are still the
// conversation handler's checks; this only keeps it to the playing canvas.
export function prototypeConversationScope(method: string, payload: unknown, playing: PlayingCanvas | null, conversations: readonly ScopedConversation[], entries: readonly FolderEntry[]): boolean {
  const request = record(payload);
  const row = playingRow(playing, entries);
  if (!PROTOTYPE_CONVERSATION_METHODS.has(method) || request === null || playing === null || row === null) return false;
  if (ROOT_ONLY.has(method)) return request.root === playing.root;
  if (BY_CANVAS.has(method)) {
    if (method === "start" && request.mode !== "new" && request.mode !== "resume") return false;
    const canvas = canvasValue(request.canvas);
    return typeof request.root === "string" && canvas !== null && onPlayingCanvas(canvas, request.root, playing, row, entries);
  }
  return conversationInScope(request.conversationId, playing, row, conversations, entries) !== null;
}

// `list` answers the root's every conversation; the prototype role gets the playing canvas's only.
export function prototypeListRows<T extends { canvas?: Canvas }>(rows: readonly T[], playing: PlayingCanvas | null, entries: readonly FolderEntry[]): T[] {
  const row = playingRow(playing, entries);
  if (playing === null || row === null) return [];
  return rows.filter(candidate => onPlayingCanvas(candidate.canvas, playing.root, playing, row, entries));
}

export type ConversationBroadcast =
  | { channel: "conversation:event"; value: ConversationEvent }
  | { channel: "conversation:stage"; value: StageSignal }
  | { channel: "conversation:listChanged"; value: { root: string } }
  | { channel: "conversation:handoff"; value: ConversationHandoffNotice };

// By key, not by the listed row: an event must not be lost while the root's list is being read again, and the panel's
// store merges only what it is sent.
function onPlayingKey(canvas: Canvas | undefined, root: string, playing: PlayingCanvas): boolean {
  if (canvas === undefined || root !== playing.root) return false;
  return "id" in playing.canvas ? canvas.id === playing.canvas.id : canvas.id === undefined && canvas.path === playing.canvas.path;
}

// Whether main also sends this to the prototype window: the playing canvas's conversations' events and stages, the
// playing root's list changes, and a handoff from or to the playing canvas.
export function prototypeReceives(message: ConversationBroadcast, playing: PlayingCanvas | null, conversations: readonly ScopedConversation[]): boolean {
  if (playing === null) return false;
  switch (message.channel) {
    case "conversation:event":
    case "conversation:stage": {
      const id = message.value.conversationId;
      const conversation = conversations.find(candidate => candidate.conversationId === id);
      return conversation !== undefined && onPlayingKey(conversation.canvas, conversation.root, playing);
    }
    case "conversation:listChanged":
      return message.value.root === playing.root;
    case "conversation:handoff": {
      const notice = message.value;
      const targets = "target" in notice ? [notice.target] : notice.targets;
      return [notice.source, ...targets].some(end => onPlayingKey(end.canvas, notice.root, playing));
    }
  }
}

// A reveal the main window may act on, or null. A chip and an answer's chip belong to a conversation of the playing
// canvas; an Open names a conversation or a listed canvas of the playing root (the drawing project conversation and a
// handoff's target are not on the playing canvas). Sign in needs no target.
export function prototypeRevealRequest(payload: RevealPayload, playing: PlayingCanvas | null, conversations: readonly ScopedConversation[], entries: readonly FolderEntry[]): PrototypeReveal | null {
  if (payload.kind === "settings") return { kind: "settings", provider: payload.provider };
  const row = playingRow(playing, entries);
  if (playing === null || row === null) return null;
  const inRoot = (id: string) => conversations.find(candidate => candidate.conversationId === id && candidate.root === playing.root);
  switch (payload.kind) {
    case "chip": {
      const conversation = conversationInScope(payload.conversationId, playing, row, conversations, entries);
      return conversation?.canvas === undefined ? null : { kind: "chip", root: playing.root, canvas: conversation.canvas, conversationId: conversation.conversationId, anchor: payload.anchor };
    }
    case "reply":
      return conversationInScope(payload.conversationId, playing, row, conversations, entries) === null ? null
        : { kind: "reply", root: playing.root, conversationId: payload.conversationId, link: payload.link };
    case "conversation": {
      const conversation = inRoot(payload.conversationId);
      if (conversation === undefined) return null;
      return { kind: "conversation", root: playing.root, conversationId: conversation.conversationId, ...(conversation.canvas ? { canvas: conversation.canvas } : {}) };
    }
    case "handoff": {
      if (listedPath(payload.canvas, playing.root, entries) === null) return null;
      if (payload.conversationId !== undefined && inRoot(payload.conversationId) === undefined) return null;
      return { kind: "handoff", root: playing.root, canvas: payload.canvas, ...(payload.conversationId !== undefined ? { conversationId: payload.conversationId } : {}) };
    }
  }
}

// The terminal session the playing canvas would resume, as main last answered the window's resumeTarget.
export interface ResumeSession {
  session: string;
  runtime: string;
}

// The composer holds its terminal session choice while that session still works in a terminal, in whatever project
// (PRODUCT §5 item 2 'Terminal session'), so the root is not filtered; other sessions' work is not the window's.
export function prototypeWorkItems(items: readonly WorkItem[], held: ResumeSession | null): WorkItem[] {
  if (held === null) return [];
  return items.filter(item => item.session === held.session && item.provider === held.runtime);
}

// Provider readiness for the composer: whether each provider is signed in and can run, never who is signed in. An
// account becomes an empty object, which still says "connected" to the composer's checks.
export function prototypeAuthSnapshot(snapshot: AuthSnapshot): AuthSnapshot {
  return { revision: snapshot.revision, providers: snapshot.providers.map(status => ({ ...status, account: status.account === null ? null : {} })) };
}

// What the composer reads from preferences and ui-state: the New conversations default, Last used and the buddy. The
// last project Home chose is the main window's own.
export function prototypeComposerSettings(ui: UiState | null, preferences: Preferences): PrototypeComposerSettings {
  const home = ui?.home;
  let kept: PrototypeComposerSettings["home"] = null;
  if (home !== undefined) {
    const { lastRoot: _lastRoot, ...rest } = home;
    kept = rest;
  }
  return { home: kept, newConversation: preferences.newConversation, buddy: preferences.buddy ?? "doany" };
}

// The playing root's folder entry, for the panel's body: the list's health and its canvas rows (listed-canvas checks,
// answer chips). Only that root; it carries canvas rows, not conversations.
export function prototypeEntry(entries: readonly FolderEntry[], playing: PlayingCanvas | null): FolderEntry | null {
  return playing === null ? null : entries.find(entry => entry.path === playing.root) ?? null;
}
