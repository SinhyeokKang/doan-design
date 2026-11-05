import type { CanvasLoad, Rect } from "./canvasPicker";
import { MAX_ATTACHMENTS } from "./homeComposer";
import type { Point } from "./viewport";

// Capture area (canvas-capture design §2–§3): a dragged area of the board becomes one image in the canvas
// conversation composer.

// Main checks the same minimum on `attachments:capture`, so a smaller area never leaves the renderer.
export const MIN_CAPTURE = 8;

export const CAPTURE_UNAVAILABLE = "Capture area isn’t available while the canvas can’t be shown.";
// Attach's own reason (DockedComposer.tsx): a capture is an attachment, so it is closed for the same conversations.
export const CAPTURE_TERMINAL = "Files can’t be attached to a terminal session";
export const CAPTURE_LIMIT = `Only ${MAX_ATTACHMENTS} files can be attached. Remove one to add another.`;

// The drag from `start` to `end` in the canvas area's px, clipped to the area and rounded to whole px. null for a
// click or an area under MIN_CAPTURE on either side once clipped (design 결정 6).
export function captureRect(start: Point, end: Point, bounds: { width: number; height: number }): Rect | null {
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return null;
  const clip = (value: number, size: number) => Math.round(Math.min(Math.max(value, 0), size));
  const left = clip(Math.min(start.x, end.x), bounds.width), right = clip(Math.max(start.x, end.x), bounds.width);
  const top = clip(Math.min(start.y, end.y), bounds.height), bottom = clip(Math.max(start.y, end.y), bounds.height);
  if (right - left < MIN_CAPTURE || bottom - top < MIN_CAPTURE) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

// The toolbar's Capture area. `canvas` is "loaded" only while the board is drawn and App knows the panel's composer;
// `composer` the composer's reason line while it takes no input (null: it does); `fixed` the conversation continues a
// terminal session or is a legacy external one; `attachments` the draft's attachment count. First match wins.
export function captureAvailability(input: { canvas: CanvasLoad; composer: string | null; fixed: boolean; attachments: number }): { enabled: boolean; reason: string | null } {
  if (input.canvas !== "loaded") return { enabled: false, reason: CAPTURE_UNAVAILABLE };
  if (input.composer !== null) return { enabled: false, reason: input.composer };
  if (input.fixed) return { enabled: false, reason: CAPTURE_TERMINAL };
  if (input.attachments >= MAX_ATTACHMENTS) return { enabled: false, reason: CAPTURE_LIMIT };
  return { enabled: true, reason: null };
}
