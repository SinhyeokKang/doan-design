import type { CanvasRow } from "../main/view";

function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function canvasLabel(row: CanvasRow): string {
  return canvasStem(row.path);
}

// Every canvas name the app shows goes through this one rule.
export function canvasStem(path: string): string {
  const fileName = fileNameOf(path);
  const stem = fileName.toLowerCase().endsWith(".html") ? fileName.slice(0, -".html".length) : fileName;
  return stem === "" ? fileName : stem;
}

export function frameLabel(frame: { id: string; title?: string }, index: number): { number: number; name: string } {
  return { number: index + 1, name: frame.title?.trim() || frame.id || "(no id)" };
}

// WAI-ARIA APG Tree View. A longer buffer searches from the current row inclusive, so typing "ab" stays on "abacus"
// rather than jumping to "abbey".
export function typeaheadNext(visibleKeys: readonly string[], currentIndex: number, buffer: string): number | null {
  const count = visibleKeys.length;
  if (buffer === "" || count === 0) return null;
  const lower = visibleKeys.map((key) => key.toLowerCase());
  const needle = buffer.toLowerCase();
  const search = (prefix: string, from: number): number | null => {
    for (let step = 0; step < count; step += 1) {
      const index = (from + step) % count;
      if (lower[index]?.startsWith(prefix)) return index;
    }
    return null;
  };
  // Code points, not UTF-16 units: an emoji is one typed character.
  const chars = [...needle];
  const first = chars[0] ?? "";
  if (chars.every((char) => char === first)) return search(first, currentIndex + 1);
  return search(needle, Math.max(currentIndex, 0));
}

// Its own row keeps its state, and the folders it moved into open.
export function moveExpanded(paths: readonly string[], from: string, to: string): string[] {
  const next = new Set(paths.filter(path => path !== from));
  const parts = to.split("/");
  for (let i = 2; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
  if (paths.includes(from)) next.add(to);
  return [...next];
}

export function rowProblem(row: CanvasRow): { sentence: string; detail: string } | null {
  const error = row.error;
  if (!error) return null;
  return { sentence: "Can’t read this canvas. Run doan check in a terminal.", detail: `${error.code}: ${error.message}` };
}
