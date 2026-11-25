import { Info, RotateCw, type LucideIcon } from "lucide-react";
import type { FolderEntry } from "../main/view";
import { frameLabel } from "./canvasTree";
import type { SelectionView } from "./selection";

export interface HomeCard {
  // The row's own path for a project outside git.
  key: string;
  name: string;
  rows: FolderEntry[];
}

// A non-list row has no `git`, so it stays with the card it was last seen in (`lastCommon`) until the app restarts. A
// list row without `git` is a project outside git, whatever card it used to be in.
export function groupProjects(entries: readonly FolderEntry[], lastCommon: ReadonlyMap<string, string>): HomeCard[] {
  const cards = new Map<string, HomeCard>();
  for (const entry of entries) {
    const common = entry.kind === "list" ? entry.git?.common : lastCommon.get(entry.path);
    const key = common ?? entry.path;
    const card = cards.get(key);
    if (card) card.rows.push(entry);
    else cards.set(key, { key, name: "", rows: [entry] });
  }
  for (const card of cards.values()) {
    const main = card.rows.flatMap((row) => (row.kind === "list" && row.git?.main !== undefined ? [row.git.main] : []))[0];
    card.name = basename(main ?? card.rows[0]!.path);
  }
  return [...cards.values()];
}

// Includes auto-registered worktrees hidden from `paths`, grouped as `doan remove` groups them (main/cliRemove.ts), so
// the menu and the CLI remove the same roots.
export function groupRoots(all: readonly FolderEntry[], paths: readonly string[]): string[] | null {
  // A restored or newly registered root can still turn out to belong to the group.
  if (all.some(entry => entry.kind === "loading" && !entry.lastCommon)) return null;
  const card = groupProjects(all, new Map(all.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])))
    .find(card => card.rows.some(row => paths.includes(row.path)));
  return card ? card.rows.map(row => row.path) : [...paths];
}

export type RowAction = "setUp" | "locate" | "remove" | "showInFinder" | "retry" | "details";
// No trailing ellipsis, since each acts or opens its own surface at once.
export const ROW_ACTION_LABELS: Record<RowAction, string> = { setUp: "Set up", locate: "Locate", remove: "Remove from Doan", showInFinder: "Show in Finder", retry: "Retry", details: "Details" };
// Set Up and Locate have none.
export const ROW_ACTION_ICONS: Partial<Record<RowAction, LucideIcon>> = { retry: RotateCw, details: Info };

export interface CardRow {
  chip?: "Not set up" | "Missing" | "Config error" | "CLI error" | "Reading";
  // The first action takes focus when a problem row is clicked.
  actions: RowAction[];
  summary?: { branch?: string; changedAt?: number };
  current: boolean;
  selected?: string;
  detail?: string;
}

export function chipClass(chip: string | undefined): string {
  return `ob-chip${chip === "Config error" ? " err" : chip === "Missing" || chip === "CLI error" ? " warn" : ""}`;
}

// `selection` is the one the renderer holds for the loaded workspace.
export function cardRow(entry: FolderEntry, loaded: string | null, selection: SelectionView | null): CardRow {
  const current = loaded === entry.path;
  const selected = current && selection ? selectionLabel(selection) : undefined;
  const row = { current, ...(selected === undefined ? {} : { selected }) };
  switch (entry.kind) {
    case "loading":
      return { ...row, chip: "Reading", actions: [] };
    case "uninitialized":
      return { ...row, chip: "Not set up", actions: ["setUp", "remove"] };
    case "notFound":
      return { ...row, chip: "Missing", actions: ["locate", "remove"] };
    case "error":
      return { ...row, chip: "Config error", actions: ["showInFinder", "retry", "details"], detail: entry.message };
    case "cliError":
      return { ...row, chip: "CLI error", actions: ["retry", "details", "remove"], detail: entry.reason };
    case "list": {
      const branch = entry.git?.branch !== undefined || entry.git?.detached !== undefined ? worktreeLabel(entry) : undefined;
      const summary = {
        ...(branch === undefined ? {} : { branch }),
        ...(entry.changedAt === undefined ? {} : { changedAt: entry.changedAt }),
      };
      return { ...row, actions: [], summary };
    }
  }
}

function selectionLabel(selection: SelectionView): string | undefined {
  if (selection.element) return selection.element.doanId === undefined ? selection.tag : `${selection.tag} · ${selection.element.doanId}`;
  return selection.frame ? frameLabel(selection.frame, 0).name : undefined;
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

export function worktreeLabel(row: FolderEntry): string {
  const git = row.kind === "list" ? row.git : undefined;
  return git?.branch ?? (git?.detached === undefined ? basename(row.path) : `detached ${git.detached.slice(0, 7)}`);
}
