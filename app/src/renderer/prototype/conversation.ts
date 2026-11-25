import type { ConversationSummary } from "../../main/conversation/summary";
import type { Anchor, Canvas } from "../../main/conversation/types";
import type { PrototypeView } from "../../main/prototype/ipc";
import { sameTarget, toMessage, type FieldSegment } from "../anchorField";
import type { CanvasView } from "../canvasRun";
import { frameTitle } from "../canvasTree";
import { openButtonBadge } from "../rightPanelOpen";

// lost: main cannot name the target's canvas row; the panel then takes no message.
export interface PrototypeConversationTarget { root: string; canvas: Canvas; lost?: "gone" | "duplicate" }
export type PrototypeShown =
  | { kind: "conversation"; conversationId: string }
  | { kind: "new" }
  | { kind: "list_loading" }
  | { kind: "list_error" }
  | { kind: "blocked"; reason: "gone" | "duplicate" };

// The window's own canvas run, so the two windows may show different conversations.
export function prototypeShown(view: CanvasView | null, target: PrototypeConversationTarget, rowLoading = false): PrototypeShown {
  if (target.lost) return { kind: "blocked", reason: target.lost };
  if (rowLoading || view === null || view.kind === "wait") return { kind: "list_loading" };
  if (view.kind === "new") return view.listError ? { kind: "list_error" } : { kind: "new" };
  return { kind: "conversation", conversationId: view.conversationId };
}

export type PlayingFrame = NonNullable<Anchor["frame"]>;

const chipOf = (frame: PlayingFrame): FieldSegment => ({ kind: "chip", anchor: { frame } });

// toMessage reuses a place's number, so the same frame elsewhere in the field is still one anchor.
export function withPlayingFrame(segments: readonly FieldSegment[], frame: PlayingFrame): { text: string; anchors: Anchor[] } | null {
  const first = segments[0];
  if (first?.kind === "chip" && sameTarget(first.anchor, { frame })) return toMessage(segments);
  const chip = chipOf(frame);
  // A space after the chip, so the message and its title read as words.
  const gap: FieldSegment[] = first && !(first.kind === "text" && /^\s/.test(first.text)) ? [{ kind: "text", text: " " }] : [];
  return toMessage([chip, ...gap, ...segments]);
}

export interface PlayingFrameChip { frame: PlayingFrame; name: string; description: string }

// `view.title` falls back to the id, so the title comes from `frames` only. Only a frame the run no longer lists keeps
// the title `last` had for the same id.
export function playingFrameChip(view: PrototypeView | null, last: PlayingFrameChip | null): PlayingFrameChip | null {
  if (!view) return null;
  const id = view.frame;
  const row = view.frames.find(frame => frame.id === id);
  const title = row ? row.title : last?.frame.id === id ? last.frame.title : undefined;
  const name = frameTitle(title) ?? id;
  return { frame: { id, ...(title !== undefined ? { title } : {}) }, name, description: `Frame ${name} is sent with each message.` };
}

export type ConversationBadge = "permission" | "working" | "unseen";
export interface ConversationButton { label: "Show conversation"; badge: ConversationBadge | null; name: string }

// The main window's badge marks plus working: this window has no agent indicator and the frame reloads while an
// agent edits. One badge: waiting, then working, then unread.
export function conversationButton(current: ConversationSummary | undefined, seen: ReadonlySet<string> = new Set()): ConversationButton {
  const show = "Show conversation" as const;
  const mark = openButtonBadge(current, false, seen);
  if (mark?.kind === "permission") return { label: show, badge: "permission", name: mark.label };
  if (current && !current.readError && current.working) return { label: show, badge: "working", name: `${show}, agent is working` };
  return mark ? { label: show, badge: "unseen", name: mark.label } : { label: show, badge: null, name: show };
}

// A list never read is the new conversation state, so it is named so, as in the main window.
export function prototypeHeadTitle(shown: PrototypeShown, title: string): string {
  if (shown.kind === "list_loading" || shown.kind === "blocked" || title === "") return "Conversation";
  return title;
}
