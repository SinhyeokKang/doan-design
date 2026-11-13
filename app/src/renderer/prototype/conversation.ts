import type { ConversationSummary } from "../../main/conversation/summary";
import type { Anchor, Canvas } from "../../main/conversation/types";
import type { PrototypeView } from "../../main/prototype/ipc";
import { distinctTargets, sameTarget, toMessage, type FieldSegment } from "../anchorField";
import { sameCanvas } from "../canvasConversationRows";
import type { ListView } from "../conversationStore";
import { carryDraft, type DockedDraft } from "../dockedRules";
import { openButtonBadge } from "../rightPanelOpen";

// The prototype window's conversation panel: which conversation it shows, the playing frame chip every message
// carries, the header's conversation button, and the draft a new current conversation takes over.

// lost: main cannot name the target's canvas row (gone, or its ID shared); the panel then takes no message.
export interface PrototypeConversationTarget { root: string; canvas: Canvas; lost?: "gone" | "duplicate" }
export type PrototypeShown =
  | { kind: "conversation"; conversationId: string }
  | { kind: "new" }
  | { kind: "list_loading" }
  | { kind: "list_error" }
  | { kind: "blocked"; reason: "gone" | "duplicate" };

// Always the canvas's current conversation, never an archived one the main window may show. `list` is the target
// root's list; a failed read shows no conversation, because a send could archive the current one.
export function prototypeShownConversation(list: ListView, target: PrototypeConversationTarget): PrototypeShown {
  if (target.lost) return { kind: "blocked", reason: target.lost };
  if (list === "loading") return { kind: "list_loading" };
  if (list === "error") return { kind: "list_error" };
  const current = list.find(c => c.state === "current" && c.canvas !== undefined && sameCanvas(c.canvas, target.canvas));
  return current ? { kind: "conversation", conversationId: current.conversationId } : { kind: "new" };
}

export type PlayingFrame = NonNullable<Anchor["frame"]>;

const chipOf = (frame: PlayingFrame): FieldSegment => ({ kind: "chip", anchor: { frame } });

// The field as sent: the playing frame's chip first, unless the field already starts with it (a returned draft, Edit
// and resend, a pasted chip). toMessage reuses a place's number, so the same frame elsewhere in the field is still one
// anchor. Null past the place limit, as toMessage.
export function withPlayingFrame(segments: readonly FieldSegment[], frame: PlayingFrame): { text: string; anchors: Anchor[] } | null {
  const first = segments[0];
  if (first?.kind === "chip" && sameTarget(first.anchor, { frame })) return toMessage(segments);
  const chip = chipOf(frame);
  // A space after the chip, so the message and its title read as words; text that starts with one takes none more.
  const gap: FieldSegment[] = first && !(first.kind === "text" && /^\s/.test(first.text)) ? [{ kind: "text", text: " " }] : [];
  return toMessage([chip, ...gap, ...segments]);
}

// The places a send would point at, the playing frame among them, for the field's own limit.
export function playingFrameCount(segments: readonly FieldSegment[], frame: PlayingFrame | null): number {
  return distinctTargets(frame ? [chipOf(frame), ...segments] : segments);
}

export interface PlayingFrameChip { frame: PlayingFrame; name: string; description: string }

// The pinned chip above the composer. The title comes from the run's `frames` only: `view.title` falls back to the id.
// While the next frame loads, the chip is already that frame. A listed row decides even without a title (one removed
// since must not linger); only a frame the run no longer lists keeps the title `last` had for the same id.
export function playingFrameChip(view: PrototypeView | null, last: PlayingFrameChip | null): PlayingFrameChip | null {
  if (!view) return null;
  const id = view.frame;
  const row = view.frames.find(frame => frame.id === id);
  const title = row ? row.title : last?.frame.id === id ? last.frame.title : undefined;
  const name = title ?? id;
  return { frame: { id, ...(title !== undefined ? { title } : {}) }, name, description: `Frame ${name} is sent with each message.` };
}

export type ConversationBadge = "permission" | "working" | "unseen";
export interface ConversationButton { label: "Show conversation" | "Hide conversation"; badge: ConversationBadge | null; name: string }

// The header's one button for the panel. The main window's Show conversation marks (an answer waited for, an unread
// ending) plus working: the window has no agent indicator, and the frame reloads with no visible reason while an
// agent edits. One badge at a time: waiting, then working, then unread. `current` is the conversation the panel shows.
export function conversationButton(open: boolean, current: ConversationSummary | undefined, seen: ReadonlySet<string> = new Set()): ConversationButton {
  if (open) return { label: "Hide conversation", badge: null, name: "Hide conversation" };
  const show = "Show conversation" as const;
  const mark = openButtonBadge(current, false, seen);
  if (mark?.kind === "permission") return { label: show, badge: "permission", name: mark.label };
  if (current?.state === "current" && !current.readError && current.working) return { label: show, badge: "working", name: `${show}, agent is working` };
  return mark ? { label: show, badge: "unseen", name: mark.label } : { label: show, badge: null, name: show };
}

// The canvas's current conversation changed (main started a new one): the draft written for the one before moves to
// it, unless the new one has a draft already.
export function carryPrototypeDraft(drafts: ReadonlyMap<string, DockedDraft>, from: string, to: string): ReadonlyMap<string, DockedDraft> {
  const draft = drafts.get(from);
  if (from === to || !draft || !hasDraft(draft)) return drafts;
  return carryDraft(drafts, from, to);
}
const hasDraft = (draft: DockedDraft) => draft.segments.length > 0 || draft.preset !== null || draft.attachments.length > 0;
