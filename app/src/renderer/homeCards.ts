import type { FolderEntry } from "../main/view";
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

export type RowAction = "setUp" | "locate" | "remove" | "showInFinder" | "retry" | "details";

export interface CardRow {
  chip?: "Not set up" | "Missing" | "Config error" | "CLI error" | "Reading…";
  // The first action takes focus when a problem row is clicked.
  actions: RowAction[];
  // Only for a list row; the view formats `changedAt`.
  summary?: { branch?: string; canvases: number; openComments: number; changedAt?: number };
  // This row is the loaded workspace ("Open").
  current: boolean;
  // "Selected: <selected>" while `current`.
  selected?: string;
  // Config error text behind Details.
  detail?: string;
}

// `loaded` is the root of the loaded workspace, `selection` the one the
// renderer holds for it. Design 'Problem rows' table.
export function cardRow(entry: FolderEntry, loaded: string | null, selection: SelectionView | null): CardRow {
  const current = loaded === entry.path;
  const selected = current && selection ? selectionLabel(selection) : undefined;
  const row = { current, ...(selected === undefined ? {} : { selected }) };
  switch (entry.kind) {
    case "loading":
      return { ...row, chip: "Reading…", actions: [] };
    case "uninitialized":
      return { ...row, chip: "Not set up", actions: ["setUp", "remove"] };
    case "notFound":
      return { ...row, chip: "Missing", actions: ["locate", "remove"] };
    case "error":
      return { ...row, chip: "Config error", actions: ["showInFinder", "retry", "details"], detail: entry.message };
    case "cliError":
      return { ...row, chip: "CLI error", actions: ["retry", "remove"] };
    case "list": {
      const branch = entry.git?.branch ?? (entry.git?.detached === undefined ? undefined : `detached ${entry.git.detached.slice(0, 7)}`);
      const summary = {
        ...(branch === undefined ? {} : { branch }),
        canvases: entry.canvases.length,
        openComments: entry.canvases.reduce((sum, canvas) => sum + canvas.open, 0),
        ...(entry.changedAt === undefined ? {} : { changedAt: entry.changedAt }),
      };
      return { ...row, actions: [], summary };
    }
  }
}

// A frame selection shows the frame's title, an element its tag and id.
function selectionLabel(selection: SelectionView): string | undefined {
  if (selection.element) return selection.element.doanId === undefined ? selection.tag : `${selection.tag} #${selection.element.doanId}`;
  return selection.frame ? (selection.frame.title ?? selection.frame.id) : undefined;
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}
