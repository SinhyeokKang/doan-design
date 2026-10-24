import type { CanvasRow } from "../main/view";

export interface FolderNode {
  kind: "folder";
  // Folder path as listed, e.g. `design/billing`.
  key: string;
  name: string;
  children: TreeNode[];
}

export interface CanvasNode {
  kind: "canvas";
  // The canvas path, unique per row.
  key: string;
  // Display name: the title, else the file name without `.html`.
  name: string;
  fileName: string;
  row: CanvasRow;
}

// Frame rows hang under a canvas row. The key is the document position: ids can
// be empty or repeat, so they cannot key a row.
export interface FrameNode {
  kind: "frame";
  key: string;
  canvas: string;
  index: number;
  frame: { id: string; title?: string };
}

export interface OverviewNode {
  kind: "overview";
}

export type TreeNode = FolderNode | CanvasNode;
export type RowNode = TreeNode | FrameNode | OverviewNode;

// A single instance: building a collator per comparison is slow on big lists.
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function canvasLabel(row: CanvasRow): string {
  const title = row.title?.trim();
  if (title) return title;
  const fileName = fileNameOf(row.path);
  const stem = fileName.endsWith(".html") ? fileName.slice(0, -".html".length) : fileName;
  return stem === "" ? fileName : stem;
}

export function frameLabel(frame: { id: string; title?: string }, index: number): { number: number; name: string } {
  return { number: index + 1, name: frame.title?.trim() || frame.id || "(no id)" };
}

// The name a row answers to in type-ahead; a frame's number is not part of it.
export function typeaheadKey(node: RowNode): string {
  switch (node.kind) {
    case "overview":
      return "Overview";
    case "frame":
      return frameLabel(node.frame, node.index).name;
    default:
      return node.name;
  }
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
    const segments = row.path.split("/");
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

export type RowActionKind = "overview" | "toggle" | "open" | "jump" | "select" | "open-jump" | "none";

// Click/Enter is `primary`; Space and the default (double-click) action is
// `secondary`. `openCanvas` is the open canvas's path, or null.
export function rowAction(node: RowNode, openCanvas: string | null): { primary: RowActionKind; secondary: RowActionKind } {
  switch (node.kind) {
    case "overview":
      return { primary: "overview", secondary: "overview" };
    case "folder":
      return { primary: "toggle", secondary: "toggle" };
    case "canvas": {
      const action = node.key === openCanvas ? "none" : "open";
      return { primary: action, secondary: action };
    }
    case "frame":
      return node.canvas === openCanvas ? { primary: "jump", secondary: "select" } : { primary: "open-jump", secondary: "none" };
  }
}
