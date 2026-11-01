// Validation for messages from the script injected into a canvas iframe. The
// canvas's own scripts share that window and can post anything, so every field
// is checked and copied into a fresh object; nothing is trusted by shape.

import type { TargetCandidates, PinGeometry } from "../comments/projection";
import type { SelectionElement } from "../formats/types";

export const MAX_FRAMES = 1000;
export const MAX_STRING = 200;
// UTF-16 code units, as `String.length` counts them.
export const MAX_HREF = 8192;
// Selection caps (design 'length caps'). Over a cap the whole message is
// dropped: the script clips before sending, so only a forged message is over.
export const MAX_SELECTOR = 1000;
export const MAX_VALUE = 500;
// Code points, as the schema's maxLength counts them.
export const MAX_HTML = 2000;
export const MAX_TEXT = 500;
export const MAX_PATH = 32;

export interface CanvasFrameRect {
  id: string;
  title?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// In the iframe's own viewport (getBoundingClientRect), which is board
// coordinates while the canvas document does not scroll inside the iframe.
export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutMessage {
  type: "layout";
  document?: string;
  href: string;
  height: number;
  // The canvas's innerHeight when it measured `height`.
  viewport: number;
  frames: CanvasFrameRect[];
  truncated: boolean;
  // Only while the script has a selection; null once it lost the element.
  seq?: number;
  selected?: CanvasRect | null;
}

// `seq` belongs to the hover channel for hover/Alt, and to the selection
// channel for select/clear/Escape and selected layout. Channels reset on load.
interface SelectionMessageBase {
  href: string;
  seq: number;
  viewport: number;
}

export interface HoverMessage extends SelectionMessageBase {
  type: "hover";
  rect: CanvasRect | null;
}

export interface PathItem {
  label: string;
  selector: string;
  doanId?: string;
}

export interface SelectTarget {
  rect: CanvasRect;
  tag: string;
  frame?: { id: string; title?: string; implements?: string };
  // Position in `layout.frames`; absent past the 1,000 listed.
  frameIndex?: number;
  // Absent for a frame selection.
  element?: SelectionElement;
  path: PathItem[];
  interactive?: "link" | "control";
}

export interface SelectMessage extends SelectionMessageBase {
  type: "select";
  // null: the script could not find the anchor it was asked for.
  target: SelectTarget | null;
  // The command this selection answers; absent for a click, which can share
  // the seq of a command the script then drops.
  answer?: "select-anchor";
}

export interface ClearMessage extends SelectionMessageBase {
  type: "clear";
}

export type KeyMessage = SelectionMessageBase & { type: "key" } & (
  { key: "Escape" } | { key: "Alt"; alt: boolean }
);

export type SelectionMessage = HoverMessage | SelectMessage | ClearMessage | KeyMessage;

export interface WheelMessage {
  type: "wheel";
  dx: number;
  dy: number;
  ctrl: boolean;
  meta: boolean;
  deltaMode: 0 | 1 | 2;
  x: number;
  y: number;
}

export interface AnchorsMessage {
  type: "anchors";
  href: string;
  document: string;
  generation: number;
  request: number;
  revision: number;
  viewport: number;
  width: number;
  selected: string | null;
  selectionSeq: number;
  results: { id: string; candidates: TargetCandidates }[];
  rects: (PinGeometry & { node: string })[];
}

// The canvas's answer to the app's pick (buzz-canvas-conversation design §4). `pick` is the seq of the pick-start
// command it answers, on the pick channel's own seq that neither clicks nor selection or hover commands move; the
// message type is the reply marker, so no selection reply can complete a pick. Exactly one of: the element or frame
// under the click; a Shift-clicked spot, in the canvas document's coordinates; Esc pressed inside the canvas.
export type PickedMessage = { type: "picked"; href: string; pick: number } & ({ target: SelectTarget } | { point: { x: number; y: number } } | { cancelled: true });

export type CanvasMessage = LayoutMessage | WheelMessage | SelectionMessage | AnchorsMessage | PickedMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegative(value: unknown): value is number {
  return finite(value) && value >= 0;
}

// Returns whether the text was cut so the caller can raise `truncated`.
function clip(text: string): { text: string; cut: boolean } {
  if (text.length <= MAX_STRING) return { text, cut: false };
  let end = MAX_STRING;
  // Do not leave half of a surrogate pair at the cut.
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return { text: text.slice(0, end), cut: true };
}

function seqValue(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function within(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function codePointsWithin(value: unknown, max: number): value is string {
  if (typeof value !== "string") return false;
  if (value.length <= max) return true;
  // Each code point is one or two units, so over 2 × max units is always over.
  if (value.length > max * 2) return false;
  let count = 0;
  for (const _ of value) if (++count > max) return false;
  return true;
}

function parseRect(raw: unknown): CanvasRect | null {
  if (!isRecord(raw)) return null;
  const { x, y, width, height } = raw;
  if (!finite(x) || !finite(y) || !nonNegative(width) || !nonNegative(height)) return null;
  return { x, y, width, height };
}

export function parseCanvasMessage(data: unknown): CanvasMessage | null {
  if (!isRecord(data)) return null;
  if (data.type === "anchors") return parseAnchors(data);
  if (data.type === "picked") return parsePicked(data);
  if (data.type === "layout") return parseLayout(data);
  if (data.type === "wheel") return parseWheel(data);
  if (data.type === "hover" || data.type === "select" || data.type === "clear" || data.type === "key") return parseSelectionMessage(data);
  return null;
}

function parseSelectionMessage(data: Record<string, unknown>): SelectionMessage | null {
  const { type, href, seq, viewport } = data;
  if (!within(href, MAX_HREF) || !seqValue(seq) || !nonNegative(viewport)) return null;
  const base = { href, seq, viewport };
  switch (type) {
    case "clear": return { type, ...base };
    case "key":
      if (data.key === "Escape") return { type, ...base, key: "Escape" };
      return data.key === "Alt" && typeof data.alt === "boolean" ? { type, ...base, key: "Alt", alt: data.alt } : null;
    case "hover": {
      if (data.rect === null) return { type, ...base, rect: null };
      const rect = parseRect(data.rect);
      return rect === null ? null : { type, ...base, rect };
    }
    case "select": {
      const answer: SelectMessage["answer"] = data.answer === "select-anchor" ? data.answer : undefined;
      if (answer === undefined && data.answer !== undefined) return null;
      const marked = answer === undefined ? base : { ...base, answer };
      if (data.target === null) return { type, ...marked, target: null };
      const target = parseTarget(data.target);
      return target === null ? null : { type, ...marked, target };
    }
    default: return null;
  }
}

function parsePicked(data: Record<string, unknown>): PickedMessage | null {
  const { href, pick } = data;
  if (!within(href, MAX_HREF) || !seqValue(pick)) return null;
  const answers = ["target", "point", "cancelled"].filter(key => data[key] !== undefined);
  if (answers.length !== 1) return null;
  const base = { type: "picked" as const, href, pick };
  if (data.cancelled !== undefined) return data.cancelled === true ? { ...base, cancelled: true } : null;
  if (data.point !== undefined) {
    if (!isRecord(data.point) || !finite(data.point.x) || !finite(data.point.y)) return null;
    return { ...base, point: { x: data.point.x, y: data.point.y } };
  }
  const target = parseTarget(data.target);
  return target === null ? null : { ...base, target };
}

function parseTarget(raw: unknown): SelectTarget | null {
  if (!isRecord(raw)) return null;
  const rect = parseRect(raw.rect);
  const { tag, frame, frameIndex, element, path, interactive } = raw;
  if (rect === null || !within(tag, MAX_STRING) || !Array.isArray(path) || path.length > MAX_PATH) return null;
  const target: SelectTarget = { rect, tag, path: [] };
  for (const step of path) {
    if (!isRecord(step) || !within(step.label, MAX_STRING) || !within(step.selector, MAX_SELECTOR)) return null;
    const item: PathItem = { label: step.label, selector: step.selector };
    if (step.doanId !== undefined) {
      if (!within(step.doanId, MAX_STRING)) return null;
      item.doanId = step.doanId;
    }
    target.path.push(item);
  }
  if (frame !== undefined) {
    if (!isRecord(frame) || !within(frame.id, MAX_STRING)) return null;
    const kept: NonNullable<SelectTarget["frame"]> = { id: frame.id };
    if (frame.title !== undefined) {
      if (!within(frame.title, MAX_STRING)) return null;
      kept.title = frame.title;
    }
    if (frame.implements !== undefined) {
      if (!within(frame.implements, MAX_VALUE)) return null;
      kept.implements = frame.implements;
    }
    target.frame = kept;
  }
  if (frameIndex !== undefined) {
    if (typeof frameIndex !== "number" || !Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= MAX_FRAMES) return null;
    target.frameIndex = frameIndex;
  }
  if (element !== undefined) {
    const kept = parseElement(element);
    if (kept === null) return null;
    target.element = kept;
  }
  if (interactive !== undefined) {
    if (interactive !== "link" && interactive !== "control") return null;
    target.interactive = interactive;
  }
  return target;
}

function parseElement(raw: unknown): SelectionElement | null {
  if (!isRecord(raw)) return null;
  const { doanId, selector, html, truncated, text } = raw;
  if (!within(selector, MAX_SELECTOR) || !codePointsWithin(html, MAX_HTML)) return null;
  const element: SelectionElement = { selector, html };
  if (doanId !== undefined) {
    if (!within(doanId, MAX_STRING)) return null;
    element.doanId = doanId;
  }
  if (truncated !== undefined) {
    if (typeof truncated !== "boolean") return null;
    element.truncated = truncated;
  }
  if (text !== undefined) {
    if (!codePointsWithin(text, MAX_TEXT)) return null;
    element.text = text;
  }
  return element;
}

function parseLayout(data: Record<string, unknown>): LayoutMessage | null {
  const { href, height, viewport, frames } = data;
  if (typeof href !== "string" || !nonNegative(height) || !nonNegative(viewport) || !Array.isArray(frames)) return null;
  // `href` is compared with a canvas URL later, so cutting it would only make a
  // long path look like an unknown document; an oversized one is dropped whole.
  if (href.length > MAX_HREF) return null;
  let truncated = data.truncated === true || frames.length > MAX_FRAMES;
  const kept: CanvasFrameRect[] = [];
  for (const raw of frames.slice(0, MAX_FRAMES)) {
    const parsed = parseFrame(raw);
    if (parsed === null) continue;
    if (parsed.cut) truncated = true;
    kept.push(parsed.frame);
  }
  const parsed: LayoutMessage = { type: "layout", href, height, viewport, frames: kept, truncated };
  if (data.document !== undefined) {
    if (!within(data.document, MAX_STRING)) return null;
    parsed.document = data.document;
  }
  if (data.selected !== undefined) {
    const selected = data.selected === null ? null : parseRect(data.selected);
    if ((data.selected !== null && selected === null) || !seqValue(data.seq)) return null;
    parsed.seq = data.seq;
    parsed.selected = selected;
  }
  return parsed;
}

function parseFrame(raw: unknown): { frame: CanvasFrameRect; cut: boolean } | null {
  if (!isRecord(raw)) return null;
  const { id, title, x, y, width, height } = raw;
  if (typeof id !== "string" || (title !== undefined && typeof title !== "string")) return null;
  if (!finite(x) || !finite(y) || !nonNegative(width) || !nonNegative(height)) return null;
  const clippedId = clip(id);
  const frame: CanvasFrameRect = { id: clippedId.text, x, y, width, height };
  let cut = clippedId.cut;
  if (title !== undefined) {
    const clippedTitle = clip(title);
    frame.title = clippedTitle.text;
    cut ||= clippedTitle.cut;
  }
  return { frame, cut };
}

function parseWheel(data: Record<string, unknown>): WheelMessage | null {
  const { dx, dy, ctrl, meta, deltaMode, x, y } = data;
  if (!finite(dx) || !finite(dy) || !finite(x) || !finite(y)) return null;
  if (typeof ctrl !== "boolean" || typeof meta !== "boolean") return null;
  if (deltaMode !== 0 && deltaMode !== 1 && deltaMode !== 2) return null;
  return { type: "wheel", dx, dy, ctrl, meta, deltaMode, x, y };
}

export interface CanvasMessageEvent {
  source: unknown;
  origin: string;
  data: unknown;
}

// A sandboxed iframe without `allow-same-origin` posts from the opaque origin
// "null", and `source` is the only thing tying the message to *our* iframe. A
// detached iframe has a null `contentWindow`, which must not match the null
// `source` of a message from a closed window.
export function acceptCanvasMessage(event: CanvasMessageEvent, frameWindow: unknown): CanvasMessage | null {
  if (frameWindow === null || frameWindow === undefined) return null;
  if (event.source !== frameWindow || event.origin !== "null") return null;
  return parseCanvasMessage(event.data);
}


function parseAnchors(data: Record<string, unknown>): AnchorsMessage | null {
  const { href, document, generation, request, revision, viewport, width, selected, selectionSeq, results, rects } = data;
  if (!within(href, MAX_HREF) || !within(document, MAX_STRING) || !document ||
    !seqValue(generation) || !seqValue(request) || !seqValue(revision) || !seqValue(selectionSeq) || !nonNegative(viewport) || !nonNegative(width) ||
    !(selected === null || within(selected, MAX_STRING)) || !Array.isArray(results) || !Array.isArray(rects)) return null;
  const parsed: AnchorsMessage = { type: "anchors", href, document, generation, request, revision, viewport, width, selected, selectionSeq, results: [], rects: [] };
  const seen = new Set<string>();
  for (const item of results) {
    if (!isRecord(item) || !within(item.id, MAX_STRING) || seen.has(item.id) || !isRecord(item.candidates)) return null;
    seen.add(item.id);
    const candidates: TargetCandidates = {};
    for (const key of ["doanId", "selector", "frame"] as const) {
      const values = item.candidates[key];
      if (values === undefined) continue;
      if (key === "selector" && values === null) { candidates.selector = null; continue; }
      if (!Array.isArray(values) || !values.every(value => within(value, MAX_STRING) && value.length > 0)) return null;
      candidates[key] = [...values];
    }
    parsed.results.push({ id: item.id, candidates });
  }
  seen.clear();
  for (const item of rects) {
    if (!isRecord(item) || !within(item.node, MAX_STRING) || !item.node || seen.has(item.node)) return null;
    seen.add(item.node);
    const rect = parseRect(item);
    if (rect === null) return null;
    if (item.clip !== undefined) {
      const clip = parseRect(item.clip);
      if (clip === null) return null;
      parsed.rects.push({ node: item.node, ...rect, clip });
    } else parsed.rects.push({ node: item.node, ...rect });
  }
  for (const { candidates } of parsed.results) {
    for (const values of Object.values(candidates)) if (values?.some((node: string) => !seen.has(node))) return null;
  }
  return parsed;
}
