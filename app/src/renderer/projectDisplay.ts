import type { FolderEntry } from "../main/view";
import { cardRow, groupProjects } from "./homeCards";

export function displayPath(path: string, home: string | null): string {
  if (!home) return path;
  if (path === home) return "~";
  return path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
}

export function commentContext(entries: FolderEntry[], root: string, path: string): string {
  const card = groupProjects(entries, new Map(entries.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : []))).find(card => card.rows.some(row => row.path === root));
  const entry = entries.find(entry => entry.path === root);
  const branch = entry && cardRow(entry, null, null).summary?.branch;
  return `${card?.name ?? root.split("/").at(-1)}${branch ? ` (${branch})` : ""} › ${path.replace(/^doan\//, "")}`;
}
