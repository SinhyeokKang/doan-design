// The canvas's own scripts share the iframe window and can post anything, so every field is checked and copied into a
// fresh object; nothing is trusted by shape.

import type { SelectionElement } from "../formats/types";
import { MAX_PROTOTYPE_MARK } from "../main/prototype/mark";

// From exact DOM lookups; html/text never identify a node.
export interface TargetCandidates {
  doanId?: readonly string[];
  selector?: readonly string[] | null;
  frame?: readonly string[];
}

// `clip` is the nearest clipping ancestors' visible box.
interface PinRect { x: number; y: number; width: number; height: number }
export interface PinGeometry extends PinRect { clip?: PinRect }

export const MAX_FRAMES = 1000;
export const MAX_GOTOS = 1000;
export const MAX_STRING = 200;
// UTF-16 code units, as `String.length` counts them.
export const MAX_HREF = 8192;
// Over a cap the whole message is dropped: the script clips before sending, so only a forged message is over.
export const MAX_SELECTOR = 1000;
export const MAX_VALUE = 500;
// Code points, as the schema's maxLength counts them.
export const MAX_HTML = 2000;
export const MAX_TEXT = 500;
export const MAX_PATH = 32;
// The text cap keeps a forged message from handing the clipboard megabytes; the rect cap bounds the overlay's nodes (a
// range past it still copies whole).
export const MAX_COPY_TEXT = 100_000;
export const MAX_TEXT_RECTS = 2000;

export const MAX_TREE_NODES = 200;

export type ElementKind = "frame" | "flex-row" | "flex-column" | "grid" | "input" | "button" | "text" | "box";

export interface CanvasFrameRect {
  id: string;
  title?: string;
  // A `cut` frame keeps it but never plays.
  prototype?: string;
  // The ID was cut at 200 UTF-16 units, so it is not the frame's: it cannot play, and link groups must leave it out
  // rather than take the cut ID for another frame's.
  cut?: true;
  // The enclosing frame always comes earlier in `frames`.
  parent?: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Board coordinates while the canvas document does not scroll inside the iframe.
export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// One over 200 units is not reported. `frame` is the innermost listed frame around it, absent when none is.
export interface CanvasGoto {
  value: string;
  frame?: number;
}

export interface LayoutMessage {
  type: "layout";
  document?: string;
  href: string;
  height: number;
  viewport: number;
  frames: CanvasFrameRect[];
  truncated: boolean;
  gotos: CanvasGoto[];
  // null once the script lost the element.
  seq?: number;
  selected?: CanvasRect | null;
}

// `seq` belongs to the hover channel for hover/Alt, and to the selection channel for select/clear/Escape and selected
// layout. Channels reset on load.
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
  // Absent past the 1,000 listed.
  frameIndex?: number;
  element?: SelectionElement;
  path: PathItem[];
  interactive?: "link" | "control";
}

export interface SelectMessage extends SelectionMessageBase {
  type: "select";
  // null: the script could not find the anchor it was asked for.
  target: SelectTarget | null;
  // Absent for a click, which can share the seq of a command the script then drops.
  answer?: SelectionAnswer;
}

// select-parent is answered by the frame around the selection or, past the outermost one, a clear.
export type SelectionAnswer = "select-anchor" | "select-parent";

export interface ClearMessage extends SelectionMessageBase {
  type: "clear";
  answer?: "select-parent";
}

// Only from a canvas that has focus after an ⌥-click.
export type KeyMessage = SelectionMessageBase & { type: "key" } & (
  { key: "Escape" } | { key: "Alt"; alt: boolean } | { key: "Space"; down: boolean } | { key: "V" | "H" }
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

// The message type is the reply marker, so no selection reply can complete a pick; `pick` is on the pick channel's own
// seq. A pick lives only as long as its `document`.
export type PickedMessage = { type: "picked"; href: string; document: string; pick: number } & ({ target: SelectTarget } | { point: { x: number; y: number } } | { cancelled: true });

// The canvas took a pick-start; until this arrives the app keeps clicks off the canvas.
export interface PickStartedMessage { type: "pick-started"; href: string; document: string; pick: number }

// A range from a replaced document or sent before a clear (`epoch`) is dropped. Empty `rects` is no range; `text`
// comes once the drag ends.
export interface TextRangeMessage { type: "text-range"; document: string; epoch: number; dragging: boolean; rects: CanvasRect[]; text?: string }
export interface TextHitMessage { type: "text-hit"; document: string; probe: number; hit: boolean }

// The tree has its own seq channel and a `document` token, so an answer from a replaced document or to an older
// request is dropped. Over MAX_TREE_NODES the script keeps the path to the selection and marks the answer truncated.
export interface ElementTreeAnchor { selector: string; doanId?: string; frame?: string }
export interface ElementTreeNode { depth: number; name: string; kind: ElementKind; anchor: ElementTreeAnchor; rect: CanvasRect; selected?: true }
export interface ElementTreeMessage { type: "element-tree"; href: string; document: string; seq: number; viewport: number; nodes: ElementTreeNode[]; truncated: boolean }

// A press carries nothing, so a forged one can do no more than close the app's lists and move focus to the canvas.
export interface PressMessage { type: "press" }
// At most once a second.
export interface ActivityMessage { type: "activity" }

export type CanvasMessage = LayoutMessage | WheelMessage | SelectionMessage | AnchorsMessage | PickedMessage | PickStartedMessage | PressMessage | ActivityMessage | TextRangeMessage | TextHitMessage | ElementTreeMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegative(value: unknown): value is number {
  return finite(value) && value >= 0;
}

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
  if (data.type === "pick-started") return parsePickStarted(data);
  if (data.type === "layout") return parseLayout(data);
  if (data.type === "wheel") return parseWheel(data);
  if (data.type === "press") return { type: "press" };
  if (data.type === "activity") return { type: "activity" };
  if (data.type === "text-range") return parseTextRange(data);
  if (data.type === "text-hit") {
    const { document, probe, hit } = data;
    if (!within(document, MAX_STRING) || !document || !seqValue(probe) || typeof hit !== "boolean") return null;
    return { type: "text-hit", document, probe, hit };
  }
  if (data.type === "element-tree") return parseElementTree(data);
  if (data.type === "hover" || data.type === "select" || data.type === "clear" || data.type === "key") return parseSelectionMessage(data);
  return null;
}

function parseSelectionMessage(data: Record<string, unknown>): SelectionMessage | null {
  const { type, href, seq, viewport } = data;
  if (!within(href, MAX_HREF) || !seqValue(seq) || !nonNegative(viewport)) return null;
  const base = { href, seq, viewport };
  switch (type) {
    case "clear": return data.answer === "select-parent" ? { type, ...base, answer: data.answer } : { type, ...base };
    case "key":
      if (data.key === "Escape") return { type, ...base, key: "Escape" };
      if (data.key === "V" || data.key === "H") return { type, ...base, key: data.key };
      if (data.key === "Space") return typeof data.down === "boolean" ? { type, ...base, key: "Space", down: data.down } : null;
      return data.key === "Alt" && typeof data.alt === "boolean" ? { type, ...base, key: "Alt", alt: data.alt } : null;
    case "hover": {
      if (data.rect === null) return { type, ...base, rect: null };
      const rect = parseRect(data.rect);
      return rect === null ? null : { type, ...base, rect };
    }
    case "select": {
      const answer: SelectMessage["answer"] = data.answer === "select-anchor" || data.answer === "select-parent" ? data.answer : undefined;
      if (answer === undefined && data.answer !== undefined) return null;
      const marked = answer === undefined ? base : { ...base, answer };
      if (data.target === null) return { type, ...marked, target: null };
      const target = parseTarget(data.target);
      return target === null ? null : { type, ...marked, target };
    }
    default: return null;
  }
}

function parseTextRange(data: Record<string, unknown>): TextRangeMessage | null {
  const { document, epoch, dragging, rects, text } = data;
  if (!within(document, MAX_STRING) || !document || !seqValue(epoch) || typeof dragging !== "boolean" || !Array.isArray(rects) || rects.length > MAX_TEXT_RECTS) return null;
  const kept: CanvasRect[] = [];
  for (const raw of rects) {
    const rect = parseRect(raw);
    if (rect === null) return null;
    kept.push(rect);
  }
  const message: TextRangeMessage = { type: "text-range", document, epoch, dragging, rects: kept };
  if (text !== undefined) {
    if (!codePointsWithin(text, MAX_COPY_TEXT)) return null;
    message.text = text;
  }
  return message;
}

const ELEMENT_KINDS: readonly string[] = ["frame", "flex-row", "flex-column", "grid", "input", "button", "text", "box"] satisfies ElementKind[];

// The script never sends more than the cap. Depths must nest below one root, so the menu can indent and draw guides
// from them alone.
function parseElementTree(data: Record<string, unknown>): ElementTreeMessage | null {
  const { href, document, seq, viewport, nodes, truncated } = data;
  if (!within(href, MAX_HREF) || !within(document, MAX_STRING) || !document || !seqValue(seq) || !nonNegative(viewport) ||
    typeof truncated !== "boolean" || !Array.isArray(nodes) || nodes.length > MAX_TREE_NODES) return null;
  const kept: ElementTreeNode[] = [];
  let selected = false;
  for (const raw of nodes) {
    if (!isRecord(raw) || !isRecord(raw.anchor)) return null;
    const { depth, name, kind, anchor } = raw;
    const previous = kept.at(-1)?.depth;
    const nests = previous === undefined ? depth === 0 : typeof depth === "number" && Number.isInteger(depth) && depth >= 1 && depth <= previous + 1;
    if (!nests || typeof depth !== "number" || !within(name, MAX_STRING) || typeof kind !== "string" || !ELEMENT_KINDS.includes(kind)) return null;
    const rect = parseRect(raw.rect);
    if (rect === null || !within(anchor.selector, MAX_SELECTOR) || !anchor.selector) return null;
    const keptAnchor: ElementTreeAnchor = { selector: anchor.selector };
    if (anchor.doanId !== undefined) {
      if (!within(anchor.doanId, MAX_STRING)) return null;
      keptAnchor.doanId = anchor.doanId;
    }
    if (anchor.frame !== undefined) {
      if (!within(anchor.frame, MAX_STRING)) return null;
      keptAnchor.frame = anchor.frame;
    }
    const node: ElementTreeNode = { depth, name, kind: kind as ElementKind, anchor: keptAnchor, rect };
    if (raw.selected !== undefined) {
      if (raw.selected !== true || selected) return null;
      selected = true;
      node.selected = true;
    }
    kept.push(node);
  }
  return { type: "element-tree", href, document, seq, viewport, nodes: kept, truncated };
}

function parsePickStarted(data: Record<string, unknown>): PickStartedMessage | null {
  const { href, document, pick } = data;
  if (!within(href, MAX_HREF) || !within(document, MAX_STRING) || !document || !seqValue(pick)) return null;
  return { type: "pick-started", href, document, pick };
}

function parsePicked(data: Record<string, unknown>): PickedMessage | null {
  const { href, document, pick } = data;
  if (!within(href, MAX_HREF) || !within(document, MAX_STRING) || !document || !seqValue(pick)) return null;
  const answers = ["target", "point", "cancelled"].filter(key => data[key] !== undefined);
  if (answers.length !== 1) return null;
  const base = { type: "picked" as const, href, document, pick };
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
  // `href` is compared with a canvas URL later, so cutting it would only make a long path look like an unknown document.
  if (href.length > MAX_HREF) return null;
  let truncated = data.truncated === true || frames.length > MAX_FRAMES;
  if (data.gotos !== undefined && !Array.isArray(data.gotos)) return null;
  const kept: CanvasFrameRect[] = [];
  // A dropped frame shifts the rest, so the script's indexes are mapped to the kept list.
  const keptAt: (number | undefined)[] = [];
  const keptIndex = (value: unknown, before: number) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value < before ? keptAt[value] : undefined;
  for (const [index, raw] of frames.slice(0, MAX_FRAMES).entries()) {
    const parsed = parseFrame(raw);
    if (parsed === null) {
      keptAt.push(undefined);
      continue;
    }
    if (parsed.cut) truncated = true;
    const parent = isRecord(raw) ? keptIndex(raw.parent, index) : undefined;
    if (parent !== undefined) parsed.frame.parent = parent;
    keptAt.push(kept.length);
    kept.push(parsed.frame);
  }
  const gotos: CanvasGoto[] = [];
  for (const raw of (data.gotos ?? []).slice(0, MAX_GOTOS)) {
    if (!isRecord(raw) || !within(raw.value, MAX_STRING)) continue;
    if (raw.frame === undefined) {
      gotos.push({ value: raw.value });
      continue;
    }
    // A link in a frame that is not in the kept list is left out, as the script leaves out what it cannot report.
    const frame = keptIndex(raw.frame, keptAt.length);
    if (frame !== undefined) gotos.push({ value: raw.value, frame });
  }
  const parsed: LayoutMessage = { type: "layout", href, height, viewport, frames: kept, truncated, gotos };
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
  const { id, title, prototype, x, y, width, height } = raw;
  if (typeof id !== "string" || (title !== undefined && typeof title !== "string")) return null;
  if (!finite(x) || !finite(y) || !nonNegative(width) || !nonNegative(height)) return null;
  const clippedId = clip(id);
  const frame: CanvasFrameRect = { id: clippedId.text, x, y, width, height };
  if (clippedId.cut || raw.cut === true) frame.cut = true;
  // A bad mark is dropped, not the frame: the frame stays listed, unmarked.
  if (typeof prototype === "string" && prototype.length <= MAX_PROTOTYPE_MARK) frame.prototype = prototype;
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

// A sandboxed iframe posts from origin "null", so `source` is the only tie to our iframe. A detached iframe's null
// `contentWindow` must not match the null `source` of a closed window's message.
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
