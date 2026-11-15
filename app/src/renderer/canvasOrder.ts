import type { CanvasRow } from "../main/view";
import { canvasLabel } from "./canvasTree";

const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

// Newest modified first; a row without `mtimeMs` sorts after every row with one. Ties keep the natural label order,
// then the path, so the list is stable between refreshes.
export const sortedCanvases = (rows: readonly CanvasRow[]): CanvasRow[] => [...rows].sort((a, b) => {
  const missing = Number(a.mtimeMs === undefined) - Number(b.mtimeMs === undefined);
  if (missing) return missing;
  return (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0) || natural.compare(canvasLabel(a), canvasLabel(b)) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
});
