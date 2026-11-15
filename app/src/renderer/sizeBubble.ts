// Where the selection's size bubble goes, in the canvas area's coordinates. It hangs `gap` below the selection, as
// drawn. When that would leave it outside the visible area or under the floating tools (a frame taller than the view,
// moved to from the frame drawer, ends under them), it flips above the selection; with no room there either, it is
// held just above the tools, over the selection's lower part, so its Play stays reachable. A selection off screen
// keeps the bubble below it, off screen too.
export type BubblePlace = { kind: "below" } | { kind: "above" } | { kind: "inside"; top: number };

// The size bubble as styles.css draws it: 24px tall (a caption line and 4px padding, or an xs button) and hung 5px from
// the outer edge of the selection's 1.5px line, which lies outside the selection's rect.
export const SIZE_BUBBLE = { height: 24, gap: 6.5 };

export interface BubbleRoom {
  // The visible band: the area's top and the floating tools' top (or the area's bottom without them).
  top: number;
  bottom: number;
}

export function sizeBubblePlace(selection: { y: number; height: number }, bubble: { height: number; gap: number }, room: BubbleRoom): BubblePlace {
  const below = selection.y + selection.height + bubble.gap;
  if (below >= room.top && below + bubble.height <= room.bottom) return { kind: "below" };
  const above = selection.y - bubble.gap - bubble.height;
  if (above >= room.top && above + bubble.height <= room.bottom) return { kind: "above" };
  const visible = selection.y < room.bottom && selection.y + selection.height > room.top;
  if (!visible || room.bottom - room.top < bubble.height) return { kind: "below" };
  return { kind: "inside", top: Math.max(room.top, Math.min(below, room.bottom - bubble.height)) };
}
