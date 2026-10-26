import type { CanvasRow } from "../main/view";
import { buildCanvasTree, type CanvasNode, type TreeNode } from "./canvasTree";

export interface OverviewSection {
  key: string;
  canvases: CanvasNode[];
}

// Root first, then folders in tree order; a folder's section holds only its
// own canvases, so a folder of folders has none.
export function overviewSections(rows: readonly CanvasRow[]): OverviewSection[] {
  const sections: OverviewSection[] = [];
  const walk = (nodes: readonly TreeNode[], key: string) => {
    const canvases = nodes.filter((node): node is CanvasNode => node.kind === "canvas");
    if (canvases.length) sections.push({ key, canvases });
    for (const node of nodes) if (node.kind === "folder") walk(node.children, node.key);
  };
  walk(buildCanvasTree(rows), "");
  return sections;
}

// The card after the removed one in the previous order that is still listed,
// else the nearest one before it.
export function focusAfterRemoval(previous: readonly string[], current: readonly string[], focused: string): string | null {
  const at = previous.indexOf(focused);
  if (at === -1 || current.includes(focused)) return null;
  const listed = new Set(current);
  return previous.slice(at + 1).find(key => listed.has(key)) ?? previous.slice(0, at).reverse().find(key => listed.has(key)) ?? null;
}
