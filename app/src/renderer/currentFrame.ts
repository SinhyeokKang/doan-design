import { screenToBoard, type Rect, type Size, type View } from "./viewport";

// The frame the person is looking at: the one under the viewport center (the
// last in document order when frames nest, so the innermost), else the one
// nearest to it. `frames` are in board coordinates, like `layout.frames`.
export function currentFrame(frames: readonly Rect[], view: View, viewport: Size): number | null {
  const center = screenToBoard(view, { x: viewport.width / 2, y: viewport.height / 2 });
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return null;
  let nearest: number | null = null;
  let nearestDistance = Infinity;
  for (const [index, frame] of frames.entries()) {
    const distance = Math.hypot(Math.max(frame.x - center.x, 0, center.x - (frame.x + frame.width)), Math.max(frame.y - center.y, 0, center.y - (frame.y + frame.height)));
    // `<=` for a containing frame so a later (inner) one wins; `<` otherwise so
    // equal distances keep the earlier frame.
    if (distance === 0 ? nearestDistance >= 0 : distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  }
  return nearest;
}
