import { canvasesAt, listedOnce } from "./handoff";
import { sameCanvas } from "./sessions";
import type { Canvas } from "./types";

// snapshot: the root's listed canvases at turn acceptance. edits: the turn's own edit paths as reported. listed: the
// canvas rows now. announced: what this turn's canvas.drawn events named already.
export interface DrawnInput { root: string; snapshot: readonly Canvas[]; edits: readonly string[]; listed: readonly Canvas[]; announced: readonly Canvas[] }
// The new canvases the turn drew and has not announced, in edit order. A file made by a shell command has no edit path,
// so it is never named; nor is a canvas renamed between two judgements, which the snapshot does not hold by ID.
export function drawnCanvases(input: DrawnInput): Canvas[] {
  const named = (row: Canvas, canvases: readonly Canvas[]) => canvases.some(old => sameCanvas(old, row) || old.path === row.path);
  return canvasesAt(input.root, input.edits, listedOnce(input.listed), input.snapshot).filter(row => !named(row, input.snapshot) && !named(row, input.announced));
}
