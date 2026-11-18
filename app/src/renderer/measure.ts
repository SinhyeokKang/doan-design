import type { CanvasRect } from "./canvasMessage";

// One line of an Option-hover measurement, in board (canvas) px. `axis` is the direction the line runs: an "x" line
// spans x from `from` to `to` at y = `at`, a "y" line spans y at x = `at`. `from` < `to`. A solid line's distance is
// `to - from`; a dashed one is an extension and carries no label.
export interface MeasureLine {
  axis: "x" | "y";
  from: number;
  to: number;
  at: number;
  dashed: boolean;
}

export function measureLines(_selected: CanvasRect, _target: CanvasRect): MeasureLine[] {
  return [];
}
