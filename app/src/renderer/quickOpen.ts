import type { CanvasRow, FolderEntry } from "../main/view";
import { canvasLabel, frameLabel } from "./canvasTree";

export interface SearchFrame {
  id: string;
  title?: string;
}

export type SearchCanvas = CanvasRow & {
  frames?: readonly SearchFrame[];
  framesTruncated?: boolean;
};

export type SearchFolder = Exclude<FolderEntry, { kind: "list" }> |
  (Omit<Extract<FolderEntry, { kind: "list" }>, "canvases"> & { canvases: readonly SearchCanvas[] });

export interface RenderedSearchFrames {
  root: string;
  path: string;
  frames: readonly SearchFrame[];
}

interface CanvasTarget {
  root: string;
  path: string;
  canvasLabel: string;
  label: string;
}

export type SearchResult = CanvasTarget & (
  | { kind: "canvas" }
  | { kind: "frame"; frameId: string; frameIndex: number }
);

export type SearchEntry = SearchResult & { fields: readonly string[] };

function searchText(text: string): string {
  return text.toLowerCase().normalize("NFC");
}

function searchResult({ fields: _fields, ...result }: SearchEntry): SearchResult {
  return result;
}

export function searchIndex(entries: readonly SearchFolder[], rendered?: RenderedSearchFrames): SearchEntry[] {
  const index: SearchEntry[] = [];
  for (const entry of entries) {
    if (entry.kind !== "list") continue;
    for (const row of entry.canvases) {
      const label = canvasLabel(row);
      const target = { root: entry.path, path: row.path, canvasLabel: label };
      index.push({ ...target, kind: "canvas", label,
        // The shared scope prefix must not outrank actual title or frame matches.
        fields: [label, row.path.split("/").at(-1) ?? row.path, row.path.replace(/^design\//, ""), row.id ?? ""].map(searchText) });
      const frames = rendered?.root === entry.path && rendered.path === row.path ? rendered.frames : row.frames ?? [];
      for (const [frameIndex, frame] of frames.slice(0, 1000).entries()) {
        index.push({ ...target, kind: "frame", label: frameLabel(frame, frameIndex).name,
          frameId: frame.id, frameIndex,
          fields: [frame.title ?? "", frame.id].map(searchText) });
      }
    }
  }
  return index;
}

function tokenScore(fields: readonly string[], token: string): number {
  let score = 0;
  for (const field of fields) {
    if (field.startsWith(token)) return 3;
    let at = field.indexOf(token);
    if (at === -1) continue;
    score = Math.max(score, 1);
    while (at > 0) {
      if (!/[\p{L}\p{N}]/u.test(field.slice(at - 1, at))) {
        score = 2;
        break;
      }
      at = field.indexOf(token, at + 1);
    }
  }
  return score;
}

export function searchMatch(
  index: readonly SearchEntry[], query: string, currentRoot: string | null,
  commonOf: (root: string) => string | undefined,
): SearchResult[] {
  const tokens = searchText(query).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return index.filter((entry) => entry.kind === "canvas" && (currentRoot === null || entry.root === currentRoot)).slice(0, 50).map(searchResult);
  }
  const common = currentRoot === null ? undefined : commonOf(currentRoot);
  const proximity = new Map<string, number>();
  const matches: { entry: SearchEntry; score: number; proximity: number }[] = [];
  for (const entry of index) {
    let score = 0;
    for (const token of tokens) {
      const part = tokenScore(entry.fields, token);
      if (part === 0) {
        score = 0;
        break;
      }
      score += part;
    }
    if (score === 0) continue;
    let rank = proximity.get(entry.root);
    if (rank === undefined) {
      rank = entry.root === currentRoot ? 0 : common !== undefined && commonOf(entry.root) === common ? 1 : 2;
      proximity.set(entry.root, rank);
    }
    // Keep only the visible candidates; broad queries otherwise allocate and
    // sort tens of thousands of matches that are immediately discarded.
    const last = matches[49];
    if (last && (score < last.score || (score === last.score && rank >= last.proximity))) continue;
    const before = matches.findIndex((match) => score > match.score || (score === match.score && rank < match.proximity));
    matches.splice(before === -1 ? matches.length : before, 0, { entry, score, proximity: rank });
    if (matches.length > 50) matches.pop();
  }
  return matches.map(({ entry }) => searchResult(entry));
}

export function pickTarget(result: SearchResult, loadedRoot: string | null, openCanvas: string | null): "switch" | "open" | "jump" {
  if (result.root !== loadedRoot) return "switch";
  return result.path === openCanvas ? "jump" : "open";
}

export function unavailableCanvasMessage(entry: FolderEntry | undefined, path: string): string {
  if (entry?.kind === "list" && entry.canvases.some(row => row.path === path)) return "Canvas changed while opening. Choose it again from the Sidebar or Quick Open.";
  if (entry?.kind === "list") return `${canvasLabel({ path, url: "", open: 0, resolved: 0 })} is no longer in design/`;
  if (entry?.kind === "loading") return "Project is still being read. Try Open again shortly.";
  return "Project is unavailable. Check its status on Home and try again.";
}
