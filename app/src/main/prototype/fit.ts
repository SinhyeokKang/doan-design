import type { PrototypeMode } from "./ipc";
import type { PrototypeSize } from "./mark";

// The window shell around the content panel: an `--size-chrome` header (56px) above, and the panel's 8px margin on
// the sides and bottom, as in the main window's AppShell. The window's content size is the mark plus this, and plus the
// header's second row when the fitted width moves the name there.
export const PROTOTYPE_CHROME = { header: 56, side: 8, bottom: 8 } as const;

export const PROTOTYPE_WINDOW_MIN_WIDTH = 360;

// The header's right group: the Fit/Responsive toggle (2 + 32 + 32 + 2). Sibling features widen it as they add
// Export and the conversation button; main's fit and capture and the renderer's header read the same value.
export const PROTOTYPE_HEADER_RIGHT = 68;
// The narrowest name capsule that still reads: its padding, gap and chevron leave three letters and an ellipsis.
export const PROTOTYPE_NAME_MIN_WIDTH = 80;
// The header's second row, where the name capsule goes when the first row cannot give it the minimum.
export const PROTOTYPE_NAME_ROW_HEIGHT = 44;
// The first row's width outside the name: the left group's end at 192 plus 8, and 8 + 16 before the right group.
const NAME_OUTSIDE = 224;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function place(start: number, size: number, areaStart: number, areaSize: number): number {
  return Math.max(areaStart, Math.min(start, areaStart + areaSize - size));
}

// Content bounds for a first play or a replaced frame. A new window is centred in the work area; a replaced frame
// keeps the window's top-left and is moved only as far as it takes to stay inside.
export function fitPrototypeWindow(size: PrototypeSize, workArea: Rect, current?: Rect): Rect {
  const width = Math.max(PROTOTYPE_WINDOW_MIN_WIDTH, Math.min(size.width + 2 * PROTOTYPE_CHROME.side, workArea.width));
  const height = Math.min(size.height + headerHeight(width) + PROTOTYPE_CHROME.bottom, workArea.height);
  const x = current?.x ?? workArea.x + Math.floor((workArea.width - width) / 2);
  const y = current?.y ?? workArea.y + Math.floor((workArea.height - height) / 2);
  return { x: place(x, width, workArea.x, workArea.width), y: place(y, height, workArea.y, workArea.height), width, height };
}

// The header's rows from the window's content width alone, never from the panel it then sizes, so a row change
// cannot feed back into the width that decided it.
export function prototypeHeaderRows(width: number, right: number): 1 | 2 {
  return width - NAME_OUTSIDE - right >= PROTOTYPE_NAME_MIN_WIDTH ? 1 : 2;
}

function headerHeight(width: number): number {
  return PROTOTYPE_CHROME.header + (prototypeHeaderRows(width, PROTOTYPE_HEADER_RIGHT) === 2 ? PROTOTYPE_NAME_ROW_HEIGHT : 0);
}

export interface ViewportBox {
  x: number;
  y: number;
  // The iframe's CSS size, which is the frame document's viewport.
  width: number;
  height: number;
  // `transform: scale()` with origin 0 0; below 1 only in Fit, when the panel is smaller than the mark.
  scale: number;
  // The scaled iframe in whole pixels, at most what it draws: the renderer clips the iframe to this box and main
  // captures exactly it, so a fractional scale (844 x 344/390 = 744.45) leaves no sliver between the live frame and
  // its still.
  visibleWidth: number;
  visibleHeight: number;
}

// The epsilon keeps a side scaled to exactly the panel (390 x 344/390) from flooring one pixel short.
function whole(size: number, scale: number): number {
  return Math.floor(size * scale + 1e-9);
}

// The run iframe's box in the content panel, from the panel, the run's mark and the mode only: nothing measured in
// the frame's document comes back into it. Fit keeps the viewport at the mark and only scales it down to fit,
// centred; Responsive, and any run whose mark is not known yet, fill the panel. Positions are whole pixels so the
// renderer and main's capture agree.
export function prototypeViewportBox(panel: { width: number; height: number }, mark: PrototypeSize, mode: PrototypeMode): ViewportBox {
  const width = Math.max(0, Math.floor(panel.width));
  const height = Math.max(0, Math.floor(panel.height));
  if (mode === "responsive" || mark.width <= 0 || mark.height <= 0) return { x: 0, y: 0, width, height, scale: 1, visibleWidth: width, visibleHeight: height };
  const scale = Math.min(1, width / mark.width, height / mark.height);
  const visibleWidth = whole(mark.width, scale), visibleHeight = whole(mark.height, scale);
  return { x: Math.floor((width - visibleWidth) / 2), y: Math.floor((height - visibleHeight) / 2), width: mark.width, height: mark.height, scale, visibleWidth, visibleHeight };
}

// What main captures when a ready run leaves: `rect` in window content coordinates for capturePage, and `box`, the
// same area relative to the content panel, which the snapshot carries so the still lands where it was taken.
// `sideColumn` is width a column beside the panel takes from it. Null when nothing of the frame is visible.
export function prototypeCaptureRect(content: { width: number; height: number }, mark: PrototypeSize, mode: PrototypeMode, sideColumn = 0): { rect: Rect; box: Rect } | null {
  const top = headerHeight(content.width);
  const panel = { width: content.width - 2 * PROTOTYPE_CHROME.side - sideColumn, height: content.height - top - PROTOTYPE_CHROME.bottom };
  const viewport = prototypeViewportBox(panel, mark, mode);
  const box = { x: viewport.x, y: viewport.y, width: viewport.visibleWidth, height: viewport.visibleHeight };
  if (box.width <= 0 || box.height <= 0) return null;
  return { rect: { ...box, x: PROTOTYPE_CHROME.side + box.x, y: top + box.y }, box };
}
