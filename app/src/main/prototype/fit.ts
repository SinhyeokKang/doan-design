import type { PrototypeSize } from "./mark";

// The window shell around the content panel: an `--size-chrome` header (56px) above, and the panel's 8px margin on
// the sides and bottom, as in the main window's AppShell. The window's content size is the mark plus this.
export const PROTOTYPE_CHROME = { header: 56, side: 8, bottom: 8 } as const;

export const PROTOTYPE_WINDOW_MIN_WIDTH = 360;

// The content panel's width at the minimum window. A frame narrower than this cannot be shown at a width the window
// can reach, so it keeps its own width, centred, however wide the window becomes.
export const PROTOTYPE_NARROW_BELOW = PROTOTYPE_WINDOW_MIN_WIDTH - 2 * PROTOTYPE_CHROME.side;

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
  const height = Math.min(size.height + PROTOTYPE_CHROME.header + PROTOTYPE_CHROME.bottom, workArea.height);
  const x = current?.x ?? workArea.x + Math.floor((workArea.width - width) / 2);
  const y = current?.y ?? workArea.y + Math.floor((workArea.height - height) / 2);
  return { x: place(x, width, workArea.x, workArea.width), y: place(y, height, workArea.y, workArea.height), width, height };
}

// The iframe's horizontal box inside the content panel; it always takes the panel's full height.
export function prototypeIframeBox(panelWidth: number, markWidth: number): { x: number; width: number } {
  if (markWidth < PROTOTYPE_NARROW_BELOW) return { x: Math.floor((panelWidth - markWidth) / 2), width: markWidth };
  return { x: 0, width: panelWidth };
}
