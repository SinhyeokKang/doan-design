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

export type SearchKind = "all" | SearchResult["kind"];

function searchText(text: string): string {
  return text.toLowerCase().normalize("NFC");
}

function queryTokens(query: string): string[] {
  return searchText(query).trim().split(/\s+/).filter(Boolean);
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
        fields: [label, row.path.split("/").at(-1) ?? row.path, row.path.replace(/^\.doan\/canvases\//, ""), row.id ?? ""].map(searchText) });
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

// Where tokenScore's best match in one field starts: prefix, then word start, then first substring.
function tokenStart(field: string, token: string): number {
  if (field.startsWith(token)) return 0;
  const first = field.indexOf(token);
  for (let at = first; at > 0; at = field.indexOf(token, at + 1)) {
    if (!/[\p{L}\p{N}]/u.test(field.slice(at - 1, at))) return at;
  }
  return first;
}

export function matchPositions(label: string, query: string): number[] {
  const tokens = queryTokens(query);
  const text = searchText(label);
  // Positions found in the normalized text would land on the wrong characters of the label.
  if (tokens.length === 0 || Array.from(text).length !== Array.from(label).length) return [];
  const marked = new Set<number>();
  for (const token of tokens) {
    const at = tokenStart(text, token);
    if (at === -1) continue;
    const start = Array.from(text.slice(0, at)).length;
    for (let i = 0; i < Array.from(token).length; i++) marked.add(start + i);
  }
  return [...marked].sort((a, b) => a - b);
}

export function markRuns(label: string, positions: readonly number[]): { text: string; match: boolean }[] {
  const marked = new Set(positions);
  const runs: { text: string; match: boolean }[] = [];
  for (const [at, char] of Array.from(label).entries()) {
    const match = marked.has(at);
    const last = runs.at(-1);
    if (last?.match === match) last.text += char;
    else runs.push({ text: char, match });
  }
  return runs;
}

export function searchMatch(
  index: readonly SearchEntry[], query: string, currentRoot: string | null,
  commonOf: (root: string) => string | undefined,
  kind: SearchKind = "all", open?: { root: string; path: string },
): SearchResult[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    const shown = kind === "frame" ? "frame" : "canvas";
    const scoped = index.filter((entry) => entry.kind === shown && (currentRoot === null || entry.root === currentRoot));
    if (kind === "frame" && open !== undefined && currentRoot !== null && open.root === currentRoot) {
      const opened = scoped.filter((entry) => entry.path === open.path);
      return [...opened, ...scoped.filter((entry) => entry.path !== open.path)].slice(0, 50).map(searchResult);
    }
    return scoped.slice(0, 50).map(searchResult);
  }
  const common = currentRoot === null ? undefined : commonOf(currentRoot);
  const proximity = new Map<string, number>();
  const matches: { entry: SearchEntry; score: number; proximity: number }[] = [];
  for (const entry of index) {
    // Filtering before the cap keeps a tab from emptying when the other kind fills it.
    if (kind !== "all" && entry.kind !== kind) continue;
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

export function countMatches(index: readonly SearchEntry[], query: string, kind: SearchResult["kind"]): number {
  const tokens = queryTokens(query);
  let count = 0;
  for (const entry of index) {
    if (entry.kind === kind && tokens.every((token) => tokenScore(entry.fields, token) > 0)) count++;
  }
  return count;
}

export function emptyText(kind: SearchKind, query: string, scope: readonly FolderEntry[], otherCount: number): string {
  if (query.trim()) {
    if (kind === "all") return "No canvases or frames match";
    const text = kind === "canvas" ? "No canvases match" : "No frames match";
    if (otherCount === 0) return text;
    const count = otherCount > 50 ? "50+" : String(otherCount);
    const other = kind === "canvas" ? (otherCount === 1 ? "frame matches" : "frames match") : (otherCount === 1 ? "canvas matches" : "canvases match");
    return `${text}. ${count} ${other} in All.`;
  }
  if (scope.some(entry => entry.kind === "loading")) return "Project is still being read. Try again shortly.";
  if (scope.some(entry => entry.kind !== "list")) return "Project is unavailable. Fix it from its menu in the sidebar.";
  return kind === "frame" ? "No frames to show" : "No canvases to show";
}

export interface ResultGroup {
  root: string;
  name: string;
  title: string;
  rows: SearchResult[];
}

// searchMatch's order is stable, so a root's first row is its best match and
// grouping by first appearance keeps the overall best row on top.
export function groupResults(results: readonly SearchResult[], names: ReadonlyMap<string, { name: string; title: string }>): ResultGroup[] {
  const groups = new Map<string, ResultGroup>();
  for (const result of results) {
    let group = groups.get(result.root);
    if (!group) {
      group = { root: result.root, ...(names.get(result.root) ?? { name: result.root, title: result.root }), rows: [] };
      groups.set(result.root, group);
    }
    group.rows.push(result);
  }
  return [...groups.values()];
}

export function resultKey(result: SearchResult): string {
  return JSON.stringify(result.kind === "frame" ? [result.root, result.path, result.frameId, result.frameIndex] : [result.root, result.path]);
}

export function resultParts(result: SearchResult, title: string | undefined): { icon: SearchResult["kind"]; name: string; detail: string; accessibleName: string } {
  const detail = result.kind === "frame"
    ? `${result.canvasLabel} › ${frameLabel({ id: result.frameId }, result.frameIndex).number}`
    : result.path.replace(/^\.doan\/canvases\//, "");
  return { icon: result.kind, name: result.label, detail, accessibleName: `${result.label} — ${detail}${title ? ` · ${title}` : ""}` };
}

// A native modal reports its own element for backdrop and padding clicks, so only geometry tells them apart.
// The header strip never closes it: its drag region takes real clicks before the page, but its no-drag controls
// (the mode capsule, the history buttons) reach the backdrop under them.
export function outsideDialog(
  rect: Pick<DOMRect, "left" | "top" | "right" | "bottom">,
  down: { x: number; y: number; button: number }, up: { x: number; y: number },
  strip: Pick<DOMRect, "left" | "top" | "right" | "bottom"> | null = null,
): boolean {
  const within = (box: Pick<DOMRect, "left" | "top" | "right" | "bottom">, { x, y }: { x: number; y: number }) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  const outside = (point: { x: number; y: number }) => !within(rect, point) && !(strip && within(strip, point));
  return down.button === 0 && outside(down) && outside(up);
}

export function pickTarget(result: SearchResult, loadedRoot: string | null, openCanvas: string | null): "switch" | "open" | "jump" {
  if (result.root !== loadedRoot) return "switch";
  return result.path === openCanvas ? "jump" : "open";
}

export function unavailableCanvasMessage(entry: FolderEntry | undefined, path: string): string {
  if (entry?.kind === "list" && entry.canvases.some(row => row.path === path)) return "Canvas changed while opening. Choose it again from the sidebar or Quick Open.";
  if (entry?.kind === "list") return `${canvasLabel({ path, url: "", open: 0, resolved: 0 })} is no longer in .doan/canvases/`;
  if (entry?.kind === "loading") return "Project is still being read. Try Open again shortly.";
  return "Project is unavailable. Fix it from its menu in the sidebar, then try again.";
}
