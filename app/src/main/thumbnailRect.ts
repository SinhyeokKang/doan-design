export interface Rect { x: number; y: number; width: number; height: number }

// The board's own height limit (renderer `canvasView.ts` MAX_HEIGHT): no frame on the board ends below it.
export const MAX_FRAME_BOTTOM = 200_000;
// getBoundingClientRect edges can land a subpixel past the board.
const EDGE = 0.5;

function rect(value: unknown): Rect | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const [x, y, width, height]: unknown[] = ["x", "y", "width", "height"].map((key) => Reflect.get(value, key));
  if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number") return null;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

const withinBoard = (frame: Rect, boardWidth: number) => frame.x >= 0 && frame.x + frame.width <= boardWidth + EDGE;

// The canvas's first frame in document coordinates, as the canvas reported it; null means the first screen and no
// scroll.
export function measuredFrame(value: unknown, boardWidth: number): Rect | null {
  const frame = rect(value);
  if (!frame || !withinBoard(frame, boardWidth) || frame.y < 0 || frame.y + frame.height > MAX_FRAME_BOTTOM) return null;
  return frame;
}

// The scrolled frame's viewport rectangle, as the canvas reported it, to the capture rectangle in host coordinates
// (`viewport` is the iframe), or null for the first screen. The height stops at the width: every thumbnail slot is
// at most 1:1 and shows the image's top.
export function thumbnailRect(value: unknown, viewport: Rect): Rect | null {
  const frame = rect(value);
  if (!frame || !withinBoard(frame, viewport.width) || frame.height > MAX_FRAME_BOTTOM) return null;
  const left = Math.round(frame.x);
  const right = Math.round(Math.min(viewport.width, frame.x + frame.width));
  const top = Math.round(Math.max(0, frame.y));
  const bottom = Math.round(Math.min(viewport.height, frame.y + frame.height));
  const width = right - left;
  if (width < 1 || bottom - top < 1) return null;
  return { x: viewport.x + left, y: viewport.y + top, width, height: Math.min(bottom - top, width) };
}
