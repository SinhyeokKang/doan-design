import { chipLabel, LIMITS, splitMarkers } from "../main/conversation/messageText";
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

// Positions in a field are units: every UTF-16 code unit of text is one (a line break is "\n") and a chip is exactly
// one, so a caret stands before or after a chip, never inside it. The chip field (chipField.ts) edits through these.

// Adjacent text joins and empty text drops, so two fields with the same content compare equal.
export function normalize(segments: readonly FieldSegment[]): FieldSegment[] {
  const out: FieldSegment[] = [];
  for (const segment of segments) {
    if (segment.kind === "text") {
      if (segment.text === "") continue;
      const last = out[out.length - 1];
      if (last?.kind === "text") { out[out.length - 1] = { kind: "text", text: last.text + segment.text }; continue; }
    }
    out.push(segment);
  }
  return out;
}

// A typed string as field segments (Home, and Overview's suggested prompts).
export function textSegments(text: string): FieldSegment[] {
  return text === "" ? [] : [{ kind: "text", text }];
}

const unitsOf = (segment: FieldSegment) => (segment.kind === "text" ? segment.text.length : 1);
export function unitLength(segments: readonly FieldSegment[]): number {
  return segments.reduce((sum, segment) => sum + unitsOf(segment), 0);
}

export function sliceUnits(segments: readonly FieldSegment[], start: number, end: number): FieldSegment[] {
  const out: FieldSegment[] = [];
  let at = 0;
  for (const segment of segments) {
    const length = unitsOf(segment), from = Math.max(start, at), to = Math.min(end, at + length);
    if (from < to) out.push(segment.kind === "text" ? { kind: "text", text: segment.text.slice(from - at, to - at) } : segment);
    at += length;
  }
  return normalize(out);
}

// Units [start, end) replaced by `inserted`; the caret lands after the insertion.
export function spliceUnits(segments: readonly FieldSegment[], start: number, end: number, inserted: readonly FieldSegment[]): { segments: FieldSegment[]; caret: number } {
  const next = normalize([...sliceUnits(segments, 0, start), ...inserted, ...sliceUnits(segments, end, unitLength(segments))]);
  return { segments: next, caret: start + unitLength(inserted) };
}

export function chipAt(segments: readonly FieldSegment[], unit: number): Anchor | null {
  let at = 0;
  for (const segment of segments) {
    const length = unitsOf(segment);
    if (unit >= at && unit < at + length) return segment.kind === "chip" ? segment.anchor : null;
    at += length;
  }
  return null;
}

// The hard line around [start, end): from after the line break before `start` to the line break at or after `end`.
export function hardLine(segments: readonly FieldSegment[], start: number, end: number): [number, number] {
  let from = 0, to = unitLength(segments), at = 0;
  for (const segment of segments) {
    if (segment.kind === "text") {
      for (let i = 0; i < segment.text.length; i++) {
        if (segment.text[i] !== "\n") continue;
        const unit = at + i;
        if (unit < start) from = unit + 1;
        else if (unit >= end && unit < to) to = unit;
      }
    }
    at += unitsOf(segment);
  }
  return [from, to];
}

// What leaves Doan as plain text (a paste into another app, a field that takes no chips): chips read as their names.
export function plainText(segments: readonly FieldSegment[]): string {
  return segments.map(segment => (segment.kind === "text" ? segment.text : chipLabel(segment.anchor).label)).join("");
}

// Only the person's own text, chips left out: the `/` list and Home read it.
export function typedText(segments: readonly FieldSegment[]): string {
  return segments.map(segment => (segment.kind === "text" ? segment.text : "")).join("");
}

// Something to send: a chip, or text that is more than whitespace.
export function hasContent(segments: readonly FieldSegment[]): boolean {
  return segments.some(segment => segment.kind === "chip" || segment.text.trim() !== "");
}

// Labels count here, unlike sameTarget: a renamed frame must be drawn again.
export function sameSegments(a: readonly FieldSegment[], b: readonly FieldSegment[]): boolean {
  return a.length === b.length && a.every((segment, i) => {
    const other = b[i]!;
    if (segment.kind === "text") return other.kind === "text" && other.text === segment.text;
    return other.kind === "chip" && (other.anchor === segment.anchor || JSON.stringify(other.anchor) === JSON.stringify(segment.anchor));
  });
}
