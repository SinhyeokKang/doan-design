import type { CanvasRow } from "../main/view";

// Worktree switcher (design 'Memory model'): the same canvas id as the current
// canvas, else the canvas remembered for the target root (by path), else null
// for the workspace's first screen.
export function switchTarget(currentCanvasId: string | undefined, targetRows: readonly CanvasRow[], remembered: string | undefined): CanvasRow | null {
  if (currentCanvasId !== undefined) {
    const same = targetRows.find((row) => row.id === currentCanvasId);
    if (same) return same;
  }
  return (remembered === undefined ? undefined : targetRows.find((row) => row.path === remembered)) ?? null;
}
