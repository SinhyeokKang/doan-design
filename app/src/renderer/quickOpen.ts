import { queryTokens, searchText, tokenScore, tokenStart } from "./searchTokens";
import type { ConversationSummary } from "../main/conversation/summary";
import type { OpenLinkResult } from "../main/deepLinks";
import type { CanvasRow, FolderEntry } from "../main/view";
import { canvasDir } from "../formats/canvasPath";
import { conversationCanvasMatch } from "./canvasConversationRows";
import { canvasLabel, frameLabel } from "./canvasTree";
import { shortAgo } from "./overviewConversation";
import { projectReadingLine, projectUnavailableLine } from "./problemView";

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

// A project conversation has no canvas, so a conversation is not a CanvasTarget. `lastActivityAt` is "" when its
// history could not be read.
export interface ConversationResult {
  kind: "conversation";
  root: string;
  conversationId: string;
  title: string;
  canvas?: { path: string; label: string };
  lastActivityAt: string;
}

export type CanvasResult = CanvasTarget & (
  | { kind: "canvas" }
  | { kind: "frame"; frameId: string; frameIndex: number }
);

export type SearchResult = CanvasResult | ConversationResult;

export type SearchEntry = SearchResult & { fields: readonly string[] };
type CanvasEntry = CanvasResult & { fields: readonly string[] };
type ConversationEntry = ConversationResult & { fields: readonly string[] };

export type SearchKind = "all" | SearchResult["kind"];

export type ConversationLists = ReadonlyMap<string, readonly ConversationSummary[] | "loading" | "error">;

function searchResult({ fields: _fields, ...result }: SearchEntry): SearchResult {
  return result;
}

export function searchIndex(entries: readonly SearchFolder[], rendered?: RenderedSearchFrames): CanvasEntry[] {
  const index: CanvasEntry[] = [];
  for (const entry of entries) {
    if (entry.kind !== "list") continue;
    for (const row of entry.canvases) {
      const label = canvasLabel(row);
      const target = { root: entry.path, path: row.path, canvasLabel: label };
      index.push({ ...target, kind: "canvas", label,
        // The shared scope prefix must not outrank actual name or frame matches.
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

// After the canvases and frames in the index, so at equal score they follow them. A canvas conversation is left out
// unless its canvas is exactly one listed row, the Overview's openable rule.
export function conversationEntries(lists: ConversationLists, rowsOf: (root: string) => readonly CanvasRow[] | null): ConversationEntry[] {
  const index: ConversationEntry[] = [];
  for (const [root, list] of lists) {
    const rows = rowsOf(root);
    if (rows === null || typeof list === "string") continue;
    for (const c of list) {
      let canvas: ConversationResult["canvas"];
      if (c.canvas) {
        const match = conversationCanvasMatch(c.canvas, rows);
        if (match.kind !== "one") continue;
        canvas = { path: match.row.path, label: canvasLabel(match.row) };
      }
      index.push({ kind: "conversation", root, conversationId: c.conversationId, title: c.title, ...(canvas ? { canvas } : {}),
        lastActivityAt: c.lastActivityAt, fields: [searchText(c.title)] });
    }
  }
  return index;
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

export function searchMatch(index: readonly CanvasEntry[], query: string, currentRoot: string | null, commonOf: (root: string) => string | undefined, kind?: SearchKind, open?: { root: string; path: string }): CanvasResult[];
export function searchMatch(index: readonly SearchEntry[], query: string, currentRoot: string | null, commonOf: (root: string) => string | undefined, kind?: SearchKind, open?: { root: string; path: string }): SearchResult[];
export function searchMatch(
  index: readonly SearchEntry[], query: string, currentRoot: string | null,
  commonOf: (root: string) => string | undefined,
  kind: SearchKind = "all", open?: { root: string; path: string },
): SearchResult[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    const shown = kind === "frame" || kind === "conversation" ? kind : "canvas";
    const scoped = index.filter((entry) => entry.kind === shown && (currentRoot === null || entry.root === currentRoot));
    if (kind === "conversation") {
      // ISO times compare as strings, an unreadable history's "" sorts last, and the id breaks ties.
      const key = (entry: SearchEntry) => entry.kind === "conversation" ? [entry.lastActivityAt, entry.conversationId] as const : ["", ""] as const;
      return scoped.sort((a, b) => {
        const [ta, ia] = key(a), [tb, ib] = key(b);
        if (ta !== tb) return ta < tb ? 1 : -1;
        return ia < ib ? -1 : ia > ib ? 1 : 0;
      }).slice(0, 50).map(searchResult);
    }
    if (kind === "frame" && open !== undefined && currentRoot !== null && open.root === currentRoot) {
      const inOpen = (entry: SearchEntry) => entry.kind === "frame" && entry.path === open.path;
      return [...scoped.filter(inOpen), ...scoped.filter((entry) => !inOpen(entry))].slice(0, 50).map(searchResult);
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
    // Broad queries would otherwise allocate and sort tens of thousands of matches that are immediately discarded.
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

// A reading project's canvases may still arrive. A failed conversation list is not counted; it adds nothing until its
// Overview's Retry.
export function readingCount(entries: readonly FolderEntry[], lists: ConversationLists, currentRoot: string | null, query: string, kind: SearchKind): number {
  const searched = query.trim() || currentRoot === null ? entries : entries.filter(entry => entry.path === currentRoot);
  const conversations = kind === "conversation" || (kind === "all" && query.trim() !== "");
  return searched.filter(entry => entry.kind === "loading" || (conversations && entry.kind === "list" && lists.get(entry.path) === "loading")).length;
}

export function readingText(count: number): string {
  return `Still reading ${count} ${count === 1 ? "project" : "projects"}`;
}

const NO_MATCH: Record<Exclude<SearchKind, "all">, string> = { canvas: "No canvases match", frame: "No frames match", conversation: "No conversations match" };

// Null while a reading project may still fill the list, so "No canvases to show" would be premature.
export function emptyText(kind: SearchKind, query: string, scope: readonly FolderEntry[], otherCount: number, lists: ConversationLists = new Map()): string | null {
  if (query.trim()) {
    if (kind === "all") return "No canvases, frames or conversations match";
    const text = NO_MATCH[kind];
    if (otherCount === 0) return text;
    const count = otherCount > 50 ? "50+" : String(otherCount);
    return `${text}. ${count} other ${otherCount === 1 ? "result" : "results"} in All.`;
  }
  if (scope.some(entry => entry.kind !== "list" && entry.kind !== "loading")) return "Project is unavailable. Fix it from its menu in the sidebar.";
  if (scope.some(entry => entry.kind === "loading")) return null;
  if (kind === "conversation") return scope.some(entry => lists.get(entry.path) === "loading") ? null : "No conversations to show";
  return kind === "frame" ? "No frames to show" : "No canvases to show";
}

export interface ResultGroup {
  root: string;
  name: string;
  title: string;
  rows: SearchResult[];
}

// searchMatch's order is stable, so grouping by first appearance keeps the overall best row on top.
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

// Roots are absolute paths, so no canvas key starts with "conversation".
export function resultKey(result: SearchResult): string {
  if (result.kind === "conversation") return JSON.stringify(["conversation", result.conversationId]);
  return JSON.stringify(result.kind === "frame" ? [result.root, result.path, result.frameId, result.frameIndex] : [result.root, result.path]);
}

// Its accessible name spells the time out as the Conversation menu's label does.
export function resultParts(result: SearchResult, title: string | undefined, now: number = Date.now()): { icon: SearchResult["kind"]; name: string; detail: string; accessibleName: string } {
  const where = title ? ` · ${title}` : "";
  if (result.kind === "conversation") {
    const place = result.canvas?.label ?? "Project conversation";
    const time = shortAgo(result.lastActivityAt, now);
    return { icon: "conversation", name: result.title, detail: time ? `${place} · ${time.text}` : place,
      accessibleName: `${result.title} — ${place}${time ? ` · ${time.label}` : ""}${where}` };
  }
  const detail = result.kind === "frame"
    ? `${result.canvasLabel} › ${frameLabel({ id: result.frameId }, result.frameIndex).number}`
    : result.path.replace(/^\.doan\/canvases\//, "");
  return { icon: result.kind, name: result.label, detail, accessibleName: `${result.label} — ${detail}${where}` };
}

// null when the panel is folded, and on Home and the other pages.
export type ShownConversation =
  | { kind: "overview"; root: string; conversationId: string | null }
  | { kind: "canvas"; root: string; path: string; conversationId: string | null }
  | null;

// Focus only: no move and no visit.
export function sameShownConversation(result: ConversationResult, shown: ShownConversation): boolean {
  if (shown === null || shown.root !== result.root || shown.conversationId !== result.conversationId) return false;
  return shown.kind === "overview" ? result.canvas === undefined : result.canvas?.path === shown.path;
}

// A native modal reports its own element for backdrop and padding clicks, so only geometry tells them apart. The header
// strip's no-drag controls reach the backdrop under them, so it never closes.
export function outsideDialog(
  rect: Pick<DOMRect, "left" | "top" | "right" | "bottom">,
  down: { x: number; y: number; button: number }, up: { x: number; y: number },
  strip: Pick<DOMRect, "left" | "top" | "right" | "bottom"> | null = null,
): boolean {
  const within = (box: Pick<DOMRect, "left" | "top" | "right" | "bottom">, { x, y }: { x: number; y: number }) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  const outside = (point: { x: number; y: number }) => !within(rect, point) && !(strip && within(strip, point));
  return down.button === 0 && outside(down) && outside(up);
}

const listedIn = (path: string) => (canvasDir(path) === "ds" ? ".doan/ds/" : ".doan/canvases/");

export function missingCanvasMessage(path: string): string {
  return `${canvasLabel({ path, url: "" })} is no longer in ${listedIn(path)}`;
}

export function removedCanvasMessage(row: CanvasRow): string {
  return `${canvasLabel(row)} was removed from ${listedIn(row.path)}`;
}

// `project`: the sidebar's name for the canvas's project.
export function unavailableCanvasMessage(entry: FolderEntry | undefined, path: string, project: string): string {
  if (entry?.kind === "list" && entry.canvases.some(row => row.path === path)) return "Canvas changed while opening. Choose it again from the sidebar or Quick Open.";
  if (entry?.kind === "list") return missingCanvasMessage(path);
  if (entry?.kind === "loading") return `${projectReadingLine(project)} Try again shortly.`;
  return projectUnavailableLine(project);
}

// One toast without an action, since a link only moves (ARCHITECTURE §7 'Deep links').
export function openLinkRefusal(result: Exclude<OpenLinkResult, { kind: "navigate" }>): string {
  if (result.kind === "malformed") return "Couldn’t open the link. It isn’t a Doan canvas link.";
  if (result.kind === "unregistered-root") return "Couldn’t open the link. Its project isn’t in Doan. Add it from Add Projects, then open the link again.";
  return `Couldn’t open the link. The canvas isn’t in ${result.project}.`;
}
