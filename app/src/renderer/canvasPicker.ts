import { LIMITS } from "../main/conversation/messageText";
import type { Anchor } from "../main/conversation/types";
import type { SelectTarget } from "./canvasMessage";

// Pick from canvas and chip locate (buzz-canvas-conversation design §2 'Picker', 'Chip locate').

export const PICKER_UNAVAILABLE = "Pick from canvas isn’t available while the canvas can’t be shown.";
export const ANCHOR_LIMIT_TEXT = `A message can point at up to ${LIMITS.anchors} places. Remove one to add another.`;

export type CanvasLoad = "loaded" | "loading" | "failed" | "noWidth" | "unlisted";

// The picker, Add to conversation and ⌘L. `composer` is the composer's reason line while it takes no input (null: it
// does); `chips` the different places the draft already points at. A disabled control keeps its reason as a tooltip.
export function pickerAvailability(composer: string | null, canvas: CanvasLoad, chips: number): { enabled: boolean; reason: string | null } {
  if (canvas !== "loaded") return { enabled: false, reason: PICKER_UNAVAILABLE };
  if (composer !== null) return { enabled: false, reason: composer };
  if (chips >= LIMITS.anchors) return { enabled: false, reason: ANCHOR_LIMIT_TEXT };
  return { enabled: true, reason: null };
}

export interface Rect { x: number; y: number; width: number; height: number }
export interface PickFrame extends Rect { id: string; title?: string }

const inside = (p: { x: number; y: number }, r: Rect) => p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height;

// A click on an empty spot, in the canvas document's coordinates: a point in the innermost frame under it, as an offset
// from that frame. Outside every frame there is no anchor: board coordinates are the app's own layout, which an agent
// cannot relate to the HTML.
export function pointAnchor(click: { x: number; y: number }, frames: readonly PickFrame[]): Anchor | null {
  if (!Number.isFinite(click.x) || !Number.isFinite(click.y)) return null;
  let best: PickFrame | null = null;
  for (const frame of frames) {
    if (![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) || !inside(click, frame)) continue;
    // Nested frames: the smallest one holding the click is the innermost; a later frame wins a tie, as it draws on top.
    if (!best || frame.width * frame.height <= best.width * best.height) best = frame;
  }
  if (!best) return null;
  const dx = Math.round(click.x - best.x), dy = Math.round(click.y - best.y);
  return { frame: { id: best.id, ...(best.title ? { title: best.title } : {}) }, point: { frameId: best.id, dx, dy } };
}

// A picked or selected frame or element as a chip's anchor: only what an agent can find in the HTML. null: neither.
export function targetAnchor(target: Omit<SelectTarget, "rect">): Anchor | null {
  const frame = target.frame && { id: target.frame.id, ...(target.frame.title === undefined ? {} : { title: target.frame.title }) };
  if (!target.element) return frame ? { frame } : null;
  const { doanId, selector, text } = target.element;
  const element = { ...(doanId === undefined ? {} : { doanId }), selector, ...(text === undefined ? {} : { text }), tag: target.tag };
  return frame ? { frame, element } : { element };
}

// The canvas script's anchors reply for one chip: candidate nodes per lookup and the rects of those nodes.
export interface ChipReply {
  candidates: { doanId?: readonly string[]; selector?: readonly string[] | null; frame?: readonly string[] };
  rects: ReadonlyMap<string, Rect>;
}
export type ChipTarget =
  | { kind: "unavailable" }
  | { kind: "missing" }
  | { kind: "node"; node: string; rect: Rect }
  | { kind: "point"; node: string; x: number; y: number };

const unique = (nodes: readonly string[] | null | undefined) => (nodes?.length === 1 ? nodes[0]! : null);

// reply null: the canvas is not loaded, so locate is disabled. An element is its unique doan-id, else its unique
// selector; a frame its id; a point its frame's offset, missing once the frame is gone.
export function resolveChipTarget(anchor: Anchor, reply: ChipReply | null): ChipTarget {
  if (!reply) return { kind: "unavailable" };
  if (anchor.element) {
    const node = (anchor.element.doanId ? unique(reply.candidates.doanId) : null) ?? unique(reply.candidates.selector);
    const rect = node === null ? undefined : reply.rects.get(node);
    return node !== null && rect ? { kind: "node", node, rect } : { kind: "missing" };
  }
  const node = unique(reply.candidates.frame);
  const rect = node === null ? undefined : reply.rects.get(node);
  if (node === null || !rect) return { kind: "missing" };
  if (anchor.point) return { kind: "point", node, x: rect.x + anchor.point.dx, y: rect.y + anchor.point.dy };
  return anchor.frame ? { kind: "node", node, rect } : { kind: "missing" };
}
