import { posix } from "node:path";
import { canvasKind } from "../formats/canvasPath";

export interface DesignChange {
  // Something other than a listed canvas changed, so every open canvas reloads.
  bumpServed: boolean;
  // Repo-relative canvas paths (as in CanvasRow.path) whose own row revision moves.
  revPaths: string[];
}

// The decision is made from names alone, before `doan ls` runs, so a file that
// later turns out not to be listed only costs a row revision nobody reads.
const canvasName = (name: string) => canvasKind(name) !== null;

// Claude Code writes `<name>.tmp.<pid>.<hex>` beside the file and renames it
// over; Node atomic writes were seen as `.<name>.tmp-<pid>` and `<name>.tmp`.
// Such a name counts as part of the canvas save only when the canvas itself is
// in the same set; alone it bumps, which at worst costs one more reload.
function tempSibling(name: string, canvases: readonly string[]): boolean {
  const dir = posix.dirname(name);
  const base = posix.basename(name).toLowerCase().replace(/^\./, "");
  return canvases.some((canvas) => posix.dirname(canvas) === dir && base.startsWith(`${posix.basename(canvas).toLowerCase()}.tmp`));
}

// `names` are repo-relative (`.doan/canvases/a.html`, `.doan/ds/a.html`) as the
// watcher reports them; `null` is an event without a name, which could be anything.
export function classifyDesignChange(names: readonly string[] | null): DesignChange {
  if (names === null) return { bumpServed: true, revPaths: [] };
  const unique = [...new Set(names)];
  const canvases = unique.filter(canvasName);
  const bumpServed = unique.some((name) => !canvasName(name) && !tempSibling(name, canvases));
  return { bumpServed, revPaths: canvases };
}
