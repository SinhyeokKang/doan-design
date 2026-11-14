import type { PrototypeMode } from "./ipc";
import type { PrototypeSize } from "./mark";

// The window shell around the content panel: an `--size-chrome` header (56px) above, and the panel's 8px margin on
// the sides and bottom, as in the main window's AppShell. The window's content size is the mark plus this, and plus the
// header's second row when the fitted width moves the name there.
export const PROTOTYPE_CHROME = { header: 56, side: 8, bottom: 8 } as const;

export const PROTOTYPE_WINDOW_MIN_WIDTH = 360;

// The header's right group: the Fit/Responsive toggle (2 + 32 + 32 + 2), then 4 and Export (32), then 4 and the
// conversation button (32). Main's fit and capture and the renderer's header read the same value; styles.css mirrors it
// as --pw-right.
export const PROTOTYPE_HEADER_RIGHT = 140;
// The same group while the conversation panel is open: Hide conversation is in the panel's head, so the header's button
// and its gap leave it. styles.css mirrors it as the open layout's --pw-right.
export const PROTOTYPE_HEADER_RIGHT_OPEN = PROTOTYPE_HEADER_RIGHT - 32 - 4;
// The narrowest name capsule that still reads: its padding, gap and chevron leave three letters and an ellipsis.
export const PROTOTYPE_NAME_MIN_WIDTH = 80;
// The header's second row, where the name capsule goes when the first row cannot give it the minimum.
export const PROTOTYPE_NAME_ROW_HEIGHT = 44;
// The first row's width outside the name: the left group's end at 192 plus 8, and 8 + 16 before the right group.
const NAME_OUTSIDE = 224;

// The conversation panel: never narrower than 280, so a window with it open is at least the frame column's 360 + 280.
export const PROTOTYPE_PANEL_MIN_WIDTH = 280;
export const PROTOTYPE_PANEL_WINDOW_MIN_WIDTH = PROTOTYPE_WINDOW_MIN_WIDTH + PROTOTYPE_PANEL_MIN_WIDTH;
// Between the content panel and the open conversation panel, as between the main window's surfaces.
export const PROTOTYPE_PANEL_GAP = 8;

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
  return placed(width, size, headerHeight(prototypeSideLayout(width, null).rows), workArea, current);
}

function placed(width: number, size: PrototypeSize, header: number, workArea: Rect, current?: Rect): Rect {
  const height = Math.min(size.height + header + PROTOTYPE_CHROME.bottom, workArea.height);
  const x = current?.x ?? workArea.x + Math.floor((workArea.width - width) / 2);
  const y = current?.y ?? workArea.y + Math.floor((workArea.height - height) / 2);
  return { x: place(x, width, workArea.x, workArea.width), y: place(y, height, workArea.y, workArea.height), width, height };
}

// The canvas panel's rule (DESIGN.md 'Panel width'): at most half the window and never leaving the frame column under
// 360; the default max(320, 28%) is cut to that. Below a 640 window the two limits cross and the panel keeps 280 with no
// range at all, which is why the shipped panelBounds (where the maximum wins) is not used here.
export function prototypePanelBounds(windowWidth: number): { min: number; max: number; default: number } {
  const min = PROTOTYPE_PANEL_MIN_WIDTH;
  const max = Math.max(min, Math.min(Math.floor(windowWidth / 2), windowWidth - PROTOTYPE_WINDOW_MIN_WIDTH));
  return { min, max, default: Math.min(max, Math.max(320, Math.floor(windowWidth * 0.28))) };
}

// A panel width cut to a window's range: what main stores, shows and leaves out of a still.
export function prototypePanelWidth(width: number, windowWidth: number): number {
  const bounds = prototypePanelBounds(windowWidth);
  return Math.min(bounds.max, Math.max(bounds.min, width));
}
const clampPanel = prototypePanelWidth;

// The window's minimum while the panel is open: 640, or the work area's width when that is narrower. macOS keeps a
// window as wide as its minimum even past the work area, so the minimum is clamped as the width is.
function panelMinimum(workArea: Rect): number {
  return Math.min(PROTOTYPE_PANEL_WINDOW_MIN_WIDTH, workArea.width);
}

// Opening the panel: a window narrower than 640 grows to exactly 640 (only to the work area's width when that is
// narrower) with the panel at 280, moved left as far as it takes to stay inside (macOS does not move a widened window
// back inside); a wider window keeps its bounds and the panel opens at its remembered width or the default, cut to the
// window's range. The host sets these bounds first and the minimum after: a minimum alone does not widen the window.
export function openPanelResize(window: Rect, workArea: Rect, remembered: number | null = null): { bounds: Rect; panel: number; minimum: number } {
  const minimum = panelMinimum(workArea);
  if (window.width >= PROTOTYPE_PANEL_WINDOW_MIN_WIDTH) {
    return { bounds: window, panel: clampPanel(remembered ?? prototypePanelBounds(window.width).default, window.width), minimum };
  }
  const width = Math.min(PROTOTYPE_PANEL_WINDOW_MIN_WIDTH, workArea.width);
  return { bounds: { ...window, x: place(window.x, width, workArea.x, workArea.width), width }, panel: PROTOTYPE_PANEL_MIN_WIDTH, minimum };
}

// A new play with the panel open: the shown width + 24 (8 on each side and 8 before the panel) + the panel, at least
// 640, so the content panel is the shown width. When that is wider than the work area the panel gives way first, down
// to 280, then the content panel. The panel never exceeds the fitted window's maximum, so a frame narrower than the
// panel's share leaves the rest to the content panel. The name's row comes from the area left of the fitted panel.
export function prototypePanelFit(size: PrototypeSize, workArea: Rect, panel: number, current?: Rect): { bounds: Rect; panel: number; minimum: number } {
  const frameColumn = size.width + 2 * PROTOTYPE_CHROME.side + PROTOTYPE_PANEL_GAP;
  const wanted = Math.max(PROTOTYPE_PANEL_WINDOW_MIN_WIDTH, frameColumn + panel);
  const given = wanted > workArea.width ? Math.max(PROTOTYPE_PANEL_MIN_WIDTH, panel - (wanted - workArea.width)) : panel;
  const width = Math.min(workArea.width, Math.max(PROTOTYPE_PANEL_WINDOW_MIN_WIDTH, frameColumn + given));
  const fitted = clampPanel(given, width);
  return { bounds: placed(width, size, headerHeight(prototypeSideLayout(width, fitted).rows), workArea, current), panel: fitted, minimum: panelMinimum(workArea) };
}

// The header's rows from the header's width: the window's content width while the panel is closed, the area left of
// the open panel (L) otherwise. Both are given, never measured from the content panel they then size, so a row change
// cannot feed back into the width that decided it.
export function prototypeHeaderRows(width: number, right: number): 1 | 2 {
  return width - NAME_OUTSIDE - right >= PROTOTYPE_NAME_MIN_WIDTH ? 1 : 2;
}

// The header's geometry for a window and its conversation panel's width (null while closed): `left`, the width of the
// area left of the panel (the whole window while closed); `right`, the header's right group; `rows`, the name's row.
// The renderer's header, main's fit and main's capture all read it, so the three agree.
export function prototypeSideLayout(windowWidth: number, panel: number | null): { left: number; right: number; rows: 1 | 2 } {
  const left = panel === null ? windowWidth : windowWidth - panel - PROTOTYPE_PANEL_GAP;
  const right = panel === null ? PROTOTYPE_HEADER_RIGHT : PROTOTYPE_HEADER_RIGHT_OPEN;
  return { left, right, rows: prototypeHeaderRows(left, right) };
}

function headerHeight(rows: 1 | 2): number {
  return PROTOTYPE_CHROME.header + (rows === 2 ? PROTOTYPE_NAME_ROW_HEIGHT : 0);
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
// `panel` is the open conversation panel's width (0 while closed): the content panel is then the area left of it, less
// the sides. Null when nothing of the frame is visible.
export function prototypeCaptureRect(content: { width: number; height: number }, mark: PrototypeSize, mode: PrototypeMode, panel = 0): { rect: Rect; box: Rect } | null {
  const layout = prototypeSideLayout(content.width, panel > 0 ? panel : null);
  const top = headerHeight(layout.rows);
  const area = { width: layout.left - 2 * PROTOTYPE_CHROME.side, height: content.height - top - PROTOTYPE_CHROME.bottom };
  const viewport = prototypeViewportBox(area, mark, mode);
  const box = { x: viewport.x, y: viewport.y, width: viewport.visibleWidth, height: viewport.visibleHeight };
  if (box.width <= 0 || box.height <= 0) return null;
  return { rect: { ...box, x: PROTOTYPE_CHROME.side + box.x, y: top + box.y }, box };
}
