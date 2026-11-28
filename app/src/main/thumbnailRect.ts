export interface Rect { x: number; y: number; width: number; height: number }
export interface Size { width: number; height: number }

// The board's own height limit (renderer `canvasView.ts` MAX_HEIGHT): no frame on the board ends below it.
export const MAX_FRAME_BOTTOM = 200_000;
// Four JavaScript number strings and three spaces stay well under this.
export const MAX_ANSWER_LENGTH = 128;
// getBoundingClientRect edges can land a subpixel past the board.
const EDGE = 0.5;

// The canvas scripts answer "x y width height".
function rect(value: unknown): Rect | null {
  if (typeof value !== "string" || value.length > MAX_ANSWER_LENGTH) return null;
  const fields = value.split(" ");
  if (fields.length !== 4 || fields.includes("")) return null;
  const [x = 0, y = 0, width = 0, height = 0] = fields.map(Number);
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

// The scrolled frame's viewport rectangle to a capture rectangle in host coordinates inside the window's content, or
// null. Height stops at the width: a narrow frame scaled to 480 px would make a very tall PNG; slots show its top.
export function thumbnailRect(value: unknown, viewport: Rect, window: Size): Rect | null {
  const frame = rect(value);
  if (!frame || !withinBoard(frame, viewport.width) || frame.height > MAX_FRAME_BOTTOM) return null;
  const left = Math.round(Math.max(viewport.x + frame.x, 0));
  const right = Math.round(Math.min(viewport.x + Math.min(viewport.width, frame.x + frame.width), window.width));
  const top = Math.round(Math.max(viewport.y + Math.max(0, frame.y), 0));
  const bottom = Math.round(Math.min(viewport.y + Math.min(viewport.height, frame.y + frame.height), window.height));
  const width = right - left;
  if (width < 1 || bottom - top < 1) return null;
  return { x: left, y: top, width, height: Math.min(bottom - top, width) };
}
