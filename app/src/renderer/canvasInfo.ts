import type { CanvasRow } from "../main/view";

export function canvasInfo(row: CanvasRow, layout: { frames: readonly unknown[]; truncated: boolean } | null): {
  path: string; id: string; width: string; frames: string; open: string; resolved: string;
} {
  return {
    path: row.path,
    id: row.id ?? "—",
    width: row.width === undefined ? "—" : `${row.width} px`,
    frames: layout === null ? "—" : layout.truncated ? "1,000+" : String(layout.frames.length),
    open: String(row.open),
    resolved: String(row.resolved),
  };
}
