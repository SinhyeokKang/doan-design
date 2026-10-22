// Validation for messages from the script injected into a canvas iframe. The
// canvas's own scripts share that window and can post anything, so every field
// is checked and copied into a fresh object; nothing is trusted by shape.

export const MAX_FRAMES = 1000;
export const MAX_STRING = 200;
// UTF-16 code units, as `String.length` counts them.
export const MAX_HREF = 8192;

export interface CanvasFrameRect {
  id: string;
  title?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutMessage {
  type: "layout";
  href: string;
  height: number;
  // The canvas's innerHeight when it measured `height`.
  viewport: number;
  frames: CanvasFrameRect[];
  truncated: boolean;
}

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

export type CanvasMessage = LayoutMessage | WheelMessage;

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

export function parseCanvasMessage(data: unknown): CanvasMessage | null {
  if (!isRecord(data)) return null;
  if (data.type === "layout") return parseLayout(data);
  if (data.type === "wheel") return parseWheel(data);
  return null;
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
  return { type: "layout", href, height, viewport, frames: kept, truncated };
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
