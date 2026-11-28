import { canvasKind } from "../formats/canvasPath";
import { chipLabel, LIMITS, splitMarkers } from "../main/conversation/messageText";
import type { Anchor } from "../main/conversation/types";

// The composer and main exchange it as {text, anchors}, where each chip is a {{n}} marker.
export type FieldSegment = { kind: "text"; text: string } | { kind: "chip"; anchor: Anchor };

// Names, excerpts and canvas paths are labels only, so a renamed frame or a moved canvas is still the same target.
function targetKey(anchor: Anchor): string {
  const { frame, element, point, canvas } = anchor;
  return JSON.stringify([frame?.id ?? null, element ? [element.doanId ?? null, element.selector] : null, point ? [point.frameId ?? null, point.dx, point.dy] : null, canvas?.id ?? null]);
}
export function sameTarget(a: Anchor, b: Anchor): boolean { return targetKey(a) === targetKey(b); }

// LIMITS.anchors bounds it.
export function distinctTargets(segments: readonly FieldSegment[]): number {
  return new Set(segments.flatMap(s => (s.kind === "chip" ? [targetKey(s.anchor)] : []))).size;
}

// The same place again reuses its number (main allows repeats). Null past LIMITS.anchors different places: main would
// refuse the message.
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

// Anchors no marker names are dropped; a marker past the anchors stays text, so draftProblem still stops it.
export function fromMessage(text: string, anchors: readonly Anchor[]): FieldSegment[] {
  return splitMarkers(text, anchors.length).map(part => ("n" in part ? { kind: "chip", anchor: anchors[part.n - 1]! } : { kind: "text", text: part.text }));
}

// Units: every UTF-16 code unit of text is one and a chip is exactly one, so a caret never stands inside a chip.

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

// The caret lands after the insertion.
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

// Chips read as their names.
export function plainText(segments: readonly FieldSegment[]): string {
  return segments.map(segment => (segment.kind === "text" ? segment.text : chipLabel(segment.anchor).label)).join("");
}

// The `/` list and Home read it.
export function typedText(segments: readonly FieldSegment[]): string {
  return segments.map(segment => (segment.kind === "text" ? segment.text : "")).join("");
}

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

// Chromium cannot hold a caret before a contenteditable=false element at a line's start, so ChipField draws this
// filler there; a U+200B the person typed is text like any other.
export const FILLER = "​";
export function isLineStart(segments: readonly FieldSegment[], unit: number): boolean {
  if (unit === 0) return true;
  let at = 0;
  for (const segment of segments) {
    const length = segment.kind === "text" ? segment.text.length : 1;
    if (unit - 1 < at + length) return segment.kind === "text" && segment.text[unit - 1 - at] === "\n";
    at += length;
  }
  return false;
}
// A typed {{1}} next to a chip must come back as typed text, which a marker string cannot tell apart.
// root: the field's root, which canvas chips are judged by; scope is null in a field that takes no frame chips.
export function writeFieldClipboard(scope: string | null, segments: readonly FieldSegment[], root: string | null = null): string {
  return JSON.stringify({ v: 1, scope, ...(root === null ? {} : { root }), segments });
}
// Each chip alone: a canvas chip stays one in a field of its root, any other in a field of its canvas, and a new place
// past LIMITS.anchors with `kept` (what the field keeps, reserved chips included) becomes its name. A canvas path is
// checked here because isAnchor checks types only. null: paste the plain text.
export function pasteFieldClipboard(raw: string, here: { scope: string | null; root: string | null }, kept: readonly FieldSegment[]): FieldSegment[] | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isObject(value)) return null;
  const { v, scope, root, segments } = value;
  if (v !== 1 || (scope !== null && typeof scope !== "string") || (root !== undefined && typeof root !== "string") || !Array.isArray(segments)) return null;
  const valid = segments.every((segment: unknown) => {
    if (!isObject(segment)) return false;
    return segment.kind === "text" ? typeof segment.text === "string" : segment.kind === "chip" && isAnchor(segment.anchor);
  });
  if (!valid) return null;
  const places = new Set(kept.flatMap(segment => (segment.kind === "chip" ? [targetKey(segment.anchor)] : [])));
  return normalize((segments as FieldSegment[]).map(segment => {
    if (segment.kind === "text") return segment;
    const { canvas } = segment.anchor;
    const fits = canvas ? here.root !== null && root === here.root && canvasKind(canvas.path) !== null : here.scope !== null && scope === here.scope;
    const key = targetKey(segment.anchor);
    if (fits && (places.has(key) || places.size < LIMITS.anchors)) { places.add(key); return segment; }
    return { kind: "text", text: chipLabel(segment.anchor).label };
  }));
}

// The composer chip's and the sent chip's icon: a design-system canvas has the sidebar's ds row icon.
export function chipIcon(anchor: Anchor): "frame" | "element" | "point" | "canvas" | "ds" {
  if (anchor.canvas) return canvasKind(anchor.canvas.path) === "ds" ? "ds" : "canvas";
  return chipLabel(anchor).kind;
}

// A pressed canvas chip leaves the conversation, so its tooltip says where to first; the open canvas's chip only fits.
export function canvasChipTip(canvas: { path: string; id: string }, { open, pressable }: { open: string | null; pressable: boolean }): string[] {
  return pressable && canvas.id !== open ? [`Open ${chipLabel({ canvas }).label}`, canvas.path] : [canvas.path];
}

type Fields = Record<string, unknown>;
const isObject = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);
const optional = (value: unknown, type: "string" | "number") => value === undefined || (type === "number" ? typeof value === "number" && Number.isFinite(value) : typeof value === type);
// Every member chipLabel and toMessage read is typed as declared (types.ts).
function isAnchor(value: unknown): boolean {
  if (!isObject(value)) return false;
  const { frame, element, point, canvas } = value;
  if (canvas !== undefined) return frame === undefined && element === undefined && point === undefined && isObject(canvas) && typeof canvas.path === "string" && typeof canvas.id === "string";
  if (frame === undefined && element === undefined && point === undefined) return false;
  if (frame !== undefined && !(isObject(frame) && typeof frame.id === "string" && optional(frame.title, "string"))) return false;
  if (element !== undefined && !(isObject(element) && typeof element.selector === "string" && optional(element.doanId, "string") && optional(element.text, "string") && optional(element.tag, "string"))) return false;
  if (point !== undefined && !(isObject(point) && optional(point.frameId, "string") && typeof point.dx === "number" && Number.isFinite(point.dx) && typeof point.dy === "number" && Number.isFinite(point.dy))) return false;
  return true;
}
