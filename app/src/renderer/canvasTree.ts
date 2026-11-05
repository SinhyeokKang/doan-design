import type { CanvasRow } from "../main/view";

export interface FolderNode {
  kind: "folder";
  // Folder path as listed, e.g. `.doan/canvases/billing`.
  key: string;
  name: string;
  children: TreeNode[];
}

export interface CanvasNode {
  kind: "canvas";
  // The canvas path, unique per row.
  key: string;
  // Display name: the file name without `.html`.
  name: string;
  fileName: string;
  row: CanvasRow;
}

export type TreeNode = FolderNode | CanvasNode;

// A single instance: building a collator per comparison is slow on big lists.
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function canvasLabel(row: CanvasRow): string {
  const fileName = fileNameOf(row.path);
  const stem = fileName.toLowerCase().endsWith(".html") ? fileName.slice(0, -".html".length) : fileName;
  return stem === "" ? fileName : stem;
}

export function frameLabel(frame: { id: string; title?: string }, index: number): { number: number; name: string } {
  return { number: index + 1, name: frame.title?.trim() || frame.id || "(no id)" };
}

function compare(a: TreeNode, b: TreeNode): number {
  const byName = collator.compare(a.name, b.name);
  if (byName !== 0) return byName;
  // Names equal under the collator (case only); keep the order stable.
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function sortNodes(nodes: TreeNode[]): void {
  const folders = nodes.filter((node): node is FolderNode => node.kind === "folder").sort(compare);
  const canvases = nodes.filter((node): node is CanvasNode => node.kind === "canvas").sort(compare);
  nodes.splice(0, nodes.length, ...folders, ...canvases);
  for (const folder of folders) sortNodes(folder.children);
}

// Sorted here for display only; `rows` keeps the CLI's order, which `doan ls`
// and the agents rely on.
export function buildCanvasTree(rows: readonly CanvasRow[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const folders = new Map<string, FolderNode>();
  for (const row of rows) {
    const segments = row.path.startsWith(".doan/canvases/") ? [".doan/canvases", ...row.path.slice(".doan/canvases/".length).split("/")] : row.path.split("/");
    segments.pop();
    let siblings = roots;
    let key = "";
    for (const segment of segments) {
      key = key === "" ? segment : `${key}/${segment}`;
      let folder = folders.get(key);
      if (folder === undefined) {
        folder = { kind: "folder", key, name: segment, children: [] };
        folders.set(key, folder);
        siblings.push(folder);
      }
      siblings = folder.children;
    }
    siblings.push({ kind: "canvas", key: row.path, name: canvasLabel(row), fileName: fileNameOf(row.path), row });
  }
  sortNodes(roots);
  return roots;
}

// WAI-ARIA APG Tree View. A repeated single letter cycles through the rows of
// that letter; a longer buffer searches from the current row inclusive, so
// continuing to type refines the current match instead of skipping it (typing
// "ab" stays on "abacus" rather than jumping to "abbey"), as typical tree and
// list typeahead does.
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

// Expanded tree keys after the open canvas moved: its own row keeps its
// state, and the folders it moved into open.
export function moveExpanded(paths: readonly string[], from: string, to: string): string[] {
  const next = new Set(paths.filter(path => path !== from));
  const parts = to.split("/");
  for (let i = 2; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
  if (paths.includes(from)) next.add(to);
  return [...next];
}

// A canvas ls could not read: the fixed sentence under its row, and the raw
// error for Details.
export function rowProblem(row: CanvasRow): { sentence: string; detail: string } | null {
  const error = row.error;
  if (!error) return null;
  return { sentence: "Can't read this canvas — run doan check", detail: `${error.code}: ${error.message}` };
}
