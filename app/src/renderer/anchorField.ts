import { LIMITS, splitMarkers } from "../main/conversation/messageText";
import type { Anchor } from "../main/conversation/types";

// The chip field's value (buzz-canvas-conversation design §2 'Chip field'): typed text and inline chips in order. The
// composer and main exchange it as {text, anchors}, where each chip is a {{n}} marker.
export type FieldSegment = { kind: "text"; text: string } | { kind: "chip"; anchor: Anchor };

// What makes two chips the same place: the frame, the element's doan-id and selector, the point's frame and offset.
// Names and excerpts are labels only, so a renamed frame is still the same target.
function targetKey(anchor: Anchor): string {
  const { frame, element, point } = anchor;
  return JSON.stringify([frame?.id ?? null, element ? [element.doanId ?? null, element.selector] : null, point ? [point.frameId ?? null, point.dx, point.dy] : null]);
}
export function sameTarget(a: Anchor, b: Anchor): boolean { return targetKey(a) === targetKey(b); }

// The number of different places the segments point at, which LIMITS.anchors bounds.
export function distinctTargets(segments: readonly FieldSegment[]): number {
  return new Set(segments.flatMap(s => (s.kind === "chip" ? [targetKey(s.anchor)] : []))).size;
}

// Markers count from 1 in order of first appearance; the same place again reuses its number (main allows repeats).
// Null past LIMITS.anchors different places: main would refuse the message.
export function toMessage(segments: readonly FieldSegment[]): { text: string; anchors: Anchor[] } | null {
  const numbers = new Map<string, number>(), anchors: Anchor[] = [];
  let text = "";
  for (const segment of segments) {
    if (segment.kind === "text") { text += segment.text; continue; }
    const key = targetKey(segment.anchor);
    let n = numbers.get(key);
    if (n === undefined) { anchors.push(segment.anchor); n = anchors.length; numbers.set(key, n); }
    text += `{{${n}}}`;
  }
  return anchors.length > LIMITS.anchors ? null : { text, anchors };
}

// A sent message, a returned draft or combineQueued's result drawn back as chips. Anchors no marker names are dropped;
// a marker past the anchors stays text, so draftProblem still stops it.
export function fromMessage(text: string, anchors: readonly Anchor[]): FieldSegment[] {
  return splitMarkers(text, anchors.length).map(part => ("n" in part ? { kind: "chip", anchor: anchors[part.n - 1]! } : { kind: "text", text: part.text }));
}
