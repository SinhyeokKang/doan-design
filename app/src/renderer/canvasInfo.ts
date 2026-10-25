import type { CanvasRow } from "../main/view";

export function canvasInfo(row: CanvasRow, layout: { frames: readonly unknown[]; truncated: boolean } | null): {
  path: string; id: string; width: string; frames: string;
} {
  const capped = layout?.frames.length === 1000 && (row.frames === undefined ? layout.truncated : row.framesTruncated);
  return {
    path: row.path,
    id: row.id ?? "—",
    width: row.width === undefined ? "—" : `${row.width} px`,
    frames: layout === null ? "—" : capped ? "1,000+" : String(layout.frames.length),
  };
}
