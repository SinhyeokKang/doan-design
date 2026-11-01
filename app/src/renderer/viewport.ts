// Pure view math for the canvas view. Screen coordinates are relative to the
// canvas view container's top-left; the board is the iframe's own pixel space.
// screen = board * scale + (x, y), matching `translate(x, y) scale(s)` with
// `transform-origin: 0 0`.

export interface View {
  x: number;
  y: number;
  scale: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

// Distances kept free of the board view's edges, in screen px.
export interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ZoomLimits {
  min: number;
  max: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 4;
export const ZOOM_LIMITS: ZoomLimits = { min: MIN_SCALE, max: MAX_SCALE };
// One toolbar/menu step.
export const ZOOM_STEP = 1.25;
// Cap per wheel event so one notch of a mouse wheel cannot jump across the range.
export const WHEEL_ZOOM_MAX = 1.25;
// Still used by `locateView`; Fit and frame jumps use FIT_INSET.
export const FIT_MARGIN = 32;
// Top clears the canvas header's height, bottom clears the floating toolbar (12 + 40 + 12).
export const FIT_INSET: Inset = { top: 56, right: 32, bottom: 64, left: 32 };
export const FIT_SCALE_MAX = 1;
export const FIRST_LAYOUT_TIMEOUT_MS = 5000;

// A feel constant, not a measured one: 0.01 makes a trackpad pinch (|dy| of a
// few px) move smoothly while a mouse-wheel notch (|dy| 100) already hits
// WHEEL_ZOOM_MAX. Revisit if wheel zoom feels off in the app.
export const WHEEL_ZOOM_SENSITIVITY = 0.01;
// Chromium reports pixels (deltaMode 0); lines and pages only show up from
// other sources, so these are rough conversions rather than measured values.
export const LINE_PX = 16;
export const PAGE_PX = 800;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function boardToScreen(view: View, point: Point): Point {
  return { x: point.x * view.scale + view.x, y: point.y * view.scale + view.y };
}

export function boardRectToScreen(view: View, rect: Rect): Rect {
  return { x: rect.x * view.scale + view.x, y: rect.y * view.scale + view.y, width: rect.width * view.scale, height: rect.height * view.scale };
}

export function screenToBoard(view: View, point: Point): Point {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
}

export function zoomAt(view: View, factor: number, point: Point, limits: ZoomLimits): View {
  if (!Number.isFinite(factor) || factor <= 0) return view;
  const scale = clamp(view.scale * factor, limits.min, limits.max);
  const ratio = scale / view.scale;
  return { x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio, scale };
}

export function panBy(view: View, dx: number, dy: number): View {
  return { x: view.x + dx, y: view.y + dy, scale: view.scale };
}

function fitScale(contentWidth: number, viewport: Size, inset: Inset): number {
  const wanted = contentWidth > 0 ? (viewport.width - inset.left - inset.right) / contentWidth : FIT_SCALE_MAX;
  return Math.max(MIN_SCALE, Math.min(FIT_SCALE_MAX, wanted));
}

// The viewport minus the inset. A window smaller than its insets has no room: the size is 0, so content aligns to
// the top/left inset instead of being centered on a negative size.
function safeArea(viewport: Size, inset: Inset): Rect {
  return {
    x: inset.left,
    y: inset.top,
    width: Math.max(0, viewport.width - inset.left - inset.right),
    height: Math.max(0, viewport.height - inset.top - inset.bottom),
  };
}

export function fitWidth(boardWidth: number, viewport: Size, inset: Inset): View {
  const scale = fitScale(boardWidth, viewport, inset);
  const safe = safeArea(viewport, inset);
  return { x: safe.x + (safe.width - boardWidth * scale) / 2, y: safe.y, scale };
}

// `current` is needed because a zero-size frame has no size to fit and keeps
// the scale the person already chose.
export function fitFrame(rect: Rect, viewport: Size, inset: Inset, current: View): View {
  const safe = safeArea(viewport, inset);
  const centerX = rect.x + rect.width / 2;
  if (rect.width <= 0 || rect.height <= 0) {
    const centerY = rect.y + rect.height / 2;
    return {
      x: safe.x + safe.width / 2 - centerX * current.scale,
      y: safe.y + safe.height / 2 - centerY * current.scale,
      scale: current.scale,
    };
  }
  const scale = fitScale(rect.width, viewport, inset);
  const x = safe.x + safe.width / 2 - centerX * scale;
  // A frame taller than the safe area is read from its top, not its middle.
  const y =
    rect.height * scale > safe.height
      ? safe.y - rect.y * scale
      : safe.y + safe.height / 2 - (rect.y + rect.height / 2) * scale;
  return { x, y, scale };
}

// Locate moves the board without zooming: the rect is centered at the current
// scale, and one taller than the viewport is read from its top, as in fitFrame.
export function locateView(rect: Rect, viewport: Size, view: View): View {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return view;
  const x = viewport.width / 2 - (rect.x + rect.width / 2) * view.scale;
  const y =
    rect.height * view.scale > viewport.height
      ? FIT_MARGIN - rect.y * view.scale
      : viewport.height / 2 - (rect.y + rect.height / 2) * view.scale;
  return { x, y, scale: view.scale };
}

export interface WheelInput {
  dx: number;
  dy: number;
  ctrl: boolean;
  meta: boolean;
  deltaMode: number;
}

// `pan` is the translation to apply to the view (opposite to the wheel delta,
// as scrolling down moves the content up).
export type WheelAction = { zoom: number } | { pan: { dx: number; dy: number } };

function pixelScale(deltaMode: number): number {
  if (deltaMode === 1) return LINE_PX;
  if (deltaMode === 2) return PAGE_PX;
  return 1;
}

export function wheelAction(input: WheelInput): WheelAction {
  const scale = pixelScale(input.deltaMode);
  if (input.ctrl || input.meta) {
    // Infinite dy is kept (not zeroed): exp(±Infinity) is 0 or Infinity and the
    // clamp below turns both into a valid factor.
    const dy = Number.isNaN(input.dy) ? 0 : input.dy * scale;
    return { zoom: clamp(Math.exp(-dy * WHEEL_ZOOM_SENSITIVITY), 1 / WHEEL_ZOOM_MAX, WHEEL_ZOOM_MAX) };
  }
  const finite = (delta: number): number => (Number.isFinite(delta) ? delta * scale : 0);
  return { pan: { dx: -finite(input.dx), dy: -finite(input.dy) } };
}
