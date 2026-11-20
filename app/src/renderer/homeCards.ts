import { Info, RotateCw, type LucideIcon } from "lucide-react";
import type { FolderEntry } from "../main/view";
import { frameLabel } from "./canvasTree";
import type { SelectionView } from "./selection";

export interface HomeCard {
  // `git.common` when known; the row's own path for a project outside git.
  key: string;
  name: string;
  rows: FolderEntry[];
}

// Cards keep the saved order: a card sits where its first row is, and its rows
// stay in saved order. A row that is not a list has no `git`, so it stays with
// the card it was last seen in (`lastCommon`, path → common, main's memory)
// until the app restarts. A list row is trusted as it is: without `git` it is
// a project outside git, whatever card it used to be in.
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

// What a project's Remove from Doan takes: every registered root of the group `paths` (its shown rows) belong to, an
// auto-registered worktree hidden from those rows included, in saved order. `all` is main's whole list, grouped as
// `doan remove` groups it (main/cliRemove.ts), so the menu and the CLI remove the same roots.
export function groupRoots(all: readonly FolderEntry[], paths: readonly string[]): string[] | null {
  // A restored or newly registered root can still turn out to belong to the group.
  if (all.some(entry => entry.kind === "loading" && !entry.lastCommon)) return null;
  const card = groupProjects(all, new Map(all.flatMap(entry => entry.lastCommon ? [[entry.path, entry.lastCommon]] : [])))
    .find(card => card.rows.some(row => paths.includes(row.path)));
  return card ? card.rows.map(row => row.path) : [...paths];
}

export type RowAction = "setUp" | "locate" | "remove" | "showInFinder" | "retry" | "details";
// One label per recovery action for the workspace status line, the sidebar's project menu, the Overview's recovery
// menu and the Project Settings page: no trailing ellipsis, since each acts or opens its own surface at once.
export const ROW_ACTION_LABELS: Record<RowAction, string> = { setUp: "Set up", locate: "Locate", remove: "Remove from Doan", showInFinder: "Show in Finder", retry: "Retry", details: "Details" };
// The icons the project menus (sidebar, Overview recovery menu) draw before those labels; Set Up and Locate have none.
export const ROW_ACTION_ICONS: Partial<Record<RowAction, LucideIcon>> = { retry: RotateCw, details: Info };

export interface CardRow {
  chip?: "Not set up" | "Missing" | "Config error" | "CLI error" | "Reading";
  // The first action takes focus when a problem row is clicked.
  actions: RowAction[];
  // Only for a list row.
  summary?: { branch?: string; changedAt?: number };
  // This row is the loaded workspace ("Open").
  current: boolean;
  // "Selected for your agent: <selected>" while `current`.
  selected?: string;
  // Config error or CLI error text behind Details.
  detail?: string;
}

// The shipped status chip a problem row draws in Home's project and worktree menus and the Overview's worktree menu.
export function chipClass(chip: string | undefined): string {
  return `ob-chip${chip === "Config error" ? " err" : chip === "Missing" || chip === "CLI error" ? " warn" : ""}`;
}

// `loaded` is the root of the loaded workspace, `selection` the one the
// renderer holds for it. Design
// 'Problem rows' table.
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

// A frame selection shows the frame's title, an element its tag and id.
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
