// SPDX-License-Identifier: MIT
// Geometry tests for the docked buddy, from the docked draft .doan/assets/buddies/docked-poc.js (MIT, Doan
// contributors): whether a floating element covers the buddy, and whether a pointer is on its painted body.
// Viewport coordinates throughout; the shell reads the rects from the DOM once per frame.
import { FLOOR, SIZE, WINDOW, type Presence } from "./dockedBuddyCore";

export interface Box { left: number; right: number; top: number; bottom: number }
// A surface's padding box; its top edge is the floor.
export interface SurfaceEdge { left: number; right: number; top: number }

// The clip window over a surface: only the buddy is clipped, never the composer, popovers or toolbar controls.
export function clipWindow(r: SurfaceEdge): Box { return { left: r.left, right: r.right, top: r.top + FLOOR - WINDOW, bottom: r.top + FLOOR }; }
// The buddy's own 56px box at x on a surface, down to the floor. Floating elements are measured against it rather than
// the clip window, so a tooltip far along the surface (Send, Presets) does not send the buddy down.
export function buddyBox(r: SurfaceEdge, x: number): Box { return { left: r.left + x, right: r.left + x + SIZE, top: r.top + FLOOR - SIZE, bottom: r.top + FLOOR }; }

// A floating element counts only when it intersects the box; touching edges and empty rects (a closed popper keeps
// its wrapper) do not. Geometry, not state: the app's menus and tooltips do not expose whether they are open.
export function overlaps(box: Box, rects: readonly Box[]) {
  return rects.some(r => r.right > r.left && r.bottom > r.top && r.left < box.right && box.left < r.right && r.top < box.bottom && box.top < r.bottom);
}

// The still image's RGBA pixels, row by row.
export interface SilhouetteMask { data: ArrayLike<number>; width: number; height: number }
export interface HostRect { left: number; top: number; width: number; height: number }

// Whether a pointer at (px, py) is over an opaque pixel of the buddy, so only the painted body takes clicks and the
// transparent margin passes them to the thread or board underneath. The mask is fitted into the host with the rig's
// 16.5% padding; the hop's lift (about 7px at most) is not followed. Only a fully shown buddy takes a click.
export function onSilhouette(mask: SilhouetteMask | null, host: HostRect, presence: Presence, px: number, py: number) {
  if (!mask || presence !== "shown") return false;
  const pad = .165*host.width;
  const cw = host.width - 2*pad, ch = host.height - 2*pad, scale = Math.min(cw/mask.width, ch/mask.height);
  const ox = host.left + pad + (cw - mask.width*scale)/2, oy = host.top + pad + (ch - mask.height*scale)/2;
  const ix = Math.floor((px - ox)/scale), iy = Math.floor((py - oy)/scale);
  if (ix < 0 || iy < 0 || ix >= mask.width || iy >= mask.height) return false;
  return mask.data[(iy*mask.width + ix)*4 + 3]! > 32;
}
